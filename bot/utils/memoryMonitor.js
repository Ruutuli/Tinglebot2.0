// ============================================================================
// ------------------- Memory Monitor Utility -------------------
// Simplified memory monitoring - logs basic stats
// ============================================================================

const logger = require('./logger');
const v8 = require('v8');

// ============================================================================
// ------------------- Memory Monitor Class -------------------
// ============================================================================

class MemoryMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // Enabled by default
    this.warningThreshold = options.warningThreshold || 500 * 1024 * 1024; // 500MB
    this.criticalThreshold = options.criticalThreshold || 1000 * 1024 * 1024; // 1GB
    
    // Simple tracking
    this.cacheSizes = new Map(); // Track cache sizes
    this.resourceCounts = new Map(); // Track various resource counts
    
    if (this.enabled) {
      logger.info('MEM', 'Memory monitoring initialized');
    }
  }

  // ------------------- Get Memory Stats -------------------
  getMemoryStats() {
    const usage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    // Track database connections
    let dbConnections = 0;
    let dbConnectionStates = {};
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection && mongoose.connection.readyState !== undefined) {
        dbConnections = 1; // Main mongoose connection
        dbConnectionStates.mongoose = mongoose.connection.readyState;
        // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      }
    } catch (e) {
      // Mongoose not available
    }
    
    return {
      rss: usage.rss, // Resident Set Size
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      heapSizeLimit: heapStats.heap_size_limit,
      totalAvailableSize: heapStats.total_available_size,
      totalHeapSize: heapStats.total_heap_size,
      usedHeapSize: heapStats.used_heap_size,
      totalPhysicalSize: heapStats.total_physical_size,
      dbConnections,
      dbConnectionStates
    };
  }

  // ------------------- Log Memory Stats -------------------
  logMemoryStats() {
    const stats = this.getMemoryStats();
    
    // Format memory values
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };
    
    // Simple memory log
    logger.info('MEM', `📊 Memory: RSS=${formatBytes(stats.rss)} | Heap=${formatBytes(stats.heapUsed)}/${formatBytes(stats.heapTotal)}`);
    
    // Database, caches, resources on one line
    const dbInfo = stats.dbConnections > 0 
      ? Object.entries(stats.dbConnectionStates)
          .map(([name, state]) => {
            const stateNames = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
            return `${name}:${stateNames[state] || state}`;
          })
          .join(' ')
      : '';
    const cacheInfo = this.cacheSizes.size > 0
      ? Array.from(this.cacheSizes.entries())
          .map(([name, size]) => `${name}:${size}`)
          .join(' ')
      : '';
    const resourceInfo = this.resourceCounts.size > 0
      ? Array.from(this.resourceCounts.entries())
          .map(([name, count]) => `${name}:${count}`)
          .join(' ')
      : '';
    
    const resourcesLine = [dbInfo, cacheInfo, resourceInfo].filter(Boolean).join(' | ');
    if (resourcesLine) {
      logger.info('MEM', `💾 Resources: ${resourcesLine}`);
    }
    
    // Warn about memory issues
    if (stats.rss > this.criticalThreshold) {
      logger.error('MEM', `CRITICAL: Memory usage exceeds ${formatBytes(this.criticalThreshold)} - RSS: ${formatBytes(stats.rss)}`);
    } else if (stats.rss > this.warningThreshold) {
      logger.warn('MEM', `WARNING: Memory usage exceeds ${formatBytes(this.warningThreshold)} - RSS: ${formatBytes(stats.rss)}`);
    }
  }

  // ------------------- Track Cache Size -------------------
  trackCache(name, size) {
    this.cacheSizes.set(name, size);
  }

  // ------------------- Track Resource Count -------------------
  trackResource(name, count) {
    this.resourceCounts.set(name, count);
  }

  // ------------------- Stop Monitoring (no-op, kept for compatibility) -------------------
  stop() {
    // No-op - nothing to stop
  }
}

// ============================================================================
// ------------------- Create Singleton Instance -------------------
// ============================================================================

let memoryMonitorInstance = null;

function getMemoryMonitor(options = {}) {
  if (!memoryMonitorInstance) {
    memoryMonitorInstance = new MemoryMonitor(options);
  }
  return memoryMonitorInstance;
}

// ============================================================================
// ------------------- Export -------------------
// ============================================================================

module.exports = {
  MemoryMonitor,
  getMemoryMonitor
};
