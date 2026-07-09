# ADR 0002 — Cortex vision façade + FileVault image-moderation chokepoint

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-09
- **Deciders:** systems-architect (structural sign-off); Rick (product/infra decisions, 2026-07-09)
- **Tickets:** FEAT-029 (external router: 2-resident + vision model), FEAT-030 (cortex vision façade), FEAT-031 (FileVault upload chokepoint: async image moderation + tagging)
- **Extends:** ADR 0001 (cortex in-process inference façade). All of ADR 0001's invariants remain binding; this ADR adds the vision role on top of them.
- **Relates:** FEAT-023 (moderator cortex provider), FEAT-026 (skip-encrypted precedent), FEAT-027 (deferred async bridge)

## Context

FEAT-029/030/031 extend the ADR 0001 façade with a third model role — **vision** — and
wire it to user-uploaded images at the FileVault upload chokepoint. This touches four
architect-owned surfaces: the façade contract (`services/cortex/src/client.js`), env/config
parsing (`src/config/index.js`), the `lib/llama.js` semaphore, and a cross-module
integration (FileVault → cortex → moderator). It also touches the **external** llama.cpp
router (FEAT-029), which is out-of-repo and therefore outside my platform-repo sign-off
authority — my ruling on FEAT-029 is advisory.

Findings from the code (`engine/agent.js`, `engine/jobs.js`, `lib/llama.js`, `lib/cache.js`,
`lib/promptLog.js`, `src/config/index.js`, the moderator `ai-providers/*` + agent framework,
the FileVault upload path, and the timeline/spark attachment paths):

1. **prompt_logs is already out of reach.** `logPrompt()` is imported and called **only** in
   `engine/jobs.js` (the flow layer) — five call sites, all in jobs. Neither `engine/agent.js`
   nor `lib/llama.js` references it. Because ADR 0001 binds the façade to the inference layer
   and forbids `jobs.js`, a vision call routed through `lib/llama.chatComplete` (or an
   inference-layer helper) **cannot** write image bytes to `cortex.prompt_logs`. This property
   is load-bearing for privacy and it is confirmed — but only for as long as the vision helper
   stays out of `jobs.js` and never calls `logPrompt`.

2. **Redis never sees image bytes.** `chatCacheKey` sha256-hashes `{model, messages, opts}`
   into the KEY (bytes not recoverable from a hash) and `cacheSet` stores the assistant
   **response** message (text) as the VALUE. The proposed path calls `lib/llama.chatComplete`
   directly, which has **no** cache at all (the cache lives in `agent.complete`). On both the
   direct path and the cached path, image base64 never persists as a Redis value.

3. **The semaphore serializes everything.** `withSlot` in `lib/llama.js` is a single global
   pool (`CORTEX_LLM_CONCURRENCY`, default 2) in front of every `chatComplete`. A vision call
   is slower and, under a queue of async image jobs, would occupy both slots and starve
   interactive text chat. Vision and text have different QoS (interactive vs async batch) and
   must not share one queue.

4. **FileVault is a real chokepoint — for uploaded attachments, not for "all images."**
   Timeline (`routes/attachments.js` → shared `attachmentService` → `POST /api/files`) and
   spark (`services/uploadService.js` → `POST /api/files/upload`) both use `memoryStorage` and
   ship bytes to FileVault; they store only pointers. FileVault's `uploadService.isImage()` and
   its encryption flag are both available at the point the buffer is in memory. **Gaps:**
   avatars are `avatarUrl` **string** references (`auth` `User.avatarUrl`, `nexus`
   `Group.avatarUrl`, Joi `uri()`) — external URLs, not platform-stored bytes; live recordings
   write ffmpeg output to disk (`worker.js` `outputPath`), not FileVault, and are video anyway;
   atproto ingests Bluesky blobs through its **own** moderator pipeline, not FileVault. So the
   "one integration" premise holds for the primary risk surface (posts, DMs, group files,
   comments) but is **not** universal and must not be described as such.

