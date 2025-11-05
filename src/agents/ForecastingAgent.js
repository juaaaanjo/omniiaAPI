const mongoose = require('mongoose');
const OpenAIService = require('../services/openaiService');
const logger = require('../utils/logger');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');
const ForecastHistory = require('../models/ForecastHistory');

/**
 * Forecasting Agent
 * Uses AI and historical data to generate business forecasts
 */
class ForecastingAgent {
  constructor() {
    this.name = 'ForecastingAgent';
    this.aiService = new OpenAIService();
  }

  /**
   * Generate forecast based on historical data
   * @param {string} userId - User ID
   * @param {Object} options - Forecast options
   * @returns {Promise<Object>} Forecast results
   */
  async generateForecast(userId, options = {}) {
    try {
      const {
        forecastType = 'revenue', // revenue, ad_spend, customer_growth, roas, comprehensive
        forecastPeriod = 'next_month', // next_week, next_month, next_quarter, custom
        customDays = null,
        includeSeasonality = true,
        confidenceLevel = 0.8,
        language = 'es', // Default to Spanish
        userInfo = null, // User info for saving history
        scenarioType = null, // For scenario analysis
        scenarioGroupId = null, // For grouping scenarios
      } = options;

      logger.info(`${this.name}: Generating ${forecastType} forecast for user ${userId}`);

      // Get historical data
      const historicalData = await this.fetchHistoricalData(userId, forecastType);

      // Calculate time range for forecast
      const forecastRange = this.calculateForecastRange(forecastPeriod, customDays);

      // Generate forecast using AI
      const forecast = await this.generateAIForecast(
        historicalData,
        forecastType,
        forecastRange,
        includeSeasonality,
        confidenceLevel,
        language
      );

      const result = {
        forecastType,
        forecastPeriod,
        forecastRange,
        ...forecast,
        generatedAt: new Date(),
      };

      // Save forecast to history if userInfo is provided
      if (userInfo) {
        await this.saveForecastHistory(userId, userInfo, result, {
          includeSeasonality,
          language,
          scenarioType,
          scenarioGroupId,
        });
      }

      return result;
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save forecast to history database
   */
  async saveForecastHistory(userId, userInfo, forecastResult, options = {}) {
    try {
      const historyEntry = new ForecastHistory({
        userId,
        userName: userInfo.name,
        userEmail: userInfo.email,
        forecastType: forecastResult.forecastType,
        forecastPeriod: forecastResult.forecastPeriod,
        forecastStartDate: forecastResult.forecastRange.startDate,
        forecastEndDate: forecastResult.forecastRange.endDate,
        forecastDays: forecastResult.forecastRange.days,
        analysis: forecastResult.analysis,
        forecast: forecastResult.forecast,
        confidenceLevel: forecastResult.confidence,
        includeSeasonality: options.includeSeasonality || true,
        language: options.language || 'es',
        aiModel: forecastResult.model,
        tokensUsed: forecastResult.usage?.totalTokens || 0,
        responseTime: forecastResult.usage?.responseTime || 0,
        isScenario: !!options.scenarioType,
        scenarioType: options.scenarioType || null,
        scenarioGroupId: options.scenarioGroupId || null,
      });

      await historyEntry.save();
      logger.info(`Forecast history saved for user ${userId}`);
    } catch (error) {
      logger.error(`Error saving forecast history: ${error.message}`);
      // Don't throw - we don't want to fail the forecast if history save fails
    }
  }

  /**
   * Fetch historical data for forecasting
   */
  async fetchHistoricalData(userId, forecastType) {
    // Look back 180 days for better trend analysis
    const endDate = new Date();
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const historicalData = {
      dateRange: { startDate, endDate },
      dataPoints: []
    };

    try {
      // Get daily revenue data
      if (['revenue', 'comprehensive', 'customer_growth'].includes(forecastType)) {
        const dailyRevenue = await TransactionData.getDailyRevenue(userId, startDate, endDate);
        historicalData.dailyRevenue = dailyRevenue;

        const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);
        historicalData.revenueSummary = revenueSummary;
      }

      // Get daily ad spend data
      if (['ad_spend', 'roas', 'comprehensive'].includes(forecastType)) {
        const dailyAdSpend = await MetaAdsData.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              dateStart: { $gte: startDate },
              dateStop: { $lte: endDate },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$dateStart' } },
              dailySpend: { $sum: '$spend' },
              dailyImpressions: { $sum: '$impressions' },
              dailyClicks: { $sum: '$clicks' },
              dailyConversions: { $sum: '$conversions' },
              dailyRevenue: { $sum: '$attribution.revenue' },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              date: '$_id',
              spend: '$dailySpend',
              impressions: '$dailyImpressions',
              clicks: '$dailyClicks',
              conversions: '$dailyConversions',
              revenue: '$dailyRevenue',
            },
          },
        ]);

