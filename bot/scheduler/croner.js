// bot/scheduler/croner.js
// Bot-specific croner wrapper
// Ensures singleton pattern and prevents duplicate job creation

const { Cron } = require("croner");
const logger = require('@/shared/utils/logger');

// Singleton pattern - single instance across all modules
const activeCrons = new Map(); // name -> Cron instance

// Track execution patterns for debugging
const executionHistory = new Map(); // name -> { count, lastExec, firstExec, execTimes: [] }
let totalExecutions = 0;

// Track timer creation for leak detection
const timerCreationLog = new Map(); // jobName -> [{ timestamp, stack, timerCount }]
let lastTimerCount = 0;
let lastTimerCheckTime = Date.now();

// Job creation lock to prevent concurrent creation of same job
const jobCreationLocks = new Map(); // name -> Promise

// Track initialization state (module-level)
let isInitialized = false;
let initializationStack = null;

// Process-level guard (persists across module reloads)
// Use a symbol to avoid conflicts with other code
const SCHEDULER_INIT_KEY = Symbol.for('TINGLEBOT_SCHEDULER_INITIALIZED');

/**
 * Check for duplicate scheduler initialization
 * Uses both module-level and process-level guards to prevent duplicates
 * even if the module is reloaded or cleared from cache
 */
function checkInitialization() {
  const stack = new Error().stack;
  
  // Check process-level guard first (survives module cache clears)
  if (global[SCHEDULER_INIT_KEY]) {
    logger.error('SCHEDULER', `⚠️ CRITICAL: Scheduler already initialized at process level! Attempted re-initialization detected.`);
    logger.error('SCHEDULER', `Original initialization stack:`, global[SCHEDULER_INIT_KEY].stack);
    logger.error('SCHEDULER', `New initialization attempt stack:`, stack);
    return false;
  }
  
  // Check module-level guard (for same-module duplicate calls)
  if (isInitialized) {
    logger.error('SCHEDULER', `⚠️ CRITICAL: Scheduler already initialized at module level! Attempted re-initialization detected.`);
    logger.error('SCHEDULER', `Original initialization stack:`, initializationStack);
    logger.error('SCHEDULER', `New initialization attempt stack:`, stack);
    return false;
  }
  
  // Set both guards
  isInitialized = true;
  initializationStack = stack;
  global[SCHEDULER_INIT_KEY] = { stack, timestamp: Date.now() };
  
  logger.info('SCHEDULER', `✅ Scheduler initialization guard set (process-level + module-level)`);
  return true;
}

/**
 * Create a cron job with the given name, pattern, and function
 * @param {string} name - Unique name for the job (used for deduplication)
 * @param {string} pattern - Cron pattern (e.g., "0 0 * * *")
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options object with timezone, maxRuns, etc.
 * @returns {Cron} The created Cron instance
 */
