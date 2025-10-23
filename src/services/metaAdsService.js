const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');
const MetaAdsData = require('../models/MetaAdsData');

/**
 * Meta Ads API Service
 * Handles integration with Facebook/Instagram Ads
 */
class MetaAdsService {
  constructor(accessToken) {
    this.accessToken = accessToken || config.metaAdsAccessToken;
    this.apiVersion = config.metaAdsApiVersion;
    this.baseURL = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Format date to YYYY-MM-DD format required by Meta Ads API
   */
  formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Ensure account ID has the 'act_' prefix required by Meta Ads API
   */
  formatAccountId(accountId) {
    if (!accountId) return accountId;
    // If already has act_ prefix, return as is
    if (accountId.toString().startsWith('act_')) {
      return accountId;
    }
    // Add act_ prefix
    return `act_${accountId}`;
  }

  /**
   * Make API request to Meta Ads
   */
  async makeRequest(endpoint, params = {}, method = 'GET') {
    try {
      const config = {
        method,
        url: `${this.baseURL}/${endpoint}`,
      };

      if (method === 'GET') {
        config.params = {
          access_token: this.accessToken,
          ...params,
        };
      } else {
        // For POST, PUT, DELETE requests
        config.data = params;
        config.params = {
          access_token: this.accessToken,
        };
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`Meta Ads API error: ${error.message}`);

      if (error.response) {
        logger.error(`Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        throw new Error(`Meta Ads API error: ${error.response.data.error?.message || error.message}`);
      }

      throw error;
    }
  }

  /**
   * Get ad accounts for the authenticated user
   */
  async getAdAccounts() {
    try {
      const data = await this.makeRequest('me/adaccounts', {
        fields: 'id,name,account_status,currency,timezone_name',
      });

      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching ad accounts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get campaigns for an ad account
   */
  async getCampaigns(accountId, params = {}) {
    try {
      const formattedAccountId = this.formatAccountId(accountId);
      const data = await this.makeRequest(`${formattedAccountId}/campaigns`, {
        fields: 'id,name,objective,status,daily_budget,lifetime_budget',
        ...params,
      });

      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching campaigns: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get insights for a campaign
   */
  async getCampaignInsights(campaignId, startDate, endDate) {
    try {
      const data = await this.makeRequest(`${campaignId}/insights`, {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,conversions,conversion_values,cost_per_conversion',
        time_range: JSON.stringify({
          since: this.formatDate(startDate),
          until: this.formatDate(endDate),
        }),
        time_increment: 1, // Daily breakdown
      });

      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching campaign insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get insights for all campaigns in an account
   */
  async getAccountInsights(accountId, startDate, endDate) {
    try {
      const formattedAccountId = this.formatAccountId(accountId);

      // Validate and adjust dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      // Ensure end date is not in the future
      if (end > today) {
        logger.warn(`End date ${endDate} is in the future, adjusting to today`);
        end.setTime(today.getTime());
      }

      // Calculate date range in days
      const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));

      // Meta Ads API has limits on date ranges - enforce max 90 days
      if (daysDiff > 90) {
        const errorMsg = `Date range too large (${daysDiff} days). Meta Ads API limits to 90 days maximum. Please use a smaller date range.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Ensure start date is not too far in the past (Meta typically keeps 37 months)
      const maxDaysBack = 1095; // ~3 years
      const daysBack = Math.floor((today - start) / (1000 * 60 * 60 * 24));
      if (daysBack > maxDaysBack) {
        logger.warn(`Start date is ${daysBack} days ago. Meta Ads typically limits historical data to ~3 years.`);
      }

      const formattedStartDate = this.formatDate(start);
      const formattedEndDate = this.formatDate(end);

      logger.info(`Fetching insights for account: ${formattedAccountId}, dates: ${formattedStartDate} to ${formattedEndDate} (${daysDiff} days)`);

      // Try with date_preset first for smaller ranges (more reliable)
      let timeRangeParam;
      if (daysDiff <= 7) {
        timeRangeParam = { date_preset: 'last_7d' };
        logger.info('Using date_preset: last_7d');
      } else if (daysDiff <= 30) {
        timeRangeParam = { date_preset: 'last_30d' };
        logger.info('Using date_preset: last_30d');
      } else {
        // For custom ranges, use time_range
        timeRangeParam = {
          time_range: JSON.stringify({
            since: formattedStartDate,
            until: formattedEndDate,
          })
        };
      }

      // Use basic fields first - some accounts may not have all conversion tracking set up
      const data = await this.makeRequest(`${formattedAccountId}/insights`, {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,date_start,date_stop,actions,action_values',
        level: 'campaign',
        ...timeRangeParam,
        time_increment: 1,
        limit: 500,
      });

      logger.info(`Fetched ${data.data?.length || 0} insight records`);
      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching account insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync Meta Ads data to database
   */
  async syncToDatabase(userId, accountId, startDate, endDate) {
    try {
      logger.info(`Syncing Meta Ads data for user ${userId}, account ${accountId}`);

      // Fetch insights
      const insights = await this.getAccountInsights(accountId, startDate, endDate);

      // Fetch campaign details to get status
      logger.info('Fetching campaign details for status information');
      const campaigns = await this.getCampaigns(accountId);

      // Create a map of campaign statuses
      const campaignStatusMap = {};
      campaigns.forEach(campaign => {
        campaignStatusMap[campaign.id] = campaign.status;
      });

      let syncedCount = 0;
      let errorCount = 0;

      for (const insight of insights) {
        try {
          // Calculate derived metrics if we have the basic data
          const spend = parseFloat(insight.spend || 0);
          const impressions = parseInt(insight.impressions || 0);
          const clicks = parseInt(insight.clicks || 0);

          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;

          // Extract conversions from actions if available
          let conversions = 0;
          let conversionValue = 0;
          if (insight.actions) {
            const conversionAction = insight.actions.find(a =>
              a.action_type === 'purchase' ||
              a.action_type === 'omni_purchase' ||
              a.action_type === 'offsite_conversion.fb_pixel_purchase'
            );
            if (conversionAction) {
              conversions = parseInt(conversionAction.value || 0);
            }
          }
          if (insight.action_values) {
            const conversionValueAction = insight.action_values.find(a =>
              a.action_type === 'purchase' ||
              a.action_type === 'omni_purchase' ||
              a.action_type === 'offsite_conversion.fb_pixel_purchase'
            );
            if (conversionValueAction) {
              conversionValue = parseFloat(conversionValueAction.value || 0);
            }
          }

          const metaAdsData = {
            userId,
            accountId,
            campaignId: insight.campaign_id,
            campaignName: insight.campaign_name,
            // Campaign status from campaigns API
            status: campaignStatusMap[insight.campaign_id] || 'ACTIVE',
            // Optional fields - may not be present in all responses
            adSetId: insight.adset_id || null,
            adSetName: insight.adset_name || null,
            adId: insight.ad_id || null,
            adName: insight.ad_name || null,
            // Basic metrics
            spend,
            impressions,
            clicks,
            reach: parseInt(insight.reach || 0),
            // Calculated metrics
            ctr,
            cpm,
            cpc,
            frequency: 0, // Not available in basic request
            // Conversion fields - extracted from actions
            conversions,
            conversionValue,
            costPerConversion: conversions > 0 ? spend / conversions : 0,
            dateStart: new Date(insight.date_start),
            dateStop: new Date(insight.date_stop),
            rawData: insight,
          };

          // Upsert: update if exists, create if not
          await MetaAdsData.findOneAndUpdate(
            {
              userId,
              campaignId: insight.campaign_id,
              dateStart: new Date(insight.date_start),
              dateStop: new Date(insight.date_stop),
            },
            metaAdsData,
            { upsert: true, new: true }
          );

          syncedCount++;
        } catch (error) {
          logger.error(`Error syncing insight: ${error.message}`);
          errorCount++;
        }
      }

      logger.info(`Meta Ads sync complete: ${syncedCount} records synced, ${errorCount} errors`);

      return {
        success: true,
        syncedCount,
        errorCount,
        totalRecords: insights.length,
      };
    } catch (error) {
      logger.error(`Error syncing Meta Ads data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId, updates) {
    try {
      const data = await this.makeRequest(campaignId, updates, 'POST');
      return data;
    } catch (error) {
      logger.error(`Error updating campaign: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get ad sets for a campaign
   */
  async getAdSets(campaignId, params = {}) {
    try {
      const data = await this.makeRequest(`${campaignId}/adsets`, {
        fields: 'id,name,status,daily_budget,lifetime_budget,targeting',
        ...params,
      });

      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching ad sets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get ads for an ad set
   */
  async getAds(adSetId, params = {}) {
    try {
      const data = await this.makeRequest(`${adSetId}/ads`, {
        fields: 'id,name,status,creative',
        ...params,
      });

      return data.data || [];
    } catch (error) {
      logger.error(`Error fetching ads: ${error.message}`);
      throw error;
    }
  }
}

module.exports = MetaAdsService;
