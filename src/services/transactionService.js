const axios = require('axios');
const logger = require('../utils/logger');
const TransactionData = require('../models/TransactionData');
const config = require('../config/env');

/**
 * Service for fetching and managing transaction data from the dedicated endpoint
 */
class TransactionService {
    constructor() {
        this.apiUrl = config.transactionApiUrl;

        if (!this.apiUrl) {
            logger.warn('Transaction API URL not configured. Set TRANSACTION_API_URL in environment.');
        }
    }

    /**
     * Fetch transactions from the dedicated endpoint
     * @param {Object} options - Query options
     * @param {number} options.limit - Number of transactions to fetch (max 50)
     * @param {string} options.status - Filter by status (optional)
     * @param {string} options.providerId - Filter by provider (optional)
     * @param {string} options.startAfter - Document ID for pagination (optional)
     * @returns {Promise<Object>} Transaction list with pagination info
     */
    async getTransactions(options = {}) {
        try {
            const { limit = 50, status, providerId, startAfter } = options;

            // Build query parameters
            const params = {
                limit: Math.min(limit, 50)
            };

            if (status) params.status = status;
            if (providerId) params.providerId = providerId;
            if (startAfter) params.startAfter = startAfter;

            logger.info('Fetching transactions from endpoint', { params });

            const response = await axios.get(this.apiUrl, {
                params,
                timeout: 30000 // 30 second timeout
            });

            if (response.data && response.data.transactions) {
                logger.info(`Fetched ${response.data.transactions.length} transactions`);
                return response.data;
            }

            throw new Error('Invalid response format from transaction endpoint');

        } catch (error) {
            logger.error('Error fetching transactions from endpoint', {
                error: error.message,
                url: this.apiUrl,
                options
            });
            throw new Error(`Failed to fetch transactions: ${error.message}`);
        }
    }

