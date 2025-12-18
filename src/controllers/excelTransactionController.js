const multer = require('multer');
const excelTransactionService = require('../services/excelTransactionService');
const User = require('../models/User');
const logger = require('../utils/logger');

// Configure multer for file upload (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    const allowedMimeTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ];

    if (allowedMimeTypes.includes(file.mimetype) ||
        file.originalname.match(/\.(xlsx|xls|ods)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls, .ods) are allowed'), false);
    }
  },
});

/**
 * Multer error handler middleware
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Multer error', {
      code: err.code,
      field: err.field,
      message: err.message,
      userId: req.user?._id,
    });

    // Handle specific multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds the maximum allowed limit of 15MB',
        error: {
          code: 'FILE_TOO_LARGE',
          maxSize: '15MB',
        },
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field',
        error: {
          code: 'INVALID_FIELD',
          field: err.field,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error',
      error: {
        code: err.code,
      },
    });
  }

  // Handle file filter errors
  if (err.message && err.message.includes('Only Excel files')) {
    logger.warn('Invalid file type uploaded', {
      userId: req.user?._id,
      error: err.message,
    });

    return res.status(400).json({
      success: false,
      message: err.message,
      error: {
        code: 'INVALID_FILE_TYPE',
      },
    });
  }

  // Pass other errors to the next error handler
  next(err);
};

/**
 * Upload and import Excel file with transaction data
 * @route POST /api/excel-transactions/upload
 */
exports.uploadExcel = [
  upload.single('file'),
  handleMulterError,
  async (req, res) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded. Please upload an Excel file.',
        });
      }

      const userId = req.user._id;
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      logger.info('Received Excel upload', {
        userId,
        fileName,
        fileSize: req.file.size,
      });

      // Process the Excel file
      const result = await excelTransactionService.importFromExcel(
        fileBuffer,
        fileName,
        userId
      );

      logger.info('Excel import completed', {
        uploadId: result.uploadId,
        fileName: result.fileName,
        totalRows: result.totalRows,
        imported: result.imported,
        updated: result.updated,
        errors: result.errors,
      });

      // Update user integration status (don't wait for this)
      User.findByIdAndUpdate(userId, {
        'integrations.excelTransactions.connected': true,
        'integrations.excelTransactions.lastSyncedAt': new Date(),
      }).catch(err => {
        logger.error('Failed to update user integration status', {
          userId,
          error: err.message,
        });
      });

      // Send response immediately
      return res.status(200).json({
        success: true,
        message: result.errors > 0
          ? `File uploaded with ${result.errors} error(s)`
          : 'File uploaded successfully',
        data: {
          uploadId: result.uploadId,
          fileName: result.fileName,
          totalRows: result.totalRows,
          imported: result.imported,
          updated: result.updated,
          errors: result.errors,
          errorDetails: result.errorDetails || [],
        },
      });

    } catch (error) {
      logger.error('Upload Excel error', {
        error: error.message,
        stack: error.stack,
        userId: req.user?._id,
        fileName: req.file?.originalname,
      });

      return res.status(500).json({
        success: false,
        message: 'Error processing Excel file',
        error: error.message,
      });
    }
  },
];

/**
 * Get all uploads for the current user
 * @route GET /api/excel-transactions/uploads
 */
exports.getUploads = async (req, res) => {
  try {
    const userId = req.user._id;

    const uploads = await excelTransactionService.getUserUploads(userId);

    res.json({
      success: true,
      data: uploads,
    });

  } catch (error) {
    logger.error('Get uploads error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching uploads',
      error: error.message,
    });
  }
};

/**
 * Get statistics for a specific upload
 * @route GET /api/excel-transactions/uploads/:uploadId
 */
exports.getUploadStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: 'Upload ID is required',
      });
    }

    const stats = await excelTransactionService.getUploadStats(userId, uploadId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Upload not found',
      });
    }

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    logger.error('Get upload stats error', {
      error: error.message,
      userId: req.user._id,
      uploadId: req.params.uploadId,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching upload statistics',
      error: error.message,
    });
  }
};

/**
 * Delete an upload and all its transactions
 * @route DELETE /api/excel-transactions/uploads/:uploadId
 */
exports.deleteUpload = async (req, res) => {
  try {
    const userId = req.user._id;
    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: 'Upload ID is required',
      });
    }

    const result = await excelTransactionService.deleteUpload(userId, uploadId);

    res.json({
      success: true,
      message: 'Upload deleted successfully',
      data: result,
    });

  } catch (error) {
    logger.error('Delete upload error', {
      error: error.message,
      userId: req.user._id,
      uploadId: req.params.uploadId,
    });

    res.status(500).json({
      success: false,
      message: 'Error deleting upload',
      error: error.message,
    });
  }
};

/**
 * Get revenue summary
 * @route GET /api/excel-transactions/analytics/revenue
 */
exports.getRevenueSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.validatedQuery;

    const summary = await excelTransactionService.getRevenueSummary(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: summary,
    });

  } catch (error) {
    logger.error('Get revenue summary error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching revenue summary',
      error: error.message,
    });
  }
};

/**
 * Get daily revenue breakdown
 * @route GET /api/excel-transactions/analytics/daily-revenue
 */
exports.getDailyRevenue = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.validatedQuery;

    const dailyData = await excelTransactionService.getDailyRevenue(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: dailyData,
    });

  } catch (error) {
    logger.error('Get daily revenue error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching daily revenue',
      error: error.message,
    });
  }
};

/**
 * Get payment method breakdown
 * @route GET /api/excel-transactions/analytics/payment-methods
 */
exports.getPaymentMethodSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.validatedQuery;

    const summary = await excelTransactionService.getPaymentMethodSummary(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: summary,
    });

  } catch (error) {
    logger.error('Get payment method summary error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching payment method summary',
      error: error.message,
    });
  }
};

/**
 * Get top customers
 * @route GET /api/excel-transactions/analytics/top-customers
 */
exports.getTopCustomers = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, limit } = req.validatedQuery;

    const customers = await excelTransactionService.getTopCustomers(
      userId,
      startDate,
      endDate,
      limit || 10
    );

    res.json({
      success: true,
      data: customers,
    });

  } catch (error) {
    logger.error('Get top customers error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching top customers',
      error: error.message,
    });
  }
};

/**
 * Get revenue by location
 * @route GET /api/excel-transactions/analytics/revenue-by-location
 */
exports.getRevenueByLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.validatedQuery;

    const data = await excelTransactionService.getRevenueByLocation(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data,
    });

  } catch (error) {
    logger.error('Get revenue by location error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching revenue by location',
      error: error.message,
    });
  }
};

/**
 * Get tax summary
 * @route GET /api/excel-transactions/analytics/taxes
 */
exports.getTaxSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.validatedQuery;

    const summary = await excelTransactionService.getTaxSummary(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: summary,
    });

  } catch (error) {
    logger.error('Get tax summary error', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching tax summary',
      error: error.message,
    });
  }
};
