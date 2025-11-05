const mongoose = require('mongoose');

/**
 * Plan Schema
 * Stores business plans with goals, strategies, and action items
 */
const planSchema = new mongoose.Schema({
  // User who created the plan
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

  // Plan details
  planType: {
    type: String,
    enum: ['revenue_growth', 'marketing_budget', 'customer_acquisition', 'roas_optimization', 'comprehensive'],
    required: true,
    index: true,
  },
  planName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },

  // Plan period
  planStartDate: {
    type: Date,
    required: true,
    index: true,
  },
  planEndDate: {
    type: Date,
    required: true,
    index: true,
  },
  planDuration: {
    type: Number, // in days
    required: true,
  },

  // Goals and targets
  goals: {
    primary: {
      metric: String, // e.g., 'revenue', 'customers', 'roas'
      target: Number,
      unit: String, // e.g., 'USD', 'customers', 'percentage'
      description: String,
    },
    secondary: [{
      metric: String,
      target: Number,
      unit: String,
      description: String,
    }],
  },

  // Current baseline (from historical data)
  baseline: {
    revenue: Number,
    customers: Number,
    adSpend: Number,
    roas: Number,
    customMetrics: mongoose.Schema.Types.Mixed,
  },

  // AI-generated strategy
  strategy: {
    summary: String, // Executive summary of the strategy
    analysis: String, // Full AI analysis
    keyInsights: [String],
    risks: [String],
    opportunities: [String],
  },

  // Budget allocation
  budget: {
    total: Number,
    currency: { type: String, default: 'USD' },
    allocation: [{
      channel: String, // e.g., 'meta_ads', 'google_ads', 'email_marketing'
      amount: Number,
      percentage: Number,
      expectedReturn: Number,
      rationale: String,
    }],
  },

  // Action items / tactics
  actionItems: [{
    title: String,
    description: String,
    category: String, // e.g., 'marketing', 'product', 'sales'
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    deadline: Date,
    estimatedImpact: String,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    assignedTo: String,
    completedAt: Date,
    notes: String,
  }],

  // Milestones
  milestones: [{
    name: String,
    targetDate: Date,
    metric: String,
    targetValue: Number,
    actualValue: Number,
    status: {
      type: String,
      enum: ['pending', 'on_track', 'at_risk', 'achieved', 'missed'],
      default: 'pending',
    },
    notes: String,
  }],

  // KPIs to track
  kpis: [{
    name: String,
    metric: String,
    targetValue: Number,
    currentValue: Number,
    unit: String,
    trackingFrequency: String, // 'daily', 'weekly', 'monthly'
  }],

  // Link to related forecast
  relatedForecastId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForecastHistory',
  },

  // AI usage metrics
  aiModel: String,
  tokensUsed: Number,
  responseTime: Number,
  language: {
    type: String,
    enum: ['es', 'en'],
    default: 'es',
  },

  // Plan status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled', 'archived'],
    default: 'active',
    index: true,
  },

  // Progress tracking
  progress: {
    overall: { type: Number, default: 0 }, // 0-100
    lastUpdated: Date,
    notes: String,
  },

  // Actual results (to compare with goals)
  actualResults: {
    recorded: { type: Boolean, default: false },
    recordedAt: Date,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metrics: mongoose.Schema.Types.Mixed,
    notes: String,
  },

  // Performance vs plan
  performance: {
    calculated: { type: Boolean, default: false },
    goalAchievement: Number, // Percentage of goal achieved
    variance: Number,
    variancePercentage: Number,
    notes: String,
  },

  // Metadata
  tags: [String],
  notes: String,
  archived: {
    type: Boolean,
    default: false,
  },

}, {
  timestamps: true,
});

// Compound indexes
planSchema.index({ userId: 1, createdAt: -1 });
planSchema.index({ userId: 1, planType: 1, status: 1 });
planSchema.index({ planStartDate: 1, planEndDate: 1 });
planSchema.index({ status: 1, planEndDate: 1 });

/**
 * Get active plans for a user
 */
planSchema.statics.getActivePlans = async function(userId) {
  return this.find({
    userId,
    status: 'active',
    planEndDate: { $gte: new Date() },
  }).sort({ planStartDate: 1 });
};

/**
 * Get plan statistics
 */
planSchema.statics.getPlanStats = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = startDate;
    if (endDate) matchStage.createdAt.$lte = endDate;
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPlans: { $sum: 1 },
        activePlans: {
          $sum: {
            $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
          },
        },
        completedPlans: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
        avgProgress: { $avg: '$progress.overall' },
        totalBudget: { $sum: '$budget.total' },
      },
    },
  ]);

  return stats[0] || {
    totalPlans: 0,
    activePlans: 0,
    completedPlans: 0,
    avgProgress: 0,
    totalBudget: 0,
  };
};

/**
 * Update action item status
 */
planSchema.methods.updateActionItem = function(actionItemId, updates) {
  const actionItem = this.actionItems.id(actionItemId);
  if (!actionItem) {
    throw new Error('Action item not found');
  }

  Object.assign(actionItem, updates);

  if (updates.status === 'completed' && !actionItem.completedAt) {
    actionItem.completedAt = new Date();
  }

  // Recalculate overall progress
  this.calculateProgress();

  return this.save();
};

/**
 * Calculate overall progress based on action items
 */
planSchema.methods.calculateProgress = function() {
  if (this.actionItems.length === 0) {
    this.progress.overall = 0;
    this.progress.lastUpdated = new Date();
    return;
  }

  const weights = { high: 3, medium: 2, low: 1 };
  let totalWeight = 0;
  let completedWeight = 0;

  this.actionItems.forEach(item => {
    const weight = weights[item.priority] || 1;
    totalWeight += weight;
    if (item.status === 'completed') {
      completedWeight += weight;
    } else if (item.status === 'in_progress') {
      completedWeight += weight * 0.5; // 50% credit for in-progress
    }
  });

  this.progress.overall = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  this.progress.lastUpdated = new Date();
};

/**
 * Record actual results
 */
planSchema.methods.recordActualResults = async function(metrics, recordedBy, notes = '') {
  this.actualResults = {
    recorded: true,
    recordedAt: new Date(),
    recordedBy,
    metrics,
    notes,
  };

  // Calculate performance vs goals
  if (this.goals.primary && metrics[this.goals.primary.metric]) {
    const target = this.goals.primary.target;
    const actual = metrics[this.goals.primary.metric];
    const variance = actual - target;
    const variancePercentage = (variance / target) * 100;
    const goalAchievement = (actual / target) * 100;

    this.performance = {
      calculated: true,
      goalAchievement: Math.round(goalAchievement * 100) / 100,
      variance,
      variancePercentage: Math.round(variancePercentage * 100) / 100,
      notes: `Target: ${target}, Actual: ${actual}`,
    };
  }

  return this.save();
};

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
