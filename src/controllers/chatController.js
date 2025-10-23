const AgentOrchestrator = require('../agents/AgentOrchestrator');
const ChatHistory = require('../models/ChatHistory');
const logger = require('../utils/logger');

const orchestrator = new AgentOrchestrator();

/**
 * Ask a question to the AI agents
 * @route POST /api/chat/ask
 */
exports.askQuestion = async (req, res) => {
  try {
    const { question, context, agentType } = req.validatedData;

    logger.info(`User ${req.user._id} asked: ${question}`);

    // Prepare context
    const queryContext = {
      ...context,
      sessionId: context?.sessionId || undefined,
      startDate: context?.startDate ? new Date(context.startDate) : undefined,
      endDate: context?.endDate ? new Date(context.endDate) : undefined,
    };

    // Process query through orchestrator
    const result = await orchestrator.processQuery(req.user._id, question, queryContext);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Ask question error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error processing your question',
      error: error.message,
    });
  }
};

/**
 * Get chat history for user
 * @route GET /api/chat/history
 */
exports.getChatHistory = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const history = await orchestrator.getChatHistory(req.user._id, parseInt(limit));

    res.json({
      success: true,
      data: {
        history,
        total: history.length,
      },
    });
  } catch (error) {
    logger.error(`Get chat history error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat history',
      error: error.message,
    });
  }
};

/**
 * Get specific session conversation
 * @route GET /api/chat/session/:sessionId
 */
exports.getSessionConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    const conversation = await orchestrator.getSessionConversation(sessionId, parseInt(limit));

    res.json({
      success: true,
      data: {
        sessionId,
        messages: conversation,
        total: conversation.length,
      },
    });
  } catch (error) {
    logger.error(`Get session conversation error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching session conversation',
      error: error.message,
    });
  }
};

/**
 * Delete chat history entry
 * @route DELETE /api/chat/history/:chatId
 */
exports.deleteChatHistory = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await ChatHistory.findOne({
      _id: chatId,
      userId: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat history entry not found',
      });
    }

    await ChatHistory.deleteOne({ _id: chatId });

    logger.info(`Chat history deleted: ${chatId}`);

    res.json({
      success: true,
      message: 'Chat history entry deleted successfully',
    });
  } catch (error) {
    logger.error(`Delete chat history error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat history',
      error: error.message,
    });
  }
};

/**
 * Delete all chat history for user
 * @route DELETE /api/chat/history
 */
exports.deleteAllChatHistory = async (req, res) => {
  try {
    const result = await ChatHistory.deleteMany({
      userId: req.user._id,
    });

    logger.info(`All chat history deleted for user ${req.user._id}`);

    res.json({
      success: true,
      message: 'All chat history deleted successfully',
      data: {
        deletedCount: result.deletedCount,
      },
    });
  } catch (error) {
    logger.error(`Delete all chat history error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat history',
      error: error.message,
    });
  }
};

/**
 * Get chat statistics
 * @route GET /api/chat/stats
 */
exports.getChatStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await ChatHistory.getUserChatStats(req.user._id, start, end);

    res.json({
      success: true,
      data: stats[0] || {
        totalQueries: 0,
        avgResponseTime: 0,
        totalTokensUsed: 0,
        errorCount: 0,
        avgConfidence: 0,
      },
    });
  } catch (error) {
    logger.error(`Get chat stats error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat statistics',
      error: error.message,
    });
  }
};

/**
 * Submit feedback for a chat response
 * @route POST /api/chat/:chatId/feedback
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { rating, comment, helpful } = req.body;

    const chat = await ChatHistory.findOne({
      _id: chatId,
      userId: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat history entry not found',
      });
    }

    chat.feedback = {
      rating,
      comment,
      helpful,
    };

    await chat.save();

    logger.info(`Feedback submitted for chat ${chatId}`);

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
    });
  } catch (error) {
    logger.error(`Submit feedback error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error submitting feedback',
      error: error.message,
    });
  }
};
