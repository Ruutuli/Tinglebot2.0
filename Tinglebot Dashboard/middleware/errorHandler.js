// ============================================================================
// ------------------- Error Handler Middleware -------------------
// Centralized error handling with error type classification
// ============================================================================

const logger = require('../utils/logger');

// ------------------- Custom Error Classes -------------------
class ValidationError extends Error {
  constructor(message, fields = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.fields = fields;
  }
}

class DatabaseError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
    this.originalError = originalError;
  }
}

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

// ------------------- Function: errorHandler -------------------
// Centralized error handling middleware
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error(`Error in ${req.method} ${req.path}`, err, 'errorHandler.js');
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Build error response
  const errorResponse = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details || err.originalError?.message
    })
  };
  
  // Add field-specific errors for validation errors
  if (err.fields && Array.isArray(err.fields)) {
    errorResponse.fields = err.fields;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
}

// ------------------- Function: asyncHandler -------------------
// Wraps async route handlers to catch errors automatically
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ------------------- Function: notFoundHandler -------------------
// Handles 404 errors for API routes
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`API endpoint not found: ${req.method} ${req.path}`);
  next(error);
}

module.exports = {
  ValidationError,
  DatabaseError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  errorHandler,
  asyncHandler,
  notFoundHandler
};

