// scheduler/croner.js
const { Cron } = require("croner");

const activeCrons = new Map(); // name -> Cron instance

/**
 * Create a cron job with the given name, pattern, and function
 * @param {string} name - Unique name for the job (used for deduplication)
 * @param {string} pattern - Cron pattern (e.g., "0 0 * * *")
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options object with timezone, maxRuns, etc.
 * @returns {Cron} The created Cron instance
 */
function createCronJob(name, pattern, fn, options = {}) {
  // Destroy any existing job with same name (prevents duplicates on reload)
  destroyCronJob(name);

  // Build cron options - only set timezone if explicitly provided
  const cronOptions = {
    maxRuns: options.maxRuns,
    protect: true, // prevent overlapping runs by default
    catch: true, // Automatically catch errors
  };
  
  // Only set timezone if explicitly provided (to avoid memory leaks)
  if (options.timezone && typeof options.timezone === 'string') {
    cronOptions.timezone = options.timezone;
  }

  const job = new Cron(
    pattern,
    cronOptions,
    async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[Croner:${name}] Error`, err);
      }
    }
  );

  activeCrons.set(name, job);
  
  // Only log in verbose mode or for important jobs
  if (process.env.VERBOSE_LOGGING === 'true' || name.includes('critical') || name.includes('health')) {
    console.log(`[Croner] Scheduled "${name}" -> ${pattern} tz=${cronOptions.timezone || "UTC"}`);
  }

  return job;
}

/**
 * Destroy a cron job by name
 * @param {string} name - Name of the job to destroy
 */
function destroyCronJob(name) {
  const job = activeCrons.get(name);
  if (job) {
    job.stop();
    activeCrons.delete(name);
    console.log(`[Croner] Stopped "${name}"`);
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
 * Shutdown all cron jobs (alias for destroyAllCronJobs)
 */
function shutdownCroner() {
  destroyAllCronJobs();
}

module.exports = {
  createCronJob,
  destroyCronJob,
  destroyAllCronJobs,
  listCronJobs,
  shutdownCroner,
};
