const express = require('express');
const router = express.Router();
const guardrailsController = require('../controllers/guardrailsController');
const { protect } = require('../middleware/auth');

/**
 * Guardrails Routes
 * All routes require authentication
 */

/**
 * @route   POST /api/guardrails
 * @desc    Create or update a guardrail
 * @access  Private
 */
router.post('/', protect, guardrailsController.createGuardrail);

/**
 * @route   GET /api/guardrails
 * @desc    Get all guardrails for authenticated user
 * @access  Private
 */
router.get('/', protect, guardrailsController.getGuardrails);

/**
 * @route   GET /api/guardrails/:id
 * @desc    Get a specific guardrail
 * @access  Private
 */
router.get('/:id', protect, guardrailsController.getGuardrail);

/**
 * @route   PUT /api/guardrails/:id
 * @desc    Update a guardrail
 * @access  Private
 */
router.put('/:id', protect, guardrailsController.updateGuardrail);

/**
 * @route   DELETE /api/guardrails/:id
 * @desc    Delete a guardrail
 * @access  Private
 */
router.delete('/:id', protect, guardrailsController.deleteGuardrail);

/**
 * @route   POST /api/guardrails/:id/check
 * @desc    Manually trigger a guardrail check
 * @access  Private
 */
router.post('/:id/check', protect, guardrailsController.checkGuardrail);

/**
 * @route   PATCH /api/guardrails/:id/toggle
 * @desc    Enable/disable a guardrail
 * @access  Private
 */
router.patch('/:id/toggle', protect, guardrailsController.toggleGuardrail);

module.exports = router;
