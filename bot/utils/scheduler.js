// ============================================================================
// ------------------- Universal Scheduler -------------------
// Purpose: Centralized job scheduling using Agenda (MongoDB-based)
// - Manages all scheduled tasks via Agenda
// - Provides registration API for new tasks
// - Handles task execution with error handling
// - Supports graceful shutdown
// Used by: index.js, tasks/*.js
// Dependencies: agenda, config/database.js, utils/logger
// ============================================================================

const Agenda = require('agenda');
const dbConfig = require('../config/database');
const logger = require('@/utils/logger');

// ============================================================================
// ------------------- State -------------------
// ============================================================================

let agenda = null;
let client = null;
let initialized = false;

/** @type {Map<string, { cronExpression: string, taskFunction: Function, options?: object }>} */
const taskRegistry = new Map();

// ============================================================================
// ------------------- Scheduler API -------------------
// ============================================================================

/**
 * Register a scheduled task. Must be called before initializeScheduler().
 * @param {string} name - Unique job name (Agenda job name)
 * @param {string} cronExpression - Cron expression (e.g. '0 13 * * *' for daily 13:00 UTC)
 * @param {Function} taskFunction - Async function(client, data) invoked when job runs
 * @param {object} [options] - Optional. { data?: object } passed to taskFunction as second arg
 */
function registerTask(name, cronExpression, taskFunction, options = {}) {
  if (initialized) {
    logger.warn('SCHEDULER', `Cannot register task "${name}": scheduler already initialized`);
    return;
  }
  if (taskRegistry.has(name)) {
    logger.warn('SCHEDULER', `Overwriting existing task "${name}"`);
  }
  taskRegistry.set(name, {
    cronExpression,
    taskFunction,
    options: options.data ? { data: options.data } : {}
  });
  logger.info('SCHEDULER', cronExpression != null
    ? `Registered task "${name}" (${cronExpression})`
    : `Registered one-time task "${name}"`);
}

/**
 * Initialize Agenda and start processing jobs. Call after Discord client is ready.
 * @param {import('discord.js').Client} discordClient - Discord.js client
 * @param {string} [mongoConnectionString] - MongoDB URI. Defaults to config tinglebot.
 * @returns {Promise<void>}
 */
async function initializeScheduler(discordClient, mongoConnectionString) {
  if (initialized) {
    logger.warn('SCHEDULER', 'Scheduler already initialized');
    return;
  }

  const uri = mongoConnectionString || dbConfig.tinglebot;
  if (!uri) {
    logger.error('SCHEDULER', 'No MongoDB URI provided and config has no tinglebot URI');
    return;
  }

  client = discordClient;

  try {
    agenda = new Agenda({
      db: { address: uri, collection: 'agendaJobs' },
      processEvery: '5 seconds' // Poll every 5s so one-time jobs (e.g. raid 1-minute skip) run within ~5s of due time
    });

    agenda.on('ready', () => logger.success('SCHEDULER', 'Agenda connected to MongoDB'));
    agenda.on('error', (err) => logger.error('SCHEDULER', `Agenda error: ${err.message}`));

    for (const [name, config] of taskRegistry) {
      const { taskFunction, options } = config;
      agenda.define(
        name,
        { concurrency: 1, lockLifetime: 10 * 60 * 1000 },
        async (job) => {
          try {
            logger.info('SCHEDULER', `Running task "${name}"`);
            await taskFunction(client, job.attrs.data || {});
            logger.success('SCHEDULER', `Task "${name}" completed`);
          } catch (err) {
            logger.error('SCHEDULER', `Task "${name}" failed: ${err.message}`);
            throw err;
          }
        }
      );
    }

    await agenda.start();

    for (const [name, config] of taskRegistry) {
      const { cronExpression, options } = config;
      // Only schedule recurring jobs (skip one-time jobs with null cron)
      if (cronExpression) {
        // Ensure cron expressions are interpreted in UTC (EST/EDT is user-facing only).
        await agenda.every(cronExpression, name, options.data || {}, { skipImmediate: true, timezone: 'UTC' });
        logger.info('SCHEDULER', `Scheduled "${name}" every ${cronExpression}`);
      } else {
        logger.info('SCHEDULER', `Registered one-time job "${name}" (will be scheduled manually)`);
      }
    }

    initialized = true;
    logger.success('SCHEDULER', `Scheduler initialized with ${taskRegistry.size} task(s)`);
  } catch (err) {
    logger.error('SCHEDULER', `Failed to initialize scheduler: ${err.message}`);
    throw err;
  }
}

