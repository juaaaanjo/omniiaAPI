const ForecastHistory = require('../models/ForecastHistory');
const logger = require('../utils/logger');

/**
 * Report Generator Service
 * Generates formatted reports from forecast data
 */
class ReportGeneratorService {
  /**
   * Generate forecast report data
   */
  async generateForecastReport(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        endDate = new Date(),
        userId = null,
        forecastType = null,
        includeDetails = false,
      } = options;

      logger.info(`Generating forecast report from ${startDate} to ${endDate}`);

      // Get overview stats
      const [
        stats,
        forecastsByType,
        userActivity,
        accuracyMetrics,
        recentForecasts,
      ] = await Promise.all([
        ForecastHistory.getAdminStats(startDate, endDate),
        ForecastHistory.getForecastsByType(startDate, endDate),
        ForecastHistory.getUserActivity(startDate, endDate, 10),
        ForecastHistory.getAccuracyMetrics(),
        this.getRecentForecasts(startDate, endDate, userId, forecastType, includeDetails),
      ]);

      const report = {
        generatedAt: new Date(),
        period: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        overview: stats,
        forecastsByType,
        topUsers: userActivity,
        accuracyMetrics,
        recentForecasts: includeDetails ? recentForecasts : recentForecasts.slice(0, 5),
      };

