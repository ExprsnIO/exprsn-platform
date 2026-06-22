'use strict';

/**
 * Server-rendered HTML shell for the live /health dashboard.
 *
 * The shell is static: on load its inline script fetches the JSON snapshot from
 * /health (content-negotiated) and then subscribes to the gateway's `/_health`
 * Socket.IO namespace for live pushes, falling back to interval polling if the
 * socket can't connect. A per-request CSP nonce is applied to the inline
 * <style>/<script> so the page works under the gateway's strict CSP.
 *
 * Styling is aligned with the Exprsn marketing design system (exprsn-modern.css
 * / site.css): the same electric-blue → violet brand gradient, Inter / Plus
 * Jakarta Sans / JetBrains Mono type stack (with safe system fallbacks, since
 * the relaxed CSP for this page does not permit external font stylesheets), and
 * brand radii/shadows. A persistent light/dark switch (defaulting to the OS
 * preference) drives a token set whose every text and meaningful-graphic pair
 * has been verified to meet WCAG 2.1 AAA contrast (>=7:1 body text,
 * >=4.5:1 large text, >=3:1 non-text UI). Status is never conveyed by colour
 * alone — every badge carries both its status word and a shape glyph.
 *
 * NOTE: the relaxed CSP for this response is `style-src 'nonce-...'` with no
 * 'unsafe-inline', so inline `style="..."` attributes in generated markup are
 * blocked. Dynamic sizing (e.g. the memory bar) is therefore applied via the
 * CSSOM (element.style.width) after insertion, which CSP permits.
 *
 * Keep CSS and the client scripts free of backticks and `${` so they can live
 * inside this template literal without being interpreted server-side.
 */

