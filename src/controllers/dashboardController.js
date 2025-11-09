const mongoose = require('mongoose');
const BusinessAnalysisAgent = require('../agents/BusinessAnalysisAgent');
const InsightGeneratorAgent = require('../agents/InsightGeneratorAgent');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');
const SupportTicket = require('../models/SupportTicket');
const MetricsService = require('../services/metricsService');
const logger = require('../utils/logger');

const businessAnalysisAgent = new BusinessAnalysisAgent();
const insightGeneratorAgent = new InsightGeneratorAgent();

/**
 * Get overall KPIs
 * @route GET /api/dashboard/kpis
 */
exports.getKPIs = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;

    const userId = req.user._id;

    // Get transaction-based revenue data
    const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);

    // Get marketing spend
    const marketingSpend = await MetaAdsData.aggregate([
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

    // Get payment data from transactions
    const transactionCount = await TransactionData.countDocuments({ userId });
    logger.info(`KPI Dashboard - Transaction count: ${transactionCount}, Date range: ${startDate} to ${endDate}`);
    const paymentData = await TransactionData.getRevenueSummary(userId, startDate, endDate);
    logger.info('Using Transaction data:', paymentData);

    // Get accounting data
    const spend = marketingSpend[0]?.totalSpend || 0;
    const revenue = revenueSummary.totalRevenue || 0;
    const successfulTransactions = revenueSummary.successfulTransactions || 0;
    const averageTransactionValue = successfulTransactions > 0
      ? (revenueSummary.netRevenue || revenueSummary.totalRevenue || 0) / successfulTransactions
      : 0;
    const paymentTotalRevenue = paymentData?.totalRevenue || 0;
    const paymentNetRevenue = paymentData?.netRevenue || 0;
    const paymentExpenses = Math.max(0, paymentTotalRevenue - paymentNetRevenue);
    const profit = paymentNetRevenue;

    const kpis = {
      revenue: {
        total: revenue,
        orders: successfulTransactions,
        avgOrderValue: averageTransactionValue,
      },
      marketing: {
        totalSpend: spend,
        impressions: marketingSpend[0]?.totalImpressions || 0,
        clicks: marketingSpend[0]?.totalClicks || 0,
        roas: spend > 0 ? revenue / spend : 0,
        cpc: marketingSpend[0]?.totalClicks > 0 ? spend / marketingSpend[0].totalClicks : 0,
      },
      payments: {
        totalRevenue: paymentData?.totalRevenue || 0,
        netRevenue: paymentData?.netRevenue || 0,
        totalTransactions: paymentData?.successfulTransactions || paymentData?.totalTransactions || 0,
        source: transactionCount > 0 ? 'transactions' : 'none',
      },
      finance: {
        revenue: paymentTotalRevenue,
        expenses: paymentExpenses,
        profit,
        margin: paymentTotalRevenue > 0 ? (profit / paymentTotalRevenue) * 100 : 0,
      },
    };

    res.json({
      success: true,
      data: {
        kpis,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get KPIs error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching KPIs',
      error: error.message,
    });
  }
};

/**
 * Get marketing dashboard data
 * @route GET /api/dashboard/marketing
 */
exports.getMarketingDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    // Get campaign summary
    const campaigns = await MetaAdsData.getCampaignSummary(userId, startDate, endDate);

    // Get daily spend trend
    const dailySpend = await MetaAdsData.aggregate([
      {
        $match: {
          userId,
          dateStart: { $gte: new Date(startDate) },
          dateStop: { $lte: new Date(endDate) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$dateStart' } },
          spend: { $sum: '$spend' },
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        campaigns,
        dailySpend,
        summary: {
          totalCampaigns: campaigns.length,
          topPerformer: campaigns[0],
          avgROAS: campaigns.reduce((sum, c) => sum + (c.roas || 0), 0) / campaigns.length || 0,
        },
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get marketing dashboard error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching marketing dashboard',
      error: error.message,
    });
  }
};

/**
 * Get sales dashboard data
 * @route GET /api/dashboard/sales
 */
exports.getSalesDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    // Get revenue summary from transactions
    const revenueSummary = await TransactionData.getRevenueSummary(userId, startDate, endDate);

    // Get daily revenue from transactions
    const transactionCount = await TransactionData.countDocuments({ userId });
    const dailyRevenue = transactionCount > 0
      ? await TransactionData.getDailyRevenue(userId, startDate, endDate)
      : [];

    // Revenue by payment method
    const revenueByPaymentMethod = await TransactionData.aggregate([
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

    // Top customers by revenue
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
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    const overview = {
      totalRevenue: revenueSummary.totalRevenue || 0,
      netRevenue: revenueSummary.netRevenue || 0,
      totalTransactions: revenueSummary.totalTransactions || 0,
      successfulTransactions: revenueSummary.successfulTransactions || 0,
      avgTransactionValue:
        (revenueSummary.successfulTransactions || 0) > 0
          ? (revenueSummary.netRevenue || revenueSummary.totalRevenue || 0) /
            revenueSummary.successfulTransactions
          : 0,
    };

    res.json({
      success: true,
      data: {
        overview,
        topCustomers,
        topProducts: [],
        dailyRevenue,
        revenueByPaymentMethod,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get sales dashboard error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales dashboard',
      error: error.message,
    });
  }
};

/**
 * Get finance dashboard data
 * @route GET /api/dashboard/finance
 */
exports.getFinanceDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    // Get revenue and expenses
    // Get payment data from transactions
    const transactionCount = await TransactionData.countDocuments({ userId });
    const paymentData = await TransactionData.getRevenueSummary(userId, startDate, endDate);

    const totalRevenue = paymentData?.totalRevenue || 0;
    const totalExpenses = Math.max(0, totalRevenue - (paymentData?.netRevenue || 0));
    const profit = totalRevenue - totalExpenses;

    res.json({
      success: true,
      data: {
        summary: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          profit,
          margin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
        },
        expensesByCategory: [],
        arAging: [],
        paymentData,
        paymentDataSource: transactionCount > 0 ? 'transactions' : 'none',
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get finance dashboard error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching finance dashboard',
      error: error.message,
    });
  }
};

/**
 * Get cross-analysis data
 * @route GET /api/dashboard/cross-analysis
 */
exports.getCrossAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    // Revenue vs Spend analysis
    const revenueVsSpend = await businessAnalysisAgent.analyzeRevenueVsSpend(
      userId,
      startDate,
      endDate
    );

    // Campaign performance
    const campaignPerformance = await businessAnalysisAgent.analyzeCampaignPerformance(
      userId,
      startDate,
      endDate
    );

    // Customer lifetime value
    const clv = await businessAnalysisAgent.analyzeCustomerLifetimeValue(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        revenueVsSpend,
        campaignPerformance,
        customerLifetimeValue: clv,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get cross-analysis error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching cross-analysis data',
      error: error.message,
    });
  }
};

