/**
 * ═══════════════════════════════════════════════════════════
 * Rule Engine Service
 * Evaluates moderation rules and applies custom policies
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../src/utils/logger');

class RuleEngineService {
  /**
   * Evaluate all active rules against content
   * @param {Object} content - Content to evaluate
   * @param {Object} scores - AI analysis scores
   * @returns {Promise<Object>} Rule evaluation result
   */
  async evaluateRules(content, scores) {
    try {
      const { ModerationRule } = require('../models/sequelize-index');

      // Get all active rules sorted by priority
      const rules = await ModerationRule.findAll({
        where: { enabled: true },
        order: [['priority', 'DESC']]
      });

      logger.debug('Evaluating rules', {
        ruleCount: rules.length,
        contentType: content.contentType,
        sourceService: content.sourceService
      });

      // Evaluate each rule
      for (const rule of rules) {
        const result = await this._evaluateRule(rule, content, scores);

        if (result.matches) {
          logger.info('Rule matched', {
            ruleName: rule.name,
            action: rule.action,
            contentId: content.contentId
          });

          return {
            matched: true,
            rule: {
              id: rule.id,
              name: rule.name,
              action: rule.action,
              priority: rule.priority
            },
            action: rule.action,
            reason: `Rule: ${rule.name}`
          };
        }
      }

      logger.debug('No rules matched', { contentId: content.contentId });

      return {
        matched: false,
        rule: null,
        action: null,
        reason: null
      };
    } catch (error) {
      logger.error('Rule evaluation failed', {
        error: error.message,
        contentId: content.contentId
      });
      throw error;
    }
  }

  /**
   * Evaluate a single rule
   * @private
   */
  async _evaluateRule(rule, content, scores) {
    // Check if rule applies to content type
    if (rule.appliesTo && rule.appliesTo.length > 0) {
      if (!rule.appliesTo.includes(content.contentType)) {
        return { matches: false };
      }
    }

    // Check if rule applies to source service
    if (rule.sourceServices && rule.sourceServices.length > 0) {
      if (!rule.sourceServices.includes(content.sourceService)) {
        return { matches: false };
      }
    }

    // Check threshold score
    if (rule.thresholdScore !== null && rule.thresholdScore !== undefined) {
      if (scores.riskScore < rule.thresholdScore) {
        return { matches: false };
      }
    }

    // Evaluate conditions
    if (rule.conditions) {
      const conditionsMet = await this._evaluateConditions(
        rule.conditions,
        content,
        scores
      );

      if (!conditionsMet) {
        return { matches: false };
      }
    }

    return { matches: true };
  }

  /**
   * Evaluate rule conditions
   * @private
   */
  async _evaluateConditions(conditions, content, scores) {
    // Min/max risk score
    if (conditions.min_risk_score !== undefined) {
      if (scores.riskScore < conditions.min_risk_score) {
        return false;
      }
    }

    if (conditions.max_risk_score !== undefined) {
      if (scores.riskScore > conditions.max_risk_score) {
        return false;
      }
    }

    // Individual score thresholds
    const scoreTypes = ['toxicity', 'nsfw', 'spam', 'violence', 'hateSpeech'];
    for (const scoreType of scoreTypes) {
      const minKey = `min_${scoreType}_score`;
      const maxKey = `max_${scoreType}_score`;
      const scoreKey = `${scoreType}Score`;

      if (conditions[minKey] !== undefined) {
        if (scores[scoreKey] < conditions[minKey]) {
          return false;
        }
      }

      if (conditions[maxKey] !== undefined) {
        if (scores[scoreKey] > conditions[maxKey]) {
          return false;
        }
      }
    }

    // Keyword matching
    if (conditions.keywords && content.contentText) {
      const keywords = Array.isArray(conditions.keywords)
        ? conditions.keywords
        : [conditions.keywords];

      const hasKeyword = keywords.some((keyword) =>
        content.contentText.toLowerCase().includes(keyword.toLowerCase())
      );

      if (conditions.keyword_match === 'any' && !hasKeyword) {
        return false;
      }

      if (conditions.keyword_match === 'all') {
        const allMatch = keywords.every((keyword) =>
          content.contentText.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!allMatch) {
          return false;
        }
      }
    }

    // Regex matching
    if (conditions.regex && content.contentText) {
      const regex = new RegExp(conditions.regex, conditions.regex_flags || 'i');
      if (!regex.test(content.contentText)) {
        return false;
      }
    }

    // Custom conditions can be added here
    // e.g., user reputation, time of day, content length, etc.

    return true;
  }

  /**
   * Apply keyword filters to text
   * @param {string} text - Text to filter
   * @param {Array} keywords - Keywords to check
   * @returns {Object} Filter result
   */
  async applyKeywordFilters(text, keywords = []) {
    if (!text || keywords.length === 0) {
      return { matched: false, keywords: [] };
    }

    const lowerText = text.toLowerCase();
    const matchedKeywords = keywords.filter((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    );

    return {
      matched: matchedKeywords.length > 0,
      keywords: matchedKeywords,
      count: matchedKeywords.length
    };
  }

  /**
   * Apply regex filters to text
   * @param {string} text - Text to filter
   * @param {Array} patterns - Regex patterns
   * @returns {Object} Filter result
   */
  async applyRegexFilters(text, patterns = []) {
    if (!text || patterns.length === 0) {
      return { matched: false, patterns: [] };
    }

    const matchedPatterns = [];

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.pattern, pattern.flags || 'i');
        if (regex.test(text)) {
          matchedPatterns.push({
            pattern: pattern.pattern,
            name: pattern.name,
            matches: text.match(regex)
          });
        }
      } catch (error) {
        logger.error('Invalid regex pattern', {
          pattern: pattern.pattern,
          error: error.message
        });
      }
    }

    return {
      matched: matchedPatterns.length > 0,
      patterns: matchedPatterns,
      count: matchedPatterns.length
    };
  }

  /**
   * Apply custom rules to content
   * @param {Object} content - Content to evaluate
   * @param {Object} customRules - Custom rules to apply
   * @returns {Promise<Object>} Result
   */
  async applyCustomRules(content, customRules) {
    const results = [];

    for (const rule of customRules) {
      try {
        const result = await this._evaluateCustomRule(rule, content);
        if (result.matched) {
          results.push(result);
        }
      } catch (error) {
        logger.error('Custom rule evaluation failed', {
          rule: rule.name,
          error: error.message
        });
      }
    }

    return {
      matched: results.length > 0,
      rules: results,
      count: results.length
    };
  }

  /**
   * Evaluate custom rule
   * @private
   */
  async _evaluateCustomRule(rule, content) {
    // Implement custom rule evaluation logic
    // This can be extended based on specific requirements

    return {
      matched: false,
      rule: rule.name,
      action: rule.action
    };
  }
}

module.exports = new RuleEngineService();