const CSS = `
:root{
  --font: 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --font-display: 'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --mono: 'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --grad: linear-gradient(135deg,#0066ff 0%,#7c3aed 100%);
  --radius: 12px;
  --radius-sm: 8px;
  --radius-pill: 9999px;
}
/* ---------- Light theme (default) ---------- */
:root,[data-theme="light"]{
  color-scheme: light;
  --bg:#ffffff; --elev:#f3f6fb; --card:#ffffff; --nest:#f6f8fc;
  --border:#cdd5e2; --border-strong:#b9c2d2; --rule:#e4e8f0;
  --fg:#11151c; --muted:#434b57; --faint:#474f5d; --link:#0a4ab0;
  --shadow:0 1px 3px rgba(16,24,40,.10),0 1px 2px rgba(16,24,40,.06);
  --shadow-lg:0 10px 24px -8px rgba(16,24,40,.18);
  --ok-fg:#0d5132; --ok-bg:#d7f0e2; --ok-bd:#b6e2cb; --ok-dot:#1a7d49;
  --warn-fg:#5a4300; --warn-bg:#f7e9c7; --warn-bd:#e8d49a; --warn-dot:#9a6b00;
  --err-fg:#7c1d26; --err-bg:#fbe2e6; --err-bd:#f1c2cb; --err-dot:#cc2b35;
  --mut-fg:#3f4650; --mut-bg:#e6eaf1; --mut-bd:#d3dae6; --mut-dot:#6a7180;
  --bar:#0066ff; --bar-track:#e3e8f2;
}
/* ---------- Dark theme ---------- */
[data-theme="dark"]{
  color-scheme: dark;
  --bg:#0a0d18; --elev:#10162a; --card:#131b30; --nest:#0e1626;
  --border:#283450; --border-strong:#34436a; --rule:#1d2740;
  --fg:#eef2fb; --muted:#b2bcd8; --faint:#9fabca; --link:#86b1ff;
  --shadow:0 2px 6px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.5);
  --shadow-lg:0 16px 40px -12px rgba(0,0,0,.6);
  --ok-fg:#5ce39b; --ok-bg:#0c2a1d; --ok-bd:#17402c; --ok-dot:#3fce86;
  --warn-fg:#ffd36b; --warn-bg:#2c2410; --warn-bd:#4a3d14; --warn-dot:#e7b04a;
  --err-fg:#ff968f; --err-bg:#2e1519; --err-bd:#4d2228; --err-dot:#ff6b66;
  --mut-fg:#aab4cf; --mut-bg:#1b2338; --mut-bd:#2c3450; --mut-dot:#8590ad;
  --bar:#4d94ff; --bar-track:#1b2440;
}
*{box-sizing:border-box}
html{ -webkit-text-size-adjust:100% }
body{margin:0;font-family:var(--font);font-size:14px;line-height:1.55;
  background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
  transition:background .25s ease,color .25s ease}
a{color:var(--link);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:3px solid var(--link);outline-offset:2px;border-radius:4px}
.accent-strip{height:4px;background:var(--grad)}
.wrap{max-width:1140px;margin:0 auto;padding:22px 20px 72px}

/* ---------- Header ---------- */
header.top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px}
.brand{display:inline-flex;align-items:center;gap:9px;font-family:var(--font-display);
  font-weight:800;font-size:15px;letter-spacing:-.01em;color:var(--fg)}
.brand .mark{width:22px;height:22px;border-radius:7px;background:var(--grad);
  box-shadow:var(--shadow);flex-shrink:0}
header.top h1{font-family:var(--font-display);font-size:20px;margin:0;font-weight:700;
  letter-spacing:-.01em}
.divider{width:1px;height:20px;background:var(--border);margin:0 2px}
.spacer{margin-left:auto}
.conn{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--faint);
  font-variant-numeric:tabular-nums}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mut-dot);display:inline-block}
.dot.live{background:var(--ok-dot);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok-dot) 25%,transparent)}
.dot.offline{background:var(--err-dot)}
.toggle{display:inline-flex;align-items:center;gap:7px;cursor:pointer;
  font-family:var(--font-display);font-weight:600;font-size:12.5px;color:var(--fg);
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius-pill);
  padding:6px 13px;transition:border-color .2s ease,background .2s ease,transform .15s ease}
.toggle:hover{border-color:var(--border-strong)}
.toggle:active{transform:translateY(1px)}
.toggle .ico{width:15px;height:15px;display:inline-block}
.sub{color:var(--faint);font-size:13px;margin:6px 0 22px;font-variant-numeric:tabular-nums}

/* ---------- Badges (status, never colour-only) ---------- */
.badge{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:var(--radius-pill);
  font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  border:1px solid transparent;vertical-align:middle}
.badge::before{font-weight:800;font-size:11px;line-height:1}
.badge.ok{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-bd)}
.badge.ok::before{content:"\\2713"}
.badge.warn{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--warn-bd)}
.badge.warn::before{content:"\\21"}
.badge.err{background:var(--err-bg);color:var(--err-fg);border-color:var(--err-bd)}
.badge.err::before{content:"\\2715"}
.badge.muted{background:var(--mut-bg);color:var(--mut-fg);border-color:var(--mut-bd)}
.badge.muted::before{content:"\\2022"}

/* ---------- Cards & grid ---------- */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:13px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  padding:15px 17px;box-shadow:var(--shadow)}
.card.mt{margin-top:13px}
.card h2{font-family:var(--font-display);font-size:11px;text-transform:uppercase;letter-spacing:.07em;
  color:var(--faint);margin:0 0 12px;font-weight:700}
.card h3{font-size:14px;margin:0;font-weight:700;font-family:var(--font-display);
  display:flex;align-items:center;gap:8px}
section{margin-top:28px}
section>h2{font-family:var(--font-display);font-size:12px;text-transform:uppercase;letter-spacing:.07em;
  color:var(--faint);margin:0 0 13px;border-bottom:1px solid var(--rule);padding-bottom:7px;font-weight:700}
.row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px}
.row .k{color:var(--muted)}
.row .v{color:var(--fg);text-align:right;word-break:break-word;font-variant-numeric:tabular-nums}
.nest{margin-top:10px;padding-left:12px;border-left:2px solid var(--rule)}
.dep-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.lat{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums;font-family:var(--mono)}

/* ---------- Tables ---------- */
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--rule);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
th{color:var(--faint);font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
  font-family:var(--font-display)}
td.ports{color:var(--muted);font-size:12px;word-break:break-all;font-family:var(--mono)}
td .muted,.muted{color:var(--muted)}

/* ---------- Modules ---------- */
.mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:11px}
.mod{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:11px 13px;box-shadow:var(--shadow)}
.mod .name{font-weight:700;font-family:var(--font-display)}
.mod .meta{color:var(--faint);font-size:12px;margin-top:3px;font-family:var(--mono)}
.nswrap{margin-top:7px}
.ns{display:inline-block;background:var(--nest);border:1px solid var(--rule);border-radius:6px;
  padding:1px 7px;margin:3px 4px 0 0;font-size:11px;color:var(--link);font-family:var(--mono)}

/* ---------- Misc ---------- */
.empty{color:var(--faint);font-style:italic;padding:8px 0}
.barwrap{background:var(--bar-track);border-radius:5px;height:7px;overflow:hidden;margin-top:8px}
.bar{height:100%;background:var(--bar);width:0;transition:width .4s ease}
.updated{color:var(--faint);font-size:12px;margin-top:26px;text-align:center;
  font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion: reduce){
  *{transition-duration:.001ms !important}
}
`;