function createCronJob(name, pattern, fn, options = {}) {
  // Always capture stack trace for debugging (even if silent)
  const stack = new Error().stack;
  
  // Log to track timer leaks (unless silent option is set)
  if (!options.silent) {
    const caller = stack.split('\n')[2]?.trim() || 'unknown';
    logger.warn('SCHEDULER', `🔍 Creating job "${name}" (${pattern}) - Called from: ${caller}`);
  }
  
  // Check for existing lock - if locked, stop existing job first
  if (jobCreationLocks.has(name)) {
    logger.warn('SCHEDULER', `⏳ Job "${name}" creation already in progress, stopping existing first...`);
    // Stop existing job immediately
    const existingJob = activeCrons.get(name);
    if (existingJob) {
      try {
        existingJob.stop();
        activeCrons.delete(name);
        executionHistory.delete(name);
        timerCreationLog.delete(name);
        // Note: Croner's internal timer cleanup happens asynchronously
        // We can't wait synchronously, but stop() should trigger cleanup
      } catch (error) {
        logger.error('SCHEDULER', `Error stopping existing job "${name}":`, error.message);
      }
    }
    // Clear the lock
    jobCreationLocks.delete(name);
  }

  // Set lock for this job
  jobCreationLocks.set(name, true);

  try {
    // CRITICAL: Stop any existing job with same name BEFORE creating new one
    // This prevents timer leaks from duplicate jobs (per croner best practices)
    const existingJob = activeCrons.get(name);
    if (existingJob) {
      logger.error('SCHEDULER', `⚠️ CRITICAL: Job "${name}" already exists - stopping before recreating! This indicates a timer leak!`);
      logger.error('SCHEDULER', `Stack trace:`, stack);
      try {
        // Stop the job - this should clean up croner's internal timers
        // Per croner docs: Always call .stop() before creating a new job with the same name
        existingJob.stop();
        
        // Remove from tracking immediately
        activeCrons.delete(name);
        executionHistory.delete(name);
        timerCreationLog.delete(name);
        
        logger.warn('SCHEDULER', `✅ Stopped existing job "${name}" before recreating`);
        
        // Note: Croner's internal timer cleanup happens asynchronously after stop()
        // We can't wait synchronously here, but stop() should trigger the cleanup
        // If timers still accumulate, it's a croner internal issue
      } catch (error) {
        logger.error('SCHEDULER', `Error stopping existing job "${name}":`, error.message);
        // Still remove from tracking even if stop() fails
        activeCrons.delete(name);
        executionHistory.delete(name);
        timerCreationLog.delete(name);
      }
    }

      // Build cron options - only set timezone if explicitly provided
      const cronOptions = {
        maxRuns: options.maxRuns,
        protect: true, // prevent overlapping runs by default
        catch: true, // Automatically catch errors
        // Add unref to prevent timers from keeping process alive unnecessarily
        // This helps with timer cleanup
        unref: false, // Keep false to ensure jobs run even if process would exit
      };
      
      // Only set timezone if explicitly provided (to avoid memory leaks)
      // NOTE: Setting timezone can cause timer leaks in croner - avoid unless necessary
      if (options.timezone && typeof options.timezone === 'string') {
        cronOptions.timezone = options.timezone;
      }

      // Track job creation time for debugging
      const jobCreatedAt = Date.now();
      let executionCount = 0;
      
      // Initialize execution history for this job
      executionHistory.set(name, {
        count: 0,
        firstExec: null,
        lastExec: null,
        execTimes: [],
        createdAt: jobCreatedAt
      });
      
      // Track timer count before job creation
      const timerCountBefore = getCurrentTimerCount();
      
      const job = new Cron(
        pattern,
        cronOptions,
        async () => {
          executionCount++;
          totalExecutions++;
          const execTime = Date.now();
          const age = execTime - jobCreatedAt;
          
          // Update execution history
          const history = executionHistory.get(name);
          if (history) {
            history.count = executionCount;
            if (!history.firstExec) history.firstExec = execTime;
            history.lastExec = execTime;
            history.execTimes.push(execTime);
            // Keep only last 10 execution times
            if (history.execTimes.length > 10) {
              history.execTimes.shift();
            }
          }
          
          // Log every execution to track patterns
          const timeSinceLastExec = history && history.execTimes.length > 1 
            ? execTime - history.execTimes[history.execTimes.length - 2]
            : null;
          const execInfo = timeSinceLastExec 
            ? `(interval: ${Math.round(timeSinceLastExec/1000)}s)`
            : `(first exec)`;
          
          logger.warn('SCHEDULER', `[Croner:${name}] ⚡ Exec #${executionCount} ${execInfo} | Age: ${Math.round(age/1000)}s | Pattern: ${pattern}`);
          
          // Warn if execution interval is suspicious (might indicate duplicate jobs)
          if (timeSinceLastExec && timeSinceLastExec < 1000) {
            logger.error('SCHEDULER', `[Croner:${name}] ⚠️ SUSPICIOUS: Executed again after only ${timeSinceLastExec}ms! This might indicate duplicate jobs!`);
          }
          
          try {
            const fnStart = Date.now();
            await fn();
            const fnDuration = Date.now() - fnStart;
            if (fnDuration > 5000) {
              logger.warn('SCHEDULER', `[Croner:${name}] ⏱️ Slow execution: ${fnDuration}ms`);
            }
          } catch (err) {
            logger.error('SCHEDULER', `[Croner:${name}] ❌ Error on execution #${executionCount}:`, err);
          }
        }
      );

      // Track timer count after job creation
      const timerCountAfter = getCurrentTimerCount();
      const timersCreated = timerCountAfter - timerCountBefore;
      
      // Log timer creation
      if (!timerCreationLog.has(name)) {
        timerCreationLog.set(name, []);
      }
      timerCreationLog.get(name).push({
        timestamp: Date.now(),
        stack: stack,
        timerCount: timersCreated,
        totalTimers: timerCountAfter
      });
      // Keep only last 5 entries per job
      const log = timerCreationLog.get(name);
      if (log.length > 5) {
        log.shift();
      }

      activeCrons.set(name, job);
      
      // Always calculate totalJobs for leak detection (even if silent)
      const totalJobs = activeCrons.size;
      
      // Log job creation to track timer leaks (unless silent)
      if (!options.silent) {
        logger.warn('SCHEDULER', `🔍 Scheduled "${name}" -> ${pattern} tz=${cronOptions.timezone || "UTC"} (total active jobs: ${totalJobs}, timers created: ${timersCreated})`);
        
        // Log job instance details for debugging
        try {
          const jobInfo = {
            name,
            pattern,
            timezone: cronOptions.timezone || 'UTC',
            protect: cronOptions.protect,
            maxRuns: cronOptions.maxRuns || 'unlimited',
            // Try to get internal state
            paused: job.paused || false,
            running: job.running || false,
            // Get next scheduled time if available
            nextRun: job.nextRun ? new Date(job.nextRun).toISOString() : 'unknown'
          };
          logger.debug('SCHEDULER', `📋 Job details:`, JSON.stringify(jobInfo, null, 2));
        } catch (e) {
          // Ignore if we can't access job properties
        }
      }
      
      // Check if we're creating duplicate jobs (this would cause timer leaks)
      if (totalJobs > 100) {
        logger.error('SCHEDULER', `⚠️ WARNING: ${totalJobs} active cron jobs detected! This is abnormal and may indicate a timer leak!`);
        logger.error('SCHEDULER', `Active job names:`, Array.from(activeCrons.keys()).slice(0, 20).join(', '), activeCrons.size > 20 ? '...' : '');
      }

      // Warn if too many timers created for this job
      if (timersCreated > 5) {
        logger.warn('SCHEDULER', `⚠️ Job "${name}" created ${timersCreated} timers (expected 1-2). This may indicate a timer leak!`);
      }
      
      return job;
  } catch (error) {
    logger.error('SCHEDULER', `Error creating job "${name}":`, error.message);
    jobCreationLocks.delete(name);
    throw error;
  } finally {
    // Remove lock
    jobCreationLocks.delete(name);
  }
}

