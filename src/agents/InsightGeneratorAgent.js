const mongoose = require('mongoose');
const OpenAIService = require('../services/openaiService');
const logger = require('../utils/logger');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');

/**
 * Insight Generator Agent
 * Generates automatic insights, identifies anomalies, and suggests optimizations
 */
class InsightGeneratorAgent {
  constructor() {
    this.name = 'InsightGeneratorAgent';
    this.aiService = new OpenAIService();
  }

  /**
   * Generate comprehensive insights for all data sources
   */
  async generateInsights(userId, startDate, endDate, options = {}) {
    try {
      logger.info(`${this.name}: Generating insights for user ${userId}`);

      const insights = {
        marketing: null,
        sales: null,
        finance: null,
        anomalies: [],
        recommendations: [],
        trends: [],
      };

      // Generate marketing insights
      insights.marketing = await this.generateMarketingInsights(userId, startDate, endDate);

      // Generate sales insights
      insights.sales = await this.generateSalesInsights(userId, startDate, endDate);

      // Generate financial insights
      insights.finance = await this.generateFinancialInsights(userId, startDate, endDate);

      // Detect anomalies
      insights.anomalies = await this.detectAnomalies(userId, startDate, endDate);

      // Generate recommendations
      insights.recommendations = await this.generateRecommendations(
        insights.marketing,
        insights.sales,
        insights.finance,
        insights.anomalies
      );

      // Identify trends
      insights.trends = await this.identifyTrends(userId, startDate, endDate);

      return {
        success: true,
        insights,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate marketing insights from Meta Ads data
   */
  async generateMarketingInsights(userId, startDate, endDate) {
    try {
      const metaAdsData = await MetaAdsData.find({
        userId,
        dateStart: { $gte: new Date(startDate) },
        dateStop: { $lte: new Date(endDate) },
      })
        .select('-rawData')
        .lean();

      if (metaAdsData.length === 0) {
        return { message: 'No marketing data available', insights: [] };
      }

      // Calculate aggregate metrics
      const totalSpend = metaAdsData.reduce((sum, d) => sum + d.spend, 0);
      const totalImpressions = metaAdsData.reduce((sum, d) => sum + d.impressions, 0);
      const totalClicks = metaAdsData.reduce((sum, d) => sum + d.clicks, 0);
      const totalRevenue = metaAdsData.reduce((sum, d) => sum + (d.attribution?.revenue || 0), 0);

      const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
      const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      // Use ChatGPT to generate insights
      const response = await this.aiService.generateInsights(
        {
          totalSpend,
          totalImpressions,
          totalClicks,
          totalRevenue,
          avgCPC,
          avgCPM,
          overallROAS,
          campaigns: metaAdsData.length,
          topCampaigns: metaAdsData
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 5)
            .map(c => ({
              name: c.campaignName,
              spend: c.spend,
              roas: c.attribution?.roas || 0,
            })),
        },
        'Marketing',
        { startDate, endDate }
      );

      return {
        metrics: {
          totalSpend,
          totalImpressions,
          totalClicks,
          totalRevenue,
          avgCPC,
          avgCPM,
          overallROAS,
        },
        aiInsights: response.content,
        campaigns: metaAdsData.length,
      };
    } catch (error) {
      logger.error(`Error generating marketing insights: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate sales insights from transaction data
   */
  async generateSalesInsights(userId, startDate, endDate) {
    try {
      const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);

      if (!revenueSummary || (revenueSummary.totalTransactions || 0) === 0) {
        return { message: 'No sales data available', insights: [] };
      }

      const successfulTransactions = revenueSummary.successfulTransactions || 0;
      const avgOrderValue =
        successfulTransactions > 0
          ? (revenueSummary.netRevenue || revenueSummary.totalRevenue || 0) / successfulTransactions
          : 0;

      const topCustomers = await TransactionData.aggregate([
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
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 5 },
      ]);

      const paymentMethodBreakdown = await TransactionData.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            transactionCreatedAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
            status: { $in: ['succeeded', 'completed'] },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$paymentMethod', 'unknown'] },
            revenue: { $sum: '$amount' },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      const response = await this.aiService.generateInsights(
        {
          totalRevenue: revenueSummary.totalRevenue || 0,
          netRevenue: revenueSummary.netRevenue || 0,
          successfulTransactions,
          avgOrderValue,
          refundedAmount: revenueSummary.refundedAmount || 0,
          topCustomers,
          paymentMethodBreakdown,
        },
        'Sales',
        { startDate, endDate }
      );

      return {
        metrics: {
          totalRevenue: revenueSummary.totalRevenue || 0,
          netRevenue: revenueSummary.netRevenue || 0,
          successfulTransactions,
          avgOrderValue,
        },
        aiInsights: response.content,
        topCustomers,
        paymentMethodBreakdown,
      };
    } catch (error) {
      logger.error(`Error generating sales insights: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate financial insights from transaction data
   */
  async generateFinancialInsights(userId, startDate, endDate) {
    try {
      // Get transaction revenue summary
      const transactionRevenue = await TransactionData.getRevenueSummary(userId, startDate, endDate);

      const revenue = transactionRevenue.totalRevenue || 0;
      const netRevenue = transactionRevenue.netRevenue || 0;
      const expenses = Math.max(0, revenue - netRevenue);
      const profit = netRevenue;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const transactionFees = expenses;

      const response = await this.aiService.generateInsights(
        {
          revenue,
          expenses,
          profit,
          margin,
          transactionFees,
          netRevenue,
        },
        'Financial',
        { startDate, endDate }
      );

      return {
        metrics: {
          revenue,
          expenses,
          profit,
          marginPercentage: margin,
        },
        aiInsights: response.content,
      };
    } catch (error) {
      logger.error(`Error generating financial insights: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Detect anomalies in data
   */
  async detectAnomalies(userId, startDate, endDate) {
    try {
      const anomalies = [];

      // Check for campaigns with high spend but low ROAS
      const lowROASCampaigns = await MetaAdsData.find({
        userId,
        dateStart: { $gte: new Date(startDate) },
        dateStop: { $lte: new Date(endDate) },
        spend: { $gt: 100 },
        'attribution.roas': { $lt: 1 },
      }).select('campaignName spend attribution.roas');

      if (lowROASCampaigns.length > 0) {
        anomalies.push({
          type: 'low_roas',
          severity: 'high',
          message: `Found ${lowROASCampaigns.length} campaigns with ROAS < 1`,
          campaigns: lowROASCampaigns.map(c => ({
            name: c.campaignName,
            spend: c.spend,
            roas: c.attribution.roas,
          })),
          recommendation: 'Consider pausing or optimizing these campaigns',
        });
      }

      // Check for sudden drops in revenue
      const dailyRevenue = await TransactionData.getDailyRevenue(userId, startDate, endDate);

      if (dailyRevenue.length > 7) {
        const avgRevenue = dailyRevenue.reduce((sum, d) => sum + d.revenue, 0) / dailyRevenue.length;
        const recentAvg = dailyRevenue.slice(-3).reduce((sum, d) => sum + d.revenue, 0) / 3;

        if (recentAvg < avgRevenue * 0.5) {
          anomalies.push({
            type: 'revenue_drop',
            severity: 'high',
            message: 'Significant drop in daily revenue detected',
            avgRevenue,
            recentAvg,
            dropPercentage: ((avgRevenue - recentAvg) / avgRevenue) * 100,
            recommendation: 'Investigate potential issues with checkout, inventory, or marketing',
          });
        }
      }

      // Check for failed payments
      const failedCharges = await TransactionData.countDocuments({
        userId,
        transactionCreatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
        status: 'failed',
      });

      const totalCharges = await TransactionData.countDocuments({
        userId,
        transactionCreatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      });

      if (totalCharges > 0 && failedCharges / totalCharges > 0.1) {
        anomalies.push({
          type: 'high_failure_rate',
          severity: 'medium',
          message: 'High payment failure rate detected',
          failedCharges,
          totalCharges,
          failureRate: (failedCharges / totalCharges) * 100,
          recommendation: 'Review payment methods and checkout process',
        });
      }

      return anomalies;
    } catch (error) {
      logger.error(`Error detecting anomalies: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(marketingData, salesData, financeData, anomalies) {
    try {
      const recommendations = [];

      // Marketing recommendations
      if (marketingData?.metrics?.overallROAS < 2) {
        recommendations.push({
          category: 'marketing',
          priority: 'high',
          title: 'Improve ROAS',
          description: `Your overall ROAS is ${marketingData.metrics.overallROAS.toFixed(2)}. Target a ROAS of at least 2-3 for sustainable growth.`,
          actions: [
            'Analyze and pause underperforming campaigns',
            'Test different ad creatives and copy',
            'Refine audience targeting',
            'Optimize landing pages for conversion',
          ],
        });
      }

      // Sales recommendations
      if (salesData?.metrics?.avgOrderValue < 50) {
        recommendations.push({
          category: 'sales',
          priority: 'medium',
          title: 'Increase Average Order Value',
          description: `Current AOV is $${salesData.metrics.avgOrderValue.toFixed(2)}. Increasing this can significantly boost revenue.`,
          actions: [
            'Implement upselling and cross-selling',
            'Create product bundles',
            'Offer free shipping thresholds',
            'Add recommended products at checkout',
          ],
        });
      }

      // Financial recommendations
      if (financeData?.metrics?.marginPercentage < 20) {
        recommendations.push({
          category: 'finance',
          priority: 'high',
          title: 'Improve Profit Margins',
          description: `Profit margin is ${financeData.metrics.marginPercentage.toFixed(1)}%. This is below the healthy 20-30% range.`,
          actions: [
            'Review and optimize operating expenses',
            'Negotiate better rates with suppliers',
            'Increase prices strategically',
            'Reduce customer acquisition costs',
          ],
        });
      }

      // Anomaly-based recommendations
      anomalies.forEach(anomaly => {
        if (anomaly.recommendation) {
          recommendations.push({
            category: 'alert',
            priority: anomaly.severity,
            title: anomaly.type.replace(/_/g, ' ').toUpperCase(),
            description: anomaly.message,
            actions: [anomaly.recommendation],
          });
        }
      });

      return recommendations;
    } catch (error) {
      logger.error(`Error generating recommendations: ${error.message}`);
      return [];
    }
  }

  /**
   * Identify trends over time
   */
  async identifyTrends(userId, startDate, endDate) {
    try {
      const trends = [];

      // Revenue trend
      const dailyRevenue = await TransactionData.getDailyRevenue(userId, startDate, endDate);

      if (dailyRevenue.length > 7) {
        const firstHalf = dailyRevenue.slice(0, Math.floor(dailyRevenue.length / 2));
        const secondHalf = dailyRevenue.slice(Math.floor(dailyRevenue.length / 2));

        const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.revenue, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.revenue, 0) / secondHalf.length;

        const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

        trends.push({
          metric: 'Revenue',
          trend: changePercent > 0 ? 'increasing' : 'decreasing',
          changePercent: Math.abs(changePercent),
          description: `Revenue is ${changePercent > 0 ? 'increasing' : 'decreasing'} by ${Math.abs(changePercent).toFixed(1)}%`,
        });
      }

      return trends;
    } catch (error) {
      logger.error(`Error identifying trends: ${error.message}`);
      return [];
    }
  }

  /**
   * Compare performance with previous period
   */
  async compareWithPreviousPeriod(userId, startDate, endDate) {
    try {
      const periodLength = new Date(endDate) - new Date(startDate);
      const previousStartDate = new Date(new Date(startDate) - periodLength);
      const previousEndDate = new Date(startDate);

      // Current period metrics
      const currentRevenue = await TransactionData.getRevenueSummary(userId, startDate, endDate);
      const currentSpend = await MetaAdsData.aggregate([
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
          },
        },
      ]);

      // Previous period metrics
      const previousRevenue = await TransactionData.getRevenueSummary(userId, previousStartDate, previousEndDate);
      const previousSpend = await MetaAdsData.aggregate([
        {
          $match: {
            userId,
            dateStart: { $gte: new Date(previousStartDate) },
            dateStop: { $lte: new Date(previousEndDate) },
          },
        },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: '$spend' },
          },
        },
      ]);

      const currRev = currentRevenue.totalRevenue || 0;
      const prevRev = previousRevenue.totalRevenue || 0;
      const currSpend = currentSpend[0]?.totalSpend || 0;
      const prevSpend = previousSpend[0]?.totalSpend || 0;

      return {
        revenue: {
          current: currRev,
          previous: prevRev,
          change: prevRev > 0 ? ((currRev - prevRev) / prevRev) * 100 : 0,
        },
        spend: {
          current: currSpend,
          previous: prevSpend,
          change: prevSpend > 0 ? ((currSpend - prevSpend) / prevSpend) * 100 : 0,
        },
        roas: {
          current: currSpend > 0 ? currRev / currSpend : 0,
          previous: prevSpend > 0 ? prevRev / prevSpend : 0,
        },
      };
    } catch (error) {
      logger.error(`Error comparing periods: ${error.message}`);
      throw error;
    }
  }
}

module.exports = InsightGeneratorAgent;
