# ADR 0005 — Cortex multi-backend inference (Ollama as an async-only secondary) + video moderation & AI tagging

- **Status:** Accepted (APPROVED-WITH-CHANGES) — 2026-07-14. Scope is **decided by Rick** and is not
  re-opened here: Ollama-in-Docker is an automatic secondary backend behind a circuit breaker; video
  moderation + AI tagging covers **FileVault uploads AND Live recordings**; a new Bull worker carries it;
  everything Ollama touches is **queue-only**. This ADR designs that, names the three places the stated
  design is unsafe as written (§8), and **amends ADR 0002 §5** (which excluded Live recordings).
- **Date:** 2026-07-14
- **Deciders:** systems-architect (structural sign-off: the driver contract, the failover/breaker
  semantics, the queue-only invariant, the composition-layer worker placement); **dba co-sign required**
  for the new `live.recording_moderation` side table + the new Bull queue + the FileVault `file_moderation`
  reuse; **Rick** owns the infra call in §8.1 (8 GB co-location) and the product call in §6.3 (recording
  pending-visibility); qa-specialist owns §7.2 (per-model threshold calibration — **blocking for enforce**).
- **Tickets:** FEAT-072 (backend driver abstraction + Ollama secondary + breaker), FEAT-073 (video
  moderation + tagging — FileVault), FEAT-074 (video moderation + tagging — Live recordings),
  TASK-039 (Ollama container + model provisioning + firewall posture), TASK-040 (streaming
  `retrieveToFile` in FileVault storage), **BUG-032 (the Live recording state machine does not persist —
  blocks FEAT-074)**, TASK-041 (`worker:live` recording-completion signal — blocks FEAT-074),
  TASK-042 (per-model risk-threshold calibration), TASK-043 (audio-track moderation gap),
  TASK-044 (recording playback route + moderation gate).
- **Extends:** ADR 0001 (in-process façade — every invariant carries over), ADR 0002 (vision façade +
  FileVault chokepoint — **amended, see §5**), ADR 0004 (moderation routing: side tables, terminal-state
  ladder, pre-create invariant — the pattern this reuses).
- **Relates:** FEAT-029 (llama.cpp router, external, shipped swap-first), FEAT-031 (the image lane this
  generalizes), BUG-016 (stale-jobId requeue), BUG-018/BUG-021 (bytes-change ⇒ re-establish state),
  BUG-022 (content-hash compare-and-set), TASK-023 (accuracy benchmark), TASK-026 (shadow/enforce rung).

---

## Context

Three things are being added at once and they interact:

1. **A second inference backend.** Ollama (a vision-capable Qwen, CPU-only, in Docker) becomes an
   automatic secondary when the llama.cpp router is unavailable, with a circuit breaker and a cooldown
   before primary is retried.
2. **Video moderation + AI tagging**, over FileVault video uploads and Live recordings.
3. **A new Bull worker** to carry it.

The hard constraint that governs every other choice: **Ollama runs on the same 8 GB / 4 vCPU CPU-only
droplet as everything else.** A single 1024px frame costs ~10–60 s of CPU there. That is two to three
orders of magnitude outside any synchronous request budget on this platform (ADR 0001 §6 pinned the
moderation publish path at ~5 s). So "never call Ollama synchronously" cannot be a convention in a code
comment — it has to be something a developer cannot violate by accident.

### Findings from the code (all verified in this repo, not assumed)

1. **`lib/llama.js` is not a driver, it is the llama.cpp router.** It hard-codes `GET /models`,
   `POST /models/load`, `POST /models/unload`, `GET /health`, and `modelSupportsImages()` reads
   `entry.architecture.input_modalities`. Ollama has **none** of those. It has `/api/tags`, `/api/show`
   (whose `capabilities` array carries `"vision"`), `/api/ps`, `/api/pull`, and an OpenAI-compatible
   `/v1/chat/completions`. Both `assertVisionCapable()` and `ensureVisionResident()` in
   `engine/vision.js` therefore **break outright** against Ollama: the first because
   `input_modalities` does not exist, the second because it polls a `status: 'loaded'|'unloaded'` field
   that does not exist and nudges a `/models/load` endpoint that does not exist. A driver abstraction is
   not a nicety here; without it the Ollama path cannot even preflight.

2. **Residency is a llama.cpp-specific concept and it has leaked into the engine.**
   `ensureVisionResident()` exists for exactly one reason: the router runs `MODELS_MAX=1`, so a preceding
   text call evicts the VL model, and a completion sent mid-load returns an **empty body** rather than
   blocking. Ollama's model is the opposite: it auto-loads on first request, holds the model for
   `keep_alive`, and `/api/pull` fetches it from a registry. Porting `ensureVisionResident`'s poll-and-nudge
   loop onto Ollama would be pure cargo cult. The driver must **own** residency, and the llama.cpp
   semantics must not appear anywhere in `engine/vision.js` after this lands.

3. **Model ids are backend-specific and the code passes them through raw.** `engine/vision.js` reads
   `config.cortex.visionModel` and hands it straight to `chatComplete`. `qwen2.5-vl-3b` (llama.cpp) and
   the Ollama tag (`qwen3-vl:4b` or whatever `ollama list` actually reports — **the name in the brief,
   `qwen3.5:4b`, is not a tag that exists in the Ollama registry; verify against the live daemon before
   pinning it**) are different strings for the same *role*. Callers must select by **role**
   (`brain` | `judge` | `vision`), never by id. The façade already refuses a caller-supplied model for
   vision (ADR 0002 §1) — this generalises that rule and makes id-resolution the driver's job.

4. **`vision.complete()` takes a frames array, but that is not a video path.** It exists for animated
   GIF/WebP sampling (`lib/image.js` `frameIndices`) and puts every frame into **one** prompt as multiple
   `image_url` parts. Reusing it for a 6–12 frame video means one enormous multi-image prompt on a 3–4 B
   model on CPU — the worst case for both quality and latency, with no per-frame provenance and no
   partial-failure handling. Video wants **per-frame calls with a max-wins aggregate** (§4.3).

5. **`storage.retrieve()` returns a whole Buffer.** `services/filevault/src/storage/backends/disk.js`
   `retrieve()` is `fs.readFile()`. That is fine for a 2 MB JPEG and **fatal for video** on an 8 GB box —
   a 1.5 GB recording read into a Buffer, in a Node process that also holds Sequelize and Bull, is an OOM
   with a moderation worker's name on it. The video lane must never call `retrieve()`; it needs a
   stream/`retrieveToFile` accessor (TASK-040).