        historicalData.dailyAdSpend = dailyAdSpend;
      }

      // Get customer metrics
      if (['customer_growth', 'comprehensive'].includes(forecastType)) {
        const customerMetrics = await this.getCustomerGrowthMetrics(userId, startDate, endDate);
        historicalData.customerMetrics = customerMetrics;
      }

      return historicalData;
    } catch (error) {
      logger.error(`Error fetching historical data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get customer growth metrics
   */
  async getCustomerGrowthMetrics(userId, startDate, endDate) {
    const customerGrowth = await TransactionData.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          transactionCreatedAt: {
            $gte: startDate,
            $lte: endDate,
          },
          status: { $in: ['succeeded', 'completed'] },
          customerEmail: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$transactionCreatedAt' } },
            customer: '$customerEmail',
          },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          newCustomers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          newCustomers: 1,
        },
      },
    ]);

    return customerGrowth;
  }

  /**
   * Calculate forecast range
   */
  calculateForecastRange(forecastPeriod, customDays) {
    const startDate = new Date();
    let endDate = new Date();
    let days = 0;

    switch (forecastPeriod) {
      case 'next_week':
        days = 7;
        endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'next_month':
        days = 30;
        endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'next_quarter':
        days = 90;
        endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        days = customDays || 30;
        endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        break;
      default:
        days = 30;
        endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    return {
      startDate,
      endDate,
      days,
    };
  }

  /**
   * Generate AI-powered forecast
   */
  async generateAIForecast(
    historicalData,
    forecastType,
    forecastRange,
    includeSeasonality,
    confidenceLevel,
    language = 'es'
  ) {
    // Language-specific instructions
    const languageInstructions = {
      es: `CRÍTICO - IDIOMA ESPAÑOL OBLIGATORIO:
- Responde EXCLUSIVAMENTE en ESPAÑOL
- TODO el análisis debe estar en español
- TODAS las predicciones deben estar en español
- TODAS las recomendaciones deben estar en español
- TODAS las explicaciones deben estar en español
- NO uses inglés bajo ninguna circunstancia
- Usa terminología de negocios y análisis en español`,
      en: `CRITICAL - ENGLISH LANGUAGE REQUIRED:
- Respond EXCLUSIVELY in ENGLISH
- ALL analysis must be in English
- ALL predictions must be in English
- ALL recommendations must be in English
- ALL explanations must be in English
- DO NOT use Spanish under any circumstances
- Use business and analytics terminology in English`,
    };

    const languageInstruction = languageInstructions[language] || languageInstructions.es;

    const systemPrompt = `You are an expert business forecasting analyst specializing in predictive analytics and time series forecasting.

${languageInstruction}

Your task is to analyze historical business data and generate accurate, actionable forecasts.

IMPORTANT INSTRUCTIONS:
1. Base forecasts on observable trends, patterns, and seasonality in the historical data
2. Provide specific numerical predictions with confidence intervals
3. Explain the methodology and key assumptions
4. Identify risks and opportunities
5. Format numerical values clearly (e.g., $1,234.56 for currency)
6. Include both optimistic and pessimistic scenarios when relevant

Data Analysis Requirements:
- Identify trends (growth, decline, stability)
- Detect seasonality patterns (weekly, monthly)
- Note any anomalies or outliers
- Calculate growth rates and volatility
- Consider external factors that might affect forecasts`;

    const forecastPrompt = this.buildForecastPrompt(
      historicalData,
      forecastType,
      forecastRange,
      includeSeasonality,
      confidenceLevel
    );

    const response = await this.aiService.ask(forecastPrompt, systemPrompt, {
      max_tokens: 4096,
      temperature: 0.3, // Lower temperature for more consistent predictions
    });

    // Parse the AI response to extract structured forecast data
    const parsedForecast = this.parseAIResponse(response.content, forecastType);

    return {
      forecast: parsedForecast,
      analysis: response.content,
      confidence: confidenceLevel,
      usage: response.usage,
      model: response.model,
    };
  }

  /**
   * Build forecast prompt based on type
   */
  buildForecastPrompt(historicalData, forecastType, forecastRange, includeSeasonality, confidenceLevel) {
    let prompt = `Based on the following historical data, generate a detailed ${forecastType} forecast for the next ${forecastRange.days} days (from ${forecastRange.startDate.toISOString().split('T')[0]} to ${forecastRange.endDate.toISOString().split('T')[0]}).

Historical Data Period: ${historicalData.dateRange.startDate.toISOString().split('T')[0]} to ${historicalData.dateRange.endDate.toISOString().split('T')[0]}

`;

    // Add specific data based on forecast type
    switch (forecastType) {
      case 'revenue':
        prompt += `\nRevenue Data:\n${JSON.stringify(historicalData.dailyRevenue, null, 2)}`;
        prompt += `\n\nRevenue Summary:\n${JSON.stringify(historicalData.revenueSummary, null, 2)}`;
        prompt += `\n\nProvide:\n1. Predicted total revenue for the forecast period\n2. Daily/weekly breakdown\n3. Growth rate projections\n4. Confidence interval (${confidenceLevel * 100}%)\n5. Key assumptions and risks`;
        break;

      case 'ad_spend':
        prompt += `\nAdvertising Spend Data:\n${JSON.stringify(historicalData.dailyAdSpend, null, 2)}`;
        prompt += `\n\nProvide:\n1. Recommended ad spend budget for the forecast period\n2. Expected performance metrics (impressions, clicks, conversions)\n3. Optimal budget allocation strategy\n4. ROI projections\n5. Budget optimization recommendations`;
        break;

      case 'customer_growth':
        prompt += `\nCustomer Growth Data:\n${JSON.stringify(historicalData.customerMetrics, null, 2)}`;
        prompt += `\n\nProvide:\n1. Predicted new customer acquisition\n2. Growth rate projections\n3. Customer lifetime value estimates\n4. Churn predictions (if applicable)\n5. Acquisition cost trends`;
        break;

      case 'roas':
        prompt += `\nAd Spend and Revenue Data:\n${JSON.stringify(historicalData.dailyAdSpend, null, 2)}`;
        prompt += `\n\nProvide:\n1. Predicted ROAS (Return on Ad Spend) for the forecast period\n2. Expected revenue from advertising\n3. Optimal spending levels for target ROAS\n4. Campaign performance predictions\n5. Budget efficiency recommendations`;
        break;

      case 'comprehensive':
        prompt += `\nRevenue Data:\n${JSON.stringify(historicalData.dailyRevenue?.slice(-30), null, 2)}`;
        prompt += `\n\nAd Spend Data:\n${JSON.stringify(historicalData.dailyAdSpend?.slice(-30), null, 2)}`;
        prompt += `\n\nCustomer Metrics:\n${JSON.stringify(historicalData.customerMetrics?.slice(-30), null, 2)}`;
        prompt += `\n\nProvide a comprehensive business forecast including:\n1. Revenue predictions\n2. Customer growth forecasts\n3. Marketing ROI projections\n4. Cash flow estimates\n5. Strategic recommendations\n6. Risk factors and opportunities\n7. Key performance indicators (KPIs) to monitor`;
        break;
    }

    if (includeSeasonality) {
      prompt += `\n\nIMPORTANT: Analyze and account for seasonality patterns in the historical data.`;
    }

    prompt += `\n\nPlease structure your response with clear sections and specific numerical predictions.`;

    return prompt;
  }

  /**
   * Parse AI response to extract structured data
   */
  parseAIResponse(aiResponse, forecastType) {
    // Basic structure - the AI response is the primary content
    // Additional parsing can be added to extract specific numbers
    return {
      type: forecastType,
      summary: aiResponse,
      // You could add regex parsing here to extract specific values like:
      // - Total predicted revenue
      // - Growth percentages
      // - Specific dates and values
      // But for now, we'll rely on the AI's structured response
    };
  }

  /**
   * Generate scenario analysis (best case, worst case, most likely)
   */
  async generateScenarioAnalysis(userId, forecastType, forecastPeriod, language = 'es', userInfo = null) {
    try {
      logger.info(`${this.name}: Generating scenario analysis for user ${userId}`);

      // Generate unique group ID for related scenarios
      const scenarioGroupId = `scenario_${userId}_${Date.now()}`;

      const scenarios = await Promise.all([
        this.generateForecast(userId, {
          forecastType,
          forecastPeriod,
          confidenceLevel: 0.95, // Best case
          language,
          userInfo,
          scenarioType: 'best_case',
          scenarioGroupId,
        }),
        this.generateForecast(userId, {
          forecastType,
          forecastPeriod,
          confidenceLevel: 0.5, // Most likely
          language,
          userInfo,
          scenarioType: 'most_likely',
          scenarioGroupId,
        }),
        this.generateForecast(userId, {
          forecastType,
          forecastPeriod,
          confidenceLevel: 0.2, // Worst case
          language,
          userInfo,
          scenarioType: 'worst_case',
          scenarioGroupId,
        }),
      ]);

      return {
        bestCase: scenarios[0],
        mostLikely: scenarios[1],
        worstCase: scenarios[2],
        scenarioGroupId,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error(`${this.name} scenario analysis error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ForecastingAgent;
