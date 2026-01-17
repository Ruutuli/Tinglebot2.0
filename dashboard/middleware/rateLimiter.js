// ============================================================================
// ------------------- Rate Limiting Middleware -------------------
// Request rate limiting to prevent abuse
// ============================================================================

// Note: express-rate-limit will be added as a dependency
// For now, using a simple in-memory rate limiter

const logger = require('../../shared/utils/logger');

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'true';

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map();

// ------------------- Function: createRateLimiter -------------------
// Creates a rate limiter with specified options
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress
  } = options;

  return (req, res, next) => {
    // Skip rate limiting for static files (images, CSS, JS, etc.)
    // Static file requests can be very frequent and shouldn't count against API limits
    if (req.path.startsWith('/api/images/') || 
        req.path.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$/i)) {
      return next();
    }
    
    // req.user is populated from req.session.user by middleware in server.js
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);
    
    // Check if entry doesn't exist or if the reset time has passed
    // resetTime is set in the future (now + windowMs), so we check if now > resetTime
    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired entry
      entry = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, entry);
    }
    
    // Increment count
    entry.count++;
    
    // Set rate limit headers (only if headers haven't been sent)
    if (!res.headersSent) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
    }
    
    // Check if limit exceeded
    if (entry.count > max) {
      // Only log rate limit warnings in development, or if it's a repeated issue
      if (!isProduction) {
        logger.warn(`Rate limit exceeded for ${key} on ${req.path}`, 'rateLimiter.js');
      }
      return res.status(429).json({
        error: 'Too Many Requests',
        message: message,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      });
    }
    
    // Store original end function to track response
    const originalEnd = res.end;
    res.end = function(...args) {
      // Only count successful requests if skipSuccessfulRequests is false
      if (skipSuccessfulRequests && res.statusCode < 400) {
        entry.count = Math.max(0, entry.count - 1);
      }
      
      // Only count failed requests if skipFailedRequests is false
      if (skipFailedRequests && res.statusCode >= 400) {
        entry.count = Math.max(0, entry.count - 1);
      }
      
      originalEnd.apply(this, args);
    };
    
    next();
  };
}

// ------------------- Function: cleanupRateLimitStore -------------------
// Cleans up expired entries from rate limit store
function cleanupRateLimitStore() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  // Don't log cleanup in production
  if (cleaned > 0 && !isProduction) {
    logger.debug(`Cleaned up ${cleaned} expired rate limit entries`, null, 'rateLimiter.js');
  }
}

// ------------------- Function: clearRateLimitStore -------------------
// Clears all entries from the rate limit store (useful for development)
function clearRateLimitStore() {
  const size = rateLimitStore.size;
  rateLimitStore.clear();
  if (!isProduction) {
    logger.info(`Cleared all ${size} rate limit entries`, 'rateLimiter.js');
  }
  return size;
}

// Clean up expired entries more frequently in development (every minute) vs production (every 5 minutes)
const cleanupInterval = isProduction ? 5 * 60 * 1000 : 60 * 1000;
setInterval(cleanupRateLimitStore, cleanupInterval);

// Run initial cleanup on module load to clear any stuck entries from before the bug fix
// In development, clear ALL entries on restart to avoid issues with stuck rate limits
if (!isProduction) {
  // Small delay to ensure logger is ready
  setImmediate(() => {
    const size = rateLimitStore.size;
    if (size > 0) {
      // Clear all entries on restart in development to avoid stuck rate limits
      clearRateLimitStore();
      logger.info(`Cleared all ${size} rate limit entries on restart (development mode)`, 'rateLimiter.js');
    }
  });
}

// ------------------- Pre-configured Rate Limiters -------------------

// General API rate limiter - uses user-based tracking for authenticated users, IP for guests
// Authenticated users get higher limits since they're making legitimate dashboard requests
// In development, use much higher limits to avoid issues with page loads that make many requests
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000, // Much higher limit in development for page loads
  message: 'Too many API requests, please try again later',
  keyGenerator: (req) => {
    // Use user ID for authenticated users (allows higher limits per user)
    // Use IP for unauthenticated requests
    if (req.user && req.user.discordId) {
      return `user-${req.user.discordId}`;
    }
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Strict rate limiter for authentication endpoints (5 requests per 15 minutes)
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => {
    // Use IP + user agent for auth endpoints
    return `${req.ip || req.connection.remoteAddress}-${req.get('user-agent') || 'unknown'}`;
  }
});

// Admin endpoint rate limiter (200 requests per 15 minutes for authenticated users)
const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many admin requests, please try again later',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user ? `user-${req.user.discordId}` : req.ip || req.connection.remoteAddress;
  }
});

// Public endpoint rate limiter (50 requests per 15 minutes)
const publicLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many requests, please try again later'
});

module.exports = {
  createRateLimiter,
  generalLimiter,
  authLimiter,
  adminLimiter,
  publicLimiter,
  cleanupRateLimitStore,
  clearRateLimitStore
};

