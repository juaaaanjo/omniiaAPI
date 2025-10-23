const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Register a new user
 * @route POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, company } = req.validatedData;

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email',
      });
    }

    // Create new user
    const user = new User({
      email,
      password,
      name,
      company,
    });

    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toSafeObject(),
        token,
      },
    });
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message,
    });
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.validatedData;

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated',
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate JWT token
    const token = generateToken(user._id);

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toSafeObject(),
        token,
      },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message,
    });
  }
};

/**
 * Get current user profile
 * @route GET /api/auth/profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

/**
 * Update user profile
 * @route PUT /api/auth/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, company } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update fields
    if (name) user.name = name;
    if (company !== undefined) user.company = company;

    await user.save();

    logger.info(`Profile updated for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

/**
 * Update integration credentials
 * @route PUT /api/auth/integrations/:source
 */
exports.updateIntegration = async (req, res) => {
  try {
    const { source } = req.params;
    const credentials = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update integration credentials based on source
    switch (source) {
      case 'meta-ads':
        user.integrations.metaAds = {
          connected: true,
          accessToken: credentials.accessToken,
          accessTokenExpiresAt: credentials.accessTokenExpiresAt || null,
          accountId: credentials.accountId,
          accountName: credentials.accountName || user.integrations.metaAds.accountName,
          lastSync: user.integrations.metaAds.lastSync,
        };
        break;

      case 'transactions':
        user.integrations.transactions = {
          connected: true,
          lastSync: user.integrations.transactions.lastSync,
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid integration source',
        });
    }

    await user.save();

    logger.info(`Integration updated for user ${user.email}: ${source}`);

    res.json({
      success: true,
      message: `${source} integration updated successfully`,
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    logger.error(`Update integration error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating integration',
      error: error.message,
    });
  }
};

/**
 * Disconnect integration
 * @route DELETE /api/auth/integrations/:source
 */
exports.disconnectIntegration = async (req, res) => {
  try {
    const { source } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Disconnect integration based on source
    const integrationMap = {
      'meta-ads': 'metaAds',
      'transactions': 'transactions',
    };

    const integrationKey = integrationMap[source];

    if (!integrationKey) {
      return res.status(400).json({
        success: false,
        message: 'Invalid integration source',
      });
    }

    user.integrations[integrationKey].connected = false;

    await user.save();

    logger.info(`Integration disconnected for user ${user.email}: ${source}`);

    res.json({
      success: true,
      message: `${source} integration disconnected successfully`,
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    logger.error(`Disconnect integration error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting integration',
      error: error.message,
    });
  }
};