/**
 * Get AI-generated insights
 * @route GET /api/dashboard/insights
 */
exports.getInsights = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const insights = await insightGeneratorAgent.generateInsights(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.error(`Get insights error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating insights',
      error: error.message,
    });
  }
};

/**
 * Compare with previous period
 * @route GET /api/dashboard/compare
 */
exports.comparePeriods = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const comparison = await insightGeneratorAgent.compareWithPreviousPeriod(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        comparison,
        currentPeriod: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Compare periods error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error comparing periods',
      error: error.message,
    });
  }
};

/**
 * Get Retention metrics
 * @route GET /api/dashboard/retention
 */
exports.getRetentionMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const retentionMetrics = await MetricsService.getRetentionMetrics(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: {
        ...retentionMetrics,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get retention metrics error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching retention metrics',
      error: error.message,
    });
  }
};

/**
 * Get Growth metrics
 * @route GET /api/dashboard/growth
 */
exports.getGrowthMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const growthMetrics = await MetricsService.getGrowthMetrics(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: {
        ...growthMetrics,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get growth metrics error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching growth metrics',
      error: error.message,
    });
  }
};

/**
 * Get Data Quality metrics
 * @route GET /api/dashboard/data-quality
 */
exports.getDataQualityMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const dataQualityMetrics = await MetricsService.getDataQualityMetrics(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: {
        ...dataQualityMetrics,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get data quality metrics error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching data quality metrics',
      error: error.message,
    });
  }
};

/**
 * Get SAC (Customer Service) metrics
 * @route GET /api/dashboard/sac
 */
exports.getSACMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const sacMetrics = await SupportTicket.getSACMetrics(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: {
        ...sacMetrics,
        dateRange: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error(`Get SAC metrics error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching SAC metrics',
      error: error.message,
    });
  }
};

/**
 * Get all dashboard metrics at once
 * @route GET /api/dashboard/all-metrics
 */
exports.getAllMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;
    const userId = req.user._id;

    const [retention, growth, dataQuality, sac] = await Promise.all([
      MetricsService.getRetentionMetrics(userId, new Date(startDate), new Date(endDate)),
      MetricsService.getGrowthMetrics(userId, new Date(startDate), new Date(endDate)),
      MetricsService.getDataQualityMetrics(userId, new Date(startDate), new Date(endDate)),
      SupportTicket.getSACMetrics(userId, new Date(startDate), new Date(endDate)),
    ]);

    res.json({
      success: true,
      data: {
        retention,
        growth,
        dataQuality,
        sac,
        dateRange: { startDate, endDate },
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error(`Get all metrics error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching all metrics',
      error: error.message,
    });
  }
};
