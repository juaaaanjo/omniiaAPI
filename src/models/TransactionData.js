const mongoose = require('mongoose');

const transactionDataSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Transaction identification
    transactionId: {
        type: String,
        required: true,
        index: true
    },

    // Amount details
    amount: {
        type: Number,
        required: true
    },
    amountInCents: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    netAmount: {
        type: Number // Amount after fees/adjustments
    },

    // Transaction status
    status: {
        type: String,
        enum: ['succeeded', 'pending', 'failed', 'refunded', 'partially_refunded', 'completed', 'cancelled'],
        required: true,
        index: true
    },

    // Customer information
    customerId: {
        type: String,
        index: true,
        default: null
    },
    customerEmail: {
        type: String,
        default: null
    },

    // Provider information
    providerId: {
        type: String,
        index: true,
        sparse: true, // Allow null values in index
        default: null
    },
    providerEarnings: {
        type: Number,
        default: null
    },

    // Payment method details
    paymentMethod: {
        type: String, // e.g., 'CARD', 'BANK_TRANSFER', 'CASH', etc.
        default: null
    },
    paymentMethodBrand: {
        type: String, // e.g., 'visa', 'mastercard'
        default: null
    },
    paymentMethodLast4: {
        type: String, // Last 4 digits
        default: null
    },

    // Reference
    reference: {
        type: String,
        default: null
    },

    // Timestamps from transaction system
    transactionCreatedAt: {
        type: Date,
        index: true
    },
    processedAt: {
        type: Date
    },

    // Raw response for audit trail
    rawResponse: {
        type: mongoose.Schema.Types.Mixed
    },

    // Sync metadata
    lastSyncedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Compound indexes for common queries
transactionDataSchema.index({ userId: 1, transactionCreatedAt: -1 });
transactionDataSchema.index({ userId: 1, status: 1, transactionCreatedAt: -1 });
transactionDataSchema.index({ userId: 1, providerId: 1, transactionCreatedAt: -1 });
transactionDataSchema.index({ userId: 1, customerId: 1 });

// Ensure unique transaction per user
transactionDataSchema.index({ userId: 1, transactionId: 1 }, { unique: true });

/**
 * Get revenue summary for a date range
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Revenue summary
 */
transactionDataSchema.statics.getRevenueSummary = async function(userId, startDate, endDate) {
    const matchStage = {
        userId: new mongoose.Types.ObjectId(userId),
        transactionCreatedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    const result = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRevenue: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['succeeded', 'completed']] },
                            '$amount',
                            0
                        ]
                    }
                },
                netRevenue: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['succeeded', 'completed']] },
                            { $ifNull: ['$netAmount', '$amount'] },
                            0
                        ]
                    }
                },
                totalTransactions: { $sum: 1 },
                successfulTransactions: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['succeeded', 'completed']] },
                            1,
                            0
                        ]
                    }
                },
                failedTransactions: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'failed'] },
                            1,
                            0
                        ]
                    }
                },
                refundedAmount: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['refunded', 'partially_refunded']] },
                            '$amount',
                            0
                        ]
                    }
                },
                totalProviderEarnings: {
                    $sum: { $ifNull: ['$providerEarnings', 0] }
                }
            }
        }
    ]);

    if (result.length === 0) {
        return {
            totalRevenue: 0,
            netRevenue: 0,
            totalTransactions: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            refundedAmount: 0,
            totalProviderEarnings: 0
        };
    }

    return result[0];
};

/**
 * Get daily revenue breakdown
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Daily revenue data
 */
transactionDataSchema.statics.getDailyRevenue = async function(userId, startDate, endDate) {
    const matchStage = {
        userId: new mongoose.Types.ObjectId(userId),
        transactionCreatedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        },
        status: { $in: ['succeeded', 'completed'] }
    };

    const result = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$transactionCreatedAt' }
                },
                dailyRevenue: { $sum: '$amount' },
                dailyNetRevenue: { $sum: { $ifNull: ['$netAmount', '$amount'] } },
                transactionCount: { $sum: 1 },
                providerEarnings: { $sum: { $ifNull: ['$providerEarnings', 0] } }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                date: '$_id',
                revenue: '$dailyRevenue',
                netRevenue: '$dailyNetRevenue',
                transactionCount: 1,
                providerEarnings: 1
            }
        }
    ]);

    return result;
};

/**
 * Get failed transactions
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Failed transactions
 */
transactionDataSchema.statics.getFailedTransactions = async function(userId, startDate, endDate) {
    return this.find({
        userId,
        status: 'failed',
        transactionCreatedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    })
    .sort({ transactionCreatedAt: -1 })
    .select('-rawResponse') // Exclude large raw response
    .lean();
};

/**
 * Get transactions by provider
 * @param {string} userId - User ID
 * @param {string} providerId - Provider ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Provider transactions
 */
transactionDataSchema.statics.getProviderTransactions = async function(userId, providerId, startDate, endDate) {
    const matchStage = {
        userId: new mongoose.Types.ObjectId(userId),
        providerId,
        transactionCreatedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    const result = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$amount' },
                totalEarnings: { $sum: { $ifNull: ['$providerEarnings', 0] } },
                transactionCount: { $sum: 1 },
                successfulTransactions: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['succeeded', 'completed']] },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    if (result.length === 0) {
        return {
            totalRevenue: 0,
            totalEarnings: 0,
            transactionCount: 0,
            successfulTransactions: 0
        };
    }

    return result[0];
};

/**
 * Get customer transaction history
 * @param {string} userId - User ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Customer transactions
 */
transactionDataSchema.statics.getCustomerTransactions = async function(userId, customerId) {
    return this.find({
        userId,
        customerId
    })
    .sort({ transactionCreatedAt: -1 })
    .select('-rawResponse')
    .lean();
};

const TransactionData = mongoose.model('TransactionData', transactionDataSchema);

module.exports = TransactionData;
