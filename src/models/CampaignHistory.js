const mongoose = require('mongoose');

/**
 * Campaign History Schema
 * Tracks all campaign state changes for rollback and audit trail
 */
const campaignHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  campaignId: {
    type: String,
    required: true,
    index: true,
  },
  campaignName: {
    type: String,
    required: true,
  },
  accountId: {
    type: String,
    required: true,
  },
  // Action type
  action: {
    type: String,
    enum: ['pause', 'activate', 'update', 'create', 'delete', 'budget_change', 'rollback'],
    required: true,
  },
  // Who/what triggered this change
  triggeredBy: {
    type: {
      type: String,
      enum: ['user', 'guardrail', 'system', 'api'],
      default: 'user',
    },
    source: {
      type: String, // user email, guardrail ID, system process name
    },
  },
  // Previous state before change
  previousState: {
    status: String, // 'ACTIVE', 'PAUSED', etc.
    dailyBudget: Number,
    lifetimeBudget: Number,
    bidStrategy: String,
    objective: String,
    // Store any other relevant fields
    customFields: mongoose.Schema.Types.Mixed,
  },
  // New state after change
  newState: {
    status: String,
    dailyBudget: Number,
    lifetimeBudget: Number,
    bidStrategy: String,
    objective: String,
    customFields: mongoose.Schema.Types.Mixed,
  },
  // Change details
  changes: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  }],
  // Reason for change
  reason: {
    type: String,
    default: null,
  },
  // If triggered by guardrail violation
  guardrailViolation: {
    guardrailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampaignGuardrail',
      default: null,
    },
    violations: [{
      rule: String,
      threshold: Number,
      actual: Number,
      message: String,
    }],
  },
  // Rollback information
  canRollback: {
    type: Boolean,
    default: true,
  },
  rolledBackAt: {
    type: Date,
    default: null,
  },
  rolledBackBy: {
    type: String,
    default: null,
  },
  rollbackOfHistoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CampaignHistory',
    default: null, // If this entry is a rollback, reference the original entry
  },
  // Metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    apiVersion: String,
    notes: String,
  },
  // Timestamp (already handled by timestamps: true, but explicit for clarity)
  executedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
campaignHistorySchema.index({ userId: 1, campaignId: 1, executedAt: -1 });
campaignHistorySchema.index({ userId: 1, executedAt: -1 });
campaignHistorySchema.index({ campaignId: 1, canRollback: 1 });

/**
 * Get latest state change for a campaign
 */
campaignHistorySchema.statics.getLatestState = async function(userId, campaignId) {
  return this.findOne({
    userId,
    campaignId,
  }).sort({ executedAt: -1 });
};

/**
 * Get rollback-able entries for a campaign
 */
campaignHistorySchema.statics.getRollbackableEntries = async function(userId, campaignId, limit = 10) {
  return this.find({
    userId,
    campaignId,
    canRollback: true,
    rolledBackAt: null,
  })
    .sort({ executedAt: -1 })
    .limit(limit);
};

/**
 * Get history timeline for a campaign
 */
campaignHistorySchema.statics.getCampaignTimeline = async function(userId, campaignId, startDate = null, endDate = null) {
  const query = {
    userId,
    campaignId,
  };

  if (startDate || endDate) {
    query.executedAt = {};
    if (startDate) query.executedAt.$gte = new Date(startDate);
    if (endDate) query.executedAt.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ executedAt: -1 })
    .populate('guardrailViolation.guardrailId', 'rules campaignName');
};

/**
 * Get changes grouped by action type
 */
campaignHistorySchema.statics.getActionSummary = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        executedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        campaigns: { $addToSet: '$campaignId' },
      },
    },
    {
      $project: {
        action: '$_id',
        count: 1,
        uniqueCampaigns: { $size: '$campaigns' },
      },
    },
  ]);
};

/**
 * Mark this entry as rolled back
 */
campaignHistorySchema.methods.markAsRolledBack = async function(rolledBackBy) {
  this.rolledBackAt = new Date();
  this.rolledBackBy = rolledBackBy;
  this.canRollback = false;
  return this.save();
};

/**
 * Create a snapshot of current state
 */
campaignHistorySchema.statics.createSnapshot = async function(data) {
  const {
    userId,
    campaignId,
    campaignName,
    accountId,
    action,
    triggeredBy,
    previousState,
    newState,
    reason,
    guardrailViolation,
    metadata,
  } = data;

  // Calculate changes
  const changes = [];
  if (previousState && newState) {
    const allFields = new Set([
      ...Object.keys(previousState),
      ...Object.keys(newState),
    ]);

    allFields.forEach(field => {
      if (field !== 'customFields' && previousState[field] !== newState[field]) {
        changes.push({
          field,
          oldValue: previousState[field],
          newValue: newState[field],
        });
      }
    });
  }

  const historyEntry = new this({
    userId,
    campaignId,
    campaignName,
    accountId,
    action,
    triggeredBy,
    previousState,
    newState,
    changes,
    reason,
    guardrailViolation,
    metadata,
    executedAt: new Date(),
  });

  return historyEntry.save();
};

module.exports = mongoose.model('CampaignHistory', campaignHistorySchema);
