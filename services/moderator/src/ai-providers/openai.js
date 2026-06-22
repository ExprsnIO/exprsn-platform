/**
 * ═══════════════════════════════════════════════════════════
 * OpenAI Provider
 * OpenAI API integration for content moderation
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

class OpenAIProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || 'gpt-4-turbo-preview';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.moderationUrl = 'https://api.openai.com/v1/moderations';
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 1000;
  }

  /**
   * Analyze content for moderation
   * Uses both OpenAI moderation API and GPT for detailed analysis
   */
  async analyzeContent(content) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Use OpenAI's built-in moderation API first
      const moderationResult = await this._getModerationScores(content.text);

      // Get detailed analysis from GPT
      const detailedAnalysis = await this._getDetailedAnalysis(content);

      // Combine results
      const result = this._combineResults(moderationResult, detailedAnalysis);

      logger.info('OpenAI moderation analysis completed', {
        model: this.model,
        riskScore: result.riskScore
      });

      return result;
    } catch (error) {
      logger.error('OpenAI API error', {
        error: error.message,
        status: error.response?.status
      });

      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Use OpenAI moderation API
   * @private
   */
  async _getModerationScores(text) {
    try {
      const response = await axios.post(
        this.moderationUrl,
        { input: text },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 30000
        }
      );

      const result = response.data.results[0];

      return {
        flagged: result.flagged,
        categories: result.categories,
        categoryScores: result.category_scores
      };
    } catch (error) {
      logger.warn('OpenAI moderation API failed, using GPT only', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get detailed analysis from GPT
   * @private
   */
  async _getDetailedAnalysis(content) {
    const prompt = this._buildModerationPrompt(content);

    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'system',
            content: 'You are a content moderation AI that provides detailed safety analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
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

    const text = response.data.choices[0].message.content;
    return JSON.parse(text);
  }

  /**
   * Build moderation prompt
   * @private
   */
  _buildModerationPrompt(content) {
    return `Analyze the following content for moderation purposes.

Content Type: ${content.type || 'text'}
Content: ${content.text || ''}

Provide scores (0-100) for:
- toxicity_score: Offensive language, harassment, bullying
- nsfw_score: Adult content, explicit material
- spam_score: Promotional content, repetitive messages
- violence_score: Threats, graphic violence
- hate_speech_score: Discrimination, slurs, targeted harassment
- overall_risk_score: Overall risk assessment

Also include:
- flags: Array of specific issues detected
- explanation: Brief explanation

Respond with valid JSON matching this structure:
{
  "toxicity_score": 0,
  "nsfw_score": 0,
  "spam_score": 0,
  "violence_score": 0,
  "hate_speech_score": 0,
  "overall_risk_score": 0,
  "flags": [],
  "explanation": ""
}`;
  }

  /**
   * Combine moderation API and GPT results
   * @private
   */
  _combineResults(moderationResult, detailedAnalysis) {
    const scores = {
      provider: 'openai',
      model: this.model,
      riskScore: detailedAnalysis.overall_risk_score || 0,
      toxicityScore: detailedAnalysis.toxicity_score || 0,
      nsfwScore: detailedAnalysis.nsfw_score || 0,
      spamScore: detailedAnalysis.spam_score || 0,
      violenceScore: detailedAnalysis.violence_score || 0,
      hateSpeechScore: detailedAnalysis.hate_speech_score || 0,
      flags: detailedAnalysis.flags || [],
      explanation: detailedAnalysis.explanation || ''
    };

    // If moderation API result available, adjust scores
    if (moderationResult && moderationResult.flagged) {
      const categoryScores = moderationResult.categoryScores;

      // Convert OpenAI category scores (0-1) to 0-100 and boost if flagged
      if (categoryScores.hate > 0.5) {
        scores.hateSpeechScore = Math.max(scores.hateSpeechScore, categoryScores.hate * 100);
      }

      if (categoryScores['hate/threatening'] > 0.5) {
        scores.hateSpeechScore = Math.max(scores.hateSpeechScore, categoryScores['hate/threatening'] * 100);
        scores.violenceScore = Math.max(scores.violenceScore, categoryScores['hate/threatening'] * 100);
      }

      if (categoryScores.harassment > 0.5) {
        scores.toxicityScore = Math.max(scores.toxicityScore, categoryScores.harassment * 100);
      }

      if (categoryScores['harassment/threatening'] > 0.5) {
        scores.toxicityScore = Math.max(scores.toxicityScore, categoryScores['harassment/threatening'] * 100);
        scores.violenceScore = Math.max(scores.violenceScore, categoryScores['harassment/threatening'] * 100);
      }

      if (categoryScores.sexual > 0.5 || categoryScores['sexual/minors'] > 0.8) {
        scores.nsfwScore = Math.max(scores.nsfwScore, categoryScores.sexual * 100);
      }

      if (categoryScores.violence > 0.5 || categoryScores['violence/graphic'] > 0.5) {
        scores.violenceScore = Math.max(scores.violenceScore, Math.max(categoryScores.violence, categoryScores['violence/graphic']) * 100);
      }

      // Recalculate overall risk score
      scores.riskScore = Math.max(
        scores.riskScore,
        Math.max(
          scores.toxicityScore,
          scores.nsfwScore,
          scores.violenceScore,
          scores.hateSpeechScore
        )
      );
    }

    return scores;
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

module.exports = OpenAIProvider;
