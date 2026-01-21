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
      let isCronerTimer = false;
      let isUndiciTimer = false;
      if (stack) {
        const stackLines = stack.split('\n');
        // Check if this is a croner timer (scheduler library)
        const hasCroner = stack.includes('croner') || 
          stack.includes('node_modules/croner') ||
          stack.includes('node_modules\\croner') ||
          stackLines.some(line => 
            line.includes('croner') || 
            line.includes('node_modules/croner') ||
            line.includes('node_modules\\croner')
          );
        
        if (hasCroner) {
          isCronerTimer = true;
        }
        
        // Check if this is an undici timer (HTTP client library - expected)
        const hasUndici = stack.includes('undici') || 
          stack.includes('node_modules/undici') ||
          stack.includes('node_modules\\undici') ||
          stackLines.some(line => 
            line.includes('undici') || 
            line.includes('node_modules/undici') ||
            line.includes('node_modules\\undici') ||
            line.includes('client-h1.js') ||
            line.includes('timers.js')
          );
        
        if (hasUndici) {
          isUndiciTimer = true;
        }
        
        // Skip Error line (0) and our wrapper (1), find the actual caller (2+)
        for (let i = 2; i < Math.min(stackLines.length, 10); i++) {
          const line = stackLines[i]?.trim();
          if (!line || line.includes('memoryMonitor.js')) continue; // Skip our wrapper
          
          // Skip croner internal files - they're expected and don't leak
          if (line.includes('croner') || 
              line.includes('node_modules/croner') || 
              line.includes('node_modules\\croner')) {
            isCronerTimer = true;
            // Try to find the actual caller that created the cron job by continuing to search
            continue;
          }
          
          // Skip undici internal files - they're expected (HTTP client connection management)
          if (line.includes('undici') || 
              line.includes('node_modules/undici') || 
              line.includes('node_modules\\undici') ||
              line.includes('client-h1.js') ||
              line.includes('timers.js')) {
            isUndiciTimer = true;
            // Try to find the actual caller by continuing to search
            continue;
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
        
        // If we detected croner but couldn't find the actual caller, mark it as croner
        if (isCronerTimer && sourcePattern === 'unknown') {
          sourcePattern = 'croner:internal';
        } else if (isCronerTimer) {
          sourcePattern = `croner:${sourcePattern}`;
        } else if (sourcePattern.includes('scheduler.js') && stack && 
                   (stack.includes('Cron') || stack.includes('createCronJob'))) {
          // If the source is scheduler.js and the stack shows Cron (croner) activity,
          // mark it as croner
          if (stack.includes('croner') || stack.includes('Cron')) {
            isCronerTimer = true;
            sourcePattern = `croner:scheduler.js:createCronJob`;
          }
        }
        
        // If we detected undici but couldn't find the actual caller, mark it as undici
        if (isUndiciTimer && sourcePattern === 'unknown') {
          sourcePattern = 'undici:internal';
        } else if (isUndiciTimer && !isCronerTimer) {
          sourcePattern = `undici:${sourcePattern}`;
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
        isCroner: isCronerTimer,
        isUndici: isUndiciTimer,
        isExpected: isCronerTimer || isUndiciTimer // Mark as expected if from known safe sources
      });
      
      // Only log if there's a potential leak (high count) and throttle warnings
      // Adjust threshold for croner timers which are expected during startup
      const now = Date.now();
      const count = self.activeTimers.size;
      
      // Calculate expected timer counts from ACTIVE timers (not total created)
      const activeTimerList = Array.from(self.activeTimers.values());
      const cronerTimerCount = activeTimerList.filter(t => t.isCroner).length;
      const undiciTimerCount = activeTimerList.filter(t => t.isUndici).length;
      const expectedCount = cronerTimerCount + undiciTimerCount;
      const unexpectedCount = count - expectedCount;
      
      // Only warn about unexpected timers - croner and undici timers are expected
      // Use higher threshold if most timers are from expected sources
      const effectiveCount = unexpectedCount; // Only count unexpected timers
      const threshold = 50; // Lower threshold for unexpected timers
      
      // Suppress warnings if most timers are from expected sources (croner/undici)
      // Only warn if there are many unexpected timers OR if total count is extremely high
      const shouldCheck = self.enabled && (effectiveCount > threshold || count > 500);
      
      if (shouldCheck) {
        // Only warn when crossing major thresholds or every 10 seconds
        const majorThresholds = [50, 100, 200, 500, 1000];
        const crossedThreshold = majorThresholds.some(th => 
          effectiveCount >= th && (self.lastTimerWarningCount < th || self.lastTimerWarningCount === 0)
        );
        const shouldWarn = crossedThreshold || 
          (now - self.lastTimerWarning > self.warningThrottleMs && effectiveCount > self.lastTimerWarningCount + 50);
        
        if (shouldWarn) {
          // Get top timer sources
          const topSources = Array.from(self.timerSources.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([source, count]) => `${source}: ${count}`)
            .join(', ');
          
          // Get oldest active timer for diagnosis (exclude expected timers like croner/undici)
          const allTimers = Array.from(self.activeTimers.values())
            .sort((a, b) => a.createdAt - b.createdAt);
          // Find oldest timer that's NOT from expected sources (croner/undici)
          const oldestUnexpectedTimer = allTimers.find(t => !t.isExpected) || allTimers[0];
          const oldestTimer = oldestUnexpectedTimer;
          
          const expectedInfo = expectedCount > 0 
            ? ` (${cronerTimerCount} croner, ${undiciTimerCount} undici - expected, ${unexpectedCount} other)` 
            : '';
          
          // Only warn if there are unexpected timers above threshold
          if (effectiveCount > threshold) {
            logger.warn('MEM', `High unexpected timeout count detected: ${unexpectedCount} unexpected timers (${count} total active: ${cronerTimerCount} croner, ${undiciTimerCount} undici, ${unexpectedCount} other) (${self.timerCount} total created)`);
          } else if (count > 500) {
            // Even if most are expected, warn if total is extremely high
            logger.warn('MEM', `Very high total timeout count: ${count} active timers${expectedInfo} (${self.timerCount} total created)`);
          }
          
          if (topSources) {
            logger.warn('MEM', `Top timer sources: ${topSources}`);
          }
          
          if (expectedCount > 0 && expectedCount > count * 0.5 && effectiveCount <= threshold) {
            logger.info('MEM', `Note: Most timers are from expected sources (${cronerTimerCount} croner, ${undiciTimerCount} undici) - this is safe`);
          }
          
          if (oldestTimer) {
            const age = Math.round((now - oldestTimer.createdAt) / 1000);
            const timerType = oldestTimer.isExpected ? 'expected' : 'unexpected';
            if (!oldestTimer.isExpected) {
              logger.warn('MEM', `Oldest unexpected timer: ${age}s old, source: ${oldestTimer.source}`);
            } else {
              logger.info('MEM', `Oldest timer: ${age}s old, source: ${oldestTimer.source} (${timerType} - safe)`);
            }
            
            // Log stack trace of oldest timer if it's very old and unexpected (potential leak)
            if (age > 60 && oldestTimer.stack && !oldestTimer.isExpected) {
              const stackPreview = oldestTimer.stack.split('\n').slice(0, 6).join('\n');
              logger.debug('MEM', `Oldest unexpected timer stack trace:\n${stackPreview}`);
            }
          }
          
          self.lastTimerWarning = now;
          self.lastTimerWarningCount = effectiveCount; // Track unexpected count for threshold detection
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
    const cronerTimerCount = Array.from(this.activeTimers.values()).filter(t => t.isCroner).length;
    const undiciTimerCount = Array.from(this.activeTimers.values()).filter(t => t.isUndici).length;
    const expectedTimerCount = Array.from(this.activeTimers.values()).filter(t => t.isExpected).length;
    const unexpectedTimerCount = stats.activeTimers - expectedTimerCount;
    const timerInfo = expectedTimerCount > 0 
      ? ` (${cronerTimerCount} croner, ${undiciTimerCount} undici, ${unexpectedTimerCount} other)` 
      : '';
    logger.info('MEM', `Memory Stats - RSS: ${formatBytes(stats.rss)}, Heap Used: ${formatBytes(stats.heapUsed)}, Heap Total: ${formatBytes(stats.heapTotal)}`);
    logger.info('MEM', `Active Resources - Intervals: ${stats.activeIntervals}, Timers: ${stats.activeTimers}${timerInfo}, Total Created: ${stats.totalIntervalsCreated} intervals, ${stats.totalTimersCreated} timers`);
    
    // Log top timer sources if there are many active timers
    if (stats.activeTimers > 50) {
      const topTimerSources = Array.from(this.timerSources.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([source, count]) => `${source}: ${count}`)
        .join(', ');
      if (topTimerSources) {
        logger.info('MEM', `Top timer sources: ${topTimerSources}`);
      }
      // Also show croner count if significant
      if (cronerTimerCount > 0) {
        const cronerSources = Array.from(this.timerSources.entries())
          .filter(([source]) => source.startsWith('croner:'))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([source, count]) => `${source}: ${count}`)
          .join(', ');
        if (cronerSources) {
          logger.info('MEM', `Croner timer sources: ${cronerSources} (expected behavior)`);
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
    
    // Warn about timer leaks
    if (timerLeak.hasLeak) {
      logger.warn('MEM', `Potential timer leak detected: ${timerLeak.activeCount} active ${timerLeak.type} (${timerLeak.createdCount} total created)`);
      
      // Log detailed analysis when leak is detected
      if (timerLeak.type === 'timers' && timerLeak.activeCount > 200) {
        // Get top sources
        const topSources = Array.from(this.timerSources.entries())
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
    
    // Get all timers, but exclude expected ones (croner/undici) for leak detection
    const allTimers = Array.from(this.activeTimers.values());
    const unexpectedTimers = allTimers.filter(t => !t.isExpected);
    const timerAge = unexpectedTimers
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
    
    // Check timers (exclude expected timers like croner/undici)
    // Only check unexpected timers for leaks
    if (unexpectedTimers.length > 50) {
      const oldTimers = timerAge.filter(t => t.age > 1 * 60 * 1000); // Older than 1 minute
      if (oldTimers.length > 20) {
        return {
          hasLeak: true,
          type: 'timers',
          activeCount: this.activeTimers.size,
          unexpectedCount: unexpectedTimers.length,
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
