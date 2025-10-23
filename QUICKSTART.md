# Quick Start Guide

## Get Started in 5 Minutes

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and add at minimum:

```env
MONGODB_URI=mongodb://localhost:27017/business-analytics
JWT_SECRET=my_super_secret_key_12345
CLAUDE_API_KEY=sk-ant-your-claude-api-key
```

### 3. Start MongoDB

**Option A: Using Docker (Recommended)**

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**Option B: Local Installation**

```bash
mongod
```

### 4. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Or production mode
npm start
```

Server runs at: `http://localhost:5000`

### 5. Test the API

**Health Check:**

```bash
curl http://localhost:5000/health
```

**Register a User:**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Copy the token** and use it for authenticated requests:

```bash
# Get user profile
curl http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Connect Integrations

### Meta Ads

```bash
curl -X PUT http://localhost:5000/api/auth/integrations/meta-ads \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_META_ADS_TOKEN",
    "accountId": "act_123456789"
  }'
```

### Transactions

```bash
curl -X PUT http://localhost:5000/api/auth/integrations/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Sync Data

```bash
# Sync last 30 days of transaction data
curl -X POST http://localhost:5000/api/data/sync/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

## Ask AI Questions

```bash
curl -X POST http://localhost:5000/api/chat/ask \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are my top performing campaigns and revenue trends?"
  }'
```

## Get Dashboard Data

```bash
# Get KPIs for last 30 days
curl "http://localhost:5000/api/dashboard/kpis?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Issues

### MongoDB Connection Error

Make sure MongoDB is running:

```bash
# Check if running
docker ps | grep mongodb

# Or for local installation
ps aux | grep mongod
```

### Port Already in Use

Change the port in `.env`:

```env
PORT=5001
```

### Missing Claude API Key

Get your API key from: https://console.anthropic.com/

Add it to `.env`:

```env
CLAUDE_API_KEY=sk-ant-your-api-key-here
```

## Next Steps

1. **Connect Your Data Sources**: Set up Meta Ads and Transactions
2. **Sync Historical Data**: Import data from the last 3-6 months
3. **Start Asking Questions**: Use the AI chat to analyze your data
4. **Build Dashboards**: Use the dashboard endpoints for visualizations
5. **Set Up Webhooks**: Receive real-time updates from your transaction provider

## API Documentation

See `README.md` for complete API documentation.

## Example Test Scenario

### Complete Flow Test

```bash
# 1. Register
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}')

# 2. Extract token
TOKEN=$(echo $RESPONSE | jq -r '.data.token')

# 3. Get profile
curl http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer $TOKEN"

# 4. Get sync status
curl http://localhost:5000/api/data/sync/status \
  -H "Authorization: Bearer $TOKEN"

# 5. Ask a question
curl -X POST http://localhost:5000/api/chat/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Give me insights about my business"}'
```

## Support

- Documentation: `README.md`
- Issues: Open an issue on GitHub
- Email: support@example.com
