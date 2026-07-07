# Group calendar & contacts subscriptions (Nexus)

How to subscribe to a Nexus group's calendar and member contacts from a native
calendar/contacts app. This is the **supported** integration path today: plain
`GET` endpoints that return standard `.ics` (iCal, RFC 5545) and `.vcf` (vCard)
files, which every major calendar/contacts client can subscribe to natively —
**read-only**, and auto-refreshing on the client's own polling schedule. There
is no CalDAV/CardDAV protocol server (no `PROPFIND`/`REPORT`/two-way sync) — see
"Not supported yet" below.

## URLs

All routes are served by the Nexus module (`/nexus` prefix) — see
`API_SURFACE.md` (search "calendar") for the authoritative, up-to-date list.

| Purpose | Method | URL | Auth |
|---|---|---|---|
| Single event | GET | `/nexus/api/calendar/events/:id/ical` | optional token |
| Group calendar feed | GET | `/nexus/api/calendar/groups/:groupId/ical` | optional token |
| My calendar feed (events I'm attending, across groups) | GET | `/nexus/api/calendar/users/:userId/ical` | required token; `:userId` must be the caller |
| Group members as contacts (vCard) | GET | `/nexus/api/calendar/carddav/groups/:groupId/contacts?format=vcf` | optional token |

Query params on the two feed endpoints: `upcoming` (`true`/`false`, default
`true`) and `limit` (default `100`, max `500`).

"Optional token" endpoints work unauthenticated for any group whose events are
publicly visible; pass a bearer CA token (`Authorization: Bearer <token>`) to
also see events restricted to a group's members. The user calendar endpoint
always requires a token, and only lets a user fetch their own feed.

## Subscribing from a native app

These are plain HTTPS URLs, so any "subscribe by URL" flow in a calendar or
contacts app works. Where an app supports it, appending
`?token=<bearer-token>` (or the app's own auth prompt) is the only way to
reach non-public data — check the app's URL-subscription docs for how it wants
credentials.

### macOS Calendar / Contacts

1. **Calendar** → File → **New Calendar Subscription…**
2. Paste the group or user `.ics` URL above → Subscribe.
3. Set the auto-refresh interval (System will offer a dropdown: every 5 min /
   15 min / hourly / daily / weekly) — the calendar re-fetches the `.ics` on
   that schedule; it does not push live.
4. For contacts: **Contacts** app doesn't support live vCard-URL subscriptions
   directly — download the `.vcf` (`?format=vcf`) and use File → Import
   instead. Re-import to refresh (one-time snapshot, not auto-updating).

### iOS Calendar

1. **Settings → Calendar → Accounts → Add Account → Other → Add Subscribed
   Calendar**.
2. Paste the `.ics` URL (Server field) → Next → Save.
3. iOS refreshes subscribed calendars on its own schedule (not
   instant/push) — there's no user-configurable interval on iOS.

### Google Calendar

1. On the Google Calendar web UI: **Other calendars → + → From URL**.
2. Paste the `.ics` URL → Add calendar.
3. Google polls the URL periodically (typically within ~12–24h — Google does
   not expose or guarantee a faster interval for "From URL" subscriptions).

### Thunderbird (Calendar / Contacts)

1. **Calendar** → right-click the calendar list → **New Calendar… → On the
   Network → Format: iCalendar (ICS)**.
2. Paste the `.ics` URL → set a refresh interval on the next screen (this one
   *is* user-configurable) → Finish.
3. For contacts: **Address Book → Tools/File → Import…** and pick the
   downloaded `.vcf` — same one-time-import caveat as macOS Contacts above
   (Thunderbird has no live vCard-URL subscription either).

## Read-only, and why

All four endpoints are `GET`-only — there's no way to write an event or
contact back through them, by design. They're a data export, not a sync
protocol. A client can remove/re-add the subscription to force a refresh, but
cannot edit source data through this path.

## Not supported yet

Nexus does not implement the CalDAV (RFC 4791) / CardDAV (RFC 6352) verbs
(`PROPFIND`, `REPORT`, `PUT`, `DELETE`) needed for a native OS **account**
(as opposed to a read-only subscription) with two-way sync. There is a
JSON-shaped `caldav`/`carddav` sub-path under `/nexus/api/calendar` used
internally by the web app — it is not a DAV protocol implementation and native
clients cannot add it as an account. Real DAV-account support is tracked as a
follow-on slice of the FEAT-001 epic (see `sprints/BACKLOG.md` FEAT-003/004/005)
and is not part of this document.
