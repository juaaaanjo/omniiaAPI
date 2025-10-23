const Joi = require('joi');

/**
 * Validation schemas for different entities
 */

// User validation
const userRegisterSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(100).required(),
  company: Joi.string().max(200).optional(),
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Data sync validation
const dateSyncSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  source: Joi.string().valid('meta-ads', 'transactions').optional(),
});

// Chat validation
const chatQuerySchema = Joi.object({
  question: Joi.string().min(5).max(1000).required(),
  context: Joi.object().optional(),
  agentType: Joi.string().valid('orchestrator', 'business-analysis', 'insight-generator').optional(),
});

// Dashboard query validation
const dashboardQuerySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  metrics: Joi.array().items(Joi.string()).optional(),
  granularity: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').default('day'),
});

// Cross-analysis query validation (optional dates with 2-year default range)
const crossAnalysisQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  metrics: Joi.array().items(Joi.string()).optional(),
  granularity: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').default('day'),
});

/**
 * Generic validation middleware
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    req.validatedData = value;
    next();
  };
};

/**
 * Query parameter validation
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Query validation error',
        errors,
      });
    }

    req.validatedQuery = value;
    next();
  };
};

/**
 * Custom validators
 */
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const isValidDateRange = (startDate, endDate, maxDays = 365) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  return diffDays > 0 && diffDays <= maxDays;
};

module.exports = {
  // Schemas
  userRegisterSchema,
  userLoginSchema,
  dateSyncSchema,
  chatQuerySchema,
  dashboardQuerySchema,
  crossAnalysisQuerySchema,

  // Middleware
  validate,
  validateQuery,

  // Custom validators
  isValidObjectId,
  isValidDateRange,
};
