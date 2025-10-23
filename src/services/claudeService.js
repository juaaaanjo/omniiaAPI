const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Claude AI Service
 * Handles communication with Anthropic's Claude API
 */
class ClaudeService {
  constructor(apiKey) {
    this.apiKey = apiKey || config.claudeApiKey;

    if (!this.apiKey) {
      logger.warn('Claude API key not configured');
    } else {
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Send a message to Claude
   */
  async sendMessage(messages, systemPrompt = '', options = {}) {
    try {
      const startTime = Date.now();

      const defaultOptions = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.7,
      };

      const messageParams = {
        ...defaultOptions,
        ...options,
        messages,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        messageParams.system = systemPrompt;
      }

      const response = await this.anthropic.messages.create(messageParams);

      const responseTime = Date.now() - startTime;

      logger.info(`Claude API request completed in ${responseTime}ms`);

      return {
        content: response.content[0].text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        stopReason: response.stop_reason,
        responseTime,
      };
    } catch (error) {
      logger.error(`Claude API error: ${error.message}`);

      if (error.status) {
        logger.error(`Status: ${error.status}`);
      }

      throw new Error(`Claude API error: ${error.message}`);
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
   * Analyze data with Claude
   */
  async analyzeData(data, analysisPrompt, context = {}) {
    const systemPrompt = `You are an expert business analyst. Analyze the provided data and answer questions accurately based on the data provided.

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
Provide specific, data-driven recommendations.`;

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
    const systemPrompt = `You are an expert business analyst with access to comprehensive business data from multiple sources.

Available data sources:
${Object.keys(dataSources).map(source => `- ${source}: ${dataSources[source].length || 0} records`).join('\n')}

Context:
${JSON.stringify(context, null, 2)}

Provide accurate, data-driven answers. When calculating metrics:
1. Show your calculation steps
2. Cross-reference data from multiple sources when relevant
3. Provide specific numbers and percentages
4. Explain any assumptions made
5. Highlight any data limitations or gaps`;

    const userMessage = `Question: ${question}

Available data:
${JSON.stringify(dataSources, null, 2)}

Please analyze the data and provide a comprehensive answer.`;

    return this.ask(userMessage, systemPrompt, {
      max_tokens: 8192,
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
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      };

      const messageParams = {
        ...defaultOptions,
        ...options,
        messages,
      };

      if (systemPrompt) {
        messageParams.system = systemPrompt;
      }

      const stream = await this.anthropic.messages.create(messageParams);

      let fullContent = '';
      let usage = {};

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const chunk = event.delta.text;
          fullContent += chunk;

          if (onChunk) {
            onChunk(chunk);
          }
        } else if (event.type === 'message_stop') {
          usage = event.usage || {};
        }
      }

      return {
        content: fullContent,
        usage,
      };
    } catch (error) {
      logger.error(`Claude streaming error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ClaudeService;
