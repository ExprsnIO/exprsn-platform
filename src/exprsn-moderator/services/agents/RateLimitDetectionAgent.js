/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limit Detection Agent
 * Detects spam and abuse through rate limiting patterns
 * ═══════════════════════════════════════════════════════════
 */

const BaseAgent = require('./BaseAgent');
const { RateLimitViolation } = require('../../models/sequelize-index');
const Redis = require('ioredis');

class RateLimitDetectionAgent extends BaseAgent {
  static type = 'rate_limit_detection';

  constructor(config, provider) {
    super(config, provider);

    // Initialize Redis client
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 3
    });

    // Default rate limits
    this.limits = config.config?.limits || {
      posts_per_minute: 5,
      posts_per_hour: 50,
      comments_per_minute: 10,
      comments_per_hour: 100,
      messages_per_minute: 20,
      messages_per_hour: 200
    };
  }

  async execute(content) {
    this.validateContent(content);

    const { userId, contentType, sourceService } = content;

    this.log('info', 'Checking rate limits', {
      userId,
      contentType,
      sourceService
    });

    try {
      const violations = await this.checkRateLimits(userId, contentType);

      // Calculate spam score based on violations
      const spamScore = this.calculateSpamScore(violations);

      // Determine severity
      const severity = this.determineSeverity(violations);

      // Record violations if any
      if (violations.length > 0) {
        await this.recordViolations(userId, contentType, sourceService, violations, severity);
      }

      this.log('info', 'Rate limit check complete', {
        userId,
        violations: violations.length,
        spamScore,
        severity
      });

      return this.formatResult(
        {
          spam: spamScore,
          rateLimit: spamScore
        },
        violations.length > 0 ? 'flag' : 'auto_approve',
        violations.length > 0 ? 90 : 100,
        {
          violations,
          severity,
          limits: this.limits
        }
      );

    } catch (error) {
      this.log('error', 'Rate limit check failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check rate limits for a user
   */
  async checkRateLimits(userId, contentType) {
    const violations = [];
    const now = Date.now();

    // Define time windows
    const windows = [
      { name: 'minute', seconds: 60 },
      { name: 'hour', seconds: 3600 }
    ];

    for (const window of windows) {
      const key = `rate:${userId}:${contentType}:${window.name}`;
      const count = await this.getRequestCount(key, window.seconds);

      const limitKey = `${contentType}s_per_${window.name}`;
      const limit = this.limits[limitKey];

      if (limit && count >= limit) {
        violations.push({
          window: window.name,
          count,
          limit,
          exceeded: count - limit
        });

        this.log('warn', 'Rate limit exceeded', {
          userId,
          contentType,
          window: window.name,
          count,
          limit
        });
      }

      // Increment counter
      await this.incrementCounter(key, window.seconds);
    }

    return violations;
  }

  /**
   * Get request count from Redis
   */
  async getRequestCount(key, windowSeconds) {
    try {
      const count = await this.redis.get(key);
      return parseInt(count) || 0;
    } catch (error) {
      this.log('error', 'Redis get failed', { error: error.message });
      return 0;
    }
  }

  /**
   * Increment Redis counter
   */
  async incrementCounter(key, windowSeconds) {
    try {
      const multi = this.redis.multi();
      multi.incr(key);
      multi.expire(key, windowSeconds);
      await multi.exec();
    } catch (error) {
      this.log('error', 'Redis increment failed', { error: error.message });
    }
  }

  /**
   * Calculate spam score from violations
   */
  calculateSpamScore(violations) {
    if (violations.length === 0) {
      return 0;
    }

    let score = 0;

    for (const violation of violations) {
      // Base score increases with number of violations
      score += 30;

      // Additional score based on how much the limit was exceeded
      const excessPercent = (violation.exceeded / violation.limit) * 100;
      score += Math.min(excessPercent, 40);
    }

    return Math.min(Math.round(score), 100);
  }

  /**
   * Determine violation severity
   */
  determineSeverity(violations) {
    if (violations.length === 0) {
      return 'low';
    }

    // Check how much limits were exceeded
    const maxExcess = Math.max(...violations.map(v => v.exceeded));

    if (maxExcess > 100) {
      return 'critical';
    } else if (maxExcess > 50) {
      return 'high';
    } else if (maxExcess > 20) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Record violations in database
   */
  async recordViolations(userId, contentType, sourceService, violations, severity) {
    try {
      for (const violation of violations) {
        await RateLimitViolation.create({
          userId,
          violationType: `${contentType}_${violation.window}`,
          severity,
          endpoint: sourceService,
          requestCount: violation.count,
          limitThreshold: violation.limit,
          windowSeconds: violation.window === 'minute' ? 60 : 3600,
          details: { violation },
          detectedAt: Date.now()
        });
      }
    } catch (error) {
      this.log('error', 'Failed to record violations', {
        error: error.message
      });
    }
  }

  /**
   * Check if user has active violations
   */
  async hasActiveViolations(userId) {
    try {
      const violations = await RateLimitViolation.getActiveViolations(userId);
      return violations.length > 0;
    } catch (error) {
      this.log('error', 'Failed to check active violations', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get user violation history
   */
  async getUserViolationHistory(userId, hours = 24) {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      const violations = await RateLimitViolation.findAll({
        where: {
          userId,
          detectedAt: { [Op.gte]: since }
        },
        order: [['detectedAt', 'DESC']]
      });

      return violations;
    } catch (error) {
      this.log('error', 'Failed to get violation history', {
        error: error.message
      });
      return [];
    }
  }
}

module.exports = RateLimitDetectionAgent;
