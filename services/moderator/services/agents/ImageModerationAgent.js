/**
 * ═══════════════════════════════════════════════════════════
 * Image Moderation Agent
 * AI-powered image content moderation
 * ═══════════════════════════════════════════════════════════
 */

const BaseAgent = require('./BaseAgent');
const axios = require('axios');

class ImageModerationAgent extends BaseAgent {
  static type = 'image_moderation';

  async execute(content) {
    this.validateContent(content);

    const { contentUrl, contentType, userId } = content;

    if (!contentUrl) {
      throw new Error('Image URL is required for image moderation');
    }

    this.log('info', 'Analyzing image content', {
      contentType,
      url: contentUrl
    });

    try {
      // Analyze with AI provider
      const analysis = await this.analyzeWithAI(contentUrl);

      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(analysis.scores);

      this.log('info', 'Image analysis complete', {
        riskScore,
        scores: analysis.scores
      });

      return this.formatResult(
        analysis.scores,
        this.determineAction(riskScore),
        analysis.confidence,
        {
          riskScore,
          categories: analysis.categories || [],
          reasoning: analysis.reasoning
        }
      );

    } catch (error) {
      this.log('error', 'Image analysis failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze image with AI provider
   */
  async analyzeWithAI(imageUrl) {
    if (!this.provider) {
      throw new Error('AI provider not configured');
    }

    const prompt = this.config.promptTemplate || this.getDefaultPrompt();

    // Call AI provider with vision capabilities
    const response = await this.provider.analyzeImage({
      imageUrl,
      prompt,
      model: this.config.model,
      config: this.config.config
    });

    // Parse AI response
    return this.parseAIResponse(response);
  }

  /**
   * Get default image moderation prompt
   */
  getDefaultPrompt() {
    return `Analyze this image for moderation purposes. Rate each category from 0-100:
- NSFW (nudity, sexual content, adult themes)
- Violence (graphic violence, weapons, gore)
- Hate Symbols (hate speech symbols, extremist imagery)
- Disturbing (shocking, disturbing, or traumatic content)

Respond with JSON in this format:
{
  "scores": {
    "nsfw": 0-100,
    "violence": 0-100,
    "hateSymbols": 0-100,
    "disturbing": 0-100
  },
  "categories": ["list", "of", "violated", "categories"],
  "confidence": 0-100,
  "reasoning": "Brief description of what you see and why it's flagged"
}`;
  }

  /**
   * Parse AI provider response
   */
  parseAIResponse(response) {
    try {
      const content = response.content || response.text || response;

      // Extract JSON from response
      let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*\}/);
      }

      const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      const parsed = JSON.parse(jsonText);

      return {
        scores: {
          nsfw: parsed.scores?.nsfw || 0,
          violence: parsed.scores?.violence || 0,
          hateSpeech: parsed.scores?.hateSymbols || parsed.scores?.hate_symbols || 0,
          disturbing: parsed.scores?.disturbing || 0
        },
        categories: parsed.categories || [],
        confidence: parsed.confidence || 75,
        reasoning: parsed.reasoning || ''
      };

    } catch (error) {
      this.log('warn', 'Failed to parse AI response', {
        error: error.message
      });

      return {
        scores: {
          nsfw: 0,
          violence: 0,
          hateSpeech: 0,
          disturbing: 0
        },
        categories: [],
        confidence: 0,
        reasoning: 'Failed to parse AI response'
      };
    }
  }
}

module.exports = ImageModerationAgent;
