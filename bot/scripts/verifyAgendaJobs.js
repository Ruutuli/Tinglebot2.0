// Script to verify and recreate Agenda recurring jobs
// Run this if jobs aren't running as expected

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
const { initAgenda, getAgenda } = require('../scheduler/agenda');
const logger = require('../utils/logger');

async function verifyAndRecreateJobs() {
  try {
    logger.info('SCRIPT', 'Starting Agenda job verification...');
    
    // Initialize database connection
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connection established');
    
    // Initialize Agenda
    await initAgenda();
    logger.info('SCRIPT', 'Agenda initialized');
    
    const agenda = getAgenda();
    if (!agenda) {
      logger.error('SCRIPT', 'Failed to get Agenda instance');
      process.exit(1);
    }
    
    // Start Agenda (with timeout)
    try {
      await Promise.race([
        agenda.start(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Agenda start timeout')), 10000))
      ]);
      logger.info('SCRIPT', 'Agenda started');
    } catch (error) {
      logger.warn('SCRIPT', `Agenda start warning: ${error.message} - continuing anyway`);
    }
    
    // Query MongoDB directly to check for recurring jobs
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.error('SCRIPT', 'MongoDB connection not ready');
      process.exit(1);
    }
    
    const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
    
    // Get all jobs (Agenda stores them with 'name' and 'repeatInterval' in the document)
    // Also check for jobs with repeatInterval in attrs
    const allJobs = await agendaJobsCollection.find({}).toArray();
    logger.info('SCRIPT', `Found ${allJobs.length} total jobs in database`);
    
    // Filter for recurring jobs (those with repeatInterval)
    const existingJobs = allJobs.filter(job => {
      return (job.repeatInterval && job.repeatInterval !== null) || 
             (job.attrs && job.attrs.repeatInterval && job.attrs.repeatInterval !== null);
    });
    
    logger.info('SCRIPT', `Found ${existingJobs.length} recurring jobs in database`);
    
    // Log all jobs for debugging
    if (allJobs.length > 0) {
      logger.info('SCRIPT', `Sample job structure:`, JSON.stringify(allJobs[0], null, 2).substring(0, 500));
    }
    
    // List of all expected recurring jobs that should run at 8am EST (13:00 UTC)
    const expected8amJobs = [
      { name: "checkExpiredRequests", schedule: "0 13 * * *", description: "8am EST expiration check" },
      { name: "Daily Weather Update", schedule: "0 13 * * *", description: "8am EST weather update" },
      { name: "blood moon end announcement", schedule: "0 13 * * *", description: "8am EST blood moon end" },
    ];
    
    // Also check for 8:15am job
    const expected815amJobs = [
      { name: "Weather Fallback Check", schedule: "15 13 * * *", description: "8:15am EST weather fallback" },
    ];
    
    const allExpectedJobs = [...expected8amJobs, ...expected815amJobs];
    
    logger.info('SCRIPT', `Checking ${allExpectedJobs.length} expected 8am jobs...`);
    
    let recreatedCount = 0;
    for (const expectedJob of allExpectedJobs) {
      // Check if job exists by name and has the correct schedule
      // Agenda stores jobs with 'name' at root level and 'repeatInterval' at root or in attrs
      const jobExists = existingJobs.some(job => {
        const jobName = job.name || (job.attrs && job.attrs.name);
        const repeatInterval = job.repeatInterval || (job.attrs && job.attrs.repeatInterval);
        const isMatch = jobName === expectedJob.name && repeatInterval === expectedJob.schedule;
        if (isMatch) {
          logger.debug('SCRIPT', `Found matching job: ${jobName} with schedule ${repeatInterval}`);
        }
        return isMatch;
      });
      
      if (!jobExists) {
        logger.warn('SCRIPT', `❌ Missing job: ${expectedJob.name} (${expectedJob.description})`);
        logger.info('SCRIPT', `   Recreating job with schedule: ${expectedJob.schedule}...`);
        try {
          const createdJob = await agenda.every(expectedJob.schedule, expectedJob.name);
          recreatedCount++;
          logger.success('SCRIPT', `✅ Recreated: ${expectedJob.name} (ID: ${createdJob?.attrs?._id || 'created'})`);
        } catch (error) {
          logger.error('SCRIPT', `❌ Failed to recreate job ${expectedJob.name}:`, error.message);
        }
      } else {
        logger.success('SCRIPT', `✅ Job exists: ${expectedJob.name}`);
      }
    }
    
    // Log all 8am jobs for debugging
    const eightAmJobs = existingJobs.filter(job => {
      const repeatInterval = job.repeatInterval || job.attrs?.repeatInterval;
      return repeatInterval === "0 13 * * *";
    });
    
    logger.info('SCRIPT', `\n📋 Summary:`);
    logger.info('SCRIPT', `   Total recurring jobs in database: ${existingJobs.length}`);
    logger.info('SCRIPT', `   Jobs scheduled for 8am EST (13:00 UTC): ${eightAmJobs.length}`);
    logger.info('SCRIPT', `   Jobs recreated: ${recreatedCount}`);
    
    if (eightAmJobs.length > 0) {
      logger.info('SCRIPT', `\n8am EST jobs found:`);
      eightAmJobs.forEach(job => {
        const jobName = job.name || job.attrs?.name || 'unknown';
        const nextRun = job.nextRunAt || job.attrs?.nextRunAt;
        logger.info('SCRIPT', `   - ${jobName} (next run: ${nextRun ? new Date(nextRun).toLocaleString() : 'unknown'})`);
      });
    }
    
    if (recreatedCount > 0) {
      logger.success('SCRIPT', `\n✅ Successfully recreated ${recreatedCount} missing jobs!`);
      logger.info('SCRIPT', 'The bot should now run these jobs at the scheduled times.');
    } else {
      logger.info('SCRIPT', '\n✅ All expected jobs exist in the database.');
    }
    
    // Stop Agenda
    await agenda.stop();
    logger.info('SCRIPT', 'Agenda stopped');
    
    process.exit(0);
  } catch (error) {
    logger.error('SCRIPT', 'Error verifying jobs:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the verification
verifyAndRecreateJobs();