6. **Provider fallback (moderator) and backend failover (cortex) currently cannot collide — and the
   design must keep it that way.** `AIProviderFactory._analyzeWithFallback`
   (`services/moderator/src/ai-providers/index.js`) walks every registered provider when the selected one
   throws. But the image lane **does not go through it at all**: FEAT-031's worker computes the verdict via
   the cortex façade and hands moderator a `precomputedResult` (ADR 0002 addendum §1), which *skips the
   analyzer entirely*. So in the async media lane there is no provider chain to fight with, and in the
   synchronous text lane there will be no secondary backend (§3). That separation is what makes the two
   mechanisms compose instead of double-counting; it is an invariant, not an accident (§3.3).

7. **The Live recording state machine does not work.** This is the blocking finding for half the feature,
   and it is not a small one:
   - `services/live/src/models/Recording.js` declares **snake_case attributes** (`stream_id`, `room_id`,
     `user_id` **NOT NULL**, `started_at`, `completed_at`, `duration_seconds`, `file_size_bytes`) and a
     status enum of exactly `('processing','ready','failed','deleted')`.
   - `services/live/src/services/recording.js` `createRecording()` writes **camelCase** (`streamId`,
     `roomId`, `startedAt`, `fileSize`, `duration`) — attributes the model does not define — omits the
     NOT-NULL `user_id`, and sets `status: 'recording'`, which is **not in the enum**. It cannot succeed.
   - `_processRecording()` then writes `status: 'completed'` (also not in the enum) plus `thumbnails`,
     `variants`, `processedAt`, `error` — **four columns that do not exist on the model**.
   - `services/live/src/routes/roomCollab.js` creates the row with the right snake_case keys but still
     `status: 'recording'` and still no `user_id`, wrapped in `.catch(() => null)` — so the insert fails
     **silently**, the RabbitMQ recording job is published with `recordingId: null`, and `/recording/stop`
     writes `status: 'completed'` under another `.catch(() => {})`.
   - **`worker:live` never writes anything back.** It muxes the file to `outputPath` and exits. Nothing
     persists the path, the size, the duration, or a terminal status.

   Net: there is today **no trustworthy "this recording is finalized and its bytes are at path X" event**
   anywhere in the platform. A moderation lane for Live recordings has nothing to hang its enqueue hook on.
   FEAT-074 is **blocked** on BUG-032 + TASK-041, and no amount of clever worker design routes around that.

8. **Recordings have no serving path yet — which is a gift.** I found no nginx `alias`/`root` and no
   Express download route for recording files; `GET /live/api/rooms/:id/recordings` returns rows, not
   bytes. So a fail-closed visibility gate can be built **into** the playback route on the day it is
   written (TASK-044), instead of being retrofitted around bytes nginx is already handing out. If
   recordings are ever served straight off disk by nginx, every moderation gate in this ADR becomes
   theatre — that is stated as a binding constraint, not a suggestion.

---

## Decision

**APPROVED-WITH-CHANGES.** The scope stands. Four structural changes make it safe.

### 1. A backend driver abstraction — `services/cortex/src/backends/`

`lib/llama.js` stops being "the LLM" and becomes **one driver**. A new registry owns backend selection,
role→id resolution, residency, and the breaker. `engine/vision.js` and `engine/agent.js` talk to the
registry and never to a driver directly.

The contract (this is the whole interface — anything a caller needs that is not here is a driver leak):

```js
// services/cortex/src/backends/types.js — the contract every driver implements
/**
 * @typedef {Object} Driver
 * @property {'llamacpp'|'ollama'} name
 * @property {{ managesResidency: boolean, acceptsImages: boolean, pullable: boolean }} capabilities
 * @property {(role: 'brain'|'judge'|'vision') => string|null} modelFor      // config lookup, NO network
 * @property {() => Promise<boolean>} health                                  // cheap, <= 3s, never throws
 * @property {(modelId: string) => Promise<boolean>} supportsVision           // llamacpp: input_modalities; ollama: /api/show capabilities[]
 * @property {(modelId: string, o: {timeoutMs: number}) => Promise<void>} ensureResident  // llamacpp: poll /models + nudge /models/load; ollama: no-op (auto-load) or assert /api/tags contains it
 * @property {(modelId: string, messages: Msg[], opts: object, o: {pool: 'text'|'vision', timeoutMs: number}) => Promise<{text: string, finishReason: string|null}>} chatComplete
 */
```

Binding rules on the drivers:

- **`chatComplete` returns a normalized `{ text, finishReason }`.** Today `engine/vision.js` reaches into
  `data.choices[0].message.content` and `choice.finish_reason`. Both backends happen to be OpenAI-shaped,
  but that is a coincidence we do not want to depend on; normalize once, in the driver.
- **The empty-body check moves into the llama.cpp driver.** "An empty completion means the router answered
  mid-load" is a llama.cpp fact. `engine/vision.js` must not know it.
- **`ensureResident` on the Ollama driver does NOT pull.** A `/api/pull` of a multi-GB model inside a job
  with a bounded budget is how you turn one slow job into a stuck queue. Models are pulled at **provision**
  time (TASK-039). A missing model is `VISION_UNAVAILABLE` — an operator error, surfaced loudly, not
  self-healed. (`CORTEX_OLLAMA_AUTO_PULL=false` default; if an operator opts in, the pull happens in a
  boot-time preflight, never inside a job.)
- **Drivers never log `messages`, an `image_url`, or a data URI.** ADR 0002 §3 carries over verbatim and
  now applies to two code paths instead of one.
- **`lib/llama.js` keeps the semaphore pools** (`text`, `vision`) but they become **per-process, per-pool**,
  shared by both drivers — the scarce resource is the CPU/GPU on the far end, not the HTTP client.

**Role-based selection (required, replaces raw ids).** `engine/vision.js` stops reading
`config.cortex.visionModel`. It asks the registry for the `vision` role, and the registry asks whichever
driver it selected for *its* id:

```
CORTEX_VISION_MODEL=qwen2.5-vl-3b        # llamacpp id  (existing var, unchanged meaning)
CORTEX_OLLAMA_VISION_MODEL=qwen3-vl:4b   # ollama tag   (verify against `ollama list`)
```

Preflight (`supportsVision`) stays fail-closed and stays memoized — but memoized **per backend**, because
"primary can see" tells you nothing about the secondary.

### 2. The queue-only invariant — enforced in two layers, not documented

This is the load-bearing safety property of the whole ADR. A 10–60 s CPU inference on a request path does
not just make one request slow; it pins a core on a 4 vCPU box that also runs Postgres, and it does so
*precisely when the primary is already down*, i.e. during an incident. A comment saying "don't do this" is
not an engineering control.

**Layer 1 — process gate (primary).** The Ollama driver **refuses to register** unless the process
declares itself a worker:

```js
// services/cortex/src/backends/index.js
const ASYNC_ROLE = process.env.CORTEX_ASYNC_ROLE === 'worker';
// The gateway process NEVER has an Ollama driver in its registry. Not "shouldn't" — cannot.
if (config.cortex.ollamaEnabled && ASYNC_ROLE) register(require('./ollama'));
```

