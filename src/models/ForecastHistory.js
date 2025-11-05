const mongoose = require('mongoose');

/**
 * Forecast History Schema
 * Stores all forecasts generated for reporting and analysis
 */
const forecastHistorySchema = new mongoose.Schema({
  // User who requested the forecast
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
  },

  // Forecast details
  forecastType: {
    type: String,
    enum: ['revenue', 'ad_spend', 'customer_growth', 'roas', 'comprehensive'],
    required: true,
    index: true,
  },
  forecastPeriod: {
    type: String,
    enum: ['next_week', 'next_month', 'next_quarter', 'custom'],
    required: true,
  },

  // Forecast range
  forecastStartDate: {
    type: Date,
    required: true,
    index: true,
  },
  forecastEndDate: {
    type: Date,
    required: true,
    index: true,
  },
  forecastDays: {
    type: Number,
    required: true,
  },

  // AI-generated analysis and predictions
  analysis: {
    type: String,
    required: true,
  },
  forecast: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  // Forecast parameters
  confidenceLevel: {
    type: Number,
    default: 0.8,
  },
  includeSeasonality: {
    type: Boolean,
    default: true,
  },
  language: {
    type: String,
    enum: ['es', 'en'],
    default: 'es',
  },

  // AI usage metrics
  aiModel: {
    type: String,
  },
  tokensUsed: {
    type: Number,
  },
  responseTime: {
    type: Number, // in milliseconds
  },

  // For scenario analysis
  isScenario: {
    type: Boolean,
    default: false,
  },
  scenarioType: {
    type: String,
    enum: ['best_case', 'most_likely', 'worst_case', null],
    default: null,
  },
  scenarioGroupId: {
    type: String, // Link related scenarios together
    index: true,
  },

  // Actual outcomes (to be filled later for accuracy tracking)
  actualOutcome: {
    recorded: { type: Boolean, default: false },
    recordedAt: Date,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    values: mongoose.Schema.Types.Mixed,
    notes: String,
  },

  // Accuracy metrics (calculated when actuals are recorded)
  accuracy: {
    calculated: { type: Boolean, default: false },
    percentage: Number, // Percentage accuracy
    variance: Number, // Difference between forecast and actual
    variancePercentage: Number,
    notes: String,
  },

  // Metadata
  archived: {
    type: Boolean,
    default: false,
  },
  tags: [String],
  notes: String,

}, {
  timestamps: true,
});

// Compound indexes for efficient queries
forecastHistorySchema.index({ userId: 1, createdAt: -1 });
forecastHistorySchema.index({ userId: 1, forecastType: 1, createdAt: -1 });
forecastHistorySchema.index({ forecastStartDate: 1, forecastEndDate: 1 });
forecastHistorySchema.index({ 'accuracy.calculated': 1, forecastType: 1 });

/**
 * Get forecast statistics for admin dashboard
 */
forecastHistorySchema.statics.getAdminStats = async function(startDate, endDate) {
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalForecasts: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        averageConfidence: { $avg: '$confidenceLevel' },
        averageResponseTime: { $avg: '$responseTime' },
        totalTokensUsed: { $sum: '$tokensUsed' },
        forecastsByType: {
          $push: {
            type: '$forecastType',
            confidence: '$confidenceLevel',
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalForecasts: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        averageConfidence: { $round: ['$averageConfidence', 2] },
        averageResponseTime: { $round: ['$averageResponseTime', 0] },
        totalTokensUsed: 1,
        forecastsByType: 1,
      },
    },
  ]);

  return stats[0] || {
    totalForecasts: 0,
    uniqueUsers: 0,
    averageConfidence: 0,
    averageResponseTime: 0,
    totalTokensUsed: 0,
    forecastsByType: [],
  };
};

/**
 * Get forecasts by type breakdown
 */
forecastHistorySchema.statics.getForecastsByType = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: '$forecastType',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidenceLevel' },
        avgResponseTime: { $avg: '$responseTime' },
      },
    },
    {
      $project: {
        _id: 0,
        forecastType: '$_id',
        count: 1,
        avgConfidence: { $round: ['$avgConfidence', 2] },
        avgResponseTime: { $round: ['$avgResponseTime', 0] },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

/**
 * Get user forecast activity
 */
forecastHistorySchema.statics.getUserActivity = async function(startDate, endDate, limit = 10) {
  return this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: '$userId',
        userName: { $first: '$userName' },
        userEmail: { $first: '$userEmail' },
        totalForecasts: { $sum: 1 },
        lastForecast: { $max: '$createdAt' },
        forecastTypes: { $addToSet: '$forecastType' },
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        userName: 1,
        userEmail: 1,
        totalForecasts: 1,
        lastForecast: 1,
        forecastTypes: 1,
      },
    },
    { $sort: { totalForecasts: -1 } },
    { $limit: limit },
  ]);
};

/**
 * Get accuracy metrics for forecasts that have actuals recorded
 */
forecastHistorySchema.statics.getAccuracyMetrics = async function() {
  return this.aggregate([
    {
      $match: {
        'accuracy.calculated': true,
      },
    },
    {
      $group: {
        _id: '$forecastType',
        avgAccuracy: { $avg: '$accuracy.percentage' },
        avgVariance: { $avg: '$accuracy.variancePercentage' },
        totalForecasts: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        forecastType: '$_id',
        avgAccuracy: { $round: ['$avgAccuracy', 2] },
        avgVariance: { $round: ['$avgVariance', 2] },
        totalForecasts: 1,
      },
    },
    { $sort: { avgAccuracy: -1 } },
  ]);
};

/**
 * Record actual outcome for a forecast
 */
forecastHistorySchema.methods.recordActualOutcome = async function(values, recordedBy, notes = '') {
  this.actualOutcome = {
    recorded: true,
    recordedAt: new Date(),
    recordedBy,
    values,
    notes,
  };

  // Calculate accuracy if possible
  // This is a simplified example - you'd customize based on forecast type
  if (this.forecast?.summary && values?.actual) {
    const predicted = parseFloat(this.forecast.summary) || 0;
    const actual = parseFloat(values.actual) || 0;

    if (predicted > 0 && actual > 0) {
      const variance = actual - predicted;
      const variancePercentage = ((variance / predicted) * 100);
      const accuracy = 100 - Math.abs(variancePercentage);

      this.accuracy = {
        calculated: true,
        percentage: Math.max(0, accuracy),
        variance,
        variancePercentage,
        notes: `Predicted: ${predicted}, Actual: ${actual}`,
      };
    }
  }

  return this.save();
};

const ForecastHistory = mongoose.model('ForecastHistory', forecastHistorySchema);

module.exports = ForecastHistory;
