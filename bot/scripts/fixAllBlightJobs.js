// Script to fix all blight-related jobs' nextRunAt times
// Fixes both Blight Roll Call and Blight Roll Call Check

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

async function fixAllBlightJobs() {
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
    
    // Jobs to fix
    const jobsToFix = [
      { name: 'Blight Roll Call', cron: '0 1 * * *', expectedHour: 1, expectedMinute: 0 },
      { name: 'Blight Roll Call Check', cron: '30 1 * * *', expectedHour: 1, expectedMinute: 30 }
    ];
    
    const now = new Date();
    
    for (const jobConfig of jobsToFix) {
      logger.info('SCRIPT', `\n📋 Fixing ${jobConfig.name}...`);
      
      const job = await agendaJobsCollection.findOne({
        $or: [
          { name: jobConfig.name },
          { 'attrs.name': jobConfig.name }
        ]
      });
      
      if (!job) {
        logger.warn('SCRIPT', `   ❌ Job not found: ${jobConfig.name}`);
        continue;
      }
      
      logger.info('SCRIPT', `   Job ID: ${job._id}`);
      logger.info('SCRIPT', `   Repeat Interval: ${job.repeatInterval || job.attrs?.repeatInterval || 'none'}`);
      
      const currentNextRun = job.nextRunAt || job.attrs?.nextRunAt;
      if (currentNextRun) {
        logger.info('SCRIPT', `   Current nextRunAt: ${new Date(currentNextRun).toISOString()}`);
      }
      
      // Calculate correct next run time: expectedHour:expectedMinute UTC today or tomorrow
      const todayAtTime = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        jobConfig.expectedHour,
        jobConfig.expectedMinute,
        0,
        0
      ));
      
      // If it's already past the time today, set to tomorrow
      const nextRunAt = now >= todayAtTime 
        ? new Date(todayAtTime.getTime() + 24 * 60 * 60 * 1000)
        : todayAtTime;
      
      logger.info('SCRIPT', `   Correct nextRunAt: ${nextRunAt.toISOString()} (${nextRunAt.toLocaleString()})`);
      
      // Update the job
      const updateResult = await agendaJobsCollection.updateOne(
        { _id: job._id },
        { 
          $set: { 
            nextRunAt: nextRunAt,
            'attrs.nextRunAt': nextRunAt
          },
          $unset: {
            lockedAt: "",
            lastModifiedBy: ""
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        logger.success('SCRIPT', `   ✅ Successfully updated ${jobConfig.name}!`);
      } else {
        logger.info('SCRIPT', `   ℹ️  No changes needed for ${jobConfig.name}`);
      }
    }
    
    logger.info('SCRIPT', '\n✅ All blight jobs fixed!');
    logger.info('SCRIPT', 'Make sure Agenda is running in your bot to process these jobs.');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error fixing blight jobs:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the fix
fixAllBlightJobs();
