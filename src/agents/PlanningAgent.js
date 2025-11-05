const mongoose = require('mongoose');
const OpenAIService = require('../services/openaiService');
const logger = require('../utils/logger');
const Plan = require('../models/Plan');
const ForecastHistory = require('../models/ForecastHistory');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');

/**
 * Planning Agent
 * Uses AI and data to generate actionable business plans
 */
class PlanningAgent {
  constructor() {
    this.name = 'PlanningAgent';
    this.aiService = new OpenAIService();
  }

  /**
   * Generate a business plan
   * @param {string} userId - User ID
   * @param {Object} options - Planning options
   * @returns {Promise<Object>} Plan results
   */
  async generatePlan(userId, options = {}) {
    try {
      const {
        planType = 'revenue_growth',
        planName,
        planPeriod = 'next_quarter', // next_month, next_quarter, next_year, custom
        customDays = null,
        goals = {},
        language = 'es',
        userInfo = null,
        relatedForecastId = null,
      } = options;

      logger.info(`${this.name}: Generating ${planType} plan for user ${userId}`);

      // Calculate plan range
      const planRange = this.calculatePlanRange(planPeriod, customDays);

      // Get historical data and current baseline
      const historicalData = await this.fetchHistoricalData(userId, planType);
      const baseline = await this.calculateBaseline(userId, historicalData);

      // Get related forecast if provided
      let relatedForecast = null;
      if (relatedForecastId) {
        relatedForecast = await ForecastHistory.findById(relatedForecastId);
      }

      // Generate AI-powered plan
      const aiPlan = await this.generateAIPlan(
        historicalData,
        baseline,
        planType,
        planRange,
        goals,
        relatedForecast,
        language
      );

      // Structure the complete plan
      const completePlan = {
        planType,
        planName: planName || `${planType} Plan - ${new Date().toLocaleDateString()}`,
        planStartDate: planRange.startDate,
        planEndDate: planRange.endDate,
        planDuration: planRange.days,
        goals: this.structureGoals(goals, planType, baseline),
        baseline,
        strategy: aiPlan.strategy,
        budget: aiPlan.budget,
        actionItems: aiPlan.actionItems,
        milestones: aiPlan.milestones,
        kpis: aiPlan.kpis,
        relatedForecastId,
        aiModel: aiPlan.model,
        tokensUsed: aiPlan.usage?.totalTokens || 0,
        responseTime: aiPlan.usage?.responseTime || 0,
        language,
        status: 'active',
      };

      // Save plan if userInfo provided
      if (userInfo) {
        const savedPlan = await this.savePlan(userId, userInfo, completePlan);
        return savedPlan;
      }

      return completePlan;
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save plan to database
   */
  async savePlan(userId, userInfo, planData) {
    try {
      const plan = new Plan({
        userId,
        userName: userInfo.name,
        userEmail: userInfo.email,
        ...planData,
      });

      await plan.save();
      logger.info(`Plan saved for user ${userId}: ${planData.planType}`);
      return plan;
    } catch (error) {
      logger.error(`Error saving plan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch historical data for planning
   */
  async fetchHistoricalData(userId, planType) {
    // Look back 90 days for trend analysis
    const endDate = new Date();
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const historicalData = {
      dateRange: { startDate, endDate },
    };

    try {
      // Get revenue data
      if (['revenue_growth', 'comprehensive'].includes(planType)) {
        const dailyRevenue = await TransactionData.getDailyRevenue(userId, startDate, endDate);
        const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);
        historicalData.dailyRevenue = dailyRevenue;
        historicalData.revenueSummary = revenueSummary;
      }

      // Get ad spend data
      if (['marketing_budget', 'roas_optimization', 'comprehensive'].includes(planType)) {
        const adMetrics = await MetaAdsData.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              dateStart: { $gte: startDate },
              dateStop: { $lte: endDate },
            },
          },
          {
            $group: {
              _id: null,
              totalSpend: { $sum: '$spend' },
              totalRevenue: { $sum: '$attribution.revenue' },
              totalImpressions: { $sum: '$impressions' },
              totalClicks: { $sum: '$clicks' },
              totalConversions: { $sum: '$conversions' },
              avgCPC: { $avg: '$cpc' },
              avgCPM: { $avg: '$cpm' },
              avgCTR: { $avg: '$ctr' },
            },
          },
        ]);

        historicalData.adMetrics = adMetrics[0] || {};
      }

      // Get customer data
      if (['customer_acquisition', 'comprehensive'].includes(planType)) {
        const customerMetrics = await TransactionData.aggregate([
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
              _id: null,
              totalCustomers: { $addToSet: '$customerEmail' },
              totalTransactions: { $sum: 1 },
              avgOrderValue: { $avg: '$amount' },
            },
          },
        ]);

        if (customerMetrics[0]) {
          historicalData.customerMetrics = {
            ...customerMetrics[0],
            totalCustomers: customerMetrics[0].totalCustomers.length,
          };
        }
      }

      return historicalData;
    } catch (error) {
      logger.error(`Error fetching historical data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate baseline metrics
   */
  async calculateBaseline(userId, historicalData) {
    const baseline = {};

    if (historicalData.revenueSummary) {
      baseline.revenue = historicalData.revenueSummary.total || 0;
      baseline.avgDailyRevenue = historicalData.revenueSummary.average || 0;
    }

    if (historicalData.adMetrics) {
      baseline.adSpend = historicalData.adMetrics.totalSpend || 0;
      baseline.roas = historicalData.adMetrics.totalSpend > 0
        ? (historicalData.adMetrics.totalRevenue || 0) / historicalData.adMetrics.totalSpend
        : 0;
    }

    if (historicalData.customerMetrics) {
      baseline.customers = historicalData.customerMetrics.totalCustomers || 0;
      baseline.avgOrderValue = historicalData.customerMetrics.avgOrderValue || 0;
    }

    return baseline;
  }

  /**
   * Calculate plan range
   */
  calculatePlanRange(planPeriod, customDays) {
    const startDate = new Date();
    let endDate = new Date();
    let days = 0;

    switch (planPeriod) {
      case 'next_month':
        days = 30;
        endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'next_quarter':
        days = 90;
        endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        break;
      case 'next_year':
        days = 365;
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        days = customDays || 90;
        endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        break;
      default:
        days = 90;
        endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate, days };
  }

  /**
   * Structure goals for the plan
   */
  structureGoals(goalsInput, planType, baseline) {
    const goals = {
      primary: null,
      secondary: [],
    };

    // Set primary goal based on plan type if not provided
    if (!goalsInput.primary) {
      switch (planType) {
        case 'revenue_growth':
          goals.primary = {
            metric: 'revenue',
            target: baseline.revenue * 1.2, // 20% growth default
            unit: 'USD',
            description: 'Increase revenue by 20%',
          };
          break;
        case 'customer_acquisition':
          goals.primary = {
            metric: 'customers',
            target: baseline.customers * 1.3, // 30% growth default
            unit: 'customers',
            description: 'Grow customer base by 30%',
          };
          break;
        case 'roas_optimization':
          goals.primary = {
            metric: 'roas',
            target: Math.max(3, baseline.roas * 1.2), // 20% improvement or minimum 3x
            unit: 'ratio',
            description: 'Improve ROAS to 3x or better',
          };
          break;
        default:
          goals.primary = goalsInput.primary;
      }
    } else {
      goals.primary = goalsInput.primary;
    }

    goals.secondary = goalsInput.secondary || [];

    return goals;
  }

  /**
   * Generate AI-powered plan
   */
  async generateAIPlan(
    historicalData,
    baseline,
    planType,
    planRange,
    goals,
    relatedForecast,
    language = 'es'
  ) {
    // Debug log to verify language is being passed
    logger.info(`${this.name}: Generating plan in language: ${language}`);

    const languageInstructions = {
      es: `!!!ESPAÑOL OBLIGATORIO - LEE ESTO PRIMERO!!!

INSTRUCCIÓN MÁS IMPORTANTE: Debes escribir TODO en español.

Reglas OBLIGATORIAS del idioma:
1. ESPAÑOL SOLAMENTE - ni una sola palabra en inglés (excepto valores enum técnicos)
2. strategy.summary → en español
3. strategy.analysis → en español
4. strategy.keyInsights → array de strings en español
5. strategy.risks → array de strings en español
6. strategy.opportunities → array de strings en español
7. actionItems[].title → en español
8. actionItems[].description → en español
9. actionItems[].estimatedImpact → en español
10. actionItems[].priority → SIEMPRE en inglés: "high", "medium", o "low" (valores técnicos)
11. actionItems[].category → en inglés: "marketing", "product", "sales", "operations"
12. milestones[].name → en español
13. kpis[].name → en español

IMPORTANTE - Valores enum técnicos:
- priority: SIEMPRE usa "high", "medium", "low" (NO "alta", "media", "baja")
- category: SIEMPRE usa "marketing", "product", "sales", "operations"

Si escribes UNA SOLA PALABRA en inglés en campos de texto, el análisis será rechazado.
Ejemplos PROHIBIDOS: "Increase revenue", "Optimize campaigns", "Target customers"
Ejemplos CORRECTOS: "Incrementar ingresos", "Optimizar campañas", "Dirigirse a clientes"`,
      en: `!!!ENGLISH REQUIRED - READ THIS FIRST!!!

MOST IMPORTANT INSTRUCTION: You must write EVERYTHING in English.

MANDATORY language rules:
1. ENGLISH ONLY - not a single word in Spanish (except technical enum values)
2. strategy.summary → in English
3. strategy.analysis → in English
4. strategy.keyInsights → array of strings in English
5. strategy.risks → array of strings in English
6. strategy.opportunities → array of strings in English
7. actionItems[].title → in English
8. actionItems[].description → in English
9. actionItems[].estimatedImpact → in English
10. actionItems[].priority → ALWAYS in English: "high", "medium", or "low" (technical values)
11. actionItems[].category → in English: "marketing", "product", "sales", "operations"
12. milestones[].name → in English
13. kpis[].name → in English

IMPORTANT - Technical enum values:
- priority: ALWAYS use "high", "medium", "low"
- category: ALWAYS use "marketing", "product", "sales", "operations"

If you write ONE SINGLE WORD in Spanish in text fields, the analysis will be rejected.
Examples PROHIBITED: "Incrementar ingresos", "Optimizar campañas", "Dirigirse a clientes"
Examples CORRECT: "Increase revenue", "Optimize campaigns", "Target customers"`,
    };

    const languageInstruction = languageInstructions[language] || languageInstructions.es;

    const systemPrompt = `${languageInstruction}

You are an expert business strategist and planner specializing in creating actionable, data-driven business plans.

Your task is to analyze business data and create comprehensive, executable plans to achieve specific business goals.

IMPORTANT INSTRUCTIONS:
1. Create SPECIFIC, ACTIONABLE plans with clear steps
2. Base recommendations on data trends and realistic projections
3. Provide detailed budget allocations with clear ROI expectations
4. Break down strategies into concrete action items with priorities
5. Set measurable milestones and KPIs
6. Identify risks and mitigation strategies
7. Be realistic but ambitious in goal-setting

You must provide your response in the following JSON structure:
{
  "strategy": {
    "summary": "Brief executive summary in your language",
    "analysis": "Detailed analysis in your language",
    "keyInsights": ["insight 1 in your language", "insight 2 in your language", ...],
    "risks": ["risk 1 in your language", "risk 2 in your language", ...],
    "opportunities": ["opportunity 1 in your language", "opportunity 2 in your language", ...]
  },
  "budget": {
    "total": number,
    "currency": "USD",
    "allocation": [
      {
        "channel": "channel name",
        "amount": number,
        "percentage": number,
        "expectedReturn": number,
        "rationale": "why this allocation"
      }
    ]
  },
  "actionItems": [
    {
      "title": "Action title in your language",
      "description": "Detailed description in your language",
      "category": "marketing|product|sales|operations",
      "priority": "high|medium|low",
      "deadline": "YYYY-MM-DD",
      "estimatedImpact": "description of expected impact in your language"
    }
  ],
  "milestones": [
    {
      "name": "Milestone name in your language",
      "targetDate": "YYYY-MM-DD",
      "metric": "metric name",
      "targetValue": number
    }
  ],
  "kpis": [
    {
      "name": "KPI name in your language",
      "metric": "metric identifier",
      "targetValue": number,
      "unit": "unit",
      "trackingFrequency": "daily|weekly|monthly"
    }
  ]
}

${language === 'es'
  ? 'RECORDATORIO FINAL: Escribe TODO en español (summary, analysis, keyInsights, risks, opportunities, actionItems.title/description/estimatedImpact, milestones.name, kpis.name) EXCEPTO los valores enum (priority: "high"/"medium"/"low", category: "marketing"/"product"/"sales"/"operations").'
  : 'FINAL REMINDER: Write EVERYTHING in English (summary, analysis, keyInsights, risks, opportunities, actionItems.title/description/estimatedImpact, milestones.name, kpis.name) using the technical enum values (priority: "high"/"medium"/"low", category: "marketing"/"product"/"sales"/"operations").'}`;

    const planPrompt = this.buildPlanPrompt(
      historicalData,
      baseline,
      planType,
      planRange,
      goals,
      relatedForecast,
      language
    );

    const response = await this.aiService.ask(planPrompt, systemPrompt, {
      max_tokens: 4096,
      temperature: 0.2,
    });

    // Parse the AI response
    const parsedPlan = this.parseAIResponse(response.content, planType, planRange);

    return {
      ...parsedPlan,
      usage: response.usage,
      model: response.model,
    };
  }

  /**
   * Build plan prompt
   */
  buildPlanPrompt(historicalData, baseline, planType, planRange, goals, relatedForecast, language = 'es') {
    let prompt = `Create a detailed ${planType.replace('_', ' ')} plan for the next ${planRange.days} days (from ${planRange.startDate.toISOString().split('T')[0]} to ${planRange.endDate.toISOString().split('T')[0]}).

CURRENT BASELINE METRICS:
${JSON.stringify(baseline, null, 2)}

HISTORICAL DATA (last 90 days):
${JSON.stringify({
  revenue: historicalData.revenueSummary,
  advertising: historicalData.adMetrics,
  customers: historicalData.customerMetrics,
}, null, 2)}

GOALS:
Primary Goal: ${JSON.stringify(goals.primary, null, 2)}
${goals.secondary?.length > 0 ? `Secondary Goals: ${JSON.stringify(goals.secondary, null, 2)}` : ''}
`;

    if (relatedForecast) {
      prompt += `\n\nRELATED FORECAST DATA:
This plan should align with the following forecast:
${JSON.stringify({
  type: relatedForecast.forecastType,
  period: relatedForecast.forecastPeriod,
  predictions: relatedForecast.forecast,
}, null, 2)}
`;
    }

    switch (planType) {
      case 'revenue_growth':
        prompt += `\n\nCreate a revenue growth plan that includes:
1. Revenue targets and timeline
2. Strategies to increase sales
3. Marketing initiatives
4. Pricing strategies
5. Customer retention tactics
6. New revenue streams to explore`;
        break;

      case 'marketing_budget':
        prompt += `\n\nCreate a marketing budget allocation plan that includes:
1. Total recommended budget based on goals
2. Channel-by-channel allocation (Meta Ads, Google Ads, etc.)
3. Expected ROI per channel
4. Testing budget for new channels
5. Performance tracking mechanisms`;
        break;

      case 'customer_acquisition':
        prompt += `\n\nCreate a customer acquisition plan that includes:
1. Acquisition targets and timeline
2. Customer acquisition channels and tactics
3. Cost per acquisition targets
4. Conversion funnel optimization
5. Retention strategies
6. Referral and viral growth tactics`;
        break;

      case 'roas_optimization':
        prompt += `\n\nCreate a ROAS optimization plan that includes:
1. Target ROAS for each channel
2. Budget reallocation recommendations
3. Campaign optimization tactics
4. A/B testing strategies
5. Audience refinement approaches
6. Creative optimization strategies`;
        break;

      case 'comprehensive':
        prompt += `\n\nCreate a comprehensive business plan that includes:
1. Revenue growth strategies
2. Marketing budget optimization
3. Customer acquisition and retention
4. Operational improvements
5. Risk mitigation
6. Competitive positioning`;
        break;
    }

    prompt += `\n\nProvide a complete, actionable plan in the JSON format specified.`;

    // Add final language reminder to user prompt
    if (language === 'es') {
      prompt += `\n\n⚠️ MUY IMPORTANTE:
- Escribe TODO el contenido en ESPAÑOL (títulos, descripciones, análisis, insights, riesgos, oportunidades)
- USA valores técnicos en inglés: priority debe ser "high", "medium" o "low" (NO "alta", "media", "baja")
- USA category en inglés: "marketing", "product", "sales", "operations"`;
    } else if (language === 'en') {
      prompt += `\n\n⚠️ VERY IMPORTANT:
- Write ALL content in ENGLISH (titles, descriptions, analysis, insights, risks, opportunities)
- USE technical values in English: priority must be "high", "medium", or "low"
- USE category in English: "marketing", "product", "sales", "operations"`;
    }

    return prompt;
  }

  /**
   * Parse AI response
   */
  parseAIResponse(aiResponse, planType, planRange) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Ensure deadlines are within plan range
        if (parsed.actionItems) {
          parsed.actionItems = parsed.actionItems.map(item => ({
            ...item,
            deadline: item.deadline ? new Date(item.deadline) : null,
          }));
        }

        if (parsed.milestones) {
          parsed.milestones = parsed.milestones.map(milestone => ({
            ...milestone,
            targetDate: milestone.targetDate ? new Date(milestone.targetDate) : null,
            status: 'pending',
          }));
        }

        return parsed;
      }
    } catch (error) {
      logger.warn(`Failed to parse AI response as JSON: ${error.message}`);
    }

    // Fallback: create basic structure from text response
    return {
      strategy: {
        summary: 'AI-generated strategy',
        analysis: aiResponse,
        keyInsights: [],
        risks: [],
        opportunities: [],
      },
      budget: {
        total: 0,
        currency: 'USD',
        allocation: [],
      },
      actionItems: [],
      milestones: [],
      kpis: [],
    };
  }

  /**
   * Generate plan from forecast
   * Takes an existing forecast and creates an actionable plan to achieve or exceed it
   */
  async generatePlanFromForecast(userId, forecastId, userInfo = null, language = 'es') {
    try {
      const forecast = await ForecastHistory.findById(forecastId);

      if (!forecast) {
        throw new Error('Forecast not found');
      }

      // Extract goals from forecast
      const goals = this.extractGoalsFromForecast(forecast);

      // Generate plan based on forecast
      return this.generatePlan(userId, {
        planType: this.mapForecastTypeToPlanType(forecast.forecastType),
        planName: `Plan based on ${forecast.forecastType} forecast`,
        planPeriod: forecast.forecastPeriod,
        goals,
        language,
        userInfo,
        relatedForecastId: forecastId,
      });
    } catch (error) {
      logger.error(`Error generating plan from forecast: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract goals from forecast
   */
  extractGoalsFromForecast(forecast) {
    // This is a simplified extraction - you'd customize based on forecast structure
    const goals = {};

    switch (forecast.forecastType) {
      case 'revenue':
        goals.primary = {
          metric: 'revenue',
          target: forecast.forecast?.predictedRevenue || 0,
          unit: 'USD',
          description: 'Achieve forecasted revenue',
        };
        break;
      case 'customer_growth':
        goals.primary = {
          metric: 'customers',
          target: forecast.forecast?.predictedCustomers || 0,
          unit: 'customers',
          description: 'Achieve forecasted customer growth',
        };
        break;
      // Add more mappings as needed
    }

    return goals;
  }

  /**
   * Map forecast type to plan type
   */
  mapForecastTypeToPlanType(forecastType) {
    const mapping = {
      revenue: 'revenue_growth',
      ad_spend: 'marketing_budget',
      customer_growth: 'customer_acquisition',
      roas: 'roas_optimization',
      comprehensive: 'comprehensive',
    };

    return mapping[forecastType] || 'comprehensive';
  }
}

module.exports = PlanningAgent;
