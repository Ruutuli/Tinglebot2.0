// Script to directly fix the Daily Weather Forecast Reminder job's nextRunAt time
// Forces update even if it seems correct

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

async function fixWeatherJobDirect() {
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
    
    // Find the Daily Weather Forecast Reminder job by ID
    const weatherJob = await agendaJobsCollection.findOne({
      _id: require('mongodb').ObjectId.createFromHexString('69725b5be0964a9296cad926')
    });
    
    if (!weatherJob) {
      logger.error('SCRIPT', '❌ Daily Weather Forecast Reminder job not found!');
      process.exit(1);
    }
    
    logger.info('SCRIPT', `\n📋 Found Daily Weather Forecast Reminder job:`);
    logger.info('SCRIPT', `   Job ID: ${weatherJob._id}`);
    logger.info('SCRIPT', `   Current nextRunAt: ${weatherJob.nextRunAt ? new Date(weatherJob.nextRunAt).toISOString() : 'null'}`);
    
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
    
    logger.info('SCRIPT', `   Setting nextRunAt to: ${nextRunAt.toISOString()} (${nextRunAt.toLocaleString()})`);
    
    // Force update the job's nextRunAt - update both root level and attrs
    const updateResult = await agendaJobsCollection.updateOne(
      { _id: weatherJob._id },
      { 
        $set: { 
          nextRunAt: nextRunAt,
          'attrs.nextRunAt': nextRunAt
        },
        // Unlock the job if it's locked
        $unset: {
          lockedAt: "",
          lastModifiedBy: ""
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      logger.success('SCRIPT', `\n✅ Successfully updated Daily Weather Forecast Reminder job!`);
      logger.info('SCRIPT', `   Modified ${updateResult.modifiedCount} document(s)`);
    } else {
      logger.warn('SCRIPT', `\n⚠️  No documents were modified. Job may already have correct nextRunAt.`);
    }
    
    // Verify the update
    const updatedJob = await agendaJobsCollection.findOne({ _id: weatherJob._id });
    logger.info('SCRIPT', `\n📊 Verification:`);
    logger.info('SCRIPT', `   nextRunAt (root): ${updatedJob.nextRunAt ? new Date(updatedJob.nextRunAt).toISOString() : 'null'}`);
    logger.info('SCRIPT', `   nextRunAt (attrs): ${updatedJob.attrs?.nextRunAt ? new Date(updatedJob.attrs.nextRunAt).toISOString() : 'null'}`);
    logger.info('SCRIPT', `   lockedAt: ${updatedJob.lockedAt ? new Date(updatedJob.lockedAt).toISOString() : 'null'}`);
    
    logger.info('SCRIPT', '\n✅ Script completed!');
    logger.info('SCRIPT', 'Make sure Agenda is running in your bot to process this job.');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error fixing Weather job:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the fix
fixWeatherJobDirect();