/**
 * Get current timer count (helper for tracking)
 */
function getCurrentTimerCount() {
  try {
    const { getMemoryMonitor } = require('@/shared/utils/memoryMonitor');
    const memMonitor = getMemoryMonitor();
    if (memMonitor && memMonitor.activeTimers) {
      return Array.from(memMonitor.activeTimers.values()).filter(t => t.isCroner).length;
    }
  } catch (e) {
    // Memory monitor not available
  }
  return 0;
}

/**
 * Destroy a cron job by name
 * @param {string} name - Name of the job to destroy
 */
function destroyCronJob(name) {
  const job = activeCrons.get(name);
  if (job) {
    try {
      const history = executionHistory.get(name);
      const execCount = history ? history.count : 0;
      
      // Stop the job
      job.stop();
      
      // Log destruction with execution history
      logger.warn('SCHEDULER', `🗑️ Destroying "${name}" (had ${execCount} executions)`);
      
      activeCrons.delete(name);
      executionHistory.delete(name);
      timerCreationLog.delete(name);
    } catch (error) {
      logger.error('SCHEDULER', `Error stopping job "${name}":`, error.message);
      // Still remove from map even if stop() fails
      activeCrons.delete(name);
      executionHistory.delete(name);
      timerCreationLog.delete(name);
    }
  }
}

/**
 * Destroy all cron jobs
 */
function destroyAllCronJobs() {
  for (const name of activeCrons.keys()) {
    destroyCronJob(name);
  }
}

/**
 * List all active cron job names
 * @returns {string[]} Array of job names
 */
function listCronJobs() {
  return [...activeCrons.keys()];
}

/**
 * Get detailed information about active cron jobs (for debugging timer leaks)
 * @returns {Object} Information about active jobs
 */
function getCronJobStats() {
  const jobs = Array.from(activeCrons.entries()).map(([name, job]) => {
    const jobInfo = {
      name,
      running: job.running || false,
      paused: job.paused || false
    };
    
    // Try to get more internal details
    try {
      if (job.nextRun) jobInfo.nextRun = new Date(job.nextRun).toISOString();
      if (job.previousRun) jobInfo.previousRun = new Date(job.previousRun).toISOString();
      if (job.currentRun) jobInfo.currentRun = job.currentRun;
      if (job.isRunning !== undefined) jobInfo.isRunning = job.isRunning;
    } catch (e) {
      // Ignore if properties aren't accessible
    }
    
    return jobInfo;
  });
  
  return {
    totalJobs: activeCrons.size,
    jobNames: [...activeCrons.keys()],
    jobs
  };
}

