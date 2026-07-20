'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Vision inference (FEAT-030 / FEAT-072 / FEAT-073, ADR 0002 + 0005).
 *
 * Sits in the INFERENCE layer beside engine/agent.js — deliberately NOT in
 * engine/jobs.js. That is what keeps image bytes out of `cortex.prompt_logs`:
 * `logPrompt()` is only ever called from jobs.js, and nothing here calls it.
 * Do not "helpfully" add telemetry that echoes the messages array.
 *
 * As of FEAT-072 this module no longer talks to a specific LLM server. It asks
 * the BACKEND REGISTRY (../backends) for a vision completion by ROLE, and the
 * registry resolves the model, verifies image support, manages residency, and
 * fails over from the llama.cpp primary to the Ollama secondary — all invisibly.
 * The answering backend is recorded on every verdict (`backend`).
 *
 * Callers, and their failure policies (enforced by the façade, not here — this
 * module just throws):
 *   moderateImage / moderateFrames → fail CLOSED  (a safety decision)
 *   describeImage / describeFrames → fail SOFT    (a caption must not block)
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const config = require('../config');
const registry = require('../backends');
const { VisionUnavailableError } = require('../backends/errors');
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

/**
 * Which vision backend/model would answer right now. Returns the model id
 * (façade shape). Throws VisionUnavailableError / BackendUnavailableError if
 * nothing is usable.
 */
async function assertVisionCapable() {
  const { model } = await registry.assertVisionCapable();
  return model;
}

