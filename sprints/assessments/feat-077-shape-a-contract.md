# FEAT-077 — Shape-A capability-façade interface contract (Architect sign-off)

**Verdict: APPROVED SHAPE-A** · systems-architect · 2026-07-27 · repo main @ 686d130 (read-only review)
Scope: Sprint 2026-11 FileVault-backend-only slice per `sprints/assessments/feat-077-capability-facade-cb.md`.
Shape B (RoomFile→token storage migration) remains **rejected** — do not build it, do not leave hooks for it.

ADR (one paragraph): Context — ShareLink/CA-token and RoomFile row-grants diverged into
three security bugs (BUG-020/026/027); Gallery (FEAT-047) needs one enforcement point.
Decision — a service-layer façade hosted in filevault with a backend-adapter registry;
FileVault adapter ships now, Live registers its RoomFile adapter later from its own module
(TASK-057), so no cross-schema SQL ever occurs. Alternatives rejected — Shape B storage
migration (L, "indirection without security", per C/B and Pass 1 closing note); no-façade
direct calls (third call-site convention, the exact drift that caused the bug lineage).
Consequences — one more shared abstraction, parity-tested per backend; TASK-055 collapses
to one `revokeByResource` call; live→filevault in-process require deepens along the
existing `roomCollab.js:22` precedent (no new coupling class).

---

## 1. Home

`services/filevault/src/services/capabilityService.js` (new file; split into
`src/services/capability/` if it grows past ~400 lines). Rationale:

- FileVault owns the `filevault` schema (ShareLink, File) — the slice's only backend is
  pure filevault data. Per-schema isolation holds: the façade **never** touches another
  module's tables.
- The RoomFile adapter (TASK-057) plugs in **without cross-schema SQL** via a backend
  registry: the façade exposes `registerBackend(resourceType, adapter)`. The adapter for
  `roomFile` will live in `services/live` (using live's own Sequelize models) and be
  registered from live's code at require/init time — same in-process direction as the
  existing `roomCollab.js → fileService` require. Dependency direction is one-way:
  consumers require filevault's façade; filevault requires nothing from live.
- Not a route, not a module: this is a service export, so the module contract
  (JSON-API-only, no listen/views/static) is untouched. No `src/modules/registry.js`
  change, no new socket namespace, no new mount.

## 2. Interface

All methods async. All failure paths **fail closed**. Plain-object params (CommonJS).

### Resource types — registry, not a growing enum

The C/B flagged the resource-type dimension as the scope-creep vector; cap it exactly here:

```js
// capabilityService exports a frozen name registry. A type is usable ONLY once a
// backend is registered for it. Unknown/unregistered type => throw CapabilityError('CAP_NOT_FOUND').
const RESOURCE_TYPES = Object.freeze({
  FILE: 'file',          // slice: FileVault adapter (this sprint)
  ROOM_FILE: 'roomFile', // reserved: TASK-057 (2026-12)
  ALBUM: 'album',        // reserved: FEAT-047/048 (name reserved ONLY — no behavior, no code)
});
```

No per-type conditionals in the façade body — type is purely a dispatch key into the
adapter map. Adding a type = registering an adapter; never editing façade internals.

### Provenance encoding

```js
// Computed by the ADAPTER at mint time from the VERIFIED resource — never accepted
// from caller input (BUG-026 lesson: metadata from the verified file, not the body).
provenance = {
  mintedBy: '<userId>',
  mintedAsOwner: true|false,           // was minter the resource owner at mint time
  mintedUnderVisibility: 'public'|'private'|null, // resource visibility at mint time (null if N/A)
}
```

### Invalidation semantics (Rick's 2026-07-13 provenance decision — normative)

- **Owner-minted capabilities survive a private-flip.** No active revocation on
  visibility change.
- **Non-owner-minted capabilities die with the visibility they were minted under** —
  enforced **lazily at authorize time** by the adapter's grant predicate (the Pass 1
  `shareGrantAllows` pattern: `visibility !== 'private' || mintedAsOwner || requester
  is owner`), NOT by a visibility-change event hook. No event bus in this slice.
- **Explicit revocation (`revoke`, `revokeByResource`) kills grants regardless of
  provenance.** revokeByResource is the "resource replaced/deleted" hammer (TASK-055's
  avatar-replace case) — it revokes owner-minted grants too.
- Denied and missing are indistinguishable to callers (same error), preserving the
  FEAT-031/BUG-020 same-404 posture.

### Methods

