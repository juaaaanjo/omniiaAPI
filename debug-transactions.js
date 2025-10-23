/**
 * Debug script to verify transaction integration
 * Run with: node debug-transactions.js <userId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const TransactionData = require('./src/models/TransactionData');
const config = require('./src/config/env');

async function debugTransactions(userId) {
    try {
        console.log('🔍 Starting Transaction Debug...\n');

        // Connect to MongoDB
        await mongoose.connect(config.mongodbUri);
        console.log('✅ Connected to MongoDB\n');

        // 1. Check User Integration Status
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('1. USER INTEGRATION STATUS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ User not found:', userId);
            process.exit(1);
        }

        console.log('User:', user.email);
        console.log('\nIntegrations:');
        console.log('  Transactions:', {
            connected: user.integrations.transactions?.connected || false,
            lastSync: user.integrations.transactions?.lastSync || 'Never'
        });

        // 2. Check Transaction Records
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('2. TRANSACTION DATA IN DATABASE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const transactionCount = await TransactionData.countDocuments({ userId });
        console.log('Total Transactions:', transactionCount);

        if (transactionCount === 0) {
            console.log('⚠️  NO TRANSACTIONS FOUND');
            console.log('   This is why you\'re seeing zeros!');
            console.log('\n   To fix:');
            console.log('   1. Enable integration: user.integrations.transactions.connected = true');
            console.log('   2. Sync data: POST /api/data/sync/transactions');
        } else {
            // Show sample transactions
            const sampleTransactions = await TransactionData.find({ userId })
                .sort({ transactionCreatedAt: -1 })
                .limit(5)
                .lean();

            console.log('\nSample Transactions (latest 5):');
            sampleTransactions.forEach((tx, i) => {
                console.log(`\n  ${i + 1}. ID: ${tx.transactionId}`);
                console.log(`     Amount: ${tx.amount} ${tx.currency}`);
                console.log(`     Status: ${tx.status}`);
                console.log(`     Provider: ${tx.providerId || 'N/A'}`);
                console.log(`     Date: ${tx.transactionCreatedAt}`);
            });

            // Status breakdown
            const statuses = await TransactionData.aggregate([
                { $match: { userId: mongoose.Types.ObjectId(userId) } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);

            console.log('\n  Status Breakdown:');
            statuses.forEach(s => {
                console.log(`    ${s._id}: ${s.count}`);
            });
        }

        // 3. Test Revenue Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('3. REVENUE CALCULATION TEST');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const testStartDate = new Date('2025-01-01');
        const testEndDate = new Date('2025-12-31');

        console.log(`Date Range: ${testStartDate.toISOString().split('T')[0]} to ${testEndDate.toISOString().split('T')[0]}`);

        if (transactionCount > 0) {
            const summary = await TransactionData.getRevenueSummary(
                userId,
                testStartDate,
                testEndDate
            );

            console.log('\nTransaction Revenue Summary:');
            console.log('  Total Revenue:', summary.totalRevenue);
            console.log('  Net Revenue:', summary.netRevenue);
            console.log('  Total Transactions:', summary.totalTransactions);
            console.log('  Successful:', summary.successfulTransactions);
            console.log('  Failed:', summary.failedTransactions);
            console.log('  Refunded Amount:', summary.refundedAmount);

            if (summary.totalRevenue === 0) {
                console.log('\n⚠️  REVENUE IS ZERO');
                console.log('   Possible reasons:');
                console.log('   1. No transactions in date range');
                console.log('   2. All transactions have status other than "succeeded"');
                console.log('   3. Date range doesn\'t match transaction dates');
            }
        }

        // 5. Check Dashboard Response
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('4. DASHBOARD LOGIC TEST');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Simulate dashboard logic
        let paymentData = {};
        if (transactionCount > 0) {
            console.log('✅ Using Transaction Data');
            paymentData = await TransactionData.getRevenueSummary(
                userId,
                testStartDate,
                testEndDate
            );
        } else {
            console.log('❌ No payment data available');
        }

        console.log('\nPayment Data for Dashboard:');
        console.log('  Total Revenue:', paymentData.totalRevenue || 0);
        console.log('  Net Revenue:', paymentData.netRevenue || 0);
        console.log('  Transactions:', paymentData.successfulTransactions || paymentData.totalCharges || 0);
        console.log('  Source:', transactionCount > 0 ? 'transactions' : 'none');

        // 6. Environment Check
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('5. ENVIRONMENT CONFIGURATION');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('Transaction API URL:', config.transactionApiUrl || '❌ NOT SET');
        if (!config.transactionApiUrl) {
            console.log('⚠️  Set TRANSACTION_API_URL in .env file');
        }

        // 7. Recommendations
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('6. RECOMMENDATIONS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (!user.integrations.transactions?.connected) {
            console.log('❌ ISSUE: Transaction integration not enabled');
            console.log('   FIX: Enable it with this command:');
            console.log(`   > db.users.updateOne({_id: ObjectId("${userId}")}, {$set: {"integrations.transactions.connected": true}})`);
            console.log('   Or via API: PUT /api/auth/integrations/transactions\n');
        }

        if (transactionCount === 0) {
            console.log('❌ ISSUE: No transaction data in database');
            console.log('   FIX: Sync transactions with:');
            console.log(`   curl -X POST http://localhost:5000/api/data/sync/transactions \\`);
            console.log(`     -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
            console.log(`     -H "Content-Type: application/json" \\`);
            console.log(`     -d '{"startDate": "2025-01-01", "endDate": "2025-12-31"}'\n`);
        }

        if (transactionCount > 0 && paymentData.totalRevenue === 0) {
            console.log('⚠️  ISSUE: Transactions exist but revenue is zero');
            console.log('   CHECK:');
            console.log('   1. Verify date range matches transaction dates');
            console.log('   2. Ensure transactions have status "succeeded"');
            console.log('   3. Check transaction amounts are not zero\n');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
const userId = process.argv[2];

if (!userId) {
    console.error('Usage: node debug-transactions.js <userId>');
    console.error('Example: node debug-transactions.js 507f1f77bcf86cd799439011');
    process.exit(1);
}

debugTransactions(userId);
