/* ============================================================================
   EXPRSN UI v2 MOCKUPS · shell.js
   Builds the shared chrome around each mockup so pages only author their
   <main> content plus a JSON "contract". Behaviour here is demo-only:
   theme toggle, sidebar collapse / drawer, ⌘K palette, tabs, dialogs,
   segmented controls, demo states (loaded/empty/loading/error), the realtime
   pill, and the Contract drawer that highlights the UI bound to each REST call
   and Socket.IO event.

   Page skeleton:
     <body data-shell="app|admin|public" data-page="<nav id>">
       <main id="main"> … </main>
       <script type="application/json" id="contract">{ … }</script>
     </body>

   Contract JSON:
     { "rest":   [{ "m":"GET", "p":"/spark/api/conversations", "auth":"user", "ui":"Conversation list" }],
       "socket": [{ "ns":"/spark", "auth":"CA bearer (read)", "rooms":["conversation:{id}"],
                    "emit":[{ "e":"join:conversation", "ui":"Opening a thread" }],
                    "on":  [{ "e":"new:message", "ui":"Thread + list preview" }] }],
       "gaps":   [{ "sev":"high|med", "text":"…" }],
       "notes":  "…" }
   Bind UI to contract rows with data-api="/path …", data-on="event …", data-emit="event …".
   ============================================================================ */
