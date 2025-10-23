const express = require('express');
const router = express.Router();
const metaAdsController = require('../controllers/metaAdsController');
const { protect } = require('../middleware/auth');

/**
 * Meta Ads Routes
 * All routes require authentication except OAuth callback
 */

/**
 * @route   GET /api/meta-ads/oauth/init
 * @desc    Initiate Meta OAuth flow
 * @access  Private
 */
router.get('/oauth/init', protect, metaAdsController.initiateOAuth);

/**
 * @route   GET /api/meta-ads/oauth/callback
 * @desc    Handle Meta OAuth callback
 * @access  Public (handled by Meta)
 */
router.get('/oauth/callback', metaAdsController.handleOAuthCallback);

/**
 * @route   GET /api/meta-ads/accounts
 * @desc    Get user's ad accounts
 * @access  Private
 */
router.get('/accounts', protect, metaAdsController.getAdAccounts);

/**
 * @route   GET /api/meta-ads/campaigns
 * @desc    Get campaigns for connected account
 * @access  Private
 */
router.get('/campaigns', protect, metaAdsController.getCampaigns);

/**
 * @route   GET /api/meta-ads/campaigns/:campaignId/insights
 * @desc    Get campaign insights
 * @access  Private
 */
router.get('/campaigns/:campaignId/insights', protect, metaAdsController.getCampaignInsights);

/**
 * @route   PUT /api/meta-ads/campaigns/:campaignId
 * @desc    Update campaign
 * @access  Private
 */
router.put('/campaigns/:campaignId', protect, metaAdsController.updateCampaign);

/**
 * @route   POST /api/meta-ads/campaigns/:campaignId/pause
 * @desc    Pause campaign with history tracking
 * @access  Private
 */
router.post('/campaigns/:campaignId/pause', protect, metaAdsController.pauseCampaign);

/**
 * @route   POST /api/meta-ads/campaigns/:campaignId/activate
 * @desc    Activate/resume campaign with history tracking
 * @access  Private
 */
router.post('/campaigns/:campaignId/activate', protect, metaAdsController.activateCampaign);

/**
 * @route   POST /api/meta-ads/campaigns/:campaignId/rollback
 * @desc    Rollback campaign to previous state
 * @access  Private
 */
router.post('/campaigns/:campaignId/rollback', protect, metaAdsController.rollbackCampaign);

/**
 * @route   GET /api/meta-ads/campaigns/:campaignId/history
 * @desc    Get campaign history
 * @access  Private
 */
router.get('/campaigns/:campaignId/history', protect, metaAdsController.getCampaignHistory);

/**
 * @route   POST /api/meta-ads/sync
 * @desc    Sync Meta Ads data to database
 * @access  Private
 */
router.post('/sync', protect, metaAdsController.syncData);

/**
 * @route   GET /api/meta-ads/data
 * @desc    Get synced Meta Ads data from database
 * @access  Private
 */
router.get('/data', protect, metaAdsController.getData);

/**
 * @route   GET /api/meta-ads/summary
 * @desc    Get campaign summary
 * @access  Private
 */
router.get('/summary', protect, metaAdsController.getSummary);

module.exports = router;
