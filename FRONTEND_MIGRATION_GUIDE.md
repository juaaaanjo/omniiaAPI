# Frontend Migration Guide - Transaction Integration

This guide outlines the minimal changes needed on your frontend to support the new transaction endpoint integration.

## Summary

**Good news**: Most of the changes are backward compatible. The main updates are in the payment data structure returned by KPI and finance dashboards.

## API Response Changes

### 1. `/api/dashboard/kpis` - Updated Payment Object

**BEFORE (Legacy Payments)**:
```json
{
  "kpis": {
    "payments": {
      "totalRevenue": 150000,
      "totalFees": 4500,      // ❌ REMOVED
      "netRevenue": 145500,
      "totalCharges": 1250    // ❌ RENAMED
    }
  }
}
```

**AFTER (Transactions)**:
```json
{
  "kpis": {
    "payments": {
      "totalRevenue": 150000,
      "netRevenue": 145500,
      "totalTransactions": 1250,  // ✅ NEW (replaces totalCharges)
      "source": "transactions"     // ✅ NEW (indicates data source)
    }
  }
}
```

**Frontend Changes**:
```javascript
// OLD CODE
const { totalRevenue, totalFees, netRevenue, totalCharges } = kpis.payments;

// NEW CODE (backward compatible)
const {
  totalRevenue,
  netRevenue,
  totalTransactions,  // Use this instead of totalCharges
  source              // Use this to show data source indicator
} = kpis.payments;

// If you were displaying fees separately, calculate from revenue
const estimatedFees = totalRevenue - netRevenue;
```

### 2. `/api/dashboard/finance` - Added Data Source Indicator

**NEW FIELD**:
```json
{
  "data": {
    "paymentData": {
      "totalRevenue": 150000,
      "netRevenue": 145500,
      "totalTransactions": 1250
    },
    "paymentDataSource": "transactions"  // ✅ NEW
  }
}
```

**Frontend Changes**:
```javascript
// Optional: Show user which data source is being used
const { paymentData, paymentDataSource } = response.data;

// Display indicator in UI (optional)
if (paymentDataSource === 'transactions') {
  showBadge('Using Ommeo Transactions');
} else {
  showBadge('No Transactions Connected');
}
```

### 3. `/api/dashboard/sales` - Daily Revenue Structure Unchanged

**NO CHANGES REQUIRED** - The daily revenue data structure remains the same:
```json
{
  "dailyRevenue": [
    {
      "date": "2024-01-15",
      "revenue": 5000,
      "netRevenue": 4850,
      "transactionCount": 25
    }
  ]
}
```

Transactions return the same format as the previous payment data structure, so no frontend updates needed.

## New Features Available

### 1. New Sync Endpoint

Add a sync option for transactions in your settings/integrations page:

```javascript
// Add to your sync functions
async function syncTransactions(startDate, endDate) {
  const response = await fetch('/api/data/sync/transactions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ startDate, endDate })
  });

  const result = await response.json();
  return result;
}
```

### 2. Updated Sync Status

The sync status endpoint now includes transactions:

```javascript
// GET /api/data/sync/status
{
  "status": {
    "metaAds": { "connected": true, "lastSync": "2024-01-15T10:00:00Z" },
    "transactions": {
      "connected": true,
      "lastSync": "2024-01-15T10:00:00Z",
      "status": "ready"
    }
  },
  "recordCounts": {
    "metaAds": 1500,
    "transactions": 1250
  }
}
```

## Recommended UI Updates

### 1. Integration Settings Page

Add a new integration card for "Ommeo Transactions":

```jsx
<IntegrationCard
  name="Ommeo Transactions"
  icon={<TransactionIcon />}
  connected={user.integrations.transactions.connected}
  lastSync={user.integrations.transactions.lastSync}
  onConnect={() => enableTransactionIntegration()}
  onSync={() => syncTransactions(startDate, endDate)}
/>
```

### 2. Data Source Indicator (Optional)

Show users which payment data source is active:

```jsx
// In KPI Dashboard
{kpis.payments.source === 'transactions' ? (
  <Badge color="blue">Ommeo Transactions</Badge>
) : (
  <Badge color="gray">No Transactions Connected</Badge>
)}
```

### 3. Fee Display Adjustment

Since `totalFees` is no longer directly available, calculate it:

```jsx
// OLD
<Metric label="Processing Fees" value={kpis.payments.totalFees} />

// NEW
<Metric
  label="Processing Fees"
  value={kpis.payments.totalRevenue - kpis.payments.netRevenue}
  subtitle="Calculated from revenue - net"
/>
```

## Migration Checklist

### Required Changes ✅

- [ ] Update `payments.totalCharges` references to `payments.totalTransactions`
- [ ] Remove or calculate `payments.totalFees` (no longer directly provided)
- [ ] Handle `payments.source` field for data source indication

### Optional Enhancements 🎨

- [ ] Add "Ommeo Transactions" integration card to settings
- [ ] Add sync button for transactions
- [ ] Display data source badge in dashboards
- [ ] Update sync status UI to show transactions
- [ ] Add transaction-specific filters (by provider, status)

### Testing Steps ✔️