(function () {
  'use strict';

  /* ── Theme: resolve before first paint (mirrors web/public/theme-init.js) ── */
  var THEME_KEY = 'exprsn-theme';
  function readTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
  function writeTheme(v) { try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* storage blocked */ } }
  function systemDark() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return systemDark() ? 'dark' : 'light';
  }
  var saved = readTheme();
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);

  var BASE = (function () {
    var s = document.currentScript && document.currentScript.getAttribute('src');
    return s ? s.replace(/shell\.js(\?.*)?$/, '') : '';
  })();

  /* ── Icons (24px, 1.75 stroke, outlined — matches the MUI *Outlined set in spirit) ── */
  var I = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12Z"/>',
    feed: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4.5L6 21Z"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/>',
    groups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 4.8"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    people: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20a6 6 0 0 1 12 0"/><path d="M14 14.5a6 6 0 0 1 8 5.5"/>',
    live: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="m8 2.5 4 3.5 4-3.5"/><circle cx="12" cy="12.5" r="2.5"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10 6-3.5v11l-6-3.5"/>',
    apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/><path d="M2 13v3M22 13v3"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7Z"/>',
    building: '<rect x="4" y="3" width="11" height="18" rx="1"/><path d="M15 9h4a1 1 0 0 1 1 1v11h-5"/><path d="M8 7h3M8 11h3M8 15h3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6Z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5"/>',
    cert: '<path d="M12 2.5 14.4 4l2.8-.2.9 2.6 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.6-2.8-.2L12 19.5 9.6 18l-2.8.2-.9-2.6-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.6 2.8.2Z"/><path d="m8.5 11 2.5 2.5 4.5-4.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    tune: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m6 15 6-6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>', arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    moreV: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5Z"/>',
    sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>', upload: '<path d="M12 20V9M7 13.5l5-5 5 5M4.5 4h15"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.5 16.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 9.3-9.3M17 6l3 3M14.5 8.5l2 2"/>',
    fingerprint: '<path d="M12 11v3a8 8 0 0 1-1.5 4.7M7.5 8.5A5 5 0 0 1 17 11v2.5M17 17.5a13 13 0 0 1-.7 3M4 13.5V11a8 8 0 0 1 13.4-5.9M20 11v1.5M8 11v2.5a4 4 0 0 1-1.2 2.9M7.5 20a12 12 0 0 0 1-2.2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.2-9.4C1.7 7.3 4 4.5 7 4.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3 0 5.3 2.8 4.2 6.1C19.5 15.4 12 20 12 20Z"/>',
    repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h13M16.5 2.5 20 6l-3.5 3.5M20 13v2a3 3 0 0 1-3 3H4M7.5 21.5 4 18l3.5-3.5"/>',
    reply: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12Z"/><path d="M8.5 12h7"/>',
    send: '<path d="M4 12 20.5 4 16 20.5l-3.5-7Z"/><path d="m12.5 13.5 8-9.5"/>',
    clip: '<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    micOff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8M18.5 11a6.5 6.5 0 0 1-1 3.4M5.5 11a6.5 6.5 0 0 0 10.4 5.2M12 17.5V21"/>',
    camOff: '<path d="M3 3l18 18M15.5 15.5V16a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H6M10 6h3.5a2 2 0 0 1 2 2v2l6-3.5v11"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 10.5l3-3 3 3M12 7.5V13"/>',
    phoneOff: '<path d="M3 3l18 18"/><path d="M5.2 13.4a15 15 0 0 1-2.1-6.3A2 2 0 0 1 5 5h3l1.5 4-2 1.5a11 11 0 0 0 1.4 2.3M11 15.5a11 11 0 0 0 2.5 1l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2 15 15 0 0 1-8-3.3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.5 15.5a1.6 1.6 0 0 1 2.4-2.1L8 16"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checks: '<path d="m2 12.5 4.5 4.5L15 8.5M12 16l1 1L22 8.5"/>',
    alert: '<path d="M12 3.5 2.5 20h19Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    play: '<path d="M7 4.5v15l12-7.5Z"/>', stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
    record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    server: '<rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    zap: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12Z"/>',
    flow: '<circle cx="6" cy="5.5" r="2.5"/><circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8v8M8.2 6.7 15.8 10.8M8.2 17.3l7.6-4.1"/>',
    puzzle: '<path d="M9.5 4.5a2 2 0 1 1 4 0V6H18a1 1 0 0 1 1 1v4.5h-1.5a2 2 0 1 0 0 4H19V20a1 1 0 0 1-1 1h-4.5v-1.5a2 2 0 1 0-4 0V21H5a1 1 0 0 1-1-1v-4.5h1.5a2 2 0 1 0 0-4H4V7a1 1 0 0 1 1-1h4.5Z"/>',
    tag: '<path d="M3.5 12.5V4a.5.5 0 0 1 .5-.5h8.5L21 12l-9 9Z"/><circle cx="8" cy="8" r="1.4"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3.5 8 20.5M16 3.5l-2 17"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1"/>',
    file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v5h5"/>',
    doc: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9.5 9"/>',
    logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M9 16.5 4.5 12 9 7.5M4.5 12H15"/>',
    userPlus: '<circle cx="9.5" cy="8" r="4"/><path d="M2 21a7.5 7.5 0 0 1 15 0M19 8v6M16 11h6"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 9.5V20"/>',
    kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="10" rx="1.5"/><rect x="16" y="4" width="5" height="13" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    command: '<path d="M9 6v12M15 6v12M6 9h12M6 15h12"/><path d="M9 6a3 3 0 1 0-3 3M15 6a3 3 0 1 1 3 3M9 18a3 3 0 1 1-3-3M15 18a3 3 0 1 0 3-3"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15h4.5"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14.5 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M10.8 5.1A15 15 0 0 1 22 9.5M12 20h.01"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    cloud: '<path d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10Z"/>',
    disk: '<rect x="3" y="12.5" width="18" height="7.5" rx="2"/><path d="M5 12.5 7.5 5h9l2.5 7.5M7 16.5h.01M11 16.5h6"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5M12 8v4l3 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    vote: '<path d="M4 13.5h16V20H4Z"/><path d="m8 10.5 3 3 6-6.5-2.8-2.5L9 9"/>',
    gavel: '<path d="m14 4 6 6M11.5 6.5l6 6M13 5.5l-6 6 3 3 6-6M8.5 13 3 18.5 5.5 21 11 15.5M13 21h8"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    queue: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18.5" cy="18" r="2"/>',
    webhook: '<path d="M9 16.5a4 4 0 1 1-2.6-7.3L9 4.5M15 15.5h-6l3-5.3M17.5 20A4 4 0 0 1 15 12.9l-2.6-4.4"/><circle cx="12" cy="4.5" r="1.8"/>',
    gauge: '<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="m12 13 4-5"/><circle cx="12" cy="13" r="1.4"/>',
    butterfly: '<path d="M12 7v12M12 9c-2-3.5-6-5-8-4s0 6 3 7c-3 1-4 4-2 5.5s5-1 7-4.5c2 3.5 5 6 7 4.5s1-4.5-2-5.5c3-1 5-6 3-7s-6 .5-8 4Z"/>',
    scope: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    badge: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M9 3h6v4H9Z"/><circle cx="12" cy="12" r="2.2"/><path d="M8.5 17a3.5 3.5 0 0 1 7 0"/>',
    brain: '<path d="M9 4.5A3 3 0 0 0 5.5 7a3 3 0 0 0-1.5 5.3A3.2 3.2 0 0 0 6.5 18 3 3 0 0 0 12 19V5.5A3 3 0 0 0 9 4.5ZM15 4.5A3 3 0 0 1 18.5 7a3 3 0 0 1 1.5 5.3 3.2 3.2 0 0 1-2.5 5.7A3 3 0 0 1 12 19"/>',
    cache: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/><circle cx="12" cy="12" r="2.2"/>',
    diversity: '<circle cx="12" cy="6" r="2.5"/><circle cx="5" cy="15" r="2.5"/><circle cx="19" cy="15" r="2.5"/><path d="M9 21a3 3 0 0 1 6 0M2.5 21a2.5 2.5 0 0 1 5 0M16.5 21a2.5 2.5 0 0 1 5 0M10 8.5 6.5 12.5M14 8.5l3.5 4"/>',
    upDown: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    pin: '<path d="M9 3.5h6l-1 5 3.5 3.5h-11L10 8.5Z"/><path d="M12 12v8.5"/>',
    signal: '<path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'
  };
  function icon(name, cls) {
    var p = I[name] || I.info;
    return '<span class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + p + '</svg></span>';
  }

  /* ── Navigation (single source for sidebar, tab bar, palette, gallery) ── */
  var APP_NAV = [
    { group: 'Workspace', items: [
      { id: 'home', label: 'Home', icon: 'home', href: 'app/home.html', route: '/' },
      { id: 'messages', label: 'Messages', icon: 'chat', href: 'app/messages.html', route: '/messages', badge: '3' },
      { id: 'feed', label: 'Timeline', icon: 'feed', href: 'app/feed.html', route: '/feed' },
      { id: 'search', label: 'Search', icon: 'search', href: 'app/search.html', route: '/search' },
      { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark', href: 'app/bookmarks.html', route: '/bookmarks' },
      { id: 'files', label: 'Files', icon: 'folder', href: 'app/files.html', route: '/files' },
      { id: 'groups', label: 'Groups', icon: 'groups', href: 'app/groups.html', route: '/groups' },
      { id: 'people', label: 'People', icon: 'people', href: 'app/people.html', route: '/people' },
      { id: 'streams', label: 'Live', icon: 'live', href: 'app/streams.html', route: '/streams' },
      { id: 'rooms', label: 'Rooms', icon: 'video', href: 'app/rooms.html', route: '/rooms' },
      { id: 'apps', label: 'Apps', icon: 'apps', href: 'app/apps.html', route: '/apps' },
      { id: 'cortex', label: 'AI assistant', icon: 'sparkle', href: 'app/cortex.html', route: '/cortex' },
      { id: 'orgs', label: 'Organizations', icon: 'building', href: 'app/orgs.html', route: '/orgs' }
    ] },
    { group: 'Security', items: [
      { id: 'moderation', label: 'Notifications & reports', icon: 'shield', href: 'app/moderation.html', route: '/moderation' },
      { id: 'vault', label: 'Vault', icon: 'lock', href: 'app/vault.html', route: '/secrets' },
      { id: 'certs', label: 'Certificates', icon: 'cert', href: 'app/certs.html', route: '/certs' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: 'app/settings.html', route: '/settings' }
    ] }
  ];
  var APP_DETAIL = [
    { id: 'post', label: 'Post detail', href: 'app/post.html', route: '/feed/:id', parent: 'feed' },
    { id: 'group', label: 'Group detail', href: 'app/group.html', route: '/groups/:id', parent: 'groups' },
    { id: 'profile', label: 'Profile', href: 'app/profile.html', route: '/people/:id', parent: 'people' },
    { id: 'watch', label: 'Watch stream', href: 'app/watch.html', route: '/streams/watch/:id', parent: 'streams' },
    { id: 'room', label: 'Room call', href: 'app/room.html', route: '/rooms (in call)', parent: 'rooms' },
    { id: 'cortex-task', label: 'AI task detail', href: 'app/cortex-task.html', route: '/cortex/tasks/:id', parent: 'cortex' },
    { id: 'not-found', label: 'Not found', href: 'app/not-found.html', route: '*', parent: null }
  ];
  var PUBLIC_PAGES = [
    { id: 'login', label: 'Sign in (+ MFA)', href: 'app/login.html', route: '/login' },
    { id: 'signup', label: 'Create organization', href: 'app/signup.html', route: '/signup' },
    { id: 'sso-callback', label: 'SSO callback', href: 'app/sso-callback.html', route: '/sso/callback' },
    { id: 'accept-invite', label: 'Accept invite', href: 'app/accept-invite.html', route: '/accept-invite' },
    { id: 'share', label: 'Shared file', href: 'app/share.html', route: '/s/:shareLinkId' },
    { id: 'form', label: 'Public form', href: 'app/form.html', route: '/f/:slug' }
  ];
  var ADMIN_NAV = [
    { group: null, items: [
      { id: 'overview', label: 'Overview', icon: 'gauge', href: 'admin/overview.html', route: '/admin' },
      { id: 'platform', label: 'Platform', icon: 'tune', href: 'admin/platform.html', route: '/admin/platform' },
      { id: 'orgs', label: 'Organizations', icon: 'building', href: 'admin/orgs.html', route: '/admin/orgs (new)' }
    ] },
    { group: 'Infrastructure', items: [
      { id: 'ca', label: 'Certificate Authority', icon: 'cert', href: 'admin/ca.html', route: '/admin/ca' },
      { id: 'auth', label: 'Authentication', icon: 'fingerprint', href: 'admin/auth.html', route: '/admin/auth' },
      { id: 'identity-groups', label: 'Groups', icon: 'diversity', href: 'admin/identity-groups.html', route: '/admin/identity-groups' },
      { id: 'users', label: 'Users', icon: 'person', href: 'admin/users.html', route: '/admin/users' },
      { id: 'roles', label: 'Roles', icon: 'badge', href: 'admin/roles.html', route: '/admin/roles' },
      { id: 'permissions', label: 'Permissions', icon: 'key', href: 'admin/permissions.html', route: '/admin/permissions' },
      { id: 'scopes', label: 'Scopes', icon: 'scope', href: 'admin/scopes.html', route: '/admin/scopes' },
      { id: 'atproto', label: 'AT-Protocol', icon: 'butterfly', href: 'admin/atproto.html', route: '/admin/atproto' },
      { id: 'ai', label: 'AI', icon: 'brain', href: 'admin/ai.html', route: '/admin/ai' }
    ] },
    { group: 'Services', items: [
      { id: 'timeline', label: 'Timeline', icon: 'feed', href: 'admin/timeline.html', route: '/admin/timeline' },
      { id: 'nexus', label: 'Groups & events', icon: 'groups', href: 'admin/nexus.html', route: '/admin/nexus' },
      { id: 'live', label: 'Live', icon: 'live', href: 'admin/live.html', route: '/admin/live' },
      { id: 'vault', label: 'Vault', icon: 'lock', href: 'admin/vault.html', route: '/admin/vault' },
      { id: 'filevault', label: 'File Vault', icon: 'folder', href: 'admin/filevault.html', route: '/admin/filevault' },
      { id: 'spark', label: 'Spark', icon: 'chat', href: 'admin/spark.html', route: '/admin/spark' },
      { id: 'jobs', label: 'Jobs & Queues', icon: 'layers', href: 'admin/jobs.html', route: '/admin/jobs' },
      { id: 'prefetch', label: 'Prefetch', icon: 'cache', href: 'admin/prefetch.html', route: '/admin/prefetch' }
    ] },
    { group: 'Applications', items: [
      { id: 'lowcode', label: 'Low-Code', icon: 'flow', href: 'admin/lowcode.html', route: '/admin/lowcode' },
      { id: 'cortex', label: 'Cortex', icon: 'bot', href: 'admin/cortex.html', route: '/admin/cortex' },
      { id: 'plugins', label: 'Plugins', icon: 'puzzle', href: 'admin/plugins.html', route: '/admin/plugins' },
      { id: 'moderator', label: 'Moderation', icon: 'shield', href: 'admin/moderator.html', route: '/admin/moderator' }
    ] }
  ];
  var ADMIN_DETAIL = [
    { id: 'lowcode-entity', label: 'Entity designer', href: 'admin/lowcode-entity.html', route: '/admin/lowcode/entities/:id', parent: 'lowcode' },
    { id: 'lowcode-flow', label: 'Flow designer', href: 'admin/lowcode-flow.html', route: '/admin/lowcode/flows/:id', parent: 'lowcode' }
  ];
  var TABBAR_APP = ['home', 'messages', 'feed', 'groups'];
  var TABBAR_ADMIN = ['overview', 'users', 'moderator', 'jobs'];

  window.ExprsnMock = { APP_NAV: APP_NAV, APP_DETAIL: APP_DETAIL, PUBLIC_PAGES: PUBLIC_PAGES, ADMIN_NAV: ADMIN_NAV, ADMIN_DETAIL: ADMIN_DETAIL, icon: icon };

  function flat(nav) { var out = []; nav.forEach(function (g) { g.items.forEach(function (i) { out.push(i); }); }); return out; }
  function url(href) { return BASE + href; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ── Toasts ── */
  function toast(html, ms) {
    var host = $('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html; host.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3200);
  }
  window.ExprsnMock.toast = toast;

  /* ── Build shell ── */
  function buildShell(kind, pageId) {
    var nav = kind === 'admin' ? ADMIN_NAV : APP_NAV;
    var details = kind === 'admin' ? ADMIN_DETAIL : APP_DETAIL;
    var detail = details.filter(function (d) { return d.id === pageId; })[0];
    var activeId = detail && detail.parent ? detail.parent : pageId;
    var main = $('main') || document.createElement('main');
    main.id = 'main'; main.classList.add('main'); main.setAttribute('tabindex', '-1');

    var shell = document.createElement('div');
    shell.className = 'shell';
    try { if (localStorage.getItem('exprsn-v2-collapsed') === '1') shell.setAttribute('data-collapsed', 'true'); } catch (e) { /* ignore */ }

    var navOpen = {};
    try { navOpen = JSON.parse(localStorage.getItem('exprsn-v2-navgroups') || '{}') || {}; } catch (e) { navOpen = {}; }

    var sidebarHtml = nav.map(function (g) {
      var hasActive = g.items.some(function (i) { return i.id === activeId; });
      var open = hasActive || navOpen[g.group] !== false;
      var links = g.items.map(function (i) {
        return '<a class="nav-link" href="' + url(i.href) + '"' + (i.id === activeId ? ' aria-current="page"' : '') + ' title="' + esc(i.label) + '">' +
          icon(i.icon) + '<span>' + esc(i.label) + '</span>' + (i.badge ? '<span class="badge">' + i.badge + '</span>' : '') + '</a>';
      }).join('');
      var head = g.group ? '<button class="nav-heading" type="button" aria-expanded="' + open + '" data-group="' + esc(g.group) + '"><span class="eyebrow">' + esc(g.group) + '</span>' + icon('down') + '</button>' : '';
      return '<div class="nav-group" data-open="' + open + '">' + head + links + '</div>';
    }).join('');

    var foot = kind === 'admin'
      ? '<a class="nav-link" href="' + url('app/home.html') + '">' + icon('back') + '<span>Back to workspace</span></a>'
      : '<a class="nav-link" href="' + url('admin/overview.html') + '">' + icon('gauge') + '<span>Admin console</span></a>';

    var ns = (window.__contract && window.__contract.socket || []).map(function (s) { return s.ns; });
    var rtLabel = kind === 'admin' ? 'Live' : 'Connected';

    shell.innerHTML =
      '<header class="topbar">' +
        '<button class="icon-btn" type="button" id="nav-toggle" aria-label="Toggle navigation" aria-controls="sidebar">' + icon('sidebar') + '</button>' +
        '<a class="brand" href="' + url(kind === 'admin' ? 'admin/overview.html' : 'app/home.html') + '"><span class="brand-mark">E</span><span>Exprsn</span>' + (kind === 'admin' ? '<span class="brand-sub">Admin</span>' : '') + '</a>' +
        (kind === 'admin' ? '<button class="chip org-chip" type="button" data-open="org-switcher" aria-label="Organization: All organizations">' + icon('building', 'sm') + '<span class="truncate">All organizations</span>' + icon('down', 'sm') + '</button>' : '') +
        '<button class="topbar-search" type="button" id="palette-open" aria-label="Search and commands (⌘K)">' + icon('search', 'sm') + '<span class="grow">' + (kind === 'admin' ? 'Search users, tokens, DIDs, jobs…' : 'Search or jump to…') + '</span><span class="kbd">⌘K</span></button>' +
        '<div class="topbar-actions">' +
          '<button class="rt-pill" type="button" id="rt-pill" data-rt="connected" title="Realtime: ' + esc(ns.join(', ') || 'shared socket') + '"><span class="rt-dot"></span><span class="label">' + rtLabel + '</span></button>' +
          '<button class="icon-btn" type="button" id="theme-toggle" aria-label="Toggle light/dark theme">' + icon(currentTheme() === 'dark' ? 'sun' : 'moon') + '</button>' +
          (kind === 'app' ? '<a class="icon-btn" href="' + url('app/moderation.html') + '" aria-label="Notifications, 4 unread" data-on="notification moderation_notification">' + icon('bell') + '<span class="dot">4</span></a>' : '') +
          '<button class="avatar-btn" type="button" aria-label="Account menu"><span class="avatar sm g1">RH</span></button>' +
        '</div>' +
      '</header>' +
      '<nav class="sidebar" id="sidebar" aria-label="' + (kind === 'admin' ? 'Admin sections' : 'Primary') + '">' + sidebarHtml +
        '<div class="sidebar-foot">' + foot +
          '<button class="nav-link" type="button" id="collapse" style="border:0;background:none;font:inherit;cursor:pointer">' + icon('sidebar') + '<span>Collapse sidebar</span></button>' +
        '</div>' +
      '</nav>';

    document.body.insertBefore(shell, document.body.firstChild);
    shell.appendChild(main);

    var skip = document.createElement('a'); skip.className = 'skip-link'; skip.href = '#main'; skip.textContent = 'Skip to content';
    document.body.insertBefore(skip, shell);

    // Mobile tab bar
    var tabIds = kind === 'admin' ? TABBAR_ADMIN : TABBAR_APP;
    var all = flat(nav);
    var tb = document.createElement('nav'); tb.className = 'tabbar'; tb.setAttribute('aria-label', 'Tab bar');
    tb.innerHTML = tabIds.map(function (id) {
      var i = all.filter(function (x) { return x.id === id; })[0];
      return '<a href="' + url(i.href) + '"' + (i.id === activeId ? ' aria-current="page"' : '') + '>' + icon(i.icon) + '<span>' + esc(i.label.split(' ')[0]) + '</span></a>';
    }).join('') + '<button type="button" id="tab-more"' + (tabIds.indexOf(activeId) < 0 ? ' aria-current="page"' : '') + '>' + icon('menu') + '<span>More</span></button>';
    document.body.appendChild(tb);

    // Behaviour
    $('#nav-toggle').addEventListener('click', function () {
      if (window.matchMedia('(max-width: 900px)').matches) toggleDrawer(shell);
      else collapse(shell);
    });
    $('#collapse').addEventListener('click', function () { collapse(shell); });
    $('#tab-more').addEventListener('click', function () { toggleDrawer(shell); });
    $$('.nav-heading', shell).forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.parentElement; var open = g.getAttribute('data-open') !== 'true';
        g.setAttribute('data-open', String(open)); b.setAttribute('aria-expanded', String(open));
        navOpen[b.getAttribute('data-group')] = open;
        try { localStorage.setItem('exprsn-v2-navgroups', JSON.stringify(navOpen)); } catch (e) { /* ignore */ }
      });
    });
    main.addEventListener('click', function () { if (shell.getAttribute('data-drawer') === 'open') shell.removeAttribute('data-drawer'); });

    // Realtime pill: connected → reconnecting → offline → connected
    var pill = $('#rt-pill');
    pill.addEventListener('click', function () {
      var order = ['connected', 'reconnecting', 'offline'];
      var next = order[(order.indexOf(pill.getAttribute('data-rt')) + 1) % 3];
      pill.setAttribute('data-rt', next);
      $('.label', pill).textContent = next === 'connected' ? rtLabel : next === 'reconnecting' ? 'Reconnecting…' : 'Offline';
      var b = $('#rt-banner');
      if (next === 'connected') { if (b) b.remove(); toast(icon('check', 'sm') + ' Back online — missed events refetched'); return; }
      if (!b) { b = document.createElement('div'); b.id = 'rt-banner'; b.setAttribute('role', 'status'); var page = $('.page', main) || main; page.insertBefore(b, page.firstChild); }
      b.className = 'banner ' + (next === 'offline' ? 'danger' : 'warn');
      b.innerHTML = next === 'offline'
        ? icon('wifiOff') + '<span class="grow"><b>You’re offline.</b> Changes you make are queued and sent when the connection returns. Live updates are paused.</span><button class="btn sm outline" type="button">Retry now</button>'
        : icon('refresh') + '<span class="grow"><b>Reconnecting…</b> Live updates are delayed; data on screen may be a few seconds old.</span>';
    });
  }
  function collapse(shell) {
    var c = shell.getAttribute('data-collapsed') === 'true';
    if (c) shell.removeAttribute('data-collapsed'); else shell.setAttribute('data-collapsed', 'true');
    try { localStorage.setItem('exprsn-v2-collapsed', c ? '0' : '1'); } catch (e) { /* ignore */ }
  }
  function toggleDrawer(shell) {
    if (shell.getAttribute('data-drawer') === 'open') shell.removeAttribute('data-drawer');
    else { shell.setAttribute('data-drawer', 'open'); var f = $('.nav-link', shell); if (f) f.focus(); }
  }

  /* ── Theme toggle (works on shell and public pages) ── */
  function bindTheme() {
    $$('#theme-toggle, [data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        writeTheme(next);
        $$('#theme-toggle, [data-theme-toggle]').forEach(function (b) { var ic = $('.ic', b); if (ic) ic.outerHTML = icon(next === 'dark' ? 'sun' : 'moon'); });
      });
    });
  }

  /* ── ⌘K palette ── */
  function buildPalette(kind) {
    var d = document.createElement('dialog'); d.className = 'palette'; d.setAttribute('aria-label', 'Command palette');
    var entries = [];
    function add(group, list) { list.forEach(function (i) { entries.push({ g: group, label: i.label, href: url(i.href), icon: i.icon || 'right', hint: i.route }); }); }
    if (kind === 'admin') { ADMIN_NAV.forEach(function (g) { add(g.group || 'Console', g.items); }); add('Detail views', ADMIN_DETAIL); add('Workspace', flat(APP_NAV)); }
    else { APP_NAV.forEach(function (g) { add(g.group, g.items); }); add('Detail views', APP_DETAIL); add('Admin console', flat(ADMIN_NAV)); add('Public pages', PUBLIC_PAGES); }
    entries.push({ g: 'Actions', label: 'Toggle light/dark theme', action: 'theme', icon: 'moon', hint: 'T' });
    entries.push({ g: 'Actions', label: 'Show screen contract (REST + sockets)', action: 'contract', icon: 'code', hint: 'C' });
    d.innerHTML = '<div class="palette-input">' + icon('search') + '<input id="palette-q" type="text" placeholder="Type a page, person, DID, token id…" aria-label="Search" autocomplete="off"><span class="kbd">esc</span></div><ul class="palette-list" role="listbox" id="palette-list" aria-label="Results"></ul><div class="palette-foot"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div>';
    document.body.appendChild(d);
    var q = $('#palette-q', d), list = $('#palette-list', d), sel = 0, shown = [];
    function render() {
      var term = q.value.trim().toLowerCase();
      shown = entries.filter(function (e) { return !term || (e.label + ' ' + e.g + ' ' + (e.hint || '')).toLowerCase().indexOf(term) >= 0; }).slice(0, 40);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      var last = null, html = '';
      shown.forEach(function (e, i) {
        if (e.g !== last) { html += '<li class="grp eyebrow" role="presentation">' + esc(e.g) + '</li>'; last = e.g; }
        html += '<li role="presentation"><a role="option" href="' + (e.href || '#') + '" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + icon(e.icon) + '<span>' + esc(e.label) + '</span><span class="hint">' + esc(e.hint || '') + '</span></a></li>';
      });
      list.innerHTML = html || '<li class="empty"><p>No matches. Try a module name like “vault”.</p></li>';
    }
    function run(e) {
      if (!e) return;
      if (e.action === 'theme') { d.close(); $('#theme-toggle, [data-theme-toggle]') && $('#theme-toggle, [data-theme-toggle]').click(); return; }
      if (e.action === 'contract') { d.close(); openContract(true); return; }
      location.href = e.href;
    }
    q.addEventListener('input', function () { sel = 0; render(); });
    q.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); render(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { run(shown[sel]); ev.preventDefault(); }
    });
    list.addEventListener('click', function (ev) { var a = ev.target.closest('a[data-i]'); if (a) { ev.preventDefault(); run(shown[+a.getAttribute('data-i')]); } });
    function open() { q.value = ''; sel = 0; render(); d.showModal(); q.focus(); }
    var btn = $('#palette-open'); if (btn) btn.addEventListener('click', open);
    document.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); d.open ? d.close() : open(); }
    });
  }

  /* ── Contract drawer ── */
  var contractEl = null;
  function openContract(open) {
    if (!contractEl) return;
    contractEl.setAttribute('data-open', String(open));
    if (open) $('.contract-head button', contractEl).focus();
  }
  function matchAttr(attr, value) {
    return $$('[' + attr + ']').filter(function (el) { return el.getAttribute(attr).split(/\s+/).indexOf(value) >= 0; });
  }
  function highlight(attr, value, label) {
    var els = attr === 'data-api'
      ? $$('[data-api]').filter(function (el) { return el.getAttribute('data-api').split(/\s+/).some(function (p) { return p && value.indexOf(p) === 0 || p === value; }); })
      : matchAttr(attr, value);
    els.forEach(function (el) { el.setAttribute('data-flash', ''); setTimeout(function () { el.removeAttribute('data-flash'); }, 1600); });
    if (els[0]) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (attr === 'data-on') toast(icon('zap', 'sm') + '<span><span class="ev">' + esc(value) + '</span> → ' + esc(label || 'UI updated') + '</span>');
    return els.length;
  }
  function buildContract(c, hasStates) {
    var restCount = (c.rest || []).length;
    var evCount = (c.socket || []).reduce(function (n, s) { return n + (s.on || []).length + (s.emit || []).length; }, 0);
    var fab = document.createElement('button');
    fab.type = 'button'; fab.setAttribute('aria-controls', 'contract');
    fab.title = 'Screen contract: ' + restCount + ' REST calls, ' + evCount + ' socket events (C)';
    var actions = $('.topbar-actions');
    if (actions) {
      fab.className = 'rt-pill contract-btn';
      fab.innerHTML = icon('code', 'sm') + '<span class="label num">' + restCount + ' · ' + evCount + '</span>';
      actions.insertBefore(fab, actions.firstChild);
    } else {
      fab.className = 'contract-fab';
      fab.innerHTML = icon('code', 'sm') + '<span class="label">Contract</span><span class="count">' + restCount + ' REST · ' + evCount + ' events</span>';
      document.body.appendChild(fab);
    }

    var el = document.createElement('aside'); el.className = 'contract'; el.id = 'contract'; el.setAttribute('aria-label', 'Screen contract'); el.setAttribute('data-open', 'false');
    var html = '<div class="contract-head">' + icon('code') + '<h2>Screen contract</h2><button class="icon-btn" type="button" aria-label="Close contract">' + icon('x') + '</button></div><div class="contract-body">';
    if (hasStates) {
      html += '<div><h3>Preview state</h3><div class="seg" role="group" aria-label="Preview state" id="state-seg">' +
        ['loaded', 'empty', 'loading', 'error'].map(function (s) { return '<button type="button" data-s="' + s + '" aria-pressed="' + (s === 'loaded') + '">' + s[0].toUpperCase() + s.slice(1) + '</button>'; }).join('') + '</div></div>';
    }
    if (c.notes) html += '<p class="small secondary">' + esc(c.notes) + '</p>';
    if (c.gaps && c.gaps.length) {
      html += '<div><h3>' + icon('alert', 'sm') + 'Known backend gaps</h3><div class="stack tight">' + c.gaps.map(function (g) { return '<div class="c-gap ' + (g.sev === 'high' ? 'high' : '') + '">' + icon('alert', 'sm') + '<span>' + esc(g.text) + '</span></div>'; }).join('') + '</div></div>';
    }
    if (restCount) {
      html += '<div><h3>REST · ' + restCount + '</h3>' + c.rest.map(function (r) {
        return '<div class="c-row" tabindex="0" data-kind="api" data-v="' + esc(r.p) + '"><span class="m ' + esc(r.m) + '">' + esc(r.m) + '</span><span class="p">' + esc(r.p) + (r.auth ? '<span class="a">' + esc(r.auth) + '</span>' : '') + '</span><span class="u">' + esc(r.ui || '') + '</span></div>';
      }).join('') + '</div>';
    }
    (c.socket || []).forEach(function (s) {
      html += '<div><h3>Socket.IO · ' + esc(s.ns) + '</h3>';
      html += '<div class="c-ns"><span class="pill info">auth: ' + esc(s.auth || 'CA bearer') + '</span>' + (s.rooms || []).map(function (r) { return '<span class="pill">room ' + esc(r) + '</span>'; }).join('') + '</div>';
      (s.emit || []).forEach(function (e) { html += '<div class="c-row" tabindex="0" data-kind="emit" data-v="' + esc(e.e) + '"><span class="m EMIT">EMIT</span><span class="p">' + esc(e.e) + '</span><span class="u">' + esc(e.ui || '') + '</span></div>'; });
      (s.on || []).forEach(function (e) { html += '<div class="c-row" tabindex="0" data-kind="on" data-v="' + esc(e.e) + '" data-ui="' + esc(e.ui || '') + '"><span class="m ON">ON</span><span class="p">' + esc(e.e) + '</span><span class="u">' + esc(e.ui || '') + '</span></div>'; });
      html += '</div>';
    });
    html += '<p class="xs muted">Click a row to highlight the UI it drives. ON rows simulate the event. Auth: <b>user</b> = CA bearer, <b>A</b> = platform admin, <b>S</b> = service HMAC, <b>P</b> = public, <b>owner</b>/<b>grp-admin</b> = resource-scoped.</p>';
    html += '</div>';
    el.innerHTML = html;
    document.body.appendChild(el);
    contractEl = el;

    fab.addEventListener('click', function () { openContract(el.getAttribute('data-open') !== 'true'); });
    $('.contract-head button', el).addEventListener('click', function () { openContract(false); fab.focus(); });
    $$('.c-row', el).forEach(function (row) {
      function go() {
        var kind = row.getAttribute('data-kind'), v = row.getAttribute('data-v');
        var n = highlight(kind === 'api' ? 'data-api' : kind === 'emit' ? 'data-emit' : 'data-on', v, row.getAttribute('data-ui'));
        if (!n && kind !== 'on') toast(icon('info', 'sm') + ' Not bound to a visible element on this state');
      }
      row.addEventListener('click', go);
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    var seg = $('#state-seg', el);
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-s]'); if (!b) return;
      $$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.body.setAttribute('data-demo-state', b.getAttribute('data-s'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.getAttribute('data-open') === 'true') openContract(false);
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) openContract(el.getAttribute('data-open') !== 'true');
    });
  }

  /* ── Generic widgets ── */
  function bindWidgets() {
    // Tabs: [role=tablist] > [role=tab][aria-controls]
    $$('[role="tablist"]').forEach(function (tl) {
      var tabs = $$('[role="tab"]', tl);
      function select(t) {
        tabs.forEach(function (x) {
          var on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
          var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
        });
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(t); });
        t.addEventListener('keydown', function (e) {
          var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
          if (j === null) return; var n = tabs[(j + tabs.length) % tabs.length]; n.focus(); select(n); e.preventDefault();
        });
      });
      var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (cur) select(cur);
    });
    // Segmented / exclusive toggles
    $$('.seg:not(#state-seg)').forEach(function (s) {
      s.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        $$('button', s).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var target = s.getAttribute('data-view-target');
        if (target && b.getAttribute('data-view')) $$('[data-view-of="' + target + '"]').forEach(function (v) { v.hidden = v.getAttribute('data-view-name') !== b.getAttribute('data-view'); });
      });
    });
    // Toggle chips / buttons
    $$('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on));
        var c = $('.n', b); if (c && /^\d+$/.test(c.textContent)) c.textContent = +c.textContent + (on ? 1 : -1);
      });
    });
    // Dialogs
    $$('[data-open]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        var d = document.getElementById(b.getAttribute('data-open'));
        if (d && d.showModal) { e.preventDefault(); d.showModal(); }
        else if (!d) toast(icon('info', 'sm') + ' Opens: ' + esc(b.getAttribute('data-open')));
      });
    });
    $$('dialog').forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      $$('[data-close]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); if (b.getAttribute('data-toast')) toast(icon('check', 'sm') + ' ' + esc(b.getAttribute('data-toast'))); }); });
    });
    // Any [data-toast] outside dialogs
    $$('[data-toast]').forEach(function (b) {
      if (b.closest('dialog')) return;
      b.addEventListener('click', function () { toast(icon('check', 'sm') + ' ' + esc(b.getAttribute('data-toast'))); });
    });
    // Master–detail on phones
    $$('.md').forEach(function (md) {
      md.setAttribute('data-pane', 'list');
      $$('.md-list .list-item', md).forEach(function (li) { li.addEventListener('click', function () { md.setAttribute('data-pane', 'detail'); }); });
      $$('[data-back]', md).forEach(function (b) { b.addEventListener('click', function () { md.setAttribute('data-pane', 'list'); }); });
    });
    // Row selection → bulk bar
    $$('.dt').forEach(function (dt) {
      var bulk = $('.dt-bulk', dt); var all = $('thead .check', dt);
      function sync() {
        var n = $$('tbody .check:checked', dt).length;
        $$('tbody tr', dt).forEach(function (tr) { var c = $('.check', tr); if (c) tr.setAttribute('aria-selected', String(c.checked)); });
        if (bulk) { bulk.hidden = n === 0; var cnt = $('.n', bulk); if (cnt) cnt.textContent = n; }
      }
      $$('tbody .check', dt).forEach(function (c) { c.addEventListener('change', sync); });
      if (all) all.addEventListener('change', function () { $$('tbody .check', dt).forEach(function (c) { c.checked = all.checked; }); sync(); });
      sync();
    });
    // Scrollable code/log blocks must be keyboard-focusable
    $$('pre.code, .code.log').forEach(function (el) { if (!el.hasAttribute('tabindex')) el.tabIndex = 0; });
    // Forms never submit anywhere in a mockup
    $$('form').forEach(function (f) { f.addEventListener('submit', function (e) { e.preventDefault(); var m = f.getAttribute('data-toast'); if (m) toast(icon('check', 'sm') + ' ' + esc(m)); }); });
    // Copy buttons
    $$('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-copy');
        if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { toast(icon('copy', 'sm') + ' Copied'); }, function () { toast(icon('copy', 'sm') + ' Copy blocked — select the text instead'); });
      });
    });
    // Reveal secret
    $$('[data-reveal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = document.getElementById(b.getAttribute('data-reveal')); if (!t) return;
        var shown = t.getAttribute('data-shown') === '1';
        t.textContent = shown ? '••••••••••••' : t.getAttribute('data-value');
        t.setAttribute('data-shown', shown ? '0' : '1');
        b.setAttribute('aria-pressed', String(!shown));
      });
    });
  }

  /* ── Icons: <i data-i="name"></i> → inline SVG ── */
  function hydrateIcons(root) {
    $$('i[data-i]', root).forEach(function (el) {
      var span = document.createElement('span'); span.innerHTML = icon(el.getAttribute('data-i'), el.className);
      el.replaceWith(span.firstChild);
    });
  }

  function init() {
    var body = document.body;
    var kind = body.getAttribute('data-shell') || 'app';
    var pageId = body.getAttribute('data-page') || '';
    var cEl = document.getElementById('contract');
    var contract = null;
    if (cEl) { try { contract = JSON.parse(cEl.textContent); } catch (e) { console.error('Invalid contract JSON on ' + pageId, e); } }
    window.__contract = contract || {};
    hydrateIcons(document);
    if (kind === 'app' || kind === 'admin') { buildShell(kind, pageId); buildPalette(kind); }
    var hasStates = !!$('[data-state]');
    if (hasStates && !body.getAttribute('data-demo-state')) body.setAttribute('data-demo-state', 'loaded');
    if (contract) buildContract(contract, hasStates);
    bindTheme();
    bindWidgets();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