`CORTEX_ASYNC_ROLE=worker` is set **only** by the worker npm aliases (`worker:video-moderation`,
`worker:filevault-moderation`, `worker:cortex`), never in `.env`, and `src/index.js` (the gateway
bootstrap) **asserts at boot that it is unset** and refuses to start if an operator has put it in `.env`.
Consequence, stated plainly: with llama.cpp down, interactive cortex chat and synchronous text moderation
return 503. They do **not** silently become 60-second requests. That is the correct failure.

**Layer 2 — async job context (defence in depth, inside the worker).** The worker wraps every job body in
an `AsyncLocalStorage` scope; the registry refuses a secondary-backend call whose store is absent:

```js
// services/cortex/src/backends/jobContext.js
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
const runInJobContext = (meta, fn) => als.run({ ...meta, startedAt: Date.now() }, fn);
const inJobContext = () => als.getStore() !== undefined;
// backends/index.js: if (driver.name !== PRIMARY && !inJobContext()) throw new CortexSyncCallForbiddenError(...)
```

ALS propagates across `await`, so a job's whole call tree inherits it and nothing else does. A future HTTP
route inside a worker process, or a stray `setInterval`, cannot reach Ollama. This is cheap and it makes
the invariant *checkable*.

**Layer 3 — tests + lint.** A unit test asserts (a) the gateway registry contains only `llamacpp`, and (b)
`moderateImage()` called outside a job context with primary down throws `CORTEX_SYNC_CALL_FORBIDDEN`
rather than reaching Ollama. VERIFY checks both.

### 3. Failover + circuit breaker semantics

#### 3.1 What counts as a backend failure (failover-eligible, trips the breaker)

Only availability failures. Precisely:

- transport error (`ECONNREFUSED`, `ETIMEDOUT`, `EHOSTUNREACH`, abort) — i.e. `lib/llama.js`'s
  `AppError 503 LLM_UNAVAILABLE`;
- HTTP `5xx` from the backend;
- backend `health()` false;
- the configured role model is **absent** from that backend (llama.cpp `/models` 404 / Ollama
  `/api/tags` miss) — the *backend* cannot serve the role, so try the other one;
- residency/load timeout (`ensureResident` deadline);
- an **empty completion body** (llama.cpp mid-load).

#### 3.2 What is NEVER a backend failure (no failover, no breaker, and for some, no Bull retry either)

This list is as load-bearing as the first. Getting it wrong is how you either retry a user's corrupt file
forever, or hide a model regression behind an availability metric.

| Condition | Failover? | Bull retry? | Why |
|---|---|---|---|
| `UNSUPPORTED_IMAGE` / `UNSUPPORTED_VIDEO` (undecodable, bomb, bad container) | **no** | **no** — terminal | The user's bytes. Both backends will reject it identically. Already terminal in FileVault's worker (`PERMANENT` set); extend to video. |
| `CORTEX_DISABLED` | no | no | Operator state, not a fault. |
| `CORTEX_SYNC_CALL_FORBIDDEN` | no | no | A programming error. Must be loud. |
| HTTP `400` / `413` (bad request, payload too large) | **no** | no | Our bug or an oversized frame — failing over would just reproduce it and mask it. |
| **Unparseable JSON after the in-model retry** (`vision.js` `completeJson` already retries once at a higher temperature) | **no** | yes (bounded) | A **model-quality** failure, not an availability failure. Failing over here would silently produce verdicts from a *different model with a different score distribution* whenever the primary got the sulks — nondeterministic safety decisions, and it would hide the regression from TASK-023's benchmark. It fails **closed** (escalate) as it does today. |
| Verdict missing required scores | no | yes | Same reasoning. |

The unparseable-JSON row is the one I expect to be argued with. I am holding it: a moderation verdict that
silently changes model on a parse hiccup is worse than one that escalates to a human.

#### 3.3 Failover, and how it composes with the moderator provider chain

```
cortex.moderateImage(buf)                      // façade — ONE call, ONE outcome
  └─ backends.withRole('vision', fn)
       ├─ primary  = llamacpp   (breaker CLOSED?)  → attempt, bounded by CORTEX_PRIMARY_ATTEMPT_TIMEOUT_MS
       │     └─ failover-eligible error → record failure, fall through
       └─ secondary = ollama    (only if inJobContext() && registered && breaker CLOSED)
             └─ failover-eligible error → throw CortexUnavailableError  (ONE error to the caller)
```

Three rules keep this from fighting with moderator:

1. **Backend failover is invisible above the façade.** `moderateImage()` either returns a verdict (from
   whichever backend — recorded in `verdict.backend`) or throws **once**. Moderator never sees two attempts,
   never counts two failures.
2. **In the async media lane, the moderator provider chain is not in the path at all** (finding 6): the
   worker computes the verdict and passes `precomputedResult`, which bypasses `AIProviderFactory`. So
   there is no cloud provider to "mask" a cortex backend failover with, and no double-count.
   `AIProviderFactory._analyzeWithFallback` walking over to a cloud provider **cannot** happen for images
   or video.
3. **In the synchronous text lane, the secondary backend is structurally unreachable** (§2 layer 1). So
   provider fallback runs there and backend failover does not.

The two mechanisms therefore operate on **disjoint** lanes. That is the invariant. **If text moderation is
ever moved onto a queue** (a live possibility — ADR 0001 §6 already recommends shadow/async for general
publish load), the lanes overlap, and the rule that must then hold is: *cortex exhausts its eligible
backends and throws exactly once; moderator counts that as exactly one provider failure and must never
re-select `cortex` inside `_analyzeWithFallback`.* Write that ticket when you write that change
(the `exclude` param on `analyzeContent` is already the mechanism).

#### 3.4 The breaker

Per-backend, in-memory, per-process (workers are single-process; a Redis-shared breaker buys nothing for
correctness and costs a round trip on every job — if a second video worker is ever added, each keeping its
own breaker just means each probes primary independently, which is fine and is documented, not fixed).

- **CLOSED** → normal. `CORTEX_BREAKER_FAILURES` (default **3**) consecutive failover-eligible failures
  within `CORTEX_BREAKER_WINDOW_MS` (default **120000**) → **OPEN**.
- **OPEN** → the backend is skipped entirely (no attempt, no timeout paid) for
  `CORTEX_BREAKER_COOLDOWN_MS` (default **300000**, 5 min), doubling on each consecutive re-trip up to
  `CORTEX_BREAKER_COOLDOWN_MAX_MS` (default **1800000**, 30 min).
- **HALF_OPEN** → after the cooldown, the next job first calls the driver's cheap `health()` (≤3 s). Only
  if that passes does it get **one** real attempt. Success → CLOSED, counters reset. Failure → OPEN with
  the doubled cooldown.

