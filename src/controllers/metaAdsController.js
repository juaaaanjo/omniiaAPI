const MetaAdsService = require('../services/metaAdsService');
const MetaAdsData = require('../models/MetaAdsData');
const User = require('../models/User');
const CampaignHistory = require('../models/CampaignHistory');
const logger = require('../utils/logger');
const config = require('../config/env');
const axios = require('axios');

const META_TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000; // Refresh 1 hour before expiry
const metaOAuthUrl = `https://graph.facebook.com/${config.metaAdsApiVersion}/oauth/access_token`;

/**
 * Exchange a short-lived Meta token for a long-lived one
 */
const exchangeForLongLivedToken = async (token) => {
  try {
    const response = await axios.get(metaOAuthUrl, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.metaAdsAppId,
        client_secret: config.metaAdsAppSecret,
        fb_exchange_token: token,
      },
    });

    const { access_token: accessToken, expires_in: expiresIn } = response.data;

    if (!accessToken) {
      throw new Error('Meta did not return an access token');
    }

    const expiresAt = typeof expiresIn === 'number'
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    return { accessToken, expiresAt };
  } catch (error) {
    const metaMessage = error.response?.data?.error?.message || error.message;
    throw new Error(`Meta Ads token exchange failed: ${metaMessage}`);
  }
};

/**
 * Ensure the stored Meta access token is valid, refreshing when near expiry
 */
const ensureMetaAdsAccessToken = async (user, { forceRefresh = false } = {}) => {
  const integration = user.integrations?.metaAds;

  if (!integration?.accessToken) {
    throw new Error('Meta Ads access token not found. Please reconnect the integration.');
  }

  const expiresAtRaw = integration.accessTokenExpiresAt;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  const shouldRefresh = forceRefresh ||
    !expiresAt ||
    expiresAt.getTime() - Date.now() <= META_TOKEN_REFRESH_BUFFER_MS;

  if (!shouldRefresh) {
    return integration.accessToken;
  }

  try {
    const { accessToken, expiresAt: newExpiresAt } = await exchangeForLongLivedToken(integration.accessToken);
    integration.accessToken = accessToken;
    integration.accessTokenExpiresAt = newExpiresAt;
    await user.save();
    logger.info(`Meta Ads access token refreshed for user: ${user.email}`);
    return accessToken;
  } catch (error) {
    logger.error(`Meta Ads token refresh failed for user ${user.email}: ${error.message}`);
    throw new Error('Meta Ads access token expired or invalid. Please reconnect the integration.');
  }
};

/**
 * Wrap Meta API calls to handle token refresh automatically
 */
const performMetaAdsOperation = async (user, operation) => {
  let accessToken = await ensureMetaAdsAccessToken(user);
  let service = new MetaAdsService(accessToken);

  try {
    return await operation(service);
  } catch (error) {
    if (error.code === 'META_ACCESS_TOKEN_EXPIRED') {
      accessToken = await ensureMetaAdsAccessToken(user, { forceRefresh: true });
      service = new MetaAdsService(accessToken);
      return await operation(service);
    }

    throw error;
  }
};

/**
 * Meta Ads Controller
 * Handles Meta Ads OAuth and operations
 */

/**
 * Initiate Meta OAuth flow
 * @route GET /api/meta-ads/oauth/init
 */
