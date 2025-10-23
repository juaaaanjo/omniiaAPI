const logger = require('../utils/logger');
const DataIntegrationAgent = require('./DataIntegrationAgent');
const BusinessAnalysisAgent = require('./BusinessAnalysisAgent');
const InsightGeneratorAgent = require('./InsightGeneratorAgent');
const ChatHistory = require('../models/ChatHistory');

/**
 * Agent Orchestrator
 * Coordinates all other agents and routes requests appropriately
 */
class AgentOrchestrator {
  constructor() {
    this.name = 'AgentOrchestrator';
    this.dataIntegrationAgent = new DataIntegrationAgent();
    this.businessAnalysisAgent = new BusinessAnalysisAgent();
    this.insightGeneratorAgent = new InsightGeneratorAgent();
  }

  /**
   * Process user query and route to appropriate agent
   */
  async processQuery(userId, query, context = {}) {
    try {
      const sessionId = context.sessionId || this.generateSessionId();
      const startTime = Date.now();

      logger.info(`${this.name}: Processing query for user ${userId}`);

      // Save user message to chat history
      await this.saveChatMessage(userId, sessionId, 'user', query, context);

      // Determine which agent should handle this query
      const agentType = this.determineAgentType(query);

      let response;
      let agentName;

      switch (agentType) {
        case 'data-integration':
          response = await this.handleDataIntegrationQuery(userId, query, context);
          agentName = 'data-integration';
          break;

        case 'business-analysis':
          response = await this.handleBusinessAnalysisQuery(userId, query, context);
          agentName = 'business-analysis';
          break;

        case 'insight-generator':
          response = await this.handleInsightGeneratorQuery(userId, query, context);
          agentName = 'insight-generator';
          break;

        default:
          response = await this.handleGeneralQuery(userId, query, context);
          agentName = 'orchestrator';
      }

      const responseTime = Date.now() - startTime;

      // Save assistant response to chat history
      await this.saveChatMessage(userId, sessionId, 'assistant', response.answer || response.message, {
        agentType: agentName,
        responseTime,
        usage: response.usage,
        dataSources: response.dataSources || response.dataSourcesUsed,
      });

      return {
        answer: response.answer || response.message,
        agentUsed: agentName,
        sessionId,
        responseTime,
        ...response,
      };
    } catch (error) {
      logger.error(`${this.name} error: ${error.message}`);

      // Save error to chat history
      if (context.sessionId) {
        await this.saveChatMessage(userId, context.sessionId, 'assistant', 'I encountered an error processing your request.', {
          error: {
            occurred: true,
            message: error.message,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Determine which agent should handle the query
   */
  determineAgentType(query) {
    const lowerQuery = query.toLowerCase();

    // Data integration keywords
    if (lowerQuery.match(/sync|synchronize|update data|fetch data|connect|integration/)) {
      return 'data-integration';
    }

    // Insight generation keywords
    if (lowerQuery.match(/insight|trend|anomaly|recommend|suggest|what.*improve|opportunity/)) {
      return 'insight-generator';
    }

    // Business analysis keywords (questions, calculations, comparisons)
    if (lowerQuery.match(/how much|what is|calculate|compare|analyze|show me|revenue|spend|roi|roas/)) {
      return 'business-analysis';
    }

    // Default to business analysis for most questions
    return 'business-analysis';
  }

  /**
   * Handle data integration queries
   */
  async handleDataIntegrationQuery(userId, query, context) {
    const lowerQuery = query.toLowerCase();

    // Get user
    const User = require('../models/User');
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Sync all data
    if (lowerQuery.includes('sync all') || lowerQuery.includes('synchronize all')) {
      const startDate = context.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = context.endDate || new Date();

      const result = await this.dataIntegrationAgent.syncAll(user, startDate, endDate);

      return {
        message: 'Data synchronization completed',
        ...result,
        dataSourcesUsed: Object.keys(result.results),
      };
    }

    // Sync specific source
    const sources = ['meta-ads', 'transactions'];
    for (const source of sources) {
      if (lowerQuery.includes(source) || lowerQuery.includes(source.replace('-', ''))) {
        const startDate = context.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = context.endDate || new Date();

        const result = await this.dataIntegrationAgent.syncSource(user, source, startDate, endDate);

        return {
          message: `${source} data synchronization completed`,
          ...result,
          dataSourcesUsed: [source],
        };
      }
    }

    // Get sync status
    if (lowerQuery.includes('status')) {
      const status = await this.dataIntegrationAgent.getSyncStatus(user);

      return {
        message: 'Here is your data synchronization status',
        status,
      };
    }

    return {
      message: 'I can help you sync data from Meta Ads and Transactions. What would you like to sync?',
    };
  }

  /**
   * Handle business analysis queries
   */
  async handleBusinessAnalysisQuery(userId, query, context) {
    const lowerQuery = query.toLowerCase();

    // General business question
    const result = await this.businessAnalysisAgent.answerQuestion(userId, query, context);

    return result;
  }

  /**
   * Handle insight generation queries
   */
  async handleInsightGeneratorQuery(userId, query, context) {
    const startDate = context.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = context.endDate || new Date();

    const result = await this.insightGeneratorAgent.generateInsights(userId, startDate, endDate);

    // Format insights into a readable message
    const message = this.formatInsightsMessage(result.insights);

    return {
      message,
      insights: result.insights,
      dataSourcesUsed: ['meta-ads', 'transactions'],
    };
  }

  /**
   * Handle general queries
   */
  async handleGeneralQuery(userId, query, context) {
    return {
      message: `I'm here to help you analyze your business data. You can ask me questions like:
- "How much did I spend on Meta Ads to generate $100k in sales?"
- "Show me insights for the last 30 days"
- "What are my top performing campaigns?"
- "Sync my transaction data"
- "Compare this month vs last month"

What would you like to know?`,
    };
  }

  /**
   * Format insights into a readable message
   */
  formatInsightsMessage(insights) {
    let message = '📊 Here are your business insights:\n\n';

    if (insights.marketing && insights.marketing.aiInsights) {
      message += '**Marketing Insights:**\n' + insights.marketing.aiInsights + '\n\n';
    }

    if (insights.sales && insights.sales.aiInsights) {
      message += '**Sales Insights:**\n' + insights.sales.aiInsights + '\n\n';
    }

    if (insights.finance && insights.finance.aiInsights) {
      message += '**Financial Insights:**\n' + insights.finance.aiInsights + '\n\n';
    }

    if (insights.anomalies && insights.anomalies.length > 0) {
      message += '⚠️ **Anomalies Detected:**\n';
      insights.anomalies.forEach(anomaly => {
        message += `- ${anomaly.message}\n`;
      });
      message += '\n';
    }

    if (insights.recommendations && insights.recommendations.length > 0) {
      message += '💡 **Recommendations:**\n';
      insights.recommendations.slice(0, 3).forEach(rec => {
        message += `- ${rec.title}: ${rec.description}\n`;
      });
    }

    return message;
  }

  /**
   * Normalize data source names to match enum format
   */
  normalizeDataSourceNames(dataSources) {
    if (!Array.isArray(dataSources)) return [];

    const mapping = {
      metaAds: 'meta-ads',
      'meta-ads': 'meta-ads',
      transactions: 'transactions',
    };

    return dataSources
      .map(source => mapping[source] || source)
      .filter(source => ['meta-ads', 'transactions'].includes(source));
  }

  /**
   * Save chat message to history
   */
  async saveChatMessage(userId, sessionId, role, content, metadata = {}) {
    try {
      const dataSources = metadata.dataSources || metadata.dataSourcesUsed || [];

      const chatMessage = new ChatHistory({
        userId,
        sessionId,
        role,
        content,
        agentType: metadata.agentType,
        context: metadata.context || {},
        dataSourcesUsed: this.normalizeDataSourceNames(dataSources),
        queryType: this.determineQueryType(content),
        confidence: metadata.confidence,
        tokensUsed: metadata.usage?.totalTokens,
        responseTime: metadata.responseTime,
        error: metadata.error || { occurred: false },
        metadata,
      });

      await chatMessage.save();

      return chatMessage;
    } catch (error) {
      logger.error(`Error saving chat message: ${error.message}`);
    }
  }

  /**
   * Determine query type from content
   */
  determineQueryType(content) {
    const lowerContent = content.toLowerCase();

    if (lowerContent.match(/sync|synchronize|update|fetch/)) {
      return 'sync';
    }

    if (lowerContent.match(/insight|trend|anomaly|recommend/)) {
      return 'insight';
    }

    if (lowerContent.match(/how|what|calculate|analyze|compare/)) {
      return 'analysis';
    }

    if (lowerContent.match(/\?$/)) {
      return 'question';
    }

    return 'general';
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get chat history for a user
   */
  async getChatHistory(userId, limit = 20) {
    try {
      return await ChatHistory.getUserRecentChats(userId, limit);
    } catch (error) {
      logger.error(`Error getting chat history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get session conversation
   */
  async getSessionConversation(sessionId, limit = 50) {
    try {
      return await ChatHistory.getSessionHistory(sessionId, limit);
    } catch (error) {
      logger.error(`Error getting session conversation: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AgentOrchestrator;
