/**
 * Ollama Provider
 *
 * Integration with Ollama for local/self-hosted LLMs.
 * Supports Llama 3, Mistral, Code Llama, and other Ollama models.
 */

const axios = require('axios');
const logger = require('../../../../utils/logger');

class OllamaProvider {
  constructor(config) {
    this.config = config;
    this.name = config.providerName;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';

    logger.info(`[OllamaProvider] Initialized: ${this.name}`, {
      baseUrl: this.baseUrl,
    });
  }

  /**
   * Complete a prompt with Ollama
   *
   * @param {Object} options
   * @param {String} options.prompt - The prompt to complete
   * @param {String} options.model - Model ID (e.g., 'llama3', 'mistral')
   * @param {Number} options.temperature - Temperature (0-1)
   * @param {Number} options.maxTokens - Max tokens to generate
   * @param {String} options.responseFormat - 'text', 'json', or 'structured'
   * @returns {Promise<Object>} Response with content and usage
   */
  async complete(options) {
    const {
      prompt,
      model = 'llama3',
      temperature = 0.7,
      maxTokens = 4096,
      responseFormat = 'text',
    } = options;

    try {
      logger.debug(`[OllamaProvider] Completing prompt with ${model}`, {
        promptLength: prompt.length,
        temperature,
        maxTokens,
      });

      // Build request parameters
      const requestBody = {
        model,
        prompt,
        stream: false, // We want the full response, not streaming
        options: {
          temperature,
          num_predict: maxTokens, // Ollama uses num_predict instead of max_tokens
        },
      };

      // Request JSON format if specified
      if (responseFormat === 'json' || responseFormat === 'structured') {
        requestBody.format = 'json';
      }

      // Call Ollama API
      const startTime = Date.now();
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 120000, // 2 minute timeout for local models
        }
      );
      const duration = Date.now() - startTime;

      const data = response.data;

      logger.debug(`[OllamaProvider] Completion successful`, {
        model,
        duration,
        tokensEvaluated: data.prompt_eval_count,
        tokensGenerated: data.eval_count,
      });

      // Ollama doesn't charge, so tokens are just for metrics
      const inputTokens = data.prompt_eval_count || this.estimateTokens(prompt);
      const outputTokens = data.eval_count || this.estimateTokens(data.response);

      return {
        content: data.response,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        model: data.model,
        finishReason: data.done ? 'stop' : 'length',
        metadata: {
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration,
        },
      };

    } catch (error) {
      logger.error(`[OllamaProvider] Completion failed:`, {
        model,
        error: error.message,
        status: error.response?.status,
      });

      // Check if Ollama is running
      if (error.code === 'ECONNREFUSED') {
        const enhancedError = new Error('Ollama server is not running. Please start Ollama.');
        enhancedError.code = 'PROVIDER_UNAVAILABLE';
        throw enhancedError;
      }

      // Re-throw with more context
      const enhancedError = new Error(`Ollama API error: ${error.message}`);
      enhancedError.code = this.mapErrorCode(error);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Estimate token count (rough approximation)
   * Ollama doesn't always return exact token counts
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Map Ollama error to our error codes
   */
  mapErrorCode(error) {
    if (error.code === 'ECONNREFUSED') {
      return 'PROVIDER_UNAVAILABLE';
    } else if (error.response?.status === 404) {
      return 'MODEL_NOT_FOUND';
    } else if (error.response?.status === 400) {
      return 'INVALID_REQUEST';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return 'TIMEOUT';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Calculate cost (Ollama is free, so always 0)
   */
  calculateCost(inputTokens, outputTokens) {
    return 0; // Local models are free
  }

  /**
   * Check if Ollama server is healthy
   */
  async healthCheck() {
    try {
      const startTime = Date.now();

      // Check if Ollama is running
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
      });

      const latency = Date.now() - startTime;

      // Check if our default model is available
      const models = response.data.models || [];
      const hasDefaultModel = models.some(m => m.name === this.config.defaultModel);

      return {
        healthy: true,
        latency,
        modelsAvailable: models.length,
        hasDefaultModel,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      const models = response.data.models || [];

      return models.map(model => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modifiedAt: model.modified_at,
      }));
    } catch (error) {
      logger.error(`[OllamaProvider] Failed to list models:`, error);
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName) {
    try {
      logger.info(`[OllamaProvider] Pulling model: ${modelName}`);

      const response = await axios.post(
        `${this.baseUrl}/api/pull`,
        {
          name: modelName,
          stream: false,
        },
        {
          timeout: 600000, // 10 minutes for model download
        }
      );

      logger.info(`[OllamaProvider] Model pulled successfully: ${modelName}`);
      return response.data;
    } catch (error) {
      logger.error(`[OllamaProvider] Failed to pull model:`, error);
      throw error;
    }
  }

  /**
   * Get available models (from config)
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
      baseUrl: this.baseUrl,
      models: this.config.availableModels.length,
      isActive: this.config.isActive,
      healthStatus: this.config.healthStatus,
      isFree: true,
    };
  }

  /**
   * Get embeddings for text (useful for vector search)
   */
  async getEmbeddings(text, model = 'nomic-embed-text') {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/embeddings`,
        {
          model,
          prompt: text,
        }
      );

      return response.data.embedding;
    } catch (error) {
      logger.error(`[OllamaProvider] Failed to get embeddings:`, error);
      throw error;
    }
  }
}

module.exports = OllamaProvider;
