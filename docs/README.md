# Exprsn Platform documentation site

A fully self-contained, offline-capable static documentation site. No CDN
scripts, no external fonts, no network requests beyond same-origin fetches of
local files.

## Layout

```
docs/
  index.html              Landing page: service cards + Markdown guide cards
  exprsn-ca.html          Hand-written service pages
  exprsn-auth.html
  exprsn-timeline.html
  exprsn-prefetch.html
  database-model.html     Data-layer reference
  platform-model.html     Mermaid architecture diagrams
  glossary.html           Term definitions
  viewer.html             Markdown viewer (?doc=<id>, TOC sidebar)
  runbooks/
    secrets-and-rotation.md
    calendar-contacts-subscriptions.md
  assets/
    docs.css              Shared stylesheet (incl. viewer/markdown styles)
    markdown.js           Vanilla-JS Markdown renderer (no dependencies)
    manifest.js           Doc manifest — assigns window.EXPRSN_DOCS_MANIFEST
```

The Markdown viewer surfaces the repo's living documents (`ARCHITECTURE.md`,
`API_SURFACE.md`, `STATUS.md`, `SPRINT.md`, plans, `CLAUDE.md`, and
`docs/runbooks/*.md`). The list of documents lives in `assets/manifest.js`;
each entry is `{ id, title, description, path }` with `path` relative to the
**repo root**. To add a document, add an entry there — nothing else to build.

## Serving the site

The viewer fetches Markdown files with `fetch()`, so the site must be served
over HTTP. From the **repo root** (recommended — all documents reachable):

```bash
cd /path/to/exprsn-platform
python3 -m http.server 8000
# open http://localhost:8000/docs/
```

Serving from `docs/` also works for the HTML pages and the runbooks, but the
repo-root Markdown files (`ARCHITECTURE.md`, `STATUS.md`, ...) are then outside
the server root and the viewer will show a fetch error for them:

```bash
cd docs && python3 -m http.server 8000
# open http://localhost:8000/
```

The viewer resolves each manifest path against both roots automatically
(`../<path>` first, then the `docs/`-stripped path), so no configuration is
needed either way.

## file:// limitation

Opening the pages directly from disk (`file://...`) renders the hand-written
HTML pages fine, but the Markdown viewer cannot load documents: browsers block
`fetch()` of local files under the `file://` origin (CORS). The viewer detects
the failure and shows instructions. Use a local HTTP server as above.