**Why the health probe gate matters more than it looks:** in the DigitalOcean deployment there may be **no
llama.cpp router at all** (`CORTEX_LLM_BASE_URL` defaults to `127.0.0.1:8080`, which is the Mac dev box).
Steady state is then "primary permanently absent, Ollama serving everything, breaker parked OPEN." Without
the exponential cooldown and the cheap health gate, every single job would pay a connect-timeout to a
nonexistent primary before doing any work. With them, the cost of an absent primary is one 3 s probe every
30 minutes. **A deployment with no primary must be a first-class, cheap state — not a permanent tax.**

**Failure must be detected fast, not by timeout.** `CORTEX_PRIMARY_ATTEMPT_TIMEOUT_MS` bounds the primary
attempt independently of the caller's job budget, so a hung primary costs one bounded attempt and then the
job proceeds on the secondary — it does not burn the full `CORTEX_VISION_TIMEOUT_MS` and *then* start over.
Ollama gets its own, much larger `CORTEX_OLLAMA_TIMEOUT_MS` (default **300000**) because CPU inference is
genuinely that slow, and the façade's per-call timeout for a *job-context* call is the sum of the eligible
attempts, not a single number. (The façade's `withTimeout` wrapper must therefore take the budget from the
registry, not from `config.cortex.visionTimeoutMs`, when it is in a job context.)

#### 3.5 Role eligibility — the secondary is not for everything

`CORTEX_OLLAMA_ROLES` (default **`vision`**). The secondary is eligible for the `vision` role only, unless
an operator explicitly widens it. Rationale: a `brain`-role agent task is a 12-iteration tool loop with
16 000-char tool results; running that on a 4 B model on 4 CPU cores is not "degraded", it is minutes per
iteration, wrong answers, and a pegged box. Cortex agent tasks are already queued (`cortex-tasks`), so
they *would* be technically eligible under the queue-only rule — this flag is what stops that from being
an accident. `judge` may be opted in (`CORTEX_OLLAMA_ROLES=vision,judge`) once someone measures it.

### 4. Video moderation + AI tagging

#### 4.1 Placement — a composition-layer worker, not a module worker

The video lane needs FileVault's models + storage, Live's models, cortex's façade, and moderator's
`moderationService`. Three placements were considered:

- **(a) extend `services/filevault/src/worker.js`** — makes FileVault own Live's tables. Rejected: it puts
  a cross-module dependency inside a domain module and drags live's schema into filevault's worker.
- **(b) put it in `services/cortex/`** — rejected, and this one is important: cortex is the **leaf**
  inference provider. Making it require filevault + live + moderator inverts the dependency (exactly the
  layering inversion ADR 0001 §3 refused for `@exprsn/shared`) and would give cortex a require-graph
  reaching into three modules' models. Cortex stays *pixels in, verdict out*: no filesystem, no ffmpeg, no
  domain models.
- **(c) a composition-layer worker at `src/workers/videoModeration/`** — **chosen.** This is the same call
  ADR 0003 made for the org-provisioning saga (`src/provisioning/`): cross-module orchestration belongs in
  the composition layer, requiring each module's *published* surface. Per-schema isolation is preserved —
  filevault owns `filevault.file_moderation`, live owns `live.recording_moderation`, neither reaches into
  the other's schema, and the worker composes them.

Registry (`src/modules/registry.js`) is **unchanged**: the worker mounts no routes and owns no schema.

#### 4.2 The pipeline

```
enqueue (post-commit, from the module) ──► queue: video-moderation
  worker:video-moderation
    1. resolve bytes to a LOCAL PATH        — storage.retrieveToFile() (TASK-040) / live's outputPath.
                                              NEVER storage.retrieve() (finding 5 — OOM).
    2. ffprobe                              — duration, container, codec. Undecodable ⇒ UNSUPPORTED_VIDEO (terminal).
    3. keyframe extraction (ffmpeg)         — N = clamp(ceil(duration / VIDEO_FRAME_INTERVAL_S), MIN, MAX),
                                              default interval 30s, MIN 3, MAX 12. `-ss` input seeks
                                              (decode only around each timestamp — do not scan the file),
                                              scaled to CORTEX_VISION_MAX_EDGE, JPEG. Temp dir under
                                              CORTEX_DATA_DIR, mode 0700, removed in a `finally`.
    4. cortex.moderateFrames(buffers[])     — FAIL CLOSED. per-frame calls, max-wins aggregate (§4.3).
    5. cortex.describeFrames(buffers[0..2]) — FAIL SOFT. tags/alt-text from up to 3 representative frames.
    6. write the side-table row, compare-and-set on the content hash (BUG-022 pattern)
    7. flagged ⇒ moderationService.moderateContent({ contentType: 'video', precomputedResult })
```

`contentType: 'video'` is **already a valid** `moderation_items.content_type` enum value (verified against
the enum list in `services/moderator/migrations/20260713000001-add-llm-message-content-type.js`:
`text|image|video|audio|post|comment|message|profile|file`). No enum migration needed — which is the one
piece of luck in this whole design. Assert it in a test anyway; BUG-015 is exactly what happens when you
assume.

#### 4.3 Two new façade methods — per-frame, max-wins, early-exit-on-escalate-only

```js
// services/cortex/src/client.js  (async-only, same as the ADR 0002 vision methods)
cortex.moderateFrames(buffers, { earlyExitAtRisk })  // -> { ...maxScores, frames: [{i, riskScore, ...}],
                                                     //      framesScored, framesTotal, backend, model }
cortex.describeFrames(buffers)                       // -> { altText, tags[], backend, model }
```

- **Per-frame, not one multi-image prompt** (finding 4): better quality on a small model, per-frame
  provenance for the review queue, and partial failure is survivable.
- **Max-wins aggregation**: each risk dimension is the max across scored frames; `flags` is the union; the
  explanation comes from the worst frame. For a safety decision, worst-frame-wins is the only defensible
  aggregate — a 3-hour clean stream with 20 seconds of gore is not a clean stream.
- **Early exit is allowed in the escalate direction only.** Once a frame scores ≥ `earlyExitAtRisk`, stop:
  the verdict is already "escalate" and the remaining frames cannot lower it. Never early-exit to *clear* a
  video — every frame in the sample must be scored before a video is approved. (This is a big latency win
  precisely on the bad videos, which is where you want it.)
- **Sampling is honest, and honestly weak on long content.** 12 frames over a 3-hour recording is one frame
  every 15 minutes. That is not "video moderation", it is spot-checking, and the ADR says so out loud
  rather than letting a dashboard imply coverage. It is still strictly better than the status quo (nothing),
  and it is the ceiling this hardware affords (§8.1). If real coverage is wanted, that is a scene-change-
  detection + higher-frame-budget ticket on hardware that can pay for it.
