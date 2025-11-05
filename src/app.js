if (typeof Object.hasOwn !== 'function') {
  // Polyfill for Node.js versions before 16.9 where Object.hasOwn is unavailable
  Object.hasOwn = (target, property) => Object.prototype.hasOwnProperty.call(target, property);
}

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const config = require('./config/env');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const campaignMonitoringService = require('./services/campaignMonitoringService');
const scheduledReportsService = require('./services/scheduledReportsService');
const automatedPlanningService = require('./services/automatedPlanningService');
const automatedAlertService = require('./services/automatedAlertService');

// Import routes
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const chatRoutes = require('./routes/chat');
const dashboardRoutes = require('./routes/dashboard');
const debugRoutes = require('./routes/debug');
const metaAdsRoutes = require('./routes/metaAds');
const guardrailsRoutes = require('./routes/guardrails');
const forecastingRoutes = require('./routes/forecasting');
const forecastReportingRoutes = require('./routes/forecastReporting');
const emailReportsRoutes = require('./routes/emailReports');
const planningRoutes = require('./routes/planning');
const eioRoutes = require('./routes/eio');

/**
 * Initialize Express app
 */
const app = express();

/**
 * Connect to MongoDB
 */
connectDB();

/**
 * Middleware
 */

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS - Log allowed origins for debugging
logger.info(`CORS allowed origins: ${JSON.stringify(config.corsOrigin)}`);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    const allowedOrigins = Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin];

    if (allowedOrigins.indexOf(origin) !== -1) {
      logger.info(`CORS: Allowing origin ${origin}`);
      callback(null, true);
    } else {
      logger.warn(`CORS: Rejecting origin ${origin}. Allowed origins: ${JSON.stringify(allowedOrigins)}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// API rate limiting
app.use('/api/', apiLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Business Analytics Platform API is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

/**
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/meta-ads', metaAdsRoutes);
app.use('/api/guardrails', guardrailsRoutes);
app.use('/api/forecasting', forecastingRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/admin/forecasts', forecastReportingRoutes);
app.use('/api/admin/reports', emailReportsRoutes);
app.use('/api/eio', eioRoutes);

/**
 * Welcome route
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Business Analytics Platform API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      data: '/api/data',
      chat: '/api/chat',
      dashboard: '/api/dashboard',
      debug: '/api/debug',
      metaAds: '/api/meta-ads',
      guardrails: '/api/guardrails',
      forecasting: '/api/forecasting',
      planning: '/api/planning',
      adminForecasts: '/api/admin/forecasts',
      adminReports: '/api/admin/reports',
    },
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  logger.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: config.nodeEnv === 'development' ? err.stack : undefined,
  });
});

/**
 * Start server
 */
const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);

  // Start campaign monitoring service
  // Check every 15 minutes by default (can be configured)
  const monitoringInterval = parseInt(process.env.CAMPAIGN_MONITORING_INTERVAL) || 15;
  campaignMonitoringService.start(monitoringInterval);

  // Start scheduled reports service
  scheduledReportsService.start();

  // Start automated planning service
  automatedPlanningService.start();

  // Start automated alert service
  automatedAlertService.start();
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  logger.error(err.stack);

  // Stop monitoring service
  campaignMonitoringService.stop();

  // Stop scheduled reports
  scheduledReportsService.stop();

  // Stop automated planning
  automatedPlanningService.stop();

  // Stop automated alerts
  automatedAlertService.stop();

  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);

  // Stop monitoring service
  campaignMonitoringService.stop();

  // Stop scheduled reports
  scheduledReportsService.stop();

  // Stop automated planning
  automatedPlanningService.stop();

  // Stop automated alerts
  automatedAlertService.stop();

  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');

  // Stop monitoring service
  campaignMonitoringService.stop();

  // Stop scheduled reports
  scheduledReportsService.stop();

  // Stop automated planning
  automatedPlanningService.stop();

  // Stop automated alerts
  automatedAlertService.stop();

  server.close(() => {
    logger.info('HTTP server closed');
  });
});

module.exports = app;
