const ForecastingAgent = require('../agents/ForecastingAgent');
const logger = require('../utils/logger');

/**
 * Forecasting Controller
 * Handles forecasting API requests
 */

/**
 * Generate forecast
 * @route POST /api/forecasting/generate
 */
exports.generateForecast = async (req, res) => {
  try {
    const userId = req.user._id;
    const userLanguage = req.user.language || 'es'; // Get user's language preference, default to Spanish
    const {
      forecastType = 'revenue',
      forecastPeriod = 'next_month',
      customDays = null,
      includeSeasonality = true,
      confidenceLevel = 0.8,
    } = req.body;

    // Validate forecast type
    const validForecastTypes = ['revenue', 'ad_spend', 'customer_growth', 'roas', 'comprehensive'];
    if (!validForecastTypes.includes(forecastType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid forecast type. Must be one of: ${validForecastTypes.join(', ')}`,
      });
    }

    // Validate forecast period
    const validForecastPeriods = ['next_week', 'next_month', 'next_quarter', 'custom'];
    if (!validForecastPeriods.includes(forecastPeriod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid forecast period. Must be one of: ${validForecastPeriods.join(', ')}`,
      });
    }

    // Validate custom days if period is custom
    if (forecastPeriod === 'custom' && (!customDays || customDays < 1 || customDays > 365)) {
      return res.status(400).json({
        success: false,
        message: 'For custom period, customDays must be between 1 and 365',
      });
    }

    const forecastingAgent = new ForecastingAgent();

    const forecast = await forecastingAgent.generateForecast(userId, {
      forecastType,
      forecastPeriod,
      customDays,
      includeSeasonality,
      confidenceLevel,
      language: userLanguage, // Pass user's language preference
      userInfo: { // Pass user info for history tracking
        name: req.user.name,
        email: req.user.email,
      },
    });

    logger.info(`Forecast generated for user ${userId}: ${forecastType}`);

    res.json({
      success: true,
      message: 'Forecast generated successfully',
      data: forecast,
    });
  } catch (error) {
    logger.error(`Generate forecast error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating forecast',
      error: error.message,
    });
  }
};

/**
 * Generate scenario analysis
 * @route POST /api/forecasting/scenarios
 */
exports.generateScenarios = async (req, res) => {
  try {
    const userId = req.user._id;
    const userLanguage = req.user.language || 'es'; // Get user's language preference, default to Spanish
    const {
      forecastType = 'revenue',
      forecastPeriod = 'next_month',
    } = req.body;

    // Validate forecast type
    const validForecastTypes = ['revenue', 'ad_spend', 'customer_growth', 'roas', 'comprehensive'];
    if (!validForecastTypes.includes(forecastType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid forecast type. Must be one of: ${validForecastTypes.join(', ')}`,
      });
    }

    // Validate forecast period
    const validForecastPeriods = ['next_week', 'next_month', 'next_quarter'];
    if (!validForecastPeriods.includes(forecastPeriod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid forecast period. Must be one of: ${validForecastPeriods.join(', ')}`,
      });
    }

    const forecastingAgent = new ForecastingAgent();

    const scenarios = await forecastingAgent.generateScenarioAnalysis(
      userId,
      forecastType,
      forecastPeriod,
      userLanguage, // Pass user's language preference
      { // Pass user info for history tracking
        name: req.user.name,
        email: req.user.email,
      }
    );

    logger.info(`Scenario analysis generated for user ${userId}: ${forecastType}`);

    res.json({
      success: true,
      message: 'Scenario analysis generated successfully',
      data: scenarios,
    });
  } catch (error) {
    logger.error(`Generate scenarios error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating scenario analysis',
      error: error.message,
    });
  }
};

/**
 * Get available forecast types and periods
 * @route GET /api/forecasting/options
 */
exports.getForecastOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        forecastTypes: [
          {
            value: 'revenue',
            label: 'Revenue Forecast',
            description: 'Predict future revenue based on historical transaction data',
          },
          {
            value: 'ad_spend',
            label: 'Ad Spend Forecast',
            description: 'Recommend optimal advertising budget and predict campaign performance',
          },
          {
            value: 'customer_growth',
            label: 'Customer Growth Forecast',
            description: 'Predict customer acquisition and growth trends',
          },
          {
            value: 'roas',
            label: 'ROAS Forecast',
            description: 'Predict Return on Ad Spend and campaign efficiency',
          },
          {
            value: 'comprehensive',
            label: 'Comprehensive Business Forecast',
            description: 'Complete business forecast including revenue, customers, and marketing ROI',
          },
        ],
        forecastPeriods: [
          {
            value: 'next_week',
            label: 'Next Week',
            days: 7,
          },
          {
            value: 'next_month',
            label: 'Next Month',
            days: 30,
          },
          {
            value: 'next_quarter',
            label: 'Next Quarter',
            days: 90,
          },
          {
            value: 'custom',
            label: 'Custom Period',
            description: 'Specify custom number of days (1-365)',
          },
        ],
        confidenceLevels: [
          {
            value: 0.95,
            label: 'High Confidence (95%)',
            description: 'Best case scenario',
          },
          {
            value: 0.8,
            label: 'Standard Confidence (80%)',
            description: 'Balanced prediction',
          },
          {
            value: 0.5,
            label: 'Medium Confidence (50%)',
            description: 'Most likely scenario',
          },
          {
            value: 0.2,
            label: 'Conservative (20%)',
            description: 'Worst case scenario',
          },
        ],
      },
    });
  } catch (error) {
    logger.error(`Get forecast options error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching forecast options',
      error: error.message,
    });
  }
};

/**
 * Quick forecast - generates a simple revenue forecast for next month
 * @route GET /api/forecasting/quick
 */
exports.quickForecast = async (req, res) => {
  try {
    const userId = req.user._id;
    const userLanguage = req.user.language || 'es'; // Get user's language preference, default to Spanish

    const forecastingAgent = new ForecastingAgent();

    const forecast = await forecastingAgent.generateForecast(userId, {
      forecastType: 'revenue',
      forecastPeriod: 'next_month',
      includeSeasonality: true,
      confidenceLevel: 0.8,
      language: userLanguage, // Pass user's language preference
      userInfo: { // Pass user info for history tracking
        name: req.user.name,
        email: req.user.email,
      },
    });

    logger.info(`Quick forecast generated for user ${userId}`);

    res.json({
      success: true,
      message: 'Quick forecast generated successfully',
      data: forecast,
    });
  } catch (error) {
    logger.error(`Quick forecast error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating quick forecast',
      error: error.message,
    });
  }
};
