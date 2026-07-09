/**
 * ═══════════════════════════════════════════════════════════
 * AI Provider Factory
 * Manages multiple AI moderation providers
 * ═══════════════════════════════════════════════════════════
 */

const ClaudeProvider = require('./claude');
const OpenAIProvider = require('./openai');
const DeepSeekProvider = require('./deepseek');
const CortexProvider = require('./cortex');
const logger = require('../utils/logger');

// Cortex participation in moderation (FEAT-023). Enforcement is opt-in because
// a local-LLM verdict on the safety-critical publish path must first clear an
// accuracy benchmark vs the cloud providers and a latency posture (warm model,
// bounded timeout) — see sprints/assessments/FEAT-023-024-cost-benefit.md.
//   off     — not registered at all (default)
//   shadow  — scored alongside the real provider, logged, verdict NOT used
//   enforce — a first-class selectable provider
const CORTEX_MODE = process.env.CORTEX_MODERATION_MODE || 'off';

class AIProviderFactory {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'claude';
    /** Providers registered for observation only — never selected for a verdict. */
    this.shadowOnly = new Set();

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

    // Cortex — local LLM, in-process (FEAT-023). No API key: inference is local.
    // In `shadow` mode it is registered but barred from producing a verdict.
    if (process.env.CORTEX_ENABLED === 'true' && CORTEX_MODE !== 'off') {
      this.providers.set('cortex', new CortexProvider({
        model: process.env.CORTEX_BRAIN_MODEL,
      }));
      if (CORTEX_MODE !== 'enforce') this.shadowOnly.add('cortex');
      logger.info('Cortex (local LLM) provider initialized', { mode: CORTEX_MODE });
    }

    // A shadow-only provider cannot moderate anything, so it must not count
    // toward "some provider is configured".
    if (this.providers.size === this.shadowOnly.size) {
      logger.warn('No AI providers configured! Moderation will not work.');
    }
  }

  /** True when `name` may produce a real verdict. */
  _selectable(name, exclude = []) {
    return !this.shadowOnly.has(name) && !exclude.includes(name);
  }

  /** Providers registered for observation only (e.g. cortex in shadow mode). */
  getShadowProviders() {
    return Array.from(this.shadowOnly);
  }

  /**
   * Score content with a shadow provider for evaluation. Never throws; the
   * caller must not await this on a request path.
   */
  async analyzeShadow(name, content) {
    const provider = this.providers.get(name);
    if (!provider || !this.shadowOnly.has(name)) return null;
    try {
      return await provider.analyzeContent(content);
    } catch (error) {
      logger.warn('Shadow provider analysis failed', { provider: name, error: error.message });
      return null;
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

    // A per-request `aiProvider` override must not be able to promote a
    // shadow-mode provider into producing a real verdict.
    if (this.shadowOnly.has(providerName)) {
      throw new Error(
        `AI provider '${providerName}' is in shadow mode and cannot produce a verdict ` +
        `(set CORTEX_MODERATION_MODE=enforce to enable it)`
      );
    }

    return provider;
  }

  /**
   * Get the default provider
   * @param {string[]} exclude - provider names that must not be selected
   * @returns {Object} Default provider instance
   */
  getDefaultProvider(exclude = []) {
    if (this.providers.has(this.defaultProvider) && this._selectable(this.defaultProvider, exclude)) {
      return this.providers.get(this.defaultProvider);
    }

    // Return first available provider that is selectable and not excluded
    for (const [name, provider] of this.providers.entries()) {
      if (this._selectable(name, exclude)) return provider;
    }

    throw new Error('No AI providers configured');
  }

  /**
   * Analyze content using specified or default provider
   * @param {Object} content - Content to analyze
   * @param {string} providerName - Optional provider name
   * @param {{exclude?: string[]}} options - `exclude` bars providers from BOTH
   *        direct selection and the fallback chain. Used as the cortex loop
   *        guard: a cortex-originated moderation request must never be judged
   *        by cortex (see moderationService).
   * @returns {Promise<Object>} Moderation scores
   */
  async analyzeContent(content, providerName = null, options = {}) {
    const exclude = options.exclude || [];

    if (providerName && exclude.includes(providerName)) {
      throw new Error(`AI provider '${providerName}' is not permitted for this request`);
    }

    const provider = providerName
      ? this.getProvider(providerName)
      : this.getDefaultProvider(exclude);

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
        return await this._analyzeWithFallback(content, exclude);
      }

      throw error;
    }
  }

  /**
   * Analyze with fallback providers
   * @private
   */
  async _analyzeWithFallback(content, exclude = []) {
    const errors = [];

    for (const [name, provider] of this.providers.entries()) {
      if (!this._selectable(name, exclude)) continue;
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