      return report;
    } catch (error) {
      logger.error(`Error generating forecast report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent forecasts
   */
  async getRecentForecasts(startDate, endDate, userId, forecastType, includeAnalysis = false) {
    const query = {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (userId) query.userId = userId;
    if (forecastType) query.forecastType = forecastType;

    const selectFields = includeAnalysis
      ? ''
      : '-analysis -forecast.summary'; // Exclude large text fields if not needed

    const forecasts = await ForecastHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .select(selectFields)
      .populate('userId', 'name email')
      .lean();

    return forecasts;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(reportData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forecast Report</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: #f9fafb;
            padding: 20px;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 40px;
            text-align: center;
          }
          .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
            font-weight: 700;
          }
          .header p {
            font-size: 16px;
            opacity: 0.9;
          }
          .content {
            padding: 40px;
          }
          .section {
            margin-bottom: 40px;
          }
          .section h2 {
            font-size: 24px;
            color: #1f2937;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e7eb;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin: 20px 0;
          }
          .stat-card {
            background: #f9fafb;
            padding: 24px;
            border-radius: 12px;
            border-left: 4px solid #2563eb;
            transition: transform 0.2s;
          }
          .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .stat-label {
            font-size: 13px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            font-weight: 600;
          }
          .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: #1f2937;
          }
          .stat-subtext {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 4px;
          }
          .forecast-item {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
            transition: border-color 0.2s;
          }
          .forecast-item:hover {
            border-color: #2563eb;
          }
          .forecast-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .forecast-type {
            font-weight: 700;
            color: #2563eb;
            font-size: 16px;
            text-transform: capitalize;
          }
          .forecast-badge {
            background: #dbeafe;
            color: #1d4ed8;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .forecast-meta {
            display: flex;
            gap: 20px;
            font-size: 14px;
            color: #6b7280;
          }
          .forecast-meta span {
            display: flex;
            align-items: center;
          }
          .user-item {
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .user-info {
            flex: 1;
          }
          .user-name {
            font-weight: 700;
            font-size: 16px;
            color: #1f2937;
            margin-bottom: 4px;
          }
          .user-email {
            font-size: 14px;
            color: #6b7280;
          }
          .user-stats {
            text-align: right;
          }
          .user-count {
            font-size: 24px;
            font-weight: 700;
            color: #2563eb;
          }
          .user-label {
            font-size: 12px;
            color: #6b7280;
          }
          .accuracy-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 20px;
          }
          .accuracy-card {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border: 1px solid #86efac;
            border-radius: 8px;
            padding: 20px;
          }
          .accuracy-type {
            font-weight: 700;
            color: #166534;
            margin-bottom: 12px;
            text-transform: capitalize;
          }
          .accuracy-value {
            font-size: 36px;
            font-weight: 700;
            color: #15803d;
          }
          .accuracy-label {
            font-size: 12px;
            color: #166534;
            margin-top: 4px;
          }
          .footer {
            background: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
          }
          .footer p {
            font-size: 13px;
            color: #6b7280;
            margin: 5px 0;
          }
          .no-data {
            text-align: center;
            padding: 40px;
            color: #9ca3af;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Forecast Report</h1>
            <p>Generated on ${new Date(reportData.generatedAt).toLocaleString()}</p>
            <p>Period: ${reportData.period.start} to ${reportData.period.end}</p>
          </div>

          <div class="content">
            <!-- Overview Section -->
            <div class="section">
              <h2>📈 Overview</h2>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">Total Forecasts</div>
                  <div class="stat-value">${reportData.overview?.totalForecasts || 0}</div>
                  <div class="stat-subtext">All forecast types</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Active Users</div>
                  <div class="stat-value">${reportData.overview?.uniqueUsers || 0}</div>
                  <div class="stat-subtext">Unique forecasters</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Avg Confidence</div>
                  <div class="stat-value">${reportData.overview?.averageConfidence ? (reportData.overview.averageConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                  <div class="stat-subtext">Confidence level</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">AI Tokens Used</div>
                  <div class="stat-value">${reportData.overview?.totalTokensUsed ? (reportData.overview.totalTokensUsed / 1000).toFixed(1) + 'K' : '0'}</div>
                  <div class="stat-subtext">Total tokens consumed</div>
                </div>
              </div>
            </div>

            <!-- Forecasts by Type -->
            <div class="section">
              <h2>📋 Forecasts by Type</h2>
              ${reportData.forecastsByType && reportData.forecastsByType.length > 0 ? reportData.forecastsByType.map(type => `
                <div class="forecast-item">
                  <div class="forecast-header">
                    <div class="forecast-type">${type.forecastType}</div>
                    <div class="forecast-badge">${type.count} forecast${type.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div class="forecast-meta">
                    <span>Avg Confidence: <strong>${(type.avgConfidence * 100).toFixed(1)}%</strong></span>
                    <span>Avg Response Time: <strong>${type.avgResponseTime}ms</strong></span>
                  </div>
                </div>
              `).join('') : '<div class="no-data">No forecast data available for this period</div>'}
            </div>

            <!-- Top Users -->
            <div class="section">
              <h2>👥 Top Forecasters</h2>
              ${reportData.topUsers && reportData.topUsers.length > 0 ? reportData.topUsers.map((user, index) => `
                <div class="user-item">
                  <div class="user-info">
                    <div class="user-name">${index + 1}. ${user.userName}</div>
                    <div class="user-email">${user.userEmail}</div>
                    <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                      Types: ${user.forecastTypes?.join(', ') || 'N/A'}
                    </div>
                  </div>
                  <div class="user-stats">
                    <div class="user-count">${user.totalForecasts}</div>
                    <div class="user-label">Forecasts</div>
                  </div>
                </div>
              `).join('') : '<div class="no-data">No user data available</div>'}
            </div>

            <!-- Accuracy Metrics -->
            ${reportData.accuracyMetrics && reportData.accuracyMetrics.length > 0 ? `
              <div class="section">
                <h2>🎯 Accuracy Metrics</h2>
                <div class="accuracy-grid">
                  ${reportData.accuracyMetrics.map(metric => `
                    <div class="accuracy-card">
                      <div class="accuracy-type">${metric.forecastType}</div>
                      <div class="accuracy-value">${metric.avgAccuracy.toFixed(1)}%</div>
                      <div class="accuracy-label">${metric.totalForecasts} forecast${metric.totalForecasts !== 1 ? 's' : ''} with actuals</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Recent Forecasts -->
            ${reportData.recentForecasts && reportData.recentForecasts.length > 0 ? `
              <div class="section">
                <h2>🕐 Recent Forecasts</h2>
                ${reportData.recentForecasts.slice(0, 10).map(forecast => `
                  <div class="forecast-item">
                    <div class="forecast-header">
                      <div class="forecast-type">${forecast.forecastType}</div>
                      <div class="forecast-badge">${(forecast.confidenceLevel * 100).toFixed(0)}% confidence</div>
                    </div>
                    <div class="forecast-meta">
                      <span>By: <strong>${forecast.userName}</strong></span>
                      <span>Period: <strong>${forecast.forecastPeriod}</strong></span>
                      <span>Created: <strong>${new Date(forecast.createdAt).toLocaleDateString()}</strong></span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p><strong>Business Analytics Platform</strong></p>
            <p>This is an automated report. For questions, contact your system administrator.</p>
            <p>© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport() {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.generateForecastReport({
      startDate,
      endDate,
      includeDetails: true,
    });
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport() {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.generateForecastReport({
      startDate,
      endDate,
      includeDetails: true,
    });
  }
}

module.exports = new ReportGeneratorService();
