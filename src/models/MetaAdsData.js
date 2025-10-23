const mongoose = require('mongoose');

/**
 * Meta Ads Data Schema
 * Stores Facebook/Instagram advertising data
 */
const metaAdsDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  accountId: {
    type: String,
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
  adSetId: {
    type: String,
    index: true,
  },
  adSetName: {
    type: String,
  },
  adId: {
    type: String,
    index: true,
  },
  adName: {
    type: String,
  },
  // Performance metrics
  spend: {
    type: Number,
    required: true,
    default: 0,
  },
  impressions: {
    type: Number,
    default: 0,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  ctr: {
    type: Number, // Click-through rate
    default: 0,
  },
  cpm: {
    type: Number, // Cost per thousand impressions
    default: 0,
  },
  cpc: {
    type: Number, // Cost per click
    default: 0,
  },
  reach: {
    type: Number,
    default: 0,
  },
  frequency: {
    type: Number,
    default: 0,
  },
  // Conversion metrics
  conversions: {
    type: Number,
    default: 0,
  },
  conversionValue: {
    type: Number,
    default: 0,
  },
  costPerConversion: {
    type: Number,
    default: 0,
  },
  // Attribution data (marketing attribution summary)
  attribution: {
    sales: {
      type: Number,
      default: 0,
    },
    orders: [{
      orderId: String,
      orderNumber: String,
      revenue: Number,
      date: Date,
    }],
    revenue: {
      type: Number,
      default: 0,
    },
    roas: {
      type: Number, // Return on ad spend
      default: 0,
    },
  },
  // Date range
  dateStart: {
    type: Date,
    required: true,
    index: true,
  },
  dateStop: {
    type: Date,
    required: true,
    index: true,
  },
  // Objective and status
  objective: {
    type: String,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
    default: 'ACTIVE',
  },
  // Raw data for reference
  rawData: {
    type: mongoose.Schema.Types.Mixed,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
metaAdsDataSchema.index({ userId: 1, dateStart: 1, dateStop: 1 });
metaAdsDataSchema.index({ campaignId: 1, dateStart: 1 });
metaAdsDataSchema.index({ userId: 1, campaignId: 1, dateStart: 1 });

/**
 * Calculate ROAS
 */
metaAdsDataSchema.methods.calculateROAS = function() {
  if (this.spend > 0 && this.attribution.revenue > 0) {
    this.attribution.roas = this.attribution.revenue / this.spend;
  }
  return this.attribution.roas;
};

/**
 * Static method to get campaign summary
 */
metaAdsDataSchema.statics.getCampaignSummary = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        dateStart: { $gte: new Date(startDate) },
        dateStop: { $lte: new Date(endDate) },
      },
    },
    {
      $group: {
        _id: '$campaignId',
        campaignName: { $first: '$campaignName' },
        totalSpend: { $sum: '$spend' },
        totalImpressions: { $sum: '$impressions' },
        totalClicks: { $sum: '$clicks' },
        totalRevenue: { $sum: '$attribution.revenue' },
        totalOrders: { $sum: '$attribution.sales' },
      },
    },
    {
      $addFields: {
        roas: {
          $cond: [
            { $gt: ['$totalSpend', 0] },
            { $divide: ['$totalRevenue', '$totalSpend'] },
            0,
          ],
        },
        avgCPC: {
          $cond: [
            { $gt: ['$totalClicks', 0] },
            { $divide: ['$totalSpend', '$totalClicks'] },
            0,
          ],
        },
      },
    },
    {
      $sort: { totalSpend: -1 },
    },
  ]);
};

module.exports = mongoose.model('MetaAdsData', metaAdsDataSchema);
