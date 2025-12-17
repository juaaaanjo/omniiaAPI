const express = require('express');
const router = express.Router();
const excelTransactionController = require('../controllers/excelTransactionController');
const { protect } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { validate, dateRangeQuerySchema } = require('../utils/validators');
const { requireDataSourceAccess } = require('../middleware/dataSourceAccess');

/**
 * @route   POST /api/excel-transactions/upload
 * @desc    Upload and import Excel file with transaction data
 * @access  Private (requires excelTransactions data source access)
 */
router.post(
  '/upload',
  protect,
  requireDataSourceAccess('excelTransactions'),
  uploadLimiter,
  excelTransactionController.uploadExcel
);

/**
 * @route   GET /api/excel-transactions/uploads
 * @desc    Get all uploads for the current user
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/uploads',
  protect,
  requireDataSourceAccess('excelTransactions'),
  excelTransactionController.getUploads
);

/**
 * @route   GET /api/excel-transactions/uploads/:uploadId
 * @desc    Get statistics for a specific upload
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/uploads/:uploadId',
  protect,
  requireDataSourceAccess('excelTransactions'),
  excelTransactionController.getUploadStats
);

/**
 * @route   DELETE /api/excel-transactions/uploads/:uploadId
 * @desc    Delete an upload and all its transactions
 * @access  Private (requires excelTransactions data source access)
 */
router.delete(
  '/uploads/:uploadId',
  protect,
  requireDataSourceAccess('excelTransactions'),
  excelTransactionController.deleteUpload
);

/**
 * @route   GET /api/excel-transactions/analytics/revenue
 * @desc    Get revenue summary
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/revenue',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getRevenueSummary
);

/**
 * @route   GET /api/excel-transactions/analytics/daily-revenue
 * @desc    Get daily revenue breakdown
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/daily-revenue',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getDailyRevenue
);

/**
 * @route   GET /api/excel-transactions/analytics/payment-methods
 * @desc    Get payment method breakdown
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/payment-methods',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getPaymentMethodSummary
);

/**
 * @route   GET /api/excel-transactions/analytics/top-customers
 * @desc    Get top customers by revenue
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/top-customers',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getTopCustomers
);

/**
 * @route   GET /api/excel-transactions/analytics/revenue-by-location
 * @desc    Get revenue by location/sede
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/revenue-by-location',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getRevenueByLocation
);

/**
 * @route   GET /api/excel-transactions/analytics/taxes
 * @desc    Get tax summary
 * @access  Private (requires excelTransactions data source access)
 */
router.get(
  '/analytics/taxes',
  protect,
  requireDataSourceAccess('excelTransactions'),
  validate(dateRangeQuerySchema, 'query'),
  excelTransactionController.getTaxSummary
);

module.exports = router;
