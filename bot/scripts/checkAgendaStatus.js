// Script to check if Agenda is running and processing jobs
// This helps diagnose why scheduled jobs aren't executing

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

async function checkAgendaStatus() {
  try {
    logger.info('SCRIPT', 'Connecting to database...');
    
    // Initialize database connection
    await DatabaseConnectionManager.initialize();
    logger.info('SCRIPT', 'Database connected');
    
    // Initialize Agenda
    await initAgenda();
    logger.info('SCRIPT', 'Agenda initialized');
    
    const agenda = getAgenda();
    if (!agenda) {
      logger.error('SCRIPT', 'Failed to get Agenda instance');
      process.exit(1);
    }
    
    // Query MongoDB directly to check job status
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.error('SCRIPT', 'MongoDB connection not ready');
      process.exit(1);
    }
    
    const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
    
    // Get the Blight Roll Call job
    const blightJob = await agendaJobsCollection.findOne({
      $or: [
        { name: 'Blight Roll Call' },
        { 'attrs.name': 'Blight Roll Call' }
      ]
    });
    
    if (!blightJob) {
      logger.error('SCRIPT', '❌ Blight Roll Call job not found!');
      process.exit(1);
    }
    
    logger.info('SCRIPT', `\n📋 Blight Roll Call Job Status:`);
    logger.info('SCRIPT', `   Job ID: ${blightJob._id}`);
    logger.info('SCRIPT', `   Name: ${blightJob.name || blightJob.attrs?.name || 'unknown'}`);
    logger.info('SCRIPT', `   Repeat Interval: ${blightJob.repeatInterval || blightJob.attrs?.repeatInterval || 'unknown'}`);
    
    const nextRun = blightJob.nextRunAt || blightJob.attrs?.nextRunAt;
    if (nextRun) {
      const nextRunDate = new Date(nextRun);
      const now = new Date();
      const timeUntil = nextRunDate.getTime() - now.getTime();
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      
      logger.info('SCRIPT', `   Next Run: ${nextRunDate.toISOString()} (${nextRunDate.toLocaleString()})`);
      logger.info('SCRIPT', `   Time Until: ${hoursUntil}h ${minutesUntil}m`);
      
      if (timeUntil < 0) {
        logger.warn('SCRIPT', `   ⚠️  Next run time is in the PAST! Job should have already run.`);
      }
    } else {
      logger.warn('SCRIPT', `   Next Run: not set`);
    }
    
    // Check if job is locked (currently running)
    const lockedAt = blightJob.lockedAt || blightJob.attrs?.lockedAt;
    if (lockedAt) {
      const lockedDate = new Date(lockedAt);
      const lockAge = Date.now() - lockedDate.getTime();
      const lockAgeMinutes = Math.floor(lockAge / (1000 * 60));
      
      logger.warn('SCRIPT', `   ⚠️  Job is LOCKED (running since ${lockedDate.toLocaleString()})`);
      logger.warn('SCRIPT', `   Lock age: ${lockAgeMinutes} minutes`);
      
      if (lockAge > 10 * 60 * 1000) { // More than 10 minutes
        logger.error('SCRIPT', `   ❌ Job has been locked for ${lockAgeMinutes} minutes - it may be STUCK!`);
      }
    } else {
      logger.info('SCRIPT', `   Lock Status: Not locked (not currently running)`);
    }
    
    // Check last run time
    const lastRun = blightJob.lastRunAt || blightJob.attrs?.lastRunAt;
    if (lastRun) {
      const lastRunDate = new Date(lastRun);
      const timeSince = Date.now() - lastRunDate.getTime();
      const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
      const minutesSince = Math.floor((timeSince % (1000 * 60 * 60)) / (1000 * 60));
      
      logger.info('SCRIPT', `   Last Run: ${lastRunDate.toISOString()} (${lastRunDate.toLocaleString()})`);
      logger.info('SCRIPT', `   Time Since: ${hoursSince}h ${minutesSince}m ago`);
    } else {
      logger.warn('SCRIPT', `   Last Run: Never (job has never executed)`);
    }
    
    // Check for failed runs
    const failedAt = blightJob.failedAt || blightJob.attrs?.failedAt;
    if (failedAt) {
      logger.error('SCRIPT', `   ❌ Job has FAILED at: ${new Date(failedAt).toLocaleString()}`);
      const failCount = blightJob.failCount || blightJob.attrs?.failCount || 0;
      logger.error('SCRIPT', `   Fail Count: ${failCount}`);
    }
    
    // Summary
    logger.info('SCRIPT', `\n📊 Summary:`);
    if (nextRun && new Date(nextRun).getTime() < Date.now()) {
      logger.error('SCRIPT', `   ❌ Job's nextRunAt is in the past - it should have run but didn't!`);
      logger.info('SCRIPT', `   This could mean:`);
      logger.info('SCRIPT', `   1. Agenda is not running/processing jobs`);
      logger.info('SCRIPT', `   2. Agenda is not started in the bot`);
      logger.info('SCRIPT', `   3. The job is stuck/locked`);
    } else if (lockedAt && lockAge > 10 * 60 * 1000) {
      logger.error('SCRIPT', `   ❌ Job appears to be stuck (locked for ${lockAgeMinutes} minutes)`);
      logger.info('SCRIPT', `   You may need to unlock it manually in the database`);
    } else {
      logger.info('SCRIPT', `   ✅ Job appears to be configured correctly`);
      logger.info('SCRIPT', `   Make sure Agenda is started in your bot to process jobs`);
    }
    
    process.exit(0);
    
  } catch (error) {
    logger.error('SCRIPT', 'Error checking Agenda status:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the check
checkAgendaStatus();
