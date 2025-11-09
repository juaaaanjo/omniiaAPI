const ForecastHistory = require('../models/ForecastHistory');
const MetaAdsData = require('../models/MetaAdsData');
const TransactionData = require('../models/TransactionData');
const Plan = require('../models/Plan');
const logger = require('../utils/logger');

/**
 * Report Generator Service
 * Generates formatted reports from forecast data
 */

// Translations
const translations = {
  es: {
    forecastReport: 'Reporte de Pronósticos',
    generatedOn: 'Generado el',
    period: 'Período',
    overview: 'Resumen General',
    totalForecasts: 'Total de Pronósticos',
    allForecastTypes: 'Todos los tipos',
    activeUsers: 'Usuarios Activos',
    uniqueForecasters: 'Pronosticadores únicos',
    avgConfidence: 'Confianza Promedio',
    confidenceLevel: 'Nivel de confianza',
    aiTokensUsed: 'Tokens IA Usados',
    totalTokensConsumed: 'Total de tokens consumidos',
    forecastsByType: 'Pronósticos por Tipo',
    forecasts: 'pronósticos',
    forecast: 'pronóstico',
    avgResponseTime: 'Tiempo de Respuesta Promedio',
    topForecasters: 'Principales Pronosticadores',
    types: 'Tipos',
    accuracyMetrics: 'Métricas de Precisión',
    forecastsWithActuals: 'pronósticos con resultados reales',
    recentForecasts: 'Pronósticos Recientes',
    by: 'Por',
    created: 'Creado',
    confidence: 'confianza',
    nerdee: 'nerdee',
    automatedReport: 'Este es un reporte automatizado. Para preguntas, contacte a su administrador del sistema.',
    allRightsReserved: 'Todos los derechos reservados',
    noDataAvailable: 'No hay datos disponibles para este período',
    businessReport: 'Reporte de Negocio',
    marketing: 'Marketing',
    finance: 'Finanzas',
    crossAnalysis: 'Análisis Cruzado',
    planning: 'Planificación',
    totalSpend: 'Gasto Total',
    totalImpressions: 'Impresiones Totales',
    totalClicks: 'Clics Totales',
    totalRevenue: 'Ingresos Totales',
    roas: 'ROAS',
    topCampaigns: 'Mejores Campañas',
    campaign: 'campaña',
    campaigns: 'campañas',
    spend: 'Gasto',
    revenue: 'Ingresos',
    orders: 'Pedidos',
    netRevenue: 'Ingresos Netos',
    transactions: 'transacciones',
    successful: 'Exitosas',
    failed: 'Fallidas',
    activePlans: 'Planes Activos',
    completedPlans: 'Planes Completados',
    avgProgress: 'Progreso Promedio',
    totalBudget: 'Presupuesto Total',
    recentPlans: 'Planes Recientes',
    profitability: 'Rentabilidad',
    attribution: 'Atribución',
    adSpendToRevenue: 'Relación Gasto Publicitario a Ingresos',
  },
  en: {
    forecastReport: 'Forecast Report',
    generatedOn: 'Generated on',
    period: 'Period',
    overview: 'Overview',
    totalForecasts: 'Total Forecasts',
    allForecastTypes: 'All forecast types',
    activeUsers: 'Active Users',
    uniqueForecasters: 'Unique forecasters',
    avgConfidence: 'Avg Confidence',
    confidenceLevel: 'Confidence level',
    aiTokensUsed: 'AI Tokens Used',
    totalTokensConsumed: 'Total tokens consumed',
    forecastsByType: 'Forecasts by Type',
    forecasts: 'forecasts',
    forecast: 'forecast',
    avgResponseTime: 'Avg Response Time',
    topForecasters: 'Top Forecasters',
    types: 'Types',
    accuracyMetrics: 'Accuracy Metrics',
    forecastsWithActuals: 'forecasts with actuals',
    recentForecasts: 'Recent Forecasts',
    by: 'By',
    created: 'Created',
    confidence: 'confidence',
    nerdee: 'nerdee',
    automatedReport: 'This is an automated report. For questions, contact your system administrator.',
    allRightsReserved: 'All rights reserved',
    noDataAvailable: 'No data available for this period',
    businessReport: 'Business Report',
    marketing: 'Marketing',
    finance: 'Finance',
    crossAnalysis: 'Cross-Analysis',
    planning: 'Planning',
    totalSpend: 'Total Spend',
    totalImpressions: 'Total Impressions',
    totalClicks: 'Total Clicks',
    totalRevenue: 'Total Revenue',
    roas: 'ROAS',
    topCampaigns: 'Top Campaigns',
    campaign: 'campaign',
    campaigns: 'campaigns',
    spend: 'Spend',
    revenue: 'Revenue',
    orders: 'Orders',
    netRevenue: 'Net Revenue',
    transactions: 'transactions',
    successful: 'Successful',
    failed: 'Failed',
    activePlans: 'Active Plans',
    completedPlans: 'Completed Plans',
    avgProgress: 'Avg Progress',
    totalBudget: 'Total Budget',
    recentPlans: 'Recent Plans',
    profitability: 'Profitability',
    attribution: 'Attribution',
    adSpendToRevenue: 'Ad Spend to Revenue Ratio',
  },
};

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
  generateHtmlReport(reportData, language = 'es') {
    const t = translations[language] || translations.es;

    // Check if this is a comprehensive report with sections
    if (reportData.sections) {
      return this.generateComprehensiveHtmlReport(reportData, t);
    }

    // Legacy forecast report format
    return this.generateForecastHtmlReport(reportData, t);
  }

  /**
   * Generate comprehensive business HTML report with multiple sections
   */
  generateComprehensiveHtmlReport(reportData, t) {
    const sections = reportData.sections || {};

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Business Report</title>
        <style>
          ${this.getReportStyles()}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${t.businessReport}</h1>
            <p>${t.generatedOn} ${new Date(reportData.generatedAt).toLocaleString()}</p>
            <p>${t.period}: ${reportData.period.start} - ${reportData.period.end}</p>
          </div>

          <div class="content">
            ${sections.marketing ? this.generateMarketingSection(sections.marketing, t) : ''}
            ${sections.finance ? this.generateFinanceSection(sections.finance, t) : ''}
            ${sections.crossAnalysis ? this.generateCrossAnalysisSection(sections.crossAnalysis, t) : ''}
            ${sections.forecasting ? this.generateForecastingSection(sections.forecasting, t) : ''}
            ${sections.planning ? this.generatePlanningSection(sections.planning, t) : ''}
          </div>

          <div class="footer">
            <p><strong>${t.nerdee}</strong></p>
            <p>${t.automatedReport}</p>
            <p>© ${new Date().getFullYear()} ${t.allRightsReserved}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate marketing section HTML
   */
  generateMarketingSection(data, t) {
    if (!data || !data.overview) return '';

    const { overview, topCampaigns } = data;

    return `
      <div class="section">
        <h2>${t.marketing}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${t.totalSpend}</div>
            <div class="stat-value">$${(overview.totalSpend || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="stat-subtext">${overview.campaignCount || 0} ${t.campaigns}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.totalImpressions}</div>
            <div class="stat-value">${(overview.totalImpressions || 0).toLocaleString()}</div>
            <div class="stat-subtext">${(overview.totalClicks || 0).toLocaleString()} ${t.totalClicks}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.totalRevenue}</div>
            <div class="stat-value">$${(overview.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="stat-subtext">${overview.totalOrders || 0} ${t.orders}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.roas}</div>
            <div class="stat-value">${overview.avgROAS || '0.00'}x</div>
            <div class="stat-subtext">Return on Ad Spend</div>
          </div>
        </div>

        ${topCampaigns && topCampaigns.length > 0 ? `
          <h3 style="margin-top: 30px; margin-bottom: 15px; color: #1f2937;">${t.topCampaigns}</h3>
          ${topCampaigns.slice(0, 10).map(campaign => `
            <div class="forecast-item">
              <div class="forecast-header">
                <div class="forecast-type">${campaign.campaignName || 'N/A'}</div>
                <div class="forecast-badge">${t.roas}: ${campaign.roas ? campaign.roas.toFixed(2) : '0.00'}x</div>
              </div>
              <div class="forecast-meta">
                <span>${t.spend}: <strong>$${(campaign.totalSpend || 0).toFixed(2)}</strong></span>
                <span>${t.revenue}: <strong>$${(campaign.totalRevenue || 0).toFixed(2)}</strong></span>
                <span>${t.orders}: <strong>${campaign.totalOrders || 0}</strong></span>
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate finance section HTML
   */
  generateFinanceSection(data, t) {
    if (!data || !data.overview) return '';

    const { overview, dailyRevenue } = data;

    return `
      <div class="section">
        <h2>${t.finance}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${t.totalRevenue}</div>
            <div class="stat-value">$${(overview.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="stat-subtext">${overview.totalTransactions || 0} ${t.transactions}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.netRevenue}</div>
            <div class="stat-value">$${(overview.netRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="stat-subtext">After costs</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">${t.successful}</div>
            <div class="stat-value">${overview.successfulTransactions || 0}</div>
            <div class="stat-subtext">${overview.successRate ? (overview.successRate * 100).toFixed(1) + '%' : 'N/A'} success rate</div>
          </div>
          <div class="stat-card red">
            <div class="stat-label">${t.failed}</div>
            <div class="stat-value">${overview.failedTransactions || 0}</div>
            <div class="stat-subtext">Failed transactions</div>
          </div>
        </div>

        ${dailyRevenue && dailyRevenue.length > 0 ? `
          <h3 style="margin-top: 30px; margin-bottom: 15px; color: #1f2937;">Daily Revenue Trend</h3>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px;">
            ${dailyRevenue.slice(0, 7).map(day => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="color: #6b7280;">${day.date || day._id}</span>
                <span style="font-weight: 700; color: #1f2937;">$${(day.totalRevenue || day.revenue || 0).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate cross-analysis section HTML
   */
  generateCrossAnalysisSection(data, t) {
    if (!data) return '';

    return `
      <div class="section">
        <h2>${t.crossAnalysis}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${t.roas}</div>
            <div class="stat-value">${data.roas || '0.00'}x</div>
            <div class="stat-subtext">${t.attribution}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.profitability}</div>
            <div class="stat-value">${data.profitMargin || '0.00'}%</div>
            <div class="stat-subtext">Profit margin</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Net Profit</div>
            <div class="stat-value">$${(data.netProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="stat-subtext">${t.netRevenue} - Ad Spend</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.adSpendToRevenue}</div>
            <div class="stat-value">${data.totalSpend && data.totalRevenue ? ((data.totalSpend / data.totalRevenue) * 100).toFixed(1) : '0.0'}%</div>
            <div class="stat-subtext">Cost ratio</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate forecasting section HTML (uses legacy forecast data)
   */
  generateForecastingSection(data, t) {
    if (!data || !data.overview) return '';

    return `
      <div class="section">
        <h2>${t.forecastReport}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${t.totalForecasts}</div>
            <div class="stat-value">${data.overview.totalForecasts || 0}</div>
            <div class="stat-subtext">${t.allForecastTypes}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.activeUsers}</div>
            <div class="stat-value">${data.overview.uniqueUsers || 0}</div>
            <div class="stat-subtext">${t.uniqueForecasters}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.avgConfidence}</div>
            <div class="stat-value">${data.overview.averageConfidence ? (data.overview.averageConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
            <div class="stat-subtext">${t.confidenceLevel}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.aiTokensUsed}</div>
            <div class="stat-value">${data.overview.totalTokensUsed ? (data.overview.totalTokensUsed / 1000).toFixed(1) + 'K' : '0'}</div>
            <div class="stat-subtext">${t.totalTokensConsumed}</div>
          </div>
        </div>

        ${data.forecastsByType && data.forecastsByType.length > 0 ? `
          <h3 style="margin-top: 30px; margin-bottom: 15px; color: #1f2937;">${t.forecastsByType}</h3>
          ${data.forecastsByType.map(type => `
            <div class="forecast-item">
              <div class="forecast-header">
                <div class="forecast-type">${type.forecastType}</div>
                <div class="forecast-badge">${type.count} ${type.count !== 1 ? t.forecasts : t.forecast}</div>
              </div>
              <div class="forecast-meta">
                <span>${t.avgConfidence}: <strong>${(type.avgConfidence * 100).toFixed(1)}%</strong></span>
                <span>${t.avgResponseTime}: <strong>${type.avgResponseTime}ms</strong></span>
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate planning section HTML
   */
  generatePlanningSection(data, t) {
    if (!data || !data.overview) return '';

    const { overview, activePlans } = data;

    return `
      <div class="section">
        <h2>${t.planning}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${t.activePlans}</div>
            <div class="stat-value">${overview.activePlans || 0}</div>
            <div class="stat-subtext">Currently running</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.completedPlans}</div>
            <div class="stat-value">${overview.completedPlans || 0}</div>
            <div class="stat-subtext">Finished plans</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.avgProgress}</div>
            <div class="stat-value">${overview.avgProgress ? overview.avgProgress.toFixed(1) : '0.0'}%</div>
            <div class="stat-subtext">Average completion</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${t.totalBudget}</div>
            <div class="stat-value">$${(overview.totalBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            <div class="stat-subtext">Allocated budget</div>
          </div>
        </div>

        ${activePlans && activePlans.length > 0 ? `
          <h3 style="margin-top: 30px; margin-bottom: 15px; color: #1f2937;">${t.recentPlans}</h3>
          ${activePlans.slice(0, 10).map(plan => `
            <div class="forecast-item">
              <div class="forecast-header">
                <div class="forecast-type">${plan.planName || 'N/A'}</div>
                <div class="forecast-badge">${plan.status || 'active'}</div>
              </div>
              <div class="forecast-meta">
                <span>Type: <strong>${plan.planType || 'N/A'}</strong></span>
                <span>Progress: <strong>${plan.progress ? plan.progress.toFixed(0) : '0'}%</strong></span>
                <span>Budget: <strong>$${(plan.budget || 0).toLocaleString()}</strong></span>
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate legacy forecast HTML report
   */
  generateForecastHtmlReport(reportData, t) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forecast Report</title>
        <style>
          ${this.getReportStyles()}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${t.forecastReport}</h1>
            <p>${t.generatedOn} ${new Date(reportData.generatedAt).toLocaleString()}</p>
            <p>${t.period}: ${reportData.period.start} - ${reportData.period.end}</p>
          </div>

          <div class="content">
            <!-- Overview Section -->
            <div class="section">
              <h2>${t.overview}</h2>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">${t.totalForecasts}</div>
                  <div class="stat-value">${reportData.overview?.totalForecasts || 0}</div>
                  <div class="stat-subtext">${t.allForecastTypes}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">${t.activeUsers}</div>
                  <div class="stat-value">${reportData.overview?.uniqueUsers || 0}</div>
                  <div class="stat-subtext">${t.uniqueForecasters}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">${t.avgConfidence}</div>
                  <div class="stat-value">${reportData.overview?.averageConfidence ? (reportData.overview.averageConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                  <div class="stat-subtext">${t.confidenceLevel}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">${t.aiTokensUsed}</div>
                  <div class="stat-value">${reportData.overview?.totalTokensUsed ? (reportData.overview.totalTokensUsed / 1000).toFixed(1) + 'K' : '0'}</div>
                  <div class="stat-subtext">${t.totalTokensConsumed}</div>
                </div>
              </div>
            </div>

            <!-- Forecasts by Type -->
            <div class="section">
              <h2>${t.forecastsByType}</h2>
              ${reportData.forecastsByType && reportData.forecastsByType.length > 0 ? reportData.forecastsByType.map(type => `
                <div class="forecast-item">
                  <div class="forecast-header">
                    <div class="forecast-type">${type.forecastType}</div>
                    <div class="forecast-badge">${type.count} ${type.count !== 1 ? t.forecasts : t.forecast}</div>
                  </div>
                  <div class="forecast-meta">
                    <span>${t.avgConfidence}: <strong>${(type.avgConfidence * 100).toFixed(1)}%</strong></span>
                    <span>${t.avgResponseTime}: <strong>${type.avgResponseTime}ms</strong></span>
                  </div>
                </div>
              `).join('') : `<div class="no-data">${t.noDataAvailable}</div>`}
            </div>

            <!-- Top Users -->
            <div class="section">
              <h2>${t.topForecasters}</h2>
              ${reportData.topUsers && reportData.topUsers.length > 0 ? reportData.topUsers.map((user, index) => `
                <div class="user-item">
                  <div class="user-info">
                    <div class="user-name">${index + 1}. ${user.userName}</div>
                    <div class="user-email">${user.userEmail}</div>
                    <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                      ${t.types}: ${user.forecastTypes?.join(', ') || 'N/A'}
                    </div>
                  </div>
                  <div class="user-stats">
                    <div class="user-count">${user.totalForecasts}</div>
                    <div class="user-label">${t.forecasts}</div>
                  </div>
                </div>
              `).join('') : `<div class="no-data">${t.noDataAvailable}</div>`}
            </div>

            <!-- Accuracy Metrics -->
            ${reportData.accuracyMetrics && reportData.accuracyMetrics.length > 0 ? `
              <div class="section">
                <h2>${t.accuracyMetrics}</h2>
                <div class="accuracy-grid">
                  ${reportData.accuracyMetrics.map(metric => `
                    <div class="accuracy-card">
                      <div class="accuracy-type">${metric.forecastType}</div>
                      <div class="accuracy-value">${metric.avgAccuracy.toFixed(1)}%</div>
                      <div class="accuracy-label">${metric.totalForecasts} ${metric.totalForecasts !== 1 ? t.forecasts : t.forecast} ${t.forecastsWithActuals}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Recent Forecasts -->
            ${reportData.recentForecasts && reportData.recentForecasts.length > 0 ? `
              <div class="section">
                <h2>${t.recentForecasts}</h2>
                ${reportData.recentForecasts.slice(0, 10).map(forecast => `
                  <div class="forecast-item">
                    <div class="forecast-header">
                      <div class="forecast-type">${forecast.forecastType}</div>
                      <div class="forecast-badge">${(forecast.confidenceLevel * 100).toFixed(0)}% ${t.confidence}</div>
                    </div>
                    <div class="forecast-meta">
                      <span>${t.by}: <strong>${forecast.userName}</strong></span>
                      <span>${t.period}: <strong>${forecast.forecastPeriod}</strong></span>
                      <span>${t.created}: <strong>${new Date(forecast.createdAt).toLocaleDateString()}</strong></span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p><strong>${t.nerdee}</strong></p>
            <p>${t.automatedReport}</p>
            <p>© ${new Date().getFullYear()} ${t.allRightsReserved}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get shared report styles
   */
  getReportStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.5;
        color: #111827;
        background: #ffffff;
        padding: 0;
      }
      .container {
        max-width: 680px;
        margin: 0 auto;
        background: white;
      }
      .header {
        background: #111827;
        color: white;
        padding: 48px 32px;
        text-align: center;
      }
      .header h1 {
        font-size: 28px;
        margin-bottom: 8px;
        font-weight: 600;
        letter-spacing: -0.5px;
      }
      .header p {
        font-size: 14px;
        opacity: 0.7;
        font-weight: 400;
      }
      .content {
        padding: 48px 32px;
      }
      .section {
        margin-bottom: 48px;
      }
      .section h2 {
        font-size: 18px;
        color: #111827;
        margin-bottom: 24px;
        font-weight: 600;
        letter-spacing: -0.3px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin: 24px 0;
      }
      .stat-card {
        background: #ffffff;
        padding: 24px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
      }
      .stat-card.green {
        border-color: #d1fae5;
        background: #f0fdf4;
      }
      .stat-card.red {
        border-color: #fee2e2;
        background: #fef2f2;
      }
      .stat-label {
        font-size: 12px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        font-weight: 500;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 600;
        color: #111827;
        line-height: 1;
        margin-bottom: 8px;
      }
      .stat-subtext {
        font-size: 13px;
        color: #9ca3af;
        margin-top: 4px;
      }
      .forecast-item {
        background: #fafafa;
        border-radius: 6px;
        padding: 20px;
        margin: 12px 0;
      }
      .forecast-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .forecast-type {
        font-weight: 600;
        color: #111827;
        font-size: 15px;
        text-transform: capitalize;
      }
      .forecast-badge {
        background: #f3f4f6;
        color: #374151;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
      }
      .forecast-meta {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: #6b7280;
        flex-wrap: wrap;
      }
      .forecast-meta span {
        display: flex;
        align-items: center;
      }
      .user-item {
        background: #fafafa;
        padding: 20px;
        border-radius: 6px;
        margin: 12px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .user-info {
        flex: 1;
      }
      .user-name {
        font-weight: 600;
        font-size: 15px;
        color: #111827;
        margin-bottom: 4px;
      }
      .user-email {
        font-size: 13px;
        color: #6b7280;
      }
      .user-stats {
        text-align: right;
      }
      .user-count {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
      }
      .user-label {
        font-size: 12px;
        color: #9ca3af;
      }
      .accuracy-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
      .accuracy-card {
        background: #f0fdf4;
        border: 1px solid #d1fae5;
        border-radius: 6px;
        padding: 20px;
      }
      .accuracy-type {
        font-weight: 600;
        color: #065f46;
        margin-bottom: 12px;
        text-transform: capitalize;
        font-size: 14px;
      }
      .accuracy-value {
        font-size: 32px;
        font-weight: 600;
        color: #059669;
        line-height: 1;
      }
      .accuracy-label {
        font-size: 12px;
        color: #6b7280;
        margin-top: 8px;
      }
      .footer {
        background: #fafafa;
        padding: 32px;
        text-align: center;
        border-top: 1px solid #e5e7eb;
      }
      .footer p {
        font-size: 12px;
        color: #9ca3af;
        margin: 4px 0;
        line-height: 1.6;
      }
      .no-data {
        text-align: center;
        padding: 32px;
        color: #9ca3af;
        font-size: 14px;
      }
      @media only screen and (max-width: 600px) {
        .stats-grid,
        .accuracy-grid {
          grid-template-columns: 1fr;
        }
        .content {
          padding: 32px 24px;
        }
        .header {
          padding: 32px 24px;
        }
      }
    `;
  }

  /**
   * Generate comprehensive business report with multiple sections
   */
  async generateComprehensiveReport(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        userId,
        sections = ['marketing', 'finance', 'cross-analysis', 'forecasting', 'planning'], // All by default
      } = options;

      logger.info(`Generating comprehensive report from ${startDate} to ${endDate} with sections: ${sections.join(', ')}`);

      const report = {
        generatedAt: new Date(),
        period: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        sections: {},
      };

      // Generate each requested section
      const promises = {};

      if (sections.includes('marketing')) {
        promises.marketing = this.generateMarketingData(userId, startDate, endDate);
      }
      if (sections.includes('finance')) {
        promises.finance = this.generateFinanceData(userId, startDate, endDate);
      }
      if (sections.includes('cross-analysis')) {
        promises.crossAnalysis = this.generateCrossAnalysisData(userId, startDate, endDate);
      }
      if (sections.includes('forecasting')) {
        promises.forecasting = this.generateForecastReport({ startDate, endDate, userId, includeDetails: true });
      }
      if (sections.includes('planning')) {
        promises.planning = this.generatePlanningData(userId, startDate, endDate);
      }

      const results = await Promise.all(Object.entries(promises).map(async ([key, promise]) => {
        try {
          const data = await promise;
          return [key, data];
        } catch (error) {
          logger.error(`Error generating ${key} section: ${error.message}`);
          return [key, null];
        }
      }));

      results.forEach(([key, data]) => {
        report.sections[key] = data;
      });

      return report;
    } catch (error) {
      logger.error(`Error generating comprehensive report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate marketing data (Meta Ads)
   */
  async generateMarketingData(userId, startDate, endDate) {
    if (!userId) return null;

    const campaigns = await MetaAdsData.getCampaignSummary(userId, startDate, endDate);

    const totals = campaigns.reduce((acc, camp) => ({
      totalSpend: acc.totalSpend + (camp.totalSpend || 0),
      totalImpressions: acc.totalImpressions + (camp.totalImpressions || 0),
      totalClicks: acc.totalClicks + (camp.totalClicks || 0),
      totalRevenue: acc.totalRevenue + (camp.totalRevenue || 0),
      totalOrders: acc.totalOrders + (camp.totalOrders || 0),
    }), { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalRevenue: 0, totalOrders: 0 });

    return {
      overview: {
        ...totals,
        avgROAS: totals.totalSpend > 0 ? (totals.totalRevenue / totals.totalSpend).toFixed(2) : 0,
        campaignCount: campaigns.length,
      },
      topCampaigns: campaigns.slice(0, 10),
    };
  }

  /**
   * Generate finance data (Transactions)
   */
  async generateFinanceData(userId, startDate, endDate) {
    if (!userId) return null;

    const summary = await TransactionData.getRevenueSummary(userId, startDate, endDate);
    const dailyRevenue = await TransactionData.getDailyRevenue(userId, startDate, endDate);

    return {
      overview: summary,
      dailyRevenue: dailyRevenue.slice(0, 30), // Last 30 days
    };
  }

  /**
   * Generate cross-analysis data (Attribution)
   */
  async generateCrossAnalysisData(userId, startDate, endDate) {
    if (!userId) return null;

    const [marketingData, financeData] = await Promise.all([
      this.generateMarketingData(userId, startDate, endDate),
      this.generateFinanceData(userId, startDate, endDate),
    ]);

    if (!marketingData || !financeData) return null;

    const totalSpend = marketingData.overview.totalSpend;
    const totalRevenue = financeData.overview.totalRevenue;
    const netRevenue = financeData.overview.netRevenue;

    return {
      totalSpend,
      totalRevenue,
      netRevenue,
      roas: totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : 0,
      profitMargin: totalRevenue > 0 ? (((netRevenue - totalSpend) / totalRevenue) * 100).toFixed(2) : 0,
      netProfit: netRevenue - totalSpend,
    };
  }

  /**
   * Generate planning data
   */
  async generatePlanningData(userId, startDate, endDate) {
    if (!userId) return null;

    const stats = await Plan.getPlanStats(userId, startDate, endDate);
    const activePlans = await Plan.getActivePlans(userId);

    return {
      overview: stats,
      activePlans: activePlans.slice(0, 10).map(plan => ({
        _id: plan._id,
        planName: plan.planName,
        planType: plan.planType,
        status: plan.status,
        progress: plan.progress.overall,
        startDate: plan.planStartDate,
        endDate: plan.planEndDate,
        budget: plan.budget.total,
      })),
    };
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(userId) {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.generateComprehensiveReport({
      startDate,
      endDate,
      userId,
      sections: ['marketing', 'finance', 'cross-analysis', 'forecasting', 'planning'],
    });
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(userId) {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.generateComprehensiveReport({
      startDate,
      endDate,
      userId,
      sections: ['marketing', 'finance', 'cross-analysis', 'forecasting', 'planning'],
    });
  }
}


module.exports = new ReportGeneratorService();