    /**
     * Fetch all transactions with pagination
     * @param {Object} filters - Filter options
     * @param {string} filters.status - Filter by status
     * @param {string} filters.providerId - Filter by provider
     * @param {number} maxPages - Maximum pages to fetch (default: 10)
     * @returns {Promise<Array>} All transactions
     */
    async getAllTransactions(filters = {}, maxPages = 10) {
        try {
            const allTransactions = [];
            let hasMore = true;
            let startAfter = null;
            let pageCount = 0;

            while (hasMore && pageCount < maxPages) {
                const response = await this.getTransactions({
                    ...filters,
                    limit: 50,
                    startAfter
                });

                allTransactions.push(...response.transactions);

                hasMore = response.pagination?.hasMore || false;
                startAfter = response.pagination?.lastDocumentId || null;
                pageCount++;

                // Add delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            logger.info(`Fetched total of ${allTransactions.length} transactions across ${pageCount} pages`);
            return allTransactions;

        } catch (error) {
            logger.error('Error fetching all transactions', { error: error.message });
            throw error;
        }
    }

    /**
     * Sync transactions to database
     * @param {string} userId - User ID to associate transactions with
     * @param {Date} startDate - Start date for filtering (optional)
     * @param {Date} endDate - End date for filtering (optional)
     * @param {Object} filters - Additional filters (status, providerId)
     * @returns {Promise<Object>} Sync results
     */
    async syncToDatabase(userId, startDate = null, endDate = null, filters = {}) {
        try {
            logger.info('Starting transaction sync to database', {
                userId,
                startDate,
                endDate,
                filters
            });

            // Fetch all transactions from the endpoint
            const transactions = await this.getAllTransactions(filters);

            let syncedCount = 0;
            let updatedCount = 0;
            let errorCount = 0;
            const processedTransactionIds = new Set();

            for (const transaction of transactions) {
                try {
                    // Filter by date if provided
                    if (startDate || endDate) {
                        const transactionDate = new Date(transaction.createdAt);

                        if (startDate && transactionDate < new Date(startDate)) {
                            continue;
                        }

                        if (endDate && transactionDate > new Date(endDate)) {
                            continue;
                        }
                    }

                    // Track processed transactions for cleanup
                    processedTransactionIds.add(transaction.id);

                    // Transform and store in database
                    const transactionData = this.transformTransaction(transaction, userId);

                    const result = await TransactionData.findOneAndUpdate(
                        {
                            userId,
                            transactionId: transaction.id
                        },
                        transactionData,
                        {
                            upsert: true,
                            new: true,
                            setDefaultsOnInsert: true
                        }
                    );

                    if (result.isNew) {
                        syncedCount++;
                    } else {
                        updatedCount++;
                    }

                } catch (error) {
                    logger.error('Error syncing individual transaction', {
                        transactionId: transaction.id,
                        error: error.message
                    });
                    errorCount++;
                }
            }

            // Remove transactions that no longer exist in source within the synced window
            let deletedCount = 0;
            if (processedTransactionIds.size > 0) {
                const cleanupFilter = {
                    userId,
                    transactionId: { $nin: Array.from(processedTransactionIds) }
                };

                if (startDate || endDate) {
                    cleanupFilter.transactionCreatedAt = {};
                    if (startDate) cleanupFilter.transactionCreatedAt.$gte = new Date(startDate);
                    if (endDate) cleanupFilter.transactionCreatedAt.$lte = new Date(endDate);
                    if (Object.keys(cleanupFilter.transactionCreatedAt).length === 0) {
                        delete cleanupFilter.transactionCreatedAt;
                    }
                }

                const deleteResult = await TransactionData.deleteMany(cleanupFilter);
                deletedCount = deleteResult.deletedCount || 0;
            }

            const summary = {
                totalFetched: transactions.length,
                synced: syncedCount,
                updated: updatedCount,
                deleted: deletedCount,
                errors: errorCount,
                success: errorCount === 0
            };

            logger.info('Transaction sync completed', summary);
            return summary;

        } catch (error) {
            logger.error('Error syncing transactions to database', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Transform transaction from API format to database format
     * @param {Object} transaction - Raw transaction from API
     * @param {string} userId - User ID
     * @returns {Object} Transformed transaction data
     */
    transformTransaction(transaction, userId) {
        // Handle amount: prefer amountInCents when available, converting to the
        // provider-reported currency scale (divide by 100). Otherwise fallback to the raw amount.
        const amountInCents = transaction.amountInCents || transaction.amount || 0;
        const amountValue = amountInCents / 100;

        // Map status from API format to standardized format
        const statusMap = {
            'APPROVED': 'succeeded',
            'DECLINED': 'failed',
            'PENDING': 'pending',
            'REFUNDED': 'refunded',
            'CANCELLED': 'cancelled'
        };
        const status = statusMap[transaction.status] || transaction.status?.toLowerCase() || 'pending';

        // Calculate net amount from provider earnings if available (same currency scale)
        let netAmount = amountValue;
        if (transaction.providerEarnings !== null && transaction.providerEarnings !== undefined) {
            netAmount = transaction.providerEarnings;
        }

        return {
            userId,
            transactionId: transaction.id,

            // Amount details - store in dollars for consistency with rest of system
            amount: amountValue,
            amountInCents: amountInCents,
            currency: transaction.currency || 'COP',
            netAmount,

        // Status - normalized to match internal convention
            status,

            // Customer information
            customerId: transaction.customerId || null,
            customerEmail: transaction.customerEmail || null,

            // Provider information (can be null)
            providerId: transaction.providerId || null,
            providerEarnings: transaction.providerEarnings !== null && transaction.providerEarnings !== undefined
                ? transaction.providerEarnings
                : null,

            // Payment method
            paymentMethod: transaction.paymentMethod || null,
            paymentMethodBrand: transaction.paymentMethod || null,
            paymentMethodLast4: transaction.cardLast4 || null,

            // Reference
            reference: transaction.reference || null,

            // Timestamps
            transactionCreatedAt: transaction.createdAt ? new Date(transaction.createdAt) : null,
            processedAt: transaction.processedAt ? new Date(transaction.processedAt) : null,

            // Store raw response for reference and debugging
            rawResponse: transaction,

            // Sync metadata
            lastSyncedAt: new Date()
        };
    }

    /**
     * Get transaction statistics for a date range
     * @param {string} userId - User ID
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Transaction statistics
     */
    async getTransactionStats(userId, startDate, endDate) {
        try {
            const stats = await TransactionData.getRevenueSummary(userId, startDate, endDate);
            return stats;
        } catch (error) {
            logger.error('Error getting transaction statistics', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get daily transaction breakdown
     * @param {string} userId - User ID
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Array>} Daily transaction data
     */
    async getDailyTransactions(userId, startDate, endDate) {
        try {
            const dailyData = await TransactionData.getDailyRevenue(userId, startDate, endDate);
            return dailyData;
        } catch (error) {
            logger.error('Error getting daily transactions', {
                userId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new TransactionService();
