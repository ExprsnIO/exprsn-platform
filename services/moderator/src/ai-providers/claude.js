/**
 * ═══════════════════════════════════════════════════════════
 * Claude AI Provider
 * Anthropic Claude API integration for content moderation
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

class ClaudeProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.CLAUDE_API_KEY;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 1000;
  }

  /**
   * Analyze content for moderation
   * @param {Object} content - Content to analyze
   * @param {string} content.text - Text content
   * @param {string} content.type - Content type
   * @returns {Promise<Object>} Moderation scores
   */
  async analyzeContent(content) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      const prompt = this._buildModerationPrompt(content);

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        }
      );

      const result = this._parseResponse(response.data);

      logger.info('Claude moderation analysis completed', {
        model: this.model,
        riskScore: result.riskScore
      });

      return result;
    } catch (error) {
      logger.error('Claude API error', {
        error: error.message,
        status: error.response?.status
      });

      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Build moderation prompt for Claude
   * @private
   */
  _buildModerationPrompt(content) {
    return `You are a content moderation AI. Analyze the following content and provide moderation scores.

Content Type: ${content.type || 'text'}
Content: ${content.text || ''}

Analyze this content for:
1. Toxicity (hate speech, harassment, bullying)
2. NSFW (adult content, explicit material)
3. Spam (promotional content, repetitive messages)
4. Violence (threats, graphic violence, gore)
5. Hate Speech (discrimination, slurs, targeted harassment)

Respond ONLY with a JSON object in this exact format (no other text):
{
  "toxicity_score": <0-100>,
  "nsfw_score": <0-100>,
  "spam_score": <0-100>,
  "violence_score": <0-100>,
  "hate_speech_score": <0-100>,
  "overall_risk_score": <0-100>,
  "flags": ["flag1", "flag2"],
  "explanation": "Brief explanation of the scores"
}

Scoring guide:
- 0-30: Safe, no issues detected
- 31-50: Minor concerns, likely acceptable
- 51-75: Moderate risk, requires review
- 76-90: High risk, likely violates policies
- 91-100: Critical, definitely violates policies

Be objective and consistent. Consider context and intent.`;
  }

  /**
   * Parse Claude API response
   * @private
   */
  _parseResponse(data) {
    try {
      // Extract text from Claude response
      const text = data.content[0].text;

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        provider: 'claude',
        model: this.model,
        riskScore: parsed.overall_risk_score || 0,
        toxicityScore: parsed.toxicity_score || 0,
        nsfwScore: parsed.nsfw_score || 0,
        spamScore: parsed.spam_score || 0,
        violenceScore: parsed.violence_score || 0,
        hateSpeechScore: parsed.hate_speech_score || 0,
        flags: parsed.flags || [],
        explanation: parsed.explanation || '',
        rawResponse: data
      };
    } catch (error) {
      logger.error('Failed to parse Claude response', { error: error.message });
      throw new Error('Failed to parse Claude API response');
    }
  }

  /**
   * Analyze text content with custom prompt (for agent framework)
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} AI response
   */
  async analyze(options) {
    const { prompt, model, config } = options;

    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: model || this.model,
          max_tokens: config?.maxTokens || this.maxTokens,
          temperature: config?.temperature || this.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        }
      );

      return {
        content: response.data.content[0].text,
        model: model || this.model,
        provider: 'claude'
      };
    } catch (error) {
      logger.error('Claude API error', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze image with custom prompt (for agent framework)
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} AI response
   */
  async analyzeImage(options) {
    const { imageUrl, prompt, model, config } = options;

    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      // Claude supports vision via base64 or URLs
      const response = await axios.post(
        this.apiUrl,
        {
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: config?.maxTokens || this.maxTokens,
          temperature: config?.temperature || this.temperature,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    url: imageUrl
                  }
                },
                {
                  type: 'text',
                  text: prompt
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        }
      );

      return {
        content: response.data.content[0].text,
        model: model || this.model,
        provider: 'claude'
      };
    } catch (error) {
      logger.error('Claude image analysis error', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if provider is available
   */
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return { available: false, error: 'API key not configured' };
      }

      // Simple test request
      await this.analyzeContent({ text: 'test', type: 'text' });

      return { available: true };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

module.exports = ClaudeProvider;
