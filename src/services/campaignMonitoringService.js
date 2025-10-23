const CampaignGuardrail = require('../models/CampaignGuardrail');
const CampaignHistory = require('../models/CampaignHistory');
const MetaAdsData = require('../models/MetaAdsData');
const User = require('../models/User');
const MetaAdsService = require('./metaAdsService');
const logger = require('../utils/logger');

/**
 * Campaign Monitoring Service
 * Monitors campaigns against guardrails and takes automated actions
 */
class CampaignMonitoringService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
  }

  /**
   * Start monitoring service with specified interval
   * @param {number} intervalMinutes - Check interval in minutes (default: 15)
   */
  start(intervalMinutes = 15) {
    if (this.isRunning) {
      logger.warn('Campaign monitoring service is already running');
      return;
    }

    logger.info(`Starting campaign monitoring service (checking every ${intervalMinutes} minutes)`);
    this.isRunning = true;

    // Run immediately on start
    this.checkAllGuardrails();

    // Then schedule periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkAllGuardrails();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop monitoring service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Campaign monitoring service is not running');
      return;
    }

    logger.info('Stopping campaign monitoring service');
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check all active guardrails across all users
   */
  async checkAllGuardrails() {
    try {
      logger.info('Running guardrail checks...');

      // Get all active guardrails
      const guardrails = await CampaignGuardrail.find({
        status: 'active',
        'monitoring.enabled': true,
      });

      logger.info(`Found ${guardrails.length} active guardrails to check`);

      const results = {
        checked: 0,
        violations: 0,
        actionsTaken: 0,
        errors: 0,
      };

      // Check each guardrail
      for (const guardrail of guardrails) {
        try {
          await this.checkGuardrail(guardrail);
          results.checked++;
        } catch (error) {
          logger.error(`Error checking guardrail ${guardrail._id}: ${error.message}`);
          results.errors++;
        }
      }

      logger.info(`Guardrail check complete: ${JSON.stringify(results)}`);
      return results;
    } catch (error) {
      logger.error(`Error in checkAllGuardrails: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check a single guardrail
   * @param {Object} guardrail - CampaignGuardrail document
   */
  async checkGuardrail(guardrail) {
    try {
      const { userId, campaignId, monitoring } = guardrail;

      // Update last checked timestamp
      guardrail.lastChecked = new Date();
      await guardrail.save();

      // Get campaign metrics for the evaluation window
      const metrics = await this.getCampaignMetrics(
        userId,
        campaignId,
        monitoring.evaluationWindow
      );

      // Check if we have enough data points
      if (metrics.conversions < monitoring.minDataPoints && metrics.clicks < monitoring.minDataPoints) {
        logger.debug(`Insufficient data for campaign ${campaignId} (conversions: ${metrics.conversions}, clicks: ${metrics.clicks})`);
        return { status: 'insufficient_data', metrics };
      }

      // Check for violations
      const violations = guardrail.checkViolations(metrics);

      if (violations.length > 0) {
        logger.warn(`Guardrail violations detected for campaign ${campaignId}: ${JSON.stringify(violations)}`);

        await guardrail.recordViolation();

        // Take action based on guardrail settings
        await this.handleViolations(guardrail, violations, metrics);

        return { status: 'violation', violations, metrics };
      } else {
        // Reset violations if campaign is performing well
        if (guardrail.violationCount > 0) {
          await guardrail.resetViolations();
          logger.info(`Campaign ${campaignId} back to normal, violations reset`);
        }

        return { status: 'ok', metrics };
      }
    } catch (error) {
      logger.error(`Error checking guardrail ${guardrail._id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaign metrics for evaluation window
   * @param {string} userId - User ID
   * @param {string} campaignId - Campaign ID
   * @param {number} windowHours - Evaluation window in hours
   */
  async getCampaignMetrics(userId, campaignId, windowHours = 24) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - windowHours * 60 * 60 * 1000);

      // Query MetaAdsData for the campaign within the window
      const data = await MetaAdsData.find({
        userId,
        campaignId,
        dateStart: { $gte: startDate },
        dateStop: { $lte: endDate },
      });

      // Aggregate metrics
      const totals = data.reduce((acc, record) => ({
        spend: acc.spend + (record.spend || 0),
        impressions: acc.impressions + (record.impressions || 0),
        clicks: acc.clicks + (record.clicks || 0),
        conversions: acc.conversions + (record.conversions || 0),
        conversionValue: acc.conversionValue + (record.conversionValue || 0),
        revenue: acc.revenue + (record.attribution?.revenue || 0),
      }), {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        revenue: 0,
      });

      // Calculate derived metrics
      const metrics = {
        ...totals,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        dailySpend: totals.spend / (windowHours / 24), // Average daily spend
        dataPoints: data.length,
      };

      return metrics;
    } catch (error) {
      logger.error(`Error getting campaign metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle guardrail violations
   * @param {Object} guardrail - CampaignGuardrail document
   * @param {Array} violations - Array of violations
   * @param {Object} metrics - Campaign metrics
   */
  async handleViolations(guardrail, violations, metrics) {
    try {
      const { userId, campaignId, campaignName, accountId, autoActions } = guardrail;

      // Build reason message
      const violationMessages = violations.map(v => v.message).join('; ');
      const reason = `Guardrail violations detected: ${violationMessages}`;

      // If alert only, just log and notify
      if (autoActions.alertOnly) {
        logger.info(`Alert: ${reason}`);
        // TODO: Send notification (email, webhook, etc.)
        await this.sendAlert(guardrail, violations, metrics);
        return { action: 'alert', reason };
      }

      // If auto-pause is enabled
      if (autoActions.autoPause) {
        // If require confirmation, mark for review instead of auto-pausing
        if (autoActions.requireConfirmation) {
          logger.info(`Campaign ${campaignId} requires manual confirmation for pause`);
          await this.sendAlert(guardrail, violations, metrics, true); // requiresAction = true
          return { action: 'pending_confirmation', reason };
        }

        // Auto-pause the campaign
        logger.info(`Auto-pausing campaign ${campaignId}: ${reason}`);
        await this.pauseCampaign(userId, campaignId, campaignName, accountId, guardrail._id, violations, reason);

        return { action: 'paused', reason };
      }

      return { action: 'none', reason };
    } catch (error) {
      logger.error(`Error handling violations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pause a campaign via Meta Ads API
   * @param {string} userId - User ID
   * @param {string} campaignId - Campaign ID
   * @param {string} campaignName - Campaign name
   * @param {string} accountId - Account ID
   * @param {string} guardrailId - Guardrail ID that triggered the pause
   * @param {Array} violations - Violations that triggered the pause
   * @param {string} reason - Reason for pausing
   */
  async pauseCampaign(userId, campaignId, campaignName, accountId, guardrailId, violations, reason) {
    try {
      // Get user and access token
      const user = await User.findById(userId);
      if (!user || !user.integrations.metaAds.accessToken) {
        throw new Error('User or Meta Ads access token not found');
      }

      // Get current campaign state from Meta API
      const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
      const campaigns = await metaAdsService.getCampaigns(accountId, {
        filtering: JSON.stringify([{ field: 'id', operator: 'EQUAL', value: campaignId }])
      });

      if (campaigns.length === 0) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const currentCampaign = campaigns[0];

      // Store previous state
      const previousState = {
        status: currentCampaign.status,
        dailyBudget: currentCampaign.daily_budget,
        lifetimeBudget: currentCampaign.lifetime_budget,
        objective: currentCampaign.objective,
      };

      // Pause the campaign
      await metaAdsService.updateCampaign(campaignId, { status: 'PAUSED' });

      logger.info(`Campaign ${campaignId} paused successfully`);

      // Record in history
      const newState = {
        ...previousState,
        status: 'PAUSED',
      };

      await CampaignHistory.createSnapshot({
        userId,
        campaignId,
        campaignName,
        accountId,
        action: 'pause',
        triggeredBy: {
          type: 'guardrail',
          source: guardrailId.toString(),
        },
        previousState,
        newState,
        reason,
        guardrailViolation: {
          guardrailId,
          violations,
        },
      });

      logger.info(`Campaign history recorded for pause action`);

      // Send notification
      await this.sendAlert(
        { userId, campaignId, campaignName },
        violations,
        {},
        false,
        'Campaign automatically paused'
      );

      return { success: true, previousState, newState };
    } catch (error) {
      logger.error(`Error pausing campaign ${campaignId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send alert notification
   * @param {Object} guardrail - Guardrail or partial guardrail data
   * @param {Array} violations - Violations detected
   * @param {Object} metrics - Campaign metrics
   * @param {boolean} requiresAction - Whether manual action is required
   * @param {string} actionTaken - Action that was taken (if any)
   */
  async sendAlert(guardrail, violations, metrics, requiresAction = false, actionTaken = null) {
    try {
      const alert = {
        timestamp: new Date(),
        campaignId: guardrail.campaignId,
        campaignName: guardrail.campaignName,
        violations,
        metrics,
        requiresAction,
        actionTaken,
      };

      // TODO: Implement notification logic
      // - Email notification
      // - Webhook notification
      // - Push notification
      // - Store in a notifications collection

      logger.info(`Alert sent for campaign ${guardrail.campaignId}: ${JSON.stringify(alert)}`);

      return alert;
    } catch (error) {
      logger.error(`Error sending alert: ${error.message}`);
      throw error;
    }
  }

  /**
   * Manual check for a specific campaign
   * @param {string} userId - User ID
   * @param {string} campaignId - Campaign ID
   */
  async checkCampaign(userId, campaignId) {
    try {
      const guardrail = await CampaignGuardrail.findOne({
        userId,
        campaignId,
        status: 'active',
      });

      if (!guardrail) {
        throw new Error('No active guardrail found for this campaign');
      }

      return await this.checkGuardrail(guardrail);
    } catch (error) {
      logger.error(`Error checking campaign ${campaignId}: ${error.message}`);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new CampaignMonitoringService();
