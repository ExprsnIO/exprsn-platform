# FEAT-036 — Full AT-Proto Personal Data Server (PDS) · cost/benefit assessment

- **Analyst:** sr-developer (inline; the cost-benefit-analyzer run was lost to a session limit)
- **Date:** 2026-07-13
- **Tickets:** FEAT-036 (epic) · FEAT-037 sessions · FEAT-038 repo/MST · FEAT-039 blobs · FEAT-040 outbound firehose · FEAT-041 app-view
- **Verdict:** **BUILD LATER / SMALLER SLICE.** Do not port `exprsn-bluesky`. Do not schedule the full PDS this cycle. Ship the **bridge slice** instead — it is ~90% cheaper and captures most of the realistic value.

---

## 1. The finding that invalidates the epic's premise

**`/Volumes/Storage/exprsn-bluesky` is not a real PDS. It is a PDS-shaped mock, and it is not
liftable.** The epic was filed on the assumption that a full PDS already exists and "just" needs
porting into the module contract. That assumption is false.

Evidence, from the source:

- **Its CIDs are fake.** `services/repositoryService.js:308-314`:
  ```js
  generateCID(value) {
    // Generate a simple hash as CID
    // In production, use proper IPLD/DAG-CBOR encoding and CIDv1
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(value));
    return `baf${hash.digest('hex').substring(0, 56)}`;
  }
  ```
  That is `sha256(JSON.stringify(x))` with the string `"baf"` glued on the front. It is not a CIDv1 —
  no multicodec, no multihash, no DAG-CBOR. **The code says so itself.**
- **There is no Merkle Search Tree and there are no signed commits.** A grep for
  `MST|merkle|signCommit|formatCommit` across `services/`, `routes/`, `models/` returns **nothing**.
- **The official SDK is declared but never imported.** `package.json` lists `@atproto/repo`,
  `@atproto/crypto`, `@atproto/xrpc-server`, `@atproto/api`, `@atproto/identity` — and a grep for
  `@atproto/` across the source finds **zero imports**. `repositoryService.js` requires only `crypto`,
  Sequelize models, and Redis.

So what `exprsn-bluesky` has is Postgres tables *named* `repository` / `record` / `blob`, `at://` URIs,
and hand-hashed pseudo-CIDs. **It would not federate.** A relay cannot verify its commits, because
there are none. Its README's "production-ready" claim does not hold for the repo layer.

**Porting it would produce a convincing-looking PDS that no relay will accept** — the worst possible
outcome, because the failure is invisible until you try to federate.

---

## 2. The corresponding good news: the platform is *further along* than the reference

The real primitives are already in the platform, and already in real use:

- **Root `package.json` already carries** `@atproto/crypto ^0.4.1` (:55), `@ipld/car ^5.3.0` (:59),
  `@ipld/dag-cbor ^9.2.0` (:60), `multiformats ^13.1.0` (:102) — i.e. exactly the DAG-CBOR / CID /
  CAR primitives a real repo layer needs. **`exprsn-bluesky` has none of them wired.**
- **They are genuinely used**: `services/atproto/src/labeler/labelSigner.js` + `keyManager.js` sign
  real AT-Proto labels, and `src/xrpc/subscribeLabels.js` runs a real raw-WS firehose *server* through
  the gateway upgrade path. `src/xrpc/queryLabels.js`, `resolveDid.js`, `feed.js` and `src/wellknown.js`
  are mounted at origin root via the sanctioned `rootApp` hook (`src/gateway.js:111-114`).
- What is genuinely absent is only the **repo layer**: there is no record/commit/blob model in
  `services/atproto/models/` (it has `Label`, `InboundLabel`, `ExternalLabeler`, `LabelerIdentity`,
  `FirehoseCursor`, `UriCaseMap`, `UserDid` — and nothing else).

**Correction to FEAT-038's premise:** the ticket says MST/CID storage "has no existing platform
analogue," implying a hand-roll. It should not be hand-rolled. **`@atproto/repo` is the official SDK
and does MST + signed commits + CAR export.** The correct instruction is *"build on `@atproto/repo`"*,
which turns FEAT-038 from "invent a Merkle search tree" (very high risk) into "wire the SDK to a
Postgres blockstore" (L, moderate risk). This is the single biggest cost correction in the assessment —
and it is only visible because the reference implementation's shortcut was caught.

---

## 3. Value — genuinely weak, and this is the crux

Be honest about what a PDS buys:

**What the platform is today:** an *ingest + labeler*. It consumes the Bluesky firehose, runs content
through the moderation pipeline, and publishes signed labels the network can consume. That is a
coherent, defensible, and **cheap** position: we influence the network without being responsible for
hosting it.

**What a PDS makes us:** an *origin* of federated content. That buys:
- Exprsn users become first-class AT-Proto accounts, readable by any Bluesky client.
- Exprsn content federates outward.

