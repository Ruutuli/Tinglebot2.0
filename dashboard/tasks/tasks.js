// ============================================================================
// ------------------- Dashboard Scheduled Tasks -------------------
// Purpose: All scheduled tasks for the dashboard server
// - Character of the Week rotation
// - Other dashboard-specific scheduled tasks
// ============================================================================

const logger = require('../utils/logger');
const Character = require('../models/CharacterModel');
const CharacterOfWeek = require('../models/CharacterOfWeekModel');
const { sendCharacterOfWeekNotifications } = require('../utils/notificationService');

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: getNextSundayMidnight -------------------
// Gets the next Sunday midnight EST from a given date
const getNextSundayMidnight = (fromDate) => {
  const date = new Date(fromDate);
  
  // Set to EST timezone (UTC-5, or UTC-4 during daylight saving)
  // For simplicity, we'll use UTC-5 (EST) - you may want to handle DST properly
  const estOffset = -5 * 60 * 60 * 1000; // 5 hours in milliseconds
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = date.getUTCDay();
  
  // Calculate days until next Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  
  // Create the next Sunday midnight EST
  const nextSunday = new Date(date);
  nextSunday.setUTCDate(date.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(5, 0, 0, 0); // 5 AM UTC = 12 AM EST
  
  return nextSunday;
};

// ------------------- Function: createNewCharacterOfWeek -------------------
// Helper function to create a new character of the week entry
const createNewCharacterOfWeek = async (character) => {
  try {
    // Deactivate current character of the week
    await CharacterOfWeek.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // Calculate start and end dates based on Sunday midnight schedule
    const startDate = new Date();
    const endDate = getNextSundayMidnight(startDate);
    
    // Create new character of the week
    const newCharacterOfWeek = new CharacterOfWeek({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      startDate,
      endDate,
      isActive: true,
      featuredReason: 'Weekly rotation'
    });
    
    await newCharacterOfWeek.save();
    
    logger.success('SCHEDULED', `Successfully rotated to new character of the week: ${character.name}`);
    
    // Send notifications to users who have enabled character of week notifications
    try {
      await sendCharacterOfWeekNotifications({
        name: character.name,
        description: `${character.name} is now the Character of the Week!`,
        icon: character.icon
      });
    } catch (notifError) {
      logger.error('SCHEDULED', `Failed to send character of week notifications: ${notifError.message}`);
    }
    
    return newCharacterOfWeek;
  } catch (error) {
    logger.error('SCHEDULED', `Error in createNewCharacterOfWeek: ${error.message}`);
    throw error;
  }
};

// ------------------- Function: rotateCharacterOfWeek -------------------
// Helper function to rotate the character of the week
const rotateCharacterOfWeek = async () => {
  try {
    // Get all active characters
    const characters = await Character.find({}).lean();
    
    if (characters.length === 0) {
      logger.warn('SCHEDULED', 'No characters found for rotation');
      return;
    }
    
    // Get all characters that have ever been featured
    const allFeaturedCharacters = await CharacterOfWeek.find({}).distinct('characterId');
    
    // Find characters that have never been featured
    const neverFeaturedCharacters = characters.filter(char => 
      !allFeaturedCharacters.includes(char._id.toString())
    );
    
    // If there are characters that have never been featured, prioritize them
    if (neverFeaturedCharacters.length > 0) {
      const randomCharacter = neverFeaturedCharacters[Math.floor(Math.random() * neverFeaturedCharacters.length)];
      await createNewCharacterOfWeek(randomCharacter);
      return;
    }
    
    // If all characters have been featured at least once, find the one featured longest ago
    const characterLastFeaturedDates = {};
    
    // Initialize all characters with a very old date (in case they've never been featured)
    characters.forEach(char => {
      characterLastFeaturedDates[char._id.toString()] = new Date(0);
    });
    
    // Get the most recent featured date for each character
    const featuredHistory = await CharacterOfWeek.find({}).sort({ startDate: -1 });
    featuredHistory.forEach(entry => {
      const charId = entry.characterId.toString();
      if (characterLastFeaturedDates[charId] && entry.startDate > characterLastFeaturedDates[charId]) {
        characterLastFeaturedDates[charId] = entry.startDate;
      }
    });
    
    // Find the character featured longest ago
    let oldestFeaturedCharacter = null;
    let oldestDate = new Date();
    
    for (const [charId, lastFeaturedDate] of Object.entries(characterLastFeaturedDates)) {
      if (lastFeaturedDate < oldestDate) {
        oldestDate = lastFeaturedDate;
        oldestFeaturedCharacter = characters.find(char => char._id.toString() === charId);
      }
    }
    
    if (oldestFeaturedCharacter) {
      await createNewCharacterOfWeek(oldestFeaturedCharacter);
    } else {
      logger.warn('SCHEDULED', 'Could not determine character to feature');
    }
    
  } catch (error) {
    logger.error('SCHEDULED', `Error in rotateCharacterOfWeek: ${error.message}`);
    throw error;
  }
};

// ============================================================================
// ------------------- Scheduled Task Handlers -------------------
// ============================================================================

// ------------------- character-of-week-rotation (Sunday 12am EST = 05:00 UTC) -------------------
async function characterOfWeekRotation(_data = {}) {
  try {
    logger.info('SCHEDULED', 'character-of-week-rotation: starting');
    await rotateCharacterOfWeek();
    logger.success('SCHEDULED', 'character-of-week-rotation: done');
  } catch (err) {
    logger.error('SCHEDULED', `character-of-week-rotation: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Task Registry -------------------
// ============================================================================

const TASKS = [
  // Weekly Tasks (Sunday 12am EST = 05:00 UTC)
  { name: 'character-of-week-rotation', cron: '0 5 * * 0', handler: characterOfWeekRotation }, // Every Sunday at 05:00 UTC
];

/**
 * Register all scheduled tasks with the scheduler. Call before initializeScheduler.
 * @param {object} scheduler - utils/scheduler module (registerTask, etc.)
 */
function registerScheduledTasks(scheduler) {
  for (const { name, cron, handler } of TASKS) {
    scheduler.registerTask(name, cron, handler);
  }
}

module.exports = { 
  registerScheduledTasks, 
  characterOfWeekRotation,
  rotateCharacterOfWeek,
  TASKS 
};
