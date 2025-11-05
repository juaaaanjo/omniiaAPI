const express = require('express');
const router = express.Router();
const forecastingController = require('../controllers/forecastingController');
const { protect } = require('../middleware/auth');

/**
 * @route   POST /api/forecasting/generate
 * @desc    Generate a forecast based on historical data
 * @access  Private
 */
router.post(
  '/generate',
  protect,
  forecastingController.generateForecast
);

/**
 * @route   POST /api/forecasting/scenarios
 * @desc    Generate scenario analysis (best/worst/most likely cases)
 * @access  Private
 */
router.post(
  '/scenarios',
  protect,
  forecastingController.generateScenarios
);

/**
 * @route   GET /api/forecasting/options
 * @desc    Get available forecast types and periods
 * @access  Private
 */
router.get(
  '/options',
  protect,
  forecastingController.getForecastOptions
);

/**
 * @route   GET /api/forecasting/quick
 * @desc    Generate a quick revenue forecast for next month
 * @access  Private
 */
router.get(
  '/quick',
  protect,
  forecastingController.quickForecast
);

module.exports = router;
