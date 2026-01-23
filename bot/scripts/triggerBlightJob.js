// Script to manually trigger the Blight Roll Call job or set it to run soon
// Use this if the job missed its scheduled time

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

async function triggerBlightJob() {
  try {
    logger.info('SCRIPT', 'Connecting to database...');
    
    // Initialize database connection
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connected');
    
    // Query MongoDB directly to find the job
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.error('SCRIPT', 'MongoDB connection not ready');
      process.exit(1);
    }
    
    const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
    
    // Find the Blight Roll Call job
    const blightJob = await agendaJobsCollection.findOne({
      $or: [
        { name: 'Blight Roll Call' },
        { 'attrs.name': 'Blight Roll Call' }
      ]
    });
    
    if (!blightJob) {
      logger.error('SCRIPT', '❌ Blight Roll Call job not found in database!');
      process.exit(1);
    }
    
    logger.info('SCRIPT', `\n📋 Found Blight Roll Call job (ID: ${blightJob._id})`);
    
    // Option 1: Set nextRunAt to a few minutes from now to trigger it soon
    const now = new Date();
    const runInMinutes = 2; // Run in 2 minutes
    const nextRunAt = new Date(now.getTime() + runInMinutes * 60 * 1000);
    
    logger.info('SCRIPT', `\n⏰ Setting job to run in ${runInMinutes} minutes...`);
    logger.info('SCRIPT', `   Current time: ${now.toISOString()} (${now.toLocaleString()})`);
    logger.info('SCRIPT', `   Will run at: ${nextRunAt.toISOString()} (${nextRunAt.toLocaleString()})`);
    
    // Update the job's nextRunAt
    const updateResult = await agendaJobsCollection.updateOne(
      { _id: blightJob._id },
      { 
        $set: { 
          nextRunAt: nextRunAt,
          // Also update in attrs if it exists there
          ...(blightJob.attrs ? { 'attrs.nextRunAt': nextRunAt } : {})
        },
        // Unlock the job if it's locked
        $unset: {
          lockedAt: "",
          lastModifiedBy: ""
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      logger.success('SCRIPT', `\n✅ Successfully scheduled Blight Roll Call job!`);
      logger.info('SCRIPT', `   The job will run in ${runInMinutes} minutes`);
      logger.info('SCRIPT', `   Make sure your bot is running with Agenda started to execute the job`);
    } else {
      logger.warn('SCRIPT', `\n⚠️  Job was not modified. It may already be scheduled correctly.`);
    }
    
    // Wait a moment for Agenda to pick up the change
    logger.info('SCRIPT', '\n⏳ Waiting 3 seconds for Agenda to pick up the change...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify the update
    const updatedJob = await agendaJobsCollection.findOne({ _id: blightJob._id });
    const updatedNextRun = updatedJob.nextRunAt || updatedJob.attrs?.nextRunAt;
    if (updatedNextRun) {
      const timeUntil = new Date(updatedNextRun).getTime() - Date.now();
      const minutesUntil = Math.floor(timeUntil / (1000 * 60));
      logger.info('SCRIPT', `\n📊 Verification - Job will run in ${minutesUntil} minutes`);
    }
    
    logger.info('SCRIPT', '\n✅ Script completed!');
    logger.info('SCRIPT', 'The job will execute automatically when Agenda processes it.');
    logger.info('SCRIPT', 'Make sure your bot is running and Agenda is started.');
    logger.info('SCRIPT', 'If your bot is running, it should pick up this job within a few minutes.');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error triggering Blight job:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the trigger
triggerBlightJob();
