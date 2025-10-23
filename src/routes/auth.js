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

module.exports = router;
