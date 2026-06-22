/**
 * ═══════════════════════════════════════════════════════════
 * Text Moderation Agent
 * AI-powered text content moderation
 * ═══════════════════════════════════════════════════════════
 */

const BaseAgent = require('./BaseAgent');

class TextModerationAgent extends BaseAgent {
  static type = 'text_moderation';

  async execute(content) {
    this.validateContent(content);

    const { contentText, contentType, userId } = content;

    this.log('info', 'Analyzing text content', {
      contentType,
      textLength: contentText?.length || 0
    });

    try {
      // Analyze with AI provider
      const analysis = await this.analyzeWithAI(contentText);

      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(analysis.scores);

      this.log('info', 'Text analysis complete', {
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
      this.log('error', 'Text analysis failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze text with AI provider
   */
  async analyzeWithAI(text) {
    if (!this.provider) {
      throw new Error('AI provider not configured');
    }

    const prompt = this.config.promptTemplate || this.getDefaultPrompt();
    const formattedPrompt = prompt.replace('{{content}}', text);

    // Call AI provider
    const response = await this.provider.analyze({
      prompt: formattedPrompt,
      model: this.config.model,
      config: this.config.config
    });

    // Parse AI response
    return this.parseAIResponse(response);
  }

  /**
   * Get default moderation prompt
   */
  getDefaultPrompt() {
    return `Analyze the following content for moderation purposes. Rate each category from 0-100:
- Toxicity (offensive, rude, disrespectful language)
- Hate Speech (attacks based on identity, protected characteristics)
- Violence (violent content, threats, graphic descriptions)
- NSFW (sexual or adult content)
- Spam (repetitive, promotional, or low-quality content)

Content to analyze:
"""
{{content}}
"""

Respond with JSON in this format:
{
  "scores": {
    "toxicity": 0-100,
    "hateSpeech": 0-100,
    "violence": 0-100,
    "nsfw": 0-100,
    "spam": 0-100
  },
  "categories": ["list", "of", "violated", "categories"],
  "confidence": 0-100,
  "reasoning": "Brief explanation of the analysis"
}`;
  }

  /**
   * Parse AI provider response
   */
  parseAIResponse(response) {
    try {
      // Try to parse JSON from response
      const content = response.content || response.text || response;

      // Extract JSON from response (handle markdown code blocks)
      let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*\}/);
      }

      const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      const parsed = JSON.parse(jsonText);

      return {
        scores: {
          toxicity: parsed.scores?.toxicity || 0,
          hateSpeech: parsed.scores?.hateSpeech || parsed.scores?.hate_speech || 0,
          violence: parsed.scores?.violence || 0,
          nsfw: parsed.scores?.nsfw || 0,
          spam: parsed.scores?.spam || 0
        },
        categories: parsed.categories || [],
        confidence: parsed.confidence || 75,
        reasoning: parsed.reasoning || ''
      };

    } catch (error) {
      this.log('warn', 'Failed to parse AI response', {
        error: error.message,
        response: response.substring ? response.substring(0, 200) : response
      });

      // Return default safe scores if parsing fails
      return {
        scores: {
          toxicity: 0,
          hateSpeech: 0,
          violence: 0,
          nsfw: 0,
          spam: 0
        },
        categories: [],
        confidence: 0,
        reasoning: 'Failed to parse AI response'
      };
    }
  }
}

module.exports = TextModerationAgent;
