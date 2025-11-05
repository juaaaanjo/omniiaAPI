const cron = require('node-cron');
const PlanningAgent = require('../agents/PlanningAgent');
const ForecastingAgent = require('../agents/ForecastingAgent');
const Plan = require('../models/Plan');
const Alert = require('../models/Alert');
const User = require('../models/User');
const TransactionData = require('../models/TransactionData');
const MetaAdsData = require('../models/MetaAdsData');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Automated Planning Service
 * Continuously analyzes business data and automatically generates plans
 * NO USER INPUT REQUIRED - System plans itself based on data patterns
 */
class AutomatedPlanningService {
  constructor() {
    this.dailyJob = null;
    this.weeklyJob = null;
    this.monthlyJob = null;
    this.planningAgent = new PlanningAgent();
    this.forecastingAgent = new ForecastingAgent();

    // Planning thresholds and triggers
    this.triggers = {
      revenueDeclineThreshold: -0.10, // -10% decline triggers plan
      roasDeclineThreshold: -0.15, // -15% ROAS decline
      opportunityRoasThreshold: 3.5, // ROAS > 3.5x triggers optimization
      lowActivityDays: 7, // No revenue for 7 days triggers plan
      planRefreshDays: 30, // Refresh plans every 30 days
    };
  }

  /**
   * Start automated planning service
   */
  start() {
    logger.info('Starting Automated Planning Service...');

    // Daily monitoring and plan execution
    this.startDailyMonitoring();

    // Weekly plan generation
    this.startWeeklyPlanning();

    // Monthly strategic planning
    this.startMonthlyPlanning();

    logger.info('Automated Planning Service started successfully');
  }

  /**
   * Daily monitoring - Check all users and adjust plans
   * Runs every day at 6:00 AM
   */
  startDailyMonitoring() {
    this.dailyJob = cron.schedule('0 6 * * *', async () => {
      try {
        logger.info('Running daily automated planning check...');

        const activeUsers = await User.find({ isActive: true });

        for (const user of activeUsers) {
          await this.analyzeUserPerformance(user);
        }

        logger.info(`Daily planning check completed for ${activeUsers.length} users`);
      } catch (error) {
        logger.error(`Daily planning check error: ${error.message}`);
      }
    });

    logger.info('Daily monitoring scheduled: 6:00 AM daily');
  }

  /**
   * Weekly planning - Generate new plans based on trends
   * Runs every Monday at 7:00 AM
   */
  startWeeklyPlanning() {
    this.weeklyJob = cron.schedule('0 7 * * 1', async () => {
      try {
        logger.info('Running weekly automated planning...');

        const activeUsers = await User.find({ isActive: true });

        for (const user of activeUsers) {
          await this.generateWeeklyPlans(user);
        }

        logger.info(`Weekly planning completed for ${activeUsers.length} users`);
      } catch (error) {
        logger.error(`Weekly planning error: ${error.message}`);
      }
    });

    logger.info('Weekly planning scheduled: Monday 7:00 AM');
  }

  /**
   * Monthly strategic planning - Comprehensive plans for new month
   * Runs on 1st of each month at 8:00 AM
   */
  startMonthlyPlanning() {
    this.monthlyJob = cron.schedule('0 8 1 * *', async () => {
      try {
        logger.info('Running monthly automated planning...');

        const activeUsers = await User.find({ isActive: true });

        for (const user of activeUsers) {
          await this.generateMonthlyPlans(user);
        }

        logger.info(`Monthly planning completed for ${activeUsers.length} users`);
      } catch (error) {
        logger.error(`Monthly planning error: ${error.message}`);
      }
    });

    logger.info('Monthly planning scheduled: 1st of month at 8:00 AM');
  }

  /**
   * Analyze user performance and trigger plans as needed
   */
  async analyzeUserPerformance(user) {
    try {
      const userId = user._id;
      const userLanguage = user.language || 'es';
      logger.info(`Analyzing performance for user: ${user.email}`);

      // Get recent performance data
      const performance = await this.getUserPerformanceMetrics(userId);

      // Check various trigger conditions
      const triggers = [
        await this.checkRevenueDecline(userId, performance, userLanguage),
        await this.checkROASDecline(userId, performance, userLanguage),
        await this.checkInactivity(userId, performance, userLanguage),
        await this.checkOpportunities(userId, performance, userLanguage),
        await this.checkPlanHealth(userId, userLanguage),
      ];

      // Generate plans for triggered conditions
      for (const trigger of triggers) {
        if (trigger.triggered) {
          await this.handleTrigger(user, trigger);
        }
      }

    } catch (error) {
      logger.error(`Error analyzing user ${user.email}: ${error.message}`);
    }
  }

