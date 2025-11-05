const cron = require('node-cron');
const Alert = require('../models/Alert');
const AlertAgent = require('../agents/AlertAgent');
const User = require('../models/User');
const TransactionData = require('../models/TransactionData');
const MetaAdsData = require('../models/MetaAdsData');
const CampaignGuardrail = require('../models/CampaignGuardrail');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Automated Alert Service (EIO - Inteligencia Operativa)
 * Continuously monitors business operations and generates alerts automatically
 */
class AutomatedAlertService {
  constructor() {
    this.hourlyJob = null;
    this.dailyJob = null;
    this.cleanupJob = null;
    this.alertAgent = new AlertAgent();

    // Alert thresholds
    this.thresholds = {
      // ROAS thresholds
      roasDeclinePercent: 25, // Alert if ROAS drops 25%
      roasCriticalThreshold: 1.5, // ROAS below 1.5x is critical

      // Revenue thresholds
      revenueDropPercent: 20, // Alert if revenue drops 20%
      noRevenueHours: 24, // Alert if no revenue for 24 hours

      // Customer service
      unansweredTicketsThreshold: 15, // Alert if 15+ unanswered tickets
      responseTimeThreshold: 24, // Alert if avg response time > 24 hours

      // Stock (placeholder - needs inventory integration)
      lowStockDays: 3, // Alert if stock < 3 days
      outOfStock: true, // Alert on out of stock

      // Alert expiration
      alertExpirationHours: 72, // Alerts expire after 72 hours if not acted upon
    };
  }

  /**
   * Start automated alert service
   */
  start() {
    logger.info('Starting Automated Alert Service (EIO)...');

    // Hourly checks for critical issues
    this.startHourlyMonitoring();

    // Daily comprehensive checks
    this.startDailyMonitoring();

    // Daily cleanup of expired alerts
    this.startCleanupJob();

    logger.info('Automated Alert Service started successfully');
  }

