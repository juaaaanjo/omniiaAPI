const MetaAdsService = require('../services/metaAdsService');
const MetaAdsData = require('../models/MetaAdsData');
const User = require('../models/User');
const logger = require('../utils/logger');
const config = require('../config/env');
const axios = require('axios');

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

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
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

    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: config.metaAdsAppId,
        client_secret: config.metaAdsAppSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Failed to obtain access token');
    }

    // Get user's ad accounts
    const metaAdsService = new MetaAdsService(access_token);
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
      accessToken: access_token,
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

    const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
    const accounts = await metaAdsService.getAdAccounts();

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

    const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
    const campaigns = await metaAdsService.getCampaigns(
      user.integrations.metaAds.accountId,
      req.query
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

    const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
    const insights = await metaAdsService.getCampaignInsights(campaignId, startDate, endDate);

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

    const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);
    const result = await metaAdsService.syncToDatabase(
      req.user._id,
      user.integrations.metaAds.accountId,
      startDate,
      endDate
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

    const metaAdsService = new MetaAdsService(user.integrations.metaAds.accessToken);

    // Update campaign via Meta API
    const response = await metaAdsService.updateCampaign(campaignId, updates);

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