exports.initiateOAuth = async (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta-ads/oauth/callback`;

    const authUrl = `https://www.facebook.com/${config.metaAdsApiVersion}/dialog/oauth?` +
      `client_id=${config.metaAdsAppId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=ads_read,ads_management,business_management&` +
      `state=${req.user._id}`; // Pass user ID as state for security

    res.json({
      success: true,
      data: {
        authUrl,
      },
    });
  } catch (error) {
    logger.error(`Meta OAuth init error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error initiating Meta OAuth',
      error: error.message,
    });
  }
};

/**
 * Handle Meta OAuth callback
 * @route GET /api/meta-ads/oauth/callback
 */
exports.handleOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code not provided',
      });
    }

    const userId = state;

    // Exchange code for access token
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta-ads/oauth/callback`;

    const tokenResponse = await axios.get(metaOAuthUrl, {
      params: {
        client_id: config.metaAdsAppId,
        client_secret: config.metaAdsAppSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    const { access_token: shortLivedToken } = tokenResponse.data;

    if (!shortLivedToken) {
      throw new Error('Failed to obtain access token');
    }

    // Exchange for a long-lived token (60-day token)
    const { accessToken: longLivedToken, expiresAt } = await exchangeForLongLivedToken(shortLivedToken);

    // Get user's ad accounts
    const metaAdsService = new MetaAdsService(longLivedToken);
    const adAccounts = await metaAdsService.getAdAccounts();

    if (adAccounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No ad accounts found for this user',
      });
    }

    // Use the first ad account (or let user select later)
    const primaryAccount = adAccounts[0];

    // Update user with Meta Ads credentials
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.integrations.metaAds = {
      connected: true,
      accessToken: longLivedToken,
      accessTokenExpiresAt: expiresAt,
      accountId: primaryAccount.id,
      accountName: primaryAccount.name,
      lastSync: null,
    };

    await user.save();

    logger.info(`Meta Ads connected for user: ${user.email}`);

    // Redirect to frontend with success
    res.redirect(`${config.frontendUrl}/dashboard?meta_ads_connected=true`);
  } catch (error) {
    logger.error(`Meta OAuth callback error: ${error.message}`);
    res.redirect(`${config.frontendUrl}/dashboard?meta_ads_connected=false&error=${encodeURIComponent(error.message)}`);
  }
};

/**
 * Get user's ad accounts
 * @route GET /api/meta-ads/accounts
 */
exports.getAdAccounts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const accounts = await performMetaAdsOperation(
      user,
      (service) => service.getAdAccounts()
    );

    res.json({
      success: true,
      data: {
        accounts,
      },
    });
  } catch (error) {
    logger.error(`Get ad accounts error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching ad accounts',
      error: error.message,
    });
  }
};

/**
 * Get campaigns for connected account
 * @route GET /api/meta-ads/campaigns
 */
exports.getCampaigns = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const campaigns = await performMetaAdsOperation(
      user,
      (service) => service.getCampaigns(
        user.integrations.metaAds.accountId,
        req.query
      )
    );

    res.json({
      success: true,
      data: {
        campaigns,
      },
    });
  } catch (error) {
    logger.error(`Get campaigns error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaigns',
      error: error.message,
    });
  }
};

/**
 * Get campaign insights
 * @route GET /api/meta-ads/campaigns/:campaignId/insights
 */
exports.getCampaignInsights = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const insights = await performMetaAdsOperation(
      user,
      (service) => service.getCampaignInsights(campaignId, startDate, endDate)
    );

    res.json({
      success: true,
      data: {
        insights,
      },
    });
  } catch (error) {
    logger.error(`Get campaign insights error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaign insights',
      error: error.message,
    });
  }
};

/**
 * Sync Meta Ads data to database
 * @route POST /api/meta-ads/sync
 */
exports.syncData = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const result = await performMetaAdsOperation(
      user,
      (service) => service.syncToDatabase(
        req.user._id,
        user.integrations.metaAds.accountId,
        startDate,
        endDate
      )
    );

    // Update last sync time
    user.integrations.metaAds.lastSync = new Date();
    await user.save();

    logger.info(`Meta Ads data synced for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Meta Ads data synced successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`Sync Meta Ads error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error syncing Meta Ads data',
      error: error.message,
    });
  }
};

/**
 * Get synced Meta Ads data from database
 * @route GET /api/meta-ads/data
 */
exports.getData = async (req, res) => {
  try {
    const { startDate, endDate, campaignId, format } = req.query;

    const query = {
      userId: req.user._id,
    };

    if (startDate && endDate) {
      query.dateStart = { $gte: new Date(startDate) };
      query.dateStop = { $lte: new Date(endDate) };
    }

    if (campaignId) {
      query.campaignId = campaignId;
    }

    const data = await MetaAdsData.find(query).sort({ dateStart: -1 });

    // Format data for better readability if requested
    let formattedData = data;
    if (format === 'summary') {
      formattedData = data.map(record => ({
        id: record._id,
        date: record.dateStart,
        campaignId: record.campaignId,
        campaignName: record.campaignName,
        status: record.status,
        metrics: {
          spend: record.spend,
          impressions: record.impressions,
          clicks: record.clicks,
          reach: record.reach,
          ctr: parseFloat(record.ctr.toFixed(2)),
          cpc: parseFloat(record.cpc.toFixed(2)),
          cpm: parseFloat(record.cpm.toFixed(2)),
        },
        attribution: record.attribution || {
          sales: 0,
          revenue: 0,
          roas: 0,
        },
      }));
    }

    // Calculate totals
    const totals = data.reduce((acc, record) => ({
      totalSpend: acc.totalSpend + (record.spend || 0),
      totalImpressions: acc.totalImpressions + (record.impressions || 0),
      totalClicks: acc.totalClicks + (record.clicks || 0),
      totalReach: acc.totalReach + (record.reach || 0),
      totalRevenue: acc.totalRevenue + (record.attribution?.revenue || 0),
      totalSales: acc.totalSales + (record.attribution?.sales || 0),
    }), {
      totalSpend: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalReach: 0,
      totalRevenue: 0,
      totalSales: 0,
    });

    // Calculate overall metrics
    totals.averageCtr = totals.totalImpressions > 0
      ? parseFloat(((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2))
      : 0;
    totals.averageCpc = totals.totalClicks > 0
      ? parseFloat((totals.totalSpend / totals.totalClicks).toFixed(2))
      : 0;
    totals.averageCpm = totals.totalImpressions > 0
      ? parseFloat(((totals.totalSpend / totals.totalImpressions) * 1000).toFixed(2))
      : 0;
    totals.overallRoas = totals.totalSpend > 0
      ? parseFloat((totals.totalRevenue / totals.totalSpend).toFixed(2))
      : 0;

    res.json({
      success: true,
      data: {
        records: formattedData,
        count: data.length,
        totals,
      },
    });
  } catch (error) {
    logger.error(`Get Meta Ads data error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching Meta Ads data',
      error: error.message,
    });
  }
};

