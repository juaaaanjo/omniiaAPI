const mongoose = require('mongoose');

/**
 * Campaign Guardrail Schema
 * Stores monitoring rules and thresholds for Meta Ads campaigns
 */
const campaignGuardrailSchema = new mongoose.Schema({
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
  // Guardrail Rules
  rules: {
    // ROAS (Return on Ad Spend) thresholds
    minROAS: {
      type: Number,
      default: null, // null = not monitoring
    },
    maxROAS: {
      type: Number,
      default: null,
    },
    // CPA (Cost Per Acquisition) thresholds
    minCPA: {
      type: Number,
      default: null,
    },
    maxCPA: {
      type: Number,
      default: null,
    },
    // Daily spend limit
    maxDailySpend: {
      type: Number,
      default: null,
    },
    // CTR (Click-Through Rate) thresholds
    minCTR: {
      type: Number,
      default: null, // percentage (e.g., 1.5 = 1.5%)
    },
    // CPC (Cost Per Click) thresholds
    maxCPC: {
      type: Number,
      default: null,
    },
    // Conversion thresholds
    minConversions: {
      type: Number,
      default: null,
    },
  },
  // Auto-action settings
  autoActions: {
    autoPause: {
      type: Boolean,
      default: false, // If true, automatically pause when thresholds violated
    },
    alertOnly: {
      type: Boolean,
      default: true, // If true, only send alerts (don't auto-pause)
    },
    requireConfirmation: {
      type: Boolean,
      default: false, // If true, require manual confirmation before auto-pause
    },
  },
  // Monitoring settings
  monitoring: {
    enabled: {
      type: Boolean,
      default: true,
    },
    checkInterval: {
      type: Number,
      default: 15, // Check every 15 minutes
    },
    evaluationWindow: {
      type: Number,
      default: 24, // Evaluate metrics over last 24 hours
      enum: [1, 3, 6, 12, 24, 48, 72], // Available windows in hours
    },
    minDataPoints: {
      type: Number,
      default: 10, // Minimum conversions/clicks before evaluating
    },
  },
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'paused', 'disabled'],
    default: 'active',
  },
  lastChecked: {
    type: Date,
    default: null,
  },
  lastViolation: {
    type: Date,
    default: null,
  },
  violationCount: {
    type: Number,
    default: 0,
  },
  // Notification preferences
  notifications: {
    email: {
      type: Boolean,
      default: true,
    },
    webhook: {
      type: String,
      default: null, // Webhook URL for alerts
    },
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
campaignGuardrailSchema.index({ userId: 1, campaignId: 1 }, { unique: true });
campaignGuardrailSchema.index({ userId: 1, status: 1 });
campaignGuardrailSchema.index({ 'monitoring.enabled': 1, status: 1 });

/**
 * Check if any rules are violated based on metrics
 */
campaignGuardrailSchema.methods.checkViolations = function(metrics) {
  const violations = [];
  const { rules } = this;

  // Check ROAS
  if (rules.minROAS !== null && metrics.roas < rules.minROAS) {
    violations.push({
      rule: 'minROAS',
      threshold: rules.minROAS,
      actual: metrics.roas,
      message: `ROAS (${metrics.roas.toFixed(2)}) is below minimum threshold (${rules.minROAS})`,
    });
  }
  if (rules.maxROAS !== null && metrics.roas > rules.maxROAS) {
    violations.push({
      rule: 'maxROAS',
      threshold: rules.maxROAS,
      actual: metrics.roas,
      message: `ROAS (${metrics.roas.toFixed(2)}) exceeds maximum threshold (${rules.maxROAS})`,
    });
  }

  // Check CPA
  if (rules.minCPA !== null && metrics.cpa < rules.minCPA) {
    violations.push({
      rule: 'minCPA',
      threshold: rules.minCPA,
      actual: metrics.cpa,
      message: `CPA ($${metrics.cpa.toFixed(2)}) is below minimum threshold ($${rules.minCPA})`,
    });
  }
  if (rules.maxCPA !== null && metrics.cpa > rules.maxCPA) {
    violations.push({
      rule: 'maxCPA',
      threshold: rules.maxCPA,
      actual: metrics.cpa,
      message: `CPA ($${metrics.cpa.toFixed(2)}) exceeds maximum threshold ($${rules.maxCPA})`,
    });
  }

  // Check daily spend
  if (rules.maxDailySpend !== null && metrics.dailySpend > rules.maxDailySpend) {
    violations.push({
      rule: 'maxDailySpend',
      threshold: rules.maxDailySpend,
      actual: metrics.dailySpend,
      message: `Daily spend ($${metrics.dailySpend.toFixed(2)}) exceeds limit ($${rules.maxDailySpend})`,
    });
  }

  // Check CTR
  if (rules.minCTR !== null && metrics.ctr < rules.minCTR) {
    violations.push({
      rule: 'minCTR',
      threshold: rules.minCTR,
      actual: metrics.ctr,
      message: `CTR (${metrics.ctr.toFixed(2)}%) is below minimum threshold (${rules.minCTR}%)`,
    });
  }

  // Check CPC
  if (rules.maxCPC !== null && metrics.cpc > rules.maxCPC) {
    violations.push({
      rule: 'maxCPC',
      threshold: rules.maxCPC,
      actual: metrics.cpc,
      message: `CPC ($${metrics.cpc.toFixed(2)}) exceeds maximum threshold ($${rules.maxCPC})`,
    });
  }

  // Check conversions
  if (rules.minConversions !== null && metrics.conversions < rules.minConversions) {
    violations.push({
      rule: 'minConversions',
      threshold: rules.minConversions,
      actual: metrics.conversions,
      message: `Conversions (${metrics.conversions}) below minimum threshold (${rules.minConversions})`,
    });
  }

  return violations;
};

/**
 * Get active guardrails for monitoring
 */
campaignGuardrailSchema.statics.getActiveGuardrails = async function(userId) {
  return this.find({
    userId,
    status: 'active',
    'monitoring.enabled': true,
  });
};

/**
 * Update violation tracking
 */
campaignGuardrailSchema.methods.recordViolation = async function() {
  this.lastViolation = new Date();
  this.violationCount += 1;
  return this.save();
};

/**
 * Reset violation tracking
 */
campaignGuardrailSchema.methods.resetViolations = async function() {
  this.violationCount = 0;
  this.lastViolation = null;
  return this.save();
};

module.exports = mongoose.model('CampaignGuardrail', campaignGuardrailSchema);
