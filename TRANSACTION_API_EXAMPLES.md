# Transaction API Examples

This document shows real examples of how the transaction API data is transformed and stored.

## Real API Response Example

```json
{
  "transactions": [
    {
      "id": "8KzGeWQ6ehGvxsSxcF7x",
      "amount": 61900,
      "amountInCents": 6190000,
      "currency": "COP",
      "status": "APPROVED",
      "providerId": "dEBsweJXtwZufjgatFPO",
      "customerId": "ebkN6lraMtNwmkzdM91h",
      "customerEmail": "kevinzuluagaospina98@gmail.com",
      "reference": "OMMEO1758216759524546",
      "createdAt": "2025-09-18T17:32:45.802Z",
      "processedAt": "2025-09-18T17:32:45.802Z",
      "displayAmount": "COP 619",
      "paymentMethod": "CARD",
      "cardLast4": "0019",
      "providerEarnings": 60000
    },
    {
      "id": "tXH9wmaQuReqm0MV7Ffe",
      "amount": 91900,
      "amountInCents": 9190000,
      "currency": "COP",
      "status": "DECLINED",
      "providerId": "DqtIthndquetafyJ34Yu",
      "customerId": "sZBrpMAF3VqGWJPAW92p",
      "customerEmail": "lassofabian36@gmail.com",
      "reference": "OMMEO1756923029813400",
      "createdAt": "2025-09-03T18:10:36.406Z",
      "processedAt": "2025-09-03T18:10:36.406Z",
      "displayAmount": "COP 919",
      "paymentMethod": "CARD",
      "cardLast4": "1111",
      "providerEarnings": 90000
    },
    {
      "id": "ySRiHzatoUHWwZiaZ4yW",
      "amount": 9190000,
      "currency": "COP",
      "status": "APPROVED",
      "customerId": "8R4zvzIY5izO7G6WPic2",
      "customerEmail": "perez.juanjo1974@gmail.com",
      "reference": "OMMEO175642893060057",
      "createdAt": "2025-08-29T00:55:36.064Z",
      "processedAt": "2025-08-29T00:55:36.064Z",
      "displayAmount": "COP 91,900",
      "paymentMethod": "CARD",
      "cardLast4": "4242",
      "providerEarnings": null
    }
  ]
}
```

## Transformation Examples

### Example 1: Standard Approved Transaction

**API Response:**
```json
{
  "id": "8KzGeWQ6ehGvxsSxcF7x",
  "amount": 61900,
  "amountInCents": 6190000,
  "currency": "COP",
  "status": "APPROVED",
  "providerId": "dEBsweJXtwZufjgatFPO",
  "customerId": "ebkN6lraMtNwmkzdM91h",
  "customerEmail": "kevinzuluagaospina98@gmail.com",
  "reference": "OMMEO1758216759524546",
  "createdAt": "2025-09-18T17:32:45.802Z",
  "processedAt": "2025-09-18T17:32:45.802Z",
  "paymentMethod": "CARD",
  "cardLast4": "0019",
  "providerEarnings": 60000
}
```

**Transformed to Database:**
```javascript
{
  transactionId: "8KzGeWQ6ehGvxsSxcF7x",
  amount: 619.00,                    // Converted: 61900 / 100
  amountInCents: 6190000,            // Original value (inconsistent in API)
  currency: "COP",
  status: "succeeded",               // Mapped: APPROVED -> succeeded
  providerId: "dEBsweJXtwZufjgatFPO",
  customerId: "ebkN6lraMtNwmkzdM91h",
  customerEmail: "kevinzuluagaospina98@gmail.com",
  reference: "OMMEO1758216759524546",
  paymentMethod: "CARD",
  paymentMethodBrand: "CARD",
  paymentMethodLast4: "0019",
  providerEarnings: 600.00,          // Converted: 60000 / 100
  netAmount: 600.00,                 // Same as provider earnings
  transactionCreatedAt: Date("2025-09-18T17:32:45.802Z"),
  processedAt: Date("2025-09-18T17:32:45.802Z")
}
```

