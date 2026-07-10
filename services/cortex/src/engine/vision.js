'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Vision inference (FEAT-030, ADR 0002).
 *
 * Sits in the INFERENCE layer beside engine/agent.js — deliberately NOT in
 * engine/jobs.js. That is what keeps image bytes out of `cortex.prompt_logs`:
 * `logPrompt()` is only ever called from jobs.js, and nothing here calls it.
 * Do not "helpfully" add telemetry that echoes the messages array.
 *
 * Two callers, two failure policies (enforced by the façade, not here — this
 * module just throws):
 *   moderateImage → fail CLOSED  (the verdict is a safety decision)
 *   describeImage → fail SOFT    (a missing caption must not block an upload)
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const config = require('../config');
const { chatComplete, modelSupportsImages, listModels, loadModel } = require('../lib/llama');
const { normalize, toDataUri } = require('../lib/image');

// Never log the messages array, a data: URI, or an image buffer (ADR 0002 §4).
const logger = createLogger('exprsn-cortex-vision');

const MODERATION_SYSTEM =
  'You are an image moderation AI. You analyze images for safety issues and ' +
  'respond with a single valid JSON object and nothing else.';

const CAPTION_SYSTEM =
  'You are an image understanding AI. You describe images factually and ' +
  'respond with a single valid JSON object and nothing else.';

const MODERATION_PROMPT = `Analyze this image for content moderation.

Score each dimension 0-100 (0 = clearly absent, 100 = clearly present):
- nsfw: nudity, sexual content, explicit material
- violence: gore, injury, weapons used against people, graphic harm
- hate_symbol: extremist insignia, hate symbols, targeted harassment imagery
- self_harm: depictions of self-injury or suicide
- overall_risk: your overall assessment of how unsafe this image is

If the image is ambiguous or you are unsure, score conservatively (higher), because
a human reviews anything you flag.

Respond with ONLY this JSON object:
{"nsfw_score":<0-100>,"violence_score":<0-100>,"hate_symbol_score":<0-100>,"self_harm_score":<0-100>,"overall_risk_score":<0-100>,"flags":[<short strings>],"explanation":"<one sentence>"}`;

// `text_in_image` was dropped from the schema: the 3B model deterministically
// emitted a truncated key for it (`…,"text_in_image:"}`), which is invalid JSON,
// so EVERY caption failed and fail-soft silently dropped all tags. OCR is not
// worth a prompt the model cannot satisfy — reinstate it only with a model that
// demonstrably emits it.
const CAPTION_PROMPT = `Describe this image.

Respond with ONLY this JSON object:
{"alt_text":"<one factual sentence for a screen reader>","tags":[<3-8 short lowercase labels>]}`;

const NUMERIC = [
  'nsfw_score',
  'violence_score',
  'hate_symbol_score',
  'self_harm_score',
  'overall_risk_score',
];

class VisionUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CortexVisionUnavailableError';
    this.code = 'VISION_UNAVAILABLE';
    this.statusCode = 503;
  }
}

// Preflight is memoized on success only: a positive answer is stable for the
// process, while a negative one usually means "operator is still wiring it up".
let capabilityOk = false;
async function assertVisionCapable() {
  if (capabilityOk) return config.cortex.visionModel;
  const model = config.cortex.visionModel;
  if (!model) {
    throw new VisionUnavailableError('no vision model configured (CORTEX_VISION_MODEL)');
  }
  let supported;
  try {
    supported = await modelSupportsImages(model);
  } catch (err) {
    throw new VisionUnavailableError(`cannot reach the model router: ${err.message}`);
  }
  if (!supported) {
    throw new VisionUnavailableError(
      `model "${model}" does not accept image input — a llama.cpp VL model reports ` +
      'text-only unless its mmproj projector is loaded',
    );
  }
  capabilityOk = true;
  return model;
}

/** Test seam: forget the memoized preflight. */
function resetCapabilityCache() {
  capabilityOk = false;
}

