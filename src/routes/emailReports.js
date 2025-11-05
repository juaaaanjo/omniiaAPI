const express = require('express');
const router = express.Router();
const emailReportController = require('../controllers/emailReportController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/admin/reports/email-status
 * @desc    Get email configuration status
 * @access  Authenticated
 */
router.get(
  '/email-status',
  emailReportController.getEmailStatus
);

/**
 * @route   GET /api/admin/reports/preview
 * @desc    Preview report without sending (returns HTML)
 * @access  Authenticated
 */
router.get(
  '/preview',
  emailReportController.previewReport
);

/**
 * @route   POST /api/admin/reports/send
 * @desc    Send custom forecast report via email
 * @access  Authenticated
 */
router.post(
  '/send',
  emailReportController.sendForecastReport
);

/**
 * @route   POST /api/admin/reports/weekly
 * @desc    Send weekly report to all admins
 * @access  Authenticated
 */
router.post(
  '/weekly',
  emailReportController.sendWeeklyReport
);

/**
 * @route   POST /api/admin/reports/monthly
 * @desc    Send monthly report to all admins
 * @access  Authenticated
 */
router.post(
  '/monthly',
  emailReportController.sendMonthlyReport
);

/**
 * @route   POST /api/admin/reports/test-email
 * @desc    Test email configuration by sending a test email
 * @access  Authenticated
 */
router.post(
  '/test-email',
  emailReportController.testEmail
);

module.exports = router;
