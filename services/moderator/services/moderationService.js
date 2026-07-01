/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Service
 * Core business logic for content moderation
 * ═══════════════════════════════════════════════════════════
 */

const aiProviderFactory = require('../src/ai-providers');
const riskCalculator = require('../src/utils/risk-calculator');
const ruleEngineService = require('./ruleEngineService');
const logger = require('../src/utils/logger');
// Use the canonical Sequelize model layer (models/sequelize-index, the layer
// db:migrate syncs). The legacy raw-pg `../models` (BaseModel) is a different
// API — calling it with Sequelize-style options (e.g. findOne({ where })) emits
// invalid SQL, so this service was non-functional against it.
const {
  ModerationCase: ModerationItem,
  ReviewQueue,
  ModerationAction
} = require('../models/sequelize-index');

class ModerationService {
  /**
   * Moderate content
   * @param {Object} params - Moderation parameters
   * @returns {Promise<Object>} Moderation result
   */
  async moderateContent(params) {
    const {
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata = {},
      aiProvider = null
    } = params;

    logger.info('Starting content moderation', {
      contentType,
      contentId,
      sourceService,
      userId
    });

    try {
      // Check if already moderated
      const existing = await ModerationItem.findOne({
        where: {
          sourceService,
          contentType,
          contentId
        }
      });

      if (existing) {
        logger.info('Content already moderated', {
          moderationItemId: existing.id,
          status: existing.status
        });
        return this._formatModerationResult(existing);
      }

      // Analyze content with AI
      const aiResult = await aiProviderFactory.analyzeContent(
        {
          text: contentText,
          url: contentUrl,
          type: contentType
        },
        aiProvider
      );

      // Calculate overall risk if not provided
      const overallRisk = aiResult.riskScore || riskCalculator.calculateOverallRisk({
        toxicityScore: aiResult.toxicityScore,
        nsfwScore: aiResult.nsfwScore,
        spamScore: aiResult.spamScore,
        violenceScore: aiResult.violenceScore,
        hateSpeechScore: aiResult.hateSpeechScore
      });

      const riskLevel = riskCalculator.getRiskLevel(overallRisk);

      // Check custom rules (nested conditions, chaining, safeguards, sentiment)
      const ruleAction = await this._applyCustomRules({
        contentType,
        contentId,
        sourceService,
        contentText,
        contentMetadata,
        scores: aiResult,
        riskScore: overallRisk
      });

      // Determine action
      const requiresReview = riskCalculator.requiresManualReview(overallRisk, aiResult);
      const action = ruleAction || riskCalculator.determineAction(overallRisk, { requiresReview });

      // Create moderation item
      const moderationItem = await ModerationItem.create({
        contentType,
        contentId,
        sourceService,
        userId,
        contentText,
        contentUrl,
        contentMetadata,
        riskScore: overallRisk,
        riskLevel,
        toxicityScore: aiResult.toxicityScore,
        nsfwScore: aiResult.nsfwScore,
        spamScore: aiResult.spamScore,
        violenceScore: aiResult.violenceScore,
        hateSpeechScore: aiResult.hateSpeechScore,
        sentimentScore: aiResult.sentimentScore,
        aiProvider: aiResult.provider,
        aiModel: aiResult.model,
        aiResponse: aiResult.rawResponse || aiResult,
        status: this._getStatusFromAction(action),
        action,
        requiresReview,
        submittedAt: Date.now(),
        processedAt: Date.now()
      });

      // Add to review queue if needed
      if (requiresReview) {
        await this._addToReviewQueue(moderationItem, overallRisk);
      }

      // Log moderation action
      await this._logAction({
        action,
        contentType,
        contentId,
        sourceService,
        moderationItemId: moderationItem.id,
        isAutomated: true,
        reason: aiResult.explanation || `Risk score: ${overallRisk}`
      });

      logger.info('Content moderation completed', {
        moderationItemId: moderationItem.id,
        riskScore: overallRisk,
        riskLevel,
        action
      });

      // Route into matching queue buckets + trigger content_submitted workflows.
      // Best-effort and lazily required (never block/fail moderation on these).
      try {
        const triggerCtx = {
          contentType,
          contentId,
          sourceService,
          contentText,
          contentMetadata,
          authorDid: contentMetadata.authorDid,
          scores: { ...aiResult, riskScore: overallRisk },
          riskScore: overallRisk,
          action,
          moderationItemId: moderationItem.id
        };
        require('./queueRegistry').route(triggerCtx).catch(() => {});
        require('./workflowEngine').triggerForContent(triggerCtx).catch(() => {});
      } catch (hookErr) {
        logger.warn('Queue/workflow trigger failed', { error: hookErr.message });
      }

      return this._formatModerationResult(moderationItem);
    } catch (error) {
      logger.error('Content moderation failed', {
        error: error.message,
        contentType,
        contentId
      });
      throw error;
    }
  }

  /**
   * Get moderation status for content
   */
  async getModerationStatus(sourceService, contentType, contentId) {
    const item = await ModerationItem.findOne({
      where: {
        sourceService,
        contentType,
        contentId
      }
    });

    if (!item) {
      return null;
    }

    return this._formatModerationResult(item);
  }

