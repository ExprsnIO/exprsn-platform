/**
 * ═══════════════════════════════════════════════════════════
 * Rules Engine Integration Tests
 *
 * NOTE: this suite was rewritten to exercise the rule engine's ACTUAL
 * public API. The previous version asserted a CRUD-style service
 * (createRule/updateRule/deleteRule/getRules/...) that has never existed
 * on `ruleEngineService` (confirmed against the original standalone
 * moderator service too) — rule persistence is owned by the
 * `ModerationRule` model and `routes/rules.js`, not the engine.
 * ═══════════════════════════════════════════════════════════
 */

const ruleEngineService = require('../../services/ruleEngineService');
const { ModerationRule } = require('../../models/sequelize-index');

const ADMIN_ID = 'eeeeeeee-0000-4000-8000-000000000001';

/**
 * Persist a moderation rule via the model (the engine reads, it does not write).
 */
const createRule = (overrides = {}) =>
  ModerationRule.create({
    name: `Rule ${Math.random().toString(36).slice(2)}`,
    description: 'Test rule',
    action: 'flag',
    conditions: {},
    enabled: true,
    priority: 50,
    createdBy: ADMIN_ID,
    ...overrides
  });

describe('Rule Engine Service Integration', () => {
  describe('evaluateRules', () => {
    it('matches content against an enabled keyword rule', async () => {
      await createRule({
        name: 'Block spam keyword',
        action: 'flag',
        priority: 70,
        conditions: { keywords: ['spam'], keyword_match: 'any' }
      });

      const result = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'this post is spam' },
        { riskScore: 10 }
      );

      expect(result.matched).toBe(true);
      expect(result.action).toBe('flag');
      expect(result.rule).toBeDefined();
      expect(result.rule.name).toBe('Block spam keyword');
    });

    it('returns no match for safe content', async () => {
      await createRule({
        name: 'Block spam keyword',
        conditions: { keywords: ['spam'], keyword_match: 'any' }
      });

      const result = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'a perfectly nice post' },
        { riskScore: 10 }
      );

      expect(result.matched).toBe(false);
      expect(result.rule).toBeNull();
      expect(result.action).toBeNull();
    });

    it('ignores disabled rules', async () => {
      await createRule({
        name: 'Disabled keyword rule',
        enabled: false,
        conditions: { keywords: ['spam'], keyword_match: 'any' }
      });

      const result = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'this post is spam' },
        { riskScore: 10 }
      );

      expect(result.matched).toBe(false);
    });

    it('respects the threshold score', async () => {
      await createRule({
        name: 'High risk only',
        action: 'reject',
        thresholdScore: 80,
        conditions: {}
      });

      const below = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'anything' },
        { riskScore: 50 }
      );
      expect(below.matched).toBe(false);

      const above = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'anything' },
        { riskScore: 90 }
      );
      expect(above.matched).toBe(true);
      expect(above.action).toBe('reject');
    });

    it('only applies to the configured content types', async () => {
      await createRule({
        name: 'Images only',
        appliesTo: ['image'],
        conditions: {}
      });

      const post = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'text' },
        { riskScore: 10 }
      );
      expect(post.matched).toBe(false);

      const image = await ruleEngineService.evaluateRules(
        { contentType: 'image', contentText: 'text' },
        { riskScore: 10 }
      );
      expect(image.matched).toBe(true);
    });

    it('returns the highest-priority matching rule first', async () => {
      await createRule({
        name: 'Low priority',
        action: 'flag',
        priority: 10,
        conditions: { keywords: ['urgent'], keyword_match: 'any' }
      });
      await createRule({
        name: 'High priority',
        action: 'escalate',
        priority: 95,
        conditions: { keywords: ['urgent'], keyword_match: 'any' }
      });

      const result = await ruleEngineService.evaluateRules(
        { contentType: 'post', contentText: 'this is urgent' },
        { riskScore: 10 }
      );

      expect(result.matched).toBe(true);
      expect(result.rule.name).toBe('High priority');
      expect(result.action).toBe('escalate');
    });
  });

  describe('applyKeywordFilters', () => {
    it('reports matched keywords', async () => {
      const result = await ruleEngineService.applyKeywordFilters(
        'free money scam offer',
        ['scam', 'lottery']
      );

      expect(result.matched).toBe(true);
      expect(result.keywords).toContain('scam');
      expect(result.count).toBe(1);
    });

    it('returns no match when nothing hits', async () => {
      const result = await ruleEngineService.applyKeywordFilters('hello world', [
        'scam'
      ]);

      expect(result.matched).toBe(false);
      expect(result.keywords).toEqual([]);
    });
  });

  describe('applyRegexFilters', () => {
    it('detects matching patterns', async () => {
      const result = await ruleEngineService.applyRegexFilters(
        'contact me at user@example.com',
        [{ name: 'email', pattern: '[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}', flags: 'i' }]
      );

      expect(result.matched).toBe(true);
      expect(result.count).toBe(1);
      expect(result.patterns[0].name).toBe('email');
    });

    it('ignores invalid regex without throwing', async () => {
      const result = await ruleEngineService.applyRegexFilters('text', [
        { name: 'bad', pattern: '[' }
      ]);

      expect(result.matched).toBe(false);
    });
  });

  // NOTE (BUG-008): no `applyCustomRules` describe block here — that method
  // never existed on `ruleEngineService` (confirmed against the source; the
  // real API is `evaluateRules`/`applyKeywordFilters`/`applyRegexFilters`).
  // The behavior it was meant to cover — aggregating multiple custom rules
  // and picking a winner — is already exercised above via `evaluateRules`
  // ("returns the highest-priority matching rule first", two simultaneously
  // matching rules). The private `_applyCustomRules` wrapper on
  // `moderationService` (a thin call into `evaluateRules`) is covered via
  // `moderateContent` in `tests/integration/moderation.test.js`.
});
