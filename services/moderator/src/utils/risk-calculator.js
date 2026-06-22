/**
 * ═══════════════════════════════════════════════════════════
 * Risk Score Calculator
 * Calculate overall risk scores and determine actions
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Calculate overall risk score from individual scores
 * @param {Object} scores - Individual moderation scores
 * @returns {number} Overall risk score (0-100)
 */
function calculateOverallRisk(scores) {
  const {
    toxicityScore = 0,
    nsfwScore = 0,
    spamScore = 0,
    violenceScore = 0,
    hateSpeechScore = 0
  } = scores;

  // Weighted average with emphasis on severe violations
  const weights = {
    violence: 1.3,      // Most severe
    hateSpeech: 1.2,    // Very severe
    nsfw: 1.1,          // Severe
    toxicity: 1.0,      // Moderate
    spam: 0.8           // Less severe
  };

  const weightedSum =
    (violenceScore * weights.violence) +
    (hateSpeechScore * weights.hateSpeech) +
    (nsfwScore * weights.nsfw) +
    (toxicityScore * weights.toxicity) +
    (spamScore * weights.spam);

  const totalWeight =
    weights.violence +
    weights.hateSpeech +
    weights.nsfw +
    weights.toxicity +
    weights.spam;

  const overallScore = Math.round(weightedSum / totalWeight);

  // Cap at 100
  return Math.min(100, Math.max(0, overallScore));
}

/**
 * Determine risk level from risk score
 * @param {number} riskScore - Risk score (0-100)
 * @returns {string} Risk level
 */
function getRiskLevel(riskScore) {
  if (riskScore <= 30) return 'safe';
  if (riskScore <= 50) return 'low';
  if (riskScore <= 75) return 'medium';
  if (riskScore <= 90) return 'high';
  return 'critical';
}

/**
 * Determine moderation action based on risk score
 * @param {number} riskScore - Risk score (0-100)
 * @param {Object} options - Additional options
 * @returns {string} Moderation action
 */
function determineAction(riskScore, options = {}) {
  const {
    autoApproveThreshold = 30,
    manualReviewThreshold = 51,
    autoRejectThreshold = 91,
    requiresReview = false
  } = options;

  // Force manual review if flagged
  if (requiresReview) {
    return 'require_review';
  }

  if (riskScore <= autoApproveThreshold) {
    return 'auto_approve';
  }

  if (riskScore >= autoRejectThreshold) {
    return 'reject';
  }

  if (riskScore >= manualReviewThreshold) {
    return 'require_review';
  }

  // Low risk range (31-50)
  return 'approve';
}

/**
 * Check if content requires manual review
 * @param {number} riskScore - Risk score
 * @param {Object} scores - Individual scores
 * @returns {boolean} True if requires review
 */
function requiresManualReview(riskScore, scores = {}) {
  // Threshold for automatic review
  const reviewThreshold = 51;

  // Always review if risk is medium or higher
  if (riskScore >= reviewThreshold) {
    return true;
  }

  // Review if any individual score is very high
  const criticalThreshold = 80;
  const {
    toxicityScore = 0,
    nsfwScore = 0,
    spamScore = 0,
    violenceScore = 0,
    hateSpeechScore = 0
  } = scores;

  if (
    violenceScore >= criticalThreshold ||
    hateSpeechScore >= criticalThreshold ||
    nsfwScore >= criticalThreshold
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate priority for review queue
 * @param {number} riskScore - Risk score
 * @param {Object} metadata - Additional metadata
 * @returns {number} Priority (higher = more urgent)
 */
function calculatePriority(riskScore, metadata = {}) {
  let priority = riskScore;

  // Boost priority for certain conditions
  if (metadata.hasReports) {
    priority += 10;
  }

  if (metadata.isRepeatOffender) {
    priority += 15;
  }

  if (metadata.isVerifiedUser) {
    priority -= 5; // Slightly lower priority for verified users
  }

  // Cap priority at 100
  return Math.min(100, Math.max(0, priority));
}

/**
 * Generate flags based on scores
 * @param {Object} scores - Individual scores
 * @returns {Array<string>} Array of flags
 */
function generateFlags(scores) {
  const flags = [];
  const threshold = 60; // Threshold for flagging

  if (scores.toxicityScore >= threshold) {
    flags.push('toxic_content');
  }

  if (scores.nsfwScore >= threshold) {
    flags.push('nsfw_content');
  }

  if (scores.spamScore >= threshold) {
    flags.push('spam');
  }

  if (scores.violenceScore >= threshold) {
    flags.push('violence');
  }

  if (scores.hateSpeechScore >= threshold) {
    flags.push('hate_speech');
  }

  // Critical flags
  if (scores.violenceScore >= 90) {
    flags.push('extreme_violence');
  }

  if (scores.hateSpeechScore >= 90) {
    flags.push('extreme_hate');
  }

  if (scores.nsfwScore >= 90) {
    flags.push('explicit_content');
  }

  return flags;
}

module.exports = {
  calculateOverallRisk,
  getRiskLevel,
  determineAction,
  requiresManualReview,
  calculatePriority,
  generateFlags
};
