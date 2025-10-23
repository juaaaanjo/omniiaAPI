# Transaction Endpoint Integration Guide

This guide explains how to set up and use the dedicated transaction endpoint integration for financial data.

## Overview

The transaction integration fetches payment data from your Google Cloud Function endpoint at:
```
https://getadmin-transactions-1092365299699.us-east1.run.app
```

This acts as the primary source of financial transaction data while maintaining compatibility with existing dashboards and analytics.

## Architecture

### New Components

1. **TransactionService** (`src/services/transactionService.js`)
   - Fetches transaction data from the Google Cloud endpoint
   - Handles pagination and rate limiting
   - Transforms API responses to database format
   - Syncs data to MongoDB

2. **TransactionData Model** (`src/models/TransactionData.js`)
   - MongoDB schema for storing transaction data
   - Includes aggregation methods for analytics
   - Provides revenue summaries and daily breakdowns

3. **API Endpoints**
   - `POST /api/data/sync/transactions` - Sync transaction data
   - Integrated into existing dashboard endpoints

## Setup Instructions

### 1. Environment Configuration

Add the transaction endpoint URL to your `.env` file:

```bash
# Transaction API (Google Cloud Function)
TRANSACTION_API_URL=https://getadmin-transactions-1092365299699.us-east1.run.app
```

### 2. Enable Transaction Integration

Update your user's integration settings in MongoDB or through the API:

```javascript
// Example: Enable transactions integration for a user
await User.findByIdAndUpdate(userId, {
  'integrations.transactions.connected': true
});
```

### 3. Sync Transaction Data

Use the sync endpoint to fetch and store transaction data:

```bash
curl -X POST http://localhost:5000/api/data/sync/transactions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }'
```

### 4. Verify Data

Check that transactions are being stored:

```bash
curl -X GET http://localhost:5000/api/data/sync/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## API Response Structure

### Transaction Data Format

The endpoint returns transactions in this format:

```json
{
  "transactions": [
    {
      "id": "8KzGeWQ6ehGvxsSxcF7x",
      "amount": 61900,                    // Amount in CENTS (619.00 COP)
      "amountInCents": 6190000,           // Optional: Some transactions may not have this
      "currency": "COP",                  // Colombian Pesos
      "status": "APPROVED",               // Status: APPROVED, DECLINED, PENDING
      "providerId": "dEBsweJXtwZufjgatFPO", // Optional: Can be null
      "customerId": "ebkN6lraMtNwmkzdM91h",
      "customerEmail": "kevinzuluagaospina98@gmail.com",
      "reference": "OMMEO1758216759524546",
      "createdAt": "2025-09-18T17:32:45.802Z",
      "processedAt": "2025-09-18T17:32:45.802Z",
      "displayAmount": "COP 619",         // For display purposes
      "paymentMethod": "CARD",            // Payment method type
      "cardLast4": "0019",                // Last 4 digits
      "providerEarnings": 60000           // Matches transaction currency, can be null
    }
  ],
  "pagination": {
    "hasMore": false,
    "lastDocumentId": "ySRiHzatoUHWwZiaZ4yW",
    "count": 6
  },
  "requestId": "req_1761141490340_nk9m5s9jm",
  "timestamp": "2025-10-22T13:58:11.559Z"
}
```

### Important Notes

**Amount Handling:**
- `amount` field is expressed in the transaction currency (e.g. COP)
- `amountInCents` may be present and is divided by 100 to obtain the stored amount
- `providerEarnings` is preserved in the same currency/scale as `amount`

**Status Values:**
- API returns: `APPROVED`, `DECLINED`, `PENDING`, `REFUNDED`, `CANCELLED`
- System maps to: `succeeded`, `failed`, `pending`, `refunded`, `cancelled`

**Optional Fields:**
- `providerId` - Can be null/missing
- `amountInCents` - May not be present (falls back to `amount`)
- `providerEarnings` - Can be null

**Currency:**
- Default is `COP` (Colombian Pesos)
- All amounts stored in database as dollars (cents / 100) for consistency

## Database Schema

Transactions are stored with the following fields:

- `transactionId` - Unique transaction identifier
- `amount` - Amount in transaction currency
- `amountInCents` - Raw amount in cents (if provided)
- `currency` - Currency code (USD, EUR, etc.)
- `status` - Transaction status (succeeded, pending, failed, refunded)
- `customerId` - Customer identifier
- `customerEmail` - Customer email
- `providerId` - Provider/merchant identifier
- `providerEarnings` - Amount earned by provider after fees
- `paymentMethod` - Payment method type
- `paymentMethodLast4` - Last 4 digits of payment method
- `transactionCreatedAt` - When transaction was created
- `processedAt` - When transaction was processed

## Dashboard Integration

The dashboard automatically uses transaction data when available:

### Fallback Logic

### Affected Dashboard Endpoints

- `GET /api/dashboard/kpis` - Overall KPIs including payment data
- `GET /api/dashboard/sales` - Sales dashboard with daily revenue
- `GET /api/dashboard/finance` - Finance dashboard with payment summaries

### Response Indicators

Dashboard responses include a `source` field to indicate data source:

```json
{
  "payments": {
    "totalRevenue": 150000,
    "netRevenue": 145500,
    "totalTransactions": 1250,
    "source": "transactions"
  }
}
```

## Available Analytics

### Revenue Summary

Get aggregated revenue data:

```javascript
const summary = await TransactionData.getRevenueSummary(userId, startDate, endDate);
// Returns:
// {
//   totalRevenue: 150000,
//   netRevenue: 145500,
//   totalTransactions: 1250,
//   successfulTransactions: 1200,
//   failedTransactions: 50,
//   refundedAmount: 5000,
//   totalProviderEarnings: 140000
// }
```

### Daily Revenue Breakdown

Get day-by-day revenue:

```javascript
const dailyData = await TransactionData.getDailyRevenue(userId, startDate, endDate);
// Returns array:
// [
//   {
//     date: "2024-01-15",
//     revenue: 5000,
//     netRevenue: 4850,
//     transactionCount: 25,
//     providerEarnings: 4750
//   },
//   ...
// ]
```

### Failed Transactions

Get list of failed transactions:

```javascript
const failed = await TransactionData.getFailedTransactions(userId, startDate, endDate);
```

### Provider Analysis

Get transactions by provider:

```javascript
const providerStats = await TransactionData.getProviderTransactions(
  userId,
  providerId,
  startDate,
  endDate
);
```

## Sync Workflow

### Manual Sync

```bash
POST /api/data/sync/transactions
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

