/**
 * Anthropic Provider
 *
 * Integration with Anthropic Claude API.
 * Supports Claude Sonnet 4, Claude Opus 4, and other Claude models.
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../../../../utils/logger');

class AnthropicProvider {
  constructor(config) {
    this.config = config;
    this.name = config.providerName;

    // Initialize Anthropic client
    const apiKey = config.getApiKey();
    if (!apiKey) {
      throw new Error(`API key not configured for provider: ${this.name}`);
    }

    this.client = new Anthropic({
      apiKey,
    });

    logger.info(`[AnthropicProvider] Initialized: ${this.name}`);
  }

  /**
   * Complete a prompt with Claude
   *
   * @param {Object} options
   * @param {String} options.prompt - The prompt to complete
   * @param {String} options.model - Model ID (e.g., 'claude-sonnet-4-20250514')
   * @param {Number} options.temperature - Temperature (0-1)
   * @param {Number} options.maxTokens - Max tokens to generate
   * @param {String} options.responseFormat - 'text', 'json', or 'structured'
   * @returns {Promise<Object>} Response with content and usage
   */
  async complete(options) {
    const {
      prompt,
      model = 'claude-sonnet-4-20250514',
      temperature = 0.7,
      maxTokens = 4096,
      responseFormat = 'text',
    } = options;

    try {
      logger.debug(`[AnthropicProvider] Completing prompt with ${model}`, {
        promptLength: prompt.length,
        temperature,
        maxTokens,
      });

      // Prepare messages
      const messages = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      // Build request parameters
      const requestParams = {
        model: this.mapModelId(model),
        max_tokens: maxTokens,
        temperature,
        messages,
      };

      // Add system prompt if needed (extract from prompt if it starts with "System:")
      if (prompt.startsWith('System:')) {
        const parts = prompt.split('\n\nUser Request:');
        if (parts.length === 2) {
          requestParams.system = parts[0].replace('System:', '').trim();
          messages[0].content = 'User Request:' + parts[1];
        }
      }

      // Request JSON format if specified
      if (responseFormat === 'json' || responseFormat === 'structured') {
        // For Claude, we can hint at JSON in the system prompt
        // or use structured outputs (future enhancement)
        if (!requestParams.system) {
          requestParams.system = '';
        }
        requestParams.system += '\n\nYou must respond with valid JSON only. Do not include markdown code blocks or explanations.';
      }

      // Call Anthropic API
      const startTime = Date.now();
      const response = await this.client.messages.create(requestParams);
      const duration = Date.now() - startTime;

      logger.debug(`[AnthropicProvider] Completion successful`, {
        model,
        duration,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      // Extract text content
      let content = '';
      if (response.content && response.content.length > 0) {
        content = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
      }

      // Clean JSON response if needed
      if (responseFormat === 'json' || responseFormat === 'structured') {
        content = this.cleanJsonResponse(content);
      }

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason,
      };

    } catch (error) {
      logger.error(`[AnthropicProvider] Completion failed:`, {
        model,
        error: error.message,
        status: error.status,
      });

      // Re-throw with more context
      const enhancedError = new Error(`Anthropic API error: ${error.message}`);
      enhancedError.code = this.mapErrorCode(error);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Map model ID to Anthropic's format
   */
  mapModelId(model) {
    // Mapping table for common model names
    const modelMap = {
      'claude-sonnet-4': 'claude-sonnet-4-20250514',
      'claude-opus-4': 'claude-opus-4-20250514',
      'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
    };

    return modelMap[model] || model;
  }

  /**
   * Clean JSON response (remove markdown code blocks, etc.)
   */
  cleanJsonResponse(content) {
    // Remove markdown code blocks
    let cleaned = content.trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    return cleaned.trim();
  }

  /**
   * Map Anthropic error to our error codes
   */
  mapErrorCode(error) {
    if (error.status === 429) {
      return 'RATE_LIMIT_EXCEEDED';
    } else if (error.status === 401) {
      return 'INVALID_API_KEY';
    } else if (error.status === 400) {
      return 'INVALID_REQUEST';
    } else if (error.status === 500 || error.status === 503) {
      return 'PROVIDER_ERROR';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Calculate cost for this request
   */
  calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000) * (this.config.costConfig.input_token_cost || 0);
    const outputCost = (outputTokens / 1000) * (this.config.costConfig.output_token_cost || 0);
    return inputCost + outputCost;
  }

  /**
   * Check if provider is healthy
   */
  async healthCheck() {
    try {
      // Simple health check: try to complete a minimal request
      const response = await this.complete({
        prompt: 'Respond with "OK" only.',
        model: 'claude-sonnet-4-20250514',
        temperature: 0,
        maxTokens: 10,
      });

      return {
        healthy: true,
        latency: response.duration || 0,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return this.config.availableModels;
  }

  /**
   * Get provider info
   */
  getInfo() {
    return {
      name: this.name,
      type: this.config.providerType,
      models: this.config.availableModels.length,
      isActive: this.config.isActive,
      healthStatus: this.config.healthStatus,
    };
  }
}

module.exports = AnthropicProvider;