5. **The moderator has two image sub-systems, one of them dead.** `AIProviderFactory` +
   `moderateContent` is the wired, text-shaped path (FEAT-023 added a text-only `cortex`
   provider there). The `agentFramework` `ImageModerationAgent` defines the right shape
   (`analyzeImage({imageUrl})`) but is **not** wired into `moderateContent` today (verified).
   FEAT-031 must not silently depend on dead wiring, and must not push image verdicts through
   the text-shaped `analyzeContent`.

6. **Router memory has thin margin.** FEAT-029's own measurements put co-residency at ≈24.3 GB
   against a ≈25.8 GB Metal working set (~1.5 GB margin) and note auto-fit already mis-estimated
   once (`kIOGPU…OutOfMemory` poisons the Metal backend — a hard failure). Halving the brain
   `ctx-size` 16384→8192 to buy that margin degrades **every** existing cortex feature that
   relies on long context (the 12-iteration agent loop with `MAX_TOOL_RESULT=16000` char tool
   results; the CS persona that inlines up to 8000 chars of KB). Moderation prompts are small
   and unaffected. The image work is **async** (FEAT-031 is a Bull worker), so it is not waiting
   on interactive latency.

## Decision

**APPROVED-WITH-CHANGES for all three tickets** (FEAT-029 advisory; FEAT-030/031 binding).

### 1. Model routing — the façade owns model selection; capability is preflighted

- Add **`CORTEX_VISION_MODEL`** to the `cortex` config block in `src/config/index.js` (no
  default, or default to the FEAT-029 model name once it exists). Vision is a distinct role
  alongside `brainModel`/`judgeModel`; do not overload `brainModel`.
- The façade **owns** the model choice. `describeImage(buffer, {mime})` and
  `moderateImage(buffer)` take **no** model parameter — a caller must not be able to point
  vision at a text-only model. This mirrors how `judge()` pins the judge model internally.
- **Preflight capability check (required, fail-closed).** Before the first vision inference
  (lazily, and re-used for the process; also exposed via `health()`), the façade calls
  `listModels()` and asserts the configured `CORTEX_VISION_MODEL` (a) exists and (b) has
  `image` in `architecture.input_modalities`. If `CORTEX_VISION_MODEL` is unset, names a
  model the router does not have, or names a model without `image` modality → a **typed**
  `CortexVisionUnavailableError`. `moderateImage` fails **closed** on it; `describeImage`
  fails **soft**. Memoize the positive result (invalidate on a router failure / model 404 at
  inference time) so `/models` is not re-fetched per call.

### 2. Façade invariants — separate slot pool, generous async timeout, ADR 0001 preserved

- All ADR 0001 invariants carry over verbatim: bind to `engine/agent.js` / `lib/llama.js`
  inference only, **never** `engine/jobs.js` / `../models` / `../queues`; evaluate
  `CORTEX_ENABLED` **before** the lazy require (fail closed); bounded timeout.
- **Separate vision semaphore pool.** `withSlot` must become pool-aware (a named/keyed pool),
  with vision on its own pool `CORTEX_VISION_CONCURRENCY` (default **1**) distinct from
  `CORTEX_LLM_CONCURRENCY`. Rationale: a queue of async image jobs must never occupy the
  interactive text slots (finding 3). If the router is co-resident (FEAT-029), keep the
  combined ceiling conservative — a single Metal GPU does not parallelize two large models
  well; default vision concurrency 1.
- **Timeout posture: vision is off the request path, so its timeout is generous, not tight.**
  ADR 0001's ~5s publish-path budget applies to the *synchronous* text moderation path. Vision
  runs only in the FEAT-031 async worker, so use a separate `CORTEX_VISION_TIMEOUT_MS`
  (default ~**60000**, ceiling ~120000) — long enough to absorb a warm vision completion and a
  co-resident GPU under load, still well below `chatComplete`'s 600s transport timeout.
  **Constraint:** `describeImage`/`moderateImage` must **not** be called on any synchronous
  request path. If a future caller wants synchronous vision, that is a new ADR.