- **Audio is not analysed at all.** A recording with benign visuals and hateful audio passes clean. This is
  a **named gap** (TASK-043: whisper transcription → the existing text lane), not a silent one.

#### 4.4 State: reuse FileVault's side table, add one for Live

- **FileVault video** reuses `filevault.file_moderation` **as-is** — no DDL. `isModeratableImage()` gains a
  sibling `isModeratableVideo()` (`video/*`), `initialState()`/`shouldQueue()` learn about it, and
  `establishModerationState()` (the invariant function from ADR 0002's addendum — the one that exists
  *because* four write paths open-coded it and three got it wrong) routes video to the video queue instead
  of the image queue. Every existing property comes along free: fail-closed pending visibility, the
  `canServe()` gate, the compare-and-set on `contentHash`, the reconcile sweep, the shadow/enforce rung.
- **Live recordings** get a **new side table `live.recording_moderation`** in **live's** schema, shaped on
  ADR 0004 §3's side-table pattern (`recording_id` PK/unique FK, `status`, `reason`, `risk_score`,
  `verdict` JSONB, `provider`, `backend`, `model`, `alt_text`, `ai_tags`, `frames_scored`, `attempts`,
  `last_error`, timestamps) with ADR 0004 §4.2's **terminal-state ladder** so a poison recording cannot
  loop. **dba co-signs the DDL, the indexes (incl. the partial reconcile index), and the migration
  mechanics** — note `db:migrate` creates tables but does not ALTER, so this is a new table (fine) and the
  `up()` must be schema-qualified (STATUS #1).
- **Do not** add moderation columns to `recordings` (ADR 0004 §2, settled).

#### 4.5 Queue + worker

- **New Bull queue `video-moderation`**, on the shared Redis. Kept **separate** from
  `filevault-image-moderation` on purpose: a video job is minutes, an image job is seconds, and one shared
  single-concurrency queue would let one 12-minute video head-of-line-block fifty images.
- Job: `{ name: 'moderate-video', data: { source: 'filevault'|'live', fileId?, recordingId?, contentHash? },
  jobId: 'video:<source>:<id>' }`. `jobId` dedup + the **remove-then-add** requeue (BUG-016) when bytes change.
- `attempts: 4`, `backoff: { type: 'exponential', delay: 60000 }` (video is idempotent — same bytes, same
  verdict), `removeOnFail: { age: 86400 }`, DLQ + depth alert. **dba co-signs.**
- **Root alias `worker:video-moderation`**, added to the six existing workers and to
  `docs/runbooks/digitalocean-ubuntu.md` (§ systemd units) and `deploy/systemd/`.
- **Cross-process contention:** the cortex semaphore is in-process, so the image worker and the video worker
  do **not** share a slot pool. Two processes can therefore hit Ollama at once. This is bounded at the
  backend, not by us: the container **must** set `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_MAX_LOADED_MODELS=1`
  (both load-bearing, both in TASK-039), so a second concurrent request queues behind the first rather than
  loading a second copy of a 3–4 GB model into an 8 GB box. If measurement shows thrash, a Redis-based
  global inference lock is the fix — filed as a follow-up, **not** built speculatively.

### 5. Amendment to ADR 0002 §5 — Live recordings are now IN scope

**ADR 0002 §5 excluded live recordings** from the moderation chokepoint with this reasoning: *"live stream
frames/thumbnails/recordings (disk, video, out of scope for an image model)"*, and Consequence 5 filed it as
a follow-up ticket. **That exclusion is hereby amended: Live recordings are IN scope, via this ADR.**

**Why the reason no longer holds.** The exclusion rested on two premises, and both were about *capability*,
not principle:

1. *"out of scope for an image model"* — true then, false now. The gap between "an image model" and "video"
   is **ffmpeg**, and this ADR closes it: keyframe extraction turns a video into the N images the vision
   model already handles (§4.2/§4.3). Nothing about the model changed; the missing piece was the frame
   extractor, and `services/live/src/services/ffmpeg.js` has been sitting there the whole time.
2. *"disk, not FileVault"* — still true, and still irrelevant. ADR 0002's chokepoint argument was about
   *where the bytes funnel*, not about FileVault being magic. A recording on disk with a known path is a
   perfectly good chokepoint; it just needs its own side table (§4.4) instead of borrowing FileVault's.

**Why it must change, not merely may.** ADR 0002 §5 called uploaded attachments "the primary risk surface."
That was accurate for a platform whose `/live` publish path was not yet in MVP scope. It is no longer:
`/live` streaming publish **is** in MVP scope (CLAUDE.md), rooms can record (`roomCollab`
`/recording/start`), and a recording is durable, re-playable, shareable UGC produced by a user. Leaving the
one UGC class that is *both* durable *and* unmoderated outside the chokepoint is not a scope decision any
more, it is a hole. Rick has made the call; the architecture agrees with it.

**New invariants this amendment creates (binding):**

- **A1. Recordings are not servable to anyone but their owner until moderation resolves** — the same
  `canServe(file, moderation, requesterId)` shape FileVault already enforces, applied to recordings, and
  gated by `LIVE_RECORDING_MODERATION=off|shadow|enforce` (default **off**; the shadow rung exists so
  TASK-023's benchmark has video data before enforce is switched on).
- **A2. Recording bytes may only ever be served through an authorized module route** (TASK-044). If nginx
  (or SRS) ever serves the recording directory statically, A1 is unenforceable and this whole lane is
  decorative. **No static exposure of the recording directory. Ever.** VERIFY checks the nginx config.
- **A3. The moderation state is (re)established on every path that writes recording bytes** — the ADR 0002
  addendum's `establishModerationState()` discipline, ported to live. Today that is one path (the ffmpeg
  recording job); a future re-encode/trim/restore path must call the invariant, not re-invent it. This is
  the BUG-018/BUG-021 class, pre-empted.
- **A4. Live streaming *frames* (i.e. moderating a stream in flight) remain OUT of scope.** This amendment
  covers **recordings** — finalized, at-rest artifacts. Real-time frame moderation of a live stream is a
  different problem (latency budget in seconds, not minutes) and this hardware cannot do it. Do not read
  this ADR as authorizing it. It remains a named gap.
- **A5. Live thumbnails and stream posters** — still out of scope, still a filed follow-up. They are
  images and will fall out of the FileVault lane *if* they are ever stored as FileVault objects; they are
  not today.

### 6. Failure policy, visibility, and the pending window

- `moderateFrames` **fails CLOSED**, `describeFrames` **fails SOFT** — ADR 0002's split, unchanged and
  non-negotiable. A video whose verdict cannot be computed stays hidden; a video whose tags cannot be
  computed ships untagged.
- **FileVault video pending-visibility** inherits the existing FileVault policy (`pending` ⇒ hidden from
  everyone but the uploader) behind a **new, separate flag** `FILEVAULT_VIDEO_MODERATION=off|shadow|enforce`
  (default **off**). It is separate from `FILEVAULT_IMAGE_MODERATION` because the latency profiles are not
  comparable: an image is hidden for ~seconds, a video for **minutes to hours** under backlog. An operator
  must be able to enforce on images without accepting that on video.
- **§6.3 — Recording pending-visibility is a PRODUCT call (Rick), not an implementation detail.** Same
  question ADR 0002 §6 forced for images, with sharper teeth: at ~1–12 minutes of inference per recording
  on one CPU slot, a modest backlog means a recording is invisible to its audience for *hours*. Options:
  (a) fail-closed-pending (safe, potentially hours-to-visibility), (b) owner-visible-immediately +
  others-pending (the FileVault shape — recommended default), (c) visible immediately with async takedown
  (weak). **Recommended: (b), with `shadow` as the first production rung** so the backlog and the score
  distribution are measured before anything is held. This is a required acceptance criterion on FEAT-074.

### 7. Security posture

1. **The Ollama container is never publicly reachable.** The gateway and the workers run on the **host**
   under systemd (per `docs/runbooks/digitalocean-ubuntu.md`), while backing services run in Docker with
   `ports: !override` bound to loopback. Ollama follows that exact pattern:
   `ports: ["127.0.0.1:${OLLAMA_PORT:-11434}:11434"]` in `docker-compose.prod.yml`, plus
   `OLLAMA_HOST=0.0.0.0` *inside* the container only. **Never** a bare `11434:11434` — the runbook's §5
   warning is not hypothetical: Docker writes `DOCKER-USER` iptables rules that are evaluated *ahead of*
   ufw, so a published port is internet-reachable even when ufw says otherwise. Ollama has **no
   authentication of any kind**; an exposed 11434 is a free, unauthenticated LLM (and a
   prompt-injection/exfil pivot) for the entire internet. `CORTEX_OLLAMA_BASE_URL=http://127.0.0.1:11434`.
2. **The new worker's credential posture — and a correction to the brief.** The ticket says the worker
   "integrates Exprsn-CA (service tokens), Auth, Moderation, Queues." Two of those four are wrong for a
   worker, and building them in would *add* attack surface for nothing:
   - **CA `/api/tokens/validate` is for validating an inbound bearer.** A Bull worker has no inbound
     requests — it consumes trusted, internal job payloads that carry only ids. There is nothing to
     validate. `requireUser`/`requireService` belong on the **gateway routes** that expose moderation
     status (TASK-044), not in the worker.
   - **Auth**: the worker needs no user identity. It reads `file.userId` / `recording.user_id` off the row
     to attribute the moderation item — that is a foreign key, not an authentication.
   - **What it *does* need**: `shared/utils/serviceToken.js` `deriveServiceToken(SERVICE_ID)` HMAC headers
     **only if** it makes an HTTP call to another module. It should not: moderator is reached
     **in-process** (`require('../../moderator/services/moderationService')`), exactly as
     `services/filevault/src/worker.js` already does, which is also the TASK-009 direction. So the correct
     answer is: **the worker holds no user credentials, mints no CA tokens, and makes no authenticated HTTP
     calls.** If a residual HTTP call proves unavoidable, it uses the HMAC service token with
     `SERVICE_ID=platform` and `getInternalHttpsAgent()` — never a user bearer.
   - The `precomputedResult` route into moderator stays **in-process-only**; the route-boundary allowlist
     (`sanitizeModerationInput()`) that closed the forge-the-verdict hole in ADR 0002's addendum §3 must
     keep stripping it, and a test must assert `contentType: 'video'` + `precomputedResult` cannot be
     posted over HTTP.
3. **No new externally-mounted route** in FEAT-072/073. FEAT-074's status/playback route (TASK-044) is a
   new entry in `API_SURFACE.md` and is `requireUser`-gated.
4. **Image/frame bytes still never persist**: no `logPrompt` from the vision path, no `messages`/data-URI
   in Winston, no bytes as a Redis value, EXIF/GPS stripped at re-encode. Extracted frames live in a
   0700 temp dir and are deleted in a `finally`. Now doubly important: a temp dir full of keyframes from
   a private recording is a new at-rest surface that did not exist before. **VERIFY: the temp dir is empty
   after a job, including after a failed job.**

### 8. Where the stated design is wrong or unsafe — the disagreements

These are not blockers on the decision (Rick has made the call); they are the honest consequences, and two
of them need an explicit answer before enforce mode.

#### 8.1 The 8 GB droplet does not have room for this, and the failure mode is Postgres

Rough resident set on that box today: Postgres (~1 GB), Redis, **OpenSearch (1–2 GB, and it is a JVM)**,
RabbitMQ (~300 MB), nginx, SRS, the gateway plus **six** Node workers (~150–250 MB each ⇒ ~1.5 GB), and
now a **seventh** worker. That is comfortably 5–6 GB before a single token is generated. A 4 B vision model
at q4 is ~3–4 GB resident while loaded. **This does not fit.** The Linux OOM killer does not politely
degrade inference — it picks the biggest RSS it can find, and on that box, once the model is loaded, the
next-biggest thing is frequently Postgres.

Mitigations, in the order I would apply them:

1. **Add RAM.** 16 GB is the honest answer. Everything below is a workaround for not doing this.
2. **Take OpenSearch off this droplet** (or off entirely, if the modules that need it are not in MVP scope).
   It is the single biggest non-model consumer and it buys the least on a moderation-first box.
3. **Use a 2 B-class vision model** (~2 GB at q4) rather than 4 B. On CPU it is also ~2× faster, which
   matters more than the accuracy delta when the alternative is a 12-minute video job.
4. **`OLLAMA_KEEP_ALIVE` short (default `5m`)** so the model is returned to the OS between queue drains.
   The queue naturally batches, so a run of jobs shares one load and pays the reload once per idle period.
   `keep_alive: -1` (permanent residency) on this box is a standing 4 GB tax and I would reject it.
5. **`OLLAMA_NUM_THREAD=2`** (of 4 vCPU). Letting inference take all four cores starves Postgres and the
   gateway *during an incident*, which is exactly when you cannot afford it. Slower jobs, live platform.
6. **Protect Postgres from the OOM killer** (`oom_score_adj=-500` on the postgres container) and add swap.
   A swapping box is bad; a box that killed its database is worse.

I am recording this as a **flag, not a veto** — Rick owns the infra call. But "it OOM-killed Postgres at
02:00 because someone uploaded a 40-minute recording" is a foreseeable incident, and this paragraph is the
record that it was foreseen.

#### 8.2 Two backends, two models, ONE risk threshold — that is a real safety bug

`FILEVAULT_IMAGE_RISK_THRESHOLD` (default 70) is a single number applied to the output of whichever model
answered. `qwen2.5-vl-3b` on llama.cpp and a Qwen-VL on Ollama are **different models with different score
distributions**. A threshold calibrated on the primary is *not* calibrated on the secondary, and after this
lands the secondary is exactly what serves traffic during every primary outage — i.e. the threshold is
miscalibrated precisely when it is doing the most work.

**Binding consequences:**
- Every verdict row records `backend` **and** `model` (already partly there — `verdict.model` — now
  mandatory and surfaced in the side tables).
- Thresholds are resolvable **per backend**: `FILEVAULT_IMAGE_RISK_THRESHOLD` /
  `..._RISK_THRESHOLD_OLLAMA` (fall back to the base value when unset), and likewise for video.
- **TASK-042 (qa-specialist) is a blocking gate on enforce mode for the secondary backend.** Until the
  secondary's scores are calibrated against the same benchmark set, the secondary may run in **shadow**
  only. Failing over from a calibrated model to an uncalibrated one, in enforce, is worse than failing
  closed to a human — and "fail closed to a human" is what we do anyway when there is no backend at all.

#### 8.3 FEAT-074 cannot be built on the current Live recording code (finding 7)

The recording state machine does not persist: `createRecording` writes camelCase attributes the model does
not define, omits a NOT-NULL `user_id`, and sets a status outside the enum; `roomCollab` swallows the
resulting insert failure with `.catch(() => null)` and publishes the ffmpeg job with `recordingId: null`;
`worker:live` never writes the output path, size, duration, or a terminal status back. **There is no event
that says "a recording is finalized and its bytes are here."** The enqueue hook for FEAT-074 has nothing to
attach to.

Sequencing is therefore not negotiable: **BUG-032** (make the `Recording` model and its service agree —
attribute names, the NOT-NULL `user_id`, the status enum, and stop swallowing the insert error) and
**TASK-041** (`worker:live` publishes a recording-completed signal carrying `outputPath`, `bytes`,
`duration`, and sets `status: 'ready'`) land **before** FEAT-074 starts. FEAT-074 is `blocked` until both
are `done`. FEAT-072/073 (backend abstraction + FileVault video) are independent and can proceed in
parallel.

---

## Consequences

1. **ADR 0001 and ADR 0002 remain intact.** The façade is still the only door; it still binds to the
   inference layer and never to `engine/jobs.js`; `CORTEX_ENABLED` is still evaluated before the lazy
   require; `moderateImage`/`moderateFrames` still fail closed and `describeImage`/`describeFrames` still
   fail soft. The moderator→cortex→moderator cycle is still structurally impossible.
2. **ADR 0002 §5 is amended** (§5 above): Live recordings are in scope, with five new invariants (A1–A5) and
   an explicit reason — the exclusion was a capability statement, and ffmpeg + `/live` entering MVP scope
   changed the capability and the risk, not the principle.
3. **The queue-only rule is enforced, not requested.** The gateway process cannot register the Ollama
   driver; a non-job code path inside a worker cannot reach it either. The visible cost: with the primary
   down, interactive chat and synchronous text moderation 503 rather than degrade to 60-second requests.
   That is the intended behaviour and operators must be told so.
4. **Availability improves only for async work.** The honest headline: this buys **image, video, and
   queued-task inference** an availability floor. It buys interactive chat nothing. Anyone reading
   "automatic failover" as "cortex is now HA" is reading it wrong.
5. **Backend failover and provider fallback occupy disjoint lanes** (§3.3) and therefore cannot
   double-count or mask each other — today. That property is *conditional* on the async media lane
   continuing to bypass `AIProviderFactory` (via `precomputedResult`) and on the sync text lane continuing
   to have no secondary backend. Both are asserted in tests. If text moderation moves onto a queue, §3.3's
   overlap rule must be implemented in the same change.
6. **Video coverage is a spot-check, and audio is not covered at all.** 3–12 sampled frames, no
   soundtrack analysis. Both are named gaps with tickets (TASK-043), not marketing.
7. **Throughput is a trickle and the backlog is a product surface.** At ~10–60 s/frame and 3–12 frames,
   one video is ~1–12 minutes of a single CPU slot. Best case, this box moderates on the order of tens of
   videos per hour, and less when it is also serving. Queue depth needs an alert and the pending window
   needs a product answer (§6.3).
8. **Ownership handoffs.** Config keys land in `src/config/index.js` + `.env.example` (architect-owned).
   The `video-moderation` Bull queue, the `live.recording_moderation` side table, and its terminal-state
   ladder are **dba** mechanics — co-sign required. The moderator-side `contentType: 'video'` +
   `precomputedResult` path is moderator-owned (it already exists; assert, don't extend). TASK-042
   (per-model calibration) is qa-specialist's and is a **blocking gate on enforce** for the secondary.
   `API_SURFACE.md` gains the FEAT-074 status/playback route; `ARCHITECTURE.md` gains the
   "two-backend cortex + video lane" note; `docs/runbooks/digitalocean-ubuntu.md` gains the Ollama
   container, its loopback binding, and the seventh systemd unit.

---

## Rejected alternatives

1. **Teach `lib/llama.js` to speak both protocols with an `if (isOllama)` branch.** Rejected: it puts
   llama.cpp's single-residency poll-and-nudge loop and Ollama's auto-load/keep-alive model in the same
   function, and `engine/vision.js` keeps knowing that "empty body" means "mid-load" — a llama.cpp fact
   leaking into the engine forever. Two drivers behind one contract is barely more code and it is the
   only version that stays honest when a third backend appears.
2. **Ollama as an OpenAI-compatible drop-in with no driver at all** (just point `CORTEX_LLM_BASE_URL` at
   `:11434/v1` on failure). Rejected: `/v1/chat/completions` is compatible, but *nothing else is* —
   `assertVisionCapable()` (`/models` + `input_modalities`) and `ensureVisionResident()` (`/models/load`)
   both 404, so preflight fails closed and no image is ever scored. It looks like it works right up until
   the moment you need it.
3. **Let the secondary backend serve the synchronous text-moderation path too** ("failover is failover").
   Rejected, hard. It converts a fast fail-closed (503 → requiresReview, ~5 s) into a slow one
   (10–60 s per publish, CPU pegged) at the exact moment the platform is already degraded, and it does it
   on the box running Postgres. This is the single most dangerous thing this feature could do and it is
   why the queue-only rule is enforced in the process boundary rather than by review.
4. **One shared `media-moderation` queue for images and video.** Rejected: a 12-minute video job would
   head-of-line-block seconds-long image jobs at concurrency 1. Two queues, two consumers, one bounded
   backend (`OLLAMA_NUM_PARALLEL=1`).
5. **Put the video worker inside `services/cortex/`.** Rejected: it would make the leaf inference module
   depend on filevault + live + moderator — the same layering inversion ADR 0001 §3 refused for
   `@exprsn/shared`. Cortex takes pixels and returns verdicts; it does not open files, spawn ffmpeg, or
   know what a Recording is.
6. **Extend `services/filevault/src/worker.js` to also do Live recordings.** Rejected: FileVault would
   own Live's schema. The composition layer (`src/workers/`, per ADR 0003's `src/provisioning/`
   precedent) is where cross-module orchestration goes.
7. **One multi-image prompt per video** (reusing `vision.complete(frames[])` as-is). Rejected: worst
   quality on a small model, worst latency on CPU, no per-frame provenance, and no way to early-exit on
   the first bad frame. Per-frame + max-wins.
8. **Fail over on an unparseable-JSON verdict.** Rejected (§3.2): that is a model-quality failure, not an
   availability failure. Failing over would silently swap models mid-verdict, produce nondeterministic
   safety decisions, and hide the regression from the accuracy benchmark. It escalates to a human instead.
9. **`/api/pull` the model lazily inside the first job.** Rejected: a multi-GB download inside a job with a
   bounded budget converts one slow job into a stuck queue and a mysterious timeout. Pull at provision.
10. **A Redis-shared circuit breaker.** Rejected for now: per-process in-memory is correct for the current
    single-worker-per-queue topology, and a shared breaker costs a round trip on every job to buy
    coordination nobody needs yet. Filed as a conditional follow-up, not built speculatively.

---

## Required changes (binding, in priority order)

1. **Driver abstraction before anything else.** `services/cortex/src/backends/{index,types,llamacpp,ollama}.js`.
   `engine/vision.js` and `engine/agent.js` select by **role**, never by model id; `ensureResident` and the
   empty-body rule live in the llama.cpp driver only; `supportsVision` is per-backend and memoized per
   backend. No llama.cpp concept appears in the Ollama path.
2. **Queue-only invariant, enforced in the process boundary.** The Ollama driver registers only when
   `CORTEX_ASYNC_ROLE=worker`; the gateway asserts that variable is unset at boot; the registry refuses a
   secondary call outside an `AsyncLocalStorage` job context (`CORTEX_SYNC_CALL_FORBIDDEN`). Tests assert
   the gateway registry contains only `llamacpp` and that a sync secondary call throws rather than dials.
3. **Failure taxonomy exactly as in §3.1/§3.2.** `UNSUPPORTED_IMAGE`/`UNSUPPORTED_VIDEO`, 400/413,
   `CORTEX_DISABLED`, `CORTEX_SYNC_CALL_FORBIDDEN`, and unparseable-JSON/missing-score verdicts are
   **never** failover-eligible and **never** trip the breaker. Only availability failures do.
4. **Breaker with a cheap health gate and exponential cooldown** (§3.4), and a bounded
   `CORTEX_PRIMARY_ATTEMPT_TIMEOUT_MS` so an absent/hung primary costs one bounded probe, not a full
   vision timeout, per job. "No primary configured" must be a cheap steady state.
5. **`CORTEX_OLLAMA_ROLES=vision`** by default. The secondary does not serve `brain` agent loops unless an
   operator explicitly opts in.
6. **Video pipeline:** stream to a temp path (`retrieveToFile`, TASK-040) — **never** `storage.retrieve()`
   on video; ffprobe guard; `-ss`-seek keyframe extraction into a 0700 temp dir purged in a `finally`;
   per-frame inference with **max-wins** aggregation and escalate-only early exit; `describeFrames` on ≤3
   frames, fail soft.
7. **State:** reuse `filevault.file_moderation` for FileVault video (no DDL); add
   `live.recording_moderation` (new table, live's schema, ADR 0004 side-table + terminal-state-ladder
   shape) — **dba co-sign**. New Bull queue `video-moderation` + `worker:video-moderation` root alias +
   systemd unit — **dba co-sign**. `contentType: 'video'` is already a valid moderator enum value; assert
   it in a test.
8. **Flags, separately gated:** `FILEVAULT_VIDEO_MODERATION` and `LIVE_RECORDING_MODERATION`, each
   `off|shadow|enforce`, each defaulting **off**, each independent of `FILEVAULT_IMAGE_MODERATION` and of
   `CORTEX_MODERATION_MODE`. Document the (now four) flags' relationship in `.env.example` and
   `ARCHITECTURE.md` — the ADR 0002 addendum §2 operator-surprise problem gets worse with every flag, and
   this ADR adds two.
9. **Security:** Ollama published on **loopback only** (`127.0.0.1:11434`), `OLLAMA_NUM_PARALLEL=1`,
   `OLLAMA_MAX_LOADED_MODELS=1`; the worker holds **no** user credentials, validates **no** tokens, and
   calls moderator **in-process** (§7.2); `precomputedResult` stays stripped at every HTTP route boundary.
10. **Per-model thresholds + calibration (TASK-042) gate enforce on the secondary backend.** Until
    calibrated, the secondary runs in shadow. Every verdict row records `backend` + `model`.
11. **FEAT-074 is `blocked` on BUG-032 + TASK-041.** The Live recording state machine must persist, and
    `worker:live` must signal completion with the output path, before any recording can be enqueued.
12. **A2 is absolute:** recording bytes are served only through an authorized module route. No static
    nginx/SRS exposure of the recording directory. VERIFY inspects the nginx config.

---

## Tickets this ADR requires

| Id | Type | What | Depends on |
|---|---|---|---|
| **FEAT-072** | feature | Cortex backend driver abstraction + Ollama secondary + circuit breaker + queue-only enforcement | — (C/B gate applies) |
| **FEAT-073** | feature | Video moderation + AI tagging — FileVault uploads | FEAT-072, TASK-040 |
| **FEAT-074** | feature | Video moderation + AI tagging — Live recordings (+ `live.recording_moderation`) | **BUG-032, TASK-041**, FEAT-072/073 |
| **TASK-039** | task | Ollama container (compose, loopback-only), model provisioning/pull, runbook + firewall + systemd unit | — |
| **TASK-040** | task | `storage.retrieveToFile()` / streaming accessor in FileVault storage (no whole-video Buffers) | — |
| **BUG-032** | bug | Live `Recording` model/service disagree: camelCase attrs, missing NOT-NULL `user_id`, status values outside the enum, insert failure swallowed by `.catch()` | — |
| **TASK-041** | task | `worker:live` writes recording completion back (outputPath, bytes, duration, `status: 'ready'`) — the enqueue trigger FEAT-074 needs | BUG-032 |
| **TASK-042** | task | Per-backend/per-model risk-threshold calibration — **blocking gate on enforce for the secondary** | FEAT-072 |
| **TASK-043** | task | Audio-track moderation gap (whisper → the existing text lane) | FEAT-073/074 |
| **TASK-044** | task | Authorized recording playback/status route + the A1 visibility gate; assert no static exposure | FEAT-074 |