/** Test seam: forget the memoized vision preflight (delegates to the registry). */
function resetCapabilityCache() {
  registry.resetVisionCache();
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
 * One vision completion for a set of frames, via the registry (failover-aware).
 * Returns { text, backend, model }. Throws on truncation and on backend
 * unavailability (the registry's job); an empty body is already rejected there.
 */
async function complete(frames, system, prompt, maxTokens, temperature = 0.1) {
  const content = [{ type: 'text', text: prompt }];
  for (const frame of frames) {
    content.push({ type: 'image_url', image_url: { url: toDataUri(frame) } });
  }
  const result = await registry.chatForRole(
    'vision',
    [{ role: 'system', content: system }, { role: 'user', content }],
    { temperature, max_tokens: maxTokens },
    { pool: 'vision', timeoutMs: config.cortex.visionTimeoutMs },
  );
  // Truncation yields half a JSON object; name the real cause rather than let
  // the parse error downstream mislead.
  if (result.finishReason === 'length') {
    throw new Error(`vision response truncated at ${maxTokens} tokens`);
  }
  return result;
}

/**
 * Ask for a JSON object, once, and retry a single time (at a higher temperature)
 * if the model returns something unparseable. This is a MODEL-QUALITY retry, not
 * a backend retry: it re-samples the same role and must NOT be confused with the
 * registry's availability failover. A second failure still throws (moderateImage
 * then escalates to a human; describeImage drops the caption).
 * Returns { parsed, backend, model }.
 */
async function completeJson(frames, system, prompt, maxTokens, what) {
  // The retry MUST differ from the first attempt: at temperature 0.1 the model
  // is near-deterministic, so re-sending reproduces the identical malformed
  // output. Raising the temperature lets the second sample escape it.
  const temperatures = [0.1, 0.7];
  for (let attempt = 0; attempt < temperatures.length; attempt++) {
    const { text, backend, model } = await complete(frames, system, prompt, maxTokens, temperatures[attempt]);
    const parsed = parseJsonObject(text);
    if (parsed) return { parsed, backend, model };
    logger.warn('vision model returned unparseable JSON', {
      what, attempt: attempt + 1, temperature: temperatures[attempt], backend,
    });
  }
  throw new Error(`vision model returned no parseable JSON ${what}`);
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Build a moderation verdict from a parsed model response. Throws if any required
 * score is missing (a missing score is NOT "safe" — refuse rather than fabricate
 * a clean verdict).
 */
function buildVerdict(parsed, backend, model, imageMeta) {
  const missing = NUMERIC.filter((k) => typeof parsed[k] !== 'number');
  if (missing.length) {
    throw new Error(`vision verdict missing scores: ${missing.join(', ')}`);
  }
  return {
    provider: 'cortex',
    backend,            // 'llamacpp' | 'ollama' — which server actually answered
    model,
    riskScore: clampScore(parsed.overall_risk_score),
    nsfwScore: clampScore(parsed.nsfw_score),
    violenceScore: clampScore(parsed.violence_score),
    hateSpeechScore: clampScore(parsed.hate_symbol_score),
    selfHarmScore: clampScore(parsed.self_harm_score),
    // Not assessable from pixels; the rule engine expects these keys.
    toxicityScore: 0,
    spamScore: 0,
    sentimentScore: 50,
    flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    explanation: String(parsed.explanation || ''),
    imageMeta,
  };
}

/**
 * Moderation verdict for a single image (still or animated). Throws on anything
 * it cannot answer confidently — the caller must treat that as "escalate to a
 * human", never as "safe".
 * Returns the score shape moderator's rule engine already consumes.
 * @param {Buffer} buffer raw image bytes (PNG/JPEG/GIF/WebP/AVIF/TIFF)
 */
async function moderateImage(buffer) {
  const { frames, meta } = await normalize(buffer);
  const { parsed, backend, model } = await completeJson(
    frames, MODERATION_SYSTEM, MODERATION_PROMPT, 400, 'verdict',
  );
  return buildVerdict(parsed, backend, model, meta);
}

/** Tags + alt-text for a single image. Best-effort; the façade turns failures into a soft skip. */
async function describeImage(buffer) {
  const { frames, meta } = await normalize(buffer);
  const { parsed, backend, model } = await completeJson(
    frames, CAPTION_SYSTEM, CAPTION_PROMPT, 300, 'description',
  );
  const tags = Array.isArray(parsed.tags)
    ? [...new Set(parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 8)
    : [];
  return {
    backend,
    model,
    altText: String(parsed.alt_text || '').trim(),
    tags,
    // Kept in the shape for callers, but no longer requested from the model.
    textInImage: String(parsed.text_in_image || '').trim(),
    imageMeta: meta,
  };
}

// ---------------------------------------------------------------- video (FEAT-073)
//
// Video is NOT one multi-image prompt: on a small CPU model that is the worst
// case for quality and latency, and it loses per-frame provenance. Each keyframe
// is moderated INDIVIDUALLY and the verdict is aggregated MAX-WINS — the riskiest
// frame decides — with an early exit once a frame is clearly unsafe (a human
// reviews it regardless, so paying for the remaining frames buys nothing).

/**
 * Moderate a list of pre-extracted video keyframe buffers (JPEG/PNG bytes from
 * ffmpeg). Fails CLOSED: any throw propagates. Returns a single aggregated
 * verdict in the SAME shape moderateImage returns, plus `frameScores` and the
 * count actually inspected (< total when the early exit fired).
 *
 * @param {Buffer[]} frameBuffers ordered keyframes
 * @param {{earlyExitAtRisk?: number}} [opts]
 */
async function moderateFrames(frameBuffers, { earlyExitAtRisk = 85 } = {}) {
  if (!Array.isArray(frameBuffers) || !frameBuffers.length) {
    throw new Error('moderateFrames requires at least one frame');
  }
  const agg = {
    provider: 'cortex', backend: null, model: null,
    riskScore: 0, nsfwScore: 0, violenceScore: 0, hateSpeechScore: 0,
    selfHarmScore: 0, toxicityScore: 0, spamScore: 0, sentimentScore: 50,
    flags: new Set(), explanation: '',
  };
  const frameScores = [];
  let inspected = 0;

  for (let i = 0; i < frameBuffers.length; i++) {
    const v = await moderateImage(frameBuffers[i]); // per-frame, fail-closed
    inspected += 1;
    agg.backend = v.backend;
    agg.model = v.model;
    if (v.riskScore >= agg.riskScore && v.explanation) agg.explanation = v.explanation;
    agg.riskScore = Math.max(agg.riskScore, v.riskScore);
    agg.nsfwScore = Math.max(agg.nsfwScore, v.nsfwScore);
    agg.violenceScore = Math.max(agg.violenceScore, v.violenceScore);
    agg.hateSpeechScore = Math.max(agg.hateSpeechScore, v.hateSpeechScore);
    agg.selfHarmScore = Math.max(agg.selfHarmScore, v.selfHarmScore);
    v.flags.forEach((f) => agg.flags.add(f));
    frameScores.push({ frame: i, riskScore: v.riskScore, flags: v.flags });

    if (v.riskScore >= earlyExitAtRisk) {
      logger.info('video moderation early-exit on high-risk frame', {
        frame: i, riskScore: v.riskScore, of: frameBuffers.length,
      });
      break;
    }
  }

  return {
    ...agg,
    flags: [...agg.flags],
    frameScores,
    framesInspected: inspected,
    framesTotal: frameBuffers.length,
  };
}

/**
 * Tags + alt-text for a video: describe a sample of keyframes and UNION the
 * tags. Best-effort — the façade turns a throw into a soft skip. Alt-text comes
 * from the first frame that produced one.
 * @param {Buffer[]} frameBuffers
 */
async function describeFrames(frameBuffers) {
  if (!Array.isArray(frameBuffers) || !frameBuffers.length) {
    throw new Error('describeFrames requires at least one frame');
  }
  const tags = new Set();
  let altText = '';
  let backend = null;
  let model = null;
  for (const buf of frameBuffers) {
    const d = await describeImage(buf);
    backend = d.backend; model = d.model;
    d.tags.forEach((t) => tags.add(t));
    if (!altText && d.altText) altText = d.altText;
  }
  return {
    backend,
    model,
    altText,
    tags: [...tags].slice(0, 12),
    textInImage: '',
  };
}

module.exports = {
  moderateImage,
  describeImage,
  moderateFrames,
  describeFrames,
  assertVisionCapable,
  resetCapabilityCache,
  parseJsonObject,
  buildVerdict,
  VisionUnavailableError,
};
