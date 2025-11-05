const express = require('express');
const router = express.Router();
const forecastReportingController = require('../controllers/forecastReportingController');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

// All routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

/**
 * @route   GET /api/admin/forecasts
 * @desc    Get all forecasts with filters and pagination
 * @access  Admin
 */
router.get(
  '/',
  forecastReportingController.getAllForecasts
);

/**
 * @route   GET /api/admin/forecasts/stats/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Admin
 */
router.get(
  '/stats/dashboard',
  forecastReportingController.getDashboardStats
);

/**
 * @route   GET /api/admin/forecasts/scenarios
 * @desc    Get scenario analysis groups
 * @access  Admin
 */
router.get(
  '/scenarios',
  forecastReportingController.getScenarios
);

/**
 * @route   GET /api/admin/forecasts/export
 * @desc    Export forecasts to JSON
 * @access  Admin
 */
router.get(
  '/export',
  forecastReportingController.exportForecasts
);

/**
 * @route   GET /api/admin/forecasts/user/:userId
 * @desc    Get forecasts for a specific user
 * @access  Admin
 */
router.get(
  '/user/:userId',
  forecastReportingController.getUserForecasts
);

/**
 * @route   GET /api/admin/forecasts/:id
 * @desc    Get specific forecast by ID
 * @access  Admin
 */
router.get(
  '/:id',
  forecastReportingController.getForecastById
);

/**
 * @route   POST /api/admin/forecasts/:id/actual
 * @desc    Record actual outcome for a forecast
 * @access  Admin
 */
router.post(
  '/:id/actual',
  forecastReportingController.recordActualOutcome
);

/**
 * @route   PATCH /api/admin/forecasts/:id
 * @desc    Update forecast metadata (archive, tags, notes)
 * @access  Admin
 */
router.patch(
  '/:id',
  forecastReportingController.updateForecast
);

/**
 * @route   DELETE /api/admin/forecasts/:id
 * @desc    Delete a forecast
 * @access  Admin
 */
router.delete(
  '/:id',
  forecastReportingController.deleteForecast
);

module.exports = router;
