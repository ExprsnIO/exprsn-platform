# FEAT-001 — Cost/Benefit assessment

**Feature:** Full CalDAV/CardDAV DAV verbs for native OS account sync
**Analyst:** cost-benefit-analyzer · **Date:** 2026-07-07
**Verdict:** **Build later / smaller slice** (not reject, not build-now)
**Gate result on ticket:** `Cost/Benefit: done`

> Advisory only. This attaches the gate result and a recommended path; the
> product-manager makes the schedule/priority call and writes acceptance
> criteria.

---

## What already exists (grounded in the repo — this *lowers* cost)

The hard, reusable DAV plumbing is already built and running:

- **`@exprsn/shared` WebDAV toolkit** — `shared/middleware/webdav.js` +
  `shared/utils/webdavLockManager.js` export `parseXmlBody`, `optionsHandler`,
  `generateMultistatusXml`, `generateCollectionResponse`,
  `generateResourceResponse`, `parseDepth`/`parseDestination`/`parseOverwrite`,
  `generateProppatchResponse`, `generateLockResponse`/`parseLockRequest`,
  `sendWebDAVError`, `WebDAVLockManager`. This already solves the three things
  people assume are the hard part: routing **non-standard HTTP verbs**
  (`PROPFIND`/`PROPPATCH`/`MKCOL`/`COPY`/`MOVE`/`LOCK`/`UNLOCK`) through the
  gateway, parsing **XML request bodies**, and emitting **`207 Multi-Status`**.
- **A live reference implementation** — FileVault mounts a full WebDAV server at
  `/filevault/webdav/*` (`services/filevault/src/routes/webdav.js`; documented in
  `API_SURFACE.md` L527). It uses `router.propfind('*', ...)` etc., so the verb
  routing is *proven* against the real gateway, not theoretical.
- **iCal/vCard generation is done** — Nexus has `icalService` (+ the
  `ical-generator` dep) and ~600 lines of data-shaping in
  `services/nexus/src/services/caldavService.js` /
  `carddavService.js`: collections, calendar/addressbook properties, ctags,
  etags, sync-token helpers, event→ical and member→vCard mapping.
- **Read-only feed subscription already works today** — the GET endpoints under
  `/nexus/api/calendar` (`events/:id/ical`, `groups/:groupId/ical`,
  `users/:userId/ical`, and the `.vcf` contacts export) let any user *subscribe*
  a group calendar/contacts in macOS/iOS/Google/Thunderbird as a read-only,
  auto-updating subscribed calendar. (`services/nexus/src/routes/calendar.js`,
  API_SURFACE L459–462.)

## What is missing (this is where the cost is)

1. **CalDAV/CardDAV-specific discovery + REPORTs** the *generic* WebDAV toolkit
   does not cover: `.well-known/caldav` + `.well-known/carddav` redirects,
   `current-user-principal` / `calendar-home-set` / `addressbook-home-set`
   principal discovery, `supported-calendar-component-set`, and the
   `calendar-query` / `calendar-multiget` / `addressbook-query` /
   `addressbook-multiget` and `sync-collection` (RFC 6578) REPORTs. This is the
   bulk of the read-only DAV work — net-new property/REPORT handlers on top of
   the shared toolkit.
2. **Auth-model mismatch — the real blocker.** Native macOS/iOS Calendar &
   Contacts and Thunderbird add a DAV **account** using **HTTP Basic auth with an
   app-specific password over TLS** (Apple *enforces* SSL). But the existing
   calendar endpoints and the FileVault DAV path only accept **Bearer CA tokens**
   (`services/filevault/src/middleware/auth.js` gates on
   `authHeader.startsWith('Bearer ')`; the Nexus DAV
   `validateCalDAVCredentials()` is a stub that just `return true`). So the
   ticket's own AC — "auth model matches the existing calendar endpoints, no new
   open surface" — **collides with** "native OS account": to let a native client
   in you must bridge Basic → a CA token, i.e. build an **app-password store**.
   That is **new security surface**, and per the platform's non-negotiable
   security invariants it needs a **systems-architect** design and **dba**-owned
   storage before it can be called cheap.
3. **Two-way write** (client `PUT`/`DELETE`) needs an iCal **parser** — Nexus
   only has the write-only `ical-generator`, no parser dependency — plus write
   mapping from an inbound `.ics` into `Event`/attendee/RSVP/recurrence rows.
   And **CardDAV two-way is semantically N/A here**: the "contacts" are *derived
   group members* (membership rows + auth profiles), not user-writable address
   cards, so a client vCard `PUT` has nowhere sensible to land. Two-way CardDAV
   should be dropped from scope.
4. **Real incremental sync** needs a **persisted change-journal**. The current
   sync token is `base64(Date.now())` (`caldavService.generateSyncToken`), which
   cannot express deletions and resets every call — not a valid
   `sync-collection` cursor. A robust token needs a new table in the **`nexus`
   schema** → **dba** coordination. (It's a *new* table, so sync-based
   `db:migrate` creates it fine — the ALTER-on-existing-table trap does **not**
   apply here — but the dba should confirm.)
