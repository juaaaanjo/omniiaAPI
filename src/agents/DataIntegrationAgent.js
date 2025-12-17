const logger = require('../utils/logger');
const MetaAdsService = require('../services/metaAdsService');
const TransactionService = require('../services/transactionService');

/**
 * Data Integration Agent
 * Handles synchronization with external APIs and data management
 */
class DataIntegrationAgent {
  constructor() {
    this.name = 'DataIntegrationAgent';
  }

  /**
   * Sync data from all sources
   */
  async syncAll(user, startDate, endDate) {
    try {
      logger.info(`${this.name}: Starting full sync for user ${user._id}`);

      const results = {};
      const availableSources = user.getAvailableDataSources();

      // Only sync enabled data sources
      if (availableSources.metaAds) {
        results.metaAds = { success: false, message: 'Not configured' };
        // Sync Meta Ads
        if (user.integrations.metaAds.connected) {
          try {
            const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
            results.metaAds = await metaAdsService.syncToDatabase(
              user._id,
              user.integrations.metaAds.accountId,
              startDate,
              endDate
            );

            // Update last sync time
            user.integrations.metaAds.lastSync = new Date();
          } catch (error) {
            logger.error(`Meta Ads sync error: ${error.message}`);
            results.metaAds = { success: false, error: error.message };
          }
        }
      }

      if (availableSources.transactions) {
        results.transactions = { success: false, message: 'Not configured' };
        // Sync Transactions
        if (user.integrations.transactions && user.integrations.transactions.connected) {
          try {
            results.transactions = await TransactionService.syncToDatabase(user._id, startDate, endDate);

            user.integrations.transactions.lastSync = new Date();
          } catch (error) {
            logger.error(`Transactions sync error: ${error.message}`);
            results.transactions = { success: false, error: error.message };
          }
        }
      }

      // Save user with updated sync times
      await user.save();

      logger.info(`${this.name}: Full sync completed`);

      return {
        success: true,
        results,
        syncedAt: new Date(),
      };
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync specific data source
   */
  async syncSource(user, source, startDate, endDate) {
    try {
      logger.info(`${this.name}: Syncing ${source} for user ${user._id}`);

      let result = { success: false, message: 'Invalid source' };

      switch (source) {
        case 'meta-ads':
          // Check if user has access to this data source
          if (!user.hasDataSourceAccess('metaAds')) {
            result = { success: false, message: 'Access denied: Meta Ads data source not enabled for your account' };
            break;
          }
          if (user.integrations.metaAds.connected) {
            const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
            result = await metaAdsService.syncToDatabase(
              user._id,
              user.integrations.metaAds.accountId,
              startDate,
              endDate
            );
            user.integrations.metaAds.lastSync = new Date();
            await user.save();
          } else {
            result = { success: false, message: 'Meta Ads not connected' };
          }
          break;

        case 'transactions':
          // Check if user has access to this data source
          if (!user.hasDataSourceAccess('transactions')) {
            result = { success: false, message: 'Access denied: Transactions data source not enabled for your account' };
            break;
          }
          if (user.integrations.transactions && user.integrations.transactions.connected) {
            result = await TransactionService.syncToDatabase(user._id, startDate, endDate);
            user.integrations.transactions.lastSync = new Date();
            await user.save();
          } else {
            result = { success: false, message: 'Transactions not connected' };
          }
          break;

        default:
          result = { success: false, message: `Unknown source: ${source}` };
      }

      return result;
    } catch (error) {
      logger.error(`${this.name} sync source error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sync status for all integrations
   */
  async getSyncStatus(user) {
    try {
      const status = {};
      const availableSources = user.getAvailableDataSources();

      // Only include enabled data sources
      if (availableSources.metaAds) {
        status.metaAds = {
          connected: user.integrations.metaAds.connected,
          lastSync: user.integrations.metaAds.lastSync,
          status: user.integrations.metaAds.connected ? 'ready' : 'not_connected',
          enabled: true,
        };
      }

      if (availableSources.transactions) {
        status.transactions = {
          connected: user.integrations.transactions?.connected || false,
          lastSync: user.integrations.transactions?.lastSync || null,
          status: (user.integrations.transactions?.connected) ? 'ready' : 'not_connected',
          enabled: true,
        };
      }

      if (availableSources.excelTransactions) {
        status.excelTransactions = {
          connected: user.integrations.excelTransactions?.connected || false,
          lastSync: user.integrations.excelTransactions?.lastSyncedAt || null,
          status: (user.integrations.excelTransactions?.connected) ? 'ready' : 'not_connected',
          enabled: true,
        };
      }

      return status;
    } catch (error) {
      logger.error(`${this.name} get sync status error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate data integrity
   */
  async validateData(userId) {
    try {
      logger.info(`${this.name}: Validating data for user ${userId}`);

      const MetaAdsData = require('../models/MetaAdsData');
      const TransactionData = require('../models/TransactionData');

      const validation = {
        metaAds: await MetaAdsData.countDocuments({ userId }),
        transactions: await TransactionData.countDocuments({ userId }),
      };

      return {
        success: true,
        recordCounts: validation,
        hasData: Object.values(validation).some(count => count > 0),
      };
    } catch (error) {
      logger.error(`${this.name} validate data error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect missing or inconsistent data
   */
  async detectAnomalies(userId, startDate, endDate) {
    try {
      logger.info(`${this.name}: Detecting anomalies for user ${userId}`);

      const MetaAdsData = require('../models/MetaAdsData');
      const TransactionData = require('../models/TransactionData');

      const anomalies = [];

      // Check for campaigns with spend but no recorded conversions
      const campaignsWithoutSales = await MetaAdsData.find({
        userId,
        dateStart: { $gte: new Date(startDate) },
        dateStop: { $lte: new Date(endDate) },
        spend: { $gt: 0 },
        conversions: { $lte: 0 },
      }).select('campaignName spend dateStart dateStop');

      if (campaignsWithoutSales.length > 0) {
        anomalies.push({
          type: 'campaigns_without_conversions',
          message: `Found ${campaignsWithoutSales.length} campaigns with spend but no recorded conversions`,
          campaigns: campaignsWithoutSales.map(c => c.campaignName),
        });
      }

      // Check for elevated transaction failure rate
      const failedTransactions = await TransactionData.countDocuments({
        userId,
        status: 'failed',
        transactionCreatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      });

      const totalTransactions = await TransactionData.countDocuments({
        userId,
        transactionCreatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      });

      if (totalTransactions > 0 && failedTransactions / totalTransactions > 0.1) {
        anomalies.push({
          type: 'high_transaction_failure_rate',
          message: 'Payment failure rate is above 10% for the selected period',
          failedTransactions,
          totalTransactions,
        });
      }

      return {
        success: true,
        anomaliesFound: anomalies.length,
        anomalies,
      };
    } catch (error) {
      logger.error(`${this.name} detect anomalies error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DataIntegrationAgent;
