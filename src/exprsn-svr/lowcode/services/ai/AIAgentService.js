/**
 * AI Agent Service
 *
 * Core orchestration layer for all AI agent operations.
 * Manages provider selection, rate limiting, cost tracking, and logging.
 */

const { Op } = require('sequelize');
const AnthropicProvider = require('./providers/AnthropicProvider');
const OllamaProvider = require('./providers/OllamaProvider');
const RateLimiter = require('./RateLimiter');
const logger = require('../../../utils/logger');

class AIAgentService {
  constructor() {
    this.providers = new Map();
    this.rateLimiter = new RateLimiter();
    this.initialized = false;
  }

  /**
   * Initialize the AI Agent Service
   * Loads provider configurations and sets up rate limiters
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const { sequelize } = require('../../models');
      const AIProviderConfigDef = require('../../models/ai/AIProviderConfig');
      const AIProviderConfig = AIProviderConfigDef(sequelize);

      // Load active providers
      const configs = await AIProviderConfig.scope('active').findAll();

      for (const config of configs) {
        await this.registerProvider(config);
      }

      this.initialized = true;
      logger.info('[AIAgentService] Initialized with providers:', {
        providers: Array.from(this.providers.keys()),
      });
    } catch (error) {
      logger.error('[AIAgentService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register a provider
   */
  async registerProvider(config) {
    const ProviderClass = this.getProviderClass(config.providerType);
    if (!ProviderClass) {
      logger.warn(`[AIAgentService] Unknown provider type: ${config.providerType}`);
      return;
    }

    const provider = new ProviderClass(config);
    this.providers.set(config.providerName, provider);

    logger.info(`[AIAgentService] Registered provider: ${config.providerName}`, {
      type: config.providerType,
      models: config.availableModels.length,
    });
  }

  /**
   * Get provider class by type
   */
  getProviderClass(type) {
    const providers = {
      anthropic: AnthropicProvider,
      ollama: OllamaProvider,
      // openai: OpenAIProvider, // Future
      // custom: CustomProvider,  // Future
    };
    return providers[type];
  }

  /**
   * Execute an AI agent task
   *
   * @param {Object} options
   * @param {UUID} options.configurationId - AI agent configuration ID
   * @param {UUID} options.templateId - AI agent template ID (if no configuration)
   * @param {String} options.executionType - Type of execution
   * @param {String} options.targetType - Target type (entity, form, workflow, etc.)
   * @param {UUID} options.targetId - Target ID
   * @param {String} options.prompt - User prompt
   * @param {Object} options.context - Additional context
   * @param {UUID} options.userId - User ID
   * @param {UUID} options.sessionId - Session ID (for grouping)
   * @param {String} options.providerName - Force specific provider (optional)
   * @param {String} options.model - Force specific model (optional)
   * @returns {Promise<Object>} Execution result
   */
  async execute(options) {
    await this.ensureInitialized();

    const startTime = Date.now();
    const {
      AIAgentConfiguration,
      AIAgentTemplate,
      AIExecutionLog,
    } = require('../../models/ai');

    let configuration = null;
    let template = null;
    let provider = null;
    let executionLog = null;

    try {
      // Load configuration or template
      if (options.configurationId) {
        configuration = await AIAgentConfiguration.findByPk(options.configurationId, {
          include: ['template'],
        });
        if (!configuration) {
          throw new Error(`Configuration not found: ${options.configurationId}`);
        }
        template = configuration.template;
      } else if (options.templateId) {
        template = await AIAgentTemplate.findByPk(options.templateId);
        if (!template) {
          throw new Error(`Template not found: ${options.templateId}`);
        }
      } else {
        throw new Error('Either configurationId or templateId must be provided');
      }

      // Build the full prompt
      const fullPrompt = await this.buildPrompt(template, configuration, options.prompt, options.context);

      // Determine model and provider
      const model = options.model ||
                    (configuration && configuration.overrideModel) ||
                    template.defaultModel;

      const providerName = options.providerName || await this.selectBestProvider(model);
      provider = this.providers.get(providerName);

      if (!provider) {
        throw new Error(`Provider not available: ${providerName}`);
      }

      // Check rate limits
      await this.rateLimiter.checkLimit(providerName, options.userId);

      // Create execution log (pending)
      executionLog = await AIExecutionLog.create({
        configurationId: options.configurationId,
        templateId: template.id,
        providerName,
        model,
        executionType: options.executionType,
        targetType: options.targetType,
        targetId: options.targetId,
        inputPrompt: fullPrompt,
        inputContext: options.context || {},
        userId: options.userId,
        sessionId: options.sessionId,
        status: 'pending',
      });

      // Execute AI request
      const temperature = (configuration && configuration.overrideTemperature) || template.temperature;
      const maxTokens = (configuration && configuration.overrideMaxTokens) || template.maxTokens;

      const response = await provider.complete({
        prompt: fullPrompt,
        model,
        temperature,
        maxTokens,
        responseFormat: template.responseFormat,
      });

      // Calculate duration and cost
      const durationMs = Date.now() - startTime;
      const cost = provider.calculateCost(response.usage.inputTokens, response.usage.outputTokens);

      // Parse structured response
      let outputStructured = {};
      if (template.responseFormat === 'json') {
        try {
          outputStructured = JSON.parse(response.content);
        } catch (e) {
          logger.warn('[AIAgentService] Failed to parse JSON response', { error: e.message });
          outputStructured = { raw: response.content };
        }
      }

      // Update execution log (success)
      await executionLog.update({
        status: 'success',
        outputResponse: response.content,
        outputStructured,
        tokensInput: response.usage.inputTokens,
        tokensOutput: response.usage.outputTokens,
        estimatedCost: cost,
        durationMs,
      });

      // Record execution in configuration
      if (configuration) {
        await configuration.recordExecution(true);
      }

      logger.info('[AIAgentService] Execution successful', {
        executionLogId: executionLog.id,
        provider: providerName,
        model,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        cost,
        durationMs,
      });

      return {
        success: true,
        executionLogId: executionLog.id,
        response: response.content,
        structured: outputStructured,
        usage: response.usage,
        cost,
        durationMs,
      };

    } catch (error) {
      logger.error('[AIAgentService] Execution failed:', error);

      // Update execution log (error)
      if (executionLog) {
        await executionLog.update({
          status: 'error',
          errorMessage: error.message,
          errorCode: error.code || 'UNKNOWN_ERROR',
          durationMs: Date.now() - startTime,
        });
      }

      // Record execution in configuration
      if (configuration) {
        await configuration.recordExecution(false);
      }

      throw error;
    }
  }

