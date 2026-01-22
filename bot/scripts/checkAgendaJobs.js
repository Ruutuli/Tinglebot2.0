// Simple script to check Agenda jobs in the database
// This doesn't require starting Agenda, just checks what's in MongoDB

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

async function checkJobs() {
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
    
    // Get all jobs
    const allJobs = await agendaJobsCollection.find({}).toArray();
    logger.info('SCRIPT', `\n📊 Found ${allJobs.length} total jobs in agendaJobs collection\n`);
    
    if (allJobs.length === 0) {
      logger.warn('SCRIPT', '⚠️  No jobs found in database! Jobs need to be created.');
      logger.info('SCRIPT', 'Run the bot normally to create jobs, or use verifyAgendaJobs.js to recreate them.');
      process.exit(0);
    }
    
    // Filter for recurring jobs
    const recurringJobs = allJobs.filter(job => {
      return (job.repeatInterval && job.repeatInterval !== null) || 
             (job.attrs && job.attrs.repeatInterval && job.attrs.repeatInterval !== null);
    });
    
    logger.info('SCRIPT', `📅 Recurring jobs: ${recurringJobs.length}`);
    logger.info('SCRIPT', `⏰ One-time jobs: ${allJobs.length - recurringJobs.length}\n`);
    
    // Check for 8am EST jobs (13:00 UTC)
    const eightAmJobs = recurringJobs.filter(job => {
      const repeatInterval = job.repeatInterval || (job.attrs && job.attrs.repeatInterval);
      return repeatInterval === "0 13 * * *";
    });
    
    logger.info('SCRIPT', `🌅 Jobs scheduled for 8am EST (13:00 UTC): ${eightAmJobs.length}`);
    
    if (eightAmJobs.length > 0) {
      logger.info('SCRIPT', '\n8am EST jobs:');
      eightAmJobs.forEach((job, index) => {
        const jobName = job.name || (job.attrs && job.attrs.name) || 'unknown';
        const nextRun = job.nextRunAt || (job.attrs && job.attrs.nextRunAt);
        const nextRunStr = nextRun ? new Date(nextRun).toLocaleString() : 'not scheduled';
        logger.info('SCRIPT', `   ${index + 1}. ${jobName}`);
        logger.info('SCRIPT', `      Next run: ${nextRunStr}`);
      });
    }
    
    // Check for expected 8am jobs
    const expected8amJobs = [
      "checkExpiredRequests",
      "Daily Weather Update", 
      "blood moon end announcement"
    ];
    
    logger.info('SCRIPT', '\n🔍 Checking for expected 8am jobs:');
    let missingCount = 0;
    for (const expectedName of expected8amJobs) {
      const found = eightAmJobs.some(job => {
        const jobName = job.name || (job.attrs && job.attrs.name);
        return jobName === expectedName;
      });
      
      if (found) {
        logger.success('SCRIPT', `   ✅ ${expectedName}`);
      } else {
        logger.warn('SCRIPT', `   ❌ ${expectedName} - MISSING!`);
        missingCount++;
      }
    }
    
    // Check for 8:15am job
    const eight15amJobs = recurringJobs.filter(job => {
      const repeatInterval = job.repeatInterval || (job.attrs && job.attrs.repeatInterval);
      return repeatInterval === "15 13 * * *";
    });
    
    const weatherFallbackFound = eight15amJobs.some(job => {
      const jobName = job.name || (job.attrs && job.attrs.name);
      return jobName === "Weather Fallback Check";
    });
    
    logger.info('SCRIPT', '\n🔍 Checking for 8:15am job:');
    if (weatherFallbackFound) {
      logger.success('SCRIPT', '   ✅ Weather Fallback Check');
    } else {
      logger.warn('SCRIPT', '   ❌ Weather Fallback Check - MISSING!');
      missingCount++;
    }
    
    // Summary
    logger.info('SCRIPT', '\n📋 Summary:');
    logger.info('SCRIPT', `   Total jobs: ${allJobs.length}`);
    logger.info('SCRIPT', `   Recurring jobs: ${recurringJobs.length}`);
    logger.info('SCRIPT', `   8am EST jobs: ${eightAmJobs.length}`);
    logger.info('SCRIPT', `   Missing expected jobs: ${missingCount}`);
    
    if (missingCount > 0) {
      logger.warn('SCRIPT', '\n⚠️  Some expected jobs are missing!');
      logger.info('SCRIPT', 'To fix: Restart the bot or run: node bot/scripts/verifyAgendaJobs.js');
      process.exit(1);
    } else {
      logger.success('SCRIPT', '\n✅ All expected jobs are present in the database!');
      process.exit(0);
    }
    
  } catch (error) {
    logger.error('SCRIPT', 'Error checking jobs:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the check
checkJobs();
