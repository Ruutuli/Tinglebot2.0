// ============================================================================
// ------------------- Universal Scheduler -------------------
// Purpose: Centralized job scheduling using Agenda (MongoDB-based)
// - Manages all scheduled tasks via Agenda
// - Provides registration API for new tasks
// - Handles task execution with error handling
// - Supports graceful shutdown
// Used by: server.js, tasks/*.js
// Dependencies: agenda, config/database.js, utils/logger
// ============================================================================

const Agenda = require('agenda');
const dbConfig = require('../config/database');
const logger = require('./logger');

// ============================================================================
// ------------------- State -------------------
// ============================================================================

let agenda = null;
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
 * @param {Function} taskFunction - Async function(data) invoked when job runs
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
  logger.info('SCHEDULER', `Registered task "${name}" (${cronExpression})`);
}

/**
 * Initialize Agenda and start processing jobs.
 * @param {string} [mongoConnectionString] - MongoDB URI. Defaults to config tinglebot.
 * @returns {Promise<void>}
 */
async function initializeScheduler(mongoConnectionString) {
  if (initialized) {
    logger.warn('SCHEDULER', 'Scheduler already initialized');
    return;
  }

  const uri = mongoConnectionString || dbConfig.tinglebot;
  if (!uri) {
    logger.error('SCHEDULER', 'No MongoDB URI provided and config has no tinglebot URI');
    return;
  }

  try {
    agenda = new Agenda({
      db: { address: uri, collection: 'agendaJobs' },
      processEvery: '30 seconds'
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
            await taskFunction(job.attrs.data || {});
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
      await agenda.every(cronExpression, name, options.data || {}, { skipImmediate: true });
      logger.info('SCHEDULER', `Scheduled "${name}" every ${cronExpression}`);
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

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  registerTask,
  initializeScheduler,
  stopTask,
  stopAllTasks,
  getTaskStatus,
  runNow
};
