const ForecastHistory = require('../models/ForecastHistory');
const logger = require('../utils/logger');

/**
 * Forecast Reporting Controller
 * Admin endpoints for viewing and analyzing forecast history
 */

/**
 * Get all forecasts with filters and pagination
 * @route GET /api/admin/forecasts
 */
exports.getAllForecasts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      forecastType,
      userId,
      startDate,
      endDate,
      isScenario,
      archived = false,
    } = req.query;

    const query = { archived: archived === 'true' };

    // Apply filters
    if (forecastType) query.forecastType = forecastType;
    if (userId) query.userId = userId;
    if (isScenario !== undefined) query.isScenario = isScenario === 'true';

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [forecasts, total] = await Promise.all([
      ForecastHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name email company')
        .lean(),
      ForecastHistory.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        forecasts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error(`Get all forecasts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching forecasts',
      error: error.message,
    });
  }
};

/**
 * Get specific forecast by ID
 * @route GET /api/admin/forecasts/:id
 */
exports.getForecastById = async (req, res) => {
  try {
    const { id } = req.params;

    const forecast = await ForecastHistory.findById(id)
      .populate('userId', 'name email company role')
      .populate('actualOutcome.recordedBy', 'name email')
      .lean();

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: 'Forecast not found',
      });
    }

    res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    logger.error(`Get forecast by ID error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching forecast',
      error: error.message,
    });
  }
};

/**
 * Get admin dashboard statistics
 * @route GET /api/admin/forecasts/stats/dashboard
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const [
      stats,
      forecastsByType,
      userActivity,
      accuracyMetrics,
    ] = await Promise.all([
      ForecastHistory.getAdminStats(start, end),
      ForecastHistory.getForecastsByType(start, end),
      ForecastHistory.getUserActivity(start, end, 10),
      ForecastHistory.getAccuracyMetrics(),
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        overview: stats,
        forecastsByType,
        topUsers: userActivity,
        accuracyMetrics,
      },
    });
  } catch (error) {
    logger.error(`Get dashboard stats error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message,
    });
  }
};

/**
 * Get forecasts for a specific user
 * @route GET /api/admin/forecasts/user/:userId
 */
exports.getUserForecasts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const forecasts = await ForecastHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('-analysis -forecast.summary') // Exclude large text fields for list view
      .lean();

    const stats = await ForecastHistory.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: null,
          totalForecasts: { $sum: 1 },
          byType: {
            $push: '$forecastType',
          },
          avgConfidence: { $avg: '$confidenceLevel' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        forecasts,
        stats: stats[0] || {
          totalForecasts: 0,
          byType: [],
          avgConfidence: 0,
        },
      },
    });
  } catch (error) {
    logger.error(`Get user forecasts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching user forecasts',
      error: error.message,
    });
  }
};

/**
 * Get scenario analysis groups
 * @route GET /api/admin/forecasts/scenarios
 */
exports.getScenarios = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get unique scenario groups
    const scenarios = await ForecastHistory.aggregate([
      {
        $match: {
          isScenario: true,
          scenarioGroupId: { $ne: null },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: '$scenarioGroupId',
          userId: { $first: '$userId' },
          userName: { $first: '$userName' },
          userEmail: { $first: '$userEmail' },
          forecastType: { $first: '$forecastType' },
          forecastPeriod: { $first: '$forecastPeriod' },
          createdAt: { $first: '$createdAt' },
          scenarios: {
            $push: {
              id: '$_id',
              scenarioType: '$scenarioType',
              confidenceLevel: '$confidenceLevel',
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const total = await ForecastHistory.distinct('scenarioGroupId', {
      isScenario: true,
      scenarioGroupId: { $ne: null },
    });

    res.json({
      success: true,
      data: {
        scenarios,
        pagination: {
          total: total.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total.length / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error(`Get scenarios error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching scenarios',
      error: error.message,
    });
  }
};

/**
 * Record actual outcome for a forecast
 * @route POST /api/admin/forecasts/:id/actual
 */
exports.recordActualOutcome = async (req, res) => {
  try {
    const { id } = req.params;
    const { values, notes } = req.body;

    if (!values) {
      return res.status(400).json({
        success: false,
        message: 'Actual outcome values are required',
      });
    }

    const forecast = await ForecastHistory.findById(id);

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: 'Forecast not found',
      });
    }

    await forecast.recordActualOutcome(values, req.user._id, notes);

    logger.info(`Actual outcome recorded for forecast ${id} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Actual outcome recorded successfully',
      data: {
        actualOutcome: forecast.actualOutcome,
        accuracy: forecast.accuracy,
      },
    });
  } catch (error) {
    logger.error(`Record actual outcome error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error recording actual outcome',
      error: error.message,
    });
  }
};

/**
 * Update forecast metadata (archive, tags, notes)
 * @route PATCH /api/admin/forecasts/:id
 */
exports.updateForecast = async (req, res) => {
  try {
    const { id } = req.params;
    const { archived, tags, notes } = req.body;

    const updateFields = {};
    if (archived !== undefined) updateFields.archived = archived;
    if (tags !== undefined) updateFields.tags = tags;
    if (notes !== undefined) updateFields.notes = notes;

    const forecast = await ForecastHistory.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: 'Forecast not found',
      });
    }

    logger.info(`Forecast ${id} updated by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Forecast updated successfully',
      data: forecast,
    });
  } catch (error) {
    logger.error(`Update forecast error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating forecast',
      error: error.message,
    });
  }
};

/**
 * Delete a forecast
 * @route DELETE /api/admin/forecasts/:id
 */
exports.deleteForecast = async (req, res) => {
  try {
    const { id } = req.params;

    const forecast = await ForecastHistory.findByIdAndDelete(id);

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: 'Forecast not found',
      });
    }

    logger.info(`Forecast ${id} deleted by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Forecast deleted successfully',
    });
  } catch (error) {
    logger.error(`Delete forecast error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting forecast',
      error: error.message,
    });
  }
};

/**
 * Export forecasts to JSON
 * @route GET /api/admin/forecasts/export
 */
exports.exportForecasts = async (req, res) => {
  try {
    const { forecastType, userId, startDate, endDate } = req.query;

    const query = {};

    if (forecastType) query.forecastType = forecastType;
    if (userId) query.userId = userId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const forecasts = await ForecastHistory.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email company')
      .lean();

    res.json({
      success: true,
      data: {
        exportDate: new Date(),
        totalForecasts: forecasts.length,
        filters: { forecastType, userId, startDate, endDate },
        forecasts,
      },
    });
  } catch (error) {
    logger.error(`Export forecasts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error exporting forecasts',
      error: error.message,
    });
  }
};