### 3. Data-at-rest / privacy — bytes never persist; EXIF stripped before inference

- **prompt_logs:** the vision helper routes through `lib/llama.chatComplete` (or an
  inference-layer function) and **must never** call `logPrompt` or live in `engine/jobs.js`
  (finding 1). If any vision telemetry is wanted, log only a content **sha256 digest** +
  dimensions + mime + latency — never the base64, never a data URI.
- **Winston:** no error/info path may log the `messages` array, the `image_url`, or the data
  URI. `chatComplete`'s error string already logs the *response* body (safe); ensure new
  error paths log `model` + HTTP status + byte length, not the request body. The moderator
  provider's logger must not log the buffer.
- **Redis:** confirmed safe (finding 2). Prefer the direct `chatComplete` path (no cache).
  Keying `moderateImage` by content hash for idempotent-verdict caching is *permitted and
  beneficial* — but only the hash (key) and the text verdict (value) may persist; image bytes
  must never be a Redis value. VERIFY checks a Redis dump contains no base64.
- **EXIF/GPS:** `sharp` normalization must `.rotate()` (auto-orient from EXIF) **before**
  dropping metadata, and must **not** call `.withMetadata()` — re-encoding via `toBuffer`
  drops EXIF/GPS. Add `limitInputPixels` (decompression-bomb guard) and a max-edge downscale
  before the buffer ever reaches the model.

### 4. Vision provider placement — cortex owns inference, moderator owns the verdict

- **Cortex is the single owner of vision inference** (FEAT-030 façade), exactly as it owns
  text inference. Moderator does not re-implement vision.
- The **moderator `cortex` provider gains `analyzeImage`**, delegating to `cortex.moderateImage`,
  and the **same `CORTEX_MODERATION_MODE` off|shadow|enforce gate governs IMAGE verdicts** —
  do **not** invent a second gate and do **not** create an ungated image path. An image verdict
  is exactly as safety-critical as a text verdict and fails **closed** (ADR 0001 Consequence 4).
- FEAT-031's worker splits the two concerns:
  - **Tags/alt-text:** worker → `cortex.describeImage` **directly**, fail **soft** (empty tags,
    record job error). Not a moderation concern, so it does not go through moderator.
  - **Verdict:** the verdict, review queue, and audit trail stay **moderator-owned**. The worker
    hands the image to moderator's image-moderation entry, which runs the cortex provider's
    `analyzeImage` through the **same ruleEngine + review-queue + audit** that text verdicts use,
    gated by `CORTEX_MODERATION_MODE`.
- **Explicitly rejected:** routing image verdicts through `AIProviderFactory.analyzeContent`
  (text-shaped); and silently relying on the currently-dead `ImageModerationAgent` wiring.
  Wiring image moderation into moderator's verdict pipeline is a **moderator-owned sub-ticket**
  with the moderator owner's sign-off (which internal path — `agentFramework` vs a
  `moderateContent` image branch — carries verdict→queue→audit, and that it honors the mode
  gate), **not** something the FileVault worker open-codes. File it as a sub-ticket of FEAT-031.

### 5. Chokepoint — honest scope, named gaps

- The chokepoint premise **holds for user-uploaded attachment images** (posts, DMs, group
  files, comments) — the primary risk surface — because those bytes funnel through FileVault
  (finding 4). FEAT-031 must state this scope explicitly.
- **Named gaps that FEAT-031 does not cover** (file follow-up tickets, do not leave implicit):
  avatar images *if/when* an upload path stores bytes (today they are external `avatarUrl`
  references and out of scope); live stream frames/thumbnails/recordings (disk, video, out of
  scope for an image model); atproto blobs (already moderated via their own pipeline). The
  "one integration" premise is sound for MVP scope but must not be overstated as "all images."

### 6. Failure + backpressure — retries safe, pending-visibility is a product decision

- **Async worker runs separately** from the gateway (platform rule: Bull workers are separate
  processes). Add a `worker:filevault-moderation` (or equivalent) root alias and register it;
  dba co-signs the queue mechanics (Bull on shared Redis, DLQ).