**What it costs beyond engineering:**
- **Every repo write and blob upload becomes new UGC ingress** that must route through
  `moderateContent` (FEAT-009 / TASK-019 / ADR-0004, which explicitly requires the invariant to cover
  *every* content-byte-ingress site). We become **publicly accountable for content we publish to the
  network** — a materially different liability posture from labelling someone else's.
- FEAT-041 (app-view) is already filed **P3** precisely because *the platform has its own SPA* for
  profiles/feeds/graphs. That is a tacit admission that most of the PDS surface duplicates something
  we already have.

**Who is the user?** No ticket, sprint, or STATUS item asks for Exprsn identities to federate. The
platform's stated gap-to-ship is release engineering (R1–R6, with **R5 load/throughput still
BLOCKING**). On the evidence in the repo, **a full PDS is a technology goal, not a product goal.**

---

## 4. The cheaper slice that captures most of the value

**The platform can already act as an AT-Proto *client*, and already models external DIDs.** Both halves
of a bridge exist:

- `services/atproto/src/identity/pdsClient.js` — "Minimal PDS XRPC client … create a session, publish
  a record, drive the PLC operation". It already does `createSession` **against someone else's PDS**.
- `services/atproto/models/UserDid.js` — already stores `didExprsn`, `didWeb` (+ verified + proof), and
  **`didPlc`** (:20-25). Linking a user to an *external* AT-Proto identity is already modelled.

**Recommended slice — "bridge account" (M, not XL):** let an Exprsn user **link their existing
Bluesky/PLC account** and cross-post to *their own* PDS, rather than Exprsn *being* a PDS. This gives
users federated presence without the platform hosting a repo, running a firehose, or owning the
moderation liability of published content. Most of the user-visible value; a fraction of the cost;
**zero MST.**

If, after shipping the bridge, real demand for platform-hosted identities appears, the full PDS can be
built then — on `@atproto/repo`, with the bridge as evidence that anyone wants it.

---

## 5. If the full PDS is built anyway — corrected sizing

| slice | filed | corrected | note |
|---|---|---|---|
| FEAT-037 sessions | L | **L** | The real risk, and it is **not** the AT-Proto part. Per `sprints/assessments/FEAT-059.md`, **zero of 14 modules enforce token scope today**. A PDS mints its own JWTs; if those do not derive from and die with the CA token, the platform gains a **second identity system that outlives revocation**. Architect + security. **Hard-blocked on FEAT-060.** |
| FEAT-038 repo/MST | XL | **L** | *Only if built on `@atproto/repo`.* XL and high-risk if hand-rolled. **Do not port `exprsn-bluesky`'s repositoryService — it is the mock.** |
| FEAT-039 blobs | M | **S–M** | Genuinely cheap: FileVault already has storage, thumbnails, and an image-moderation queue. The one trap is the ticket's own warning — **a CID is not a credential** (BUG-027 class). |
| FEAT-040 outbound firehose | L | **M–L** | `subscribeLabels.js` is a working precedent for a raw-WS server through the gateway. Needs a replayable sequence log. Single-gateway assumption holds for MVP. |
| FEAT-041 app-view | L | **drop / defer** | Duplicates the SPA. Already P3. Genuinely droppable. |

**Epic total: still XL.** Sequenced strictly after FEAT-060 (see below).

---

## 6. Dependency on FEAT-059/060 — real, and blocking

FEAT-037 requires the AT-Proto JWT to inherit CA scope and die on CA revocation. But the FEAT-059
assessment established that **no module enforces CA token scope today**, and nine modules have no org
concept at all. Standing up a PDS *before* FEAT-060 means the derived-credential rule has nothing to
derive from — you would be bolting a federated auth surface onto an authorization model that is not yet
scoped. **FEAT-036 must not start before FEAT-060's Slice A/B.** That ordering is real, not soft.

---

## 7. Verdict

**BUILD LATER / SMALLER SLICE.**

1. **Reject the port.** `exprsn-bluesky` is a PDS-shaped mock (fake CIDs, no MST, SDK declared-unused).
   Mark it in the ticket so nobody "just ports it" — the failure mode is silent.
2. **Ship the bridge slice (M)** — link an external `did:plc` account and cross-post via the existing
   `pdsClient` + `UserDid.didPlc`. Most of the value, a fraction of the cost.
3. **Defer the full PDS** behind FEAT-060 and behind evidence of demand. If built, build FEAT-038 on
   **`@atproto/repo`**, never by hand, and drop FEAT-041.

**Handoffs:** **systems-architect** — a PDS makes the platform an origin of federated content: new
security, moderation, and liability surface (structural sign-off before any slice). **dba** — the repo
blockstore is new tables (safe under sync `db:migrate`). **qa-specialist** — "a real relay accepts our
commits" is the only acceptance test that means anything; a mock will pass everything else.
