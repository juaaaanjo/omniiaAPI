const OpenAIService = require('../services/openaiService');
const logger = require('../utils/logger');

/**
 * Alert Agent
 * Uses AI to generate insights and recommended actions for operational alerts
 */
class AlertAgent {
  constructor() {
    this.name = 'AlertAgent';
    this.aiService = new OpenAIService();
  }

  /**
   * Generate recommended actions for an alert
   * @param {Object} alertData - Alert information
   * @param {string} language - User language
   * @returns {Promise<Object>} Actions and insights
   */
  async generateRecommendations(alertData, language = 'es') {
    try {
      const {
        category,
        title,
        description,
        metric,
        contextData,
      } = alertData;

      logger.info(`${this.name}: Generating recommendations for ${category} alert`);

      const systemPrompt = this.buildSystemPrompt(language);
      const userPrompt = this.buildRecommendationPrompt(alertData, language);

      const response = await this.aiService.ask(userPrompt, systemPrompt, {
        max_tokens: 2000,
        temperature: 0.3,
      });

      // Parse AI response
      const recommendations = this.parseRecommendations(response.content, category);

      return {
        ...recommendations,
        usage: response.usage,
        model: response.model,
      };

    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build system prompt for AI
   */
  buildSystemPrompt(language) {
    const languageInstructions = {
      es: `CRÍTICO - IDIOMA ESPAÑOL OBLIGATORIO:
- Responde EXCLUSIVAMENTE en ESPAÑOL
- TODAS las acciones deben estar en español
- TODOS los insights deben estar en español
- TODAS las recomendaciones deben estar en español
- NO uses inglés bajo ninguna circunstancia
- Usa terminología de negocios en español`,
      en: `CRITICAL - ENGLISH LANGUAGE REQUIRED:
- Respond EXCLUSIVELY in ENGLISH
- ALL actions must be in English
- ALL insights must be in English
- ALL recommendations must be in English
- DO NOT use Spanish under any circumstances
- Use business terminology in English`,
    };

    const languageInstruction = languageInstructions[language] || languageInstructions.es;

    return `You are an expert business operations analyst specializing in identifying problems and providing actionable solutions.

${languageInstruction}

Your task is to analyze operational alerts and provide specific, actionable recommendations.

IMPORTANT INSTRUCTIONS:
1. Provide SPECIFIC, ACTIONABLE recommendations (not generic advice)
2. Each action should be clear and executable
3. Estimate the impact of each action
4. Prioritize actions by importance
5. Be concise but thorough
6. Focus on immediate fixes, not long-term strategy

Response Format (JSON):
{
  "recommendedActions": [
    {
      "title": "Short action title",
      "description": "What to do and how",
      "actionType": "increase_budget|decrease_budget|pause_campaign|resume_campaign|restock|respond_tickets|adjust_pricing|optimize_campaign|custom",
      "estimatedImpact": "Expected result of this action",
      "parameters": {} // Action-specific data
    }
  ],
  "insights": [
    "Key insight 1",
    "Key insight 2"
  ]
}`;
  }

  /**
   * Build recommendation prompt based on alert type
   */
  buildRecommendationPrompt(alertData, language) {
    const { category, title, description, metric, contextData } = alertData;

    let prompt = `Alert Category: ${category}
Alert: ${title}
Description: ${description}

`;

    // Add metric information
    if (metric) {
      prompt += `Metric Details:
- Name: ${metric.name}
- Current Value: ${metric.currentValue} ${metric.unit || ''}
- Previous Value: ${metric.previousValue} ${metric.unit || ''}
- Change: ${metric.changePercentage}%
- Threshold: ${metric.threshold}
- Trend: ${metric.trend}

`;
    }

    // Add category-specific context
    switch (category) {
      case 'roas':
        prompt += `This is a ROAS (Return on Ad Spend) alert.
Consider:
- Budget reallocation
- Campaign optimization
- Pausing low performers
- Scaling high performers

`;
        break;

      case 'stock':
        prompt += `This is a stock/inventory alert.
Consider:
- Reorder priorities
- Alternative products
- Supplier contact
- Customer communication

`;
        break;

      case 'customer_service':
        prompt += `This is a customer service alert.
Consider:
- Ticket prioritization
- Team allocation
- Response templates
- Escalation procedures

`;
        break;

      case 'revenue':
        prompt += `This is a revenue alert.
Consider:
- Sales initiatives
- Pricing adjustments
- Marketing campaigns
- Customer outreach

`;
        break;

      case 'campaign':
        prompt += `This is a campaign performance alert.
Consider:
- Budget adjustments
- Targeting optimization
- Creative refresh
- Pause/resume actions

`;
        break;
    }

    // Add context data if available
    if (contextData) {
      prompt += `Additional Context:
${JSON.stringify(contextData, null, 2)}

`;
    }

    prompt += `Provide 2-4 specific, actionable recommendations in JSON format.`;

    return prompt;
  }

  /**
   * Parse AI recommendations
   */
  parseRecommendations(aiResponse, category) {
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          recommendedActions: parsed.recommendedActions || [],
          insights: parsed.insights || [],
        };
      }
    } catch (error) {
      logger.warn(`Failed to parse AI recommendations as JSON: ${error.message}`);
    }

