/**
 * ═══════════════════════════════════════════════════════════
 * Retry Service
 * Provides retry strategies and circuit breaker pattern
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');

class RetryService {
  /**
   * Execute function with retry strategy
   */
  async executeWithRetry(fn, options = {}) {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      retryOn = () => true, // Function to determine if error is retryable
      onRetry = () => {} // Callback on each retry
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!retryOn(error) || attempt === maxAttempts) {
          throw error;
        }

        // Log retry
        logger.warn(`Retry attempt ${attempt}/${maxAttempts}`, {
          error: error.message,
          delay
        });

        // Call retry callback
        await onRetry(attempt, error, delay);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Exponential backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Circuit breaker pattern
   */
  createCircuitBreaker(fn, options = {}) {
    const {
      failureThreshold = 5,
      successThreshold = 2,
      timeout = 60000,
      resetTimeout = 30000
    } = options;

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failureCount = 0;
    let successCount = 0;
    let nextAttempt = Date.now();

    return async (...args) => {
      // Check circuit state
      if (state === 'OPEN') {
        if (Date.now() < nextAttempt) {
          throw new Error('Circuit breaker is OPEN');
        }
        state = 'HALF_OPEN';
        successCount = 0;
      }

      try {
        const result = await Promise.race([
          fn(...args),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);

        // Success
        if (state === 'HALF_OPEN') {
          successCount++;
          if (successCount >= successThreshold) {
            state = 'CLOSED';
            failureCount = 0;
            logger.info('Circuit breaker CLOSED');
          }
        }

        return result;
      } catch (error) {
        failureCount++;

        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          nextAttempt = Date.now() + resetTimeout;
          logger.error('Circuit breaker OPEN', { failureCount });
        }

        throw error;
      }
    };
  }

  /**
   * Retry with exponential backoff (simplified helper)
   */
  async retryWithBackoff(fn, maxAttempts = 3) {
    return this.executeWithRetry(fn, {
      maxAttempts,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    });
  }

  /**
   * Retry specific error types only
   */
  async retryOnError(fn, errorTypes = [], maxAttempts = 3) {
    return this.executeWithRetry(fn, {
      maxAttempts,
      retryOn: (error) => {
        if (errorTypes.length === 0) return true;
        return errorTypes.some(type => error instanceof type || error.name === type);
      }
    });
  }
}

module.exports = new RetryService();