### Full Sync (All Sources)

```bash
POST /api/data/sync/all
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

This will sync transactions alongside your Meta Ads data.

## Filters and Pagination

The transaction service supports filtering:

```javascript
// Filter by status
await TransactionService.syncToDatabase(userId, startDate, endDate, {
  status: 'succeeded'
});

// Filter by provider
await TransactionService.syncToDatabase(userId, startDate, endDate, {
  providerId: 'provider_abc'
});

// Multiple filters
await TransactionService.syncToDatabase(userId, startDate, endDate, {
  status: 'succeeded',
  providerId: 'provider_abc'
});
```

## Error Handling

The service includes comprehensive error handling:

- Network timeouts (30 seconds)
- Rate limiting with automatic delays
- Validation of API responses
- Logging of errors and sync status

Check logs in `/logs/error.log` and `/logs/combined.log` for troubleshooting.

## Testing

### 1. Test Connection

```javascript
// Test fetching from the endpoint
const TransactionService = require('./src/services/transactionService');

try {
  const result = await TransactionService.getTransactions({ limit: 10 });
  console.log('Connection successful:', result);
} catch (error) {
  console.error('Connection failed:', error.message);
}
```

### 2. Test Sync

```javascript
// Test syncing to database
const result = await TransactionService.syncToDatabase(
  userId,
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log('Sync result:', result);
// {
//   totalFetched: 500,
//   synced: 450,
//   updated: 50,
//   errors: 0,
//   success: true
// }
```

### 3. Test Analytics

```javascript
// Test revenue summary
const summary = await TransactionData.getRevenueSummary(
  userId,
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log('Revenue summary:', summary);
```

## Performance Considerations

- Pagination: Endpoint returns max 50 transactions per request
- Rate Limiting: 100ms delay between paginated requests
- Max Pages: Default limit of 10 pages (500 transactions) per sync
- Caching: Consider implementing Redis caching for frequent queries

## Security

- Endpoint URL stored in environment variables
- JWT authentication required for all API calls
- User data isolated by userId in database
- Raw transaction responses stored for audit trail

## Troubleshooting

### No Data Showing in Dashboard

1. Check if transactions integration is enabled:
   ```javascript
   user.integrations.transactions.connected === true
   ```

2. Verify transactions exist in database:
   ```javascript
   await TransactionData.countDocuments({ userId })
   ```

3. Check sync status:
   ```bash
   GET /api/data/sync/status
   ```

### Sync Failures

1. Verify endpoint URL in `.env`
2. Check network connectivity to Google Cloud endpoint
3. Review logs for specific error messages
4. Ensure endpoint is returning expected JSON format

### Data Discrepancies

1. Compare sync date ranges
2. Check for filtering in sync parameters
3. Verify transaction status mapping
4. Review provider earnings calculations

## Support

For issues or questions:
- Check logs in `/logs/` directory
- Review MongoDB for raw transaction data
- Examine `rawResponse` field in TransactionData for original API response
- Test endpoint directly: `curl https://getadmin-transactions-1092365299699.us-east1.run.app`
