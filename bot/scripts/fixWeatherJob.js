// Script to fix the Daily Weather Forecast Reminder job's nextRunAt time
// The job should run at 1:00 AM UTC (8:00 PM EST), but nextRunAt may be incorrect

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

async function fixWeatherJob() {
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
    
    // Find the Daily Weather Forecast Reminder job
    const weatherJob = await agendaJobsCollection.findOne({
      $or: [
        { name: 'Daily Weather Forecast Reminder' },
        { 'attrs.name': 'Daily Weather Forecast Reminder' }
      ]
    });
    
    if (!weatherJob) {
      logger.error('SCRIPT', '❌ Daily Weather Forecast Reminder job not found in database!');
      logger.info('SCRIPT', 'The job may need to be created. Run the bot normally to create it.');
      process.exit(1);
    }
    
    logger.info('SCRIPT', `\n📋 Found Daily Weather Forecast Reminder job:`);
    logger.info('SCRIPT', `   Job ID: ${weatherJob._id}`);
    logger.info('SCRIPT', `   Name: ${weatherJob.name || weatherJob.attrs?.name || 'unknown'}`);
    logger.info('SCRIPT', `   Repeat Interval: ${weatherJob.repeatInterval || weatherJob.attrs?.repeatInterval || 'unknown'}`);
    
    const currentNextRun = weatherJob.nextRunAt || weatherJob.attrs?.nextRunAt;
    if (currentNextRun) {
      logger.info('SCRIPT', `   Current nextRunAt: ${new Date(currentNextRun).toISOString()} (${new Date(currentNextRun).toLocaleString()})`);
    } else {
      logger.warn('SCRIPT', `   Current nextRunAt: not set`);
    }
    
    // Calculate the correct next run time: 1:00 AM UTC today or tomorrow
    const now = new Date();
    const today1AM = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      1, 0, 0, 0
    ));
    
    // If it's already past 1 AM today, set to tomorrow at 1 AM
    const nextRunAt = now >= today1AM 
      ? new Date(today1AM.getTime() + 24 * 60 * 60 * 1000)
      : today1AM;
    
    logger.info('SCRIPT', `   Correct nextRunAt: ${nextRunAt.toISOString()} (${nextRunAt.toLocaleString()})`);
    
    // Update the job's nextRunAt
    const updateResult = await agendaJobsCollection.updateOne(
      { _id: weatherJob._id },
      { 
        $set: { 
          nextRunAt: nextRunAt,
          // Also update in attrs if it exists there
          ...(weatherJob.attrs ? { 'attrs.nextRunAt': nextRunAt } : {})
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      logger.success('SCRIPT', `\n✅ Successfully updated Daily Weather Forecast Reminder job's nextRunAt!`);
      logger.info('SCRIPT', `   New nextRunAt: ${nextRunAt.toISOString()} (${nextRunAt.toLocaleString()})`);
      logger.info('SCRIPT', `   This is ${Math.round((nextRunAt.getTime() - now.getTime()) / (1000 * 60 * 60))} hours from now`);
    } else {
      logger.warn('SCRIPT', `\n⚠️  Job was not modified. It may already have the correct nextRunAt.`);
    }
    
    // Verify the update
    const updatedJob = await agendaJobsCollection.findOne({ _id: weatherJob._id });
    const updatedNextRun = updatedJob.nextRunAt || updatedJob.attrs?.nextRunAt;
    if (updatedNextRun) {
      logger.info('SCRIPT', `\n📊 Verification - Updated nextRunAt: ${new Date(updatedNextRun).toISOString()}`);
    }
    
    logger.info('SCRIPT', '\n✅ Script completed successfully!');
    logger.info('SCRIPT', 'Make sure Agenda is running in your bot to process this job.');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error fixing Weather job:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the fix
fixWeatherJob();