/**
 * Make sure the vision model is actually RESIDENT before we send it an image.
 *
 * Under `MODELS_MAX=1` (the swap-first posture, FEAT-029) any preceding text
 * call evicts the VL model. Sending a completion mid-load does NOT block — the
 * router answers with an empty/unusable body, which surfaced as a spurious
 * "no parseable JSON" on the first image job after any text job. Loading
 * explicitly makes the ~53s swap deterministic and keeps the failure modes
 * honest: a real load failure throws instead of masquerading as a bad verdict.
 *
 * The load is serialized by the vision pool, so a batch of queued image jobs
 * pays the swap once and then runs warm.
 */
// Overridable so tests can poll fast without faking timers (sharp's async work
// is real I/O and does not settle under jest fake timers).
const LOAD_POLL_MS = Number(process.env.CORTEX_VISION_LOAD_POLL_MS) || 2000;
const LOAD_WAIT_MAX_MS = Number(process.env.CORTEX_VISION_LOAD_WAIT_MS) || 300000;

function statusOf(entry) {
  if (!entry) return null;
  const s = entry.status;
  return s && s.value !== undefined ? s.value : s;
}

async function routerStatus(model) {
  try {
    const data = await listModels();
    return statusOf((data.data || []).find((m) => m.id === model));
  } catch (err) {
    throw new VisionUnavailableError(`cannot reach the model router: ${err.message}`);
  }
}

/**
 * Block until `model` is actually resident, loading it if necessary.
 *
 * Two router behaviours make this fiddlier than "call /models/load and go", and
 * both were observed live:
 *  - `POST /models/load` is ASYNCHRONOUS. It can return 200 while the model is
 *    still `loading`. Returning here on that 200 sends the completion mid-load,
 *    and the router answers with an empty body.
 *  - While anything is `loading`, a concurrent load is REFUSED (non-2xx), and
 *    loading an already-`loaded` model is refused too.
 *
 * So: poll the real status, nudge with a load only from `unloaded`, and treat a
 * refused load as a transient race rather than a failure.
 */
async function ensureVisionResident(model) {
  const deadline = Date.now() + LOAD_WAIT_MAX_MS;
  let nudged = false;

  for (;;) {
    const status = await routerStatus(model);
    if (status === 'loaded') return;
    if (status === null) {
      throw new VisionUnavailableError(`vision model "${model}" is not registered with the router`);
    }
    if (status === 'unloaded' && !nudged) {
      nudged = true;
      // A refusal here means another load is in flight — fall through and wait.
      await loadModel(model).catch(() => {});
    }
    if (Date.now() >= deadline) {
      throw new VisionUnavailableError(
        `vision model "${model}" not resident after ${LOAD_WAIT_MAX_MS}ms (status: ${status})`,
      );
    }
    await new Promise((r) => setTimeout(r, LOAD_POLL_MS));
  }
}

