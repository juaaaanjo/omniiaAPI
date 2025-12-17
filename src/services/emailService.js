const { Resend } = require('resend');
const logger = require('../utils/logger');

/**
 * Email Service
 * Handles sending emails through Resend with a dummy fallback
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.resendClient = null;
    this.isDummyTransport = false;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    // Check if email is configured
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM_ADDRESS) {
      logger.warn('Resend email service not fully configured. Falling back to dummy email transport.');
      this.setupDummyTransport();
      return;
    }

    try {
      // Check if Headers API is available (required by Resend)
      if (typeof Headers === 'undefined') {
        // Polyfill Headers for older Node.js versions
        global.Headers = class Headers {
          constructor(init) {
            this.headers = new Map();
            if (init) {
              Object.entries(init).forEach(([key, value]) => {
                this.headers.set(key.toLowerCase(), value);
              });
            }
          }
          get(name) { return this.headers.get(name.toLowerCase()); }
          set(name, value) { this.headers.set(name.toLowerCase(), value); }
          has(name) { return this.headers.has(name.toLowerCase()); }
          delete(name) { this.headers.delete(name.toLowerCase()); }
          append(name, value) {
            const existing = this.get(name);
            this.set(name, existing ? `${existing}, ${value}` : value);
          }
          forEach(callback) { this.headers.forEach((value, key) => callback(value, key)); }
        };
      }

      this.resendClient = new Resend(process.env.RESEND_API_KEY);
      this.isDummyTransport = false;
      logger.info('Resend email service initialized successfully');
    } catch (error) {
      logger.error(`Email service initialization error: ${error.message}`);
      this.setupDummyTransport();
    }
  }

  /**
   * Setup dummy transporter for development fallback
   */
  setupDummyTransport() {
    this.isDummyTransport = true;
    this.resendClient = null;
    this.transporter = {
      sendMail: async mailOptions => {
        const recipients = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];
        logger.info(`Dummy email transport: captured email to ${recipients.join(', ')}`);
        return {
          messageId: `dummy-${Date.now()}`,
          envelope: {
            from: mailOptions.from,
            to: recipients,
          },
          accepted: recipients,
          rejected: [],
          pending: [],
          response: '250 Dummy OK',
        };
      },
      verify: async () => {
        logger.info('Dummy email transport verify invoked');
        return true;
      },
    };
  }

  /**
   * Check if email service is configured
   */
  isConfigured() {
    return this.resendClient !== null || this.isDummyTransport;
  }

  /**
   * Check if dummy transport is active
   */
  isDummyMode() {
    return this.isDummyTransport;
  }

  /**
   * Send email
   */
  async sendEmail({ to, subject, html, text, attachments = [] }) {
    if (!this.isConfigured()) {
      throw new Error('Email service not configured');
    }

    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    const fromAddress = `${process.env.EMAIL_FROM_NAME || 'nerdee'} <${process.env.EMAIL_FROM_ADDRESS || 'dummy@example.com'}>`;

    if (recipients.length === 0) {
      throw new Error('No recipients specified for email');
    }

    const payload = {
      from: fromAddress,
      to: recipients,
      subject,
      html,
      text: text || this.stripHtml(html),
      attachments: attachments.length ? attachments.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content,
        path: attachment.path,
        contentType: attachment.contentType,
        contentId: attachment.contentId || attachment.cid,
      })) : undefined,
    };

    if (this.isDummyTransport || !this.resendClient) {
      const info = await this.transporter.sendMail(payload);
      logger.info(`Email captured in dummy transport: ${info.messageId} to ${recipients.join(', ')}`);
      return {
        success: true,
        messageId: info.messageId,
      };
    }

    try {
      const { data, error } = await this.resendClient.emails.send(payload);

      if (error) {
        throw new Error(error.message || 'Unknown Resend error');
      }

      logger.info(`Email sent: ${data.id} to ${recipients.join(', ')}`);

      return {
        success: true,
        messageId: data.id,
      };
    } catch (error) {
      logger.error(`Email send error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send forecast report email
   */
  async sendForecastReport({ to, reportData, reportHtml }) {
    const subject = `Forecast Report - ${reportData.period.start} to ${reportData.period.end}`;

    const html = reportHtml || this.generateDefaultReportHtml(reportData);

    return this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send scheduled weekly/monthly report
   */
  async sendScheduledReport({ to, reportType, reportData, reportHtml }) {
    const reportTypeLabel = reportType === 'weekly' ? 'Weekly' : 'Monthly';
    const subject = `${reportTypeLabel} Forecast Report - ${new Date().toLocaleDateString()}`;

    const html = reportHtml || this.generateDefaultReportHtml(reportData);

    return this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Generate default report HTML
   */
  generateDefaultReportHtml(reportData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
          }
          .stat-card {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2563eb;
          }
          .stat-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #1f2937;
          }
          .forecast-item {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
          }
          .forecast-type {
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Forecast Report</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
          <p>Period: ${reportData.period?.start || 'N/A'} to ${reportData.period?.end || 'N/A'}</p>
        </div>

        <h2>Overview</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Forecasts</div>
            <div class="stat-value">${reportData.overview?.totalForecasts || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Unique Users</div>
            <div class="stat-value">${reportData.overview?.uniqueUsers || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg Confidence</div>
            <div class="stat-value">${reportData.overview?.averageConfidence ? (reportData.overview.averageConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Tokens Used</div>
            <div class="stat-value">${reportData.overview?.totalTokensUsed?.toLocaleString() || 0}</div>
          </div>
        </div>

        <h2>Forecasts by Type</h2>
        ${reportData.forecastsByType?.map(type => `
          <div class="forecast-item">
            <div class="forecast-type">${type.forecastType}</div>
            <p>Count: <strong>${type.count}</strong> | Avg Confidence: <strong>${(type.avgConfidence * 100).toFixed(1)}%</strong></p>
          </div>
        `).join('') || '<p>No data available</p>'}

        <h2>Top Users</h2>
        ${reportData.topUsers?.map((user, index) => `
          <div class="forecast-item">
            <strong>${index + 1}. ${user.userName}</strong> (${user.userEmail})
            <p>Total Forecasts: <strong>${user.totalForecasts}</strong></p>
            <p>Types: ${user.forecastTypes?.join(', ') || 'N/A'}</p>
          </div>
        `).join('') || '<p>No data available</p>'}

        ${reportData.accuracyMetrics?.length > 0 ? `
          <h2>Accuracy Metrics</h2>
          ${reportData.accuracyMetrics.map(metric => `
            <div class="forecast-item">
              <div class="forecast-type">${metric.forecastType}</div>
              <p>Average Accuracy: <strong>${metric.avgAccuracy.toFixed(1)}%</strong></p>
              <p>Total Forecasts with Actuals: <strong>${metric.totalForecasts}</strong></p>
            </div>
          `).join('')}
        ` : ''}

        <div class="footer">
          <p>This is an automated report from nerdee.</p>
          <p>For questions or issues, contact your system administrator.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    if (!html) {
      return '';
    }

    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Email service not configured');
    }

    if (this.isDummyTransport || !this.resendClient) {
      logger.info('Dummy email transport verify invoked');
      return true;
    }

    try {
      const { error } = await this.resendClient.apiKeys.list({ limit: 1 });

      if (error) {
        if (error.statusCode === 403 || error.name === 'invalid_access') {
          logger.warn('Resend API key cannot be inspected but appears valid for sending (sending-only key).');
          return true;
        }

        throw new Error(error.message);
      }

      logger.info('Email connection test successful');
      return true;
    } catch (error) {
      logger.error(`Email connection test failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new EmailService();
