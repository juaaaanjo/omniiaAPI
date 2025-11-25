const express = require('express');
const router = express.Router();
const smartRegisterController = require('../controllers/smartRegisterController');
const { protect, optionalAuth } = require('../middleware/auth');
const {
  validate,
  smartRegisterAnswerSchema,
  smartRegisterFinishSchema,
  smartRegisterFormSchema,
} = require('../utils/validators');

/**
 * @route   POST /api/smart-register/start
 * @desc    Start a new smart register chat session
 * @access  Public
 */
router.post(
  '/start',
  smartRegisterController.startSession
);

/**
 * @route   POST /api/smart-register/form
 * @desc    Submit full form and create a completed session
 * @access  Public (optionally authenticated)
 */
router.post(
  '/form',
  optionalAuth,
  validate(smartRegisterFormSchema),
  smartRegisterController.submitForm
);

/**
 * @route   POST /api/smart-register/:sessionId/answer
 * @desc    Submit an answer and get the next question
 * @access  Public
 */
router.post(
  '/:sessionId/answer',
  validate(smartRegisterAnswerSchema),
  smartRegisterController.submitAnswer
);

/**
 * @route   POST /api/smart-register/:sessionId/finish
 * @desc    Finish session: create/link user and complete register
 * @access  Public (optionally authenticated)
 */
router.post(
  '/:sessionId/finish',
  optionalAuth,
  validate(smartRegisterFinishSchema),
  smartRegisterController.finishSession
);

/**
 * @route   GET /api/smart-register/:sessionId
 * @desc    Get session progress and answers
 * @access  Public
 */
router.get(
  '/:sessionId',
  smartRegisterController.getSession
);

/**
 * @route   GET /api/smart-register
 * @desc    List recent smart register sessions
 * @access  Private
 */
router.get(
  '/',
  protect,
  smartRegisterController.listSessions
);

module.exports = router;
