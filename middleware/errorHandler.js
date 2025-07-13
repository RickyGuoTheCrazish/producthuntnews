// Comprehensive error handling middleware
const logger = require('../utils/logger');

class ErrorHandler {
  // Handle different types of errors
  static handleError(error, req, res, next) {
    logger.logError(error, {
      url: req.url,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query
    });

    // Default error response
    let statusCode = 500;
    let message = 'Internal Server Error';
    let details = {};

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation Error';
      details = error.details || {};
    } else if (error.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized';
    } else if (error.name === 'ForbiddenError') {
      statusCode = 403;
      message = 'Forbidden';
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Not Found';
    } else if (error.name === 'RateLimitError') {
      statusCode = 429;
      message = 'Too Many Requests';
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      message = 'Service Unavailable';
    } else if (error.response && error.response.status) {
      // Handle HTTP errors from external APIs
      statusCode = error.response.status;
      message = error.response.statusText || error.message;
    }

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
      message = 'Internal Server Error';
      details = {};
    } else if (process.env.NODE_ENV !== 'production') {
      details.stack = error.stack;
    }

    res.status(statusCode).json({
      error: true,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.url,
      ...details
    });
  }

  // Handle 404 errors
  static handle404(req, res, next) {
    const error = new Error(`Route ${req.originalUrl} not found`);
    error.name = 'NotFoundError';
    next(error);
  }

  // Async error wrapper
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Validation error creator
  static createValidationError(message, details = {}) {
    const error = new Error(message);
    error.name = 'ValidationError';
    error.details = details;
    return error;
  }

  // Unauthorized error creator
  static createUnauthorizedError(message = 'Unauthorized access') {
    const error = new Error(message);
    error.name = 'UnauthorizedError';
    return error;
  }

  // Rate limit error creator
  static createRateLimitError(message = 'Rate limit exceeded') {
    const error = new Error(message);
    error.name = 'RateLimitError';
    return error;
  }

  // Handle unhandled promise rejections
  static handleUnhandledRejection() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason.toString(),
        stack: reason.stack,
        promise: promise.toString()
      });

      // Don't exit for configuration issues, just log them
      if (reason && reason.message && reason.message.includes('not configured')) {
        logger.warn('Configuration issue detected, continuing with limited functionality');
        return;
      }

      // Graceful shutdown for other critical errors
      process.exit(1);
    });
  }

  // Handle uncaught exceptions
  static handleUncaughtException() {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack
      });

      // Don't exit for configuration issues, just log them
      if (error && error.message && error.message.includes('not configured')) {
        logger.warn('Configuration issue detected, continuing with limited functionality');
        return;
      }

      // Graceful shutdown for other critical errors
      process.exit(1);
    });
  }

  // Initialize global error handlers
  static init() {
    this.handleUnhandledRejection();
    this.handleUncaughtException();
  }
}

module.exports = ErrorHandler;
