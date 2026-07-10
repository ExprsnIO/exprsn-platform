'use strict';

/**
 * BUG-019 — an image verdict must drive moderator's review-queue routing.
 *
 * Before this, the FileVault worker handed moderator the image's ALT TEXT and let
 * the text analyzer score it. A pornographic image with the alt-text "two people"
 * scored ~0, so `requiresManualReview` was false: the image was held from view
 * (fail-safe) but never actually reached a human. These tests pin the fix — the
 * caller's precomputed image scores are what moderator reasons about.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// jest.mock factories are hoisted, so anything they close over must be
// `mock`-prefixed.
const mockCreated = [];
jest.mock('../../src/ai-providers', () => ({
  analyzeContent: jest.fn(),
  getShadowProviders: jest.fn().mockReturnValue([]),
  analyzeShadow: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
// moderationService pulls models from `../models/sequelize-index` and imports
// `ModerationCase`, aliasing it to `ModerationItem`.
jest.mock('../../models/sequelize-index', () => ({
  ModerationCase: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (v) => { mockCreated.push(v); return { id: 'mi-1', ...v, get: () => v }; }),
  },
  ReviewQueue: { create: jest.fn() },
  ModerationAction: { create: jest.fn() },
}));
jest.mock('../../services/ruleEngineService', () => ({
  evaluateRules: jest.fn().mockResolvedValue(null),
}));

const { analyzeContent } = require('../../src/ai-providers');
const moderationService = require('../../services/moderationService');
const created = mockCreated;

// A real cortex vision verdict for an unsafe image: high nsfw, high overall.
const IMAGE_VERDICT = {
  provider: 'cortex', model: 'qwen2.5-vl-3b',
  riskScore: 93, nsfwScore: 96, violenceScore: 4, hateSpeechScore: 0, selfHarmScore: 0,
  toxicityScore: 0, spamScore: 0, sentimentScore: 50,
  flags: ['nsfw'], explanation: 'explicit content',
};

const baseParams = {
  contentType: 'image',
  contentId: 'file-1',
  sourceService: 'filevault',
  userId: '11111111-1111-4111-8111-111111111111',
};

beforeEach(() => {
  jest.clearAllMocks();
  created.length = 0;
});

describe('moderateContent with a precomputed image verdict (BUG-019)', () => {
  test('does NOT invoke the text analyzer', async () => {
    await moderationService.moderateContent({
      ...baseParams,
      contentText: 'two people',
      precomputedResult: IMAGE_VERDICT,
    });

    expect(analyzeContent).not.toHaveBeenCalled();
  });

  test('the IMAGE risk (not the alt-text) is what gets persisted', async () => {
    await moderationService.moderateContent({
      ...baseParams,
      contentText: 'two people', // innocuous alt-text; the old bug scored THIS
      precomputedResult: IMAGE_VERDICT,
    });

    expect(created.length).toBeGreaterThan(0);
    const item = created[0];
    expect(item.riskScore).toBe(93);
    expect(item.aiProvider).toBe('cortex');
    // 93 >= the review threshold (51), so a human must be pulled in.
    expect(item.requiresReview).toBe(true);
  });

  test('without a precomputed verdict the text analyzer still runs (unchanged path)', async () => {
    analyzeContent.mockResolvedValue({
      provider: 'deepseek', riskScore: 2, toxicityScore: 1, nsfwScore: 0,
      spamScore: 0, violenceScore: 0, hateSpeechScore: 0, sentimentScore: 50, flags: [],
    });
    await moderationService.moderateContent({
      ...baseParams, contentType: 'text', contentText: 'hello',
    });

    expect(analyzeContent).toHaveBeenCalled();
  });

  test('a benign image verdict does not force review', async () => {
    await moderationService.moderateContent({
      ...baseParams,
      contentText: 'a cat',
      precomputedResult: { ...IMAGE_VERDICT, riskScore: 3, nsfwScore: 0, flags: [] },
    });

    expect(created[0].requiresReview).toBe(false);
  });
});