1. **Before Enabling Transactions**:
   - Verify dashboards handle the absence of payment data gracefully
   - Check all payment metrics render without throwing errors

2. **After Enabling Transactions**:
   - Enable integration: `user.integrations.transactions.connected = true`
   - Sync transaction data via API
   - Verify dashboards switch to transaction data
   - Check `source` field shows "transactions"
   - Confirm metrics are accurate

## Code Examples

### React/TypeScript Example

```typescript
// types.ts
interface PaymentMetrics {
  totalRevenue: number;
  netRevenue: number;
  totalTransactions: number;  // Renamed from totalCharges
  source: 'transactions' | 'none';  // New field
}

// Component
const PaymentMetrics: React.FC = () => {
  const { kpis } = useDashboard();
  const { totalRevenue, netRevenue, totalTransactions, source } = kpis.payments;

  // Calculate fees if needed
  const processingFees = totalRevenue - netRevenue;

  return (
    <div>
      <MetricCard label="Total Revenue" value={totalRevenue} />
      <MetricCard label="Net Revenue" value={netRevenue} />
      <MetricCard label="Processing Fees" value={processingFees} />
      <MetricCard label="Transactions" value={totalTransactions} />
      <Badge>Source: {source}</Badge>
    </div>
  );
};
```

### Vue.js Example

```vue
<template>
  <div class="payment-metrics">
    <MetricCard label="Total Revenue" :value="payments.totalRevenue" />
    <MetricCard label="Net Revenue" :value="payments.netRevenue" />
    <MetricCard label="Processing Fees" :value="processingFees" />
    <MetricCard label="Transactions" :value="payments.totalTransactions" />
    <Badge :color="sourceColor">{{ sourceLabel }}</Badge>
  </div>
</template>

<script>
export default {
  computed: {
    payments() {
      return this.$store.state.dashboard.kpis.payments;
    },
    processingFees() {
      return this.payments.totalRevenue - this.payments.netRevenue;
    },
    sourceColor() {
      return this.payments.source === 'transactions' ? 'blue' : 'gray';
    },
    sourceLabel() {
      return this.payments.source === 'transactions' ? 'Ommeo Transactions' : 'No Transactions Connected';
    }
  }
}
</script>
```

### Angular Example

```typescript
// dashboard.component.ts
export class DashboardComponent {
  payments: PaymentMetrics;

  get processingFees(): number {
    return this.payments.totalRevenue - this.payments.netRevenue;
  }

  get sourceLabel(): string {
    return this.payments.source === 'transactions'
      ? 'Ommeo Transactions'
      : 'No Transactions Connected';
  }
}
```

## API Endpoint Reference

### Existing Endpoints (No Changes)
- `GET /api/dashboard/kpis` - Updated response structure only
- `GET /api/dashboard/sales` - No changes
- `GET /api/dashboard/finance` - Added `paymentDataSource` field
- `GET /api/dashboard/marketing` - No changes
- `GET /api/dashboard/cross-analysis` - No changes

### New Endpoints
- `POST /api/data/sync/transactions` - Sync transaction data
- Integration status includes `transactions` field

## Breaking Changes Summary

### ⚠️ Breaking Changes

1. **`payments.totalCharges`** → **`payments.totalTransactions`**
   - **Impact**: Any code referencing `totalCharges` will break
   - **Fix**: Replace with `totalTransactions`

2. **`payments.totalFees`** → **Removed**
   - **Impact**: Direct fee display will show undefined
   - **Fix**: Calculate as `totalRevenue - netRevenue`

### ✅ Non-Breaking Additions

1. **`payments.source`** - New field, safe to ignore if not needed
2. **`paymentDataSource`** - New field in finance dashboard, optional
3. **`transactions`** in sync status - New integration, optional to display

## Testing Your Frontend

### Step 1: API Response Validation

```javascript
// Test KPI endpoint
const response = await fetch('/api/dashboard/kpis', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

// Validate new structure
console.assert(data.kpis.payments.totalTransactions !== undefined);
console.assert(data.kpis.payments.source !== undefined);
console.assert(data.kpis.payments.totalCharges === undefined); // Should be removed
```

### Step 2: Visual Testing

1. Open your dashboard
2. Check all payment metrics display correctly
3. Enable transactions integration via API
4. Sync transaction data
5. Verify dashboard updates with new data
6. Check for any console errors

## Support & Troubleshooting

### Common Issues

**Issue**: `totalCharges is undefined`
- **Fix**: Update to use `totalTransactions`

**Issue**: Fees not displaying
- **Fix**: Calculate as `totalRevenue - netRevenue`

**Issue**: Data not updating after sync
- **Fix**: Confirm transactions integration is enabled and resync
- **Solution**: Ensure `user.integrations.transactions.connected = true`

### Need Help?

Check these files for reference:
- Backend changes: `/src/controllers/dashboardController.js`
- API structure: `/TRANSACTION_INTEGRATION_GUIDE.md`
- Test endpoints using tools like Postman or curl

## Migration Strategy

Deploy backend changes, update the frontend to consume the transaction-only payment metrics, test with a subset of users, then roll out to everyone once dashboards look correct.
