const Alert = require('../models/Alert');
const AlertAgent = require('../agents/AlertAgent');
const automatedAlertService = require('../services/automatedAlertService');
const logger = require('../utils/logger');

/**
 * Alert Controller (EIO - Inteligencia Operativa)
 * Manages operational intelligence alerts
 */

/**
 * Get all alerts for user
 * @route GET /api/eio/alerts
 */
exports.getAllAlerts = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      status,
      category,
      severity,
      limit = 50,
      page = 1,
    } = req.query;

    const query = { userId };

    if (status) query.status = status;
    if (category) query.category = category;
    if (severity) query.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [alerts, total] = await Promise.all([
      Alert.find(query)
        .sort({ severity: -1, createdAt: -1 }) // Critical first
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Alert.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error(`Get all alerts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching alerts',
      error: error.message,
    });
  }
};

/**
 * Get pending alerts
 * @route GET /api/eio/alerts/pending
 */
exports.getPendingAlerts = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 50;

    const alerts = await Alert.getPendingAlerts(userId, limit);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    logger.error(`Get pending alerts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending alerts',
      error: error.message,
    });
  }
};

/**
 * Get alert summary
 * @route GET /api/eio/alerts/summary
 */
exports.getAlertSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    const summary = await Alert.getAlertSummary(userId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error(`Get alert summary error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching alert summary',
      error: error.message,
    });
  }
};

/**
 * Get alert by ID
 * @route GET /api/eio/alerts/:id
 */
exports.getAlertById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const alert = await Alert.findOne({ _id: id, userId })
      .populate('relatedPlanId')
      .populate('relatedForecastId')
      .populate('relatedGuardrailId');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    // Mark as viewed
    await alert.markAsViewed(userId);

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error(`Get alert by ID error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching alert',
      error: error.message,
    });
  }
};

/**
 * Apply alert action
 * @route POST /api/eio/alerts/:id/apply
 */
exports.applyAlert = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { actionId, notes, createPlan = false } = req.body;

    const alert = await Alert.findOne({ _id: id, userId });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    if (alert.status !== 'pending' && alert.status !== 'in_review') {
      return res.status(400).json({
        success: false,
        message: 'Alert cannot be applied in current status',
      });
    }

    // Apply specific action or all actions
    if (actionId) {
      await alert.applyAction(actionId, userId);
    } else {
      // Apply all actions
      alert.recommendedActions.forEach(action => {
        if (!action.applied) {
          action.applied = true;
          action.appliedAt = new Date();
          action.appliedBy = userId;
        }
      });
      alert.status = 'applied';
      alert.actionTakenBy = userId;
      await alert.save();
    }

    if (notes) {
      alert.userNotes = notes;
      await alert.save();
    }

    // TODO: If createPlan is true, create a plan based on this alert
    let planCreated = null;
    if (createPlan) {
      // const PlanningAgent = require('../agents/PlanningAgent');
      // planCreated = await new PlanningAgent().generatePlanFromAlert(userId, alert);
    }

    logger.info(`Alert ${id} applied by user ${userId}`);

    res.json({
      success: true,
      message: 'Action applied successfully',
      data: {
        alert,
        planCreated,
        actionsExecuted: alert.recommendedActions.filter(a => a.applied).map(a => a.title),
      },
    });
  } catch (error) {
    logger.error(`Apply alert error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error applying alert action',
      error: error.message,
    });
  }
};

/**
 * Ignore alert
 * @route POST /api/eio/alerts/:id/ignore
 */
exports.ignoreAlert = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { reason = '', ignoreForDays = 0 } = req.body;

    const alert = await Alert.findOne({ _id: id, userId });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    await alert.ignore(userId, reason, ignoreForDays);

    logger.info(`Alert ${id} ignored by user ${userId}`);

    res.json({
      success: true,
      message: 'Alert ignored',
      data: alert,
    });
  } catch (error) {
    logger.error(`Ignore alert error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error ignoring alert',
      error: error.message,
    });
  }
};

/**
 * Mark alert for review
 * @route POST /api/eio/alerts/:id/review
 */
exports.markForReview = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { notes = '' } = req.body;

    const alert = await Alert.findOne({ _id: id, userId });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    await alert.markForReview(userId, notes);

    logger.info(`Alert ${id} marked for review by user ${userId}`);

    res.json({
      success: true,
      message: 'Alert marked for review',
      data: alert,
    });
  } catch (error) {
    logger.error(`Mark for review error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error marking alert for review',
      error: error.message,
    });
  }
};

/**
 * Resolve alert
 * @route POST /api/eio/alerts/:id/resolve
 */
exports.resolveAlert = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { notes = '' } = req.body;

    const alert = await Alert.findOne({ _id: id, userId });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    await alert.resolve(userId, notes);

    logger.info(`Alert ${id} resolved by user ${userId}`);

    res.json({
      success: true,
      message: 'Alert resolved',
      data: alert,
    });
  } catch (error) {
    logger.error(`Resolve alert error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error resolving alert',
      error: error.message,
    });
  }
};