    // Fallback: create basic structure from text
    return {
      recommendedActions: [{
        title: 'Review situation',
        description: aiResponse.substring(0, 200),
        actionType: 'custom',
        estimatedImpact: 'Requires manual review',
        parameters: {},
      }],
      insights: ['AI analysis available in description'],
    };
  }

  /**
   * Generate daily insights for dashboard
   * @param {string} userId - User ID
   * @param {Object} data - Business data
   * @param {string} language - User language
   * @returns {Promise<Object>} Daily insights
   */
  async generateDailyInsights(userId, data, language = 'es') {
    try {
      logger.info(`${this.name}: Generating daily insights for user ${userId}`);

      const systemPrompt = this.buildInsightsSystemPrompt(language);
      const userPrompt = this.buildInsightsPrompt(data, language);

      const response = await this.aiService.ask(userPrompt, systemPrompt, {
        max_tokens: 1500,
        temperature: 0.4,
      });

      // Parse insights
      const insights = this.parseInsights(response.content);

      return {
        ...insights,
        generatedAt: new Date(),
        usage: response.usage,
      };

    } catch (error) {
      logger.error(`${this.name} daily insights error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build system prompt for daily insights
   */
  buildInsightsSystemPrompt(language) {
    const languageInstructions = {
      es: `CRÍTICO - IDIOMA ESPAÑOL OBLIGATORIO:
- Responde EXCLUSIVAMENTE en ESPAÑOL
- TODOS los insights deben estar en español
- TODAS las recomendaciones deben estar en español
- NO uses inglés bajo ninguna circunstancia`,
      en: `CRITICAL - ENGLISH LANGUAGE REQUIRED:
- Respond EXCLUSIVELY in ENGLISH
- ALL insights must be in English
- ALL recommendations must be in English
- DO NOT use Spanish under any circumstances`,
    };

    const languageInstruction = languageInstructions[language] || languageInstructions.es;

    return `You are a business intelligence analyst providing daily operational insights.

${languageInstruction}

Your task is to analyze business performance and provide brief, actionable insights.

Response Format (JSON):
{
  "positive": ["Positive insight 1", "Positive insight 2"],
  "negative": ["Issue 1", "Issue 2"],
  "neutral": ["FYI info 1", "FYI info 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Keep each insight to 1-2 sentences maximum. Be specific and actionable.`;
  }

  /**
   * Build insights prompt
   */
  buildInsightsPrompt(data, language) {
    return `Analyze the following business data and provide daily insights:

${JSON.stringify(data, null, 2)}

Provide 2-3 insights in each category: positive, negative, neutral, and recommendations.
Format as JSON.`;
  }

  /**
   * Parse daily insights
   */
  parseInsights(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          positive: parsed.positive || [],
          negative: parsed.negative || [],
          neutral: parsed.neutral || [],
          recommendations: parsed.recommendations || [],
        };
      }
    } catch (error) {
      logger.warn(`Failed to parse insights as JSON: ${error.message}`);
    }

    // Fallback
    return {
      positive: [],
      negative: [],
      neutral: ['Business data analyzed'],
      recommendations: ['Review detailed metrics for more insights'],
    };
  }
}

module.exports = AlertAgent;
