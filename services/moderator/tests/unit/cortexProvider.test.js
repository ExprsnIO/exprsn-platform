'use strict';

/**
 * FEAT-023 — cortex moderation provider, shadow gating, and the cycle guard.
 * Pure unit tests: the cortex client and logger are mocked, so no DB, no Redis,
 * and no llama router is needed.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// The provider requires the cortex façade by relative path; mock that exact id.
const CLIENT = '../../../cortex/src/client';
jest.mock('../../../cortex/src/client', () => ({
  isEnabled: jest.fn(() => true),
  complete: jest.fn(),
  health: jest.fn(async () => ({ enabled: true, up: true, brain: 'test-brain' })),
}), { virtual: false });

const cortexClient = require(CLIENT);
const CortexProvider = require('../../src/ai-providers/cortex');

const GOOD = JSON.stringify({
  toxicity_score: 10, nsfw_score: 0, spam_score: 5, violence_score: 0,
  hate_speech_score: 0, sentiment_score: 20, overall_risk_score: 12,
  flags: ['mild'], explanation: 'ok',
});

beforeEach(() => jest.clearAllMocks());

describe('CortexProvider.analyzeContent', () => {
  test('maps the local-LLM JSON onto the shared score shape', async () => {
    cortexClient.complete.mockResolvedValue(GOOD);
    const result = await new CortexProvider({ model: 'm' }).analyzeContent({ text: 'hi', type: 'text' });

    expect(result.provider).toBe('cortex');
    expect(result.riskScore).toBe(12);
    expect(result.toxicityScore).toBe(10);
    expect(result.spamScore).toBe(5);
    expect(result.sentimentScore).toBe(20);
    expect(result.flags).toEqual(['mild']);
  });

  test('extracts JSON even when the model wraps it in prose/fences', async () => {
    cortexClient.complete.mockResolvedValue('Sure!\n```json\n' + GOOD + '\n```');
    const result = await new CortexProvider().analyzeContent({ text: 'hi' });
    expect(result.riskScore).toBe(12);
  });

  test('a legitimate sentiment of 0 (very positive) survives', async () => {
    cortexClient.complete.mockResolvedValue(JSON.stringify({
      toxicity_score: 0, nsfw_score: 0, spam_score: 0, violence_score: 0,
      hate_speech_score: 0, sentiment_score: 0, overall_risk_score: 0,
    }));
    const result = await new CortexProvider().analyzeContent({ text: 'lovely' });
    expect(result.sentimentScore).toBe(0);
  });

  test('missing sentiment defaults to neutral 50', async () => {
    cortexClient.complete.mockResolvedValue(JSON.stringify({
      toxicity_score: 0, nsfw_score: 0, spam_score: 0, violence_score: 0,
      hate_speech_score: 0, overall_risk_score: 0,
    }));
    const result = await new CortexProvider().analyzeContent({ text: 'x' });
    expect(result.sentimentScore).toBe(50);
  });

  // --- fail-closed: the provider IS the verdict, so it must never invent "safe"
  test('THROWS when the LLM is unavailable (never returns a safe score)', async () => {
    cortexClient.complete.mockRejectedValue(Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));
    await expect(new CortexProvider().analyzeContent({ text: 'x' })).rejects.toThrow(/router down/);
  });

  test('THROWS when cortex is disabled', async () => {
    cortexClient.complete.mockRejectedValue(Object.assign(new Error('not enabled'), { code: 'CORTEX_DISABLED' }));
    await expect(new CortexProvider().analyzeContent({ text: 'x' })).rejects.toThrow(/not enabled/);
  });

  test('THROWS on an unparseable response', async () => {
    cortexClient.complete.mockResolvedValue('I cannot help with that.');
    await expect(new CortexProvider().analyzeContent({ text: 'x' })).rejects.toThrow(/parse/i);
  });

  test('THROWS when score fields are missing rather than defaulting them to 0', async () => {
    cortexClient.complete.mockResolvedValue(JSON.stringify({ overall_risk_score: 0 }));
    await expect(new CortexProvider().analyzeContent({ text: 'x' })).rejects.toThrow(/missing scores/);
  });

  test('passes a bounded timeout to the client', async () => {
    cortexClient.complete.mockResolvedValue(GOOD);
    await new CortexProvider({ timeoutMs: 1234 }).analyzeContent({ text: 'x' });
    expect(cortexClient.complete).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.objectContaining({ timeoutMs: 1234 }),
    );
  });
});

// ---------------------------------------------------------------- factory
// The factory is a singleton constructed at require time from env, so each
// scenario needs a fresh module registry.
function freshFactory(env) {
  let factory;
  jest.isolateModules(() => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    factory = require('../../src/ai-providers/index');
    process.env = prev;
  });
  return factory;
}

describe('AIProviderFactory — cortex registration & shadow gating', () => {
  test('cortex is absent when CORTEX_MODERATION_MODE is off (default)', () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'off', DEEPSEEK_API_KEY: 'k' });
    expect(f.getAvailableProviders()).not.toContain('cortex');
  });

  test('cortex is absent when the module itself is disabled', () => {
    const f = freshFactory({ CORTEX_ENABLED: 'false', CORTEX_MODERATION_MODE: 'enforce', DEEPSEEK_API_KEY: 'k' });
    expect(f.getAvailableProviders()).not.toContain('cortex');
  });

  test('shadow mode registers cortex but bars it from producing a verdict', () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'shadow', DEEPSEEK_API_KEY: 'k' });
    expect(f.getAvailableProviders()).toContain('cortex');
    expect(f.getShadowProviders()).toEqual(['cortex']);
    // explicit per-request override cannot promote it
    expect(() => f.getProvider('cortex')).toThrow(/shadow mode/);
    // nor can it be the default pick
    expect(f.getDefaultProvider()).not.toBe(f.providers.get('cortex'));
  });

  test('shadow-mode cortex never satisfies "a provider is configured"', () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'shadow' });
    expect(() => f.getDefaultProvider()).toThrow(/No AI providers configured/);
  });

  test('enforce mode makes cortex a first-class selectable provider', () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'enforce' });
    expect(() => f.getProvider('cortex')).not.toThrow();
    expect(f.getDefaultProvider()).toBe(f.providers.get('cortex'));
  });

  // --- the cycle guard
  test('exclude bars cortex from direct selection', async () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'enforce' });
    await expect(f.analyzeContent({ text: 'x' }, 'cortex', { exclude: ['cortex'] }))
      .rejects.toThrow(/not permitted/);
  });

  test('exclude bars cortex from the FALLBACK chain too', async () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'enforce', DEEPSEEK_API_KEY: 'k' });
    // make the default (deepseek) fail so the fallback chain runs
    f.providers.get('deepseek').analyzeContent = jest.fn().mockRejectedValue(new Error('cloud down'));
    const cortexSpy = jest.fn();
    f.providers.get('cortex').analyzeContent = cortexSpy;

    await expect(f.analyzeContent({ text: 'x' }, null, { exclude: ['cortex'] }))
      .rejects.toThrow(/All AI providers failed/);
    expect(cortexSpy).not.toHaveBeenCalled(); // the loop guard held
  });

  test('without exclude, cortex IS reachable via the fallback chain', async () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'enforce', DEEPSEEK_API_KEY: 'k' });
    f.defaultProvider = 'deepseek';
    f.providers.get('deepseek').analyzeContent = jest.fn().mockRejectedValue(new Error('cloud down'));
    f.providers.get('cortex').analyzeContent = jest.fn().mockResolvedValue({ provider: 'cortex', riskScore: 1 });

    const result = await f.analyzeContent({ text: 'x' });
    expect(result.provider).toBe('cortex');
  });

  test('analyzeShadow returns null (never throws) when the shadow provider fails', async () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'shadow', DEEPSEEK_API_KEY: 'k' });
    f.providers.get('cortex').analyzeContent = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(f.analyzeShadow('cortex', { text: 'x' })).resolves.toBeNull();
  });

  test('analyzeShadow refuses to score with a non-shadow provider', async () => {
    const f = freshFactory({ CORTEX_ENABLED: 'true', CORTEX_MODERATION_MODE: 'enforce', DEEPSEEK_API_KEY: 'k' });
    await expect(f.analyzeShadow('cortex', { text: 'x' })).resolves.toBeNull();
  });
});