  /**
   * Hourly monitoring - Quick checks for critical issues
   * Runs every hour
   */
  startHourlyMonitoring() {
    this.hourlyJob = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running hourly alert checks...');

        const activeUsers = await User.find({ isActive: true });

        for (const user of activeUsers) {
          await this.checkCriticalMetrics(user);
        }

        logger.info(`Hourly alert check completed for ${activeUsers.length} users`);
      } catch (error) {
        logger.error(`Hourly alert check error: ${error.message}`);
      }
    });

    logger.info('Hourly monitoring scheduled');
  }

  /**
   * Daily monitoring - Comprehensive checks
   * Runs every day at 9:00 AM
   */
  startDailyMonitoring() {
    this.dailyJob = cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('Running daily alert checks...');

        const activeUsers = await User.find({ isActive: true });

        for (const user of activeUsers) {
          await this.checkAllMetrics(user);
        }

        logger.info(`Daily alert check completed for ${activeUsers.length} users`);
      } catch (error) {
        logger.error(`Daily alert check error: ${error.message}`);
      }
    });

    logger.info('Daily monitoring scheduled: 9:00 AM daily');
  }

  /**
   * Cleanup job - Remove expired alerts
   * Runs daily at midnight
   */
  startCleanupJob() {
    this.cleanupJob = cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('Running alert cleanup...');

        const expired = await Alert.expireOldAlerts();

        logger.info(`Cleanup completed: ${expired} alerts expired`);
      } catch (error) {
        logger.error(`Cleanup error: ${error.message}`);
      }
    });

    logger.info('Cleanup job scheduled: Midnight daily');
  }

  /**
   * Check critical metrics (hourly)
   */
  async checkCriticalMetrics(user) {
    try {
      const userId = user._id;

      // Check ROAS from guardrails
      await this.checkGuardrailAlerts(user);

      // Check revenue drops
      await this.checkRevenueAlerts(user);

    } catch (error) {
      logger.error(`Error checking critical metrics for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Check all metrics (daily)
   */
  async checkAllMetrics(user) {
    try {
      // Run all critical checks first
      await this.checkCriticalMetrics(user);

      // Additional daily checks
      // await this.checkStockAlerts(user); // If you have inventory
      // await this.checkCustomerServiceAlerts(user); // If you have ticketing system

    } catch (error) {
      logger.error(`Error checking all metrics for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Check guardrail violations and create alerts
   */
  async checkGuardrailAlerts(user) {
    try {
      const userId = user._id;

      // Get violated guardrails
      const guardrails = await CampaignGuardrail.find({
        userId,
        status: 'active',
        'monitoring.enabled': true,
        violationCount: { $gt: 0 },
        lastViolation: {
          $gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      });

      for (const guardrail of guardrails) {
        // Check if alert already exists for this guardrail
        const existingAlert = await Alert.findOne({
          userId,
          relatedGuardrailId: guardrail._id,
          status: { $in: ['pending', 'in_review'] },
        });

        if (existingAlert) continue; // Skip if alert already exists

        // Create alert from guardrail violation
        await this.createGuardrailAlert(user, guardrail);
      }

    } catch (error) {
      logger.error(`Error checking guardrail alerts: ${error.message}`);
    }
  }

  /**
   * Create alert from guardrail violation
   */
  async createGuardrailAlert(user, guardrail) {
    try {
      const userId = user._id;
      const language = user.language || 'es';

      // Get campaign metrics
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const adData = await MetaAdsData.find({
        userId,
        campaignId: guardrail.campaignId,
        dateStart: { $gte: last24h },
      });

      const totals = adData.reduce((acc, record) => ({
        spend: acc.spend + (record.spend || 0),
        revenue: acc.revenue + (record.attribution?.revenue || 0),
      }), { spend: 0, revenue: 0 });

      const currentROAS = totals.spend > 0 ? totals.revenue / totals.spend : 0;

      // Build alert data
      const alertData = {
        category: 'roas',
        title: language === 'es'
          ? `ROAS cayó en ${guardrail.campaignName}`
          : `ROAS dropped in ${guardrail.campaignName}`,
        description: language === 'es'
          ? `El ROAS de la campaña "${guardrail.campaignName}" está por debajo del umbral configurado.`
          : `The ROAS of campaign "${guardrail.campaignName}" is below the configured threshold.`,
        metric: {
          name: 'ROAS',
          currentValue: currentROAS,
          previousValue: guardrail.rules.minROAS || 0,
          threshold: guardrail.rules.minROAS,
          changePercentage: 0,
          unit: 'x',
          trend: 'down',
        },
        contextData: {
          campaignId: guardrail.campaignId,
          spend: totals.spend,
          revenue: totals.revenue,
          violations: guardrail.violationCount,
        },
      };

      // Generate AI recommendations
      const recommendations = await this.alertAgent.generateRecommendations(alertData, language);

      // Create alert
      const alert = new Alert({
        userId,
        userName: user.name,
        userEmail: user.email,
        type: currentROAS < this.thresholds.roasCriticalThreshold ? 'critical' : 'warning',
        category: 'roas',
        title: alertData.title,
        description: alertData.description,
        severity: currentROAS < this.thresholds.roasCriticalThreshold ? 'critical' : 'high',
        status: 'pending',
        metric: alertData.metric,
        recommendedActions: recommendations.recommendedActions || [],
        insights: recommendations.insights || [],
        relatedCampaignId: guardrail.campaignId,
        relatedGuardrailId: guardrail._id,
        language,
        aiModel: recommendations.model,
        tokensUsed: recommendations.usage?.totalTokens || 0,
        contextData: alertData.contextData,
        expiresAt: new Date(Date.now() + this.thresholds.alertExpirationHours * 60 * 60 * 1000),
      });

      await alert.save();

      logger.info(`Alert created for campaign ${guardrail.campaignName}: ${alert._id}`);

    } catch (error) {
      logger.error(`Error creating guardrail alert: ${error.message}`);
    }
  }

  /**
   * Check revenue alerts
   */
  async checkRevenueAlerts(user) {
    try {
      const userId = user._id;
      const language = user.language || 'es';

      // Get revenue for last 24 hours vs previous 24 hours
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const previous24h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const [currentRevenue, previousRevenue] = await Promise.all([
        TransactionData.getRevenueSummary(userId, last24h, now),
        TransactionData.getRevenueSummary(userId, previous24h, last24h),
      ]);

      const current = currentRevenue.total || 0;
      const previous = previousRevenue.total || 0;

      // Check for no revenue
      if (current === 0 && previous > 0) {
        await this.createAlert(user, {
          type: 'critical',
          category: 'revenue',
          severity: 'critical',
          title: language === 'es' ? 'Sin ingresos en las últimas 24 horas' : 'No revenue in last 24 hours',
          description: language === 'es'
            ? 'No se han registrado ingresos en las últimas 24 horas.'
            : 'No revenue has been recorded in the last 24 hours.',
          metric: {
            name: 'Revenue',
            currentValue: current,
            previousValue: previous,
            threshold: 0,
            changePercentage: -100,
            unit: 'USD',
            trend: 'down',
          },
          contextData: {
            currentRevenue: current,
            previousRevenue: previous,
          },
        });
        return;
      }

      // Check for significant drop
      if (previous > 0) {
        const changePercent = ((current - previous) / previous) * 100;

        if (changePercent <= -this.thresholds.revenueDropPercent) {
          // Check if alert already exists
          const existingAlert = await Alert.findOne({
            userId,
            category: 'revenue',
            status: { $in: ['pending', 'in_review'] },
            createdAt: { $gte: last24h },
          });

          if (!existingAlert) {
            await this.createAlert(user, {
              type: 'warning',
              category: 'revenue',
              severity: changePercent <= -40 ? 'critical' : 'high',
              title: language === 'es'
                ? `Ingresos cayeron ${Math.abs(changePercent).toFixed(1)}%`
                : `Revenue dropped ${Math.abs(changePercent).toFixed(1)}%`,
              description: language === 'es'
                ? `Los ingresos han caído significativamente en las últimas 24 horas.`
                : `Revenue has dropped significantly in the last 24 hours.`,
              metric: {
                name: 'Revenue',
                currentValue: current,
                previousValue: previous,
                threshold: previous * (1 - this.thresholds.revenueDropPercent / 100),
                changePercentage: changePercent,
                unit: 'USD',
                trend: 'down',
              },
              contextData: {
                currentRevenue: current,
                previousRevenue: previous,
                changePercent,
              },
            });
          }
        }
      }

    } catch (error) {
      logger.error(`Error checking revenue alerts: ${error.message}`);
    }
  }

  /**
   * Generic alert creation with AI recommendations
   */
  async createAlert(user, alertData) {
    try {
      const language = user.language || 'es';

      // Generate AI recommendations
      const recommendations = await this.alertAgent.generateRecommendations(alertData, language);

      // Create alert
      const alert = new Alert({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        ...alertData,
        recommendedActions: recommendations.recommendedActions || [],
        insights: recommendations.insights || [],
        language,
        aiModel: recommendations.model,
        tokensUsed: recommendations.usage?.totalTokens || 0,
        expiresAt: new Date(Date.now() + this.thresholds.alertExpirationHours * 60 * 60 * 1000),
      });

      await alert.save();

      logger.info(`Alert created for user ${user.email}: ${alert.title}`);

      return alert;

    } catch (error) {
      logger.error(`Error creating alert: ${error.message}`);
      throw error;
    }
  }

  /**
   * Manually trigger alert check for specific user
   */
  async triggerManualCheck(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.checkAllMetrics(user);

    return { success: true, message: 'Alert check triggered successfully' };
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (this.hourlyJob) {
      this.hourlyJob.stop();
      logger.info('Hourly monitoring stopped');
    }

    if (this.dailyJob) {
      this.dailyJob.stop();
      logger.info('Daily monitoring stopped');
    }

    if (this.cleanupJob) {
      this.cleanupJob.stop();
      logger.info('Cleanup job stopped');
    }

    logger.info('Automated Alert Service stopped');
  }
}

module.exports = new AutomatedAlertService();
