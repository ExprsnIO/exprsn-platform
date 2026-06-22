/**
 * ═══════════════════════════════════════════════════════════
 * OpenAI Integration Service
 * OpenAI GPT-4 and Moderation API for content analysis
 * ═══════════════════════════════════════════════════════════
 */

const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class OpenAIService {
  constructor() {
    if (!config.ai.openai.enabled) {
      logger.warn('OpenAI is disabled in configuration');
      return;
    }

    if (!config.ai.openai.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    this.client = new OpenAI({
      apiKey: config.ai.openai.apiKey
    });

    this.model = config.ai.openai.model;
    this.moderationModel = config.ai.openai.moderationModel;
    this.visionModel = config.ai.openai.visionModel;
    this.maxTokens = config.ai.openai.maxTokens;
  }

  /**
   * Analyze text using OpenAI Moderation API
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Moderation result
   */
  async moderateText(text) {
    try {
      const cacheKey = `openai:moderate:${this._hashContent(text)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached OpenAI moderation result');
        return JSON.parse(cached);
      }

      const moderation = await this.client.moderations.create({
        model: this.moderationModel,
        input: text
      });

      const result = moderation.results[0];

      // Convert OpenAI format to our format
      const normalized = this._normalizeOpenAIModerationResult(result);

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(normalized), 300);

      logger.info('OpenAI moderation completed', {
        flagged: result.flagged,
        categories: Object.keys(result.categories).filter(k => result.categories[k])
      });

      return normalized;

    } catch (error) {
      logger.error('OpenAI moderation failed', { error: error.message });
      throw new Error(`OpenAI moderation failed: ${error.message}`);
    }
  }

  /**
   * Analyze text content with GPT-4 for detailed analysis
   * @param {string} text - Text to analyze
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Detailed analysis result
   */
  async analyzeText(text, context = {}) {
    try {
      const cacheKey = `openai:analyze:${this._hashContent(text)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached OpenAI text analysis');
        return JSON.parse(cached);
      }

      const prompt = this._buildTextAnalysisPrompt(text, context);

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a content moderation expert. Analyze content thoroughly and provide detailed assessments in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(completion.choices[0].message.content);

      // Normalize result
      const normalized = {
        ...result,
        aiProvider: 'openai',
        aiModel: this.model
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(normalized), 300);

      logger.info('OpenAI text analysis completed', {
        riskScore: normalized.riskScore,
        categories: normalized.flaggedCategories
      });

      return normalized;

    } catch (error) {
      logger.error('OpenAI text analysis failed', { error: error.message });
      throw new Error(`OpenAI analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze image content with GPT-4 Vision
   * @param {string} imageUrl - Image URL or base64
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Image analysis result
   */
  async analyzeImage(imageUrl, context = {}) {
    try {
      const cacheKey = `openai:image:${this._hashContent(imageUrl)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached OpenAI image analysis');
        return JSON.parse(cached);
      }

      const prompt = this._buildImageAnalysisPrompt(context);

      const completion = await this.client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: 'You are a content moderation expert specializing in visual content analysis. Provide detailed assessments in JSON format.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: this.maxTokens
      });

      const responseText = completion.choices[0].message.content;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Normalize result
      const normalized = {
        ...result,
        aiProvider: 'openai',
        aiModel: this.visionModel
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(normalized), 300);

      logger.info('OpenAI image analysis completed', {
        riskScore: normalized.riskScore,
        categories: normalized.flaggedCategories
      });

      return normalized;

    } catch (error) {
      logger.error('OpenAI image analysis failed', { error: error.message });
      throw new Error(`OpenAI image analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze combined text and images
   * @param {string} text - Text content
   * @param {Array<string>} imageUrls - Image URLs
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Multimodal analysis result
   */
  async analyzeMultimodal(text, imageUrls, context = {}) {
    try {
      const prompt = this._buildMultimodalAnalysisPrompt(text, context);

      const content = [
        {
          type: 'text',
          text: prompt
        }
      ];

      // Add images
      for (const imageUrl of imageUrls) {
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        });
      }

      const completion = await this.client.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: 'You are a content moderation expert. Analyze both text and visual content together. Provide detailed assessments in JSON format.'
          },
          {
            role: 'user',
            content: content
          }
        ],
        temperature: 0.3,
        max_tokens: this.maxTokens
      });

      const responseText = completion.choices[0].message.content;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Normalize result
      const normalized = {
        ...result,
        aiProvider: 'openai',
        aiModel: this.visionModel
      };

      logger.info('OpenAI multimodal analysis completed', {
        riskScore: normalized.riskScore,
        categories: normalized.flaggedCategories
      });

      return normalized;

    } catch (error) {
      logger.error('OpenAI multimodal analysis failed', { error: error.message });
      throw new Error(`OpenAI multimodal analysis failed: ${error.message}`);
    }
  }

  /**
   * Normalize OpenAI Moderation API result
   */
  _normalizeOpenAIModerationResult(result) {
    const categories = result.categories;
    const scores = result.category_scores;

    // Calculate overall risk score (weighted average)
    const weights = {
      'sexual': 0.9,
      'sexual/minors': 1.0,
      'hate': 0.95,
      'hate/threatening': 1.0,
      'harassment': 0.8,
      'harassment/threatening': 0.95,
      'self-harm': 1.0,
      'self-harm/intent': 1.0,
      'self-harm/instructions': 1.0,
      'violence': 0.9,
      'violence/graphic': 0.95
    };

    let weightedSum = 0;
    let totalWeight = 0;

    Object.keys(scores).forEach(category => {
      const weight = weights[category] || 0.5;
      weightedSum += scores[category] * 100 * weight;
      totalWeight += weight;
    });

    const riskScore = Math.round(weightedSum / totalWeight);

    // Determine risk level
    let riskLevel = 'SAFE';
    if (riskScore >= 91) riskLevel = 'CRITICAL';
    else if (riskScore >= 76) riskLevel = 'HIGH_RISK';
    else if (riskScore >= 51) riskLevel = 'MEDIUM_RISK';
    else if (riskScore >= 31) riskLevel = 'LOW_RISK';

    // Flagged categories
    const flaggedCategories = Object.keys(categories)
      .filter(k => categories[k])
      .map(k => k.replace('/', '_').toUpperCase());

    return {
      riskScore,
      riskLevel,
      toxicityScore: Math.round(scores.harassment * 100),
      hateSpeechScore: Math.round(scores.hate * 100),
      harassmentScore: Math.round(scores.harassment * 100),
      violenceScore: Math.round(scores.violence * 100),
      nsfwScore: Math.round(scores.sexual * 100),
      selfHarmScore: Math.round((scores['self-harm'] || 0) * 100),
      flaggedCategories,
      flagged: result.flagged,
      categoryScores: scores,
      aiProvider: 'openai',
      aiModel: this.moderationModel
    };
  }

  /**
   * Build text analysis prompt
   */
  _buildTextAnalysisPrompt(text, context) {
    const customRules = context.domainSettings?.customRules || [];
    const keywords = context.domainSettings?.keywords || [];

    return `Analyze the following text content for moderation issues. Provide a detailed assessment.

TEXT TO ANALYZE:
"""
${text}
"""

${customRules.length > 0 ? `CUSTOM RULES:
${customRules.map((rule, i) => `${i + 1}. ${rule.description}`).join('\n')}
` : ''}

${keywords.length > 0 ? `FLAGGED KEYWORDS:
${keywords.map(k => `- ${k.keyword} (severity: ${k.severity})`).join('\n')}
` : ''}

Provide your assessment in this exact JSON structure:
{
  "riskScore": <0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "toxicityScore": <0-100>,
  "hateSpeechScore": <0-100>,
  "harassmentScore": <0-100>,
  "violenceScore": <0-100>,
  "nsfwScore": <0-100>,
  "spamScore": <0-100>,
  "flaggedCategories": [],
  "detectedKeywords": [],
  "reasoning": "",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <0-100>
}`;
  }

  /**
   * Build image analysis prompt
   */
  _buildImageAnalysisPrompt(context) {
    return `Analyze this image for content moderation. Check for:
- NSFW content (nudity, sexually explicit material)
- Violence, gore, or graphic content
- Hate symbols or offensive imagery
- Illegal activities
- Disturbing content
- Spam or misleading imagery

Provide your assessment in JSON format:
{
  "riskScore": <0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "nsfwScore": <0-100>,
  "violenceScore": <0-100>,
  "goreScore": <0-100>,
  "hatefulSymbolsScore": <0-100>,
  "flaggedCategories": [],
  "detectedObjects": [],
  "reasoning": "",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <0-100>
}`;
  }

  /**
   * Build multimodal analysis prompt
   */
  _buildMultimodalAnalysisPrompt(text, context) {
    return `Analyze the following content (text + images) for moderation issues.

TEXT:
"""
${text}
"""

Consider how the text and images relate. Check for coordinated inappropriate content, misleading information, harassment, hate speech, violence, NSFW material, and spam.

Provide your assessment in JSON format:
{
  "riskScore": <0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "toxicityScore": <0-100>,
  "nsfwScore": <0-100>,
  "violenceScore": <0-100>,
  "hateSpeechScore": <0-100>,
  "spamScore": <0-100>,
  "flaggedCategories": [],
  "reasoning": "",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <0-100>
}`;
  }

  /**
   * Generate hash for caching
   */
  _hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

module.exports = new OpenAIService();
