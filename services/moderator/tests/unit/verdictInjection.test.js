'use strict';

/**
 * Verdict-injection guard.
 *
 * `moderateContent({ precomputedResult })` lets an IN-PROCESS caller (the
 * FileVault worker) supply an already-computed image verdict, skipping the AI
 * provider. That is safe only because `POST /moderator/api/moderate/content`
 * destructures an explicit field allowlist and never forwards it.
 *
 * That route is UNAUTHENTICATED (SPIKE-001 / BUG-010). If someone ever "tidies"
 * the handler into `moderateContent(req.body)`, any anonymous caller could post
 * `precomputedResult: { riskScore: 0 }` to launder content as clean, or
 * `{ riskScore: 100 }` to grief another user's upload into the review queue.
 *
 * This test exists to make that refactor fail loudly.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const fs = require('fs');
const path = require('path');

describe('POST /api/moderate/content cannot inject a verdict', () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, '../../routes/moderation.js'), 'utf8');

  test('the route never references precomputedResult', () => {
    expect(routeSrc).not.toMatch(/precomputedResult/);
  });

  // The allowlist is the actual protection: an explicit destructure of req.body
  // into named fields, none of which is precomputedResult.
  test('the route destructures an explicit field allowlist, never spreads req.body', () => {
    expect(routeSrc).toMatch(/const\s*\{[\s\S]*?\}\s*=\s*req\.body/);
    // A spread of the body into the service call is the dangerous shape.
    expect(routeSrc).not.toMatch(/moderateContent\(\s*(\.\.\.)?req\.body/);
    expect(routeSrc).not.toMatch(/moderateContent\(\s*\{\s*\.\.\.req\.body/);
  });
});

describe('moderateContent honours a precomputed verdict only when given one', () => {
  const mockCreated = [];
  jest.mock('../../src/ai-providers', () => ({
    analyzeContent: jest.fn().mockResolvedValue({
      provider: 'deepseek', riskScore: 1, toxicityScore: 0, nsfwScore: 0,
      spamScore: 0, violenceScore: 0, hateSpeechScore: 0, sentimentScore: 50, flags: [],
    }),
    getShadowProviders: jest.fn().mockReturnValue([]),
    analyzeShadow: jest.fn(),
  }));
  jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }));
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

  const moderationService = require('../../services/moderationService');

  beforeEach(() => { mockCreated.length = 0; });

  // An undefined precomputedResult must fall back to the analyzer, not to a
  // permissive default. (`|| await analyzeContent(...)` — a falsy verdict object
  // would also fall through, which is the safe direction.)
  test('an absent verdict falls back to the analyzer, not to "clean"', async () => {
    await moderationService.moderateContent({
      contentType: 'text', contentId: 'c1', sourceService: 'qa',
      userId: '11111111-1111-4111-8111-111111111111', contentText: 'hi',
      precomputedResult: undefined,
    });
    expect(require('../../src/ai-providers').analyzeContent).toHaveBeenCalled();
    expect(mockCreated[0].aiProvider).toBe('deepseek');
  });
});
