/**
 * ═══════════════════════════════════════════════════════════
 * Content Classification Service
 * Orchestrates AI providers and classification pipeline
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../config');
const logger = require('../utils/logger');
const claudeAI = require('./claudeAI');
const openAI = require('./openAI');
const { DomainSettings, ModerationKeyword } = require('../models');
const cache = require('../utils/cache');

class ClassificationService {
  constructor() {
    this.config = config.moderation;
  }

  /**
   * Classify content (text, images, or both)
   * @param {Object} content - Content to classify
   * @param {string} content.text - Text content (optional)
   * @param {Array<string>} content.images - Image URLs (optional)
   * @param {string} domain - CA domain for settings
   * @returns {Promise<Object>} Classification result
   */
  async classifyContent(content, domain) {
    try {
      logger.info('Starting content classification', {
        hasText: !!content.text,
        imageCount: content.images?.length || 0,
        domain
      });

      // Load domain settings
      const domainSettings = await this._getDomainSettings(domain);

      // Determine content type
      const hasText = content.text && content.text.trim().length > 0;
      const hasImages = content.images && content.images.length > 0;

      let classification;

      if (hasText && hasImages) {
        // Multimodal content
        classification = await this._classifyMultimodal(content.text, content.images, domainSettings);
      } else if (hasText) {
        // Text only
        classification = await this._classifyText(content.text, domainSettings);
      } else if (hasImages) {
        // Images only
        classification = await this._classifyImages(content.images, domainSettings);
      } else {
        throw new Error('No content to classify');
      }

      // Apply custom rules
      const withRules = await this._applyCustomRules(classification, domainSettings);

      // Check keywords
      const withKeywords = await this._checkKeywords(withRules, domainSettings);

      // Calculate final risk score
      const final = this._calculateFinalRiskScore(withKeywords);

      // Determine action
      const withAction = this._determineAction(final);

      logger.info('Content classification completed', {
        riskScore: withAction.riskScore,
        riskLevel: withAction.riskLevel,
        action: withAction.action
      });

      return withAction;

    } catch (error) {
      logger.error('Content classification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Classify text content
   */
  async _classifyText(text, domainSettings) {
    const results = [];

    // Try Claude AI first if enabled
    if (config.ai.claude.enabled) {
      try {
        const claudeResult = await claudeAI.analyzeText(text, { domainSettings });
        results.push(claudeResult);
      } catch (error) {
        logger.warn('Claude text analysis failed, falling back', { error: error.message });
      }
    }

    // Use OpenAI as primary or fallback
    if (config.ai.openai.enabled && results.length === 0) {
      try {
        // Use both moderation API and detailed analysis
        const moderationResult = await openAI.moderateText(text);
        const analysisResult = await openAI.analyzeText(text, { domainSettings });

        // Combine results
        const combined = this._combineResults([moderationResult, analysisResult]);
        results.push(combined);
      } catch (error) {
        logger.warn('OpenAI text analysis failed', { error: error.message });
      }
    }

    if (results.length === 0) {
      throw new Error('All AI providers failed for text classification');
    }

    // Average results if multiple providers used
    return results.length > 1 ? this._averageResults(results) : results[0];
  }

  /**
   * Classify image content
   */
  async _classifyImages(imageUrls, domainSettings) {
    const allResults = [];

    for (const imageUrl of imageUrls) {
      const results = [];

      // Try Claude AI first if enabled
      if (config.ai.claude.enabled) {
        try {
          const claudeResult = await claudeAI.analyzeImage(imageUrl, { domainSettings });
          results.push(claudeResult);
        } catch (error) {
          logger.warn('Claude image analysis failed', { error: error.message, imageUrl });
        }
      }

      // Use OpenAI as primary or fallback
      if (config.ai.openai.enabled && results.length === 0) {
        try {
          const openaiResult = await openAI.analyzeImage(imageUrl, { domainSettings });
          results.push(openaiResult);
        } catch (error) {
          logger.warn('OpenAI image analysis failed', { error: error.message, imageUrl });
        }
      }

      if (results.length > 0) {
        allResults.push(results.length > 1 ? this._averageResults(results) : results[0]);
      }
    }

    if (allResults.length === 0) {
      throw new Error('All AI providers failed for image classification');
    }

    // Take the highest risk score from all images
    return this._takeHighestRisk(allResults);
  }

  /**
   * Classify multimodal content (text + images)
   */
  async _classifyMultimodal(text, imageUrls, domainSettings) {
    const results = [];

    // Try Claude AI first if enabled
    if (config.ai.claude.enabled) {
      try {
        const claudeResult = await claudeAI.analyzeMultimodal(text, imageUrls, { domainSettings });
        results.push(claudeResult);
      } catch (error) {
        logger.warn('Claude multimodal analysis failed', { error: error.message });
      }
    }

    // Use OpenAI as primary or fallback
    if (config.ai.openai.enabled && results.length === 0) {
      try {
        const openaiResult = await openAI.analyzeMultimodal(text, imageUrls, { domainSettings });
        results.push(openaiResult);
      } catch (error) {
        logger.warn('OpenAI multimodal analysis failed', { error: error.message });
      }
    }

    if (results.length === 0) {
      throw new Error('All AI providers failed for multimodal classification');
    }

    return results.length > 1 ? this._averageResults(results) : results[0];
  }

  /**
   * Get domain-specific moderation settings
   */
  async _getDomainSettings(domain) {
    const cacheKey = `domain:settings:${domain}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const settings = await DomainSettings.findOne({ where: { domain, enabled: true } });

      if (!settings) {
        // Return default settings
        return {
          domain,
          customRules: [],
          keywords: [],
          thresholds: this.config.thresholds
        };
      }

      // Load associated rules and keywords
      const rules = await settings.getRules({ where: { enabled: true } });
      const keywords = await settings.getKeywords({ where: { enabled: true } });

      const domainSettings = {
        domain: settings.domain,
        customRules: rules || [],
        keywords: keywords || [],
        thresholds: settings.thresholds || this.config.thresholds
      };

      // Cache for 10 minutes
      await cache.set(cacheKey, JSON.stringify(domainSettings), 600);

      return domainSettings;

    } catch (error) {
      logger.error('Failed to load domain settings', { error: error.message, domain });
      return {
        domain,
        customRules: [],
        keywords: [],
        thresholds: this.config.thresholds
      };
    }
  }

  /**
   * Apply custom moderation rules
   */
  async _applyCustomRules(classification, domainSettings) {
    const rules = domainSettings.customRules;

    if (!rules || rules.length === 0) {
      return classification;
    }

    let adjustedRiskScore = classification.riskScore;
    const appliedRules = [];

    for (const rule of rules) {
      if (this._ruleMatches(rule, classification)) {
        adjustedRiskScore += rule.scoreAdjustment || 0;
        appliedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          adjustment: rule.scoreAdjustment
        });
      }
    }

    return {
      ...classification,
      riskScore: Math.max(0, Math.min(100, adjustedRiskScore)),
      appliedRules
    };
  }

  /**
   * Check if rule matches classification
   */
  _ruleMatches(rule, classification) {
    // Check if any flagged category matches rule criteria
    if (rule.targetCategories && rule.targetCategories.length > 0) {
      const hasMatch = rule.targetCategories.some(cat =>
        classification.flaggedCategories.includes(cat)
      );
      if (hasMatch) return true;
    }

    // Check if risk score is in rule's range
    if (rule.minRiskScore !== undefined && classification.riskScore < rule.minRiskScore) {
      return false;
    }
    if (rule.maxRiskScore !== undefined && classification.riskScore > rule.maxRiskScore) {
      return false;
    }

    return true;
  }

  /**
   * Check for flagged keywords
   */
  async _checkKeywords(classification, domainSettings) {
    const keywords = domainSettings.keywords;

    if (!keywords || keywords.length === 0) {
      return classification;
    }

    const detectedKeywords = [];
    let keywordScoreAdjustment = 0;

    const contentText = classification.contentText || '';

    for (const keyword of keywords) {
      const pattern = keyword.isRegex
        ? new RegExp(keyword.keyword, 'gi')
        : new RegExp(`\\b${keyword.keyword}\\b`, 'gi');

      const matches = contentText.match(pattern);

      if (matches) {
        detectedKeywords.push({
          keyword: keyword.keyword,
          severity: keyword.severity,
          matchCount: matches.length
        });

        // Adjust score based on severity
        const severityScores = {
          low: 5,
          medium: 15,
          high: 30,
          critical: 50
        };

        keywordScoreAdjustment += severityScores[keyword.severity] || 0;
      }
    }

    if (detectedKeywords.length > 0) {
      return {
        ...classification,
        riskScore: Math.max(0, Math.min(100, classification.riskScore + keywordScoreAdjustment)),
        detectedKeywords
      };
    }

    return classification;
  }

  /**
   * Calculate final risk score
   */
  _calculateFinalRiskScore(classification) {
    const {
      toxicityScore = 0,
      hateSpeechScore = 0,
      harassmentScore = 0,
      violenceScore = 0,
      nsfwScore = 0,
      spamScore = 0
    } = classification;

    // Weighted average with higher weight on severe categories
    const weights = {
      toxicity: 0.8,
      hateSpeech: 1.0,
      harassment: 0.85,
      violence: 0.95,
      nsfw: 0.9,
      spam: 0.5
    };

    const weightedScore =
      (toxicityScore * weights.toxicity +
        hateSpeechScore * weights.hateSpeech +
        harassmentScore * weights.harassment +
        violenceScore * weights.violence +
        nsfwScore * weights.nsfw +
        spamScore * weights.spam) /
      Object.values(weights).reduce((a, b) => a + b, 0);

    // Use max of AI-provided risk score and calculated weighted score
    const finalRiskScore = Math.max(classification.riskScore, Math.round(weightedScore));

    // Determine risk level
    let riskLevel = 'SAFE';
    for (const [level, config] of Object.entries(this.config.riskLevels)) {
      if (finalRiskScore >= config.min && finalRiskScore <= config.max) {
        riskLevel = level;
        break;
      }
    }

    return {
      ...classification,
      riskScore: finalRiskScore,
      riskLevel
    };
  }

  /**
   * Determine moderation action based on risk score
   */
  _determineAction(classification) {
    const riskLevel = classification.riskLevel;
    const levelConfig = this.config.riskLevels[riskLevel];

    return {
      ...classification,
      action: levelConfig.action,
      requiresReview: levelConfig.review,
      escalate: levelConfig.escalate || false
    };
  }

  /**
   * Combine results from multiple sources
   */
  _combineResults(results) {
    if (results.length === 1) return results[0];

    const combined = {
      riskScore: 0,
      toxicityScore: 0,
      hateSpeechScore: 0,
      harassmentScore: 0,
      violenceScore: 0,
      nsfwScore: 0,
      spamScore: 0,
      flaggedCategories: [],
      detectedKeywords: [],
      reasoning: '',
      confidence: 0
    };

    // Average scores
    results.forEach(result => {
      combined.riskScore += result.riskScore || 0;
      combined.toxicityScore += result.toxicityScore || 0;
      combined.hateSpeechScore += result.hateSpeechScore || 0;
      combined.harassmentScore += result.harassmentScore || 0;
      combined.violenceScore += result.violenceScore || 0;
      combined.nsfwScore += result.nsfwScore || 0;
      combined.spamScore += result.spamScore || 0;
      combined.confidence += result.confidence || 50;

      if (result.flaggedCategories) {
        combined.flaggedCategories.push(...result.flaggedCategories);
      }
      if (result.detectedKeywords) {
        combined.detectedKeywords.push(...result.detectedKeywords);
      }
    });

    const count = results.length;
    combined.riskScore = Math.round(combined.riskScore / count);
    combined.toxicityScore = Math.round(combined.toxicityScore / count);
    combined.hateSpeechScore = Math.round(combined.hateSpeechScore / count);
    combined.harassmentScore = Math.round(combined.harassmentScore / count);
    combined.violenceScore = Math.round(combined.violenceScore / count);
    combined.nsfwScore = Math.round(combined.nsfwScore / count);
    combined.spamScore = Math.round(combined.spamScore / count);
    combined.confidence = Math.round(combined.confidence / count);

    // Deduplicate categories and keywords
    combined.flaggedCategories = [...new Set(combined.flaggedCategories)];
    combined.detectedKeywords = [...new Set(combined.detectedKeywords)];

    return combined;
  }

  /**
   * Average results from multiple providers
   */
  _averageResults(results) {
    return this._combineResults(results);
  }

  /**
   * Take highest risk from multiple results
   */
  _takeHighestRisk(results) {
    return results.reduce((highest, current) => {
      return current.riskScore > highest.riskScore ? current : highest;
    }, results[0]);
  }
}

module.exports = new ClassificationService();