5. **The existing scaffolding is untested and partly broken**, so it cannot be
   credited as "already done":
   - Mongo-style operators in Sequelize where-clauses
     (`caldavService.js:153/154/160/183/184/188`, `carddavService.js:181`:
     `$gte`/`$lte`/`$gt`) — Sequelize 6 needs `Op.gte`; these bare keys silently
     no-op, so the sync-since-token / time-range filters don't actually filter.
   - `getEventsForSync` returns `ical: null // populated on demand` — the sync
     REPORT doesn't return calendar data inline.
   - `validateCalDAVCredentials` → `return true` placeholder.

## Sizing

- **The ticket as written (full two-way RFC-4791 CalDAV *and* RFC-6352 CardDAV,
  matching auth, verified on native clients) is realistically XL, not L.** Per
  `README.md` an **XL must be broken down before it can reach `ready`** — that
  alone forces a slice.
- Read-only DAV **sync-down** account (discovery + query/multiget +
  `sync-collection` with a real token table, reusing the shared toolkit +
  FileVault as reference): solid **L** on its own.
- Basic-auth **app-password bridge**: separate **M–L**, security-sensitive,
  architect + dba gated.
- Full two-way (`PUT`/`DELETE` + iCal parser + write mapping + recurrence +
  deletion sync): pushes the whole thing to **XL**.

## Release-engineering dependency (why it can't be *done* this cycle anyway)

Apple enforces SSL for native CalDAV/CardDAV accounts, so the AC "verified by
adding the account on at least one native client" **cannot be met until real
edge TLS exists** — that's `TASK-004`, itself **blocked on a staging host/target
that does not exist in this in-house setup** (see the active sprint's "Out of
scope"). So FEAT-001's Definition of Done is unreachable this cycle regardless of
build effort — a strong argument for *build later*.

## Value

- **Who benefits:** group members who want a group calendar/contacts to appear
  as a native OS **account** (writable) rather than a read-only subscription.
  Nice for stickiness/engagement.
- **How much:** modest at MVP. **Read-only subscription already delivers ~80% of
  the value today** via the existing `.ics`/`.vcf` URLs. FEAT-001's *delta* is
  (a) it showing as a writable account and (b) contacts sync — a small MVP
  audience, and contacts two-way is N/A for this data model.
- **Priority/leverage:** already groomed **P3**; it **unblocks no other ticket**.
  The platform's stated gap-to-ship is release engineering, not calendar sync.

## Recommendation — cheaper alternative + smaller first slice

**Build later / smaller slice.** Sequence:

- **Slice 0 (S, do first — arguably a TASK, not a FEAT):** *document the existing
  `.ics`/`.vcf` subscription URLs as the supported native-app path*, and either
  fix or delete the broken JSON "DAV" scaffolding (`$gte`→`Op.gte`, drop the
  `ical:null` placeholder, remove the `validateCalDAVCredentials` stub) so it
  stops masquerading as protocol support. ~½ day; closes the actual user need.
- **Slice 1 (L — the real FEAT-001 first cut): read-only DAV *sync-down*
  account.** `.well-known/caldav`+`/carddav`, principal + calendar-home /
  addressbook-home PROPFIND, `calendar-query`/`multiget` +
  `addressbook-query`/`multiget` REPORT, and a **persisted `sync-collection`
  token**, reusing the `@exprsn/shared` WebDAV toolkit + FileVault as the
  reference. Result: a native account can *add and sync down* a group calendar +
  contacts read-only — the headline "it's a real account" win — with **no**
  inbound-write parsing. Gated on Slice 2 for native-client auth.
- **Slice 2 (M–L, separate ticket, architect + dba gated): Basic-auth
  app-password bridge** — the actual native-account enabler. New auth surface +
  app-password store; sequence with Slice 1's verification.
- **Slice 3 (defer / likely drop): two-way `PUT`/`DELETE` for CalDAV only** —
  iCal parser + write mapping + recurrence/deletion sync. CardDAV two-way is out.
  Post-MVP, only on real demand.

Start Slice 0 now (cheap, unblocked, no TLS dependency). Schedule Slices 1–2 for
**post-staging**, when real edge TLS (`TASK-004`) makes native-client
verification possible.

## Handoffs

- **systems-architect** — the app-password / HTTP-Basic bridge is **new auth
  surface**, and `.well-known` + principal routing touches gateway wiring; get
  structural sign-off before Slice 1/2.
- **dba** — the persisted `sync-collection` token journal (nexus schema) and the
  app-password store are **new tables** (`db:migrate` sync creates new tables
  fine — no ALTER-on-existing trap — but confirm).
- **qa-specialist** — per-native-client (macOS / iOS / Thunderbird) verification
  is real, recurring test effort with per-client quirks; do not assume the
  non-blocking suite covers it.

## Sources (interop reality)

- [Apple Calendar / CalDAV auth (Apple Developer Forums)](https://developer.apple.com/forums/thread/53284)
- [CalDAV & CardDAV for macOS/iOS (mailbox.org KB)](https://kb.mailbox.org/en/private/addressbook-and-calendar/caldav-and-carddav-for-mac-os-and-ios/)
- [Demystifying CalDAV — Apple Calendar integration (Aurinko)](https://www.aurinko.io/blog/caldav-apple-calendar-integration/)
