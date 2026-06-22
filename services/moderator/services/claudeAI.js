/**
 * ═══════════════════════════════════════════════════════════
 * Claude AI Integration Service
 * Anthropic Claude for content moderation analysis
 * ═══════════════════════════════════════════════════════════
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class ClaudeAIService {
  constructor() {
    if (!config.ai.claude.enabled) {
      logger.warn('Claude AI is disabled in configuration');
      return;
    }

    if (!config.ai.claude.apiKey) {
      throw new Error('Claude API key not configured');
    }

    this.client = new Anthropic({
      apiKey: config.ai.claude.apiKey
    });

    this.model = config.ai.claude.model;
    this.maxTokens = config.ai.claude.maxTokens;
    this.temperature = config.ai.claude.temperature;
  }

  /**
   * Analyze text content for moderation issues
   * @param {string} text - Text content to analyze
   * @param {Object} context - Additional context (user info, domain settings, etc.)
   * @returns {Promise<Object>} Moderation analysis result
   */
  async analyzeText(text, context = {}) {
    try {
      const cacheKey = `claude:text:${this._hashContent(text)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached Claude text analysis');
        return JSON.parse(cached);
      }

      const prompt = this._buildTextModerationPrompt(text, context);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const result = this._parseClaudeResponse(message.content[0].text);

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(result), 300);

      logger.info('Claude text analysis completed', {
        riskScore: result.riskScore,
        categories: result.flaggedCategories
      });

      return result;

    } catch (error) {
      logger.error('Claude text analysis failed', { error: error.message });
      throw new Error(`Claude AI analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze image content for moderation issues
   * @param {string} imageUrl - Image URL or base64 data
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Moderation analysis result
   */
  async analyzeImage(imageUrl, context = {}) {
    try {
      const cacheKey = `claude:image:${this._hashContent(imageUrl)}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached Claude image analysis');
        return JSON.parse(cached);
      }

      const prompt = this._buildImageModerationPrompt(context);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
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
        }]
      });

      const result = this._parseClaudeResponse(message.content[0].text);

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(result), 300);

      logger.info('Claude image analysis completed', {
        riskScore: result.riskScore,
        categories: result.flaggedCategories
      });

      return result;

    } catch (error) {
      logger.error('Claude image analysis failed', { error: error.message });
      throw new Error(`Claude AI image analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze combined text and image content
   * @param {string} text - Text content
   * @param {Array<string>} imageUrls - Array of image URLs
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Moderation analysis result
   */
  async analyzeMultimodal(text, imageUrls, context = {}) {
    try {
      const prompt = this._buildMultimodalModerationPrompt(text, context);

      const content = [];

      // Add images
      for (const imageUrl of imageUrls) {
        content.push({
          type: 'image',
          source: {
            type: 'url',
            url: imageUrl
          }
        });
      }

      // Add text prompt
      content.push({
        type: 'text',
        text: prompt
      });

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
          role: 'user',
          content: content
        }]
      });

      const result = this._parseClaudeResponse(message.content[0].text);

      logger.info('Claude multimodal analysis completed', {
        riskScore: result.riskScore,
        categories: result.flaggedCategories
      });

      return result;

    } catch (error) {
      logger.error('Claude multimodal analysis failed', { error: error.message });
      throw new Error(`Claude AI multimodal analysis failed: ${error.message}`);
    }
  }

  /**
   * Build text moderation prompt
   */
  _buildTextModerationPrompt(text, context) {
    const customRules = context.domainSettings?.customRules || [];
    const keywords = context.domainSettings?.keywords || [];

    return `You are a content moderation AI assistant. Analyze the following text content for potential policy violations, harmful content, or inappropriate material.

TEXT TO ANALYZE:
"""
${text}
"""

${customRules.length > 0 ? `CUSTOM MODERATION RULES:
${customRules.map((rule, i) => `${i + 1}. ${rule.description}`).join('\n')}
` : ''}

${keywords.length > 0 ? `FLAGGED KEYWORDS TO CHECK:
${keywords.map(k => `- ${k.keyword} (severity: ${k.severity})`).join('\n')}
` : ''}

Analyze the content and provide a detailed moderation assessment in the following JSON format:

{
  "riskScore": <number 0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "toxicityScore": <number 0-100>,
  "hateSpeechScore": <number 0-100>,
  "harassmentScore": <number 0-100>,
  "violenceScore": <number 0-100>,
  "sexualContentScore": <number 0-100>,
  "spamScore": <number 0-100>,
  "flaggedCategories": ["<category1>", "<category2>"],
  "detectedKeywords": ["<keyword1>", "<keyword2>"],
  "reasoning": "<brief explanation of the assessment>",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <number 0-100>
}

Be thorough but fair. Consider context, intent, and severity. Respond ONLY with the JSON object.`;
  }

  /**
   * Build image moderation prompt
   */
  _buildImageModerationPrompt(context) {
    return `You are a content moderation AI assistant. Analyze the provided image for potential policy violations, inappropriate content, or harmful material.

Check for:
- Nudity or sexually explicit content (NSFW)
- Violence, gore, or graphic content
- Hate symbols or offensive imagery
- Illegal activities
- Disturbing or shocking content
- Spam or misleading content

Provide a detailed moderation assessment in the following JSON format:

{
  "riskScore": <number 0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "nsfwScore": <number 0-100>,
  "violenceScore": <number 0-100>,
  "goreScore": <number 0-100>,
  "hatefulSymbolsScore": <number 0-100>,
  "flaggedCategories": ["<category1>", "<category2>"],
  "detectedObjects": ["<object1>", "<object2>"],
  "reasoning": "<brief explanation of the assessment>",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <number 0-100>
}

Be thorough but fair. Consider artistic, educational, or newsworthy context. Respond ONLY with the JSON object.`;
  }

  /**
   * Build multimodal moderation prompt
   */
  _buildMultimodalModerationPrompt(text, context) {
    return `You are a content moderation AI assistant. Analyze the provided content (both text and images) for potential policy violations or inappropriate material.

TEXT CONTENT:
"""
${text}
"""

Analyze both the text and images together, considering how they relate to each other. Check for:
- Overall message and intent
- Inappropriate combinations of text and imagery
- Coordinated harassment or hate speech
- Misleading information
- Spam or scam content
- Violence, explicit content, or disturbing material

Provide a comprehensive moderation assessment in JSON format:

{
  "riskScore": <number 0-100>,
  "riskLevel": "<SAFE|LOW_RISK|MEDIUM_RISK|HIGH_RISK|CRITICAL>",
  "toxicityScore": <number 0-100>,
  "nsfwScore": <number 0-100>,
  "violenceScore": <number 0-100>,
  "hateSpeechScore": <number 0-100>,
  "spamScore": <number 0-100>,
  "flaggedCategories": ["<category1>", "<category2>"],
  "reasoning": "<brief explanation considering both text and images>",
  "recommendedAction": "<auto_approve|review|auto_reject>",
  "confidence": <number 0-100>
}

Respond ONLY with the JSON object.`;
  }

  /**
   * Parse Claude's response into structured data
   */
  _parseClaudeResponse(responseText) {
    try {
      // Extract JSON from response (Claude may wrap it in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize and validate response
      return {
        riskScore: Math.max(0, Math.min(100, parsed.riskScore || 0)),
        riskLevel: parsed.riskLevel || 'MEDIUM_RISK',
        toxicityScore: Math.max(0, Math.min(100, parsed.toxicityScore || 0)),
        hateSpeechScore: Math.max(0, Math.min(100, parsed.hateSpeechScore || 0)),
        harassmentScore: Math.max(0, Math.min(100, parsed.harassmentScore || 0)),
        violenceScore: Math.max(0, Math.min(100, parsed.violenceScore || 0)),
        nsfwScore: Math.max(0, Math.min(100, parsed.nsfwScore || parsed.sexualContentScore || 0)),
        spamScore: Math.max(0, Math.min(100, parsed.spamScore || 0)),
        flaggedCategories: parsed.flaggedCategories || [],
        detectedKeywords: parsed.detectedKeywords || [],
        detectedObjects: parsed.detectedObjects || [],
        reasoning: parsed.reasoning || '',
        recommendedAction: parsed.recommendedAction || 'review',
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        aiProvider: 'claude',
        aiModel: this.model
      };

    } catch (error) {
      logger.error('Failed to parse Claude response', { error: error.message });
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  /**
   * Generate hash for content caching
   */
  _hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

module.exports = new ClaudeAIService();