**Analytics Calculation:**
```javascript
// Gross Revenue: 619.00 COP
// Net Revenue (Provider Earnings): 600.00 COP
// Platform Fee: 19.00 COP (3.07%)
```

### Example 2: Declined Transaction

**API Response:**
```json
{
  "id": "tXH9wmaQuReqm0MV7Ffe",
  "amount": 91900,
  "amountInCents": 9190000,
  "currency": "COP",
  "status": "DECLINED",
  "providerId": "DqtIthndquetafyJ34Yu",
  "customerId": "sZBrpMAF3VqGWJPAW92p",
  "customerEmail": "lassofabian36@gmail.com",
  "reference": "OMMEO1756923029813400",
  "createdAt": "2025-09-03T18:10:36.406Z",
  "paymentMethod": "CARD",
  "cardLast4": "1111",
  "providerEarnings": 90000
}
```

**Transformed to Database:**
```javascript
{
  transactionId: "tXH9wmaQuReqm0MV7Ffe",
  amount: 919.00,                    // Converted: 91900 / 100
  amountInCents: 9190000,
  currency: "COP",
  status: "failed",                  // Mapped: DECLINED -> failed
  providerId: "DqtIthndquetafyJ34Yu",
  customerId: "sZBrpMAF3VqGWJPAW92p",
  customerEmail: "lassofabian36@gmail.com",
  reference: "OMMEO1756923029813400",
  paymentMethod: "CARD",
  paymentMethodBrand: "CARD",
  paymentMethodLast4: "1111",
  providerEarnings: 900.00,
  netAmount: 900.00,
  transactionCreatedAt: Date("2025-09-03T18:10:36.406Z")
}
```

**Note:** Declined transactions still have `providerEarnings` but won't be included in revenue calculations (status = 'failed')

### Example 3: Transaction with Missing Fields

**API Response:**
```json
{
  "id": "ySRiHzatoUHWwZiaZ4yW",
  "amount": 9190000,
  "currency": "COP",
  "status": "APPROVED",
  "customerId": "8R4zvzIY5izO7G6WPic2",
  "customerEmail": "perez.juanjo1974@gmail.com",
  "reference": "OMMEO175642893060057",
  "createdAt": "2025-08-29T00:55:36.064Z",
  "paymentMethod": "CARD",
  "cardLast4": "4242",
  "providerEarnings": null
}
```

**Transformed to Database:**
```javascript
{
  transactionId: "ySRiHzatoUHWwZiaZ4yW",
  amount: 91900.00,                  // amount field is in cents (9190000 / 100)
  amountInCents: 9190000,            // Falls back to amount field
  currency: "COP",
  status: "succeeded",
  providerId: null,                  // MISSING in API response
  customerId: "8R4zvzIY5izO7G6WPic2",
  customerEmail: "perez.juanjo1974@gmail.com",
  reference: "OMMEO175642893060057",
  paymentMethod: "CARD",
  paymentMethodBrand: "CARD",
  paymentMethodLast4: "4242",
  providerEarnings: null,            // NULL in API response
  netAmount: 91900.00,               // Falls back to amount
  transactionCreatedAt: Date("2025-08-29T00:55:36.064Z")
}
```

**Handling:**
- Missing `amountInCents` → uses `amount` field
- Missing `providerId` → stores as `null`
- `providerEarnings: null` → `netAmount` falls back to `amount`

## Status Mapping

```javascript
const statusMap = {
  'APPROVED': 'succeeded',
  'DECLINED': 'failed',
  'PENDING': 'pending',
  'REFUNDED': 'refunded',
  'CANCELLED': 'cancelled'
};
```

## Revenue Calculation Examples

### Example Dataset
```javascript
const transactions = [
  { status: 'APPROVED', amount: 61900, providerEarnings: 60000 },
  { status: 'APPROVED', amount: 3900, providerEarnings: 2000 },
  { status: 'DECLINED', amount: 91900, providerEarnings: 90000 },
  { status: 'APPROVED', amount: 9190000, providerEarnings: null }
];
```

