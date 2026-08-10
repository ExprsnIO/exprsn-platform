/**
 * ═══════════════════════════════════════════════════════════
 * Base Agent Class
 * Abstract base class for all moderation agents
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../src/utils/logger');

class BaseAgent {
  constructor(config, provider) {
    this.config = config;
    this.provider = provider;
    this.name = config.name;
    this.type = config.type;
  }

  /**
   * Execute the agent
   * Must be implemented by subclasses
   * @param {Object} content - Content to analyze
   * @returns {Object} Analysis result
   */
  async execute(content) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Calculate risk score from individual scores
   * @param {Object} scores - Individual risk scores
   * @returns {number} Overall risk score (0-100)
   */
  calculateRiskScore(scores) {
    const weights = {
      toxicity: 0.25,
      nsfw: 0.20,
      spam: 0.15,
      violence: 0.25,
      hateSpeech: 0.15
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, score] of Object.entries(scores)) {
      const weight = weights[key] || 0.1;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Apply threshold to determine if content violates policy
   * @param {number} score - Risk score
   * @param {string} category - Risk category
   * @returns {boolean} Whether threshold is exceeded
   */
  exceedsThreshold(score, category) {
    const thresholds = this.config.thresholdScores || {};
    const threshold = thresholds[category] || 75;
    return score >= threshold;
  }

  /**
   * Determine action based on risk score
   * @param {number} riskScore - Overall risk score
   * @returns {string} Recommended action
   */
  determineAction(riskScore) {
    const config = this.config.config || {};

    if (riskScore <= (config.autoApproveThreshold || 30)) {
      return 'auto_approve';
    } else if (riskScore <= (config.reviewThreshold || 75)) {
      return 'require_review';
    } else if (riskScore <= (config.rejectThreshold || 90)) {
      return 'flag';
    } else {
      return 'reject';
    }
  }

  /**
   * Log agent activity
   */
  log(level, message, metadata = {}) {
    logger[level](`[${this.name}] ${message}`, {
      agent: this.name,
      type: this.type,
      ...metadata
    });
  }

  /**
   * Validate content before analysis
   */
  validateContent(content) {
    if (!content.contentType) {
      throw new Error('Content type is required');
    }

    if (!content.contentId) {
      throw new Error('Content ID is required');
    }

    if (!content.contentText && !content.contentUrl) {
      throw new Error('Either contentText or contentUrl is required');
    }

    return true;
  }

  /**
   * Format result for consistency
   */
  formatResult(scores, action = null, confidence = 0, metadata = {}) {
    return {
      scores,
      action: action || this.determineAction(this.calculateRiskScore(scores)),
      confidence,
      metadata,
      timestamp: Date.now()
    };
  }
}

module.exports = BaseAgent;