const CLIENT_JS = `
(function(){
  var STMAP={up:'ok',ok:'ok',healthy:'ok',ready:'ok',alive:'ok',running:'ok',green:'ok',
    degraded:'warn',yellow:'warn',
    down:'err',unhealthy:'err',red:'err',exited:'err',dead:'err',
    unavailable:'muted',disabled:'muted',unknown:'muted',created:'muted',paused:'muted'};
  function cls(s){return STMAP[String(s||'').toLowerCase()]||'muted';}
  function esc(s){if(s==null)return '';return String(s).replace(/[&<>"]/g,function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
  function badge(s){return '<span class="badge '+cls(s)+'">'+esc(s)+'</span>';}
  function row(k,v){if(v==null||v==='')return '';return '<div class="row"><span class="k">'+esc(k)+
    '</span><span class="v">'+v+'</span></div>';}
  function fmtUptime(sec){sec=Math.max(0,Math.floor(sec||0));var d=Math.floor(sec/86400);
    var h=Math.floor(sec%86400/3600);var m=Math.floor(sec%3600/60);var s=sec%60;var o=[];
    if(d)o.push(d+'d');if(h||d)o.push(h+'h');if(m||h||d)o.push(m+'m');o.push(s+'s');return o.join(' ');}
  function fmtTime(iso){if(!iso)return '';var dt=new Date(iso);return dt.toLocaleString();}
  // Recursively render an object's scalar/nested fields as rows, skipping 'status'.
  function kv(obj,skip){var html='';for(var k in obj){if(!obj.hasOwnProperty(k))continue;
    if(skip&&skip.indexOf(k)>=0)continue;var val=obj[k];
    if(val&&typeof val==='object'&&!Array.isArray(val)){
      html+='<div class="row"><span class="k">'+esc(k)+'</span><span class="v"></span></div>';
      html+='<div class="nest">'+kv(val,[])+'</div>';
    }else if(Array.isArray(val)){html+=row(k,esc(val.join(', ')));
    }else{html+=row(k,esc(val));}}
    return html;}

  function depCard(name,d){
    var lat=d&&d.latencyMs!=null?'<span class="lat">'+d.latencyMs+'ms</span>':'';
    var body=kv(d,['status','latencyMs','error']);
    if(d&&d.error)body+=row('error','<span class="muted">'+esc(d.error)+'</span>');
    return '<div class="card"><div class="dep-head"><h3>'+esc(name)+' '+badge(d&&d.status)+
      '</h3>'+lat+'</div><div class="nest">'+(body||'<div class="empty">no detail</div>')+'</div></div>';
  }

  function dockerSection(dk){
    if(!dk)return '';
    var head='<div class="card"><div class="dep-head"><h3>Docker '+badge(dk.status)+'</h3>'+
      (dk.latencyMs!=null?'<span class="lat">'+dk.latencyMs+'ms</span>':'')+'</div>';
    var inner='';
    if(dk.serverVersion)inner+=row('engine version',esc(dk.serverVersion));
    if(dk.containersTotal!=null)inner+=row('containers',esc(dk.containersRunning)+' running / '+esc(dk.containersTotal)+' total');
    if(dk.error)inner+=row('error','<span class="muted">'+esc(dk.error)+'</span>');
    head+='<div class="nest">'+(inner||'<div class="empty">no detail</div>')+'</div></div>';
    var table='';
    if(dk.containers&&dk.containers.length){
      var rows='';
      for(var i=0;i<dk.containers.length;i++){var c=dk.containers[i];
        rows+='<tr><td>'+badge(c.state)+'</td><td>'+esc(c.name)+'</td><td class="muted">'+esc(c.image)+
          '</td><td>'+esc(c.status)+'</td><td class="ports">'+esc(c.ports)+'</td></tr>';}
      table='<table><thead><tr><th>State</th><th>Name</th><th>Image</th><th>Status</th><th>Ports</th></tr></thead><tbody>'+
        rows+'</tbody></table>';
    }else if(dk.status==='up'){table='<div class="empty">no containers</div>';}
    return '<section><h2>Docker &amp; host containers</h2>'+head+
      (table?'<div class="card mt">'+table+'</div>':'')+'</section>';
  }

  function pct(used,total){if(!used||!total)return 0;var u=parseFloat(used),t=parseFloat(total);
    if(!t)return 0;return Math.min(100,Math.round(u/t*100));}

  // CSP forbids inline style attributes, so dynamic bar widths are written to
  // the CSSOM after the markup is inserted.
  function applyBars(){var bars=document.querySelectorAll('.bar[data-pct]');
    for(var i=0;i<bars.length;i++){bars[i].style.width=bars[i].getAttribute('data-pct')+'%';}}

  function render(d){
    if(!d)return;
    document.getElementById('svc').textContent=d.serviceName||d.service||'service';
    document.getElementById('topbadge').innerHTML=badge(d.status);
    document.getElementById('sub').textContent=(d.domain||'')+(d.env?'  \\u2022  '+d.env:'')+
      (d.version?'  \\u2022  v'+d.version:'');
    document.title=(d.status==='ok'?'\\u25CF ':d.status==='degraded'?'\\u25B2 ':'\\u2715 ')+(d.serviceName||'health');

    var sys=d.system||{};var memHtml='';
    if(sys.memory){var p=pct(parseInt(sys.memory.systemTotal)-parseInt(sys.memory.systemFree),parseInt(sys.memory.systemTotal));
      memHtml=row('process rss',esc(sys.memory.rss))+row('heap',esc(sys.memory.heapUsed)+' / '+esc(sys.memory.heapTotal))+
        row('system free',esc(sys.memory.systemFree)+' / '+esc(sys.memory.systemTotal))+
        '<div class="barwrap"><div class="bar" data-pct="'+p+'"></div></div>';}

    var overview='<div class="card"><h2>Service</h2>'+
      row('service',esc(d.serviceName||d.service))+row('status',badge(d.status))+
      row('uptime',esc(fmtUptime(d.uptimeSeconds)))+row('started',esc(fmtTime(d.serverStartTime)))+
      row('env',esc(d.env))+row('version',esc(d.version))+'</div>';
    var server='<div class="card"><h2>Server</h2>'+
      row('server name',esc(d.serverName))+row('domain',esc(d.domain))+
      row('base url',esc(d.baseUrl))+row('node',esc(d.node))+row('pid',esc(d.pid))+'</div>';
    var system='<div class="card"><h2>System</h2>'+
      row('hostname',esc(sys.hostname))+row('platform',esc(sys.platform))+row('cpus',esc(sys.cpus))+
      row('load avg',sys.loadAvg?esc(sys.loadAvg.join('  ')):'')+memHtml+'</div>';

    var deps='';if(d.dependencies){for(var name in d.dependencies){if(d.dependencies.hasOwnProperty(name))
      deps+=depCard(name,d.dependencies[name]);}}

    var mods='';if(d.modules){for(var i=0;i<d.modules.length;i++){var m=d.modules[i];
      var ns='';if(m.socketNamespaces&&m.socketNamespaces.length){for(var j=0;j<m.socketNamespaces.length;j++)
        ns+='<span class="ns">'+esc(m.socketNamespaces[j])+'</span>';}
      mods+='<div class="mod"><div class="name">'+esc(m.name)+'</div>'+
        '<div class="meta">'+esc(m.prefix)+'  \\u2022  schema: '+esc(m.schema)+'</div>'+
        (ns?'<div class="nswrap">'+ns+'</div>':'')+'</div>';}}

    document.getElementById('app').innerHTML=
      '<section><div class="grid">'+overview+server+system+'</div></section>'+
      '<section><h2>Dependencies</h2><div class="grid">'+(deps||'<div class="empty">none</div>')+'</div></section>'+
      dockerSection(d.docker)+
      '<section><h2>Modules ('+(d.modules?d.modules.length:0)+')</h2><div class="mods">'+
      (mods||'<div class="empty">none</div>')+'</div></section>'+
      '<div class="updated">last updated '+esc(fmtTime(d.time))+'</div>';
    applyBars();
  }

  function setConn(state){var dot=document.getElementById('cdot');var lbl=document.getElementById('clbl');
    if(state==='live'){dot.className='dot live';lbl.textContent='live';}
    else if(state==='offline'){dot.className='dot offline';lbl.textContent='offline';}
    else{dot.className='dot';lbl.textContent='connecting';}}

  // ---------- Theme switch ----------
  function curTheme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';}
  function syncToggle(){var t=curTheme();var btn=document.getElementById('themebtn');
    if(!btn)return;var dark=t==='dark';
    btn.setAttribute('aria-pressed',dark?'true':'false');
    btn.setAttribute('aria-label','Switch to '+(dark?'light':'dark')+' theme');
    document.getElementById('themelbl').textContent=dark?'Light':'Dark';
    document.getElementById('themeico').textContent=dark?'\\u2600':'\\u263E';}
  function applyTheme(t){document.documentElement.setAttribute('data-theme',t);
    try{localStorage.setItem('exprsn-health-theme',t);}catch(e){}syncToggle();}
  var tbtn=document.getElementById('themebtn');
  if(tbtn)tbtn.addEventListener('click',function(){applyTheme(curTheme()==='dark'?'light':'dark');});
  syncToggle();
  // Follow OS changes only while the user hasn't pinned a choice.
  if(window.matchMedia){var mq=window.matchMedia('(prefers-color-scheme: dark)');
    var onmq=function(e){var saved;try{saved=localStorage.getItem('exprsn-health-theme');}catch(_){}
      if(!saved){document.documentElement.setAttribute('data-theme',e.matches?'dark':'light');syncToggle();}};
    if(mq.addEventListener)mq.addEventListener('change',onmq);else if(mq.addListener)mq.addListener(onmq);}

  // ---------- Data ----------
  function pull(){return fetch('/health',{headers:{Accept:'application/json'}})
    .then(function(r){return r.json();}).then(render).catch(function(){});}

  pull();
  var pollTimer=null;
  function startPolling(){if(pollTimer)return;pollTimer=setInterval(pull,5000);}

  if(typeof io==='function'){
    var socket=io('/_health',{path:'/socket.io'});
    socket.on('connect',function(){setConn('live');if(pollTimer){clearInterval(pollTimer);pollTimer=null;}});
    socket.on('disconnect',function(){setConn('offline');startPolling();});
    socket.on('connect_error',function(){setConn('offline');startPolling();});
    socket.on('health',render);
    setTimeout(function(){if(!socket.connected)startPolling();},4000);
  }else{setConn('offline');startPolling();}
})();
`;

