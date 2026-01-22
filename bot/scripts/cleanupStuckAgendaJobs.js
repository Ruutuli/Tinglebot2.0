// Script to clean up stuck/locked Agenda jobs
// Run this if agenda.start() is timing out

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

const DatabaseConnectionManager = require('../database/connectionManager');
const logger = require('../utils/logger');

async function cleanupStuckJobs() {
  try {
    logger.info('SCRIPT', 'Connecting to database...');
    
    // Initialize database connection
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connected');
    
    // Query MongoDB directly
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.error('SCRIPT', 'MongoDB connection not ready');
      process.exit(1);
    }
    
    const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
    
    // Find stuck jobs (jobs that are locked but haven't been updated recently)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stuckJobs = await agendaJobsCollection.find({
      lockedAt: { $exists: true, $ne: null },
      lastModifiedBy: { $lt: oneHourAgo }
    }).toArray();
    
    logger.info('SCRIPT', `\nFound ${stuckJobs.length} potentially stuck jobs\n`);
    
    if (stuckJobs.length === 0) {
      logger.info('SCRIPT', '✅ No stuck jobs found!');
      logger.info('SCRIPT', 'The issue might be something else (database connection, etc.)');
      process.exit(0);
    }
    
    // Show stuck jobs
    logger.info('SCRIPT', 'Stuck jobs:');
    stuckJobs.forEach((job, index) => {
      const jobName = job.name || (job.attrs && job.attrs.name) || 'unknown';
      const lockedAt = job.lockedAt ? new Date(job.lockedAt).toLocaleString() : 'unknown';
      logger.info('SCRIPT', `   ${index + 1}. ${jobName} (locked at: ${lockedAt})`);
    });
    
    // Ask user if they want to unlock them
    logger.warn('SCRIPT', '\n⚠️  These jobs appear to be stuck (locked for >1 hour)');
    logger.info('SCRIPT', 'To unlock them, the jobs need to be updated to clear the lock');
    
    // Unlock stuck jobs by removing the lock
    let unlockedCount = 0;
    for (const job of stuckJobs) {
      try {
        await agendaJobsCollection.updateOne(
          { _id: job._id },
          { 
            $unset: { 
              lockedAt: "",
              lastModifiedBy: ""
            }
          }
        );
        unlockedCount++;
        logger.info('SCRIPT', `   ✅ Unlocked: ${job.name || job.attrs?.name || 'unknown'}`);
      } catch (error) {
        logger.error('SCRIPT', `   ❌ Failed to unlock job ${job._id}: ${error.message}`);
      }
    }
    
    logger.success('SCRIPT', `\n✅ Unlocked ${unlockedCount} stuck jobs`);
    logger.info('SCRIPT', 'You can now restart the bot and Agenda should start properly');
    
    process.exit(0);
  } catch (error) {
    logger.error('SCRIPT', 'Error cleaning up stuck jobs:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupStuckJobs();
