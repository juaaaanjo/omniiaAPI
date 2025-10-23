require('dotenv').config();

/**
 * Environment configuration
 * Centralizes all environment variables with validation
 */
const config = {
  // App
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/business-analytics',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_change_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // OpenAI API
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Meta Ads API
  metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN,
  metaAdsApiVersion: process.env.META_ADS_API_VERSION || 'v18.0',
  metaAdsAppId: process.env.META_ADS_APP_ID,
  metaAdsAppSecret: process.env.META_ADS_APP_SECRET,

  // Transaction API (Google Cloud Function)
  transactionApiUrl: process.env.TRANSACTION_API_URL,

  // Redis (for caching and queues)
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT, 10) || 6379,
  redisPassword: process.env.REDIS_PASSWORD || '',

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,

  // CORS - Support comma-separated multiple origins
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'],

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Frontend URL (for OAuth redirects)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

/**
 * Validate required environment variables
 */
const validateConfig = () => {
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'OPENAI_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
    console.warn('The application will use default values, but this is not recommended for production.');
  }
};

validateConfig();

module.exports = config;
