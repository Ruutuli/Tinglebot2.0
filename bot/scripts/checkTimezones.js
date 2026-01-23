// Script to diagnose timezone issues across the system
// Checks Railway, Node.js, MongoDB, and Agenda timezone settings

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

async function checkTimezones() {
  try {
    logger.info('SCRIPT', '🔍 Starting timezone diagnostics...\n');
    
    // 1. System/OS Timezone
    logger.info('SCRIPT', '📋 SYSTEM TIMEZONE:');
    logger.info('SCRIPT', `   TZ environment variable: ${process.env.TZ || 'not set'}`);
    logger.info('SCRIPT', `   Railway timezone (if applicable): ${process.env.TZONE || 'not set'}`);
    
    // 2. Node.js Timezone
    logger.info('SCRIPT', '\n📋 NODE.JS TIMEZONE:');
    const now = new Date();
    logger.info('SCRIPT', `   Current Date object: ${now.toString()}`);
    logger.info('SCRIPT', `   UTC time: ${now.toUTCString()}`);
    logger.info('SCRIPT', `   ISO string: ${now.toISOString()}`);
    logger.info('SCRIPT', `   Local time string: ${now.toLocaleString()}`);
    logger.info('SCRIPT', `   Timezone offset (minutes): ${now.getTimezoneOffset()}`);
    logger.info('SCRIPT', `   Timezone offset (hours): ${-now.getTimezoneOffset() / 60}`);
    
    // Get timezone name using Intl
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      logger.info('SCRIPT', `   Detected timezone: ${timezone}`);
    } catch (e) {
      logger.warn('SCRIPT', `   Could not detect timezone: ${e.message}`);
    }
    
    // 3. Test cron interpretation
    logger.info('SCRIPT', '\n📋 CRON EXPRESSION TEST:');
    logger.info('SCRIPT', '   Testing "0 1 * * *" (should be 1:00 AM UTC daily)');
    
    // Calculate what 1:00 AM UTC should be
    const today1AM = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      1, 0, 0, 0
    ));
    logger.info('SCRIPT', `   Expected 1:00 AM UTC today: ${today1AM.toISOString()}`);
    logger.info('SCRIPT', `   Expected 1:00 AM UTC tomorrow: ${new Date(today1AM.getTime() + 24 * 60 * 60 * 1000).toISOString()}`);
    
    // 4. MongoDB Connection and Timezone
    logger.info('SCRIPT', '\n📋 MONGODB TIMEZONE:');
    await DatabaseConnectionManager.initialize();
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    
    if (mongooseConnection && mongooseConnection.readyState === 1) {
      // Test MongoDB date storage
      const testDate = new Date();
      logger.info('SCRIPT', `   MongoDB connection ready`);
      logger.info('SCRIPT', `   Testing date storage with: ${testDate.toISOString()}`);
      
      // Query a job to see how dates are stored
      const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
      const sampleJob = await agendaJobsCollection.findOne({});
      
      if (sampleJob) {
        logger.info('SCRIPT', `   Sample job found: ${sampleJob.name || 'unnamed'}`);
        if (sampleJob.nextRunAt) {
          const nextRun = new Date(sampleJob.nextRunAt);
          logger.info('SCRIPT', `   Sample job nextRunAt (raw): ${sampleJob.nextRunAt}`);
          logger.info('SCRIPT', `   Sample job nextRunAt (Date): ${nextRun.toISOString()}`);
          logger.info('SCRIPT', `   Sample job nextRunAt (UTC): ${nextRun.toUTCString()}`);
          logger.info('SCRIPT', `   Sample job nextRunAt (local): ${nextRun.toLocaleString()}`);
        }
      }
    } else {
      logger.warn('SCRIPT', '   MongoDB connection not ready');
    }
    
    // 5. Check specific jobs
    logger.info('SCRIPT', '\n📋 AGENDA JOBS TIMEZONE CHECK:');
    if (mongooseConnection && mongooseConnection.readyState === 1) {
      const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
      
      const jobsToCheck = [
        'Blight Roll Call',
        'Blight Roll Call Check',
        'Daily Weather Forecast Reminder'
      ];
      
      for (const jobName of jobsToCheck) {
        const job = await agendaJobsCollection.findOne({
          $or: [
            { name: jobName },
            { 'attrs.name': jobName }
          ]
        });
        
        if (job) {
          logger.info('SCRIPT', `\n   ${jobName}:`);
          logger.info('SCRIPT', `     Repeat Interval: ${job.repeatInterval || job.attrs?.repeatInterval || 'none'}`);
          logger.info('SCRIPT', `     Repeat Timezone: ${job.repeatTimezone || job.attrs?.repeatTimezone || 'null (uses UTC)'}`);
          
          if (job.nextRunAt) {
            const nextRun = new Date(job.nextRunAt);
            logger.info('SCRIPT', `     nextRunAt (ISO): ${nextRun.toISOString()}`);
            logger.info('SCRIPT', `     nextRunAt (UTC): ${nextRun.toUTCString()}`);
            logger.info('SCRIPT', `     nextRunAt (local): ${nextRun.toLocaleString()}`);
            
            // Calculate what it should be if cron is "0 1 * * *"
            if ((job.repeatInterval || job.attrs?.repeatInterval) === '0 1 * * *') {
              const expected = now >= today1AM 
                ? new Date(today1AM.getTime() + 24 * 60 * 60 * 1000)
                : today1AM;
              logger.info('SCRIPT', `     Expected (1 AM UTC): ${expected.toISOString()}`);
              
              if (Math.abs(nextRun.getTime() - expected.getTime()) > 60000) { // More than 1 minute difference
                logger.warn('SCRIPT', `     ⚠️  MISMATCH! nextRunAt doesn't match expected 1 AM UTC`);
                const diffMinutes = Math.round((nextRun.getTime() - expected.getTime()) / (1000 * 60));
                logger.warn('SCRIPT', `     Difference: ${diffMinutes} minutes`);
              } else {
                logger.info('SCRIPT', `     ✅ Matches expected 1 AM UTC`);
              }
            }
          }
        } else {
          logger.warn('SCRIPT', `   ${jobName}: NOT FOUND`);
        }
      }
    }
    
    // 6. Test what 8 PM EST should be in UTC
    logger.info('SCRIPT', '\n📋 8 PM EST TO UTC CONVERSION:');
    logger.info('SCRIPT', '   EST is UTC-5, so 8 PM EST = 1 AM UTC next day');
    logger.info('SCRIPT', `   Current UTC time: ${now.toUTCString()}`);
    logger.info('SCRIPT', `   Current UTC hour: ${now.getUTCHours()}`);
    
    // Calculate 8 PM EST in UTC
    const est8PM = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      20, 0, 0, 0
    ));
    est8PM.setUTCHours(est8PM.getUTCHours() + 5); // Add 5 hours for EST
    logger.info('SCRIPT', `   8 PM EST = ${est8PM.toISOString()} (${est8PM.toUTCString()})`);
    
    // 7. Summary
    logger.info('SCRIPT', '\n📊 SUMMARY:');
    logger.info('SCRIPT', '   ✅ All dates in MongoDB should be stored as UTC');
    logger.info('SCRIPT', '   ✅ Cron expressions in Agenda should be interpreted as UTC');
    logger.info('SCRIPT', '   ✅ "0 1 * * *" means 1:00 AM UTC every day');
    logger.info('SCRIPT', '   ✅ 1:00 AM UTC = 8:00 PM EST (previous day)');
    
    if (process.env.TZ) {
      logger.warn('SCRIPT', `   ⚠️  TZ environment variable is set to: ${process.env.TZ}`);
      logger.warn('SCRIPT', '   This might affect how Node.js interprets dates');
    }
    
    logger.info('SCRIPT', '\n✅ Timezone diagnostics complete!');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error checking timezones:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the check
checkTimezones();