- **Retries:** image moderation **is idempotent** (same bytes → same verdict), so unlike
  `cortex-tasks` (`attempts:1`, non-idempotent agent work) it is safe to retry. Use
  `attempts: 3–5` with `backoff: { type: 'exponential', delay: 30000 }` so a router-down /
  53s model-swap window is survived; after exhaustion, move to failed and record the error on
  the file record. `describeImage` on exhaustion → leave tags empty, do not block.
- **Backpressure:** if the router is down / swapping / the queue backs up, jobs wait and retry
  (idempotent — no data loss); the file simply stays in a **pending-moderation** state. Surface
  stuck/failed jobs to admins (DLQ + a queue-depth alert).
- **Pending visibility is the real safety question and it is a PRODUCT decision.** Async
  moderation means there is a window where the image is stored but not yet judged. "Upload
  latency unchanged" (write path) is **not** the same as "unmoderated content is not visible"
  (read path). FEAT-031 must define, per surface, whether an image is (a) held **pending**
  until the verdict resolves (fail-closed visibility; strong but adds latency-to-visibility on
  the high-risk surfaces) or (b) visible immediately with async takedown (weak; unmoderated
  content briefly visible). **Default for a safety control should be fail-closed-pending on the
  sensitive surfaces.** At minimum the file record must carry a pending/failed moderation state
  and the verdict must be able to **retroactively hide/remove**. This choice is product-manager
  + Rick; I flag it as a required acceptance criterion, not an implementation detail.

### 7. FEAT-029 — advisory: prefer LRU swap + batching over co-residency

FEAT-029 is the external router and outside my platform-repo authority, so this is advice, not
a gate. **I disagree with the co-residency choice and recommend the alternative — Rick decides.**

- Halving the brain `ctx-size` 16384→8192 is **not free**: it degrades every existing cortex
  feature that relies on long context (the 12-step agent loop with 16000-char tool results; the
  CS KB inlining). Moderation prompts are unaffected, but agent/task/chat quality regresses.
- Because the image work is **async**, the ~53s swap penalty is invisible to users. Therefore
  **`MODELS_MAX=1` + LRU swap + batching the async image queue** (drain many image jobs while
  the vision model is resident, then swap back to the brain) is the better trade: it is
  **OOM-proof** (never two big models resident — no `kIOGPU…OutOfMemory` poisoning the Metal
  backend), it **preserves the brain's full 16384 ctx** and all existing feature quality, and
  the swap cost lands only on batch work nobody is waiting on. Co-residency trades a hard-OOM
  risk (only ~1.5 GB margin, auto-fit already wrong once) **plus** universal ctx degradation for
  faster latency on work that is already async — a poor trade.
- **If Rick keeps co-residency anyway**, the binding conditions are: an explicit **measured**
  memory budget (not auto-fit); a hard guard/alert on wired memory vs the Metal working set;
  documented rollback (revert `MODELS_MAX`, restore `ctx-size`); and **regression-testing the
  agent/CS features at the reduced 8192 ctx** before FEAT-030/031 depend on it. Add queue
  batching regardless (to bound GPU contention when co-resident, or swap thrash when not), and
  the separate vision semaphore pool (Decision 2) becomes more important under GPU contention.

## Consequences

1. **ADR 0001 stays intact.** Vision is added behind the same façade, same flag gate, same
   inference-layer-only binding, same fail-closed/fail-soft split. The moderator→cortex→moderator
   cycle remains structurally impossible (façade still never touches `jobs.js`).
2. **Interactive text is protected.** The separate vision slot pool means async image jobs
   cannot starve interactive chat/moderation on the shared router.
3. **Privacy holds by construction, not by discipline.** Image bytes cannot reach prompt_logs
   (structural), cannot reach Redis as a value (structural), and EXIF/GPS is dropped before
   inference. VERIFY asserts all three.
