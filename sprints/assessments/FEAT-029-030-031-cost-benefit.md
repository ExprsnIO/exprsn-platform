# Cost/Benefit — FEAT-029 / FEAT-030 / FEAT-031 (local vision: router residency → cortex vision surface → FileVault chokepoint)

Analyst: cost-benefit-analyzer · 2026-07-09 · branch `feat/cortex-ai-service`

Scope: the three-ticket chain that adds local image understanding — raise the
external llama.cpp router to hold a vision model resident (**FEAT-029**), expose
`describeImage`/`moderateImage` on the cortex façade (**FEAT-030**), and wire it
into the FileVault upload chokepoint async (**FEAT-031**).

Everything the user pre-decided (co-residency as the *target*, VL-3B model choice,
FileVault-chokepoint-not-five-hooks, async-via-Bull, skip-encrypted) is taken as
given. This assessment does the analyst job around those decisions: true cost,
blast radius, cheaper/smaller slices, and the two gates (co-residency-vs-swap and
a vision-moderation eval gate) the user explicitly asked me to rule on.

Grounding read: `services/cortex/src/client.js`, `services/cortex/src/lib/llama.js`,
`services/moderator/services/agents/ImageModerationAgent.js`,
`services/moderator/src/ai-providers/index.js` + `.../cortex.js` + `.../claude.js`,
`src/config/index.js` (cortex block L95–105), `src/modules/registry.js`,
`"/Volumes/Storage/MacOS LLM/models.ini"`, `"/Volumes/Storage/MacOS LLM/start-server.sh"`,
ADR `docs/adr/0001-cortex-in-process-inference-facade.md`, and the prior
`sprints/assessments/FEAT-023-024-cost-benefit.md` (the text-moderation precedent).

---

## Shared facts the three tickets ride on (verified in-repo)

- **One router, one semaphore.** `lib/llama.js` `chatComplete` already speaks the
  OpenAI content-part schema, so vision is just an `image_url` part — FEAT-030's
  core claim is correct. But every completion (text *and* vision) funnels through
  the **same** `withSlot` semaphore (`CORTEX_LLM_CONCURRENCY`, default 2) against
  the **same** router process. Vision calls therefore contend with interactive
  chat, agent tasks, FEAT-023 moderation, and FEAT-024 lowcode fields — they are
  not an isolated lane.
- **No vision config key exists yet.** `src/config/index.js` cortex block (L95–105)
  has `brainModel`/`judgeModel`/`llmConcurrency` but **no** `visionModel`. FEAT-030
  needs a new `CORTEX_VISION_MODEL` env + config key. (One-line change, but real.)
- **`sharp` is not declared by cortex.** It is in root `package.json` (`^0.33.1`)
  and `services/filevault/package.json`, so it resolves via hoisting — but
  `services/cortex/package.json` declares **no** dependencies at all. FEAT-030's
  "sharp (already a dependency)" is true only at the monorepo root; declare it in
  cortex's own manifest so the module isn't relying on a sibling's hoist.
- **The moderator cortex provider has no `analyzeImage`.** `services/moderator/src/ai-providers/cortex.js`
  implements `analyzeContent` (text) only. The cloud providers implement
  `analyzeImage({imageUrl,prompt,model,config})` (claude.js L208) which
  `ImageModerationAgent` calls. So FEAT-031's "reuse the existing `image_moderation`
  agent contract" needs **either** a new `analyzeImage` on the cortex provider
  **or** the FileVault worker calling `cortex.moderateImage(buffer)` directly and
  shaping the result into the pipeline. That integration is real work, part of why
  FEAT-031 is correctly an L.
- **Façade layering holds.** FEAT-030 adds to `services/cortex/src/client.js` and
  binds to `engine/agent.js` → `lib/llama.js`, never `engine/jobs.js` — consistent
  with ADR 0001. No new cycle. Good.

---

## FEAT-029 — Router multi-model residency + vision model