// Runs before paint to set the initial theme (saved choice, else OS preference)
// and avoid a flash of the wrong theme.
const THEME_INIT_JS = `
(function(){var t;try{t=localStorage.getItem('exprsn-health-theme');}catch(e){}
  if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}
  document.documentElement.setAttribute('data-theme',t);})();
`;

function renderHealthPage(nonce) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>health</title>
<script nonce="${nonce}">${THEME_INIT_JS}</script>
<style nonce="${nonce}">${CSS}</style>
</head>
<body>
<div class="accent-strip"></div>
<div class="wrap">
  <header class="top">
    <span class="brand"><span class="mark" aria-hidden="true"></span>Exprsn</span>
    <span class="divider" aria-hidden="true"></span>
    <h1 id="svc">exprsn-platform</h1>
    <span id="topbadge"></span>
    <span class="spacer"></span>
    <span class="conn"><span id="cdot" class="dot"></span><span id="clbl">connecting</span></span>
    <button id="themebtn" class="toggle" type="button" aria-label="Switch theme" aria-pressed="false">
      <span id="themeico" class="ico" aria-hidden="true">&#9788;</span><span id="themelbl">Dark</span>
    </button>
  </header>
  <p class="sub" id="sub">loading&hellip;</p>
  <div id="app"><div class="empty">Loading health&hellip;</div></div>
</div>
<script src="/socket.io/socket.io.js" nonce="${nonce}"></script>
<script nonce="${nonce}">${CLIENT_JS}</script>
</body>
</html>`;
}

module.exports = { renderHealthPage };