  /**
   * Apply custom moderation rules via the rule engine (nested boolean
   * conditions, keyword/regex/sentiment leaves, rule chaining, and safeguard
   * rules). Returns the winning action string, or null if no rule matched.
   * @private
   */
  async _applyCustomRules(params) {
    const { contentType, contentId, sourceService, contentText, contentMetadata = {}, scores, riskScore } = params;

    const content = {
      contentType,
      contentId,
      sourceService,
      contentText,
      contentMetadata,
      authorDid: contentMetadata.authorDid
    };
    const ruleScores = { ...scores, riskScore };

    try {
      const result = await ruleEngineService.evaluateRules(content, ruleScores);
      if (result.matched) {
        logger.info('Custom rule applied', { ruleName: result.rule && result.rule.name, action: result.action, safeguard: result.safeguard });
        return result.action;
      }
    } catch (error) {
      // Never let a rule-engine error block moderation; fall back to AI verdict.
      logger.error('Rule engine evaluation failed; using AI verdict', { error: error.message, contentId });
    }
    return null;
  }

  /**
   * Add content to review queue
   * @private
   */
  async _addToReviewQueue(moderationItem, riskScore) {
    const priority = riskCalculator.calculatePriority(riskScore, {
      hasReports: false // Could check for existing reports
    });

    const escalated = riskScore >= 90;

    await ReviewQueue.create({
      moderationItemId: moderationItem.id,
      priority,
      escalated,
      escalatedReason: escalated ? 'High risk score' : null,
      status: 'pending',
      queuedAt: Date.now()
    });

    logger.info('Content added to review queue', {
      moderationItemId: moderationItem.id,
      priority,
      escalated
    });
  }

  /**
   * Log moderation action
   * @private
   */
  async _logAction(params) {
    const {
      action,
      contentType,
      contentId,
      sourceService,
      performedBy = null,
      isAutomated = false,
      reason = '',
      moderationItemId = null,
      reportId = null
    } = params;

    await ModerationAction.create({
      action,
      contentType,
      contentId,
      sourceService,
      performedBy,
      isAutomated,
      reason,
      moderationItemId,
      reportId,
      performedAt: Date.now()
    });
  }

  /**
   * Get status from action
   * @private
   */
  _getStatusFromAction(action) {
    const statusMap = {
      'auto_approve': 'approved',
      'approve': 'approved',
      'reject': 'rejected',
      'hide': 'flagged',
      'remove': 'rejected',
      'warn': 'flagged',
      'flag': 'flagged',
      'escalate': 'escalated',
      'require_review': 'reviewing'
    };

    return statusMap[action] || 'pending';
  }

  /**
   * Format moderation result
   * @private
   */
  _formatModerationResult(moderationItem) {
    return {
      moderationId: moderationItem.id,
      status: moderationItem.status,
      action: moderationItem.action,
      riskScore: moderationItem.riskScore,
      riskLevel: moderationItem.riskLevel,
      requiresReview: moderationItem.requiresReview,
      scores: {
        toxicity: moderationItem.toxicityScore,
        nsfw: moderationItem.nsfwScore,
        spam: moderationItem.spamScore,
        violence: moderationItem.violenceScore,
        hateSpeech: moderationItem.hateSpeechScore,
        sentiment: moderationItem.sentimentScore
      },
      approved: moderationItem.status === 'approved',
      rejected: moderationItem.status === 'rejected',
      pending: moderationItem.status === 'pending' || moderationItem.status === 'reviewing',
      processedAt: moderationItem.processedAt
    };
  }

  /**
   * Get pending review items
   */
  async getPendingReviews(limit = 50, offset = 0) {
    const items = await ReviewQueue.findAll({
      where: {
        status: 'pending'
      },
      include: [{
        model: ModerationItem,
        as: 'moderationItem'
      }],
      order: [
        ['priority', 'DESC'],
        ['queuedAt', 'ASC']
      ],
      limit,
      offset
    });

    return items.map(item => ({
      queueId: item.id,
      priority: item.priority,
      escalated: item.escalated,
      queuedAt: item.queuedAt,
      ...this._formatModerationResult(item.moderationItem)
    }));
  }

  /**
   * Review content (approve/reject)
   */
  async reviewContent(queueId, moderatorId, decision, notes = '') {
    const queueItem = await ReviewQueue.findByPk(queueId, {
      include: [{
        model: ModerationItem,
        as: 'moderationItem'
      }]
    });

    if (!queueItem) {
      throw new Error('Review queue item not found');
    }

    const action = decision === 'approve' ? 'approve' : 'reject';
    const status = decision === 'approve' ? 'approved' : 'rejected';

    // Update moderation item
    await queueItem.moderationItem.update({
      status,
      action,
      reviewedBy: moderatorId,
      reviewedAt: Date.now(),
      reviewNotes: notes
    });

    // Update queue item
    await queueItem.update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      assignedTo: moderatorId,
      completedAt: Date.now()
    });

    // Log action
    await this._logAction({
      action,
      contentType: queueItem.moderationItem.contentType,
      contentId: queueItem.moderationItem.contentId,
      sourceService: queueItem.moderationItem.sourceService,
      performedBy: moderatorId,
      isAutomated: false,
      reason: notes,
      moderationItemId: queueItem.moderationItem.id
    });

    logger.info('Content reviewed', {
      queueId,
      moderatorId,
      decision,
      moderationItemId: queueItem.moderationItem.id
    });

    return this._formatModerationResult(queueItem.moderationItem);
  }
}

module.exports = new ModerationService();
