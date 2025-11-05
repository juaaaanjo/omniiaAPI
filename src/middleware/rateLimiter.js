const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
    retryAfter: config.rateLimitWindowMs / 1000,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      retryAfter: config.rateLimitWindowMs / 1000,
    });
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 requests per window
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again after 15 minutes',
    });
  },
});

/**
 * Rate limiter for AI chat endpoints
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many chat requests, please slow down',
  },
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req, res) => {
    logger.warn(`Chat rate limit exceeded for user: ${req.user?.id || 'anonymous'}`);
    res.status(429).json({
      success: false,
      message: 'Too many chat requests, please wait before asking another question',
    });
  },
});

/**
 * Rate limiter for data synchronization
 */
const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 sync requests per hour
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Sync limit reached, please try again later',
  },
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req, res) => {
    logger.warn(`Sync rate limit exceeded for user: ${req.user?.id || 'anonymous'}`);
    res.status(429).json({
      success: false,
      message: 'Too many sync requests, please wait before syncing again',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limiter for dashboard queries
 */
const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many dashboard requests',
  },
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
});

/**
 * Create custom rate limiter
 */
const createLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  apiLimiter,
  authLimiter,
  chatLimiter,
  syncLimiter,
  dashboardLimiter,
  createLimiter,
};
