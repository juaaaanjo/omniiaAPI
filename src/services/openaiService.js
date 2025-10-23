const OpenAI = require('openai');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * OpenAI Service
 * Handles communication with OpenAI's ChatGPT API
 */
class OpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey || config.openaiApiKey;

    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured');
    } else {
      this.openai = new OpenAI({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Send a message to ChatGPT
   */
  async sendMessage(messages, systemPrompt = '', options = {}) {
    try {
      const startTime = Date.now();

      const defaultOptions = {
        model: 'gpt-4o',
        max_tokens: 4096,
        temperature: 0.7,
      };

      const messageParams = {
        ...defaultOptions,
        ...options,
      };

      // Build messages array with system prompt if provided
      const allMessages = [];
      if (systemPrompt) {
        allMessages.push({
          role: 'system',
          content: systemPrompt,
        });
      }
      allMessages.push(...messages);

      const response = await this.openai.chat.completions.create({
        ...messageParams,
        messages: allMessages,
      });

      const responseTime = Date.now() - startTime;

      logger.info(`OpenAI API request completed in ${responseTime}ms`);

      return {
        content: response.choices[0].message.content,
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
        model: response.model,
        stopReason: response.choices[0].finish_reason,
        responseTime,
      };
    } catch (error) {
      logger.error(`OpenAI API error: ${error.message}`);

      if (error.status) {
        logger.error(`Status: ${error.status}`);
      }

      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Send a simple question (single message)
   */
  async ask(question, systemPrompt = '', options = {}) {
    const messages = [
      {
        role: 'user',
        content: question,
      },
    ];

    return this.sendMessage(messages, systemPrompt, options);
  }

  /**
   * Continue a conversation with context
   */
  async continueConversation(conversationHistory, newMessage, systemPrompt = '', options = {}) {
    const messages = [
      ...conversationHistory,
      {
        role: 'user',
        content: newMessage,
      },
    ];

    return this.sendMessage(messages, systemPrompt, options);
  }

  /**
   * Analyze data with ChatGPT
   */
  async analyzeData(data, analysisPrompt, context = {}) {
    const systemPrompt = `You are an expert business analyst. Analyze the provided data and answer questions accurately based on the data provided.

IMPORTANT: Always respond in the same language as the user's question. If the user asks in Spanish, respond in Spanish. If in English, respond in English.

Context:
${JSON.stringify(context, null, 2)}`;

    const userMessage = `${analysisPrompt}

Data to analyze:
${JSON.stringify(data, null, 2)}`;

    return this.ask(userMessage, systemPrompt);
  }

  /**
   * Generate insights from data
   */
  async generateInsights(data, dataType, dateRange = {}) {
    const systemPrompt = `You are an AI-powered business intelligence assistant specializing in ${dataType} data analysis.
Generate actionable insights, identify trends, anomalies, and opportunities.
Provide specific, data-driven recommendations.

IMPORTANT: Always respond in the same language as the user's question or in the language of the request context. If the request is in Spanish, respond in Spanish. If in English, respond in English.`;

    const userMessage = `Analyze the following ${dataType} data${dateRange.startDate ? ` from ${dateRange.startDate} to ${dateRange.endDate}` : ''} and generate key insights:

${JSON.stringify(data, null, 2)}

Please provide:
1. Key trends and patterns
2. Anomalies or unusual behavior
3. Opportunities for optimization
4. Specific, actionable recommendations
5. Relevant metrics and KPIs`;

    return this.ask(userMessage, systemPrompt);
  }

  /**
   * Answer business questions with cross-referenced data
   */
  async answerBusinessQuestion(question, dataSources = {}, context = {}) {
    // Format data sources summary for context
    const dataSourcesSummary = Object.keys(dataSources).map(source => {
      const data = dataSources[source];
      if (source === 'metaAds') {
        return `- ${source}: ${data.totalCampaigns || 0} campaigns`;
      } else if (source === 'transactions') {
        const transactionsCount = data.totalTransactions || 0;
        const revenue = data.revenueSummary?.totalRevenue;
        const revenueText = typeof revenue === 'number' ? `, $${revenue.toFixed(2)} revenue` : '';
        return `- ${source}: ${transactionsCount} transactions${revenueText}`;
      }
      return `- ${source}: available`;
    }).join('\n');

    const systemPrompt = `You are an expert business analyst with access to comprehensive business data from multiple sources.

Available data sources:
${dataSourcesSummary}

Context:
${JSON.stringify(context, null, 2)}

IMPORTANT: Always respond in the same language as the user's question. If the user asks in Spanish, respond completely in Spanish. If in English, respond in English. Match the user's language exactly.

Provide accurate, data-driven answers. When calculating metrics:
1. Show your calculation steps
2. Cross-reference data from multiple sources when relevant
3. Provide specific numbers and percentages
4. Explain any assumptions made
5. Highlight any data limitations or gaps`;

    // Stringify data with size limit to prevent token overflow
    let dataString = JSON.stringify(dataSources, null, 2);
    const MAX_DATA_CHARS = 15000; // ~3750 tokens (assuming 4 chars per token)

    if (dataString.length > MAX_DATA_CHARS) {
      // Truncate and add warning
      dataString = dataString.substring(0, MAX_DATA_CHARS) + '\n\n... (Data truncated due to size. Summary provided above.)';
    }

    const userMessage = `Question: ${question}

Available data:
${dataString}

Please analyze the data and provide a comprehensive answer.`;

    return this.ask(userMessage, systemPrompt, {
      max_tokens: 4096, // Reduced from 8192 to stay within limits
      temperature: 0.5,
    });
  }

  /**
   * Format response for chat
   */
  formatChatResponse(response, additionalData = {}) {
    return {
      message: response.content,
      usage: response.usage,
      model: response.model,
      responseTime: response.responseTime,
      ...additionalData,
    };
  }

  /**
   * Stream response (for real-time chat)
   */
  async streamMessage(messages, systemPrompt = '', options = {}, onChunk) {
    try {
      const defaultOptions = {
        model: 'gpt-4o',
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      };

      const messageParams = {
        ...defaultOptions,
        ...options,
      };

      // Build messages array with system prompt if provided
      const allMessages = [];
      if (systemPrompt) {
        allMessages.push({
          role: 'system',
          content: systemPrompt,
        });
      }
      allMessages.push(...messages);

      const stream = await this.openai.chat.completions.create({
        ...messageParams,
        messages: allMessages,
      });

      let fullContent = '';
      let usage = {};

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullContent += content;

          if (onChunk) {
            onChunk(content);
          }
        }

        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }

      return {
        content: fullContent,
        usage,
      };
    } catch (error) {
      logger.error(`OpenAI streaming error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OpenAIService;
