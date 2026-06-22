/**
 * ═══════════════════════════════════════════════════════════
 * Video Moderation Agent
 * AI-powered video content moderation
 * ═══════════════════════════════════════════════════════════
 */

const BaseAgent = require('./BaseAgent');
const axios = require('axios');

class VideoModerationAgent extends BaseAgent {
  static type = 'video_moderation';

  async execute(content) {
    this.validateContent(content);

    const { contentUrl, contentText, contentType, userId } = content;

    if (!contentUrl) {
      throw new Error('Video URL is required for video moderation');
    }

    this.log('info', 'Analyzing video content', {
      contentType,
      url: contentUrl
    });

    try {
      // For video, we'll analyze:
      // 1. Video thumbnail/first frame
      // 2. Video metadata (title, description)
      // 3. Audio transcription (if available)

      const analysis = await this.analyzeVideo(contentUrl, contentText);

      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(analysis.scores);

      this.log('info', 'Video analysis complete', {
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
      this.log('error', 'Video analysis failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze video content
   */
  async analyzeVideo(videoUrl, metadata) {
    // Strategy: Analyze video metadata and thumbnail
    // In production, you'd extract frames and analyze them

    const analyses = [];

    // 1. Analyze metadata if provided
    if (metadata) {
      const metadataAnalysis = await this.analyzeMetadata(metadata);
      analyses.push(metadataAnalysis);
    }

    // 2. For demo purposes, we'll use a simplified approach
    // In production, you'd:
    // - Extract video thumbnail or key frames
    // - Analyze audio if available
    // - Use specialized video moderation APIs

    // Combine analyses
    return this.combineAnalyses(analyses);
  }

  /**
   * Analyze video metadata (title, description)
   */
  async analyzeMetadata(metadata) {
    if (!this.provider) {
      throw new Error('AI provider not configured');
    }

    const prompt = `Analyze this video metadata for moderation purposes. Rate each category from 0-100:
- NSFW (adult content indicators)
- Violence (violent content indicators)
- Hate Speech (discriminatory or hateful content)
- Spam (promotional or spam indicators)

Metadata: ${metadata}

Respond with JSON:
{
  "scores": {
    "nsfw": 0-100,
    "violence": 0-100,
    "hateSpeech": 0-100,
    "spam": 0-100
  },
  "categories": ["violated categories"],
  "confidence": 0-100,
  "reasoning": "explanation"
}`;

    const response = await this.provider.analyze({
      prompt,
      model: this.config.model,
      config: this.config.config
    });

    return this.parseAIResponse(response);
  }

  /**
   * Combine multiple analyses
   */
  combineAnalyses(analyses) {
    if (analyses.length === 0) {
      return {
        scores: {
          nsfw: 0,
          violence: 0,
          hateSpeech: 0,
          spam: 0
        },
        categories: [],
        confidence: 50,
        reasoning: 'No analysis data available'
      };
    }

    // Average scores from all analyses
    const combinedScores = {
      nsfw: 0,
      violence: 0,
      hateSpeech: 0,
      spam: 0
    };

    const allCategories = new Set();
    let totalConfidence = 0;

    for (const analysis of analyses) {
      for (const [key, value] of Object.entries(analysis.scores)) {
        combinedScores[key] = (combinedScores[key] || 0) + value;
      }

      analysis.categories?.forEach(cat => allCategories.add(cat));
      totalConfidence += analysis.confidence || 0;
    }

    // Calculate averages
    const count = analyses.length;
    for (const key in combinedScores) {
      combinedScores[key] = Math.round(combinedScores[key] / count);
    }

    return {
      scores: combinedScores,
      categories: Array.from(allCategories),
      confidence: Math.round(totalConfidence / count),
      reasoning: `Combined analysis from ${count} sources`
    };
  }

  /**
   * Parse AI provider response
   */
  parseAIResponse(response) {
    try {
      const content = response.content || response.text || response;

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
          hateSpeech: parsed.scores?.hateSpeech || parsed.scores?.hate_speech || 0,
          spam: parsed.scores?.spam || 0
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
          spam: 0
        },
        categories: [],
        confidence: 0,
        reasoning: 'Failed to parse AI response'
      };
    }
  }
}

module.exports = VideoModerationAgent;
