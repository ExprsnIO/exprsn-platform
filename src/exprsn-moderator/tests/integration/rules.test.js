/**
 * ═══════════════════════════════════════════════════════════
 * Rules Engine Integration Tests
 * ═══════════════════════════════════════════════════════════
 */

const ruleEngineService = require('../../services/ruleEngineService');
const { ModerationRule } = require('../../models/sequelize-index');

describe('Rule Engine Service Integration', () => {
  describe('createRule', () => {
    it('should create custom moderation rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Block Spam Keywords',
        description: 'Automatically flag content with spam keywords',
        ruleType: 'keyword',
        conditions: {
          keywords: ['spam', 'scam', 'free money'],
          matchType: 'any'
        },
        actions: [
          {
            type: 'flag',
            reason: 'Contains spam keywords'
          }
        ],
        priority: 80,
        enabled: true,
        createdBy: 'admin-123'
      });

      expect(rule).toBeDefined();
      expect(rule.name).toBe('Block Spam Keywords');
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(80);
    });

    it('should create pattern matching rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Email Pattern Detection',
        description: 'Detect email addresses in posts',
        ruleType: 'pattern',
        conditions: {
          pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
          flags: 'gi'
        },
        actions: [
          {
            type: 'queue_review',
            reason: 'Contains email address'
          }
        ],
        priority: 60,
        enabled: true,
        createdBy: 'admin-123'
      });

      expect(rule).toBeDefined();
      expect(rule.ruleType).toBe('pattern');
    });

    it('should create user-based rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'New User Auto-Review',
        description: 'Auto-review content from users with <10 posts',
        ruleType: 'user',
        conditions: {
          accountAge: { max: 7 },
          postCount: { max: 10 }
        },
        actions: [
          {
            type: 'queue_review',
            reason: 'New user content'
          }
        ],
        priority: 50,
        enabled: true,
        createdBy: 'admin-123'
      });

      expect(rule).toBeDefined();
      expect(rule.ruleType).toBe('user');
    });
  });

  describe('evaluateRules', () => {
    beforeEach(async () => {
      // Create test rules
      await ruleEngineService.createRule({
        name: 'Test Keyword Rule',
        ruleType: 'keyword',
        conditions: {
          keywords: ['badword', 'offensive'],
          matchType: 'any'
        },
        actions: [
          {
            type: 'flag',
            reason: 'Contains offensive content'
          }
        ],
        priority: 70,
        enabled: true,
        createdBy: 'admin-123'
      });
    });

    it('should evaluate content against rules', async () => {
      const content = {
        text: 'This post contains a badword in it'
      };

      const matches = await ruleEngineService.evaluateRules(content, 'post');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matched).toBe(true);
      expect(matches[0].actions).toBeDefined();
    });

    it('should return empty array for safe content', async () => {
      const content = {
        text: 'This is completely safe content'
      };

      const matches = await ruleEngineService.evaluateRules(content, 'post');

      expect(matches.length).toBe(0);
    });

    it('should order matches by priority', async () => {
      await ruleEngineService.createRule({
        name: 'High Priority Rule',
        ruleType: 'keyword',
        conditions: {
          keywords: ['urgent'],
          matchType: 'any'
        },
        actions: [
          {
            type: 'escalate',
            reason: 'Urgent content'
          }
        ],
        priority: 95,
        enabled: true,
        createdBy: 'admin-123'
      });

      const content = {
        text: 'This is urgent badword content'
      };

      const matches = await ruleEngineService.evaluateRules(content, 'post');

      expect(matches.length).toBeGreaterThan(1);
      expect(matches[0].priority).toBeGreaterThanOrEqual(matches[1].priority);
    });
  });

  describe('updateRule', () => {
    it('should update rule configuration', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Test Rule',
        ruleType: 'keyword',
        conditions: { keywords: ['test'] },
        actions: [{ type: 'flag' }],
        priority: 50,
        enabled: true,
        createdBy: 'admin-123'
      });

      const updated = await ruleEngineService.updateRule(rule.id, {
        priority: 75,
        enabled: false
      });

      expect(updated.priority).toBe(75);
      expect(updated.enabled).toBe(false);
    });
  });

  describe('deleteRule', () => {
    it('should delete rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Rule To Delete',
        ruleType: 'keyword',
        conditions: { keywords: ['delete'] },
        actions: [{ type: 'flag' }],
        priority: 50,
        enabled: true,
        createdBy: 'admin-123'
      });

      await ruleEngineService.deleteRule(rule.id);

      const deleted = await ModerationRule.findByPk(rule.id);
      expect(deleted).toBeNull();
    });
  });

  describe('enableRule / disableRule', () => {
    it('should enable disabled rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Disabled Rule',
        ruleType: 'keyword',
        conditions: { keywords: ['test'] },
        actions: [{ type: 'flag' }],
        priority: 50,
        enabled: false,
        createdBy: 'admin-123'
      });

      const enabled = await ruleEngineService.enableRule(rule.id);

      expect(enabled.enabled).toBe(true);
    });

    it('should disable enabled rule', async () => {
      const rule = await ruleEngineService.createRule({
        name: 'Enabled Rule',
        ruleType: 'keyword',
        conditions: { keywords: ['test'] },
        actions: [{ type: 'flag' }],
        priority: 50,
        enabled: true,
        createdBy: 'admin-123'
      });

      const disabled = await ruleEngineService.disableRule(rule.id);

      expect(disabled.enabled).toBe(false);
    });
  });

  describe('getRules', () => {
    beforeEach(async () => {
      await ruleEngineService.createRule({
        name: 'Rule 1',
        ruleType: 'keyword',
        conditions: { keywords: ['test1'] },
        actions: [{ type: 'flag' }],
        priority: 50,
        enabled: true,
        createdBy: 'admin-123'
      });

      await ruleEngineService.createRule({
        name: 'Rule 2',
        ruleType: 'pattern',
        conditions: { pattern: 'test' },
        actions: [{ type: 'flag' }],
        priority: 60,
        enabled: false,
        createdBy: 'admin-123'
      });
    });

    it('should retrieve all rules', async () => {
      const rules = await ruleEngineService.getRules();

      expect(rules.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by enabled status', async () => {
      const enabledRules = await ruleEngineService.getRules({
        enabled: true
      });

      enabledRules.forEach(rule => {
        expect(rule.enabled).toBe(true);
      });
    });

    it('should filter by rule type', async () => {
      const keywordRules = await ruleEngineService.getRules({
        ruleType: 'keyword'
      });

      keywordRules.forEach(rule => {
        expect(rule.ruleType).toBe('keyword');
      });
    });

    it('should order rules by priority', async () => {
      const rules = await ruleEngineService.getRules();

      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });
});