/**
 * Log detailed cron job statistics for debugging timer leaks
 */
function logCronJobStats() {
  const stats = getCronJobStats();
  const currentTimerCount = getCurrentTimerCount();
  const timersPerJob = stats.totalJobs > 0 ? Math.round(currentTimerCount / stats.totalJobs) : 0;
  
  logger.warn('SCHEDULER', `📊 Stats: ${stats.totalJobs} jobs active, ${totalExecutions} total executions, ${currentTimerCount} croner timers (${timersPerJob} timers/job)`);
  
  // Log execution history for jobs with many executions
  const jobsWithManyExecs = Array.from(executionHistory.entries())
    .filter(([name, hist]) => hist.count > 5)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  
  if (jobsWithManyExecs.length > 0) {
    logger.warn('SCHEDULER', `🔥 Most executed jobs:`);
    jobsWithManyExecs.forEach(([name, hist]) => {
      const avgInterval = hist.execTimes.length > 1
        ? (hist.execTimes[hist.execTimes.length - 1] - hist.execTimes[0]) / (hist.execTimes.length - 1)
        : null;
      logger.warn('SCHEDULER', `   - ${name}: ${hist.count} execs, avg interval: ${avgInterval ? Math.round(avgInterval/1000) + 's' : 'N/A'}`);
    });
  }
  
  // Log jobs that might be problematic
  const runningJobs = stats.jobs.filter(j => j.running);
  if (runningJobs.length > 0) {
    logger.warn('SCHEDULER', `⚠️ ${runningJobs.length} jobs currently running:`, runningJobs.map(j => j.name).join(', '));
  }
  
  // Log next run times for first few jobs
  const jobsWithNextRun = stats.jobs.filter(j => j.nextRun).slice(0, 5);
  if (jobsWithNextRun.length > 0) {
    logger.warn('SCHEDULER', `⏰ Next runs:`, jobsWithNextRun.map(j => `${j.name}:${j.nextRun}`).join(', '));
  }
  
  // Check for jobs executing too frequently (potential duplicates)
  const suspiciousJobs = Array.from(executionHistory.entries())
    .filter(([name, hist]) => {
      if (hist.execTimes.length < 2) return false;
      const intervals = [];
      for (let i = 1; i < hist.execTimes.length; i++) {
        intervals.push(hist.execTimes[i] - hist.execTimes[i - 1]);
      }
      const minInterval = Math.min(...intervals);
      // If any interval is less than 1 second, it's suspicious
      return minInterval < 1000;
    });
  
  if (suspiciousJobs.length > 0) {
    logger.error('SCHEDULER', `⚠️ SUSPICIOUS: ${suspiciousJobs.length} jobs executing too frequently (possible duplicates):`);
    suspiciousJobs.forEach(([name, hist]) => {
      const intervals = [];
      for (let i = 1; i < hist.execTimes.length; i++) {
        intervals.push(hist.execTimes[i] - hist.execTimes[i - 1]);
      }
      const minInterval = Math.min(...intervals);
      logger.error('SCHEDULER', `   - ${name}: min interval ${minInterval}ms (${hist.count} total execs)`);
    });
  }

  // Warn if timer-to-job ratio is high
  if (timersPerJob > 5) {
    logger.error('SCHEDULER', `⚠️ TIMER LEAK DETECTED: ${timersPerJob} timers per job (expected 1-2). This indicates a serious timer leak!`);
  }
}

/**
 * Cleanup orphaned timers - restart jobs with excessive timers
 * This is a workaround for croner's timer leak issue where it creates multiple timers per job
 */