/**
 * Cancel all jobs with the given name (removes from DB).
 * @param {string} name - Job name
 * @returns {Promise<number>} Number of cancelled jobs
 */
async function stopTask(name) {
  if (!agenda) return 0;
  try {
    const n = await agenda.cancel({ name });
    logger.info('SCHEDULER', `Cancelled ${n} job(s) for "${name}"`);
    return n;
  } catch (err) {
    logger.error('SCHEDULER', `Failed to stop task "${name}": ${err.message}`);
    throw err;
  }
}

/**
 * Stop Agenda gracefully (unlocks running jobs). Call during shutdown.
 * @returns {Promise<void>}
 */
async function stopAllTasks() {
  if (!agenda) return;
  try {
    await agenda.stop();
    logger.info('SCHEDULER', 'Agenda stopped');
  } catch (err) {
    logger.warn('SCHEDULER', `Error stopping Agenda: ${err.message}`);
  } finally {
    agenda = null;
    initialized = false;
  }
}

/**
 * Get status of registered tasks (names and cron expressions).
 * @returns {Array<{ name: string, cronExpression: string }>}
 */
function getTaskStatus() {
  return Array.from(taskRegistry.entries()).map(([name, config]) => ({
    name,
    cronExpression: config.cronExpression
  }));
}

/**
 * Run a job immediately (for testing). Scheduler must be initialized.
 * @param {string} name - Job name
 * @param {object} [data] - Optional data for job.attrs.data
 * @returns {Promise<import('agenda').Job>}
 */
async function runNow(name, data = {}) {
  if (!agenda) throw new Error('Scheduler not initialized');
  return agenda.now(name, data);
}

/**
 * Schedule a one-time job to run at a specific time.
 * @param {string} name - Job name (must be registered)
 * @param {Date|string} when - When to run the job (Date object or ISO string)
 * @param {object} [data] - Optional data for job.attrs.data
 * @returns {Promise<import('agenda').Job>}
 */
async function scheduleOneTimeJob(name, when, data = {}) {
  if (!agenda) throw new Error('Scheduler not initialized');
  if (!taskRegistry.has(name)) {
    throw new Error(`Job "${name}" is not registered`);
  }
  const whenDate = typeof when === 'string' ? new Date(when) : when;
  const now = Date.now();
  const runAt = whenDate.getTime();
  if (runAt <= now) {
    logger.warn('SCHEDULER', `One-time job "${name}" was scheduled in the past (${whenDate.toISOString()}), clamping to 1s from now`);
    whenDate.setTime(now + 1000);
  }
  const job = await agenda.schedule(whenDate, name, data || {});
  logger.info('SCHEDULER', `Scheduled one-time job "${name}" for ${whenDate.toISOString()}`);
  return job;
}

/**
 * Cancel a specific job by name and data query.
 * Uses Agenda's native cancel (MongoDB deleteMany) so jobs are reliably removed when a player rolls.
 * @param {string} name - Job name
 * @param {object} dataQuery - Query to match job.attrs.data (e.g., { raidId: 'R123' })
 * @returns {Promise<number>} Number of cancelled jobs
 */
async function cancelJob(name, dataQuery = {}) {
  if (!agenda) return 0;
  if (Object.keys(dataQuery).length === 0) {
    logger.warn('SCHEDULER', 'cancelJob: empty dataQuery would match all jobs; refusing');
    return 0;
  }
  try {
    // Build MongoDB filter: Agenda stores job data in top-level "data" field in the collection
    const mongoQuery = { name };
    for (const [key, value] of Object.entries(dataQuery)) {
      const actualKey = key.startsWith('data.') ? key : `data.${key}`;
      mongoQuery[actualKey] = value;
    }
    const deletedCount = await agenda.cancel(mongoQuery);
    const cancelledCount = typeof deletedCount === 'number' ? deletedCount : 0;
    if (cancelledCount > 0) {
      logger.info('SCHEDULER', `Cancelled ${cancelledCount} job(s) for "${name}" matching query`, dataQuery);
    }
    return cancelledCount;
  } catch (err) {
    logger.error('SCHEDULER', `Failed to cancel job "${name}": ${err.message}`);
    throw err;
  }
}

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  registerTask,
  initializeScheduler,
  stopTask,
  stopAllTasks,
  getTaskStatus,
  runNow,
  scheduleOneTimeJob,
  cancelJob
};
