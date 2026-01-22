// ============================================================================
// ------------------- Request Logger Middleware -------------------
// Structured request logging for monitoring and debugging
// ============================================================================

const logger = require('../utils/logger.js');

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'true';

// ------------------- Function: requestLogger -------------------
// Logs structured request information
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to request object for use in error handlers
  req.requestId = requestId;
  
  // Skip detailed logging for image requests to reduce log clutter
  const isImageRequest = req.path.startsWith('/api/images/');
  
  // In production, only log requests if they're errors or slow
  // In development, log all requests
  if (!isProduction) {
    // Log request start (simplified for image requests)
    if (isImageRequest) {
      // Only log image requests if they're slow (>500ms) or have errors
      // We'll check this in the response handler
    } else {
      // Combine request info into single log line for non-image requests
      const requestInfo = [`${req.method} ${req.path}`];
      if (Object.keys(req.query).length > 0) {
        requestInfo.push(`Query: ${JSON.stringify(req.query)}`);
      }
      if (req.user) {
        requestInfo.push(`User: ${req.user.username}`);
      }
      logger.api('API', requestInfo.join(' | '));
    }
  }
  
  // Store original end function to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log response
    if (statusCode >= 500) {
      // Always log server errors
      logger.error('API', `Response: ${statusCode} - ${req.method} ${req.path} (${duration}ms)`);
    } else if (statusCode >= 400) {
      // Always log client errors
      logger.warn(`Response: ${statusCode} - ${req.method} ${req.path} (${duration}ms)`, 'requestLogger.js');
    } else if (isProduction) {
      // In production, only log slow requests (>1000ms) for successful responses
      if (duration > 1000) {
        logger.warn('API', `Slow response: ${statusCode} - ${req.method} ${req.path} (${duration}ms)`);
      }
    } else {
      // In development, log all successful responses
      if (isImageRequest) {
        // Only log slow image requests
        if (duration > 500) {
          logger.api(`Response: ${statusCode} - ${req.method} ${req.path} (${duration}ms)`, 'requestLogger.js');
        }
      } else {
        logger.api(`Response: ${statusCode} - ${req.method} ${req.path} (${duration}ms)`, 'requestLogger.js');
      }
    }
    
    // Set response time header only if headers haven't been sent
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.setHeader('X-Request-ID', requestId);
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
}

// ------------------- Function: errorLogger -------------------
// Logs errors with request context
function errorLogger(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  logger.error('API', `Error in ${req.method} ${req.path} [${requestId}]`, err);
  
  // Add request ID to error response if available
  if (res.headersSent === false) {
    res.setHeader('X-Request-ID', requestId);
  }
  
  next(err);
}

module.exports = {
  requestLogger,
  errorLogger
};

