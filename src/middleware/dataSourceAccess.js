const logger = require('../utils/logger');

/**
 * Middleware to check if user has access to a specific data source
 * @param {string} dataSource - The data source to check (e.g., 'transactions', 'excelTransactions', 'metaAds')
 */
const requireDataSourceAccess = (dataSource) => {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Check if user has access to the requested data source
      if (!user.hasDataSourceAccess(dataSource)) {
        logger.warn(`User ${user._id} (${user.email}) attempted to access ${dataSource} without permission`);
        return res.status(403).json({
          success: false,
          message: `Access denied: ${dataSource} data source is not enabled for your account`,
          dataSource,
        });
      }

      // User has access, proceed
      next();
    } catch (error) {
      logger.error(`Data source access middleware error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error checking data source access',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to attach available data sources to request
 */
const attachAvailableDataSources = (req, res, next) => {
  try {
    if (req.user) {
      req.availableDataSources = req.user.getAvailableDataSources();
    }
    next();
  } catch (error) {
    logger.error(`Attach data sources middleware error: ${error.message}`);
    next(error);
  }
};

module.exports = {
  requireDataSourceAccess,
  attachAvailableDataSources,
};