### Revenue Summary Calculation

```javascript
// Using TransactionData.getRevenueSummary()
{
  totalRevenue: 92938.00,          // Only APPROVED: (619 + 39 + 91900) COP
  netRevenue: 92362.00,            // Provider earnings: (600 + 20 + 91900)
  totalTransactions: 4,
  successfulTransactions: 3,        // Only APPROVED count
  failedTransactions: 1,            // DECLINED count
  refundedAmount: 0,
  totalProviderEarnings: 92520.00  // Sum of all provider earnings
}
```

### Daily Revenue Breakdown

```javascript
// Using TransactionData.getDailyRevenue()
[
  {
    date: "2025-09-18",
    revenue: 619.00,
    netRevenue: 600.00,
    transactionCount: 1,
    providerEarnings: 600.00
  },
  {
    date: "2025-09-12",
    revenue: 39.00,
    netRevenue: 20.00,
    transactionCount: 1,
    providerEarnings: 20.00
  },
  {
    date: "2025-08-29",
    revenue: 91900.00,
    netRevenue: 91900.00,
    transactionCount: 1,
    providerEarnings: 0  // null treated as 0
  }
]
```

## Query Examples

### Get All Approved Transactions
```javascript
const approved = await TransactionData.find({
  userId: user._id,
  status: 'succeeded'
}).sort({ transactionCreatedAt: -1 });
```

### Get Transactions by Provider
```javascript
const providerStats = await TransactionData.getProviderTransactions(
  userId,
  'dEBsweJXtwZufjgatFPO',
  startDate,
  endDate
);

// Returns:
// {
//   totalRevenue: 619.00,
//   totalEarnings: 600.00,
//   transactionCount: 1,
//   successfulTransactions: 1
// }
```

### Get Failed Transactions
```javascript
const failed = await TransactionData.getFailedTransactions(
  userId,
  startDate,
  endDate
);

// Returns array of failed transactions with details
```

### Get Transactions Without Provider
```javascript
const noProvider = await TransactionData.find({
  userId: user._id,
  providerId: null
});
```

## Testing with Real Data

```javascript
// Test transformation
const TransactionService = require('./src/services/transactionService');

const sampleTransaction = {
  "id": "8KzGeWQ6ehGvxsSxcF7x",
  "amount": 61900,
  "amountInCents": 6190000,
  "currency": "COP",
  "status": "APPROVED",
  "providerId": "dEBsweJXtwZufjgatFPO",
  "customerId": "ebkN6lraMtNwmkzdM91h",
  "customerEmail": "kevinzuluagaospina98@gmail.com",
  "reference": "OMMEO1758216759524546",
  "createdAt": "2025-09-18T17:32:45.802Z",
  "processedAt": "2025-09-18T17:32:45.802Z",
  "paymentMethod": "CARD",
  "cardLast4": "0019",
  "providerEarnings": 60000
};

const transformed = TransactionService.transformTransaction(
  sampleTransaction,
  'user123'
);

console.log('Transformed:', transformed);

// Expected output:
// {
//   amount: 619,
//   status: 'succeeded',
//   currency: 'COP',
//   providerEarnings: 600,
//   netAmount: 600
// }
```

## Common Issues and Solutions

### Issue 1: Amount Showing as Too Large
**Problem:** Displaying 6190000 instead of 619.00
**Solution:** Make sure to divide by 100 or use the transformed `amount` field

### Issue 2: No Revenue Showing
**Problem:** Revenue summary returns 0
**Solution:** Check that status is mapped correctly (APPROVED → succeeded)

### Issue 3: Missing Provider Data
**Problem:** Queries filtering by providerId return nothing
**Solution:** Some transactions have `providerId: null`, use sparse index

### Issue 4: Inconsistent Amount Fields
**Problem:** `amount` vs `amountInCents` confusion
**Solution:** Always use `amountInCents` if present, fallback to `amount`