### Cost
- **Mechanical build: S.** Edit `models.ini` (add the VL-3B section + `mmproj`),
  bump `MODELS_MAX 1→2` in `start-server.sh`, drop the brain `ctx-size 16384→8192`,
  download the model, restart, verify `/models`. It touches the **external** router
  project only — **no** in-repo module/schema/registry change.
- **The cost is not code; it is operational risk + a platform-wide context
  regression.** Two things are being bought:
  1. **A catastrophic tail risk with a wide blast radius.** `models.ini` states it
     plainly: two big models resident overcommit Metal and poison the backend with
     `kIOGPUCommandBufferCallbackErrorOutOfMemory`. That is not a soft, per-request
     failure — a poisoned Metal backend takes down **all** inference, including the
     text brain that *every existing cortex feature depends on* (interactive chat,
     FEAT-021 agent tasks, FEAT-023 moderation if ever enforced, FEAT-024 lowcode
     fields). The user's own measurement leaves a **~1.5 GB margin** (projected
     24.3 GB vs a 25.8 GB ceiling) with 0.1 GB free and 5.5 GB already compressed —
     that is inside the noise band of transient compute-buffer spikes, which is
     exactly the condition `fit-target` exists to pad against and which the comment
     says "spike past it and poison the backend." launchd `KeepAlive` will restart
     the router, but recovery costs a **53.6 s cold reload** of the brain, during
     which the whole LLM layer is down.
  2. **A permanent halving of brain context for every text feature.** Dropping
     `ctx-size 16384→8192` is not free collateral. 8192 tokens ≈ 6k words of
     *combined* system + history + tool transcript + output. **What breaks first:**
     FEAT-021 agent tasks with long multi-step tool transcripts (the richest
     existing use — the agent loop accumulates every tool call + result), then CS
     chat history, then `llm_judge` guardrails on long inputs, then the FEAT-023
     moderator provider / FEAT-024 lowcode fields on large content. This is a
     silent quality regression across the whole text surface to buy image residency.

### Value
- Lower warm image latency and — the real prize — **not thrashing the brain out
  from under synchronous text callers.** That prize only matters if text load is
  *sustained*; see the ruling.

### Cheaper alternative / smaller slice — **swap-first (keep `MODELS_MAX=1`)**
Because FEAT-031 makes **all** image work async on a Bull queue that never blocks
an upload, a **53.6 s cold model swap is entirely tolerable** for an image job.
Keep `MODELS_MAX=1`, keep the brain at `ctx-size=16384`, and let the router's
existing LRU swap the VL model in when an image job runs. This buys:
- **Zero OOM risk** — one model resident is the regime `MODELS_MAX=1` was designed
  for; the catastrophic tail disappears.
- **Zero context regression** — the brain keeps 16384; no existing text feature degrades.
- **Zero router-project change beyond adding the model section** (no `MODELS_MAX`
  bump, no `ctx` cut — a genuinely smaller edit).

The cost of swap is **thrash**: an image burst evicts the brain (next text call
pays 53.6 s), and a text burst evicts the VL (next image job pays 53.6 s). *How bad
is that here?* Cortex's text workload is **sporadic and human-paced** — interactive
chat, occasional agent tasks, lowcode fields, and FEAT-023 moderation which is
`off`/`shadow` by default (not on the sync path). It is **not** a constant stream.
Sporadic-text × sporadic-image means occasional swaps, not continuous ping-pong —
and the async image queue **absorbs its own swap cost** by construction. The only
user-visible cost is an occasional 53.6 s cold reload on the first text call after
an image burst, and interactive cortex already tolerates cold starts (it is a known,
documented property — see the FEAT-023 note).