// The vision model wraps its JSON in markdown fences (measured), unlike the text
// brain which emits it bare — so extraction is the norm here, not the fallback.
function parseJsonObject(raw) {
  const text = String(raw ?? '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Ask for a JSON object, once, and retry a single time if the model returns
 * something unparseable.
 *
 * A 3B VL model emits invalid JSON intermittently — observed live:
 * `{"alt_text":"…","tags":[…],"text_in_image:"}` (truncated key, no value) on a
 * prompt that had just parsed cleanly. Without a retry, `describeImage`'s
 * fail-soft policy would silently drop tags on a fraction of every upload, and a
 * `moderateImage` verdict would escalate a perfectly benign image to a human.
 *
 * The retry does NOT weaken the verdict: a second failure still throws, and a
 * malformed verdict is never salvaged into scores. It only removes an avoidable
 * coin flip. Warm inference is ~250ms, so the cost is negligible.
 */
async function completeJson(model, frames, system, prompt, maxTokens, what) {
  // The retry MUST differ from the first attempt. At temperature 0.1 the model is
  // near-deterministic, so re-sending the identical request reproduces the
  // identical malformed output — a retry that cannot possibly succeed. Raising
  // the temperature lets the second sample escape a bad completion.
  const temperatures = [0.1, 0.7];
  for (let attempt = 0; attempt < temperatures.length; attempt++) {
    const raw = await complete(model, frames, system, prompt, maxTokens, temperatures[attempt]);
    const parsed = parseJsonObject(raw);
    if (parsed) return parsed;
    logger.warn('vision model returned unparseable JSON', {
      what, attempt: attempt + 1, temperature: temperatures[attempt],
    });
  }
  throw new Error(`vision model returned no parseable JSON ${what}`);
}

async function complete(model, frames, system, prompt, maxTokens, temperature = 0.1) {
  await ensureVisionResident(model);
  const content = [{ type: 'text', text: prompt }];
  for (const frame of frames) {
    content.push({ type: 'image_url', image_url: { url: toDataUri(frame) } });
  }
  const data = await chatComplete(
    model,
    [{ role: 'system', content: system }, { role: 'user', content }],
    { temperature, max_tokens: maxTokens },
    { pool: 'vision', timeoutMs: config.cortex.visionTimeoutMs },
  );
  const choice = (data.choices || [])[0];
  const text = ((choice && choice.message && choice.message.content) || '').trim();
  // An empty body is what the router returns when it answered mid-load. Call it
  // what it is rather than letting it surface as "the model wrote bad JSON".
  if (!text) {
    throw new VisionUnavailableError('vision model returned an empty completion');
  }
  // Truncation yields half a JSON object; the parse error downstream would be
  // misleading, so name the real cause.
  if (choice.finish_reason === 'length') {
    throw new Error(`vision response truncated at ${maxTokens} tokens`);
  }
  return text;
}

/**
 * Moderation verdict. Throws on anything it cannot answer confidently — the
 * caller must treat that as "escalate to a human", never as "safe".
 * Returns the score shape moderator's rule engine already consumes.
 */
async function moderateImage(buffer) {
  const model = await assertVisionCapable();
  const { frames, meta } = await normalize(buffer);
  const parsed = await completeJson(model, frames, MODERATION_SYSTEM, MODERATION_PROMPT, 400, 'verdict');

  // A missing score is NOT 0 ("safe") — refuse the response instead of
  // silently fabricating a clean verdict.
  const missing = NUMERIC.filter((k) => typeof parsed[k] !== 'number');
  if (missing.length) {
    throw new Error(`vision verdict missing scores: ${missing.join(', ')}`);
  }

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    provider: 'cortex',
    model,
    riskScore: clamp(parsed.overall_risk_score),
    nsfwScore: clamp(parsed.nsfw_score),
    violenceScore: clamp(parsed.violence_score),
    hateSpeechScore: clamp(parsed.hate_symbol_score),
    selfHarmScore: clamp(parsed.self_harm_score),
    // Not assessable from pixels; the rule engine expects these keys.
    toxicityScore: 0,
    spamScore: 0,
    sentimentScore: 50,
    flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    explanation: String(parsed.explanation || ''),
    imageMeta: meta, // dimensions/format/frames sampled — no pixel data
  };
}

/** Tags + alt-text. Best-effort; the façade turns failures into a soft skip. */
async function describeImage(buffer) {
  const model = await assertVisionCapable();
  const { frames, meta } = await normalize(buffer);
  const parsed = await completeJson(model, frames, CAPTION_SYSTEM, CAPTION_PROMPT, 300, 'description');

  const tags = Array.isArray(parsed.tags)
    ? [...new Set(parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 8)
    : [];
  return {
    model,
    altText: String(parsed.alt_text || '').trim(),
    tags,
    // Kept in the shape for callers, but no longer requested from the model —
    // it is `''` unless a future model reliably returns `text_in_image`.
    textInImage: String(parsed.text_in_image || '').trim(),
    imageMeta: meta,
  };
}

module.exports = {
  moderateImage,
  describeImage,
  assertVisionCapable,
  ensureVisionResident,
  resetCapabilityCache,
  parseJsonObject,
  VisionUnavailableError,
};