async function cleanupOrphanedTimers() {
  const currentTimerCount = getCurrentTimerCount();
  const stats = getCronJobStats();
  const timersPerJob = stats.totalJobs > 0 ? Math.round(currentTimerCount / stats.totalJobs) : 0;
  
  const threshold = parseInt(process.env.TIMER_LEAK_RATIO_THRESHOLD) || 5;
  
  if (timersPerJob <= threshold) {
    return { cleaned: 0, reason: `Timer ratio ${timersPerJob} is below threshold ${threshold}` };
  }

  logger.warn('SCHEDULER', `🧹 Starting cleanup of orphaned timers (ratio: ${timersPerJob} timers/job, ${currentTimerCount} total timers, ${stats.totalJobs} jobs)`);
  
  // DIAGNOSIS: The issue is that croner creates multiple timers per job internally
  // and they accumulate over time. The best fix is to restart all jobs periodically
  // when timer count gets too high, which forces croner to clean up its internal state.
  
  // Strategy: If timer ratio > threshold, restart ALL jobs to force cleanup
  // This is more aggressive but necessary because croner doesn't clean up timers properly
  const allJobNames = [...activeCrons.keys()];
  const jobsToRestart = [];
  
  // If ratio is very high (>10), restart all jobs immediately
  if (timersPerJob > 10) {
    logger.error('SCHEDULER', `🚨 CRITICAL: Timer ratio ${timersPerJob} is extremely high! Restarting ALL jobs to force cleanup.`);
    for (const name of allJobNames) {
      jobsToRestart.push({ name, reason: 'high timer ratio' });
    }
  } else {
    // Otherwise, try to identify problematic jobs first
    for (const [name, log] of timerCreationLog.entries()) {
      if (log.length === 0) continue;
      const recentLogs = log.slice(-3); // Last 3 creations
      const avgTimers = recentLogs.reduce((sum, entry) => sum + entry.timerCount, 0) / recentLogs.length;
      if (avgTimers > 3) {
        jobsToRestart.push({ name, reason: `high avg timers: ${avgTimers.toFixed(1)}` });
      }
    }
    
    // If no specific jobs identified but ratio is still high, restart all
    if (jobsToRestart.length === 0 && timersPerJob > threshold) {
      logger.warn('SCHEDULER', `⚠️ Timer ratio ${timersPerJob} exceeds threshold but no specific jobs identified. Restarting all jobs.`);
      for (const name of allJobNames) {
        jobsToRestart.push({ name, reason: 'general cleanup' });
      }
    }
  }

  let cleaned = 0;
  for (const { name, reason } of jobsToRestart) {
    try {
      const job = activeCrons.get(name);
      if (!job) continue;

      logger.warn('SCHEDULER', `🔄 Stopping job "${name}" to clear orphaned timers (reason: ${reason})`);
      
      // CRITICAL: Stop job BEFORE removing from tracking
      // Per croner best practices: Always call .stop() to clean up internal timers
      job.stop();
      
      // Remove from tracking
      activeCrons.delete(name);
      executionHistory.delete(name);
      timerCreationLog.delete(name);
      
      cleaned++;
    } catch (error) {
      logger.error('SCHEDULER', `Error stopping job "${name}":`, error.message);
      // Still remove from tracking even if stop() fails
      activeCrons.delete(name);
      executionHistory.delete(name);
      timerCreationLog.delete(name);
    }
  }

  // Wait for croner to clean up internal timers after stop()
  // Croner's timer cleanup happens asynchronously, so we need to wait
  if (cleaned > 0) {
    logger.warn('SCHEDULER', `⏳ Waiting for croner to clean up ${cleaned} stopped jobs...`);
    
    // Force cleanup attempt
    const forceResult = forceCleanupCronerTimers();
    if (forceResult.cleaned > 0) {
      logger.warn('SCHEDULER', `🧹 Force cleaned ${forceResult.cleaned} internal timers during cleanup`);
    }
    
    // Wait for async cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check timer count after cleanup
    const timerCountAfter = getCurrentTimerCount();
    const timersRemaining = timerCountAfter;
    if (timersRemaining > 50) {
      logger.error('SCHEDULER', `⚠️ WARNING: ${timersRemaining} timers still active after cleanup! This indicates croner is not cleaning up properly.`);
      logger.error('SCHEDULER', `💡 Consider: Restarting the process or switching to a different scheduler library.`);
    }
    
    logger.warn('SCHEDULER', `✅ Stopped ${cleaned} jobs. ${timersRemaining} timers remaining (should decrease over time). Jobs will need to be recreated by scheduler.`);
  }

  return { cleaned, timersPerJob, totalTimers: currentTimerCount, totalJobs: stats.totalJobs };
}

/**
 * Check job health and restart unhealthy jobs
 */
