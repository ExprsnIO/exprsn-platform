/*
 * Exprsn Platform docs — minimal Markdown renderer.
 * Plain vanilla JS, zero dependencies. Supports: ATX headings, paragraphs,
 * nested ordered/unordered lists, fenced code blocks (verbatim, escaped),
 * inline code, bold/italic, links, images, blockquotes, GFM tables, and
 * horizontal rules. ALL source text is HTML-escaped before any generated
 * markup is injected — only tags emitted by this file are live HTML.
 * render() also assigns ids to headings (so #fragment links work) and
 * returns a table of contents built from h2/h3 headings.
 *
 * Usage (browser):  var out = ExprsnMarkdown.render(src); // { html, toc }
 * Usage (node):     var out = require('./markdown.js').render(src);
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------- escaping */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------- inline */

  // Split a link/image destination into href + optional "title".
  // `dest` is already HTML-escaped, so quotes appear as &quot;.
  function splitDest(dest) {
    var s = dest.trim();
    var m = s.match(/^(\S*)\s+&quot;([\s\S]*)&quot;$/);
    if (m) return { href: m[1], title: m[2] };
    return { href: s, title: '' };
  }

  function renderInline(text) {
    var slots = [];
    function stash(html) {
      slots.push(html);
      return '\u0000' + (slots.length - 1) + '\u0000';
    }

    var t = escapeHtml(text);

    // Code spans first — their content must not be touched by anything else.
    t = t.replace(/(`+)([\s\S]*?)\1/g, function (m0, fence, code) {
      code = code.replace(/^ ([\s\S]*) $/, '$1'); // strip one framing space pair
      return stash('<code>' + code + '</code>');
    });

    // Images (before links — same bracket syntax with a leading !).
    t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, function (m0, alt, dest) {
      var d = splitDest(dest);
      return stash('<img src="' + d.href + '" alt="' + alt + '"' +
        (d.title ? ' title="' + d.title + '"' : '') + '>');
    });

    // Links — stash the tags but leave the label in place so bold/italic
    // inside link text still gets processed.
    t = t.replace(/\[([^\]]+)\]\(([^)]*)\)/g, function (m0, label, dest) {
      var d = splitDest(dest);
      return stash('<a href="' + d.href + '"' +
        (d.title ? ' title="' + d.title + '"' : '') + '>') + label + stash('</a>');
    });

    // Bold, then italic.
    t = t.replace(/\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^\s_](?:[\s\S]*?[^\s_])?)__/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^\s*][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    t = t.replace(/(^|[\s(&gt;])_([^\s_][^_]*?)_(?=$|[\s).,:;!?])/g, '$1<em>$2</em>');

    // Restore stashed raw HTML.
    while (/\u0000\d+\u0000/.test(t)) {
      t = t.replace(/\u0000(\d+)\u0000/g, function (m0, i) { return slots[+i]; });
    }
    return t;
  }

  /* ---------------------------------------------------------- headings */

  function plainText(s) {
    return s
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`+/g, '')
      .replace(/[*_]/g, '');
  }

  function headingId(raw, ctx) {
    var base = plainText(raw).toLowerCase().trim()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
    var id = base, k = 2;
    while (ctx.slugs[id]) id = base + '-' + (k++);
    ctx.slugs[id] = true;
    return id;
  }

  /* ---------------------------------------------------------- blocks */

  var reFence = /^\s*(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
  var reHeading = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  var reHr = /^\s{0,3}((?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
  var reQuote = /^\s{0,3}>\s?(.*)$/;
  var reUl = /^(\s*)([-*+])\s+(.*)$/;
  var reOl = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
  var reTableDelim = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function indentOf(line) {
    var m = line.match(/^\s*/);
    return m ? m[0].length : 0;
  }

  function dedent(line, k) {
    var i = 0;
    while (i < k && line.charAt(i) === ' ') i++;
    return line.slice(i);
  }

  function listItemMatch(line) {
    var m = line.match(reUl);
    if (m && !reHr.test(line)) {
      return { indent: m[1].length, ordered: false, text: m[3], markerLen: m[2].length };
    }
    m = line.match(reOl);
    if (m) {
      return { indent: m[1].length, ordered: true, text: m[3], markerLen: m[2].length + 1, start: parseInt(m[2], 10) };
    }
    return null;
  }

  function isBlockStart(line) {
    return reFence.test(line) || reHeading.test(line) || reHr.test(line) ||
      reQuote.test(line) || !!listItemMatch(line);
  }

  /* ------------------------------ tables */

  function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    var cells = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; }
      else if (ch === '|') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }

  function alignOf(cell) {
    var l = cell.charAt(0) === ':', r = cell.charAt(cell.length - 1) === ':';
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  }

  function tableHtml(headers, aligns, rows) {
    function attr(idx) {
      var a = aligns[idx];
      return a ? ' style="text-align:' + a + '"' : '';
    }
    var h = '<thead><tr>' + headers.map(function (c, idx) {
      return '<th' + attr(idx) + '>' + renderInline(c) + '</th>';
    }).join('') + '</tr></thead>';
    var b = rows.map(function (r) {
      return '<tr>' + headers.map(function (unused, idx) {
        return '<td' + attr(idx) + '>' + renderInline(r[idx] || '') + '</td>';
      }).join('') + '</tr>';
    }).join('\n');
    return '<table>' + h + '<tbody>' + b + '</tbody></table>';
  }

  /* ------------------------------ lists */

  function parseList(lines, start, ctx) {
    var first = listItemMatch(lines[start]);
    var baseIndent = first.indent;
    var ordered = first.ordered;
    var items = [];
    var cur = null;
    var i = start, n = lines.length;

    while (i < n) {
      var line = lines[i];
      if (!line.trim()) {
        // Blank line: the list continues only if the next non-empty line is
        // another item or indented continuation content.
        var j = i + 1;
        if (j < n && lines[j].trim() &&
            (listItemMatch(lines[j]) || indentOf(lines[j]) > baseIndent)) {
          if (cur) cur.children.push('');
          i++;
          continue;
        }
        break;
      }
      var it = listItemMatch(line);
      if (it && it.indent <= baseIndent) {
        if (it.indent < baseIndent) break;   // belongs to an outer list
        if (it.ordered !== ordered) break;   // marker type switch → new list
        cur = { text: it.text, children: [], contIndent: it.indent + it.markerLen + 1 };
        items.push(cur);
        i++;
        continue;
      }
      if (cur && (it || indentOf(line) > baseIndent)) {
        cur.children.push(dedent(line, cur.contIndent));
        i++;
        continue;
      }
      break;
    }

    var body = items.map(function (item) {
      var inner = renderInline(item.text);
      // trim trailing blank child lines
      while (item.children.length && !item.children[item.children.length - 1].trim()) {
        item.children.pop();
      }
      if (item.children.length) {
        var childHtml = renderBlocks(item.children, ctx);
        if (childHtml) inner += '\n' + childHtml;
      }
      return '<li>' + inner + '</li>';
    }).join('\n');

    var tag = ordered ? 'ol' : 'ul';
    var startAttr = ordered && first.start && first.start !== 1 ? ' start="' + first.start + '"' : '';
    return { html: '<' + tag + startAttr + '>\n' + body + '\n</' + tag + '>', next: i };
  }

  /* ------------------------------ main block loop */

  function renderBlocks(lines, ctx) {
    var out = [];
    var i = 0, n = lines.length;

    while (i < n) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      var m;

      // Fenced code block — content preserved verbatim, HTML-escaped.
      if ((m = line.match(reFence))) {
        var fenceChar = m[1].charAt(0);
        var closeRe = new RegExp('^\\s*\\' + fenceChar + '{' + m[1].length + ',}\\s*$');
        var lang = m[2];
        var buf = [];
        i++;
        while (i < n && !closeRe.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip the closing fence (or run past EOF)
        out.push('<pre><code' +
          (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' +
          escapeHtml(buf.join('\n')) + '\n</code></pre>');
        continue;
      }

      // ATX heading.
      if ((m = line.match(reHeading))) {
        var level = m[1].length;
        var id = headingId(m[2], ctx);
        if (level === 2 || level === 3) {
          ctx.toc.push({ level: level, id: id, text: plainText(m[2]).trim() });
        }
        out.push('<h' + level + ' id="' + id + '">' + renderInline(m[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      // Horizontal rule.
      if (reHr.test(line) && !listItemMatch(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      // Blockquote (with lazy continuation lines).
      if (reQuote.test(line)) {
        var q = [];
        while (i < n) {
          var qm = lines[i].match(reQuote);
          if (qm) { q.push(qm[1]); i++; continue; }
          if (lines[i].trim() && q.length && !isBlockStart(lines[i])) {
            q.push(lines[i]);
            i++;
            continue;
          }
          break;
        }
        out.push('<blockquote>\n' + renderBlocks(q, ctx) + '\n</blockquote>');
        continue;
      }

      // GFM table: header row + delimiter row (delimiter must contain a pipe).
      if (line.indexOf('|') !== -1 && i + 1 < n &&
          lines[i + 1].indexOf('|') !== -1 && lines[i + 1].indexOf('-') !== -1 &&
          reTableDelim.test(lines[i + 1])) {
        var headers = splitRow(line);
        var aligns = splitRow(lines[i + 1]).map(alignOf);
        i += 2;
        var rows = [];
        while (i < n && lines[i].trim() && lines[i].indexOf('|') !== -1) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        out.push(tableHtml(headers, aligns, rows));
        continue;
      }

      // Lists (ordered / unordered, nested).
      if (listItemMatch(line)) {
        var res = parseList(lines, i, ctx);
        out.push(res.html);
        i = res.next;
        continue;
      }

      // Paragraph.
      var p = [line.trim()];
      i++;
      while (i < n && lines[i].trim() && !isBlockStart(lines[i])) {
        p.push(lines[i].trim());
        i++;
      }
      out.push('<p>' + renderInline(p.join('\n')) + '</p>');
    }

    return out.join('\n');
  }

  /* ---------------------------------------------------------- API */

  function render(src) {
    var ctx = { toc: [], slugs: {} };
    var lines = String(src)
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    var html = renderBlocks(lines, ctx);
    return { html: html, toc: ctx.toc };
  }

  var api = { render: render, renderInline: renderInline, escapeHtml: escapeHtml };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.ExprsnMarkdown = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
