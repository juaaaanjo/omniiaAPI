const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { dashboardLimiter } = require('../middleware/rateLimiter');
const { validateQuery, dashboardQuerySchema } = require('../utils/validators');

/**
 * @route   GET /api/dashboard/kpis
 * @desc    Get overall KPIs
 * @access  Private
 */
router.get(
  '/kpis',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getKPIs
);

/**
 * @route   GET /api/dashboard/marketing
 * @desc    Get marketing dashboard data
 * @access  Private
 */
router.get(
  '/marketing',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getMarketingDashboard
);

/**
 * @route   GET /api/dashboard/sales
 * @desc    Get sales dashboard data
 * @access  Private
 */
router.get(
  '/sales',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getSalesDashboard
);

/**
 * @route   GET /api/dashboard/finance
 * @desc    Get finance dashboard data
 * @access  Private
 */
router.get(
  '/finance',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getFinanceDashboard
);

/**
 * @route   GET /api/dashboard/cross-analysis
 * @desc    Get cross-analysis data
 * @access  Private
 */
router.get(
  '/cross-analysis',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getCrossAnalysis
);

/**
 * @route   GET /api/dashboard/insights
 * @desc    Get AI-generated insights
 * @access  Private
 */
router.get(
  '/insights',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.getInsights
);

/**
 * @route   GET /api/dashboard/compare
 * @desc    Compare with previous period
 * @access  Private
 */
router.get(
  '/compare',
  protect,
  dashboardLimiter,
  validateQuery(dashboardQuerySchema),
  dashboardController.comparePeriods
);

module.exports = router;