/**
 * Get daily insights
 * @route GET /api/eio/insights/daily
 */
exports.getDailyInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const userLanguage = req.user.language || 'es';

    // Get recent alerts
    const recentAlerts = await Alert.find({
      userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).limit(10);

    // Get summary data
    const summary = await Alert.getAlertSummary(userId);

    // Build insights data
    const insightsData = {
      recentAlerts: recentAlerts.length,
      criticalAlerts: summary.critical,
      pendingAlerts: summary.pending,
      resolvedToday: recentAlerts.filter(a => a.status === 'resolved').length,
    };

    const alertAgent = new AlertAgent();
    const insights = await alertAgent.generateDailyInsights(userId, insightsData, userLanguage);

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.error(`Get daily insights error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily insights',
      error: error.message,
    });
  }
};

/**
 * Get alerts by category
 * @route GET /api/eio/alerts/by-category
 */
exports.getAlertsByCategory = async (req, res) => {
  try {
    const userId = req.user._id;

    const categories = await Alert.getAlertsByCategory(userId);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error(`Get alerts by category error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching alerts by category',
      error: error.message,
    });
  }
};

/**
 * Trigger manual check
 * @route POST /api/eio/check
 */
exports.triggerCheck = async (req, res) => {
  try {
    const userId = req.user._id;

    await automatedAlertService.triggerManualCheck(userId);

    logger.info(`Manual alert check triggered for user ${userId}`);

    res.json({
      success: true,
      message: 'System check triggered. New alerts will appear if issues detected.',
      data: {
        categoriesChecked: ['roas', 'revenue', 'campaigns'],
      },
    });
  } catch (error) {
    logger.error(`Trigger check error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error triggering system check',
      error: error.message,
    });
  }
};

/**
 * Bulk apply actions
 * @route POST /api/eio/alerts/bulk-apply
 */
exports.bulkApply = async (req, res) => {
  try {
    const userId = req.user._id;
    const { alertIds, notes = '' } = req.body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'alertIds array is required',
      });
    }

    let applied = 0;
    let failed = 0;

    for (const alertId of alertIds) {
      try {
        const alert = await Alert.findOne({ _id: alertId, userId });

        if (alert && (alert.status === 'pending' || alert.status === 'in_review')) {
          alert.recommendedActions.forEach(action => {
            if (!action.applied) {
              action.applied = true;
              action.appliedAt = new Date();
              action.appliedBy = userId;
            }
          });
          alert.status = 'applied';
          alert.actionTakenBy = userId;
          if (notes) alert.userNotes = notes;
          await alert.save();
          applied++;
        }
      } catch (error) {
        logger.error(`Error applying alert ${alertId}: ${error.message}`);
        failed++;
      }
    }

    logger.info(`Bulk apply: ${applied} alerts applied, ${failed} failed by user ${userId}`);

    res.json({
      success: true,
      message: `${applied} alerts processed`,
      data: {
        applied,
        failed,
      },
    });
  } catch (error) {
    logger.error(`Bulk apply error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk apply',
      error: error.message,
    });
  }
};

/**
 * Export alert report
 * @route GET /api/eio/alerts/report
 */
exports.exportReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, format = 'json' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }

    const alerts = await Alert.find({
      userId,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    }).sort({ createdAt: -1 });

    const reportData = {
      period: { startDate, endDate },
      totalAlerts: alerts.length,
      byStatus: {
        pending: alerts.filter(a => a.status === 'pending').length,
        applied: alerts.filter(a => a.status === 'applied').length,
        ignored: alerts.filter(a => a.status === 'ignored').length,
        inReview: alerts.filter(a => a.status === 'in_review').length,
        resolved: alerts.filter(a => a.status === 'resolved').length,
      },
      byCategory: {},
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length,
      },
      alerts,
    };

    // Count by category
    alerts.forEach(alert => {
      reportData.byCategory[alert.category] = (reportData.byCategory[alert.category] || 0) + 1;
    });

    if (format === 'email') {
      // TODO: Send report via email
      return res.json({
        success: true,
        message: 'Report will be sent to your email',
        data: { emailSent: false },
      });
    }

    res.json({
      success: true,
      message: 'Report generated',
      data: reportData,
    });
  } catch (error) {
    logger.error(`Export report error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating report',
      error: error.message,
    });
  }
};
