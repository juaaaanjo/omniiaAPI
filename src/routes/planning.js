const express = require('express');
const router = express.Router();
const planningController = require('../controllers/planningController');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

/**
 * Planning Routes
 * AUTOMATED PLANNING SYSTEM
 * Plans are generated automatically by the system based on data analysis
 * Users can VIEW and INTERACT with auto-generated plans
 */

// Get statistics
router.get('/stats', protect, planningController.getPlanStats);

// Get active plans (auto-generated)
router.get('/active', protect, planningController.getActivePlans);

// Trigger manual analysis (force system to analyze and create plans if needed)
router.post('/analyze', protect, planningController.triggerAnalysis);

// Get all plans for user (with filters)
router.get('/', protect, planningController.getUserPlans);

// Get specific plan by ID
router.get('/:id', protect, planningController.getPlanById);

// Get insights about why this plan was created
router.get('/:id/insights', protect, planningController.getPlanInsights);

// Update plan status (user can accept/reject/pause auto-generated plans)
router.patch('/:id/status', protect, planningController.updatePlanStatus);

// Update action item (user checks off actions from the plan)
router.patch('/:id/actions/:actionId', protect, planningController.updateActionItem);

// Update milestone
router.patch('/:id/milestones/:milestoneId', protect, planningController.updateMilestone);

// Admin: Trigger analysis for all users
router.post('/admin/analyze-all', protect, requireAdmin, planningController.triggerAnalysisAll);

module.exports = router;
