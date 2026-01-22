// ============================================================================
// ------------------- Railway-Specific Optimizations -------------------
// Memory and performance optimizations for Railway deployment
// ============================================================================

const logger = require('./logger');

const isRailway = process.env.RAILWAY_ENVIRONMENT === 'true' || 
                  process.env.RAILWAY_PROJECT_ID || 
                  process.env.RAILWAY_SERVICE_NAME;

// ============================================================================
// ------------------- Memory Optimizations -------------------
// ============================================================================

/**
 * Configure Node.js for Railway production environment
 * Railway has memory limits, so we optimize for memory usage
 */
function configureRailwayOptimizations() {
  if (!isRailway) {
    return; // Skip if not on Railway
  }

  logger.info('RAILWAY', 'Applying Railway-specific optimizations...');

  // 1. Set Node.js memory limits (Railway typically provides 512MB-1GB)
  // We'll let Node.js use most of it but leave some headroom
  const maxOldSpaceSize = process.env.NODE_OPTIONS?.includes('--max-old-space-size') 
    ? null // Already set
    : Math.floor((process.memoryLimit?.() || 512 * 1024 * 1024) * 0.85 / 1024 / 1024); // 85% of available

  if (maxOldSpaceSize && !process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
    // Note: This won't take effect for the current process, but can be set in Railway env vars
    logger.info('RAILWAY', `Recommended NODE_OPTIONS: --max-old-space-size=${maxOldSpaceSize}`);
  }

  // 2. Enable garbage collection hints for better memory management
  if (global.gc) {
    // If --expose-gc flag is set, we can manually trigger GC
    // Railway doesn't expose this by default, but it's good to have the code ready
    logger.info('RAILWAY', 'Manual GC available (use sparingly)');
  }

  // 3. Optimize V8 heap settings
  // These are set via NODE_OPTIONS in Railway environment variables
  logger.info('RAILWAY', 'V8 heap optimizations should be set via NODE_OPTIONS env var');

  logger.success('RAILWAY', 'Railway optimizations configured');
}

/**
 * Get recommended Railway environment variables
 */
function getRailwayEnvRecommendations() {
  return {
    // Node.js memory management
    NODE_OPTIONS: '--max-old-space-size=768', // For 1GB Railway plan, use ~75%
    
    // Enable production mode
    NODE_ENV: 'production',
    RAILWAY_ENVIRONMENT: 'true',
    
    // Database connection pooling (already in code, but good to verify)
    // MongoDB connection strings should include: maxPoolSize=10
    
    // Disable unnecessary features in production
    // (Add any other optimizations here)
  };
}

/**
 * Monitor memory usage and log warnings if approaching limits
 */
function setupRailwayMemoryMonitoring() {
  if (!isRailway) {
    return;
  }

  const memoryMonitor = require('./memoryMonitor').getMemoryMonitor();
  if (!memoryMonitor) {
    return;
  }

  // Check memory every 5 minutes
  setInterval(() => {
    const usage = process.memoryUsage();
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);

    // Railway typically provides 512MB-1GB, warn at 80%
    const memoryLimitMB = 800; // Conservative estimate for 1GB plan
    const memoryUsagePercent = (rssMB / memoryLimitMB) * 100;

    if (memoryUsagePercent > 80) {
      logger.warn('RAILWAY', `High memory usage: ${rssMB}MB RSS (${Math.round(memoryUsagePercent)}% of estimated limit)`);
      logger.warn('RAILWAY', `Heap: ${heapUsedMB}MB used / ${heapTotalMB}MB total`);
      
      // Log memory monitor stats if available
      const stats = memoryMonitor.getMemoryStats();
      logger.warn('RAILWAY', `Active timers: ${stats.activeTimers}, Active intervals: ${stats.activeIntervals}`);
    } else if (memoryUsagePercent > 60) {
      logger.info('RAILWAY', `Memory usage: ${rssMB}MB RSS (${Math.round(memoryUsagePercent)}%)`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// ============================================================================
// ------------------- Database Connection Optimizations -------------------
// ============================================================================

/**
 * Get optimized database connection options for Railway
 */
function getRailwayDbOptions() {
  if (!isRailway) {
    return {};
  }

  return {
    // Connection pool settings optimized for Railway
    maxPoolSize: 10,        // Limit concurrent connections
    minPoolSize: 2,         // Keep some warm connections
    maxIdleTimeMS: 30000,   // Close idle connections faster (30s vs default 90s)
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 10000,
    
    // Enable connection monitoring
    monitorCommands: false, // Disable in production for performance
  };
}

// ============================================================================
// ------------------- Cache Optimizations -------------------
// ============================================================================

/**
 * Get optimized cache settings for Railway
 * Note: Caching has been removed to prevent memory leaks
 */
function getRailwayCacheSettings() {
  // Caching removed - return empty object
  return {};
}

// ============================================================================
// ------------------- Export -------------------
// ============================================================================

module.exports = {
  isRailway,
  configureRailwayOptimizations,
  getRailwayEnvRecommendations,
  setupRailwayMemoryMonitoring,
  getRailwayDbOptions,
  getRailwayCacheSettings
};
