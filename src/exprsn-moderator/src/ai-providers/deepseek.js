/**
 * ═══════════════════════════════════════════════════════════
 * DeepSeek AI Provider
 * DeepSeek API integration for content moderation
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

class DeepSeekProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    this.model = config.model || 'deepseek-chat';
    this.apiUrl = config.apiUrl || 'https://api.deepseek.com/v1/chat/completions';
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 1000;
  }

  /**
   * Analyze content for moderation
   */
  async analyzeContent(content) {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    try {
      const prompt = this._buildModerationPrompt(content);

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a content moderation AI that analyzes content for safety issues and provides structured JSON responses.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 30000
        }
      );

      const result = this._parseResponse(response.data);

      logger.info('DeepSeek moderation analysis completed', {
        model: this.model,
        riskScore: result.riskScore
      });

      return result;
    } catch (error) {
      logger.error('DeepSeek API error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(`DeepSeek API error: ${error.message}`);
    }
  }

  /**
   * Build moderation prompt for DeepSeek
   * @private
   */
  _buildModerationPrompt(content) {
    return `Analyze the following content for moderation purposes and respond with a JSON object.

Content Type: ${content.type || 'text'}
Content: ${content.text || ''}

Evaluate the content across these dimensions:
1. **Toxicity**: Offensive language, personal attacks, harassment, bullying
2. **NSFW**: Adult content, sexual content, explicit material
3. **Spam**: Promotional content, repetitive messages, bot-like behavior
4. **Violence**: Threats, graphic violence, gore, violent imagery
5. **Hate Speech**: Discrimination, slurs, targeted harassment based on identity

Provide scores from 0-100 for each dimension where:
- 0-30: Safe, no issues
- 31-50: Minor concerns
- 51-75: Moderate risk
- 76-90: High risk
- 91-100: Critical violation

Respond with ONLY a valid JSON object:
{
  "toxicity_score": <number 0-100>,
  "nsfw_score": <number 0-100>,
  "spam_score": <number 0-100>,
  "violence_score": <number 0-100>,
  "hate_speech_score": <number 0-100>,
  "overall_risk_score": <number 0-100>,
  "flags": [<array of specific issues>],
  "explanation": "<brief explanation>"
}`;
  }

  /**
   * Parse DeepSeek API response
   * @private
   */
  _parseResponse(data) {
    try {
      const message = data.choices[0].message;
      const parsed = JSON.parse(message.content);

      return {
        provider: 'deepseek',
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
      logger.error('Failed to parse DeepSeek response', {
        error: error.message,
        content: data.choices?.[0]?.message?.content
      });
      throw new Error('Failed to parse DeepSeek API response');
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

module.exports = DeepSeekProvider;