### Verdict — **build later / smaller slice (swap-first).**
Ship the vision chain on `MODELS_MAX=1` swap first. It costs almost nothing, carries
**no** OOM tail risk, and preserves full brain context. Co-residency trades a
permanent brain-context halving **and** a catastrophic backend-poisoning tail (blast
radius = the entire LLM layer, not just image jobs) for marginally better warm image
latency and avoidance of an occasional text cold-reload — on a **1.5 GB** Metal
margin that has not been load-tested. That trade is not worth buying on unproven
need. **Recommend: measure swap-thrash under real mixed load first; pursue
co-residency only if (a) the thrash is shown to actually hurt the sync text path AND
(b) a sustained load test proves the Metal margin holds without a single
`kIOGPU…OutOfMemory`.** The user chose co-residency as the target and may still land
it — but the analyst's cheaper, lower-risk, and *decoupling* path is swap-first, and
it removes FEAT-029 from the critical path of FEAT-030/031 entirely (they no longer
need to be `blocked-by` FEAT-029). If co-residency is pursued anyway, the
`mmproj-Q8_0` (0.84 GB vs f16 1.34 GB) fallback buys back ~0.5 GB of the margin and
should be the default, not the fallback, at a 1.5 GB headroom.

---

## FEAT-030 — Cortex vision inference surface (`describeImage` + `moderateImage`)

### Cost — **M, split S+M.**
- `describeImage(buffer,{mime})` → tags/alt-text: **S.** Content-part array +
  `sharp` normalize + prompt + parse. Fail-soft.
- `moderateImage(buffer)` → rule-engine score shape: **M**, because the cost is not
  the call — it is the **decode-safety surface** and the **eval harness** (below).
- New `CORTEX_VISION_MODEL` config key (`src/config/index.js`); declare `sharp` in
  `services/cortex/package.json`.
- **Decompression-bomb / decode DoS is a real, load-bearing cost, not a checkbox.**
  `sharp` is decoding untrusted user uploads on a worker. Required: an explicit
  `limitInputPixels` cap (sharp's default is ~268 MP — far too high; set e.g.
  24–50 MP), a pre-decode byte-size cap, `sequentialRead`, and a `failOn` policy for
  corrupt input. The AC "decode is bounded (pixel-count / decompression-bomb guard)"
  is correct and must not be treated as trivial.
- **Animated GIF/WebP frame sampling is a two-sided cost.** Frame-0-only misses
  abuse hidden in later frames (clean frame 0, NSFW frame 50) — a safety gap.
  Sampling N frames multiplies both `sharp` decode cost **and** VLM inference: each
  frame is another image part = more tokens against the 3B model's (already
  potentially 8192-if-co-resident) context, behind the concurrency-2 semaphore.
  Getting it wrong is expensive both ways. Recommend a **hard frame cap** (e.g. 3–5
  evenly sampled), each downscaled to the model max edge, as one moderation call.
- **EXIF/GPS strip before inference** (auto-orient then strip metadata) — AC covers
  it; cheap with sharp. Real privacy value.
- **No image bytes to `prompt_logs`** — the façade/engine must exclude base64 image
  parts from cortex's prompt-log persistence (both a privacy and a table-bloat
  issue). AC covers it; verify it actually holds in the engine path.

### Value
- `describeImage`: **strong, low-risk** — alt-text (accessibility) + tags (search)
  across every module that stores images, at zero marginal cost, no bytes off-host.
- `moderateImage`: **conditional** — see the eval gate. Valuable as a first-pass
  triage/recall layer feeding human review; **not** valuable (and actively
  dangerous) as a sole automated safety verdict from a 3B model.

### Verdict — **build now (tagging) / gate (moderation), smaller slice.**
Ship `describeImage` now: fail-soft, non-safety-critical, no eval gate needed.
`moderateImage` builds in the same ticket but **ships behind a shadow/eval harness**
and may only *escalate* to human review, never auto-clear (see the moderation
ruling). Split the ticket if capacity is tight: describeImage (S) first, moderateImage
+ eval (M) second.

---

## FEAT-031 — FileVault upload chokepoint: async image moderation + tagging

### Cost — **L (correctly sized).**
- New **Bull queue + worker process** (operational cost: another running process to
  supervise, like `worker:timeline`/`worker:cortex`). → **dba** for queue topology.