```js
/**
 * grant — mint a capability against a resource.
 * @param {string} resourceType   RESOURCE_TYPES.*
 * @param {string} resourceId
 * @param {string} grantorId      authenticated user minting the grant
 * @param {object} [opts]
 *   kind:        backend-defined grant kind. FileVault adapter: 'link' (ShareLink row +
 *                CA token, default) | 'file-access' (standalone CA token, no row).
 *   permissions: {read,write,delete} — adapter clamps server-side; the FileVault
 *                adapter clamps 'file-access' to {read:true,write:false,delete:false}
 *                unconditionally (inherits TASK-056; the clamp lives in shareService and
 *                the façade must not reopen it).
 *   expiresIn:   seconds (optional), maxUses: number (optional; 'link' kind only).
 * @returns {Promise<{capability: CapabilityDescriptor, credential: object, url?: string}>}
 *   credential is the secret material the caller hands out (backend-shaped; FileVault
 *   'link': {shareLinkId, token}; 'file-access': {token}). url preserves today's
 *   shareUrl shape exactly.
 * @throws CapabilityError('CAP_NOT_FOUND') if resource missing OR grantor lacks the
 *   right to mint (indistinguishable).
 */
grant(resourceType, resourceId, grantorId, opts)

/**
 * authorize — resolve + enforce in one call (there is deliberately NO resolve-only
 * public method: resolving without enforcing is how BUG-020 happened).
 * @param {string} resourceType
 * @param {object} credential    backend-shaped, opaque to the façade
 *                               (FileVault: {shareLinkId?, token} — shareLinkId present
 *                               = 'link' path incl. expiry/maxUses/use-count; absent =
 *                               'file-access' path keyed {fileId, token}).
 * @param {object} ctx           { requesterId?: string|null,   // null = anonymous link access
 *                                 requiredPermissions?: {read?:true,...} (default {read:true}),
 *                                 resourceId?: string }         // required for 'file-access'
 * @returns {Promise<{resource: object, capability: CapabilityDescriptor}>}
 *   resource is the backend's verified resource (FileVault: the File row). Streaming
 *   stays in fileService — the façade authorizes; it does not serve bytes.
 * @throws CapabilityError('CAP_NOT_FOUND') for ALL of: missing, expired, exhausted,
 *   revoked, provenance-dead, moderation-held, permission-short. One error, fail closed.
 *   (Route layers keep their current user-facing codes by mapping from
 *   CapabilityError.cause — see §4 compat.)
 */
authorize(resourceType, credential, ctx)

/**
 * revoke — revoke one capability by id, actor-checked.
 * @returns {Promise<true>} · @throws CAP_NOT_FOUND (missing or not actor's to revoke)
 * FileVault adapter: marks ShareLink revoked AND revokes the CA token (best-effort,
 * current shareService.revokeShareLink semantics verbatim).
 */
revoke(resourceType, capabilityId, actorId)

/**
 * revokeByResource — kill EVERY outstanding capability on a resource (all kinds,
 * all provenance). Platform-internal (service layer / owner-verified callers only);
 * not exposed as a raw route in this slice.
 * @param {object} [opts] { reason?: string }
 * @returns {Promise<{revoked: number}>}  — 0 is success, not an error.
 * This subsumes TASK-055: avatar/cover replace calls
 * revokeByResource('file', oldFileId, {reason:'resource-replaced'}).
 * NOTE: must revoke BOTH ShareLink-backed tokens (rows → CA revoke) AND standalone
 * 'file-access' tokens. Standalone tokens have no local row — the adapter finds them
 * via the CA token store filtered on data.fileId (tokens are minted with
 * data:{fileId, sharedBy, shareType} today, so this is queryable without schema change;
 * if the CA token service lacks a query-by-data call, ADD one to
 * services/ca/services/token — that is a CA service-layer addition, not a schema change).
 */
revokeByResource(resourceType, resourceId, opts)

/**
 * listByResource — owner's management view of live grants on a resource.
 * @returns {Promise<CapabilityDescriptor[]>} (never secret material — descriptors only)
 * @throws CAP_NOT_FOUND if requester is not the resource owner (or resource missing).
 */
listByResource(resourceType, resourceId, requesterId)

/**
 * registerBackend — adapter registration (ships in the slice; only 'file' registered).
 * Throws on duplicate type. Called by services/live at its module init for TASK-057.
 */
registerBackend(resourceType, adapter)
```

```js
CapabilityDescriptor = {
  id: string,                 // backend-scoped id (FileVault 'link': shareLink.id;
                              // 'file-access': CA tokenId; roomFile later: RoomFile row id)
  resourceType, resourceId,
  backend: 'filevault-sharelink' | /* later */ 'live-roomfile',
  kind: 'link' | 'file-access' | /* later */ 'room-grant',
  permissions: {read,write,delete},
  provenance: { mintedBy, mintedAsOwner, mintedUnderVisibility },
  expiresAt: Date|null, maxUses: number|null, useCount: number,
  revoked: boolean, createdAt: Date,
}
```

## 3. Backend-adapter contract

An adapter (registered per resourceType) implements, all async:

