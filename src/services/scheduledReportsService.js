const cron = require('node-cron');
const emailService = require('./emailService');
const reportGenerator = require('./reportGeneratorService');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Scheduled Reports Service
 * Handles automated report sending on schedules
 */
class ScheduledReportsService {
  constructor() {
    this.weeklyJob = null;
    this.monthlyJob = null;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    // Check if email is configured
    if (!emailService.isConfigured()) {
      logger.warn('Scheduled reports disabled: Email service not configured');
      return;
    }

    // Check if scheduled reports are enabled in environment
    const weeklyEnabled = process.env.WEEKLY_REPORT_ENABLED === 'true';
    const monthlyEnabled = process.env.MONTHLY_REPORT_ENABLED === 'true';

    if (weeklyEnabled) {
      this.startWeeklyReports();
    }

    if (monthlyEnabled) {
      this.startMonthlyReports();
    }

    if (!weeklyEnabled && !monthlyEnabled) {
      logger.info('Scheduled reports not enabled. Set WEEKLY_REPORT_ENABLED or MONTHLY_REPORT_ENABLED to true in .env');
    }
  }

  /**
   * Start weekly reports
   * Runs every Monday at 9:00 AM
   */
  startWeeklyReports() {
    // Cron format: minute hour day-of-month month day-of-week
    // '0 9 * * 1' = Every Monday at 9:00 AM
    const schedule = process.env.WEEKLY_REPORT_SCHEDULE || '0 9 * * 1';

    this.weeklyJob = cron.schedule(schedule, async () => {
      try {
        logger.info('Running scheduled weekly report...');
        await this.sendWeeklyReport();
      } catch (error) {
        logger.error(`Scheduled weekly report error: ${error.message}`);
      }
    });

    logger.info(`Weekly reports scheduled: ${schedule}`);
  }

  /**
   * Start monthly reports
   * Runs on the 1st of each month at 9:00 AM
   */
  startMonthlyReports() {
    // '0 9 1 * *' = First day of every month at 9:00 AM
    const schedule = process.env.MONTHLY_REPORT_SCHEDULE || '0 9 1 * *';

    this.monthlyJob = cron.schedule(schedule, async () => {
      try {
        logger.info('Running scheduled monthly report...');
        await this.sendMonthlyReport();
      } catch (error) {
        logger.error(`Scheduled monthly report error: ${error.message}`);
      }
    });

    logger.info(`Monthly reports scheduled: ${schedule}`);
  }

  /**
   * Send weekly report to all admins
   */
  async sendWeeklyReport() {
    try {
      // Get all admin emails
      const admins = await User.find({ role: 'admin', isActive: true }).select('email name');
      const adminEmails = admins.map(admin => admin.email);

      if (adminEmails.length === 0) {
        logger.warn('No active admin users found for weekly report');
        return;
      }

      // Generate weekly report
      const reportData = await reportGenerator.generateWeeklyReport();
      const reportHtml = reportGenerator.generateHtmlReport(reportData);

      // Send to all admins
      await emailService.sendScheduledReport({
        to: adminEmails,
        reportType: 'weekly',
        reportData,
        reportHtml,
      });

      logger.info(`Automated weekly report sent to ${adminEmails.length} admins`);
    } catch (error) {
      logger.error(`Error sending automated weekly report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send monthly report to all admins
   */
  async sendMonthlyReport() {
    try {
      // Get all admin emails
      const admins = await User.find({ role: 'admin', isActive: true }).select('email name');
      const adminEmails = admins.map(admin => admin.email);

      if (adminEmails.length === 0) {
        logger.warn('No active admin users found for monthly report');
        return;
      }

      // Generate monthly report
      const reportData = await reportGenerator.generateMonthlyReport();
      const reportHtml = reportGenerator.generateHtmlReport(reportData);

      // Send to all admins
      await emailService.sendScheduledReport({
        to: adminEmails,
        reportType: 'monthly',
        reportData,
        reportHtml,
      });

      logger.info(`Automated monthly report sent to ${adminEmails.length} admins`);
    } catch (error) {
      logger.error(`Error sending automated monthly report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (this.weeklyJob) {
      this.weeklyJob.stop();
      logger.info('Weekly reports stopped');
    }

    if (this.monthlyJob) {
      this.monthlyJob.stop();
      logger.info('Monthly reports stopped');
    }
  }
}

module.exports = new ScheduledReportsService();
