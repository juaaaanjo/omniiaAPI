const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { protect } = require('../middleware/auth');
const { syncLimiter } = require('../middleware/rateLimiter');
const { validate, dateSyncSchema } = require('../utils/validators');

/**
 * @route   POST /api/data/sync/all
 * @desc    Sync all data sources
 * @access  Private
 */
router.post(
  '/sync/all',
  protect,
  syncLimiter,
  validate(dateSyncSchema),
  dataController.syncAll
);

/**
 * @route   POST /api/data/sync/meta-ads
 * @desc    Sync Meta Ads data
 * @access  Private
 */
router.post(
  '/sync/meta-ads',
  protect,
  syncLimiter,
  validate(dateSyncSchema),
  dataController.syncMetaAds
);

/**
 * @route   POST /api/data/sync/transactions
 * @desc    Sync transaction data from dedicated endpoint
 * @access  Private
 */
router.post(
  '/sync/transactions',
  protect,
  syncLimiter,
  validate(dateSyncSchema),
  dataController.syncTransactions
);

/**
 * @route   GET /api/data/sync/status
 * @desc    Get sync status for all integrations
 * @access  Private
 */
router.get(
  '/sync/status',
  protect,
  dataController.getSyncStatus
);

/**
 * @route   GET /api/data/validate
 * @desc    Validate data integrity
 * @access  Private
 */
router.get(
  '/validate',
  protect,
  dataController.validateData
);

/**
 * @route   GET /api/data/anomalies
 * @desc    Detect anomalies in data
 * @access  Private
 */
router.get(
  '/anomalies',
  protect,
  dataController.detectAnomalies
);

module.exports = router;
