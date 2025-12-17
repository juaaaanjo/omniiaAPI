const mongoose = require('mongoose');

/**
 * Chat History Schema
 * Stores conversation history between users and AI agents
 */
const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    // Note: index removed here because compound index exists below (line 91)
  },
  // Message details
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  // Agent information
  agentType: {
    type: String,
    enum: ['orchestrator', 'data-integration', 'business-analysis', 'insight-generator'],
  },
  // Context and metadata
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  dataSourcesUsed: [{
    type: String,
    enum: ['meta-ads', 'transactions'],
  }],
  // Query details
  queryType: {
    type: String,
    enum: ['question', 'analysis', 'insight', 'sync', 'general'],
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
  },
  // Performance metrics
  tokensUsed: {
    type: Number,
  },
  responseTime: {
    type: Number, // milliseconds
  },
  // Error tracking
  error: {
    occurred: {
      type: Boolean,
      default: false,
    },
    message: String,
    code: String,
  },
  // Feedback
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    helpful: Boolean,
  },
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Compound indexes
chatHistorySchema.index({ userId: 1, sessionId: 1, createdAt: 1 });
chatHistorySchema.index({ userId: 1, agentType: 1 });
chatHistorySchema.index({ sessionId: 1, createdAt: 1 });

/**
 * Get conversation history for a session
 */
chatHistorySchema.statics.getSessionHistory = async function(sessionId, limit = 50) {
  return this.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('-__v');
};

/**
 * Get user's recent conversations
 */
chatHistorySchema.statics.getUserRecentChats = async function(userId, limit = 20) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        role: 'user',
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: 'chathistories',
        let: { sessionId: '$sessionId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$sessionId', '$$sessionId'] },
                  { $eq: ['$role', 'assistant'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'response',
      },
    },
    {
      $project: {
        sessionId: 1,
        question: '$content',
        answer: { $arrayElemAt: ['$response.content', 0] },
        agentType: { $arrayElemAt: ['$response.agentType', 0] },
        createdAt: 1,
      },
    },
  ]);
};

/**
 * Get chat statistics for a user
 */
chatHistorySchema.statics.getUserChatStats = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
        role: 'assistant',
      },
    },
    {
      $group: {
        _id: null,
        totalQueries: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        totalTokensUsed: { $sum: '$tokensUsed' },
        errorCount: {
          $sum: { $cond: ['$error.occurred', 1, 0] },
        },
        avgConfidence: { $avg: '$confidence' },
      },
    },
  ]);
};

/**
 * Delete old chat history (cleanup)
 */
chatHistorySchema.statics.deleteOldChats = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
  });
};

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
