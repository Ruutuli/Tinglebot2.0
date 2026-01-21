// ============================================================================
// ------------------- Memory Monitor Utility -------------------
// Tracks memory usage, timers, intervals, and resource counts to identify leaks
// ============================================================================

const logger = require('./logger');
const v8 = require('v8');

// ============================================================================
// ------------------- Memory Monitor Class -------------------
// ============================================================================

class MemoryMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // Enabled by default
    this.logInterval = options.logInterval || 5 * 60 * 1000; // 5 minutes default
    this.warningThreshold = options.warningThreshold || 500 * 1024 * 1024; // 500MB
    this.criticalThreshold = options.criticalThreshold || 1000 * 1024 * 1024; // 1GB
    
    // Tracking
    this.memoryHistory = [];
    this.maxHistorySize = 100; // Keep last 100 measurements
    this.timerCount = 0;
    this.intervalCount = 0;
    this.activeTimers = new Map(); // Track timer IDs
    this.activeIntervals = new Map(); // Track interval IDs
    this.cacheSizes = new Map(); // Track cache sizes
    this.resourceCounts = new Map(); // Track various resource counts
    
    // Override setInterval and setTimeout to track them
    this.originalSetInterval = global.setInterval;
    this.originalSetTimeout = global.setTimeout;
    this.originalClearInterval = global.clearInterval;
    this.originalClearTimeout = global.clearTimeout;
    
    // Monitoring interval
    this.monitoringInterval = null;
    
    if (this.enabled) {
      this.start();
    }
  }

  // ------------------- Start Monitoring -------------------
  start() {
    if (this.monitoringInterval) {
      return; // Already started
    }
    
    this.wrapTimers();
    this.monitoringInterval = this.originalSetInterval(() => {
      this.logMemoryStats();
    }, this.logInterval);
    
    logger.info('MEM', 'Memory monitoring started');
  }

  // ------------------- Stop Monitoring -------------------
  stop() {
    if (this.monitoringInterval) {
      this.originalClearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.restoreTimers();
    logger.info('MEM', 'Memory monitoring stopped');
  }

  // ------------------- Wrap Timers to Track Them -------------------
  wrapTimers() {
    const self = this;
    
    global.setInterval = function(...args) {
      const id = self.originalSetInterval.apply(global, args);
      self.intervalCount++;
      self.activeIntervals.set(id, {
        id,
        createdAt: Date.now(),
        stack: new Error().stack
      });
      
      if (self.enabled) {
        logger.debug(`Interval created (total: ${self.intervalCount})`, {
          intervalId: id,
          activeIntervals: self.activeIntervals.size
        }, 'MEM');
      }
      
      return id;
    };
    
    global.setTimeout = function(...args) {
      const id = self.originalSetTimeout.apply(global, args);
      self.timerCount++;
      self.activeTimers.set(id, {
        id,
        createdAt: Date.now(),
        stack: new Error().stack
      });
      
      if (self.enabled) {
        logger.debug(`Timeout created (total: ${self.timerCount})`, {
          timeoutId: id,
          activeTimers: self.activeTimers.size
        }, 'MEM');
      }
      
      return id;
    };
    
    global.clearInterval = function(id) {
      if (self.activeIntervals.has(id)) {
        self.activeIntervals.delete(id);
        self.intervalCount = Math.max(0, self.intervalCount - 1);
        
        if (self.enabled) {
          logger.debug(`Interval cleared (remaining: ${self.activeIntervals.size})`, {
            intervalId: id
          }, 'MEM');
        }
      }
      return self.originalClearInterval.apply(global, [id]);
    };
    
    global.clearTimeout = function(id) {
      if (self.activeTimers.has(id)) {
        self.activeTimers.delete(id);
        self.timerCount = Math.max(0, self.timerCount - 1);
        
        if (self.enabled) {
          logger.debug(`Timeout cleared (remaining: ${self.activeTimers.size})`, {
            timeoutId: id
          }, 'MEM');
        }
      }
      return self.originalClearTimeout.apply(global, [id]);
    };
  }

  // ------------------- Restore Original Timers -------------------
  restoreTimers() {
    global.setInterval = this.originalSetInterval;
    global.setTimeout = this.originalSetTimeout;
    global.clearInterval = this.originalClearInterval;
    global.clearTimeout = this.originalClearTimeout;
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
      activeIntervals: this.activeIntervals.size,
      activeTimers: this.activeTimers.size,
      totalIntervalsCreated: this.intervalCount,
      totalTimersCreated: this.timerCount,
      dbConnections,
      dbConnectionStates
    };
  }

  // ------------------- Log Memory Stats -------------------
  logMemoryStats() {
    const stats = this.getMemoryStats();
    const now = Date.now();
    
    // Add to history
    this.memoryHistory.push({
      timestamp: now,
      ...stats
    });
    
    // Trim history
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
    
    // Check for memory growth trend
    const growth = this.detectMemoryGrowth();
    const timerLeak = this.detectTimerLeak();
    
    // Format memory values
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };
    
    // Log memory stats
    logger.info('MEM', `Memory Stats - RSS: ${formatBytes(stats.rss)}, Heap Used: ${formatBytes(stats.heapUsed)}, Heap Total: ${formatBytes(stats.heapTotal)}`);
    logger.info('MEM', `Active Resources - Intervals: ${stats.activeIntervals}, Timers: ${stats.activeTimers}, Total Created: ${stats.totalIntervalsCreated} intervals, ${stats.totalTimersCreated} timers`);
    
    // Log database connections
    if (stats.dbConnections > 0) {
      const stateNames = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
      const states = Object.entries(stats.dbConnectionStates)
        .map(([name, state]) => `${name}: ${stateNames[state] || state}`)
        .join(', ');
      logger.info('MEM', `Database Connections - ${stats.dbConnections} connection(s): ${states}`);
    }
    
    // Log cache sizes if tracked
    if (this.cacheSizes.size > 0) {
      const cacheInfo = Array.from(this.cacheSizes.entries())
        .map(([name, size]) => `${name}: ${size}`)
        .join(', ');
      logger.info('MEM', `Cache Sizes - ${cacheInfo}`);
    }
    
    // Log resource counts if tracked
    if (this.resourceCounts.size > 0) {
      const resourceInfo = Array.from(this.resourceCounts.entries())
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ');
      logger.info('MEM', `Resource Counts - ${resourceInfo}`);
    }
    
    // Log database operation counts if available
    try {
      const dbOps = require('../database/db').getDbOperationCounts?.();
      if (dbOps) {
        const totalOps = Object.values(dbOps).reduce((a, b) => a + b, 0);
        logger.info('MEM', `Database Operations - Queries: ${dbOps.queries || 0}, Updates: ${dbOps.updates || 0}, Inserts: ${dbOps.inserts || 0}, Deletes: ${dbOps.deletes || 0}, Transactions: ${dbOps.transactions || 0}, Total: ${totalOps}`);
      }
    } catch (e) {
      // Ignore errors accessing db operations
    }
    
    // Warn about memory issues
    if (stats.rss > this.criticalThreshold) {
      logger.error('MEM', `CRITICAL: Memory usage exceeds ${formatBytes(this.criticalThreshold)} - RSS: ${formatBytes(stats.rss)}`);
    } else if (stats.rss > this.warningThreshold) {
      logger.warn('MEM', `WARNING: Memory usage exceeds ${formatBytes(this.warningThreshold)} - RSS: ${formatBytes(stats.rss)}`);
    }
    
    // Warn about memory growth
    if (growth.isGrowing) {
      logger.warn('MEM', `Memory growth detected: ${formatBytes(growth.growth)} over ${Math.round(growth.duration / 1000)}s (${formatBytes(growth.ratePerMinute)}/min)`);
    }
    
    // Warn about timer leaks
    if (timerLeak.hasLeak) {
      logger.warn('MEM', `Potential timer leak detected: ${timerLeak.activeCount} active ${timerLeak.type} (${timerLeak.createdCount} total created)`);
      
      // Log oldest active timers/intervals
      if (timerLeak.oldest) {
        logger.debug('MEM', `Oldest active ${timerLeak.type}:`, {
          id: timerLeak.oldest.id,
          age: Math.round((now - timerLeak.oldest.createdAt) / 1000) + 's',
          stack: timerLeak.oldest.stack?.split('\n').slice(0, 5).join('\n')
        }, 'MEM');
      }
    }
  }

  // ------------------- Detect Memory Growth -------------------
  detectMemoryGrowth() {
    if (this.memoryHistory.length < 5) {
      return { isGrowing: false };
    }
    
    const recent = this.memoryHistory.slice(-5);
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    
    const growth = newest.rss - oldest.rss;
    const duration = newest.timestamp - oldest.timestamp;
    const ratePerMinute = (growth / duration) * 60 * 1000;
    
    // Consider it growing if RSS increased by more than 10MB
    const isGrowing = growth > 10 * 1024 * 1024;
    
    return {
      isGrowing,
      growth,
      duration,
      ratePerMinute,
      oldestRSS: oldest.rss,
      newestRSS: newest.rss
    };
  }

  // ------------------- Detect Timer Leak -------------------
  detectTimerLeak() {
    const now = Date.now();
    const intervalAge = Array.from(this.activeIntervals.values())
      .map(i => ({ ...i, age: now - i.createdAt }))
      .sort((a, b) => b.age - a.age);
    
    const timerAge = Array.from(this.activeTimers.values())
      .map(t => ({ ...t, age: now - t.createdAt }))
      .sort((a, b) => b.age - a.age);
    
    // Check intervals
    if (this.activeIntervals.size > 20) {
      const oldIntervals = intervalAge.filter(i => i.age > 5 * 60 * 1000); // Older than 5 minutes
      if (oldIntervals.length > 10) {
        return {
          hasLeak: true,
          type: 'intervals',
          activeCount: this.activeIntervals.size,
          createdCount: this.intervalCount,
          oldest: intervalAge[0]
        };
      }
    }
    
    // Check timers
    if (this.activeTimers.size > 50) {
      const oldTimers = timerAge.filter(t => t.age > 1 * 60 * 1000); // Older than 1 minute
      if (oldTimers.length > 20) {
        return {
          hasLeak: true,
          type: 'timers',
          activeCount: this.activeTimers.size,
          createdCount: this.timerCount,
          oldest: timerAge[0]
        };
      }
    }
    
    return { hasLeak: false };
  }

  // ------------------- Track Cache Size -------------------
  trackCache(name, size) {
    this.cacheSizes.set(name, size);
  }

  // ------------------- Track Resource Count -------------------
  trackResource(name, count) {
    this.resourceCounts.set(name, count);
  }

  // ------------------- Get Full Report -------------------
  getFullReport() {
    const stats = this.getMemoryStats();
    const growth = this.detectMemoryGrowth();
    const timerLeak = this.detectTimerLeak();
    
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };
    
    return {
      memory: {
        rss: formatBytes(stats.rss),
        heapUsed: formatBytes(stats.heapUsed),
        heapTotal: formatBytes(stats.heapTotal),
        external: formatBytes(stats.external),
        arrayBuffers: formatBytes(stats.arrayBuffers)
      },
      timers: {
        activeIntervals: stats.activeIntervals,
        activeTimers: stats.activeTimers,
        totalIntervalsCreated: stats.totalIntervalsCreated,
        totalTimersCreated: stats.totalTimersCreated
      },
      caches: Object.fromEntries(this.cacheSizes),
      resources: Object.fromEntries(this.resourceCounts),
      growth: growth.isGrowing ? {
        growth: formatBytes(growth.growth),
        ratePerMinute: formatBytes(growth.ratePerMinute)
      } : null,
      leaks: timerLeak.hasLeak ? timerLeak : null,
      history: this.memoryHistory.slice(-10).map(h => ({
        timestamp: new Date(h.timestamp).toISOString(),
        rss: formatBytes(h.rss),
        heapUsed: formatBytes(h.heapUsed)
      }))
    };
  }

  // ------------------- Log Full Report -------------------
  logFullReport() {
    const report = this.getFullReport();
    
    logger.info('MEM', '=== Memory Monitor Full Report ===');
    logger.info('MEM', `Memory: RSS=${report.memory.rss}, Heap Used=${report.memory.heapUsed}, Heap Total=${report.memory.heapTotal}`);
    logger.info('MEM', `Timers: ${report.timers.activeIntervals} intervals, ${report.timers.activeTimers} timers`);
    logger.info('MEM', `Total Created: ${report.timers.totalIntervalsCreated} intervals, ${report.timers.totalTimersCreated} timers`);
    
    if (Object.keys(report.caches).length > 0) {
      logger.info('MEM', `Caches: ${JSON.stringify(report.caches)}`);
    }
    
    if (Object.keys(report.resources).length > 0) {
      logger.info('MEM', `Resources: ${JSON.stringify(report.resources)}`);
    }
    
    if (report.growth) {
      logger.warn('MEM', `Memory Growth: ${report.growth.growth} (${report.growth.ratePerMinute}/min)`);
    }
    
    if (report.leaks) {
      logger.warn('MEM', `Potential Leak: ${report.leaks.type} - ${report.leaks.activeCount} active`);
    }
    
    logger.info('MEM', '=== End Report ===');
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
