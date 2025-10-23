# Business Analytics Platform API

AI-powered business analytics platform that centralizes Marketing, Sales, and Finance data using Claude AI agents.

## Features

- **AI Agent Architecture**: Orchestrated AI agents for intelligent data analysis
- **Multi-Source Integration**: Meta Ads and Transactions
- **Cross-Reference Analysis**: Automatic attribution and ROI calculation
- **Real-time Insights**: AI-generated insights and recommendations
- **Anomaly Detection**: Automatic detection of data inconsistencies
- **Comprehensive Dashboard**: KPIs across marketing, sales, and finance

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **AI**: Claude API (Anthropic)
- **Authentication**: JWT
- **Security**: Rate limiting, CORS

## Project Structure

```
src/
├── agents/                    # AI Agent implementations
│   ├── AgentOrchestrator.js  # Coordinates all agents
│   ├── DataIntegrationAgent.js
│   ├── BusinessAnalysisAgent.js
│   └── InsightGeneratorAgent.js
├── controllers/               # Request handlers
│   ├── authController.js
│   ├── dataController.js
│   ├── chatController.js
│   └── dashboardController.js
├── models/                    # MongoDB schemas
│   ├── User.js
│   ├── MetaAdsData.js
│   └── ChatHistory.js
├── routes/                    # API routes
│   ├── auth.js
│   ├── data.js
│   ├── chat.js
│   └── dashboard.js
├── middleware/                # Custom middleware
│   ├── auth.js
│   └── rateLimiter.js
├── services/                  # External API integrations
│   ├── claudeService.js
│   └── metaAdsService.js
├── utils/                     # Utility functions
│   ├── logger.js
│   └── validators.js
├── config/                    # Configuration
│   ├── database.js
│   └── env.js
└── app.js                     # Application entry point
```

## Installation

### Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Claude API key from Anthropic

### Setup

1. **Clone the repository**

```bash
git clone <repository-url>
cd omniiaAPI
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` and add your API keys and configuration:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/business-analytics
JWT_SECRET=your_secure_secret_key
CLAUDE_API_KEY=your_claude_api_key

# Optional (configure as needed)
META_ADS_ACCESS_TOKEN=your_meta_ads_token
TRANSACTION_API_URL=https://your-transactions-endpoint
QUICKBOOKS_CLIENT_ID=your_qb_client_id
```

4. **Create logs directory**

```bash
mkdir logs
```

5. **Start MongoDB**

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or use your local MongoDB installation
mongod
```

6. **Run the application**

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Authentication

```
POST   /api/auth/register              Register new user
POST   /api/auth/login                 Login user
GET    /api/auth/profile               Get user profile
PUT    /api/auth/profile               Update profile
PUT    /api/auth/integrations/:source  Update integration
DELETE /api/auth/integrations/:source  Disconnect integration
```

### Data Synchronization

```
POST   /api/data/sync/all              Sync all data sources
POST   /api/data/sync/meta-ads         Sync Meta Ads data
POST   /api/data/sync/transactions     Sync transaction data
GET    /api/data/sync/status           Get sync status
GET    /api/data/validate              Validate data integrity
GET    /api/data/anomalies             Detect anomalies
```

### AI Chat

```
POST   /api/chat/ask                   Ask AI agents a question
GET    /api/chat/history               Get chat history
GET    /api/chat/session/:sessionId    Get session conversation
DELETE /api/chat/history/:chatId       Delete chat entry
DELETE /api/chat/history               Delete all chat history
GET    /api/chat/stats                 Get chat statistics
POST   /api/chat/:chatId/feedback      Submit feedback
```

### Dashboard

```
GET    /api/dashboard/kpis             Get overall KPIs
GET    /api/dashboard/marketing        Get marketing dashboard
GET    /api/dashboard/sales            Get sales dashboard
GET    /api/dashboard/finance          Get finance dashboard
GET    /api/dashboard/cross-analysis   Get cross-analysis
GET    /api/dashboard/insights         Get AI insights
GET    /api/dashboard/compare          Compare periods
```

## Usage Examples

### 1. Register and Login

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe",
    "company": "My Company"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

### 2. Sync Data

```bash
# Sync transaction data (last 30 days)
curl -X POST http://localhost:5000/api/data/sync/transactions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

### 3. Ask AI Questions

```bash
# Ask about attribution
curl -X POST http://localhost:5000/api/chat/ask \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How much did we spend on Meta Ads to generate $100k in sales?",
    "context": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    }
  }'
```

### 4. Get Dashboard KPIs

```bash
curl -X GET "http://localhost:5000/api/dashboard/kpis?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## AI Agents

### AgentOrchestrator
Coordinates all agents and routes user queries to the appropriate specialist.

### DataIntegrationAgent
- Synchronizes data from external APIs
- Handles rate limiting
- Detects data inconsistencies
- Normalizes data from different sources

### BusinessAnalysisAgent
- Answers complex business questions
- Performs attribution analysis
- Cross-references multiple data sources
- Calculates ROI and ROAS

### InsightGeneratorAgent
- Generates automatic insights
- Detects anomalies
- Identifies trends
- Provides actionable recommendations

## Example AI Questions

The system can answer questions like:

- "How much did we spend on Meta Ads to generate $100k in sales?"
- "What are my top performing campaigns?"
- "Show me insights for the last 30 days"
- "Which customers generate the most revenue?"
- "Compare this month's revenue vs last month"
- "What's our customer acquisition cost?"
- "Where are we seeing the highest payment failure rates?"

## Data Attribution & Profitability

The system connects marketing and finance data by:

1. Aggregating Meta Ads spend, reach, and conversion metrics
2. Summarizing transaction revenue, net revenue, and payment health
3. Comparing revenue vs spend to surface ROAS and profitability trends
4. Highlighting campaigns with high spend but limited conversions

## Security

- JWT authentication for all protected routes
- Rate limiting on all endpoints
- CORS protection
- Input validation and sanitization
- Password hashing with bcrypt
- Secure storage of API credentials

## Error Handling

- Comprehensive error logging with Winston
- Graceful handling of external API failures
- Automatic retry logic for failed syncs
- User-friendly error messages

## Logging

Logs are stored in the `logs/` directory:

- `error.log` - Error messages only
- `combined.log` - All log messages
- `exceptions.log` - Unhandled exceptions
- `rejections.log` - Unhandled promise rejections

## Development

```bash
# Run in development mode with auto-restart
npm run dev

# Run tests
npm test
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `CLAUDE_API_KEY` - Anthropic Claude API key

### Optional Integration Variables

Configure only the integrations you plan to use:

- `META_ADS_ACCESS_TOKEN` - For Facebook/Instagram Ads
- `TRANSACTION_API_URL` - Endpoint for fetching transaction data
- `STRIPE_SECRET_KEY` - For payment processing
- `QUICKBOOKS_CLIENT_ID` - For accounting data

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Enable MongoDB authentication
4. Configure proper CORS origins
5. Set up SSL/TLS certificates
6. Use a process manager (PM2)
7. Set up log rotation
8. Configure monitoring and alerts

## Troubleshooting

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
mongosh

# If using Docker
docker ps | grep mongodb
```

### Rate Limiting

If you hit rate limits, adjust in `.env`:

```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200
```

### Missing Dependencies

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## License

MIT

## Support

For issues and questions, please open an issue in the GitHub repository.
