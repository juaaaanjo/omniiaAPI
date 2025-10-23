const DataIntegrationAgent = require('../agents/DataIntegrationAgent');
const User = require('../models/User');
const logger = require('../utils/logger');

const dataIntegrationAgent = new DataIntegrationAgent();

/**
 * Sync all data sources
 * @route POST /api/data/sync/all
 */
exports.syncAll = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedData;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    logger.info(`Starting full sync for user ${user._id}`);

    const result = await dataIntegrationAgent.syncAll(user, startDate, endDate);

    res.json({
      success: true,
      message: 'Data synchronization completed',
      data: result,
    });
  } catch (error) {
    logger.error(`Sync all error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error synchronizing data',
      error: error.message,
    });
  }
};

/**
 * Sync Meta Ads data
 * @route POST /api/data/sync/meta-ads
 */
exports.syncMetaAds = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedData;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads integration not connected',
      });
    }

    const result = await dataIntegrationAgent.syncSource(user, 'meta-ads', startDate, endDate);

    res.json({
      success: true,
      message: 'Meta Ads data synchronized successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`Sync Meta Ads error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error synchronizing Meta Ads data',
      error: error.message,
    });
  }
};

/**
 * Sync transaction data from dedicated endpoint
 * @route POST /api/data/sync/transactions
 */
exports.syncTransactions = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedData;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.integrations.transactions.connected) {
      return res.status(400).json({
        success: false,
        message: 'Transactions integration not connected',
      });
    }

    const result = await dataIntegrationAgent.syncSource(user, 'transactions', startDate, endDate);

    res.json({
      success: true,
      message: 'Transaction data synchronized successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`Sync transactions error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error synchronizing transaction data',
      error: error.message,
    });
  }
};

/**
 * Get sync status
 * @route GET /api/data/sync/status
 */
exports.getSyncStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const status = await dataIntegrationAgent.getSyncStatus(user);

    // Also get record counts
    const validation = await dataIntegrationAgent.validateData(user._id);

    res.json({
      success: true,
      data: {
        status,
        recordCounts: validation.recordCounts,
        hasData: validation.hasData,
      },
    });
  } catch (error) {
    logger.error(`Get sync status error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching sync status',
      error: error.message,
    });
  }
};

/**
 * Validate data integrity
 * @route GET /api/data/validate
 */
exports.validateData = async (req, res) => {
  try {
    const result = await dataIntegrationAgent.validateData(req.user._id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Validate data error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error validating data',
      error: error.message,
    });
  }
};

/**
 * Detect anomalies in data
 * @route GET /api/data/anomalies
 */
exports.detectAnomalies = async (req, res) => {
  try {
    const { startDate, endDate } = req.validatedQuery;

    const result = await dataIntegrationAgent.detectAnomalies(
      req.user._id,
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Detect anomalies error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error detecting anomalies',
      error: error.message,
    });
  }
};