4. **Verdict stays in moderator.** Rules, review queue, audit, and the `CORTEX_MODERATION_MODE`
   gate govern image verdicts identically to text — no bespoke, ungated verdict path in the
   FileVault worker.
5. **Coverage is honest.** FEAT-031 covers uploaded attachments; avatar-upload and
   live-thumbnail coverage are follow-up tickets, filed not implied.
6. **Ownership handoffs.** Config keys (`CORTEX_VISION_MODEL`, `CORTEX_VISION_CONCURRENCY`,
   `CORTEX_VISION_TIMEOUT_MS`) land in `src/config/index.js` (architect-owned) with `.env.example`
   entries. The new Bull queue + worker alias + DLQ are **dba** mechanics (co-sign). The
   moderator image-verdict wiring is a **moderator-owned** sub-ticket. qa-specialist owns the
   accuracy benchmark for enforce-mode image verdicts. No new externally-mounted route today; if
   FileVault gains a moderation-status field/endpoint, reflect it in `API_SURFACE.md`. Add the
   "vision role + FileVault image chokepoint" note to `ARCHITECTURE.md` when FEAT-031 lands.
7. **FEAT-029 is external.** It changes no repo file under my sign-off; my ruling there is
   advisory and Rick owns the infra call.

## Required changes (binding, in priority order)

1. **Façade owns the model; preflight capability.** `describeImage`/`moderateImage` take no
   model arg. Preflight `CORTEX_VISION_MODEL` against `GET /models`
   `architecture.input_modalities` (`image` required); unset/absent/text-only → typed
   `CortexVisionUnavailableError`; `moderateImage` fails closed, `describeImage` fails soft.
   Memoize the check.
2. **Separate vision slot pool** in `lib/llama.js` (`CORTEX_VISION_CONCURRENCY`, default 1),
   distinct from `CORTEX_LLM_CONCURRENCY`; async image work must never occupy interactive text
   slots.
3. **ADR 0001 invariants preserved:** inference-layer binding only (never `jobs.js`/models/
   queues), `CORTEX_ENABLED` gate before lazy require, bounded timeout. Vision timeout is its
   own generous `CORTEX_VISION_TIMEOUT_MS` (~60s); vision is barred from any synchronous request
   path.
4. **No image bytes at rest:** never `logPrompt` from the vision path; never log `messages`/
   `image_url`/data URIs to Winston; no image bytes as a Redis value (hash-key + text-value
   only). Strip EXIF/GPS (`.rotate()` then re-encode, no `.withMetadata()`); `limitInputPixels`
   + downscale.
5. **Verdict stays moderator-owned and mode-gated:** cortex provider gains `analyzeImage`
   → `cortex.moderateImage`; image verdicts run through moderator's existing ruleEngine +
   review-queue + audit and honor `CORTEX_MODERATION_MODE` (off|shadow|enforce), failing closed.
   **Reject** `AIProviderFactory.analyzeContent` (text-shaped) and any reliance on the dead
   `ImageModerationAgent` wiring; the wiring is a moderator-owned sub-ticket of FEAT-031.
6. **Async worker + idempotent retries:** separate `worker:filevault-moderation` (registered,
   dba co-signs queue mechanics), `attempts: 3–5` exponential backoff, DLQ + depth alert. Skip
   encrypted objects (FEAT-026 precedent). Tags fail soft; verdict fails closed.
7. **Pending-visibility policy is an explicit acceptance criterion** (product-manager + Rick):
   default fail-closed-pending on sensitive surfaces; file record carries pending/failed state;
   verdict can retroactively hide/remove.
8. **Chokepoint scope stated honestly:** FEAT-031 covers uploaded attachments only; file
   follow-up tickets for avatar-upload and live-thumbnail coverage.
9. **FEAT-029 (advisory):** prefer `MODELS_MAX=1` + LRU swap + queue batching over co-residency
   to stay OOM-proof and keep brain ctx at 16384. If co-resident: measured memory budget, wired-
   memory guard/alert, documented rollback, and regression-test existing agent/CS features at
   8192 ctx before FEAT-030/031 depend on it.
