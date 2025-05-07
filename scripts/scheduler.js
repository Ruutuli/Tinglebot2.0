// ------------------- Import necessary modules -------------------
const cron = require('node-cron');
const { handleError } = require('../utils/globalErrorHandler');
const Character = require('../models/CharacterModel');

// ------------------- Helper Functions -------------------
// Check if it's time to reset daily rolls
function isResetTime() {
  const now = new Date();
  const resetTime = new Date();
  resetTime.setUTCHours(13, 0, 0, 0); // 8AM EST = 1PM UTC
  
  // Check if current time is within 1 minute of reset time
  const timeDiff = Math.abs(now - resetTime);
  return timeDiff < 60000; // 60000 ms = 1 minute
}

// Reset daily rolls for all characters
async function resetDailyRolls() {
  try {
    console.log('[scheduler.js]: Starting daily roll reset...');
    
    // Find all characters with non-empty dailyRoll maps
    const characters = await Character.find({
      'dailyRoll': { $exists: true, $ne: new Map() }
    });

    console.log(`[scheduler.js]: Found ${characters.length} characters with daily rolls to reset`);

    // Reset dailyRoll map for each character
    for (const character of characters) {
      character.dailyRoll = new Map();
      await character.save();
      console.log(`[scheduler.js]: Reset daily rolls for character ${character.name}`);
    }

    console.log('[scheduler.js]: Daily roll reset completed successfully');
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: Error resetting daily rolls:', error);
  }
}

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