  /**
   * Build the full prompt from template, configuration, and user input
   */
  async buildPrompt(template, configuration, userPrompt, context = {}) {
    let prompt = template.systemPrompt;

    // Add configuration-specific instructions
    if (configuration && configuration.customPrompt) {
      prompt += `\n\n${configuration.customPrompt}`;
    }

    // Add context
    const mergedContext = {
      ...(configuration ? configuration.contextData : {}),
      ...context,
    };

    if (Object.keys(mergedContext).length > 0) {
      prompt += `\n\nContext:\n${JSON.stringify(mergedContext, null, 2)}`;
    }

    // Add examples from template
    if (template.examples && template.examples.length > 0) {
      prompt += '\n\nExamples:';
      for (const example of template.examples) {
        prompt += `\n\nInput: ${example.input}`;
        prompt += `\nOutput: ${JSON.stringify(example.output)}`;
      }
    }

    // Add user prompt
    prompt += `\n\nUser Request: ${userPrompt}`;

    return prompt;
  }

  /**
   * Select the best available provider for a model
   */
  async selectBestProvider(model) {
    const { AIProviderConfig } = require('../../models/ai');

    // Try to find a provider that has this model
    for (const [name, provider] of this.providers.entries()) {
      const config = await AIProviderConfig.findOne({ where: { providerName: name } });
      if (config && config.isHealthy()) {
        const hasModel = config.availableModels.some(m => m.id === model);
        if (hasModel) {
          return name;
        }
      }
    }

    // If no provider has this model, return default provider
    const defaultProvider = await AIProviderConfig.scope('default').findOne();
    if (defaultProvider) {
      return defaultProvider.providerName;
    }

    // If no default, return first healthy provider
    const healthyProvider = await AIProviderConfig.scope('healthy').findOne();
    if (healthyProvider) {
      return healthyProvider.providerName;
    }

    throw new Error('No AI providers available');
  }

  /**
   * Get provider by name
   */
  getProvider(name) {
    return this.providers.get(name);
  }

  /**
   * Get all providers
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get cost statistics for a period
   */
  async getCostStatistics(startDate, endDate) {
    const { AIExecutionLog } = require('../../models/ai');
    return await AIExecutionLog.getTotalCostByPeriod(startDate, endDate);
  }

  /**
   * Get performance statistics for an execution type
   */
  async getPerformanceStatistics(executionType, limit = 1000) {
    const { AIExecutionLog } = require('../../models/ai');
    return await AIExecutionLog.getAveragePerformance(executionType, limit);
  }

  /**
   * Get error rate for a period
   */
  async getErrorRate(startDate, endDate) {
    const { AIExecutionLog } = require('../../models/ai');
    return await AIExecutionLog.getErrorRate(startDate, endDate);
  }

  /**
   * Reload providers (useful after configuration changes)
   */
  async reloadProviders() {
    this.providers.clear();
    this.initialized = false;
    await this.initialize();
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance() {
    if (!instance) {
      instance = new AIAgentService();
    }
    return instance;
  },
  AIAgentService,
};
