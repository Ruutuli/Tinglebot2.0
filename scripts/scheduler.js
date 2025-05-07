// ------------------- Import necessary modules -------------------
const cron = require('node-cron');
const { handleError } = require('../utils/globalErrorHandler');
const { isResetTime, resetDailyRolls } = require('./dailyRollReset');

// ------------------- Scheduler Setup -------------------
// Run every minute to check for reset time
cron.schedule('* * * * *', async () => {
  try {
    console.log('[scheduler.js]: Checking for daily roll reset...');
    if (isResetTime()) {
      await resetDailyRolls();
    }
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: Error in daily roll reset check:', error);
  }
});

// Log when scheduler starts
console.log('[scheduler.js]: Daily roll reset scheduler started'); 