- **Persistence of tags/alt-text + verdict.** If these land on **new columns of the
  existing** `Attachment` / FileVault object tables, this hits the platform's
  **ALTER-on-existing-table trap**: sync `db:migrate` CREATES tables but does **not**
  ALTER them, so a new column needs its migration `up()` run directly or **every
  query on that table 500s** (CLAUDE.md; STATUS #1). This is a mandatory **dba**
  coordination item — do not let it land as a bare model edit. A new side-table keyed
  by attachment id avoids the trap (sync creates new tables fine) and is the safer
  shape; dba to choose.
- **New cross-module coupling:** FileVault → cortex (façade) **and** FileVault →
  moderator (image_moderation pipeline). Plus the missing `analyzeImage` on the
  cortex moderator-provider (or a direct `cortex.moderateImage` call shaped into the
  pipeline). → **systems-architect** for the coupling + contract choice.
- **skip-encrypted must be verified on both sides:** `Attachment.encrypted` (spark
  path) **and** FileVault-native encrypted objects. FEAT-026 already establishes the
  degrade-don't-decrypt precedent for text; mirror it exactly. An encrypted object
  must never be decoded or sent to the model (AC covers it — verify against both
  encryption flags).
- **QA cost:** the AC "upload latency unchanged (verified)" needs a real
  before/after measurement, and the fail-open-on-cortex-down path needs a test. →
  **qa-specialist**; do not credit the non-blocking suite.

### Value
- **One integration covers five surfaces** (Nexus, Spark, Live chat, timeline all
  store FileVault pointers) — genuinely high leverage vs five per-module hooks. This
  is the right chokepoint.
- Async-by-construction means the safety-critical latency concern that dominated
  FEAT-023 (cold 53.6 s on the *sync* publish path) **does not apply here** — which
  is also precisely why FEAT-029 co-residency is not needed to make this work.

### Cost vs cloud vision moderation
Local wins decisively on the axes that matter for a platform storing user images:
- **Marginal cost: $0.** Cloud content moderation runs **~$1.00 / 1,000 images**
  (AWS Rekognition, tier 1) to **~$1.50 / 1,000** (Google Vision SafeSearch);
  claude/openai vision (moderator's existing `analyzeImage` providers) are higher
  per call and scale with image tokens. At platform image volumes this is a real,
  recurring line item that local eliminates.
- **Data egress / privacy: none.** No image bytes leave the host — a strong
  posture for user-uploaded content vs shipping every image to a third party.
- **Latency:** cloud ~300–800 ms vs local warm ~2–3 s (+ possible swap/queue). But
  the work is **async**, so latency is not a decision factor here.
- **Where cloud wins: quality/reliability on the safety verdict.** A purpose-built
  cloud moderation model out-recalls a general 3B VLM. That is exactly what the eval
  gate is for, and why the design keeps human review in the loop.

### Verdict — **build later / smaller slice (gated on FEAT-030 slice + eval).**
The async-chokepoint design is sound and the leverage is real. Ship it, but:
(1) it is `blocked-by` FEAT-030's `moderateImage`-behind-eval slice, not just
FEAT-030 existing; (2) the verdict may **only escalate** to moderator's existing
review queue — never auto-clear/auto-approve an image — until vision recall clears
the bar; (3) tags/alt-text (fail-soft) can wire in **ahead of** the moderation
verdict, delivering accessibility/search value at zero safety risk. Route the queue
+ persistence to **dba** (ALTER trap) and the coupling + provider-contract choice to
**systems-architect** before build.

---

## The two rulings the user asked for

### Ruling 1 — co-residency vs swap: **swap-first.**
Co-residency buys marginally-better warm image latency and avoids an occasional
text cold-reload. It costs a **permanent halving of brain context** for every text
feature **and** a **catastrophic backend-poisoning tail** whose blast radius is the
entire LLM layer, bought on a **1.5 GB** un-load-tested Metal margin. Because image
work is async, the swap alternative's only real cost — thrash — is (a) mostly
absorbed by the async image queue and (b) bounded, since cortex text load is
sporadic and human-paced, not sustained. Ship on `MODELS_MAX=1`, keep `ctx=16384`,
measure swap-thrash under real mixed load, and only then decide whether co-residency
is worth buying. This also **decouples** FEAT-030/031 from FEAT-029.

### Ruling 2 — vision moderation eval gate: **yes, and stricter than FEAT-023.**
FEAT-023 forced the *30B text* moderation provider into `shadow`/`off`-by-default
until a per-category accuracy benchmark cleared. A **3B vision** model doing
NSFW/violence screening is a **smaller model on a harder modality with a
higher-cost false negative** (a missed explicit image *published* is a legal/trust
catastrophe, far worse than a missed toxic comment). So the bar is at least as high.
Two design constraints make it safe to ship *early* without a benchmark blocking:
- **Escalate-only, never auto-clear.** The vision verdict may add an item to
  moderator's existing human-review queue or raise its priority; it must **never**
  remove an image from review by scoring it "clean." "Fail closed" here means *on
  low confidence or error, route to a human*, not *on a clean score, publish*. So a
  weak model can only ever add review load — it cannot create a safety gap — which
  is what makes human-in-the-loop genuinely derisking.
- **Shadow eval before any automated gating.** Run `moderateImage` in shadow against
  a labelled set (and against the cloud `analyzeImage` provider if a key exists) to
  measure **per-category recall** — NSFW/violence especially — before its score is
  allowed to drive any automated action beyond escalation.
- **CSAM caveat (flag to PM/architect):** a general 3B VLM is **not** a CSAM
  classifier and must not be represented as one. CSAM detection is a specialized,
  legally-fraught domain (hash-matching / PhotoDNA / NCMEC reporting duties) and is
  **out of scope** for this local VLM. The tickets' "CSAM-adjacent" framing should
  not imply cortex fulfills a CSAM-detection obligation.

### Smallest sensible first slice
1. **FEAT-030 `describeImage`** (tags/alt-text, fail-soft) + decode/bomb guards +
   `CORTEX_VISION_MODEL` config + declare `sharp` — on `MODELS_MAX=1` swap. No eval
   gate. Ships accessibility + search value at near-zero risk and exercises the
   whole sharp/router vision path.
2. **FEAT-030 `moderateImage` in shadow** + an eval harness (per-category recall vs
   labels/cloud). Still `MODELS_MAX=1`.
3. **FEAT-031 tags/alt-text wiring** into the FileVault async chokepoint (fail-soft),
   *then* the moderation verdict **escalate-only** once shadow recall clears the bar.
4. **FEAT-029 co-residency** — build later, only if swap-thrash is measured to hurt
   the sync text path AND a load test proves the Metal margin. Prefer `mmproj-Q8_0`.

---

## Handoffs
- **product-manager** — all three assessed; groom. FEAT-030 tagging is groomable to
  `ready` now; FEAT-031 and FEAT-030-moderation carry the escalate-only + eval
  constraints; FEAT-029 is *build-later/swap-first* and can be **decoupled** from the
  FEAT-030/031 chain (drop the `blocked-by: FEAT-029`).
- **systems-architect** — FEAT-031 cross-module coupling (FileVault→cortex +
  FileVault→moderator) and the `analyzeImage`-on-cortex-provider vs
  `cortex.moderateImage`-direct contract choice; confirm the vision surface stays
  bound to `engine/agent.js` (ADR 0001). FEAT-029's `ctx` cut is a platform-wide
  config regression on the external router affecting every in-repo cortex consumer.
- **dba** — FEAT-031 new Bull queue + worker process, and tags/alt-text/verdict
  persistence: **ALTER-on-existing-table trap** if columns are added to
  `Attachment`/FileVault tables (sync `db:migrate` won't ALTER → 500s); prefer a new
  side-table. Confirm the shape before build.
- **qa-specialist** — FEAT-031 "upload latency unchanged" needs a real before/after
  measurement + fail-open-on-cortex-down test; FEAT-030 the eval/shadow recall
  harness. Do not credit the non-blocking suite.

Sources: [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/) ·
[Google Cloud Vision pricing](https://cloud.google.com/vision/pricing)
