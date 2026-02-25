/**
 * Base application error class
 * All custom errors should extend this
 */
class AppError extends Error {
  /**
   * @param {string} code - Error code (e.g., 'OUT_OF_STOCK')
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {object} [details] - Additional error details
   */
  constructor(code, message, statusCode, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request data', details = null) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication failed') {
    super('AUTH_ERROR', message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super('CONFLICT', message, 409);
  }
}

class OutOfStockError extends AppError {
  constructor(message = 'Out of stock', details = null) {
    super('OUT_OF_STOCK', message, 409, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMIT_EXCEEDED', message, 429);
  }
}

class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_SERVER_ERROR', message, 500);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  OutOfStockError,
  RateLimitError,
  InternalError,
};
