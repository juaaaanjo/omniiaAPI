const TransactionData = require('../models/TransactionData');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Debug endpoint to check transaction integration status
 * @route GET /api/debug/transactions
 */
exports.debugTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const user = await User.findById(userId);

    // Check transaction count
    const transactionCount = await TransactionData.countDocuments({ userId });
    const debug = {
      user: {
        id: userId.toString(),
        email: user.email,
        integrations: {
          transactions: {
            connected: user.integrations.transactions?.connected || false,
            lastSync: user.integrations.transactions?.lastSync || null
          },
        }
      },
      dataCounts: {
        transactions: transactionCount,
        usingSource: transactionCount > 0 ? 'transactions' : 'none'
      },
      dateRange: {
        startDate: startDate || 'Not provided',
        endDate: endDate || 'Not provided'
      }
    };

    // If we have transaction data, get a sample
    if (transactionCount > 0) {
      const sampleTransactions = await TransactionData.find({ userId })
        .sort({ transactionCreatedAt: -1 })
        .limit(5)
        .select('-rawResponse')
        .lean();

      debug.sampleTransactions = sampleTransactions;

      // Get status breakdown
      const statusBreakdown = await TransactionData.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      debug.statusBreakdown = statusBreakdown;

      // If date range provided, get revenue summary
      if (startDate && endDate) {
        const revenueSummary = await TransactionData.getRevenueSummary(
          userId,
          new Date(startDate),
          new Date(endDate)
        );
        debug.revenueSummary = revenueSummary;
      }
    }

    // Check if there's data but it's outside the date range
    if (transactionCount > 0) {
      const oldestTransaction = await TransactionData.findOne({ userId })
        .sort({ transactionCreatedAt: 1 })
        .select('transactionCreatedAt')
        .lean();

      const newestTransaction = await TransactionData.findOne({ userId })
        .sort({ transactionCreatedAt: -1 })
        .select('transactionCreatedAt')
        .lean();

      debug.transactionDateRange = {
        oldest: oldestTransaction?.transactionCreatedAt,
        newest: newestTransaction?.transactionCreatedAt
      };
    }

    // Recommendations
    const recommendations = [];

    if (!user.integrations.transactions?.connected) {
      recommendations.push({
        issue: 'Transaction integration not enabled',
        fix: 'Enable it via: PUT /api/auth/integrations/transactions with { "connected": true }'
      });
    }

    if (transactionCount === 0) {
      recommendations.push({
        issue: 'No transaction data in database',
        fix: 'Sync data via: POST /api/data/sync/transactions'
      });
    }

    if (transactionCount > 0 && startDate && endDate) {
      const dateRangeStart = new Date(startDate);
      const dateRangeEnd = new Date(endDate);
      const transactionInRange = await TransactionData.countDocuments({
        userId,
        transactionCreatedAt: {
          $gte: dateRangeStart,
          $lte: dateRangeEnd
        }
      });

      if (transactionInRange === 0) {
        recommendations.push({
          issue: `No transactions in date range ${startDate} to ${endDate}`,
          fix: `Transactions exist from ${debug.transactionDateRange?.oldest} to ${debug.transactionDateRange?.newest}. Adjust your date range.`
        });
      }
    }

    debug.recommendations = recommendations;

    res.json({
      success: true,
      debug,
      tips: [
        'Check that transactions integration is enabled',
        'Verify transactions have been synced',
        'Ensure date range matches transaction dates',
        'Check that transactions have status "succeeded"'
      ]
    });

  } catch (error) {
    logger.error(`Debug transactions error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error debugging transactions',
      error: error.message
    });
  }
};

/**
 * Test revenue calculation endpoint
 * @route GET /api/debug/revenue-test
 */
exports.testRevenueCalculation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters required'
      });
    }

    const transactionCount = await TransactionData.countDocuments({ userId });

    const result = {
      dataSource: transactionCount > 0 ? 'transactions' : 'none',
      dateRange: { startDate, endDate },
      transactionCount
    };

    if (transactionCount > 0) {
      // Test transaction revenue calculation
      const revenueSummary = await TransactionData.getRevenueSummary(
        userId,
        new Date(startDate),
        new Date(endDate)
      );

      result.revenueSummary = revenueSummary;

      // Get transactions in range
      const transactionsInRange = await TransactionData.find({
        userId,
        transactionCreatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      })
      .select('transactionId amount status transactionCreatedAt currency')
      .lean();

      result.transactionsInRange = transactionsInRange.length;
      result.sampleTransactions = transactionsInRange.slice(0, 5);

    }

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logger.error(`Test revenue calculation error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error testing revenue calculation',
      error: error.message
    });
  }
};
