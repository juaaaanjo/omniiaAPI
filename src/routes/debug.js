const express = require('express');
const router = express.Router();
const debugController = require('../controllers/debugController');
const { protect } = require('../middleware/auth');

/**
 * @route   GET /api/debug/transactions
 * @desc    Debug transaction integration status
 * @access  Private
 */
router.get(
  '/transactions',
  protect,
  debugController.debugTransactions
);

/**
 * @route   GET /api/debug/revenue-test
 * @desc    Test revenue calculation
 * @access  Private
 */
router.get(
  '/revenue-test',
  protect,
  debugController.testRevenueCalculation
);

module.exports = router;