/**
 * Get campaign summary
 * @route GET /api/meta-ads/summary
 */
exports.getSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }

    const summary = await MetaAdsData.getCampaignSummary(
      req.user._id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        summary,
      },
    });
  } catch (error) {
    logger.error(`Get Meta Ads summary error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching Meta Ads summary',
      error: error.message,
    });
  }
};

/**
 * Update campaign
 * @route PUT /api/meta-ads/campaigns/:campaignId
 */
exports.updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const updates = req.body;

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const response = await performMetaAdsOperation(
      user,
      (service) => service.updateCampaign(campaignId, updates)
    );

    logger.info(`Campaign ${campaignId} updated for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: response,
    });
  } catch (error) {
    logger.error(`Update campaign error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating campaign',
      error: error.message,
    });
  }
};

/**
 * Pause campaign with history tracking
 * @route POST /api/meta-ads/campaigns/:campaignId/pause
 */
exports.pauseCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const accountId = user.integrations.metaAds.accountId;

    // Get current campaign state
    const campaigns = await performMetaAdsOperation(
      user,
      (service) => service.getCampaigns(accountId, {
        filtering: JSON.stringify([{ field: 'id', operator: 'EQUAL', value: campaignId }])
      })
    );

    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const currentCampaign = campaigns[0];

    // Check if already paused
    if (currentCampaign.status === 'PAUSED') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is already paused',
      });
    }

    // Store previous state
    const previousState = {
      status: currentCampaign.status,
      dailyBudget: currentCampaign.daily_budget,
      lifetimeBudget: currentCampaign.lifetime_budget,
      objective: currentCampaign.objective,
    };

    // Pause the campaign
    await performMetaAdsOperation(
      user,
      (service) => service.updateCampaign(campaignId, { status: 'PAUSED' })
    );

    // Record in history
    const newState = {
      ...previousState,
      status: 'PAUSED',
    };

    await CampaignHistory.createSnapshot({
      userId: user._id,
      campaignId,
      campaignName: currentCampaign.name,
      accountId,
      action: 'pause',
      triggeredBy: {
        type: 'user',
        source: user.email,
      },
      previousState,
      newState,
      reason: reason || 'Manually paused by user',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`Campaign ${campaignId} paused by user: ${user.email}`);

    res.json({
      success: true,
      message: 'Campaign paused successfully',
      data: {
        campaignId,
        previousStatus: previousState.status,
        newStatus: 'PAUSED',
      },
    });
  } catch (error) {
    logger.error(`Pause campaign error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error pausing campaign',
      error: error.message,
    });
  }
};

/**
 * Activate/Resume campaign with history tracking
 * @route POST /api/meta-ads/campaigns/:campaignId/activate
 */
