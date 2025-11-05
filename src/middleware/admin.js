const logger = require('../utils/logger');

/**
 * Admin authorization middleware
 * Ensures the user has admin role
 */
exports.requireAdmin = (req, res, next) => {
  try {
    // Check if user is authenticated (should be done by protect middleware first)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      logger.warn(`Unauthorized admin access attempt by user ${req.user.email}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    // User is admin, proceed
    next();
  } catch (error) {
    logger.error(`Admin middleware error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Authorization error',
      error: error.message,
    });
  }
};
