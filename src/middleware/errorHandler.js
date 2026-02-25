const { randomUUID } = require('crypto');
const logger = require('../config/logger');
const { env } = require('../config/env');
const { AppError } = require('../utils/errors');

/**
 * Unified error response format:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human readable message",
 *     "statusCode": 400,
 *     "requestId": "uuid",
 *     "details": {} // optional
 *   }
 * }
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.id || randomUUID();

  // Determine if this is a known AppError
  const isAppError = err instanceof AppError;

  let statusCode = isAppError ? err.statusCode : 500;
  let code = isAppError ? err.code : 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = isAppError ? err.details : null;

  // Handle PostgreSQL specific errors
  if (err.code === '23505') {
    // Unique violation
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced resource does not exist';
  }

  // Hide internal error messages in production
  if (statusCode === 500 && env.NODE_ENV === 'production') {
    message = 'Internal server error';
  }

  // Log the error
  logger.error({
    err: {
      code,
      message: err.message,
      stack: env.NODE_ENV === 'production' ? undefined : err.stack,
    },
    requestId,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id || null,
  }, 'Request failed');

  // Send unified error response
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
      requestId,
      ...(details && { details }),
      ...(env.NODE_ENV !== 'production' && statusCode === 500 && { stack: err.stack }),
    },
  });
}

module.exports = { errorHandler };
