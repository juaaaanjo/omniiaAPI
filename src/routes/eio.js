const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { protect } = require('../middleware/auth');

/**
 * EIO Routes
 * Operational alerts and insights
 */

// Alert collections
router.get('/alerts/pending', protect, alertController.getPendingAlerts);
router.get('/alerts/summary', protect, alertController.getAlertSummary);
router.get('/alerts/by-category', protect, alertController.getAlertsByCategory);
router.get('/alerts/report', protect, alertController.exportReport);
router.get('/alerts', protect, alertController.getAllAlerts);

// Alert lifecycle operations
router.get('/alerts/:id', protect, alertController.getAlertById);
router.post('/alerts/:id/apply', protect, alertController.applyAlert);
router.post('/alerts/:id/ignore', protect, alertController.ignoreAlert);
router.post('/alerts/:id/review', protect, alertController.markForReview);
router.post('/alerts/:id/resolve', protect, alertController.resolveAlert);

// Bulk operations
router.post('/alerts/bulk-apply', protect, alertController.bulkApply);

// Insights and manual checks
router.get('/insights/daily', protect, alertController.getDailyInsights);
router.post('/check', protect, alertController.triggerCheck);

module.exports = router;