```js
{
  backendName: string,
  mint(resourceId, grantorId, opts)        -> {capability, credential, url?}
  authorize(credential, ctx)               -> {resource, capability}   // full enforcement:
      // existence, secret match, expiry, use-count, revocation, provenance predicate,
      // moderation gate where applicable. The façade adds NOTHING on top — enforcement
      // lives in exactly one place per backend.
  revoke(capabilityId, actorId)            -> true
  revokeByResource(resourceId, opts)       -> {revoked}
  listByResource(resourceId, requesterId)  -> [CapabilityDescriptor]
}
```

Error semantics (normative, fail-closed):
- Adapters throw `CapabilityError(code='CAP_NOT_FOUND', cause=<internal reason>)` for
  every denial. `cause` is for logs and route-compat mapping only; it must never reach a
  response body for a requester who isn't entitled to the resource.
- Any **unexpected** adapter error (DB down, bug) propagates as denial to the caller
  (fail closed) after logging with correlation context — never fail open, with ONE
  codified exception: the FileVault adapter preserves the existing CA-check rule
  verbatim (`shareService.js:149–164`) — CA **unreachable** does not kill an otherwise
  locally-valid link; explicit `TOKEN_REVOKED`/`TOKEN_EXPIRED` always denies. That rule
  is FileVault-adapter-internal, not a façade-level policy.
- Adapters must not accept provenance, ownership, or resource metadata from `opts`/
  `credential` — always derive from the verified resource (BUG-026).
- The FileVault adapter is a thin wrapper over the existing `shareService` functions
  (createShareLink/createFileAccessToken/getShareLink+accessSharedFile/
  accessFileByToken/revokeShareLink/listShareLinks) — move/rename, don't rewrite;
  the 62/62 shareGate suites are the parity harness and must stay green unmodified
  (new façade-level tests are additive).

## 4. Compatibility constraints (hard)

1. **Issued links keep working.** `share.js` URL shape
   `/filevault/api/share/:shareLinkId/download?token=<CA tokenId>` and
   `/filevault/api/share/file/:fileId/download?token=<id>` are frozen; routes keep
   their handlers and current response codes/bodies (map `CapabilityError.cause` back
   to today's error strings where routes already expose them, e.g.
   SHARE_TOKEN_REQUIRED on a missing token param — but never upgrade an existing 404
   to something more informative). `roomCollab.js` is untouched this slice (still calls
   `shareGrantAllows` via fileService — that stays until TASK-057).
2. **No new unauthenticated surface.** The façade adds ZERO routes. Existing
   share-link download routes remain the only credential-authenticated (non-bearer)
   surface, exactly as today. `revokeByResource`/`listByResource` are service-layer
   only in this slice.
3. **No schema changes — confirmed none needed.** `createShareLink` requires
   ownership (`File.findOne({id, userId})`), so every existing ShareLink and
   file-access token is owner-minted: the FileVault adapter reports
   `provenance.mintedAsOwner = true` as a derived constant — no backfill, no column.
   **Flag for the future (dba gate trigger, NOT this slice):** if Gallery/FEAT-047
   ever allows non-owner ShareLink mints, ShareLink needs persisted
   `mintedAsOwner`/`mintedUnderVisibility` columns → dba review + raw `up()`
   (db:migrate won't ALTER). File that as a TASK when FEAT-047 grooming demands it.
4. Pass 1 invariants survive verbatim: same-404 denied-vs-missing, FEAT-031 moderation
   independence, fail-closed provenance default, TASK-056 read-only clamp (which lands
   before this branch — do not fold in).
5. TASK-055 is implemented ONLY as a `revokeByResource` call once the slice lands
   (conditional pull per its ticket) — no standalone mechanism.

## 5. Explicitly out of slice

- **RoomFile adapter** → TASK-057 (2026-12, before FEAT-047). Interface hook shipped
  (`registerBackend` + reserved `roomFile` type); zero roomCollab.js changes now.
- **`album` resource type** — name reserved only; no code, no descriptor fields, no
  adapter stub (C/B scope-creep cap).
- **Cross-module consumers** — FEAT-047/048/049 (Gallery), FEAT-039 (PDS blobs),
  FEAT-055 (workflow actions) code against this contract later; nothing built for
  them now.
- **Shape B / storage migration, backfills, dual-read windows** — rejected.
- **Active revocation on visibility change / event hooks** — invalidation is
  authorize-time only, per the provenance decision.
- **HTTP exposure of revokeByResource / listByResource-for-admins** — file a FEAT if
  ever wanted; goes through API_SURFACE.md + auth review.
- Fixing `services/live/tests/roomFiles.test.js` stale assertions — separate P3 BUG
  (closeout), not this branch's problem unless it turns the branch red.

## Sign-off

APPROVED SHAPE-A as specified above. Build may start. Deviations that require
re-sign-off before merge: any new route, any schema/column change, any change to the
CA fail-open-on-unreachable rule, any façade-level per-type conditional, or any
credential/URL shape change. Record VERIFY against: parity suites green (filevault
shareGate + share routes), new façade suite covering grant/authorize/revoke/
revokeByResource/listByResource incl. provenance cases, and API_SURFACE.md unchanged
(no route delta expected).
