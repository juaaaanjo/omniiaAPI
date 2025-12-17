const mongoose = require('mongoose');

/**
 * Smart Register Schema
 * Stores answers to the guided onboarding/chat questionnaire
 */
const smartRegisterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    // Note: index removed here because unique index exists below (line 48)
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress',
    index: true,
  },
  currentStep: {
    type: Number,
    default: 0,
  },
  totalQuestions: {
    type: Number,
    default: 0,
  },
  answers: [{
    key: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
  }],
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Ensure we don't create duplicate sessions
smartRegisterSchema.index({ sessionId: 1 }, { unique: true });

module.exports = mongoose.model('SmartRegister', smartRegisterSchema);
