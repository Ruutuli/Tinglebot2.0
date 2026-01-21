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
    
    // Throttle warnings to avoid log spam
    this.lastTimerWarning = 0;
    this.lastIntervalWarning = 0;
    this.warningThrottleMs = 10000; // Only warn every 10 seconds max
    this.lastTimerWarningCount = 0;
    this.lastIntervalWarningCount = 0;
    
    // Track timer creation sources for diagnosis
    this.timerSources = new Map(); // source pattern -> count
    this.intervalSources = new Map(); // source pattern -> count
    
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
      const stack = new Error().stack;
      
      // Extract source location from stack for tracking
      let sourcePattern = 'unknown';
      if (stack) {
        const stackLines = stack.split('\n');
        // Skip Error line (0) and our wrapper (1), find the actual caller (2+)
        for (let i = 2; i < Math.min(stackLines.length, 10); i++) {
          const line = stackLines[i]?.trim();
          if (!line || line.includes('memoryMonitor.js')) continue; // Skip our wrapper
          
          // Try multiple stack trace formats
          // Format 1: "    at functionName (file.js:123:45)"
          let match = line.match(/at\s+(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:${func}`;
            break;
          }
          
          // Format 2: "    at file.js:123:45"
          match = line.match(/at\s+([^:()\s]+):(\d+):(\d+)/);
          if (match) {
            const file = match[1].split(/[/\\]/).pop();
            sourcePattern = `${file}:line${match[2]}`;
            break;
          }
          
          // Format 3: "    at Object.functionName (file.js:123:45)"
          match = line.match(/at\s+(?:Object\.|Module\.)?(\w+)\s*\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:${func}`;
            break;
          }
          
          // Format 4: "    at new Promise (file.js:123:45)"
          match = line.match(/at\s+new\s+(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:new${func}`;
            break;
          }
          
          // Format 5: "    at Promise.race (file.js:123:45)"
          match = line.match(/at\s+(\w+)\.(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const obj = match[1];
            const func = match[2];
            const file = match[3].split(/[/\\]/).pop();
            sourcePattern = `${file}:${obj}.${func}`;
            break;
          }
          
          // Format 6: Just try to extract any file path
          match = line.match(/([^/\\]+\.(js|ts|mjs)):(\d+):(\d+)/);
          if (match) {
            const file = match[1];
            sourcePattern = `${file}:line${match[3]}`;
            break;
          }
        }
      }
      
      // Track source
      self.intervalSources.set(sourcePattern, (self.intervalSources.get(sourcePattern) || 0) + 1);
      
      self.activeIntervals.set(id, {
        id,
        createdAt: Date.now(),
        stack: stack,
        source: sourcePattern
      });
      
      // Only log if there's a potential leak (high count) and throttle warnings
      const now = Date.now();
      const count = self.activeIntervals.size;
      if (self.enabled && count > 50) {
        // Only warn when crossing major thresholds or every 10 seconds
        const majorThresholds = [50, 100, 200, 500, 1000, 2000, 5000];
        const crossedThreshold = majorThresholds.some(threshold => 
          count >= threshold && self.lastIntervalWarningCount < threshold
        );
        const shouldWarn = crossedThreshold || 
          (now - self.lastIntervalWarning > self.warningThrottleMs && count > self.lastIntervalWarningCount + 50);
        
        if (shouldWarn) {
          // Get top interval sources
          const topSources = Array.from(self.intervalSources.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([source, count]) => `${source}: ${count}`)
            .join(', ');
          
          logger.warn('MEM', `High interval count detected: ${count} active intervals (${self.intervalCount} total created)`);
          logger.warn('MEM', `Top interval sources: ${topSources}`);
          
          self.lastIntervalWarning = now;
          self.lastIntervalWarningCount = count;
        }
      }
      
      return id;
    };
    
    global.setTimeout = function(...args) {
      const id = self.originalSetTimeout.apply(global, args);
      self.timerCount++;
      const stack = new Error().stack;
      
      // Extract source location from stack for tracking
      let sourcePattern = 'unknown';
      let isNodeCronTimer = false;
      if (stack) {
        const stackLines = stack.split('\n');
        // Check if this is a node-cron internal timer (check full stack trace)
        const hasNodeCron = stack.includes('node-cron') || 
          stack.includes('node_modules/cron') ||
          stack.includes('node_modules\\cron') ||
          stackLines.some(line => 
            line.includes('node-cron') || 
            line.includes('node_modules/cron') ||
            line.includes('node_modules\\cron')
          );
        
        if (hasNodeCron) {
          isNodeCronTimer = true;
        }
        
        // Skip Error line (0) and our wrapper (1), find the actual caller (2+)
        for (let i = 2; i < Math.min(stackLines.length, 10); i++) {
          const line = stackLines[i]?.trim();
          if (!line || line.includes('memoryMonitor.js')) continue; // Skip our wrapper
          
          // Skip node-cron internal files - they're expected
          // Also check for common node-cron file patterns
          if (line.includes('node-cron') || 
              line.includes('node_modules/cron') || 
              line.includes('node_modules\\cron') ||
              line.includes('lib/node-cron') ||
              line.includes('lib\\node-cron') ||
              line.match(/[\/\\]cron[\/\\]/)) {
            isNodeCronTimer = true;
            // Try to find the actual caller that created the cron job by continuing to search
            continue;
          }
          
          // If the source pattern is scheduler.js and we haven't found node-cron yet,
          // but this looks like it might be from cron scheduling, mark it
          if (sourcePattern.includes('scheduler.js') && 
              (line.includes('schedule') || line.includes('createCronJob'))) {
            // This is likely a cron job being created, but the timer is from node-cron internals
            // We'll mark it when we see the actual node-cron code in the stack
          }
          
          // Try multiple stack trace formats
          // Format 1: "    at functionName (file.js:123:45)"
          let match = line.match(/at\s+(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:${func}`;
            break;
          }
          
          // Format 2: "    at file.js:123:45"
          match = line.match(/at\s+([^:()\s]+):(\d+):(\d+)/);
          if (match) {
            const file = match[1].split(/[/\\]/).pop();
            sourcePattern = `${file}:line${match[2]}`;
            break;
          }
          
          // Format 3: "    at Object.functionName (file.js:123:45)"
          match = line.match(/at\s+(?:Object\.|Module\.)?(\w+)\s*\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:${func}`;
            break;
          }
          
          // Format 4: "    at new Promise (file.js:123:45)"
          match = line.match(/at\s+new\s+(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const func = match[1];
            const file = match[2].split(/[/\\]/).pop();
            sourcePattern = `${file}:new${func}`;
            break;
          }
          
          // Format 5: "    at Promise.race (file.js:123:45)"
          match = line.match(/at\s+(\w+)\.(\w+)\s+\(([^:()]+):(\d+):(\d+)\)/);
          if (match) {
            const obj = match[1];
            const func = match[2];
            const file = match[3].split(/[/\\]/).pop();
            sourcePattern = `${file}:${obj}.${func}`;
            break;
          }
          
          // Format 6: Just try to extract any file path
          match = line.match(/([^/\\]+\.(js|ts|mjs)):(\d+):(\d+)/);
          if (match) {
            const file = match[1];
            sourcePattern = `${file}:line${match[3]}`;
            break;
          }
        }
        
        // If we detected node-cron but couldn't find the actual caller, mark it as node-cron
        if (isNodeCronTimer && sourcePattern === 'unknown') {
          sourcePattern = 'node-cron:internal';
        } else if (isNodeCronTimer) {
          sourcePattern = `node-cron:${sourcePattern}`;
        } else if (sourcePattern.includes('scheduler.js:line36') && stack && 
                   (stack.includes('schedule') || stack.includes('createCronJob') || 
                    stack.includes('cron.schedule'))) {
          // If the source is scheduler.js:line36 (import line) but the stack shows cron activity,
          // this is likely a node-cron timer that we couldn't detect properly
          // Mark it as node-cron but keep the source for reference
          isNodeCronTimer = true;
          sourcePattern = `node-cron:scheduler.js:line36`;
        }
        
        // If still unknown and we have stack, log first few lines for debugging (only first few times)
        if (sourcePattern === 'unknown' && stackLines.length > 2 && self.timerCount <= 5) {
          const sampleLines = stackLines.slice(2, 6).map(l => l.trim()).filter(l => l && !l.includes('memoryMonitor.js'));
          if (sampleLines.length > 0) {
            logger.debug('MEM', `Stack trace sample (timer #${self.timerCount}): ${sampleLines[0].substring(0, 150)}`);
          }
        }
      }
      
      // Track source
      self.timerSources.set(sourcePattern, (self.timerSources.get(sourcePattern) || 0) + 1);
      
      self.activeTimers.set(id, {
        id,
        createdAt: Date.now(),
        stack: stack,
        source: sourcePattern,
        isNodeCron: isNodeCronTimer
      });
      
      // Only log if there's a potential leak (high count) and throttle warnings
      // Adjust threshold for node-cron timers which are expected during startup
      const now = Date.now();
      const count = self.activeTimers.size;
      const nodeCronTimerCount = Array.from(self.activeTimers.values()).filter(t => t.isNodeCron).length;
      const nonNodeCronCount = count - nodeCronTimerCount;
      
      // Use higher threshold if most timers are from node-cron (expected behavior)
      const effectiveCount = nodeCronTimerCount > count * 0.7 ? nonNodeCronCount : count;
      const threshold = nodeCronTimerCount > count * 0.7 ? 200 : 100; // Higher threshold if mostly node-cron
      
      if (self.enabled && effectiveCount > threshold) {
        // Only warn when crossing major thresholds or every 10 seconds
        // Use effectiveCount for threshold checks to account for node-cron timers
        const majorThresholds = [100, 200, 500, 1000, 2000, 5000, 10000];
        const crossedThreshold = majorThresholds.some(th => 
          effectiveCount >= th && (self.lastTimerWarningCount < th || self.lastTimerWarningCount === 0)
        );
        const shouldWarn = crossedThreshold || 
          (now - self.lastTimerWarning > self.warningThrottleMs && effectiveCount > self.lastTimerWarningCount + 100);
        
        if (shouldWarn) {
          // Get top timer sources (excluding node-cron for cleaner output)
          const topSources = Array.from(self.timerSources.entries())
            .filter(([source]) => !source.startsWith('node-cron:'))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([source, count]) => `${source}: ${count}`)
            .join(', ');
          
          // Get node-cron timer count
          const nodeCronCount = Array.from(self.timerSources.entries())
            .filter(([source]) => source.startsWith('node-cron:'))
            .reduce((sum, [, count]) => sum + count, 0);
          
          // Get oldest active timer for diagnosis (prefer non-node-cron timers)
          const allTimers = Array.from(self.activeTimers.values())
            .sort((a, b) => a.createdAt - b.createdAt);
          const oldestTimer = allTimers.find(t => !t.isNodeCron) || allTimers[0];
          
          const nodeCronInfo = nodeCronCount > 0 ? ` (${nodeCronCount} from node-cron - expected)` : '';
          logger.warn('MEM', `High timeout count detected: ${count} active timers${nodeCronInfo} (${self.timerCount} total created)`);
          
          if (topSources) {
            logger.warn('MEM', `Top timer sources: ${topSources}`);
          }
          
          if (nodeCronCount > 0 && nodeCronCount > count * 0.5) {
            logger.info('MEM', `Note: Most timers are from node-cron scheduler (${nodeCronCount}/${count}) - this is expected behavior`);
          }
          
          if (oldestTimer) {
            const age = Math.round((now - oldestTimer.createdAt) / 1000);
            logger.warn('MEM', `Oldest timer: ${age}s old, source: ${oldestTimer.source}`);
            
            // Log stack trace of oldest timer if it's very old (potential leak)
            if (age > 60 && oldestTimer.stack && !oldestTimer.isNodeCron) {
              const stackPreview = oldestTimer.stack.split('\n').slice(0, 6).join('\n');
              logger.debug('MEM', `Oldest timer stack trace:\n${stackPreview}`);
            }
          }
          
          self.lastTimerWarning = now;
          self.lastTimerWarningCount = effectiveCount; // Track effective count for threshold detection
        }
      }
      
      return id;
    };
    
    global.clearInterval = function(id) {
      if (self.activeIntervals.has(id)) {
        self.activeIntervals.delete(id);
        self.intervalCount = Math.max(0, self.intervalCount - 1);
        // No logging on clear - too verbose
      }
      return self.originalClearInterval.apply(global, [id]);
    };
    
    global.clearTimeout = function(id) {
      if (self.activeTimers.has(id)) {
        self.activeTimers.delete(id);
        self.timerCount = Math.max(0, self.timerCount - 1);
        // No logging on clear - too verbose
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
    const nodeCronTimerCount = Array.from(this.activeTimers.values()).filter(t => t.isNodeCron).length;
    const nonNodeCronTimerCount = stats.activeTimers - nodeCronTimerCount;
    const nodeCronInfo = nodeCronTimerCount > 0 ? ` (${nodeCronTimerCount} node-cron, ${nonNodeCronTimerCount} other)` : '';
    logger.info('MEM', `Memory Stats - RSS: ${formatBytes(stats.rss)}, Heap Used: ${formatBytes(stats.heapUsed)}, Heap Total: ${formatBytes(stats.heapTotal)}`);
    logger.info('MEM', `Active Resources - Intervals: ${stats.activeIntervals}, Timers: ${stats.activeTimers}${nodeCronInfo}, Total Created: ${stats.totalIntervalsCreated} intervals, ${stats.totalTimersCreated} timers`);
    
    // Log top timer sources if there are many active timers (excluding node-cron for cleaner output)
    if (stats.activeTimers > 50) {
      const topTimerSources = Array.from(this.timerSources.entries())
        .filter(([source]) => !source.startsWith('node-cron:'))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([source, count]) => `${source}: ${count}`)
        .join(', ');
      if (topTimerSources) {
        logger.info('MEM', `Top timer sources: ${topTimerSources}`);
      }
      // Also show node-cron count if significant
      if (nodeCronTimerCount > 0) {
        const nodeCronSources = Array.from(this.timerSources.entries())
          .filter(([source]) => source.startsWith('node-cron:'))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([source, count]) => `${source}: ${count}`)
          .join(', ');
        if (nodeCronSources) {
          logger.info('MEM', `Node-cron timer sources: ${nodeCronSources} (expected behavior with timezone support)`);
        }
      }
    }
    
    // Log top interval sources if there are many active intervals
    if (stats.activeIntervals > 20) {
      const topIntervalSources = Array.from(this.intervalSources.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([source, count]) => `${source}: ${count}`)
        .join(', ');
      if (topIntervalSources) {
        logger.info('MEM', `Top interval sources: ${topIntervalSources}`);
      }
    }
    
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
    
    // Warn about timer leaks (excluding node-cron timers)
    if (timerLeak.hasLeak) {
      const nodeCronCount = Array.from(this.activeTimers.values()).filter(t => t.isNodeCron).length;
      const nodeCronInfo = nodeCronCount > 0 ? ` (${nodeCronCount} from node-cron - expected, ${timerLeak.nonNodeCronCount || timerLeak.activeCount} non-node-cron)` : '';
      logger.warn('MEM', `Potential timer leak detected: ${timerLeak.activeCount} active ${timerLeak.type}${nodeCronInfo} (${timerLeak.createdCount} total created)`);
      
      // Log detailed analysis when leak is detected
      if (timerLeak.type === 'timers' && (timerLeak.nonNodeCronCount || timerLeak.activeCount) > 200) {
        // Get top sources (excluding node-cron)
        const topSources = Array.from(this.timerSources.entries())
          .filter(([source]) => !source.startsWith('node-cron:'))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([source, count]) => `${source}: ${count}`)
          .join(', ');
        if (topSources) {
          logger.warn('MEM', `Top timer sources: ${topSources}`);
        }
      } else if (timerLeak.type === 'intervals' && stats.activeIntervals > 50) {
        const topSources = Array.from(this.intervalSources.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([source, count]) => `${source}: ${count}`)
          .join(', ');
        if (topSources) {
          logger.warn('MEM', `Top interval sources: ${topSources}`);
        }
      }
      
      // Log oldest active timers/intervals
      if (timerLeak.oldest) {
        logger.warn('MEM', `Oldest active ${timerLeak.type}: ${timerLeak.oldest.source || 'unknown'} - ${Math.round((now - timerLeak.oldest.createdAt) / 1000)}s old`);
        if (timerLeak.oldest.stack) {
          const stackPreview = timerLeak.oldest.stack.split('\n').slice(0, 4).join('\n');
          logger.debug('MEM', `Stack trace:\n${stackPreview}`);
        }
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
    
    // Filter out node-cron timers - they're expected behavior, not leaks
    // node-cron with timezone support creates many internal timers for scheduling
    const nonNodeCronTimers = Array.from(this.activeTimers.values())
      .filter(t => !t.isNodeCron);
    const timerAge = nonNodeCronTimers
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
    
    // Check timers (excluding node-cron timers which are expected)
    // node-cron with timezone creates many timers per job, so we only check non-node-cron timers
    if (nonNodeCronTimers.length > 50) {
      const oldTimers = timerAge.filter(t => t.age > 1 * 60 * 1000); // Older than 1 minute
      if (oldTimers.length > 20) {
        return {
          hasLeak: true,
          type: 'timers',
          activeCount: this.activeTimers.size,
          createdCount: this.timerCount,
          nonNodeCronCount: nonNodeCronTimers.length,
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
    
    // Show top timer sources
    if (this.timerSources.size > 0) {
      const topTimerSources = Array.from(this.timerSources.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      logger.info('MEM', `Top Timer Sources:`);
      topTimerSources.forEach(([source, count]) => {
        logger.info('MEM', `  ${source}: ${count} timers`);
      });
    }
    
    // Show top interval sources
    if (this.intervalSources.size > 0) {
      const topIntervalSources = Array.from(this.intervalSources.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      logger.info('MEM', `Top Interval Sources:`);
      topIntervalSources.forEach(([source, count]) => {
        logger.info('MEM', `  ${source}: ${count} intervals`);
      });
    }
    
    // Show oldest timers
    if (this.activeTimers.size > 0) {
      const oldestTimers = Array.from(this.activeTimers.values())
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, 5);
      logger.info('MEM', `Oldest Active Timers:`);
      oldestTimers.forEach(timer => {
        const age = Math.round((Date.now() - timer.createdAt) / 1000);
        logger.info('MEM', `  ${timer.source}: ${age}s old`);
      });
    }
    
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
  
  // ------------------- Analyze Timer Leak -------------------
  // Provides detailed analysis of timer leaks
  analyzeTimerLeak() {
    const now = Date.now();
    const analysis = {
      totalTimers: this.activeTimers.size,
      totalIntervals: this.activeIntervals.size,
      timerSources: {},
      intervalSources: {},
      oldestTimers: [],
      oldestIntervals: []
    };
    
    // Analyze timer sources
    for (const [source, count] of this.timerSources.entries()) {
      analysis.timerSources[source] = count;
    }
    
    // Analyze interval sources
    for (const [source, count] of this.intervalSources.entries()) {
      analysis.intervalSources[source] = count;
    }
    
    // Get oldest timers
    analysis.oldestTimers = Array.from(this.activeTimers.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 10)
      .map(timer => ({
        source: timer.source,
        age: Math.round((now - timer.createdAt) / 1000),
        stack: timer.stack?.split('\n').slice(0, 5).join('\n')
      }));
    
    // Get oldest intervals
    analysis.oldestIntervals = Array.from(this.activeIntervals.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 10)
      .map(interval => ({
        source: interval.source,
        age: Math.round((now - interval.createdAt) / 1000),
        stack: interval.stack?.split('\n').slice(0, 5).join('\n')
      }));
    
    return analysis;
  }
  
  // ------------------- Log Timer Leak Analysis -------------------
  logTimerLeakAnalysis() {
    const analysis = this.analyzeTimerLeak();
    
    logger.warn('MEM', '=== Timer Leak Analysis ===');
    logger.warn('MEM', `Active Timers: ${analysis.totalTimers}, Active Intervals: ${analysis.totalIntervals}`);
    
    if (Object.keys(analysis.timerSources).length > 0) {
      logger.warn('MEM', 'Top Timer Sources (by count):');
      const sorted = Object.entries(analysis.timerSources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sorted.forEach(([source, count]) => {
        logger.warn('MEM', `  ${source}: ${count} timers`);
      });
    }
    
    if (analysis.oldestTimers.length > 0) {
      logger.warn('MEM', 'Oldest Active Timers (potential leaks):');
      analysis.oldestTimers.forEach((timer, idx) => {
        logger.warn('MEM', `  ${idx + 1}. ${timer.source} - ${timer.age}s old`);
        if (timer.age > 60) {
          logger.debug('MEM', `     Stack: ${timer.stack}`);
        }
      });
    }
    
    logger.warn('MEM', '=== End Analysis ===');
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
