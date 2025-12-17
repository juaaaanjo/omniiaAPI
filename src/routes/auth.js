const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate, userRegisterSchema, userLoginSchema } = require('../utils/validators');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  authLimiter,
  validate(userRegisterSchema),
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  validate(userLoginSchema),
  authController.login
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/profile',
  protect,
  authController.getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  protect,
  authController.updateProfile
);

/**
 * @route   PUT /api/auth/integrations/:source
 * @desc    Update integration credentials
 * @access  Private
 */
router.put(
  '/integrations/:source',
  protect,
  authController.updateIntegration
);

/**
 * @route   DELETE /api/auth/integrations/:source
 * @desc    Disconnect integration
 * @access  Private
 */
router.delete(
  '/integrations/:source',
  protect,
  authController.disconnectIntegration
);

/**
 * @route   GET /api/auth/data-sources
 * @desc    Get available data sources for current user
 * @access  Private
 */
router.get(
  '/data-sources',
  protect,
  authController.getAvailableDataSources
);

/**
 * @route   PUT /api/auth/admin/users/:userId/data-sources
 * @desc    Update user data sources (admin only)
 * @access  Private (Admin only)
 */
router.put(
  '/admin/users/:userId/data-sources',
  protect,
  authController.updateUserDataSources
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  authController.resetPassword
);

module.exports = router;