exports.activateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    const accountId = user.integrations.metaAds.accountId;

    // Get current campaign state
    const campaigns = await performMetaAdsOperation(
      user,
      (service) => service.getCampaigns(accountId, {
        filtering: JSON.stringify([{ field: 'id', operator: 'EQUAL', value: campaignId }])
      })
    );

    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const currentCampaign = campaigns[0];

    // Check if already active
    if (currentCampaign.status === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is already active',
      });
    }

    // Store previous state
    const previousState = {
      status: currentCampaign.status,
      dailyBudget: currentCampaign.daily_budget,
      lifetimeBudget: currentCampaign.lifetime_budget,
      objective: currentCampaign.objective,
    };

    // Activate the campaign
    await performMetaAdsOperation(
      user,
      (service) => service.updateCampaign(campaignId, { status: 'ACTIVE' })
    );

    // Record in history
    const newState = {
      ...previousState,
      status: 'ACTIVE',
    };

    await CampaignHistory.createSnapshot({
      userId: user._id,
      campaignId,
      campaignName: currentCampaign.name,
      accountId,
      action: 'activate',
      triggeredBy: {
        type: 'user',
        source: user.email,
      },
      previousState,
      newState,
      reason: reason || 'Manually activated by user',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`Campaign ${campaignId} activated by user: ${user.email}`);

    res.json({
      success: true,
      message: 'Campaign activated successfully',
      data: {
        campaignId,
        previousStatus: previousState.status,
        newStatus: 'ACTIVE',
      },
    });
  } catch (error) {
    logger.error(`Activate campaign error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error activating campaign',
      error: error.message,
    });
  }
};

/**
 * Rollback campaign to previous state
 * @route POST /api/meta-ads/campaigns/:campaignId/rollback
 */
exports.rollbackCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { historyId } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.integrations.metaAds.connected) {
      return res.status(400).json({
        success: false,
        message: 'Meta Ads not connected',
      });
    }

    // Get the history entry to rollback to
    let historyEntry;
    if (historyId) {
      // Rollback to specific history entry
      historyEntry = await CampaignHistory.findOne({
        _id: historyId,
        userId: user._id,
        campaignId,
        canRollback: true,
        rolledBackAt: null,
      });
    } else {
      // Rollback to most recent rollback-able entry
      historyEntry = await CampaignHistory.findOne({
        userId: user._id,
        campaignId,
        canRollback: true,
        rolledBackAt: null,
      }).sort({ executedAt: -1 });
    }

    if (!historyEntry) {
      return res.status(404).json({
        success: false,
        message: 'No rollback-able history entry found',
      });
    }

    const accountId = user.integrations.metaAds.accountId;
    const previousState = historyEntry.previousState;

    // Get current campaign state
    const campaigns = await performMetaAdsOperation(
      user,
      (service) => service.getCampaigns(accountId, {
        filtering: JSON.stringify([{ field: 'id', operator: 'EQUAL', value: campaignId }])
      })
    );

    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const currentCampaign = campaigns[0];

    // Store current state before rollback
    const currentState = {
      status: currentCampaign.status,
      dailyBudget: currentCampaign.daily_budget,
      lifetimeBudget: currentCampaign.lifetime_budget,
      objective: currentCampaign.objective,
    };

    // Rollback to previous state
    const updates = {};
    if (previousState.status) updates.status = previousState.status;
    if (previousState.dailyBudget) updates.daily_budget = previousState.dailyBudget;
    if (previousState.lifetimeBudget) updates.lifetime_budget = previousState.lifetimeBudget;

    await performMetaAdsOperation(
      user,
      (service) => service.updateCampaign(campaignId, updates)
    );

    // Mark the original entry as rolled back
    await historyEntry.markAsRolledBack(user.email);

    // Record the rollback in history
    await CampaignHistory.createSnapshot({
      userId: user._id,
      campaignId,
      campaignName: historyEntry.campaignName,
      accountId,
      action: 'rollback',
      triggeredBy: {
        type: 'user',
        source: user.email,
      },
      previousState: currentState,
      newState: previousState,
      reason: `Rolled back to state from ${historyEntry.executedAt.toISOString()}`,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        rolledBackHistoryId: historyEntry._id,
      },
    });

    logger.info(`Campaign ${campaignId} rolled back by user: ${user.email}`);

    res.json({
      success: true,
      message: 'Campaign rolled back successfully',
      data: {
        campaignId,
        rolledBackTo: historyEntry.executedAt,
        previousState: currentState,
        newState: previousState,
      },
    });
  } catch (error) {
    logger.error(`Rollback campaign error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error rolling back campaign',
      error: error.message,
    });
  }
};

/**
 * Get campaign history
 * @route GET /api/meta-ads/campaigns/:campaignId/history
 */
exports.getCampaignHistory = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;

    const user = await User.findById(req.user._id);

    const history = await CampaignHistory.getCampaignTimeline(
      user._id,
      campaignId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        history: history.slice(0, parseInt(limit)),
        total: history.length,
      },
    });
  } catch (error) {
    logger.error(`Get campaign history error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaign history',
      error: error.message,
    });
  }
};
