// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
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
    console.log('[dailyRollReset.js]: Starting daily roll reset...');
    
    // Find all characters with non-empty dailyRoll maps
    const characters = await Character.find({
      'dailyRoll': { $exists: true, $ne: new Map() }
    });

    console.log(`[dailyRollReset.js]: Found ${characters.length} characters with daily rolls to reset`);

    // Reset dailyRoll map for each character
    for (const character of characters) {
      character.dailyRoll = new Map();
      await character.save();
      console.log(`[dailyRollReset.js]: Reset daily rolls for character ${character.name}`);
    }

    console.log('[dailyRollReset.js]: Daily roll reset completed successfully');
  } catch (error) {
    handleError(error, 'dailyRollReset.js');
    console.error('[dailyRollReset.js]: Error resetting daily rolls:', error);
  }
}

// ------------------- Main Execution -------------------
async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI);
    console.log('[dailyRollReset.js]: Connected to MongoDB');

    // Check if it's reset time
    if (isResetTime()) {
      await resetDailyRolls();
    } else {
      console.log('[dailyRollReset.js]: Not reset time yet');
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('[dailyRollReset.js]: Disconnected from MongoDB');
  } catch (error) {
    handleError(error, 'dailyRollReset.js');
    console.error('[dailyRollReset.js]: Error in main execution:', error);
  }
}

// Run the script
main();

// Export functions for testing
module.exports = {
  isResetTime,
  resetDailyRolls
}; 