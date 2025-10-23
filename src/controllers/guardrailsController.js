const CampaignGuardrail = require('../models/CampaignGuardrail');
const User = require('../models/User');
const campaignMonitoringService = require('../services/campaignMonitoringService');
const logger = require('../utils/logger');

/**
 * Create or update a guardrail for a campaign
 * @route POST /api/guardrails
 */
exports.createGuardrail = async (req, res) => {
  try {
    const {
      campaignId,
      campaignName,
      accountId,
      rules,
      autoActions,
      monitoring,
      notifications,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    // Check if guardrail already exists
    let guardrail = await CampaignGuardrail.findOne({
      userId: user._id,
      campaignId,
    });

    if (guardrail) {
      // Update existing guardrail
      if (rules) guardrail.rules = { ...guardrail.rules, ...rules };
      if (autoActions) guardrail.autoActions = { ...guardrail.autoActions, ...autoActions };
      if (monitoring) guardrail.monitoring = { ...guardrail.monitoring, ...monitoring };
      if (notifications) guardrail.notifications = { ...guardrail.notifications, ...notifications };
      if (campaignName) guardrail.campaignName = campaignName;

      await guardrail.save();

      logger.info(`Guardrail updated for campaign ${campaignId} by user: ${user.email}`);

      return res.json({
        success: true,
        message: 'Guardrail updated successfully',
        data: { guardrail },
      });
    }

    // Create new guardrail
    guardrail = new CampaignGuardrail({
      userId: user._id,
      campaignId,
      campaignName,
      accountId: accountId || user.integrations.metaAds.accountId,
      rules: rules || {},
      autoActions: autoActions || {
        autoPause: false,
        alertOnly: true,
        requireConfirmation: false,
      },
      monitoring: monitoring || {
        enabled: true,
        checkInterval: 15,
        evaluationWindow: 24,
        minDataPoints: 10,
      },
      notifications: notifications || {
        email: true,
        webhook: null,
      },
    });

    await guardrail.save();

    logger.info(`Guardrail created for campaign ${campaignId} by user: ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'Guardrail created successfully',
      data: { guardrail },
    });
  } catch (error) {
    logger.error(`Create guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error creating guardrail',
      error: error.message,
    });
  }
};

/**
 * Get all guardrails for the authenticated user
 * @route GET /api/guardrails
 */
exports.getGuardrails = async (req, res) => {
  try {
    const { status, campaignId } = req.query;

    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (campaignId) query.campaignId = campaignId;

    const guardrails = await CampaignGuardrail.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        guardrails,
        total: guardrails.length,
      },
    });
  } catch (error) {
    logger.error(`Get guardrails error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching guardrails',
      error: error.message,
    });
  }
};

/**
 * Get a specific guardrail
 * @route GET /api/guardrails/:id
 */
exports.getGuardrail = async (req, res) => {
  try {
    const { id } = req.params;

    const guardrail = await CampaignGuardrail.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!guardrail) {
      return res.status(404).json({
        success: false,
        message: 'Guardrail not found',
      });
    }

    res.json({
      success: true,
      data: { guardrail },
    });
  } catch (error) {
    logger.error(`Get guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching guardrail',
      error: error.message,
    });
  }
};

/**
 * Update a guardrail
 * @route PUT /api/guardrails/:id
 */
exports.updateGuardrail = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const guardrail = await CampaignGuardrail.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!guardrail) {
      return res.status(404).json({
        success: false,
        message: 'Guardrail not found',
      });
    }

    // Update fields
    if (updates.rules) guardrail.rules = { ...guardrail.rules, ...updates.rules };
    if (updates.autoActions) guardrail.autoActions = { ...guardrail.autoActions, ...updates.autoActions };
    if (updates.monitoring) guardrail.monitoring = { ...guardrail.monitoring, ...updates.monitoring };
    if (updates.notifications) guardrail.notifications = { ...guardrail.notifications, ...updates.notifications };
    if (updates.status) guardrail.status = updates.status;
    if (updates.campaignName) guardrail.campaignName = updates.campaignName;

    await guardrail.save();

    logger.info(`Guardrail ${id} updated by user: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Guardrail updated successfully',
      data: { guardrail },
    });
  } catch (error) {
    logger.error(`Update guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating guardrail',
      error: error.message,
    });
  }
};

/**
 * Delete a guardrail
 * @route DELETE /api/guardrails/:id
 */
exports.deleteGuardrail = async (req, res) => {
  try {
    const { id } = req.params;

    const guardrail = await CampaignGuardrail.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!guardrail) {
      return res.status(404).json({
        success: false,
        message: 'Guardrail not found',
      });
    }

    logger.info(`Guardrail ${id} deleted by user: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Guardrail deleted successfully',
    });
  } catch (error) {
    logger.error(`Delete guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting guardrail',
      error: error.message,
    });
  }
};

/**
 * Manually trigger a guardrail check for a campaign
 * @route POST /api/guardrails/:id/check
 */
exports.checkGuardrail = async (req, res) => {
  try {
    const { id } = req.params;

    const guardrail = await CampaignGuardrail.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!guardrail) {
      return res.status(404).json({
        success: false,
        message: 'Guardrail not found',
      });
    }

    // Manually check this guardrail
    const result = await campaignMonitoringService.checkGuardrail(guardrail);

    logger.info(`Manual guardrail check for campaign ${guardrail.campaignId} by user: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Guardrail check completed',
      data: result,
    });
  } catch (error) {
    logger.error(`Check guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error checking guardrail',
      error: error.message,
    });
  }
};

/**
 * Enable/disable a guardrail
 * @route PATCH /api/guardrails/:id/toggle
 */
exports.toggleGuardrail = async (req, res) => {
  try {
    const { id } = req.params;

    const guardrail = await CampaignGuardrail.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!guardrail) {
      return res.status(404).json({
        success: false,
        message: 'Guardrail not found',
      });
    }

    // Toggle monitoring enabled status
    guardrail.monitoring.enabled = !guardrail.monitoring.enabled;
    await guardrail.save();

    const status = guardrail.monitoring.enabled ? 'enabled' : 'disabled';
    logger.info(`Guardrail ${id} ${status} by user: ${req.user.email}`);

    res.json({
      success: true,
      message: `Guardrail ${status} successfully`,
      data: {
        guardrail,
        enabled: guardrail.monitoring.enabled,
      },
    });
  } catch (error) {
    logger.error(`Toggle guardrail error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error toggling guardrail',
      error: error.message,
    });
  }
};