  /**
   * Get user performance metrics
   */
  async getUserPerformanceMetrics(userId) {
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();

    // Revenue metrics
    const revenueRecent = await TransactionData.getRevenueSummary(userId, last7Days, today);
    const revenuePrevious = await TransactionData.getRevenueSummary(
      userId,
      new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      last7Days
    );

    // Ad performance metrics
    const adMetrics = await MetaAdsData.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          dateStart: { $gte: last7Days },
        },
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: '$spend' },
          totalRevenue: { $sum: '$attribution.revenue' },
          totalClicks: { $sum: '$clicks' },
          avgROAS: { $avg: '$roas' },
        },
      },
    ]);

    const adData = adMetrics[0] || {};
    const currentROAS = adData.totalSpend > 0 ? adData.totalRevenue / adData.totalSpend : 0;

    return {
      revenue: {
        current: revenueRecent.total || 0,
        previous: revenuePrevious.total || 0,
        change: revenueRecent.total && revenuePrevious.total
          ? ((revenueRecent.total - revenuePrevious.total) / revenuePrevious.total)
          : 0,
      },
      adSpend: {
        total: adData.totalSpend || 0,
        roas: currentROAS,
      },
      lastActivityDate: revenueRecent.lastTransaction || null,
    };
  }

  /**
   * Check for revenue decline
   */
  async checkRevenueDecline(userId, performance, language = 'es') {
    const triggered = performance.revenue.change < this.triggers.revenueDeclineThreshold;
    const percentage = Math.abs(performance.revenue.change * 100).toFixed(1);

    return {
      triggered,
      type: 'revenue_decline',
      severity: 'high',
      message: language === 'es'
        ? `Los ingresos disminuyeron un ${percentage}%`
        : `Revenue declined by ${percentage}%`,
      data: performance.revenue,
      recommendedPlanType: 'revenue_growth',
    };
  }

  /**
   * Check for ROAS decline
   */
  async checkROASDecline(userId, performance, language = 'es') {
    const triggered = performance.adSpend.roas > 0 && performance.adSpend.roas < 2; // ROAS below 2x is concerning
    const roasValue = performance.adSpend.roas.toFixed(2);

    return {
      triggered,
      type: 'roas_decline',
      severity: 'medium',
      message: language === 'es'
        ? `ROAS está en ${roasValue}x (por debajo del umbral saludable)`
        : `ROAS is ${roasValue}x (below healthy threshold)`,
      data: performance.adSpend,
      recommendedPlanType: 'roas_optimization',
    };
  }

  /**
   * Check for business inactivity
   */
  async checkInactivity(userId, performance, language = 'es') {
    const daysSinceActivity = performance.lastActivityDate
      ? Math.floor((Date.now() - new Date(performance.lastActivityDate)) / (24 * 60 * 60 * 1000))
      : 999;

    const triggered = daysSinceActivity >= this.triggers.lowActivityDays;

    return {
      triggered,
      type: 'inactivity',
      severity: 'high',
      message: language === 'es'
        ? `Sin actividad de ingresos durante ${daysSinceActivity} días`
        : `No revenue activity for ${daysSinceActivity} days`,
      data: { daysSinceActivity },
      recommendedPlanType: 'customer_acquisition',
    };
  }

  /**
   * Check for opportunities (high performing channels)
   */
  async checkOpportunities(userId, performance, language = 'es') {
    const triggered = performance.adSpend.roas >= this.triggers.opportunityRoasThreshold;
    const roasValue = performance.adSpend.roas.toFixed(2);

    return {
      triggered,
      type: 'opportunity',
      severity: 'low',
      message: language === 'es'
        ? `ROAS alto detectado (${roasValue}x) - oportunidad para escalar`
        : `High ROAS detected (${roasValue}x) - opportunity to scale`,
      data: performance.adSpend,
      recommendedPlanType: 'marketing_budget',
    };
  }

  /**
   * Check health of active plans
   */
  async checkPlanHealth(userId, language = 'es') {
    const activePlans = await Plan.getActivePlans(userId);

    // Check if plans are stale or off-track
    const stalePlans = activePlans.filter(plan => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(plan.progress.lastUpdated || plan.createdAt)) / (24 * 60 * 60 * 1000));
      return daysSinceUpdate > this.triggers.planRefreshDays;
    });

    const triggered = stalePlans.length > 0 || activePlans.length === 0;

    let message;
    if (activePlans.length === 0) {
      message = language === 'es'
        ? 'Sin planes activos - se necesita planificación estratégica'
        : 'No active plans - need strategic planning';
    } else {
      message = language === 'es'
        ? `${stalePlans.length} planes necesitan actualización`
        : `${stalePlans.length} plans need refresh`;
    }

    return {
      triggered,
      type: 'plan_health',
      severity: 'low',
      message,
      data: { activePlans: activePlans.length, stalePlans: stalePlans.length },
      recommendedPlanType: 'comprehensive',
    };
  }

  /**
   * Handle triggered condition by generating appropriate plan
   */
  async handleTrigger(user, trigger) {
    try {
      logger.info(`Trigger detected for ${user.email}: ${trigger.type} - ${trigger.message}`);

      // Don't create duplicate plans for same issue
      const recentSimilarPlan = await Plan.findOne({
        userId: user._id,
        planType: trigger.recommendedPlanType,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      });

      if (recentSimilarPlan) {
        logger.info(`Similar plan already exists, skipping: ${recentSimilarPlan._id}`);
        return;
      }

      // Generate automatic plan based on trigger
      const userLanguage = user.language || 'es';
      const autoGenPrefix = userLanguage === 'es' ? 'Generado Automáticamente' : 'Auto-Generated';

      const plan = await this.planningAgent.generatePlan(user._id, {
        planType: trigger.recommendedPlanType,
        planName: `${autoGenPrefix}: ${trigger.message}`,
        planPeriod: trigger.severity === 'high' ? 'next_month' : 'next_quarter',
        language: userLanguage,
        userInfo: {
          name: user.name,
          email: user.email,
        },
      });

      logger.info(`Auto-generated plan created for ${user.email}: ${plan._id} (${trigger.type})`);

      await this.createPlanAlert(user, plan, {
        triggerType: trigger.type,
        triggerMessage: trigger.message,
        severity: trigger.severity,
      });

      // TODO: Notify user about new automated plan
      // await this.notifyUser(user, plan, trigger);

    } catch (error) {
      logger.error(`Error handling trigger for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Generate weekly plans for user
   */
  async generateWeeklyPlans(user) {
    try {
      // Check if user has active plans
      const activePlans = await Plan.getActivePlans(user._id);

      if (activePlans.length > 0) {
        logger.info(`User ${user.email} has ${activePlans.length} active plans, skipping weekly generation`);
        return;
      }

      // No active plans - generate forecast first, then plan
      logger.info(`Generating weekly plan for ${user.email}`);

      // Generate forecast
      const forecast = await this.forecastingAgent.generateForecast(user._id, {
        forecastType: 'revenue',
        forecastPeriod: 'next_week',
        language: user.language || 'es',
        userInfo: {
          name: user.name,
          email: user.email,
        },
      });

      // Generate plan based on forecast
      const plan = await this.planningAgent.generatePlanFromForecast(
        user._id,
        forecast._id,
        {
          name: user.name,
          email: user.email,
        },
        user.language || 'es'
      );

      logger.info(`Weekly plan created for ${user.email}: ${plan._id}`);

      const userLanguage = user.language || 'es';
      const weeklyMessage = userLanguage === 'es'
        ? 'Plan semanal automático generado a partir del pronóstico'
        : 'Automated weekly plan generated from forecast';

      await this.createPlanAlert(user, plan, {
        triggerType: 'weekly_plan',
        triggerMessage: weeklyMessage,
        severity: 'medium',
      });

    } catch (error) {
      logger.error(`Error generating weekly plan for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Generate monthly strategic plans
   */
  async generateMonthlyPlans(user) {
    try {
      logger.info(`Generating monthly strategic plan for ${user.email}`);

      // Archive old completed/cancelled plans
      await Plan.updateMany(
        {
          userId: user._id,
          status: { $in: ['completed', 'cancelled'] },
          archived: false,
        },
        {
          $set: { archived: true },
        }
      );

      // Generate comprehensive plan for the new month
      const userLanguage = user.language || 'es';
      const locale = userLanguage === 'es' ? 'es-ES' : 'en-US';
      const monthYear = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
      const planTitle = userLanguage === 'es'
        ? `Plan Estratégico Mensual - ${monthYear}`
        : `Monthly Strategic Plan - ${monthYear}`;

      const plan = await this.planningAgent.generatePlan(user._id, {
        planType: 'comprehensive',
        planName: planTitle,
        planPeriod: 'next_month',
        language: userLanguage,
        userInfo: {
          name: user.name,
          email: user.email,
        },
      });

      logger.info(`Monthly plan created for ${user.email}: ${plan._id}`);

      const monthlyMessage = userLanguage === 'es'
        ? 'Plan estratégico mensual generado automáticamente'
        : 'Monthly strategic plan generated automatically';

      await this.createPlanAlert(user, plan, {
        triggerType: 'monthly_plan',
        triggerMessage: monthlyMessage,
        severity: 'medium',
      });

    } catch (error) {
      logger.error(`Error generating monthly plan for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Manually trigger analysis for specific user (for testing/admin use)
   */
  async triggerManualAnalysis(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.analyzeUserPerformance(user);
    return { success: true, message: 'Analysis triggered successfully' };
  }

  /**
   * Create EIO alert linked to a newly generated plan
   */
  async createPlanAlert(user, plan, { triggerType = 'plan_generated', triggerMessage = '', severity = 'medium' } = {}) {
    try {
      const language = user.language || 'es';
      const isSpanish = language === 'es';

      const alertSeverity = ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium';
      const alertType = this.mapSeverityToAlertType(alertSeverity);

      const planName = plan.planName || plan.name || (isSpanish ? 'Plan automático' : 'Automated plan');

      const title = isSpanish
        ? `Nuevo plan creado: ${planName}`
        : `New plan created: ${planName}`;

      const defaultDescription = isSpanish
        ? 'Se generó un plan automático con acciones recomendadas para tu equipo.'
        : 'An automated plan with recommended actions has been generated for your team.';

      const description = triggerMessage
        ? `${defaultDescription} ${triggerMessage}`
        : defaultDescription;

      const recommendedActions = [{
        title: isSpanish ? 'Revisar plan' : 'Review plan',
        description: isSpanish
          ? `Abre el plan "${planName}" y define quién ejecutará las acciones prioritarias.`
          : `Open the plan "${planName}" and align owners for the priority actions.`,
        actionType: 'custom',
        estimatedImpact: isSpanish
          ? 'Acelera la ejecución coordinada del plan.'
          : 'Accelerates coordinated execution of the plan.',
        parameters: {
          planId: plan._id.toString(),
        },
      }];

      const insights = Array.isArray(plan.strategy?.keyInsights)
        ? plan.strategy.keyInsights.slice(0, 3)
        : [];

      const alert = new Alert({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        type: alertType,
        category: 'operations',
        title,
        description,
        severity: alertSeverity,
        status: 'pending',
        metric: {
          name: isSpanish ? 'Progreso del plan' : 'Plan progress',
          currentValue: plan.progress?.overall || 0,
          previousValue: null,
          threshold: 100,
          changePercentage: 0,
          unit: '%',
          trend: 'stable',
        },
        recommendedActions,
        insights,
        relatedPlanId: plan._id,
        language,
        contextData: {
          planId: plan._id,
          planType: plan.planType,
          planStartDate: plan.planStartDate,
          planEndDate: plan.planEndDate,
          triggerType,
          triggerMessage,
        },
        expiresAt: plan.planEndDate,
      });

      await alert.save();

      logger.info(`Plan alert created for user ${user.email}: ${alert._id}`);
    } catch (error) {
      logger.error(`Failed to create plan alert for ${user.email}: ${error.message}`);
    }
  }

  /**
   * Map plan severity to alert type
   */
  mapSeverityToAlertType(severity) {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'warning';
      case 'low':
        return 'opportunity';
      default:
        return 'info';
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (this.dailyJob) {
      this.dailyJob.stop();
      logger.info('Daily monitoring stopped');
    }

    if (this.weeklyJob) {
      this.weeklyJob.stop();
      logger.info('Weekly planning stopped');
    }

    if (this.monthlyJob) {
      this.monthlyJob.stop();
      logger.info('Monthly planning stopped');
    }

    logger.info('Automated Planning Service stopped');
  }
}

module.exports = new AutomatedPlanningService();
