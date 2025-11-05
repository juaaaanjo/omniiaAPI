const emailService = require('../services/emailService');
const reportGenerator = require('../services/reportGeneratorService');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Email Report Controller
 * Handles email report generation and sending
 */

/**
 * Send forecast report via email
 * @route POST /api/admin/reports/send
 */
exports.sendForecastReport = async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email service not configured. Please set up email in .env file.',
      });
    }

    const {
      emails,
      startDate,
      endDate,
      forecastType,
      includeDetails = true,
    } = req.body;

    // Validate emails
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one email recipient is required',
      });
    }

    // Generate report data
    const reportData = await reportGenerator.generateForecastReport({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      forecastType,
      includeDetails,
    });

    // Generate HTML
    const reportHtml = reportGenerator.generateHtmlReport(reportData);

    // Send email
    await emailService.sendForecastReport({
      to: emails,
      reportData,
      reportHtml,
    });

    logger.info(`Forecast report sent to ${emails.join(', ')} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: `Report sent successfully to ${emails.length} recipient(s)`,
      data: {
        recipients: emails,
        reportPeriod: reportData.period,
      },
    });
  } catch (error) {
    logger.error(`Send forecast report error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error sending forecast report',
      error: error.message,
    });
  }
};

/**
 * Send weekly report to all admins
 * @route POST /api/admin/reports/weekly
 */
exports.sendWeeklyReport = async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email service not configured',
      });
    }

    // Get all admin emails
    const admins = await User.find({ role: 'admin', isActive: true }).select('email name');
    const adminEmails = admins.map(admin => admin.email);

    if (adminEmails.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active admin users found',
      });
    }

    // Generate weekly report
    const reportData = await reportGenerator.generateWeeklyReport();
    const reportHtml = reportGenerator.generateHtmlReport(reportData);

    // Send to all admins
    await emailService.sendScheduledReport({
      to: adminEmails,
      reportType: 'weekly',
      reportData,
      reportHtml,
    });

    logger.info(`Weekly report sent to ${adminEmails.length} admins`);

    res.json({
      success: true,
      message: `Weekly report sent to ${adminEmails.length} admin(s)`,
      data: {
        recipients: adminEmails,
        reportPeriod: reportData.period,
      },
    });
  } catch (error) {
    logger.error(`Send weekly report error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error sending weekly report',
      error: error.message,
    });
  }
};

/**
 * Send monthly report to all admins
 * @route POST /api/admin/reports/monthly
 */
exports.sendMonthlyReport = async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email service not configured',
      });
    }

    // Get all admin emails
    const admins = await User.find({ role: 'admin', isActive: true }).select('email name');
    const adminEmails = admins.map(admin => admin.email);

    if (adminEmails.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active admin users found',
      });
    }

    // Generate monthly report
    const reportData = await reportGenerator.generateMonthlyReport();
    const reportHtml = reportGenerator.generateHtmlReport(reportData);

    // Send to all admins
    await emailService.sendScheduledReport({
      to: adminEmails,
      reportType: 'monthly',
      reportData,
      reportHtml,
    });

    logger.info(`Monthly report sent to ${adminEmails.length} admins`);

    res.json({
      success: true,
      message: `Monthly report sent to ${adminEmails.length} admin(s)`,
      data: {
        recipients: adminEmails,
        reportPeriod: reportData.period,
      },
    });
  } catch (error) {
    logger.error(`Send monthly report error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error sending monthly report',
      error: error.message,
    });
  }
};

/**
 * Preview report without sending
 * @route GET /api/admin/reports/preview
 */
exports.previewReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      forecastType,
      includeDetails = true,
    } = req.query;

    // Generate report data
    const reportData = await reportGenerator.generateForecastReport({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      forecastType,
      includeDetails: includeDetails === 'true',
    });

    // Generate HTML
    const reportHtml = reportGenerator.generateHtmlReport(reportData);

    // Return HTML for preview
    res.setHeader('Content-Type', 'text/html');
    res.send(reportHtml);
  } catch (error) {
    logger.error(`Preview report error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating report preview',
      error: error.message,
    });
  }
};

/**
 * Test email configuration
 * @route POST /api/admin/reports/test-email
 */
exports.testEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email service not configured. Please check your .env file.',
      });
    }

    // Test connection
    await emailService.testConnection();

    // Send test email
    await emailService.sendEmail({
      to: email,
      subject: 'Test Email - Business Analytics Platform',
      html: `
        <h2>Email Test Successful!</h2>
        <p>This is a test email from the Business Analytics Platform.</p>
        <p>Your email configuration is working correctly.</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
      `,
    });

    logger.info(`Test email sent to ${email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error) {
    logger.error(`Test email error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Email test failed',
      error: error.message,
    });
  }
};

/**
 * Get email configuration status
 * @route GET /api/admin/reports/email-status
 */
exports.getEmailStatus = async (req, res) => {
  try {
    const isConfigured = emailService.isConfigured();
    const isDummyMode = emailService.isDummyMode();

    res.json({
      success: true,
      data: {
        configured: isConfigured,
        dummy: isDummyMode,
        message: isConfigured
          ? isDummyMode
            ? 'Email service running in dummy mode. Emails are logged but not sent.'
            : 'Email service is configured and ready'
          : 'Email service not configured. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD in .env',
      },
    });
  } catch (error) {
    logger.error(`Get email status error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error checking email status',
      error: error.message,
    });
  }
};
