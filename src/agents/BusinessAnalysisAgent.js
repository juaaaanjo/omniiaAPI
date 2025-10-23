const mongoose = require('mongoose');
const OpenAIService = require('../services/openaiService');
const logger = require('../utils/logger');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');

/**
 * Business Analysis Agent
 * Answers complex business questions by cross-referencing data
 */
class BusinessAnalysisAgent {
  constructor() {
    this.name = 'BusinessAnalysisAgent';
    this.aiService = new OpenAIService();
  }

  /**
   * Answer a business question
   */
  async answerQuestion(userId, question, context = {}) {
    try {
      logger.info(`${this.name}: Answering question for user ${userId}`);

      // Determine what data sources are needed based on the question
      const neededSources = this.identifyNeededDataSources(question);

      // Fetch relevant data
      const dataSources = await this.fetchRelevantData(userId, neededSources, context);

      // Use ChatGPT to analyze and answer
      const response = await this.aiService.answerBusinessQuestion(
        question,
        dataSources,
        context
      );

      return {
        answer: response.content,
        dataSources: Object.keys(dataSources),
        usage: response.usage,
        confidence: this.calculateConfidence(dataSources),
      };
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Identify which data sources are needed based on the question
   */
  identifyNeededDataSources(question) {
    const lowerQuestion = question.toLowerCase();
    const sources = [];

    // Marketing/Ads keywords
    if (lowerQuestion.match(/meta|facebook|instagram|ads?|campaign|spend|cpc|cpm|impression|click/)) {
      sources.push('meta-ads');
    }

    // Sales/E-commerce keywords
    if (lowerQuestion.match(/order|sales?|revenue|shopify|customer|product|conversion/)) {
      if (!sources.includes('transactions')) sources.push('transactions');
    }

    // Payment keywords
    if (lowerQuestion.match(/payment|charge|transaction|refund/)) {
      sources.push('transactions');
    }

    // Finance/accounting keywords now map to transactions data
    if (lowerQuestion.match(/invoice|expense|bill|accounting|profit|loss/)) {
      if (!sources.includes('transactions')) sources.push('transactions');
    }

    // Accounting keywords
    // Attribution keywords (need multiple sources for comprehensive analysis)
    if (lowerQuestion.match(/attribution|roas|roi|generated.*sales|how much.*spend.*generate/)) {
      if (!sources.includes('meta-ads')) sources.push('meta-ads');
      if (!sources.includes('transactions')) sources.push('transactions');
    }

    // If no specific sources identified, include all available
    if (sources.length === 0) {
      sources.push('meta-ads', 'transactions');
    }

    return sources;
  }

  /**
   * Fetch relevant data from identified sources
   */
  async fetchRelevantData(userId, sources, context = {}) {
    const dataSources = {};

    // Default date range: last 90 days (reduced from 2 years to prevent token overflow)
    const endDate = context.endDate || new Date();
    const startDate = context.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // Fetch Meta Ads data - use aggregation to summarize instead of raw records
      if (sources.includes('meta-ads')) {
        const metaAdsSummary = await MetaAdsData.aggregate([
          {
            $match: {
              userId,
              dateStart: { $gte: startDate },
              dateStop: { $lte: endDate },
            },
          },
          {
            $group: {
              _id: '$campaignName',
              campaignId: { $first: '$campaignId' },
              totalSpend: { $sum: '$spend' },
              totalImpressions: { $sum: '$impressions' },
              totalClicks: { $sum: '$clicks' },
              totalReach: { $sum: '$reach' },
              avgCtr: { $avg: '$ctr' },
              avgCpc: { $avg: '$cpc' },
              avgCpm: { $avg: '$cpm' },
              totalRevenue: { $sum: '$attribution.revenue' },
              totalSales: { $sum: '$attribution.sales' },
              status: { $first: '$status' },
              recordCount: { $sum: 1 },
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
            },
          },
          { $sort: { totalSpend: -1 } },
          { $limit: 50 }, // Limit to top 50 campaigns
        ]);

        dataSources.metaAds = {
          summary: metaAdsSummary,
          totalCampaigns: metaAdsSummary.length,
        };
      }

      // Fetch transaction data - use aggregation to summarize
      if (sources.includes('transactions')) {
        const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);

        const statusBreakdown = await TransactionData.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              transactionCreatedAt: {
                $gte: startDate,
                $lte: endDate,
              },
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
              netAmount: { $sum: { $ifNull: ['$netAmount', '$amount'] } },
            },
          },
        ]);

        const topCustomers = await TransactionData.aggregate([
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
              _id: '$customerEmail',
              totalSpent: { $sum: '$amount' },
              transactionCount: { $sum: 1 },
            },
          },
          { $sort: { totalSpent: -1 } },
          { $limit: 10 },
        ]);

        dataSources.transactions = {
          revenueSummary,
          statusBreakdown,
          topCustomers,
          totalTransactions: revenueSummary.totalTransactions || 0,
        };
      }

      return dataSources;
    } catch (error) {
      logger.error(`Error fetching relevant data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform cross-analysis between multiple data sources
   */
  async crossAnalyze(userId, analysisType, startDate, endDate) {
    try {
      logger.info(`${this.name}: Performing ${analysisType} analysis`);

      let result = {};

      switch (analysisType) {
        case 'revenue-vs-spend':
          result = await this.analyzeRevenueVsSpend(userId, startDate, endDate);
          break;

        case 'campaign-performance':
          result = await this.analyzeCampaignPerformance(userId, startDate, endDate);
          break;

        case 'customer-lifetime-value':
          result = await this.analyzeCustomerLifetimeValue(userId, startDate, endDate);
          break;

        case 'profit-margins':
          result = await this.analyzeProfitMargins(userId, startDate, endDate);
          break;

        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }

      return result;
    } catch (error) {
      logger.error(`${this.name} cross-analyze error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze revenue vs marketing spend
   */
  async analyzeRevenueVsSpend(userId, startDate, endDate) {
    // Get total marketing spend from Meta Ads
    const metaAdsStats = await MetaAdsData.aggregate([
      {
        $match: {
          userId,
          dateStart: { $gte: new Date(startDate) },
          dateStop: { $lte: new Date(endDate) },
        },
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: '$spend' },
          totalImpressions: { $sum: '$impressions' },
          totalClicks: { $sum: '$clicks' },
        },
      },
    ]);

    // Get total revenue from transaction data
    const revenueStats = await TransactionData.getRevenueSummary(userId, startDate, endDate);

    const totalSpend = metaAdsStats[0]?.totalSpend || 0;
    const totalRevenue = revenueStats.totalRevenue || 0;

    return {
      totalSpend,
      totalRevenue,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      netProfit: totalRevenue - totalSpend,
      impressions: metaAdsStats[0]?.totalImpressions || 0,
      clicks: metaAdsStats[0]?.totalClicks || 0,
      orderCount: revenueStats.successfulTransactions || 0,
      avgOrderValue:
        (revenueStats.successfulTransactions || 0) > 0
          ? (revenueStats.netRevenue || revenueStats.totalRevenue || 0) /
            revenueStats.successfulTransactions
          : 0,
    };
  }

  /**
   * Analyze campaign performance
   */
  async analyzeCampaignPerformance(userId, startDate, endDate) {
    const campaigns = await MetaAdsData.getCampaignSummary(userId, startDate, endDate);

    return {
      campaigns,
      totalCampaigns: campaigns.length,
      bestPerformer: campaigns[0],
      avgROAS: campaigns.reduce((sum, c) => sum + c.roas, 0) / campaigns.length || 0,
    };
  }

  /**
   * Analyze customer lifetime value
   */
  async analyzeCustomerLifetimeValue(userId, startDate, endDate) {
    const customerStats = await TransactionData.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          transactionCreatedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
          status: { $in: ['succeeded', 'completed'] },
          customerEmail: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$customerEmail',
          totalSpent: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          firstTransaction: { $min: '$transactionCreatedAt' },
          lastTransaction: { $max: '$transactionCreatedAt' },
        },
      },
      {
        $group: {
          _id: null,
          avgLifetimeValue: { $avg: '$totalSpent' },
          avgTransactionCount: { $avg: '$transactionCount' },
          totalCustomers: { $sum: 1 },
        },
      },
    ]);

    return customerStats[0] || {
      avgLifetimeValue: 0,
      avgTransactionCount: 0,
      totalCustomers: 0,
    };
  }

  /**
   * Analyze profit margins using transaction data
   */
  async analyzeProfitMargins(userId, startDate, endDate) {
    const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);

    const totalRevenue = revenueSummary.totalRevenue || 0;
    const netRevenue = revenueSummary.netRevenue || 0;
    const totalExpenses = Math.max(0, totalRevenue - netRevenue);
    const profit = netRevenue;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit,
      marginPercentage: margin,
    };
  }

  /**
   * Calculate confidence score based on available data
   */
  calculateConfidence(dataSources) {
    let totalDataPoints = 0;

    // Count data points from summarized data
    if (dataSources.metaAds) {
      totalDataPoints += dataSources.metaAds.totalCampaigns || 0;
    }
    if (dataSources.transactions) {
      totalDataPoints += dataSources.transactions.totalTransactions || 0;
    }

    if (totalDataPoints === 0) return 0;
    if (totalDataPoints < 10) return 0.3;
    if (totalDataPoints < 50) return 0.6;
    if (totalDataPoints < 200) return 0.8;
    return 0.95;
  }
}

module.exports = BusinessAnalysisAgent;
