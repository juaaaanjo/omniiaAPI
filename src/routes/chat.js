const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');
const { validate, chatQuerySchema } = require('../utils/validators');

/**
 * @route   POST /api/chat/ask
 * @desc    Ask a question to AI agents
 * @access  Private
 */
router.post(
  '/ask',
  protect,
  chatLimiter,
  validate(chatQuerySchema),
  chatController.askQuestion
);

/**
 * @route   GET /api/chat/history
 * @desc    Get chat history for user
 * @access  Private
 */
router.get(
  '/history',
  protect,
  chatController.getChatHistory
);

/**
 * @route   GET /api/chat/session/:sessionId
 * @desc    Get specific session conversation
 * @access  Private
 */
router.get(
  '/session/:sessionId',
  protect,
  chatController.getSessionConversation
);

/**
 * @route   DELETE /api/chat/history/:chatId
 * @desc    Delete chat history entry
 * @access  Private
 */
router.delete(
  '/history/:chatId',
  protect,
  chatController.deleteChatHistory
);

/**
 * @route   DELETE /api/chat/history
 * @desc    Delete all chat history for user
 * @access  Private
 */
router.delete(
  '/history',
  protect,
  chatController.deleteAllChatHistory
);

/**
 * @route   GET /api/chat/stats
 * @desc    Get chat statistics
 * @access  Private
 */
router.get(
  '/stats',
  protect,
  chatController.getChatStats
);

/**
 * @route   POST /api/chat/:chatId/feedback
 * @desc    Submit feedback for a chat response
 * @access  Private
 */
router.post(
  '/:chatId/feedback',
  protect,
  chatController.submitFeedback
);

module.exports = router;
