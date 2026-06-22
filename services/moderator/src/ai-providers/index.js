/**
 * ═══════════════════════════════════════════════════════════
 * AI Provider Factory
 * Manages multiple AI moderation providers
 * ═══════════════════════════════════════════════════════════
 */

const ClaudeProvider = require('./claude');
const OpenAIProvider = require('./openai');
const DeepSeekProvider = require('./deepseek');
const logger = require('../utils/logger');

class AIProviderFactory {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'claude';

    // Initialize providers
    this._initializeProviders();
  }

  /**
   * Initialize all configured providers
   * @private
   */
  _initializeProviders() {
    // Claude
    if (process.env.CLAUDE_API_KEY) {
      this.providers.set('claude', new ClaudeProvider({
        apiKey: process.env.CLAUDE_API_KEY,
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'
      }));
      logger.info('Claude provider initialized');
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview'
      }));
      logger.info('OpenAI provider initialized');
    }

    // DeepSeek
    if (process.env.DEEPSEEK_API_KEY) {
      this.providers.set('deepseek', new DeepSeekProvider({
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      }));
      logger.info('DeepSeek provider initialized');
    }

    if (this.providers.size === 0) {
      logger.warn('No AI providers configured! Moderation will not work.');
    }
  }

  /**
   * Get a specific provider
   * @param {string} providerName - Provider name (claude, openai, deepseek)
   * @returns {Object} Provider instance
   */
  getProvider(providerName) {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`AI provider '${providerName}' not configured`);
    }

    return provider;
  }

  /**
   * Get the default provider
   * @returns {Object} Default provider instance
   */
  getDefaultProvider() {
    if (this.providers.has(this.defaultProvider)) {
      return this.providers.get(this.defaultProvider);
    }

    // Return first available provider
    const firstProvider = this.providers.values().next().value;
    if (!firstProvider) {
      throw new Error('No AI providers configured');
    }

    return firstProvider;
  }

  /**
   * Analyze content using specified or default provider
   * @param {Object} content - Content to analyze
   * @param {string} providerName - Optional provider name
   * @returns {Promise<Object>} Moderation scores
   */
  async analyzeContent(content, providerName = null) {
    const provider = providerName
      ? this.getProvider(providerName)
      : this.getDefaultProvider();

    try {
      const result = await provider.analyzeContent(content);
      return result;
    } catch (error) {
      logger.error('AI provider analysis failed', {
        provider: providerName || this.defaultProvider,
        error: error.message
      });

      // If using default provider failed, try fallback
      if (!providerName && this.providers.size > 1) {
        logger.info('Attempting fallback to alternative provider');
        return await this._analyzeWithFallback(content);
      }

      throw error;
    }
  }

  /**
   * Analyze with fallback providers
   * @private
   */
  async _analyzeWithFallback(content) {
    const errors = [];

    for (const [name, provider] of this.providers.entries()) {
      try {
        logger.info(`Attempting analysis with ${name}`);
        const result = await provider.analyzeContent(content);
        return result;
      } catch (error) {
        errors.push({ provider: name, error: error.message });
      }
    }

    logger.error('All AI providers failed', { errors });
    throw new Error('All AI providers failed: ' + JSON.stringify(errors));
  }

  /**
   * Get status of all providers
   */
  async getProvidersStatus() {
    const status = {};

    for (const [name, provider] of this.providers.entries()) {
      try {
        const health = await provider.healthCheck();
        status[name] = health;
      } catch (error) {
        status[name] = { available: false, error: error.message };
      }
    }

    return status;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
module.exports = new AIProviderFactory();
