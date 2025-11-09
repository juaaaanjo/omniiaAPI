const mongoose = require('mongoose');

/**
 * SupportTicket Schema
 * Tracks customer support cases for SAC (Customer Service) metrics
 */
const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    customerId: {
      type: String,
      index: true
    },
    customerEmail: {
      type: String,
      index: true
    },
    customerName: String,
    subject: {
      type: String,
      required: true
    },
    description: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'cancelled'],
      default: 'open',
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['technical', 'billing', 'general', 'product', 'complaint', 'other'],
      default: 'general'
    },
    channel: {
      type: String,
      enum: ['email', 'chat', 'phone', 'whatsapp', 'instagram', 'facebook', 'web_form'],
      default: 'email'
    },
    assignedTo: {
      type: String, // Agent name or ID
      index: true
    },
    tags: [String],
    // Timing metrics
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    firstResponseAt: Date,
    resolvedAt: {
      type: Date,
      index: true
    },
    closedAt: Date,
    // Calculated metrics
    firstResponseTime: {
      type: Number, // in minutes
    },
    resolutionTime: {
      type: Number, // in minutes
    },
    // Customer satisfaction
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    satisfactionFeedback: String,
    // Related data
    relatedTransactionId: String,
    relatedOrderId: String,
    // Internal notes
    internalNotes: [{
      note: String,
      addedBy: String,
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    // Responses
    responses: [{
      from: {
        type: String,
        enum: ['customer', 'agent', 'system']
      },
      message: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      agentName: String
    }]
  },
  {
    timestamps: true
  }
);

// Indexes for performance
supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ userId: 1, resolvedAt: -1 });
supportTicketSchema.index({ customerEmail: 1, createdAt: -1 });

// Pre-save middleware to calculate response and resolution times
supportTicketSchema.pre('save', function(next) {
  // Calculate first response time
  if (this.firstResponseAt && !this.firstResponseTime) {
    this.firstResponseTime = Math.round((this.firstResponseAt - this.createdAt) / (1000 * 60));
  }

  // Calculate resolution time
  if (this.resolvedAt && !this.resolutionTime) {
    this.resolutionTime = Math.round((this.resolvedAt - this.createdAt) / (1000 * 60));
  }

  // Auto-set resolvedAt when status changes to resolved
  if (this.isModified('status') && this.status === 'resolved' && !this.resolvedAt) {
    this.resolvedAt = new Date();
    this.resolutionTime = Math.round((this.resolvedAt - this.createdAt) / (1000 * 60));
  }

  next();
});

/**
 * Static method to get SAC metrics summary
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} SAC metrics
 */
supportTicketSchema.statics.getSACMetrics = async function(userId, startDate, endDate) {
  const tickets = await this.find({
    userId,
    createdAt: { $gte: startDate, $lte: endDate }
  });

  const totalTickets = tickets.length;
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

  // Calculate resolution rate
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;

  // Calculate average first response time
  const ticketsWithResponse = tickets.filter(t => t.firstResponseTime);
  const avgFirstResponseTime = ticketsWithResponse.length > 0
    ? ticketsWithResponse.reduce((sum, t) => sum + t.firstResponseTime, 0) / ticketsWithResponse.length
    : 0;

  // Convert minutes to hours
  const avgFirstResponseHours = avgFirstResponseTime / 60;

  // Calculate average resolution time
  const resolvedTicketsWithTime = tickets.filter(t => t.resolutionTime);
  const avgResolutionTime = resolvedTicketsWithTime.length > 0
    ? resolvedTicketsWithTime.reduce((sum, t) => sum + t.resolutionTime, 0) / resolvedTicketsWithTime.length
    : 0;

  const avgResolutionHours = avgResolutionTime / 60;

  // Calculate customer satisfaction
  const ticketsWithRating = tickets.filter(t => t.satisfactionRating);
  const avgSatisfaction = ticketsWithRating.length > 0
    ? ticketsWithRating.reduce((sum, t) => sum + t.satisfactionRating, 0) / ticketsWithRating.length
    : 0;

  // Tickets by priority
  const ticketsByPriority = {
    urgent: tickets.filter(t => t.priority === 'urgent').length,
    high: tickets.filter(t => t.priority === 'high').length,
    medium: tickets.filter(t => t.priority === 'medium').length,
    low: tickets.filter(t => t.priority === 'low').length
  };

  // Tickets by channel
  const ticketsByChannel = tickets.reduce((acc, t) => {
    acc[t.channel] = (acc[t.channel] || 0) + 1;
    return acc;
  }, {});

  return {
    totalTickets,
    resolvedTickets,
    openTickets,
    resolutionRate: parseFloat(resolutionRate.toFixed(2)),
    averageFirstResponseTimeHours: parseFloat(avgFirstResponseHours.toFixed(2)),
    averageResolutionTimeHours: parseFloat(avgResolutionHours.toFixed(2)),
    averageSatisfactionRating: parseFloat(avgSatisfaction.toFixed(2)),
    ticketsByPriority,
    ticketsByChannel,
    ticketsWithRating: ticketsWithRating.length
  };
};

/**
 * Static method to get tickets by status
 */
supportTicketSchema.statics.getTicketsByStatus = async function(userId, status, startDate, endDate) {
  return this.find({
    userId,
    status,
    createdAt: { $gte: startDate, $lte: endDate }
  }).sort({ createdAt: -1 });
};

/**
 * Static method to get overdue tickets (open for more than 24 hours)
 */
supportTicketSchema.statics.getOverdueTickets = async function(userId) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return this.find({
    userId,
    status: { $in: ['open', 'in_progress', 'waiting_customer'] },
    createdAt: { $lt: twentyFourHoursAgo }
  }).sort({ createdAt: 1 });
};

/**
 * Instance method to add a response
 */
supportTicketSchema.methods.addResponse = function(from, message, agentName = null) {
  this.responses.push({
    from,
    message,
    agentName,
    timestamp: new Date()
  });

  // Set first response time if this is the first agent response
  if (from === 'agent' && !this.firstResponseAt) {
    this.firstResponseAt = new Date();
    this.firstResponseTime = Math.round((this.firstResponseAt - this.createdAt) / (1000 * 60));
  }

  return this.save();
};

/**
 * Instance method to resolve ticket
 */
supportTicketSchema.methods.resolve = function() {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolutionTime = Math.round((this.resolvedAt - this.createdAt) / (1000 * 60));
  return this.save();
};

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
