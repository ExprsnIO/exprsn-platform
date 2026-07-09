/**
 * ═══════════════════════════════════════════════════════════
 * Cortex (local-LLM) Moderation Provider — FEAT-023, ADR 0001
 *
 * Same contract as the cloud providers (claude/openai/deepseek): a single
 * `analyzeContent(content)` returning the score shape `ruleEngineService`
 * consumes. The difference is where inference happens — an in-process call to
 * the cortex module's local llama.cpp router, so no content leaves the host and
 * there is no per-call API spend.
 *
 * FAIL-CLOSED (ADR 0001 §Point 5). Moderation is safety-critical: this provider
 * is *the verdict*, not a layer on top of one. Any router failure, timeout, or
 * unparseable response THROWS, so `AIProviderFactory` runs its fallback chain
 * (and, if no provider succeeds, `moderateContent` surfaces the failure rather
 * than silently passing unmoderated content). It never returns a synthetic
 * "safe" score.
 *
 * Bounded latency: the local router serialises completions behind
 * CORTEX_LLM_CONCURRENCY (default 2). Measured warm p99 ≈ 2.8s; a cold model
 * load cost 53.6s. The 5s default timeout covers the warm path and cuts off
 * cold/queued calls instead of inheriting chatComplete's 600s transport
 * timeout. Keep the brain model warm (see ADR) if you select this provider on
 * the synchronous publish path.
 * ═══════════════════════════════════════════════════════════
 */

const cortex = require('../../../cortex/src/client');
const logger = require('../utils/logger');

const TIMEOUT_MS = parseInt(process.env.CORTEX_MODERATION_TIMEOUT_MS, 10) || 5000;

const SYSTEM =
  'You are a content moderation AI that analyzes content for safety issues and provides structured JSON responses.';

const SCORE_KEYS = [
  'toxicity_score',
  'nsfw_score',
  'spam_score',
  'violence_score',
  'hate_speech_score',
  'sentiment_score',
  'overall_risk_score',
];

class CortexProvider {
  constructor(config = {}) {
    this.model = config.model || process.env.CORTEX_BRAIN_MODEL || null;
    this.temperature = config.temperature ?? 0.3;
    this.timeoutMs = config.timeoutMs || TIMEOUT_MS;
  }

  async analyzeContent(content) {
    const started = Date.now();
    let raw;
    try {
      raw = await cortex.complete(SYSTEM, this._buildModerationPrompt(content), {
        model: this.model,
        temperature: this.temperature,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      // Disabled / router down / timed out — fail closed, let the factory fall back.
      logger.error('Cortex moderation unavailable', {
        code: error.code,
        error: error.message,
        ms: Date.now() - started,
      });
      throw new Error(`Cortex provider error: ${error.message}`);
    }

    const result = this._parseResponse(raw);
    logger.info('Cortex moderation analysis completed', {
      model: result.model,
      riskScore: result.riskScore,
      ms: Date.now() - started,
    });
    return result;
  }

  /** Mirrors the cloud providers' prompt so scores stay comparable across providers. */
  _buildModerationPrompt(content) {
    return `Analyze the following content for moderation purposes and respond with a JSON object.

Content Type: ${content.type || 'text'}
Content: ${content.text || ''}

Evaluate the content across these dimensions:
1. **Toxicity**: Offensive language, personal attacks, harassment, bullying
2. **NSFW**: Adult content, sexual content, explicit material
3. **Spam**: Promotional content, repetitive messages, bot-like behavior
4. **Violence**: Threats, graphic violence, gore, violent imagery
5. **Hate Speech**: Discrimination, slurs, targeted harassment based on identity
6. **Sentiment**: Overall emotional tone, scored 0 (very positive) … 50 (neutral) … 100 (very negative)

Provide scores from 0-100 for each dimension where:
- 0-30: Safe, no issues
- 31-50: Minor concerns
- 51-75: Moderate risk
- 76-90: High risk
- 91-100: Critical violation

Respond with ONLY a valid JSON object:
{
  "toxicity_score": <number 0-100>,
  "nsfw_score": <number 0-100>,
  "spam_score": <number 0-100>,
  "violence_score": <number 0-100>,
  "hate_speech_score": <number 0-100>,
  "sentiment_score": <number 0-100, 0=very positive, 100=very negative>,
  "overall_risk_score": <number 0-100>,
  "flags": [<array of specific issues>],
  "explanation": "<brief explanation>"
}`;
  }

  /**
   * Local models usually emit bare JSON (measured 5/5), but unlike the cloud
   * providers there is no `response_format: json_object` guarantee — so fall
   * back to extracting the first JSON object before giving up.
   */
  _parseResponse(raw) {
    const text = String(raw ?? '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          /* fall through to the throw below */
        }
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      logger.error('Failed to parse cortex moderation response', { content: text.slice(0, 200) });
      throw new Error('Failed to parse cortex response');
    }

    const num = (key) => (typeof parsed[key] === 'number' ? parsed[key] : null);

    // A missing/garbled score is NOT 0 ("safe") — that would fail open. Reject
    // the response and let the factory fall back to another provider.
    const missing = SCORE_KEYS.filter((k) => num(k) === null && k !== 'sentiment_score');
    if (missing.length) {
      logger.error('Cortex moderation response missing scores', { missing });
      throw new Error(`Cortex response missing scores: ${missing.join(', ')}`);
    }

    return {
      provider: 'cortex',
      model: this.model || 'cortex-brain',
      riskScore: parsed.overall_risk_score,
      toxicityScore: parsed.toxicity_score,
      nsfwScore: parsed.nsfw_score,
      spamScore: parsed.spam_score,
      violenceScore: parsed.violence_score,
      hateSpeechScore: parsed.hate_speech_score,
      // 0=very positive … 100=very negative; neutral (50) when omitted. Nullish
      // coalescing so a legitimate 0 survives (same as the deepseek provider).
      sentimentScore: parsed.sentiment_score ?? 50,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      explanation: parsed.explanation || '',
      rawResponse: parsed,
    };
  }

  async healthCheck() {
    const h = await cortex.health();
    if (!h.enabled) return { available: false, error: 'CORTEX_ENABLED is false' };
    if (!h.up) return { available: false, error: h.error || 'llama router unreachable' };
    return { available: true, model: h.brain };
  }
}

module.exports = CortexProvider;