async function checkJobHealth() {
  const stats = getCronJobStats();
  const currentTimerCount = getCurrentTimerCount();
  const timersPerJob = stats.totalJobs > 0 ? Math.round(currentTimerCount / stats.totalJobs) : 0;
  
  const unhealthyJobs = [];
  
  // Check for jobs with high timer ratios
  for (const [name, log] of timerCreationLog.entries()) {
    if (log.length === 0) continue;
    const recentLogs = log.slice(-3);
    const avgTimers = recentLogs.reduce((sum, entry) => sum + entry.timerCount, 0) / recentLogs.length;
    if (avgTimers > 3) {
      unhealthyJobs.push({ name, reason: `High timer count: ${avgTimers.toFixed(1)}`, avgTimers });
    }
  }

  // Check for jobs that haven't executed when expected
  const now = Date.now();
  for (const [name, history] of executionHistory.entries()) {
    if (!history.lastExec) continue;
    const timeSinceLastExec = now - history.lastExec;
    // If job should run every 5 minutes but hasn't run in 10 minutes, it's unhealthy
    if (timeSinceLastExec > 10 * 60 * 1000 && history.count > 0) {
      const expectedInterval = history.execTimes.length > 1
        ? (history.execTimes[history.execTimes.length - 1] - history.execTimes[0]) / (history.execTimes.length - 1)
        : null;
      if (expectedInterval && timeSinceLastExec > expectedInterval * 2) {
        unhealthyJobs.push({ name, reason: `Missed execution (last: ${Math.round(timeSinceLastExec/1000)}s ago)`, avgTimers: 0 });
      }
    }
  }

  if (unhealthyJobs.length > 0) {
    logger.warn('SCHEDULER', `⚠️ Found ${unhealthyJobs.length} unhealthy jobs:`, unhealthyJobs.map(j => `${j.name} (${j.reason})`).join(', '));
  }

  return { unhealthyJobs, timersPerJob };
}

/**
 * Restart all jobs to clear internal state
 */
async function restartAllJobs() {
  logger.warn('SCHEDULER', `🔄 Restarting all ${activeCrons.size} jobs to clear internal state`);
  
  // This is a destructive operation - jobs will need to be recreated by the scheduler
  const jobNames = [...activeCrons.keys()];
  
  for (const name of jobNames) {
    try {
      const job = activeCrons.get(name);
      if (job) {
        job.stop();
      }
      activeCrons.delete(name);
    } catch (error) {
      logger.error('SCHEDULER', `Error stopping job "${name}" during restart:`, error.message);
    }
  }

  // Clear all tracking
  executionHistory.clear();
  timerCreationLog.clear();
  
  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  logger.warn('SCHEDULER', `✅ All jobs stopped. Scheduler will need to recreate them.`);
  
  return { stopped: jobNames.length };
}

/**
 * Attempt to force cleanup croner internal timers
 */
function forceCleanupCronerTimers() {
  let cleaned = 0;
  
  for (const [name, job] of activeCrons.entries()) {
    try {
      // Try to access internal timer references
      const internalTimers = job._timers || job.timers || job._scheduled || null;
      
      if (internalTimers) {
        if (Array.isArray(internalTimers)) {
          internalTimers.forEach(timer => {
            if (timer && typeof timer.clear === 'function') {
              timer.clear();
              cleaned++;
            } else if (timer && typeof timer.destroy === 'function') {
              timer.destroy();
              cleaned++;
            }
          });
        } else if (typeof internalTimers.clear === 'function') {
          internalTimers.clear();
          cleaned++;
        }
        
        logger.debug('SCHEDULER', `Cleaned ${cleaned} internal timers for job "${name}"`);
      }
    } catch (error) {
      // Ignore - internal structure may not be accessible
      logger.debug('SCHEDULER', `Could not access internal timers for job "${name}":`, error.message);
    }
  }

  if (cleaned > 0) {
    logger.warn('SCHEDULER', `🧹 Force cleaned ${cleaned} internal croner timers`);
  }
  
  return { cleaned };
}

/**
 * Shutdown all cron jobs (alias for destroyAllCronJobs)
 * Also clears the process-level initialization guard
 */
function shutdownCroner() {
  destroyAllCronJobs();
  
  // Clear process-level guard to allow re-initialization after shutdown
  if (global[SCHEDULER_INIT_KEY]) {
    delete global[SCHEDULER_INIT_KEY];
    logger.info('SCHEDULER', '✅ Process-level initialization guard cleared');
  }
  
  // Clear module-level guard
  isInitialized = false;
  initializationStack = null;
}

module.exports = {
  createCronJob,
  destroyCronJob,
  destroyAllCronJobs,
  listCronJobs,
  getCronJobStats,
  logCronJobStats,
  shutdownCroner,
  checkInitialization,
  cleanupOrphanedTimers,
  checkJobHealth,
  restartAllJobs,
  forceCleanupCronerTimers,
  getCurrentTimerCount,
};
