const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const crypto = require('crypto');

/**
 * Register a new user
 * @route POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, company, language } = req.validatedData;

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
      language: (language && ['es', 'en'].includes(language)) ? language : 'es', // Default to Spanish
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
    const { name, company, language } = req.body;

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
    if (language && ['es', 'en'].includes(language)) {
      user.language = language;
    }

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

/**
 * Get available data sources for current user
 * @route GET /api/auth/data-sources
 */
exports.getAvailableDataSources = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const availableSources = user.getAvailableDataSources();

    res.json({
      success: true,
      data: {
        enabledDataSources: user.enabledDataSources,
        availableSources,
      },
    });
  } catch (error) {
    logger.error(`Get available data sources error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching available data sources',
      error: error.message,
    });
  }
};

/**
 * Update user data sources (admin only)
 * @route PUT /api/auth/admin/users/:userId/data-sources
 */
exports.updateUserDataSources = async (req, res) => {
  try {
    const { userId } = req.params;
    const { enabledDataSources } = req.body;

    // Check if current user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required',
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Validate data sources
    const validSources = ['metaAds', 'transactions', 'excelTransactions'];
    const invalidSources = enabledDataSources.filter(s => !validSources.includes(s));

    if (invalidSources.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid data sources: ${invalidSources.join(', ')}`,
      });
    }

    user.enabledDataSources = enabledDataSources;
    await user.save();

    logger.info(`Data sources updated for user ${user.email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Data sources updated successfully',
      data: {
        userId: user._id,
        email: user.email,
        enabledDataSources: user.enabledDataSources,
      },
    });
  } catch (error) {
    logger.error(`Update user data sources error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating user data sources',
      error: error.message,
    });
  }
};

/**
 * Forgot password - Send reset email
 * @route POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      const isSpanish = user.language === 'es';
      return res.status(401).json({
        success: false,
        message: isSpanish
          ? 'Tu cuenta ha sido desactivada'
          : 'Your account has been deactivated',
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Email content based on user language
    const isSpanish = user.language === 'es';

    const emailContent = {
      subject: isSpanish ? 'Solicitud de Restablecimiento de Contraseña' : 'Password Reset Request',
      title: isSpanish ? 'Solicitud de Restablecimiento de Contraseña' : 'Password Reset Request',
      greeting: isSpanish ? `Hola ${user.name},` : `Hi ${user.name},`,
      message: isSpanish
        ? 'Solicitaste restablecer tu contraseña para tu cuenta. Haz clic en el botón de abajo para restablecerla:'
        : 'You requested to reset your password for your account. Click the button below to reset it:',
      buttonText: isSpanish ? 'Restablecer Contraseña' : 'Reset Password',
      alternativeText: isSpanish
        ? 'O copia y pega este enlace en tu navegador:'
        : 'Or copy and paste this link into your browser:',
      securityTitle: isSpanish ? 'Aviso de Seguridad:' : 'Security Notice:',
      securityMessage: isSpanish
        ? 'Este enlace expirará en 10 minutos. Si no solicitaste este restablecimiento de contraseña, ignora este correo y tu contraseña permanecerá sin cambios.'
        : 'This link will expire in 10 minutes. If you didn\'t request this password reset, please ignore this email and your password will remain unchanged.',
      footerMessage1: isSpanish
        ? 'Este es un correo automatizado de nerdee.'
        : 'This is an automated email from nerdee.',
      footerMessage2: isSpanish
        ? 'Si tienes alguna pregunta, por favor contacta a soporte.'
        : 'If you have any questions, please contact support.',
    };

    // Prepare email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 20px;
          }
          .content {
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background: #2563eb;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
          .footer {
            font-size: 12px;
            color: #6b7280;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 15px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${emailContent.title}</h1>
        </div>

        <div class="content">
          <p>${emailContent.greeting}</p>

          <p>${emailContent.message}</p>

          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">${emailContent.buttonText}</a>
          </div>

          <p>${emailContent.alternativeText}</p>
          <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>

          <div class="warning">
            <strong>${emailContent.securityTitle}</strong> ${emailContent.securityMessage}
          </div>
        </div>

        <div class="footer">
          <p>${emailContent.footerMessage1}</p>
          <p>${emailContent.footerMessage2}</p>
        </div>
      </body>
      </html>
    `;

    // Send email
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: emailContent.subject,
        html: emailHtml,
      });

      logger.info(`Password reset email sent to: ${user.email}`);

      res.json({
        success: true,
        message: isSpanish
          ? 'Correo de restablecimiento de contraseña enviado exitosamente'
          : 'Password reset email sent successfully',
      });
    } catch (emailError) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });

      logger.error(`Email send error: ${emailError.message}`);
      return res.status(500).json({
        success: false,
        message: 'Error sending password reset email',
        error: emailError.message,
      });
    }
  } catch (error) {
    logger.error(`Forgot password error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error processing password reset request',
      error: error.message,
    });
  }
};

/**
 * Reset password
 * @route POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required',
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Hash token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired',
      });
    }

    const isSpanish = user.language === 'es';

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: isSpanish
          ? 'Tu cuenta ha sido desactivada'
          : 'Your account has been deactivated',
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logger.info(`Password reset successful for user: ${user.email}`);

    // Generate JWT token
    const authToken = generateToken(user._id);

    res.json({
      success: true,
      message: isSpanish
        ? 'Tu contraseña ha sido restablecida exitosamente'
        : 'Password has been reset successfully',
      data: {
        user: user.toSafeObject(),
        token: authToken,
      },
    });
  } catch (error) {
    logger.error(`Reset password error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message,
    });
  }
};
