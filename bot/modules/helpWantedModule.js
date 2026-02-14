// ============================================================================
// ------------------- Help Wanted Quest Generation Module -------------------
// Logic for generating daily Help Wanted quests per village
// ============================================================================

const mongoose = require('mongoose');
const HelpWantedQuest = require('@/models/HelpWantedQuestModel');
const Item = require('@/models/ItemModel');
const Monster = require('@/models/MonsterModel');
const VillageShopItem = require('@/models/VillageShopsModel');
const { Village } = require('@/models/VillageModel');
const { getAllVillages, locations } = require('./locationsModule');
const moment = require('moment');
const { EmbedBuilder } = require('discord.js');
const { NPCs, getNPCQuestFlavor } = require('./NPCsModule');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { getWeatherWithoutGeneration } = require('@/services/weatherService');
const logger = require('@/utils/logger');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const QUEST_TYPES = ['item', 'monster', 'escort', 'crafting', 'art', 'writing', 'character-guess'];

// Weather conditions that block travel
const TRAVEL_BLOCKING_WEATHER = ['Flood', 'Avalanche', 'Rock Slide'];

// Generate full 24-hour schedule with hourly intervals (24 time slots per day)
const FIXED_CRON_TIMES = [
  '0 0 * * *',   // 12:00 AM UTC (Midnight)
  '0 1 * * *',   // 1:00 AM UTC  
  '0 2 * * *',   // 2:00 AM UTC  
  '0 3 * * *',   // 3:00 AM UTC  
  '0 4 * * *',   // 4:00 AM UTC  
  '0 5 * * *',   // 5:00 AM UTC  
  '0 6 * * *',   // 6:00 AM UTC  
  '0 7 * * *',   // 7:00 AM UTC  
  '0 8 * * *',   // 8:00 AM UTC  
  '0 9 * * *',   // 9:00 AM UTC  
  '0 10 * * *',  // 10:00 AM UTC  
  '0 11 * * *',  // 11:00 AM UTC  
  '0 12 * * *',  // 12:00 PM UTC (Noon)
  '0 13 * * *',  // 1:00 PM UTC  
  '0 14 * * *',  // 2:00 PM UTC  
  '0 15 * * *',  // 3:00 PM UTC  
  '0 16 * * *',  // 4:00 PM UTC  
  '0 17 * * *',  // 5:00 PM UTC  
  '0 18 * * *',  // 6:00 PM UTC  
  '0 19 * * *',  // 7:00 PM UTC  
  '0 20 * * *',  // 8:00 PM UTC  
  '0 21 * * *',  // 9:00 PM UTC  
  '0 22 * * *',  // 10:00 PM UTC  
  '0 23 * * *'   // 11:00 PM UTC  
];

const QUEST_TYPE_EMOJIS = {
  'item': '📦',
  'monster': '⚔️',
  'escort': '🛡️',
  'crafting': '🔨',
  'art': '🎨',
  'writing': '📝',
  'character-guess': '🎭'
};

const { VILLAGE_BANNERS } = require('@/database/db');

const VILLAGE_COLORS = {
  Rudania: '#d7342a',
  Inariko: '#277ecd',
  Vhintl: '#25c059'
};

const VILLAGE_IMAGES = {
  Rudania: VILLAGE_BANNERS.Rudania,
  Inariko: VILLAGE_BANNERS.Inariko,
  Vhintl: VILLAGE_BANNERS.Vhintl
};

// Quest generation parameters
const QUEST_PARAMS = {
  item: { minAmount: 1, maxAmount: 5 },
  monster: { minAmount: 3, maxAmount: 7 },
  crafting: { minAmount: 1, maxAmount: 3 },
  art: { minAmount: 1, maxAmount: 1 },
  writing: { minAmount: 1, maxAmount: 1 }
};

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// ------------------- Helper: getUTCDateString -------------------
// Gets date string in UTC format (YYYY-MM-DD)
function getUTCDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// ------------------- Helper: getESTDateString -------------------
// Gets date string in EST format (YYYY-MM-DD) - matches helpWanted.js for completion tracking
function getESTDateString(date = new Date()) {
  const estDate = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  return `${estDate.getUTCFullYear()}-${String(estDate.getUTCMonth() + 1).padStart(2, '0')}-${String(estDate.getUTCDate()).padStart(2, '0')}`;
}

// ------------------- Helper: getHourInUTC -------------------
// Gets hour (0-23) in UTC
function getHourInUTC(date = new Date()) {
  return date.getUTCHours();
}

// Utility function to convert cron time to hour
const cronToHour = (cronTime) => {
  const parts = cronTime.split(' ');
  return parseInt(parts[1]);
};

// Utility function to check if two hours are at least minHours apart
const isHoursApart = (hour1, hour2, minHours = 3) => {
  const hourDiff = Math.abs(hour1 - hour2);
  const minHourDiff = Math.min(hourDiff, 24 - hourDiff);
  return minHourDiff >= minHours;
};

// Utility function to format hour for display
const formatHour = (hour) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
};

// ------------------- Function: getRandomElement -------------------
// Returns a random element from an array
function getRandomElement(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('Invalid array provided to getRandomElement');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------- Function: getRandomNPCName -------------------
// Returns a random NPC name from the NPCsModule
function getRandomNPCName() {
  const npcNames = Object.keys(NPCs);
  if (npcNames.length === 0) {
    throw new Error('No NPCs available');
  }
  return getRandomElement(npcNames);
}

// ------------------- Function: getRandomNPCNameFromPool -------------------
// Returns a random NPC name from a provided pool of available NPCs
function getRandomNPCNameFromPool(availableNPCs) {
  if (availableNPCs.length === 0) {
    throw new Error('No NPCs available in pool');
  }
  return getRandomElement(availableNPCs);
}

// ------------------- Function: isTravelBlockedByWeather -------------------
// Checks if travel is blocked by current weather conditions
async function isTravelBlockedByWeather(village) {
  try {
    const weather = await getWeatherWithoutGeneration(village);
    if (!weather || !weather.special) {
      return false; // No special weather, travel is not blocked
    }
    
    const specialWeather = weather.special.label;
    const isBlocked = TRAVEL_BLOCKING_WEATHER.includes(specialWeather);
    
    if (isBlocked) {
      logger.info('QUEST', `Travel blocked in ${village} due to ${specialWeather} weather`);
    }
    
    return isBlocked;
  } catch (error) {
    logger.error('QUEST', `Error checking weather for ${village}`, error);
    return false; // Default to allowing travel if weather check fails
  }
}

// ------------------- Function: isTravelBlockedByWeatherCached -------------------
// Checks if travel is blocked by weather with caching and retry logic
async function isTravelBlockedByWeatherCached(village, cache = new Map()) {
  // Check cache first
  if (cache.has(village)) {
    return cache.get(village);
  }
  
  // Retry logic with exponential backoff
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const weather = await getWeatherWithoutGeneration(village);
      if (!weather || !weather.special) {
        cache.set(village, false);
        return false;
      }
      
      const specialWeather = weather.special.label;
      const isBlocked = TRAVEL_BLOCKING_WEATHER.includes(specialWeather);
      
      if (isBlocked) {
        logger.info('QUEST', `Travel blocked in ${village} due to ${specialWeather} weather`);
      }
      
      // Cache the result
      cache.set(village, isBlocked);
      return isBlocked;
    } catch (error) {
      lastError = error;
      logger.warn('QUEST', `Weather check attempt ${attempt}/${maxRetries} failed for ${village}`, error);
      
      // Exponential backoff: wait 100ms, 200ms, 400ms
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  // All retries failed - default to allowing travel but log warning
  logger.error('QUEST', `All weather check attempts failed for ${village}, defaulting to allowing travel`, lastError);
  cache.set(village, false); // Cache the fallback result
  return false;
}

// ------------------- Function: getAvailableQuestTypes -------------------
// Returns available quest types based on time, weather, and exclusions
function getAvailableQuestTypes(isAfterNoon = false, travelBlocked = false, excludeTypes = []) {
  let availableTypes = [...QUEST_TYPES];
  const excludedReasons = [];
  
      // Exclude art and writing if after 12pm UTC
  if (isAfterNoon) {
    if (availableTypes.includes('art')) {
      availableTypes = availableTypes.filter(type => type !== 'art');
        excludedReasons.push('art (after 12pm UTC)');
    }
    if (availableTypes.includes('writing')) {
      availableTypes = availableTypes.filter(type => type !== 'writing');
        excludedReasons.push('writing (after 12pm UTC)');
    }
  }
  
  // Exclude escort if travel is blocked
  if (travelBlocked) {
    if (availableTypes.includes('escort')) {
      availableTypes = availableTypes.filter(type => type !== 'escort');
      excludedReasons.push('escort (travel blocked)');
    }
  }
  
  // Exclude additional types if specified
  if (excludeTypes.length > 0) {
    const beforeExclude = availableTypes.length;
    availableTypes = availableTypes.filter(type => !excludeTypes.includes(type));
    if (availableTypes.length < beforeExclude) {
      excludedReasons.push(`${excludeTypes.filter(t => QUEST_TYPES.includes(t)).join(', ')} (explicitly excluded)`);
    }
  }
  
  // Fallback to basic types if all types are excluded
  const basicTypes = ['item', 'monster', 'crafting'];
  if (availableTypes.length === 0) {
    logger.warn('QUEST', `All quest types excluded, falling back to basic types: ${basicTypes.join(', ')}`);
    logger.debug('QUEST', `Exclusion reasons: ${excludedReasons.join('; ')}`);
    return basicTypes;
  }
  
  // Log exclusions for debugging
  if (excludedReasons.length > 0) {
    logger.debug('QUEST', `Excluded quest types: ${excludedReasons.join('; ')}. Available types: ${availableTypes.join(', ')}`);
  }
  
  return availableTypes;
}

// ------------------- Function: regenerateEscortQuest -------------------
// Regenerates an escort quest as a different quest type when travel is blocked
// Includes retry logic and fallback quest types
async function regenerateEscortQuest(quest) {
  const maxRetries = 3;
  const typePreferences = ['item', 'monster', 'crafting', 'art', 'writing']; // Order of preference (excluding escort)
  
  logger.info('QUEST', `Regenerating escort quest ${quest.questId} for ${quest.village} due to travel-blocking weather`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get available quest pools
      const pools = await getAllQuestPools();
      
      // Get available NPCs (excluding the current one to avoid duplicates)
      const allNPCs = Object.keys(NPCs);
      let availableNPCs = allNPCs.filter(npc => npc !== quest.npcName);
      
      // Fallback to all NPCs if pool is empty
      if (availableNPCs.length === 0) {
        logger.warn('QUEST', `No NPCs available excluding ${quest.npcName} for ${quest.questId}, using all NPCs`);
        availableNPCs = [...allNPCs];
      }
      
      if (availableNPCs.length === 0) {
        throw new Error(`No NPCs available for quest regeneration`);
      }
      
      // Get available types excluding escort
      const availableTypes = getAvailableQuestTypes(false, true, ['escort']); // travelBlocked=true ensures escort excluded
      
      if (availableTypes.length === 0) {
        throw new Error(`No available quest types after excluding escort`);
      }
      
      // Try types in preference order, but randomize if multiple attempts
      let typesToTry = attempt === 1 ? typePreferences.filter(t => availableTypes.includes(t)) : shuffleArray([...availableTypes]);
      
      // Ensure we have at least one type
      if (typesToTry.length === 0) {
        typesToTry = availableTypes;
      }
      
      let newType = null;
      let newRequirements = null;
      let lastTypeError = null;
      
      // Try each type until one succeeds
      for (const tryType of typesToTry) {
        try {
          newRequirements = await generateQuestRequirements(tryType, pools, quest.village, quest.questId);
          newType = tryType;
          break; // Success, exit loop
        } catch (error) {
          lastTypeError = error;
          logger.debug('QUEST', `Failed to generate ${tryType} quest for ${quest.questId} regeneration attempt ${attempt}`, error);
          continue; // Try next type
        }
      }
      
      if (!newType || !newRequirements) {
        throw new Error(`Failed to generate requirements for any quest type. Last error: ${lastTypeError?.message || 'Unknown'}`);
      }
      
      // Validate new type is not escort
      if (newType === 'escort') {
        throw new Error(`Regenerated quest type cannot be escort`);
      }
      
      const newNpcName = getRandomElement(availableNPCs);
      
      // Update the quest
      quest.type = newType;
      quest.requirements = newRequirements;
      quest.npcName = newNpcName;
      
      // Save with retry
      let saved = false;
      for (let saveAttempt = 1; saveAttempt <= 3; saveAttempt++) {
        try {
          await quest.save();
          saved = true;
          break;
        } catch (saveError) {
          if (saveAttempt === 3) {
            throw saveError;
          }
          logger.warn('QUEST', `Save attempt ${saveAttempt}/3 failed for ${quest.questId}`, saveError);
          await new Promise(resolve => setTimeout(resolve, 100 * saveAttempt)); // Exponential backoff
        }
      }
      
      if (!saved) {
        throw new Error(`Failed to save regenerated quest after 3 attempts`);
      }
      
      logger.success('QUEST', `Regenerated quest ${quest.questId} as ${newType} quest with NPC ${newNpcName} for ${quest.village}`);
      return quest;
      
    } catch (error) {
      logger.warn('QUEST', `Regeneration attempt ${attempt}/${maxRetries} failed for escort quest ${quest.questId}`, error);
      
      if (attempt === maxRetries) {
        logger.error('QUEST', `All regeneration attempts failed for escort quest ${quest.questId}. Quest marked for manual review.`, error);
        // Mark quest for manual review - could add a flag to the quest model
        throw new Error(`Failed to regenerate escort quest ${quest.questId} after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
  
  // Should never reach here, but just in case
  throw new Error(`Failed to regenerate escort quest ${quest.questId}`);
}

// ------------------- Function: regenerateArtWritingQuest -------------------
// Regenerates an art or writing quest as a different quest type when it's after 12pm UTC
// Includes retry logic and fallback quest types
async function regenerateArtWritingQuest(quest) {
  const maxRetries = 3;
  const typePreferences = ['item', 'monster', 'crafting', 'escort']; // Order of preference (excluding art/writing)
  
  logger.info('QUEST', `Regenerating ${quest.type} quest ${quest.questId} for ${quest.village} due to time restriction (after 12pm UTC)`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get available quest pools
      const pools = await getAllQuestPools();
      
      // Get available NPCs (excluding the current one to avoid duplicates)
      const allNPCs = Object.keys(NPCs);
      let availableNPCs = allNPCs.filter(npc => npc !== quest.npcName);
      
      // Fallback to all NPCs if pool is empty
      if (availableNPCs.length === 0) {
        logger.warn('QUEST', `No NPCs available excluding ${quest.npcName} for ${quest.questId}, using all NPCs`);
        availableNPCs = [...allNPCs];
      }
      
      if (availableNPCs.length === 0) {
        throw new Error(`No NPCs available for quest regeneration`);
      }
      
      // Get available types excluding art and writing
      const availableTypes = getAvailableQuestTypes(true, false, ['art', 'writing']); // isAfterNoon=true ensures art/writing excluded
      
      if (availableTypes.length === 0) {
        throw new Error(`No available quest types after excluding art and writing`);
      }
      
      // Try types in preference order, but randomize if multiple attempts
      let typesToTry = attempt === 1 ? typePreferences.filter(t => availableTypes.includes(t)) : shuffleArray([...availableTypes]);
      
      // Ensure we have at least one type
      if (typesToTry.length === 0) {
        typesToTry = availableTypes;
      }
      
      let newType = null;
      let newRequirements = null;
      let lastTypeError = null;
      
      // Try each type until one succeeds
      for (const tryType of typesToTry) {
        try {
          newRequirements = await generateQuestRequirements(tryType, pools, quest.village, quest.questId);
          newType = tryType;
          break; // Success, exit loop
        } catch (error) {
          lastTypeError = error;
          logger.debug('QUEST', `Failed to generate ${tryType} quest for ${quest.questId} regeneration attempt ${attempt}`, error);
          continue; // Try next type
        }
      }
      
      if (!newType || !newRequirements) {
        throw new Error(`Failed to generate requirements for any quest type. Last error: ${lastTypeError?.message || 'Unknown'}`);
      }
      
      // Validate new type is not art or writing
      if (newType === 'art' || newType === 'writing') {
        throw new Error(`Regenerated quest type cannot be ${newType}`);
      }
      
      const newNpcName = getRandomElement(availableNPCs);
      
      // Update the quest
      quest.type = newType;
      quest.requirements = newRequirements;
      quest.npcName = newNpcName;
      
      // Save with retry
      let saved = false;
      for (let saveAttempt = 1; saveAttempt <= 3; saveAttempt++) {
        try {
          await quest.save();
          saved = true;
          break;
        } catch (saveError) {
          if (saveAttempt === 3) {
            throw saveError;
          }
          logger.warn('QUEST', `Save attempt ${saveAttempt}/3 failed for ${quest.questId}`, saveError);
          await new Promise(resolve => setTimeout(resolve, 100 * saveAttempt)); // Exponential backoff
        }
      }
      
      if (!saved) {
        throw new Error(`Failed to save regenerated quest after 3 attempts`);
      }
      
      logger.success('QUEST', `Regenerated quest ${quest.questId} as ${newType} quest with NPC ${newNpcName} for ${quest.village}`);
      return quest;
      
    } catch (error) {
      logger.warn('QUEST', `Regeneration attempt ${attempt}/${maxRetries} failed for ${quest.type} quest ${quest.questId}`, error);
      
      if (attempt === maxRetries) {
        logger.error('QUEST', `All regeneration attempts failed for ${quest.type} quest ${quest.questId}. Quest marked for manual review.`, error);
        throw new Error(`Failed to regenerate ${quest.type} quest ${quest.questId} after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
  
  // Should never reach here, but just in case
  throw new Error(`Failed to regenerate ${quest.type} quest ${quest.questId}`);
}

// ------------------- Function: shuffleArray -------------------
// Shuffles an array in place using Fisher-Yates algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}





// ============================================================================
// ------------------- Quest Pool Management -------------------
// ============================================================================

// ------------------- Function: getItemQuestPool -------------------
// Fetches specific items for item quests from a curated list
async function getItemQuestPool() {
  try {
    // Specific list of item names that can be requested for item quests
    const allowedItemNames = [
      'Acorn',
      'Amber',
      'Amber Relic',
      'Amethyst',
      'Ancient Arowana',
      'Ancient Arrow',
      'Ancient Battle Axe',
      'Ancient Bladesaw',
      'Ancient Bow',
      'Ancient Core',
      'Ancient Flower',
      'Ancient Gear',
      'Ancient Screw',
      'Ancient Shaft',
      'Ancient Shield',
      'Ancient Short Sword',
      'Ancient Spear',
      'Ancient Spring',
      'Apple',
      'Armoranth',
      'Armored Carp',
      'Armored Porgy',
      'Arrow',
      'Aurora Stone',
      'Bird Egg',
      'Bird Feather',
      'Bladed Rhino Beetle',
      'Blessed Butterfly',
      'Blight Geodes',
      'Blin Bling',
      'Blue Bird Feather',
      'Blue Nightshade',
      'Boko Bat',
      'Boko Bow',
      'Boko Club',
      'Boko Shield',
      'Boko Spear',
      'Bokoblin Arm',
      'Bokoblin Fang',
      'Bokoblin Guts',
      'Bokoblin Horn',
      'Bright-Eyed Crab',
      'Brightbloom Seed',
      'Brightcap',
      'Cane Sugar',
      'Carmine Pearl',
      'Carrumpkin',
      'Chickaloo Tree Nut',
      'Chill Stone',
      'Chillfin Trout',
      'Chillshroom',
      'Chuchu Egg',
      'Chuchu Jelly',
      'Cold Darner',
      'Cool Safflina',
      'Cotton',
      'Courser Bee Honey',
      'Crystal Skull',
      'Cucco Feathers',
      'Dazzlefruit',
      'Deep Firefly',
      'Deku Hornet',
      'Demon Carver',
      'Demon Fossil',
      'Diamond',
      'Dinraal\'s Claw',
      'Dinraal\'s Scale',
      'Dragon Bone Boko Bow',
      'Dragonbone Boko Bat',
      'Dragonbone Boko Club',
      'Dragonbone Boko Shield',
      'Dragonbone Boko Spear',
      'Dragonbone Moblin Club',
      'Dragonbone Moblin Spear',
      'Duplex Bow',
      'Dusk Relic',
      'Eldin Ore',
      'Eldin Roller',
      'Electric Darner',
      'Electric Keese Wing',
      'Electric Safflina',
      'Emerald',
      'Endura Carrot',
      'Endura Shroom',
      'Energetic Rhino Beetle',
      'Enhanced Lizal Spear',
      'Fabled Butterfly',
      'Fairy',
      'Fairy Dust',
      'Faron Grasshopper',
      'Farosh\'s Claw',
      'Farosh\'s Scale',
      'Fire Fruit',
      'Fire Keese Wing',
      'Fire Rod',
      'Fireproof Lizard',
      'Fleet-Lotus Seeds',
      'Flint',
      'Forked Lizal Spear',
      'Fortified Pumpkin',
      'Freezard Water',
      'Fresh Milk',
      'Gerudo Dragonfly',
      'Giant Ancient Core',
      'Gibdo Bandage',
      'Gibdo Bone',
      'Gibdo Guts',
      'Gibdo Wing',
      'Glowing Cave Fish',
      'Goat Butter',
      'Goddess Plume',
      'Gold Dust',
      'Gold Ore',
      'Golden Apple',
      'Golden Insect',
      'Golden Skull',
      'Goron Ore',
      'Guardian Shield',
      'Guardian Spear',
      'Guardian Sword',
      'Hearty Bass',
      'Hearty Blueshell Snail',
      'Hearty Durian',
      'Hearty Lizard',
      'Hearty Radish',
      'Hearty Salmon',
      'Hearty Truffle',
      'Hightail Lizard',
      'Hinox Guts',
      'Hinox Toenail',
      'Hinox Tooth',
      'Hornet Larvae',
      'Horriblin Claw',
      'Horriblin Guts',
      'Horriblin Horn',
      'Hot-Footed Frog',
      'Hydromelon',
      'Hylian Rice',
      'Hylian Shroom',
      'Hylian Tomato',
      'Hyrule Bass',
      'Hyrule Herb',
      'Ice Fruit',
      'Ice Keese Wing',
      'Ice Rod',
      'Ice Rose',
      'Icy Lizalfos Tail',
      'Insect Parts',
      'Ironshell Crab',
      'Ironshroom',
      'Jade Relic',
      'Job Voucher',
      'Keese Eyeball',
      'Keese Wing',
      'Kelp',
      'Korok Leaf',
      'Lanayru Ant',
      'Lava Drop',
      'Leather',
      'Lightning Rod',
      'Like Like Stone',
      'Lizal Boomerang',
      'Lizal Bow',
      'Lizal Forked Boomerang',
      'Lizal Shield',
      'Lizal Spear',
      'Lizal Tri-Boomerang',
      'Lizalfos Arm',
      'Lizalfos Horn',
      'Lizalfos Tail',
      'Lizalfos Talon',
      'Lizard Tail',
      'Luminous Stone',
      'Lynel Bow',
      'Lynel Crusher',
      'Lynel Guts',
      'Lynel Hoof',
      'Lynel Horn',
      'Lynel Shield',
      'Lynel Spear',
      'Lynel Sword',
      'Mighty Bananas',
      'Mighty Carp',
      'Mighty Lynel Bow',
      'Mighty Lynel Crusher',
      'Mighty Lynel Shield',
      'Mighty Lynel Spear',
      'Mighty Lynel Sword',
      'Mighty Porgy',
      'Mighty Thistle',
      'Moblin Arm',
      'Moblin Club',
      'Moblin Fang',
      'Moblin Guts',
      'Moblin Horn',
      'Moblin Spear',
      'Mock Fairy',
      'Molduga Fin',
      'Molduga Guts',
      'Monster Claw',
      'Monster Extract',
      'Monster Fur',
      'Monster Horn',
      'Muddle Bud',
      'Naydra\'s Claw',
      'Naydra\'s Scale',
      'Octo Balloon',
      'Octorok Eyeball',
      'Octorok Tentacle',
      'Old Shirt',
      'Opal',
      'Ornamental Skull',
      'Palm Fruit',
      'Papyrus',
      'Poe Soul',
      'Pretty Plume',
      'Puffshroom',
      'Rainbow Coral',
      'Raw Bird Drumstick',
      'Raw Bird Thigh',
      'Raw Gourmet Meat',
      'Raw Meat',
      'Raw Prime Meat',
      'Raw Whole Bird',
      'Razorclaw Crab',
      'Razorshroom',
      'Red Chuchu Jelly',
      'Red Lizalfos Tail',
      'Reinforced Lizal Shield',
      'Restless Cricket',
      'Rock Salt',
      'Ruby',
      'Rugged Horn',
      'Rugged Rhino Beetle',
      'Rushroom',
      'Sand Cicada',
      'Sandy Ribbon',
      'Sanke Carp',
      'Sapphire',
      'Savage Lynel Bow',
      'Savage Lynel Crusher',
      'Savage Lynel Shield',
      'Savage Lynel Spear',
      'Savage Lynel Sword',
      'Serpent Fangs',
      'Shard of Dinraal\'s Fang',
      'Shard of Dinraal\'s Horn',
      'Shard of Farosh\'s Fang',
      'Shard of Farosh\'s Horn',
      'Shard of Naydra\'s Fang',
      'Shard of Naydra\'s Horn',
      'Shock Fruit',
      'Silent Princess',
      'Silent Shroom',
      'Silver Dust',
      'Silver Ore',
      'Sizzlefin Trout',
      'Sky Stag Beetle',
      'Skyloft Mantis',
      'Skyshroom',
      'Smotherwing Butterfly',
      'Sneaky River Snail',
      'Spicy Pepper',
      'Spider Silk',
      'Spider\'s Eye',
      'Spiked Boko Bat',
      'Spiked Boko Bow',
      'Spiked Boko Club',
      'Spiked Boko Shield',
      'Spiked Boko Spear',
      'Spiked Moblin Club',
      'Spiked Moblin Spear',
      'Splash Fruit',
      'Spring-Loaded Hammer',
      'Stal Skull',
      'Stambulb',
      'Stamella Shroom',
      'Staminoka Bass',
      'Star Fragment',
      'Starry Firefly',
      'Stealthfin Trout',
      'Steel Lizal Bow',
      'Steel Lizal Shield',
      'Sticky Frog',
      'Sticky Lizard',
      'Strengthened Lizal Bow',
      'Summerwing Butterfly',
      'Sundelion',
      'Sunset Firefly',
      'Sunshroom',
      'Sweet Shroom',
      'Swift Carrot',
      'Swift Violet',
      'Tabantha Wheat',
      'Thornberry',
      'Thunderwing Butterfly',
      'Tireless Frog',
      'Topaz',
      'Tree Branch',
      'Vicious Sickle',
      'Volcanic Ladybug',
      'Voltfin Trout',
      'Voltfruit',
      'Warm Darner',
      'Warm Safflina',
      'Well-Worn Trousers',
      'White Chuchu Jelly',
      'Wild berry',
      'Windcleaver',
      'Winterwing Butterfly',
      'Wood',
      'Woodland Rhino Beetle',
      'Wool',
      'Yellow Chuchu Jelly',
      'Yellow Lizalfos Tail'
    ];

    // Search for items by name, including rarity
    logger.debug('QUEST', 'Searching for items by name');
    
    let items = [];
    try {
      items = await Item.find({
        itemName: { $in: allowedItemNames }
      }, 'itemName itemRarity');
      logger.debug('QUEST', `Found ${items.length} items by name out of ${allowedItemNames.length} requested items`);
    } catch (error) {
      logger.error('QUEST', 'Error searching for items by name', error);
      items = [];
    }
    
    if (items.length === 0) {
      throw new Error('No allowed items found for item quests by name');
    }
    
    // Filter out extremely rare items (rarity 6+) as they're too hard to obtain
    const filteredItems = items.filter(item => {
      const rarity = item.itemRarity || 1; // Default to rarity 1 if not specified
      return rarity <= 5; // Only allow rarity 1-5
    });
    
    if (filteredItems.length === 0) {
      logger.warn('QUEST', 'All items filtered out due to rarity restrictions, using all items as fallback');
      // Fallback: use all items if filtering removes everything
      return items;
    }
    
    const filteredCount = items.length - filteredItems.length;
    if (filteredCount > 0) {
      logger.debug('QUEST', `Filtered out ${filteredCount} item(s) with rarity 6+ from quest pool`);
    }
    
    logger.debug('QUEST', `Found ${filteredItems.length} items by name (after rarity filtering)`);
    
    return filteredItems;
  } catch (error) {
    logger.error('QUEST', 'Error fetching item quest pool', error);
    throw error;
  }
}

// ------------------- Function: getMonsterQuestPool -------------------
// Fetches all valid monsters for monster quests
async function getMonsterQuestPool() {
  try {
    const monsters = await Monster.find({
      tier: { $lte: 3 },
      species: { $ne: 'Boss' }
    }, 'name tier');
    
    if (monsters.length === 0) {
      throw new Error('No monsters found for monster quests');
    }
    
    return monsters;
  } catch (error) {
    logger.error('QUEST', 'Error fetching monster quest pool', error);
    throw error;
  }
}

// ------------------- Function: getCraftingQuestPool -------------------
// Fetches specific craftable items for crafting quests with weighted selection
async function getCraftingQuestPool() {
  try {
    // Specific list of items that can be requested for crafting quests
    const allowedCraftingItems = [
      'Akkala Buns', 'Amber Earrings', 'Apple Pie', 'Archaic Warm Greaves', 'Baked Apple',
      'Baked Fortified Pumpkin', 'Baked Palm Fruit', 'Blackened Crab', 'Blueshell Escargot',
      'Boat Oar', 'Bokoblin Mask', 'Bomb Arrow', 'Boomerang', 'Buttered Stambulb',
      'Campfire Egg', 'Cap of the Wild', 'Carrot Cake', 'Carrot Stew', 'Charred Pepper',
      'Cheesy Baked Fish', 'Cheesy Tomato', 'Clam Chowder', 'Climber\'s Bandanna',
      'Climbing Boots', 'Climbing Gear', 'Cobble Crusher', 'Cooked Stambulb',
      'Copious Fish Skewers', 'Copious Fried Wild Greens', 'Copious Meat Skewers',
      'Copious Mushroom Skewers', 'Copious Simmered Fruit', 'Crab Omelet With Rice',
      'Crab Risotto', 'Crab Stir-fry', 'Cream Of Vegetable Soup', 'Creamy Heart Soup',
      'Creamy Meat Soup', 'Curry Rice', 'Deep-Fried Bird Roast', 'Deep-Fried Drumstick',
      'Deep-Fried Thigh', 'Desert Voe Headband', 'Desert Voe Spaulder', 'Desert Voe Trousers',
      'Double Axe', 'Drillshaft', 'Egg Pudding', 'Egg Tart', 'Emblazoned Shield',
      'Falcon Bow', 'Farmer\'s Pitchfork', 'Farming Hoe', 'Feathered Edge', 'Feathered Spear',
      'Fire Arrow', 'Fish And Mushroom Skewer', 'Fish Pie', 'Fish Skewer', 'Fisherman\'s Shield',
      'Fishing Harpoon', 'Forest Dweller\'s Bow', 'Forest Dweller\'s Shield',
      'Forest Dweller\'s Spear', 'Forest Dweller\'s Sword', 'Fragrant Mushroom Sauté',
      'Fried Bananas', 'Fried Egg And Rice', 'Fried Wild Greens', 'Fruit And Mushroom Mix',
      'Fruit Cake', 'Fruit Pie', 'Gerudo Sirwal', 'Gerudo Top', 'Gerudo Veil',
      'Giant Boomerang', 'Glazed Meat', 'Glazed Mushrooms', 'Glazed Seafood',
      'Glazed Veggies', 'Goron Spice', 'Gourmet Meat And Rice Bowl', 'Gourmet Meat And Seafood Fry',
      'Hard-boiled Egg', 'Hateno Cheese', 'Honey Candy', 'Honeyed Apple', 'Honeyed Fruits',
      'Hot Buttered Apple', 'Hunter\'s Shield', 'Hylian Hood', 'Hylian Trousers',
      'Hylian Tunic', 'Ice Arrow', 'Iron Sledgehammer', 'Island Lobster Shirt',
      'Kite Shield', 'Knight\'s Bow', 'Knight\'s Broadsword', 'Knight\'s Halberd',
      'Knight\'s Shield', 'Korok Mask', 'Lizalfos Mask', 'Lynel Mask', 'Mabe Soufflé',
      'Meat & Mushroom Skewer', 'Meat And Rice Bowl', 'Meat And Seafood Fry',
      'Meat Pie', 'Meat Skewer', 'Meat Stew', 'Meat-stuffed Pumpkins', 'Meaty Rice Balls',
      'Melty Cheesy Bread', 'Moblin Mask', 'Mushroom Omelet', 'Mushroom Rice Balls',
      'Mushroom Risotto', 'Mushroom Skewer', 'Noble Pursuit', 'Nut Cake', 'Oil Jar',
      'Omelet', 'Opal Earrings', 'Pepper Seafood', 'Pepper Steak', 'Phrenic Bow',
      'Porgy Meunière', 'Pot Lid', 'Poultry Curry', 'Poultry Pilaf', 'Prime Meat And Rice Bowl',
      'Prime Meat And Seafood Fry', 'Prime Meat Stew', 'Prime Poultry Pilaf',
      'Prime Spiced Meat Skewer', 'Pumpkin Pie', 'Pumpkin Stew', 'Radiant Mask',
      'Radiant Shirt', 'Radiant Tights', 'Roasted Acorn', 'Roasted Armoranth',
      'Roasted Bass', 'Roasted Bird Drumstick', 'Roasted Bird Thigh', 'Roasted Carp',
      'Roasted Endura Carrot', 'Roasted Hearty Bass', 'Roasted Hearty Durian',
      'Roasted Hearty Salmon', 'Roasted Hydromelon', 'Roasted Lotus Seeds',
      'Roasted Mighty Bananas', 'Roasted Mighty Thistle', 'Roasted Porgy',
      'Roasted Radish', 'Roasted Swift Carrot', 'Roasted Tree Nut', 'Roasted Trout',
      'Roasted Voltfruit', 'Roasted Whole Bird', 'Roasted Wildberry', 'Rock-hard Food',
      'Rubber Armor', 'Rubber Helm', 'Rubber Tights', 'Rusty Broadsword',
      'Rusty Claymore', 'Rusty Halberd', 'Rusty Shield', 'Salmon Meunière',
      'Salt-grilled Crab', 'Salt-grilled Fish', 'Salt-grilled Gourmet Meat',
      'Salt-grilled Greens', 'Salt-grilled Meat', 'Salt-grilled Mushrooms',
      'Salt-grilled Prime Meat', 'Sand Boots', 'Sapphire Circlet', 'Sautéed Nuts',
      'Sea-Breeze Boomerang', 'Seafood Fried Rice', 'Seafood Meunière',
      'Seafood Rice Balls', 'Seafood Skewer', 'Seared Gourmet Steak', 'Seared Prime Steak',
      'Seared Steak', 'Serpentine Spear', 'Shield of the Mind\'s Eye', 'Shock Arrow',
      'Silver Bow', 'Silver Shield', 'Silverscale Spear', 'Simmered Fruit',
      'Simmered Tomato', 'Sneaky River Escargot', 'Snowquill Headdress',
      'Snowquill Trousers', 'Snowquill Tunic', 'Soldier\'s Bow', 'Soldier\'s Broadsword',
      'Soldier\'s Claymore', 'Soldier\'s Shield', 'Soldier\'s Spear', 'Soup Ladle',
      'Spiced Meat Skewer', 'Spicy Sautéed Peppers', 'Stealth Chest Guard',
      'Stealth Mask', 'Stealth Tights', 'Steamed Fish', 'Steamed Fruit',
      'Steamed Meat', 'Stone Smasher', 'Swallow Bow', 'Sword', 'Tabantha Bake',
      'Throwing Spear', 'Tingle\'s Hood', 'Tingle\'s Shirt', 'Tingle\'s Tights',
      'Toasted Hearty Truffle', 'Toasty Chillshroom', 'Toasty Endura Shroom',
      'Toasty Hylian Shroom', 'Toasty Ironshroom', 'Toasty Razorshroom',
      'Toasty Rushroom', 'Toasty Silent Shroom', 'Toasty Skyshroom',
      'Toasty Stamella Shroom', 'Toasty Sunshroom', 'Toasty Zapshroom',
      'Tomato Mushroom Stew', 'Tomato Seafood Soup', 'Tomato Stew', 'Topaz Earrings',
      'Torch', 'Traveler\'s Bow', 'Traveler\'s Claymore', 'Traveler\'s Shield',
      'Traveler\'s Spear', 'Traveler\'s Sword', 'Trousers of the Wild',
      'Tunic of the Wild', 'Vegetable Risotto', 'Veggie Cream Soup',
      'Veggie Rice Balls', 'Warm Milk', 'Wheat Bread', 'Woodcutter\'s Axe',
      'Wooden Bow', 'Wooden Mop', 'Wooden Shield', 'Zora Armor', 'Zora Greaves',
      'Zora Helm', 'Zora Spear', 'Zora Sword'
    ];

    // Fetch the allowed items with their crafting data
    const items = await Item.find({
      itemName: { $in: allowedCraftingItems },
      crafting: true
    }, 'itemName staminaToCraft category');

    if (items.length === 0) {
      throw new Error('No allowed crafting items found for crafting quests');
    }

    // Create weighted pool based on stamina and category
    const weightedPool = [];
    
    for (const item of items) {
      let weight = 1;
      
      // Prioritize items with 3 or less stamina to craft
      if (item.staminaToCraft && item.staminaToCraft <= 3) {
        weight = 3;
      }
      
      // Prioritize items with "recipe" category
      if (item.category && item.category.includes('recipe')) {
        weight = weight * 2;
      }
      
      // Add item to pool with its weight (multiple entries for higher weight)
      for (let i = 0; i < weight; i++) {
        weightedPool.push(item);
      }
    }

    return weightedPool;
  } catch (error) {
    logger.error('QUEST', 'Error fetching crafting quest pool', error);
    throw error;
  }
}

// ------------------- Function: getEscortQuestPool -------------------
// Gets all valid escort locations
function getEscortQuestPool() {
  return getAllVillages();
}

// ------------------- Function: getArtQuestPool -------------------
// Gets art prompts for art quests - practical NPC requests for 24-hour completion
function getArtQuestPool() {
  return [
    // Real estate and housing requests
    { prompt: 'a house for sale in {village} to see what\'s available', requirement: 'Sketch', context: 'housing', needsVillage: true },
    { prompt: 'a room layout in {village} for someone looking for a new place to live', requirement: 'Line art', context: 'housing', needsVillage: true },
    { prompt: 'the {village} marketplace to help people know where to shop', requirement: 'Sketch', context: 'location', needsVillage: true },
    { prompt: 'a map of {village} to help people navigate the area', requirement: 'Line art', context: 'location', needsVillage: true },
    
    // Mount and transportation requests
    { prompt: 'a horse for sale to help someone find a new mount', requirement: 'Sketch', context: 'mount' },
    { prompt: 'a stable in {village} to help people find where to board their horses', requirement: 'Line art', context: 'mount', needsVillage: true },
    { prompt: 'a good riding path near {village} for travelers planning a journey', requirement: 'Sketch', context: 'travel', needsVillage: true },
    
    // Wildlife and hunting requests
    { prompt: 'a fish native to {village} waters to help people know what to catch', requirement: 'Line art', context: 'wildlife', needsVillage: true },
    { prompt: 'the easiest monster to hunt near {village} for new hunters', requirement: 'Sketch', context: 'hunting', needsVillage: true },
    { prompt: 'a good hunting spot near {village} to help people find game', requirement: 'Line art', context: 'hunting', needsVillage: true },
    { prompt: 'a dangerous creature near {village} to help people avoid it', requirement: 'Sketch', context: 'wildlife', needsVillage: true },
    
    // Job and profession requests
    { prompt: 'a good mining spot near {village} to help people find work', requirement: 'Line art', context: 'job', needsVillage: true },
    { prompt: 'a fishing spot in {village} to help people find where to fish', requirement: 'Sketch', context: 'job', needsVillage: true },
    { prompt: 'a good foraging area near {village} to help people collect herbs', requirement: 'Line art', context: 'job', needsVillage: true },
    { prompt: 'a crafting workshop in {village} to help people find tools', requirement: 'Sketch', context: 'job', needsVillage: true },
    
    // Safety and navigation requests
    { prompt: 'a safe camping spot near {village} to help travelers rest', requirement: 'Line art', context: 'safety', needsVillage: true },
    { prompt: 'landmarks around {village} to help people navigate the area', requirement: 'Sketch', context: 'navigation', needsVillage: true },
    { prompt: 'a dangerous area near {village} to help people avoid it', requirement: 'Line art', context: 'safety', needsVillage: true },
    
    // Simple character and item requests
    { prompt: 'your character to help people remember what you look like', requirement: 'Sketch', context: 'character' },
    { prompt: 'a weapon you recommend to help people choose what to buy', requirement: 'Line art', context: 'equipment' },
    { prompt: 'a useful tool to help people with their work', requirement: 'Sketch', context: 'equipment' }
  ];
}

// ------------------- Function: getWritingQuestPool -------------------
// Gets writing prompts for writing quests with 500-word minimum
function getWritingQuestPool() {
  return [
    // Wildlife and nature reports
    { prompt: 'a detailed wildlife report about the animals and creatures native to {village}', context: 'wildlife', needsVillage: true },
    { prompt: 'a comprehensive guide to the fish species found in {village} waters', context: 'fishing', needsVillage: true },
    { prompt: 'a detailed report on the dangerous creatures near {village} and how to avoid them', context: 'safety', needsVillage: true },
    { prompt: 'a comprehensive guide to the plant life and herbs around {village}', context: 'foraging', needsVillage: true },
    
    // Job and profession guides
    { prompt: 'a detailed guide on how hunters find their hunting grounds near {village}', context: 'hunting', needsVillage: true },
    { prompt: 'a comprehensive mining guide for the area around {village}', context: 'mining', needsVillage: true },
    { prompt: 'a detailed guide to the best fishing techniques for {village} waters', context: 'fishing', needsVillage: true },
    { prompt: 'a comprehensive guide to foraging safely around {village}', context: 'foraging', needsVillage: true },
    { prompt: 'a detailed guide to crafting techniques and where to find materials near {village}', context: 'crafting', needsVillage: true },
    
    // Travel and navigation guides
    { prompt: 'a detailed travel guide from {village} to other villages', context: 'travel', needsVillage: true },
    { prompt: 'a comprehensive guide to safe camping spots and travel routes near {village}', context: 'travel', needsVillage: true },
    { prompt: 'a detailed guide to the landmarks and navigation around {village}', context: 'navigation', needsVillage: true },
    
    // Village information and services
    { prompt: 'a detailed guide to the shops and services in {village}', context: 'village', needsVillage: true },
    { prompt: 'a comprehensive guide to the housing options and neighborhoods in {village}', context: 'housing', needsVillage: true },
    { prompt: 'a detailed guide to the local customs and traditions in {village}', context: 'culture', needsVillage: true },
    
    // Equipment and gear guides
    { prompt: 'a detailed guide to choosing the right weapon for hunting near {village}', context: 'equipment', needsVillage: true },
    { prompt: 'a comprehensive guide to the best tools and gear for mining in the {village} area', context: 'equipment', needsVillage: true },
    { prompt: 'a detailed guide to mount care and stable services in {village}', context: 'mounts', needsVillage: true },
    
    // Adventure and experience reports
    { prompt: 'a detailed account of your most successful hunting trip near {village}', context: 'adventure', needsVillage: true },
    { prompt: 'a comprehensive report on a dangerous encounter you survived near {village}', context: 'adventure', needsVillage: true },
    { prompt: 'a detailed guide to exploring safely around {village}', context: 'exploration', needsVillage: true }
  ];
}

// ------------------- Function: getVillageShopQuestPool -------------------
// Fetches all items from village shops for Peddler's special quests
async function getVillageShopQuestPool() {
  try {
    const shopItems = await VillageShopItem.find({
      stock: { $gt: 0 } // Only items with stock > 0
    }, 'itemName stock');
    
    if (shopItems.length === 0) {
      throw new Error('No village shop items found for Peddler quests');
    }
    
    return shopItems;
  } catch (error) {
    logger.error('QUEST', 'Error fetching village shop quest pool', error);
    throw error;
  }
}

// ------------------- Function: getCharacterGuessSnippetPool -------------------
// Fetches accepted characters with sufficient personality/history (not TBA) for snippet clues, for a village (case-insensitive)
async function getCharacterGuessSnippetPool(village) {
  try {
    const Character = require('@/models/CharacterModel');
    const villageRegex = new RegExp('^' + String(village).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const characters = await Character.find({
      status: 'accepted',
      homeVillage: villageRegex
    }).select('_id name personality history homeVillage icon').lean();
    const validCharacters = characters.filter(char => {
      const personality = (char.personality || '').trim();
      const history = (char.history || '').trim();
      if (personality.toLowerCase() === 'tba' || history.toLowerCase() === 'tba') return false;
      return personality.length >= 50 && history.length >= 50;
    });
    return validCharacters;
  } catch (error) {
    logger.error('QUEST', 'Error fetching character guess snippet pool', error);
    return [];
  }
}

// ------------------- Function: getCharacterGuessIconPool -------------------
// Fetches accepted characters with valid icon for icon-zoom clues, for a village (case-insensitive)
async function getCharacterGuessIconPool(village) {
  try {
    const Character = require('@/models/CharacterModel');
    const villageRegex = new RegExp('^' + String(village).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const characters = await Character.find({
      status: 'accepted',
      homeVillage: villageRegex,
      icon: { $exists: true, $ne: '', $not: /^\s*$/ }
    }).select('_id name icon homeVillage').lean();
    return characters;
  } catch (error) {
    logger.error('QUEST', 'Error fetching character guess icon pool', error);
    return [];
  }
}

// ------------------- Function: extractSnippetsFromCharacter -------------------
// Extracts random snippets from character's personality and history (excludes name in snippet when possible)
function extractSnippetsFromCharacter(character, snippetCount = 3) {
  const snippets = [];
  const personality = (character.personality || '').trim();
  const history = (character.history || '').trim();
  const nameLower = (character.name || '').toLowerCase();
  const splitSentences = (text) => text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  const personalitySentences = splitSentences(personality);
  const historySentences = splitSentences(history);
  if (personalitySentences.length === 0 && historySentences.length === 0) {
    throw new Error('Character has insufficient text for snippets');
  }
  const pickFrom = (arr, source, count) => {
    const out = [];
    const copy = [...arr];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      const sentence = copy[idx].trim();
      copy.splice(idx, 1);
      if (sentence.length > 0 && !sentence.toLowerCase().includes(nameLower)) {
        out.push({ text: sentence, source });
      }
    }
    return out;
  };
  let personalityCount = 0;
  let historyCount = 0;
  if (personalitySentences.length > 0 && historySentences.length > 0) {
    personalityCount = Math.max(1, Math.floor(snippetCount / 2));
    historyCount = snippetCount - personalityCount;
  } else if (personalitySentences.length > 0) {
    personalityCount = snippetCount;
  } else {
    historyCount = snippetCount;
  }
  snippets.push(...pickFrom(personalitySentences, 'personality', personalityCount));
  snippets.push(...pickFrom(historySentences, 'history', historyCount));
  if (snippets.length === 0) throw new Error('Character has insufficient text for snippets');
  return shuffleArray(snippets);
}

// ------------------- Function: generateZoomedIconUrl -------------------
// Fetches character icon, crops center region, resizes to 256x256, uploads to GCS, returns URL
async function generateZoomedIconUrl(iconUrl, questIdOrUniqueId) {
  try {
    const { default: fetch } = await import('node-fetch');
    const Jimp = require('jimp');
    const { uploadQuestClueBuffer } = require('@/utils/uploadUtils');
    const response = await fetch(iconUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    const image = await Jimp.read(inputBuffer);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const cropRatio = 0.15 + Math.random() * 0.1; // 15-25%
    const cropW = Math.max(1, Math.floor(w * cropRatio));
    const cropH = Math.max(1, Math.floor(h * cropRatio));
    const x = Math.floor((w - cropW) / 2);
    const y = Math.floor((h - cropH) / 2);
    image.crop(x, y, cropW, cropH);
    image.resize(256, 256);
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const filename = `${questIdOrUniqueId}-zoomed.png`;
    const publicUrl = await uploadQuestClueBuffer(buffer, filename);
    return publicUrl;
  } catch (error) {
    logger.error('QUEST', 'Error generating zoomed icon URL', error);
    return null;
  }
}

// ------------------- Function: getAllQuestPools -------------------
// Fetches all quest pools in parallel (character-guess pools are per-village)
async function getAllQuestPools() {
  try {
    const [itemPool, monsterPool, craftingPool, villageShopPool, snippetByVillage, iconByVillage] = await Promise.all([
      getItemQuestPool(),
      getMonsterQuestPool(),
      getCraftingQuestPool(),
      getVillageShopQuestPool(),
      Promise.all(VILLAGES.map(v => getCharacterGuessSnippetPool(v))).then(arr => {
        const out = {};
        VILLAGES.forEach((v, i) => { out[v] = arr[i]; });
        return out;
      }),
      Promise.all(VILLAGES.map(v => getCharacterGuessIconPool(v))).then(arr => {
        const out = {};
        VILLAGES.forEach((v, i) => { out[v] = arr[i]; });
        return out;
      })
    ]);
    
    const escortPool = getEscortQuestPool();
    const artPool = getArtQuestPool();
    const writingPool = getWritingQuestPool();
    
    return {
      itemPool,
      monsterPool,
      craftingPool,
      escortPool,
      villageShopPool,
      artPool,
      writingPool,
      characterGuessSnippetPoolByVillage: snippetByVillage,
      characterGuessIconPoolByVillage: iconByVillage
    };
  } catch (error) {
    logger.error('QUEST', 'Error fetching quest pools', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Quest Generation -------------------
// ============================================================================

// ------------------- Function: calculateItemQuestAmount -------------------
// Calculates appropriate min/max amounts for item quests based on item rarity
// Rarity 1-2: Common items - 1-5 items (normal range)
// Rarity 3-4: Uncommon items - 1-3 items (reduced range)
// Rarity 5: Rare items - 1 item only (very limited)
// Rarity 6+: Should be filtered out, but if present, 1 item only
function calculateItemQuestAmount(itemRarity) {
  const rarity = itemRarity || 1; // Default to rarity 1 if not specified
  
  if (rarity >= 5) {
    // Rarity 5+: Only request 1 item
    return { minAmount: 1, maxAmount: 1 };
  } else if (rarity >= 3) {
    // Rarity 3-4: Request 1-3 items (reduced from normal 1-5)
    return { minAmount: 1, maxAmount: 3 };
  } else {
    // Rarity 1-2: Request 1-5 items (normal range)
    return QUEST_PARAMS.item;
  }
}

// ------------------- Function: generateQuestRequirements -------------------
// Generates quest requirements based on quest type with pool validation and fallbacks
async function generateQuestRequirements(type, pools, village, optionalQuestId) {
  // Validate pools are available
  if (!pools || typeof pools !== 'object') {
    logger.error('QUEST', `Invalid pools object provided for ${village} ${type} quest`);
    throw new Error(`Invalid pools object for ${village} ${type} quest`);
  }
  
  switch (type) {
    case 'item': {
      // Validate item pool
      if (!pools.itemPool || !Array.isArray(pools.itemPool) || pools.itemPool.length === 0) {
        logger.error('QUEST', `Empty or invalid itemPool for ${village} item quest`);
        throw new Error(`No items available for ${village} item quest`);
      }
      
      try {
        const item = getRandomElement(pools.itemPool);
        if (!item?.itemName) {
          logger.warn('QUEST', `Invalid item selected from pool for ${village}, attempting fallback`);
          // Fallback: try to find any valid item in pool
          const validItem = pools.itemPool.find(i => i?.itemName);
          if (!validItem) {
            throw new Error(`No valid items in pool for ${village} item quest`);
          }
          // Use rarity-based amount calculation
          const itemRarity = validItem.itemRarity || 1;
          const { minAmount, maxAmount } = calculateItemQuestAmount(itemRarity);
          return {
            item: validItem.itemName,
            amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount
          };
        }
        
        // Calculate amount based on item rarity
        const itemRarity = item.itemRarity || 1; // Default to rarity 1 if not specified
        const { minAmount, maxAmount } = calculateItemQuestAmount(itemRarity);
        
        // Log if rare item is being requested
        if (itemRarity >= 5) {
          logger.debug('QUEST', `Item ${item.itemName} is rarity ${itemRarity}, requesting 1x only`);
        } else if (itemRarity >= 3) {
          logger.debug('QUEST', `Item ${item.itemName} is rarity ${itemRarity}, requesting reduced amount (1-3)`);
        }
        
        return {
          item: item.itemName,
          amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount
        };
      } catch (error) {
        logger.error('QUEST', `Error generating item quest requirements for ${village}`, error);
        throw new Error(`Failed to generate item quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'monster': {
      // Validate monster pool
      if (!pools.monsterPool || !Array.isArray(pools.monsterPool) || pools.monsterPool.length === 0) {
        logger.error('QUEST', `Empty or invalid monsterPool for ${village} monster quest`);
        throw new Error(`No monsters available for ${village} monster quest`);
      }
      
      try {
        // Try to get tier 1-3 monsters first
        let monsterPool = pools.monsterPool.filter(m => m?.tier <= 3);
        
        // Fallback to any monsters if tier 1-3 unavailable
        if (monsterPool.length === 0) {
          logger.warn('QUEST', `No tier 1-3 monsters available for ${village}, using all available monsters`);
          monsterPool = pools.monsterPool.filter(m => m?.name);
        }
        
        if (monsterPool.length === 0) {
          throw new Error(`No valid monsters in pool for ${village} monster quest`);
        }
        
        const monster = getRandomElement(monsterPool);
        if (!monster?.name) {
          throw new Error(`Invalid monster selected for ${village} monster quest`);
        }
        
        const { minAmount, maxAmount } = QUEST_PARAMS.monster;
        return {
          monster: monster.name,
          tier: monster.tier,
          amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount
        };
      } catch (error) {
        logger.error('QUEST', `Error generating monster quest requirements for ${village}`, error);
        throw new Error(`Failed to generate monster quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'escort': {
      // Validate escort pool
      if (!pools.escortPool || !Array.isArray(pools.escortPool)) {
        logger.error('QUEST', `Invalid escortPool for ${village} escort quest`);
        // Fallback to getAllVillages
        const allLocations = getAllVillages();
        const fallbackDestinations = allLocations.filter(loc => loc !== village);
        if (fallbackDestinations.length === 0) {
          throw new Error(`No escort destinations available for ${village}`);
        }
        logger.warn('QUEST', `Using fallback destinations for ${village} escort quest`);
        return { location: getRandomElement(fallbackDestinations) };
      }
      
      try {
        const availableDestinations = pools.escortPool.filter(loc => loc !== village);
        if (availableDestinations.length === 0) {
          // Fallback to all villages
          const allLocations = getAllVillages();
          const fallbackDestinations = allLocations.filter(loc => loc !== village);
          if (fallbackDestinations.length === 0) {
            logger.error('QUEST', `No escort destinations available for ${village}`);
            throw new Error(`No escort destinations available for ${village}`);
          }
          logger.warn('QUEST', `Using fallback destinations for ${village} escort quest`);
          return { location: getRandomElement(fallbackDestinations) };
        }
        return { location: getRandomElement(availableDestinations) };
      } catch (error) {
        logger.error('QUEST', `Error generating escort quest requirements for ${village}`, error);
        throw new Error(`Failed to generate escort quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'crafting': {
      // Validate crafting pool
      if (!pools.craftingPool || !Array.isArray(pools.craftingPool) || pools.craftingPool.length === 0) {
        logger.error('QUEST', `Empty or invalid craftingPool for ${village} crafting quest`);
        throw new Error(`No crafting items available for ${village} crafting quest`);
      }
      
      try {
        // Prefer items with stamina <= 4, but fallback to all items if needed
        let craftingPool = pools.craftingPool.filter(item => item?.itemName);
        let preferredPool = craftingPool.filter(item => !item.staminaToCraft || item.staminaToCraft <= 4);
        
        // Use preferred pool if available, otherwise use all items
        if (preferredPool.length === 0) {
          logger.warn('QUEST', `No simple crafting items (stamina <= 4) for ${village}, using all available items`);
          preferredPool = craftingPool;
        }
        
        const item = getRandomElement(preferredPool);
        if (!item?.itemName) {
          throw new Error(`Invalid crafting item selected for ${village} crafting quest`);
        }
        
        // Check stamina to craft and adjust amount accordingly
        let amount;
        if (item.staminaToCraft && item.staminaToCraft > 4) {
          // Items with more than 4 stamina to craft only ask for 1
          amount = 1;
        } else {
          // Items with 4 or less stamina use normal amount range
          const { minAmount, maxAmount } = QUEST_PARAMS.crafting;
          amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
        }
        
        return { item: item.itemName, amount };
      } catch (error) {
        logger.error('QUEST', `Error generating crafting quest requirements for ${village}`, error);
        throw new Error(`Failed to generate crafting quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'art': {
      // Validate art pool
      if (!pools.artPool || !Array.isArray(pools.artPool) || pools.artPool.length === 0) {
        logger.error('QUEST', `Empty or invalid artPool for ${village} art quest`);
        throw new Error(`No art prompts available for ${village} art quest`);
      }
      
      try {
        const artPrompt = getRandomElement(pools.artPool);
        if (!artPrompt || !artPrompt.prompt) {
          // Fallback: try to find any valid prompt
          const validPrompt = pools.artPool.find(p => p?.prompt);
          if (!validPrompt) {
            throw new Error(`No valid art prompts in pool for ${village} art quest`);
          }
          let finalPrompt = validPrompt.prompt;
          if (validPrompt.needsVillage) {
            finalPrompt = finalPrompt.replace('{village}', village);
          }
          return {
            prompt: finalPrompt,
            requirement: validPrompt.requirement || 'Sketch',
            context: validPrompt.context || 'general',
            amount: 1
          };
        }
        
        let finalPrompt = artPrompt.prompt;
        
        // Replace {village} placeholder with actual village name
        if (artPrompt.needsVillage) {
          finalPrompt = finalPrompt.replace('{village}', village);
        }
        
        return {
          prompt: finalPrompt,
          requirement: artPrompt.requirement,
          context: artPrompt.context,
          amount: 1
        };
      } catch (error) {
        logger.error('QUEST', `Error generating art quest requirements for ${village}`, error);
        throw new Error(`Failed to generate art quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'writing': {
      // Validate writing pool
      if (!pools.writingPool || !Array.isArray(pools.writingPool) || pools.writingPool.length === 0) {
        logger.error('QUEST', `Empty or invalid writingPool for ${village} writing quest`);
        throw new Error(`No writing prompts available for ${village} writing quest`);
      }
      
      try {
        const writingPrompt = getRandomElement(pools.writingPool);
        if (!writingPrompt || !writingPrompt.prompt) {
          // Fallback: try to find any valid prompt
          const validPrompt = pools.writingPool.find(p => p?.prompt);
          if (!validPrompt) {
            throw new Error(`No valid writing prompts in pool for ${village} writing quest`);
          }
          let finalPrompt = validPrompt.prompt;
          if (validPrompt.needsVillage) {
            finalPrompt = finalPrompt.replace('{village}', village);
          }
          return {
            prompt: finalPrompt,
            requirement: '500+ words',
            context: validPrompt.context || 'general',
            amount: 1
          };
        }
        
        let finalPrompt = writingPrompt.prompt;
        
        // Replace {village} placeholder with actual village name
        if (writingPrompt.needsVillage) {
          finalPrompt = finalPrompt.replace('{village}', village);
        }
        
        return { 
          prompt: finalPrompt, 
          requirement: '500+ words',
          context: writingPrompt.context,
          amount: 1 
        };
      } catch (error) {
        logger.error('QUEST', `Error generating writing quest requirements for ${village}`, error);
        throw new Error(`Failed to generate writing quest requirements for ${village}: ${error.message}`);
      }
    }
    
    case 'character-guess': {
      try {
        const clueType = Math.random() < 0.5 ? 'snippets' : 'icon-zoom';
        const snippetPool = pools.characterGuessSnippetPoolByVillage?.[village] || [];
        const iconPool = pools.characterGuessIconPoolByVillage?.[village] || [];
        if (clueType === 'snippets') {
          if (!snippetPool.length) throw new Error(`No characters for snippet character-guess in ${village}`);
          const selectedCharacter = getRandomElement(snippetPool);
          const snippetCount = Math.floor(Math.random() * 3) + 2; // 2-4
          const snippets = extractSnippetsFromCharacter(selectedCharacter, snippetCount);
          if (!snippets.length) throw new Error(`Failed to extract snippets for ${selectedCharacter.name}`);
          return {
            characterId: selectedCharacter._id.toString(),
            characterName: selectedCharacter.name,
            clueType: 'snippets',
            snippets,
            snippetCount: snippets.length
          };
        }
        if (!iconPool.length) throw new Error(`No characters for icon-zoom character-guess in ${village}`);
        const selectedCharacter = getRandomElement(iconPool);
        const questIdForPath = optionalQuestId || `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const zoomedIconUrl = await generateZoomedIconUrl(selectedCharacter.icon, questIdForPath);
        if (!zoomedIconUrl) throw new Error(`Failed to generate zoomed icon for ${selectedCharacter.name}`);
        return {
          characterId: selectedCharacter._id.toString(),
          characterName: selectedCharacter.name,
          clueType: 'icon-zoom',
          iconUrl: selectedCharacter.icon,
          zoomedIconUrl
        };
      } catch (error) {
        logger.error('QUEST', `Error generating character-guess quest for ${village}`, error);
        throw new Error(`Failed to generate character-guess quest for ${village}: ${error.message}`);
      }
    }
    
    default:
      logger.error('QUEST', `Unknown quest type: ${type} for ${village}`);
      throw new Error(`Unknown quest type: ${type} for ${village}`);
  }
}

// ------------------- Function: generateQuestForVillage -------------------
// Generates a random quest object for a given village and date with fallback handling
async function generateQuestForVillage(village, date, pools, availableNPCs = null, isAfterNoon = false, travelBlocked = false) {
  // Validate pools with better error messages
  const requiredPools = ['itemPool', 'monsterPool', 'craftingPool', 'escortPool', 'villageShopPool', 'artPool', 'writingPool'];
  const missingPools = [];
  for (const poolName of requiredPools) {
    if (!pools[poolName] || pools[poolName].length === 0) {
      missingPools.push(poolName);
    }
  }
  
  if (missingPools.length > 0) {
    logger.error('QUEST', `Missing or empty pools for ${village}: ${missingPools.join(', ')}`);
    throw new Error(`Missing or empty pools for ${village}: ${missingPools.join(', ')}`);
  }

  const questId = generateUniqueId('X');
  
  if (!questId) {
    logger.error('QUEST', `Failed to generate questId for ${village} quest`);
    throw new Error(`Failed to generate questId for ${village} quest`);
  }
  
  // Use provided NPC pool or fall back to all NPCs
  let npcPool = availableNPCs;
  if (!npcPool || npcPool.length === 0) {
    logger.warn('QUEST', `NPC pool exhausted for ${village}, falling back to all NPCs`);
    npcPool = Object.keys(NPCs);
  }
  
  if (!npcPool || npcPool.length === 0) {
    logger.error('QUEST', `No NPCs available for ${village} quest generation`);
    throw new Error(`No NPCs available for ${village} quest generation`);
  }
  
  let npcName;
  try {
    npcName = getRandomNPCNameFromPool(npcPool);
  } catch (error) {
    logger.error('QUEST', `Failed to get NPC name for ${village}`, error);
    // Fallback to first available NPC
    npcName = npcPool[0] || Object.keys(NPCs)[0];
    if (!npcName) {
      throw new Error(`No NPCs available for ${village} quest generation`);
    }
  }
  
  // ------------------- Special Walton Quest Logic -------------------
  // Walton has a 30% chance to request 50x acorns specifically
  if (npcName === 'Walton' && Math.random() < 0.30) {
    // Validate item pool has Acorn before returning
    try {
      const acornItem = pools.itemPool.find(item => item?.itemName === 'Acorn');
      if (!acornItem) {
        logger.warn('QUEST', `Acorn not found in item pool for ${village} Walton quest, generating normal quest instead`);
      } else {
        return {
          questId,
          village,
          date,
          type: 'item',
          npcName: 'Walton',
          requirements: {
            item: 'Acorn',
            amount: 50
          },
          completed: false,
          completedBy: null
        };
      }
    } catch (error) {
      logger.warn('QUEST', `Error checking for Acorn in ${village} Walton quest, generating normal quest instead`, error);
    }
  }
  
  // ------------------- Special Peddler Quest Logic -------------------
  // Peddler ONLY asks for item quests from village shops with 1 item amount
  if (npcName === 'Peddler') {
    try {
      if (!pools.villageShopPool || pools.villageShopPool.length === 0) {
        logger.warn('QUEST', `No village shop items for ${village} Peddler quest, generating normal quest instead`);
      } else {
        const shopItem = getRandomElement(pools.villageShopPool);
        if (shopItem?.itemName && shopItem?.stock) {
          return {
            questId,
            village,
            date,
            type: 'item',
            npcName: 'Peddler',
            requirements: {
              item: shopItem.itemName,
              amount: 1 // Only ask for 1 item from shop
            },
            completed: false,
            completedBy: null
          };
        } else {
          logger.warn('QUEST', `Invalid village shop item selected for ${village} Peddler quest, generating normal quest instead`);
        }
      }
    } catch (error) {
      logger.warn('QUEST', `Error generating Peddler quest for ${village}, generating normal quest instead`, error);
    }
  }
  
  // ------------------- Normal Quest Generation -------------------
  // Get available quest types using helper function
  const availableTypes = getAvailableQuestTypes(isAfterNoon, travelBlocked);
  
  if (availableTypes.length === 0) {
    logger.error('QUEST', `No available quest types for ${village} (isAfterNoon: ${isAfterNoon}, travelBlocked: ${travelBlocked})`);
    throw new Error(`No available quest types for ${village} quest generation`);
  }
  
  // Try to generate quest with fallback to other types if one fails
  let lastError = null;
  const triedTypes = [];
  
  // Shuffle available types to try different ones first
  const shuffledTypes = shuffleArray([...availableTypes]);
  
  for (const type of shuffledTypes) {
    triedTypes.push(type);
    try {
      const requirements = await generateQuestRequirements(type, pools, village, questId);
      
      return {
        questId,
        village,
        date,
        type,
        npcName,
        requirements,
        completed: false,
        completedBy: null
      };
    } catch (error) {
      lastError = error;
      logger.warn('QUEST', `Failed to generate ${type} quest for ${village}, trying next type`, error);
      // Continue to next type
    }
  }
  
  // All types failed
  logger.error('QUEST', `Failed to generate quest for ${village} after trying all types: ${triedTypes.join(', ')}`, lastError);
  throw new Error(`Failed to generate quest for ${village} after trying types: ${triedTypes.join(', ')}. Last error: ${lastError?.message || 'Unknown error'}`);
}



// Generates and saves daily quests for all villages
async function generateDailyQuests() {
  const startTime = Date.now();
  const errors = [];
  const warnings = [];
  
  try {
    const now = new Date();
    // Get UTC date string (YYYY-MM-DD format)
    const date = getUTCDateString(now);
    
    // Validate UTC date format
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      logger.error('QUEST', `Invalid date format: ${date}`);
      throw new Error(`Invalid date format: ${date}`);
    }
    
    // Check if it's after 12pm UTC - if so, don't generate art/writing quests
    const utcHour = getHourInUTC(now);
    const isAfterNoon = utcHour >= 12;
    
    // Validate UTC hour is a number
    if (isNaN(utcHour) || utcHour < 0 || utcHour > 23) {
      logger.error('QUEST', `Invalid UTC hour: ${utcHour}`);
      throw new Error(`Invalid UTC hour: ${utcHour}`);
    }
    
    logger.info('QUEST', `Time check - Current UTC hour: ${utcHour}, isAfterNoon: ${isAfterNoon}`);
    
    if (isAfterNoon) {
      logger.info('QUEST', `After 12pm UTC (${utcHour}:00) - Art and Writing quests will not be generated to ensure adequate completion time`);
    } else {
      logger.info('QUEST', `Before 12pm UTC (${utcHour}:00) - All quest types including art and writing are available`);
    }

    // Fetch village levels from database
    const villageLevelMap = new Map();
    let totalQuestsNeeded = 0;
    try {
      const villages = await Village.find({ name: { $in: VILLAGES } });
      for (const village of villages) {
        const level = village.level || 1; // Default to level 1 if not set
        villageLevelMap.set(village.name, level);
        // Calculate quests per village: Level 1 = 1, Level 2 = 2, Level 3 = 3
        const questsPerVillage = level;
        totalQuestsNeeded += questsPerVillage;
        logger.info('QUEST', `🏘️ Village ${village.name} is level ${level} → will generate ${questsPerVillage} quest(s) per day (Level 1=1, Level 2=2, Level 3=3)`);
      }
      // Handle villages not found in database (default to level 1)
      for (const villageName of VILLAGES) {
        if (!villageLevelMap.has(villageName)) {
          villageLevelMap.set(villageName, 1);
          totalQuestsNeeded += 1;
          logger.warn('QUEST', `Village ${villageName} not found in database, defaulting to level 1 (1 quest)`);
        }
      }
      logger.info('QUEST', `🏘️ Total quests needed: ${totalQuestsNeeded} (based on village levels: Level 1=1/day, Level 2=2/day, Level 3=3/day)`);
    } catch (error) {
      logger.error('QUEST', 'Failed to fetch village levels', error);
      // Default to 1 quest per village if fetch fails
      for (const villageName of VILLAGES) {
        villageLevelMap.set(villageName, 1);
        totalQuestsNeeded += 1;
      }
      warnings.push('Failed to fetch village levels, defaulting to 1 quest per village');
    }

    // Clean up existing documents with null questId
    try {
      await HelpWantedQuest.deleteMany({ questId: null });
    } catch (error) {
      logger.warn('QUEST', `Error cleaning up quests with null questId`, error);
      warnings.push('Failed to clean up null questIds');
    }
    
        // Clean up any art or writing quests that were generated after 12pm UTC
    if (isAfterNoon) {
      try {
        const deletedArtWriting = await HelpWantedQuest.deleteMany({ 
          date: date, 
          type: { $in: ['art', 'writing'] } 
        });
        if (deletedArtWriting.deletedCount > 0) {
          logger.info('QUEST', `Cleaned up ${deletedArtWriting.deletedCount} art/writing quest(s) that were generated after 12pm UTC`);
        }
      } catch (error) {
        logger.warn('QUEST', `Error cleaning up art/writing quests`, error);
        warnings.push('Failed to clean up art/writing quests');
      }
    }

    // Check weather for all villages upfront (use cached version)
    const weatherCache = new Map();
    const travelBlockedMap = new Map();
    
    logger.info('QUEST', 'Checking weather for all villages...');
    for (const village of VILLAGES) {
      try {
        const travelBlocked = await isTravelBlockedByWeatherCached(village, weatherCache);
        travelBlockedMap.set(village, travelBlocked);
        if (travelBlocked) {
          logger.info('QUEST', `Travel blocked in ${village} - escort quests will be excluded`);
        }
      } catch (error) {
        logger.warn('QUEST', `Weather check failed for ${village}, defaulting to allowing travel`, error);
        travelBlockedMap.set(village, false); // Default to allowing travel
        warnings.push(`Weather check failed for ${village}`);
      }
    }

    // Get quest pools
    let pools;
    try {
      pools = await getAllQuestPools();
    } catch (error) {
      logger.error('QUEST', 'Failed to get quest pools', error);
      throw new Error(`Failed to get quest pools: ${error.message}`);
    }

    // Create a shared pool of available NPCs to ensure uniqueness across all quests
    const allNPCs = Object.keys(NPCs);
    if (allNPCs.length === 0) {
      logger.error('QUEST', 'No NPCs available');
      throw new Error('No NPCs available for quest generation');
    }
    
    // NPC pool handling - allow reuse if needed but log it
    if (allNPCs.length < totalQuestsNeeded) {
      logger.warn('QUEST', `Not enough NPCs (${allNPCs.length}) for ${totalQuestsNeeded} quests. NPCs will be reused.`);
      warnings.push(`NPCs will be reused (${allNPCs.length} NPCs for ${totalQuestsNeeded} quests)`);
    }
    
    const availableNPCs = shuffleArray([...allNPCs]); // Shuffle for randomness
    const npcUsageCount = new Map(); // Track NPC usage
    const npcUsageByVillage = new Map(); // Track NPC usage per village to allow reuse within village
    
    // Randomize village order instead of always having Rudania first
    const shuffledVillages = shuffleArray([...VILLAGES]);
    
    // Generate quest posting times with variable buffer (3-6 hours) between each
    // For art/writing quests, only use times before 12pm EST
    let availableTimes = FIXED_CRON_TIMES;
    if (isAfterNoon) {
      // If generating after 12pm UTC, only use times before 12pm UTC for any remaining art/writing quests
      availableTimes = FIXED_CRON_TIMES.filter(cronTime => cronToHour(cronTime) < 12);
    }
    
    // Exclude midnight so Help Wanted never posts at midnight in any relevant timezone:
    // - 00:00 UTC (midnight UTC)
    // - 05:00 UTC = midnight EST (daily rollover; generation runs then)
    const excludedHours = [0, 5];
    availableTimes = availableTimes.filter(cronTime => !excludedHours.includes(cronToHour(cronTime)));
    
    const selectedTimes = selectTimesWithVariableBuffer(availableTimes, totalQuestsNeeded);
    
    // Validate that we have enough times for all quests
    if (selectedTimes.length !== totalQuestsNeeded) {
      const errorMsg = `Time selection failed: expected ${totalQuestsNeeded} times but got ${selectedTimes.length}. Cannot generate all quests.`;
      logger.error('QUEST', errorMsg);
      throw new Error(errorMsg);
    }
    
    // Validate that all selected times are defined
    const undefinedTimes = selectedTimes.filter((time, index) => !time);
    if (undefinedTimes.length > 0) {
      const errorMsg = `Time selection returned ${undefinedTimes.length} undefined time(s). Cannot generate all quests.`;
      logger.error('QUEST', errorMsg);
      throw new Error(errorMsg);
    }
    
    logger.info('QUEST', `Successfully selected ${selectedTimes.length} posting times for ${totalQuestsNeeded} quest(s) across ${VILLAGES.length} villages`);
    
    let quests = []; // Use let to allow filtering/reassignment during validation
    const failedVillages = [];
    let questIndex = 0; // Track overall quest index for time assignment
    
    // Generate quests sequentially - multiple quests per village based on level
    for (let i = 0; i < shuffledVillages.length; i++) {
      const village = shuffledVillages[i];
      const villageLevel = villageLevelMap.get(village) || 1;
      const questsForThisVillage = villageLevel; // Level 1 = 1, Level 2 = 2, Level 3 = 3
      const travelBlocked = travelBlockedMap.get(village) || false;
      logger.info('QUEST', `🏘️ Generating ${questsForThisVillage} quest(s) for ${village} (Level ${villageLevel})`);
      
      // Track NPCs used in this village to allow reuse within village
      const villageNPCs = new Set();
      
      // Generate N quests for this village
      for (let j = 0; j < questsForThisVillage; j++) {
        try {
          // Generate quest with travel blocking info
          const quest = await generateQuestForVillage(village, date, pools, availableNPCs, isAfterNoon, travelBlocked);
          
          // Track NPC usage globally and per village
          const currentCount = npcUsageCount.get(quest.npcName) || 0;
          npcUsageCount.set(quest.npcName, currentCount + 1);
          
          const villageNPCCount = villageNPCs.has(quest.npcName) ? 1 : 0;
          if (villageNPCCount > 0) {
            logger.debug('QUEST', `NPC ${quest.npcName} reused within ${village} (quest ${j + 1}/${questsForThisVillage})`);
          } else if (currentCount > 0) {
            logger.debug('QUEST', `NPC ${quest.npcName} reused across villages (${currentCount + 1} times total)`);
          }
          villageNPCs.add(quest.npcName);
          
          // Remove the used NPC from the available pool only if we have enough NPCs left
          // Allow reuse within the same village, but try to keep unique across villages
          const npcIndex = availableNPCs.indexOf(quest.npcName);
          const remainingQuests = totalQuestsNeeded - questIndex - 1;
          if (npcIndex !== -1 && availableNPCs.length > remainingQuests && !villageNPCs.has(quest.npcName)) {
            // Only remove if we still have enough NPCs left and NPC hasn't been used in this village
            availableNPCs.splice(npcIndex, 1);
          }
          
          // Assign a posting time with variable buffer from the selected times
          const assignedTime = selectedTimes[questIndex];
          if (!assignedTime) {
            const errorMsg = `No posting time available for village ${village} quest ${j + 1} at index ${questIndex}. This should not happen after validation.`;
            logger.error('QUEST', errorMsg);
            errors.push(errorMsg);
            if (!failedVillages.includes(village)) {
              failedVillages.push(village);
            }
            questIndex++; // Still increment to maintain time slot alignment
            continue; // Continue with next quest
          }
          
          quest.scheduledPostTime = assignedTime;
          const hour = cronToHour(quest.scheduledPostTime);
          logger.info('QUEST', `🏘️ Generated ${quest.type} quest ${j + 1}/${questsForThisVillage} for ${village} (Level ${villageLevel}) with NPC ${quest.npcName} at posting time: ${formatHour(hour)} (${quest.scheduledPostTime})`);
          quests.push(quest);
          questIndex++;
          
        } catch (error) {
          logger.error('QUEST', `Failed to generate quest ${j + 1}/${questsForThisVillage} for ${village}`, error);
          errors.push(`Failed to generate quest ${j + 1}/${questsForThisVillage} for ${village}: ${error.message}`);
          if (!failedVillages.includes(village)) {
            failedVillages.push(village);
          }
          questIndex++; // Still increment to maintain time slot alignment
          
          // Retry once for failed quests
          try {
            logger.info('QUEST', `Retrying quest generation ${j + 1}/${questsForThisVillage} for ${village}...`);
            const retryQuest = await generateQuestForVillage(village, date, pools, availableNPCs, isAfterNoon, travelBlocked);
            const assignedTime = selectedTimes[questIndex - 1]; // Use the time slot we reserved
            if (assignedTime) {
              retryQuest.scheduledPostTime = assignedTime;
              const hour = cronToHour(retryQuest.scheduledPostTime);
              logger.success('QUEST', `Successfully generated ${retryQuest.type} quest ${j + 1}/${questsForThisVillage} for ${village} on retry`);
              quests.push(retryQuest);
              // Remove from failed list if all quests for this village are now successful
              // (We'll check this after the loop)
            }
          } catch (retryError) {
            logger.error('QUEST', `Retry failed for ${village} quest ${j + 1}/${questsForThisVillage}`, retryError);
            // Leave in failed list
          }
        }
      }
    }
    
    // Report on failed villages
    if (failedVillages.length > 0) {
      logger.error('QUEST', `Failed to generate quests for ${failedVillages.length} village(s): ${failedVillages.join(', ')}`);
    }
    
    if (quests.length === 0) {
      throw new Error(`Failed to generate any quests. Errors: ${errors.join('; ')}`);
    }
    
    // Final validation: ensure all quests have valid scheduledPostTime before saving
    const questsWithoutTime = quests.filter(q => !q.scheduledPostTime);
    if (questsWithoutTime.length > 0) {
      const villagesWithoutTime = questsWithoutTime.map(q => q.village).join(', ');
      logger.error('QUEST', `Validation failed: ${questsWithoutTime.length} quest(s) missing scheduledPostTime for village(s): ${villagesWithoutTime}`);
      // Remove quests without time instead of throwing
      quests = quests.filter(q => q.scheduledPostTime);
      if (quests.length === 0) {
        throw new Error(`All quests missing scheduledPostTime`);
      }
    }
    
    // Validate that all quests have distinct scheduledPostTimes (no two quests post at the same time)
    const scheduledTimes = quests.map(q => q.scheduledPostTime);
    const uniqueTimes = new Set(scheduledTimes);
    if (scheduledTimes.length !== uniqueTimes.size) {
      const duplicateTimes = scheduledTimes.filter((time, index) => scheduledTimes.indexOf(time) !== index);
      const duplicateQuests = quests.filter(q => duplicateTimes.includes(q.scheduledPostTime));
      const duplicateDetails = duplicateQuests.map(q => `${q.questId} (${q.village})`).join(', ');
      logger.error('QUEST', `Validation failed: Found ${scheduledTimes.length - uniqueTimes.size} duplicate scheduledPostTime(s). Duplicate times: ${[...new Set(duplicateTimes)].join(', ')}. Affected quests: ${duplicateDetails}`);
      throw new Error(`Multiple quests have the same scheduledPostTime. This should not happen.`);
    }

    // Validate quest objects before saving
    const invalidQuestIds = [];
    for (const quest of quests) {
      if (!quest.questId || !quest.village || !quest.date || !quest.type || !quest.npcName || !quest.requirements) {
        invalidQuestIds.push(quest.questId || 'unknown');
        logger.error('QUEST', `Invalid quest object for ${quest.village} (${quest.questId || 'no questId'}): missing required fields`);
      }
    }
    
    if (invalidQuestIds.length > 0) {
      logger.error('QUEST', `Invalid quest objects for ${invalidQuestIds.length} quest(s): ${invalidQuestIds.join(', ')}`);
      quests = quests.filter(q => q.questId && !invalidQuestIds.includes(q.questId));
    }

    // Save quests with retry logic
    // Use questId as unique identifier to support multiple quests per village/date
    const results = [];
    const saveErrors = [];
    
    for (const quest of quests) {
      let saved = false;
      for (let saveAttempt = 1; saveAttempt <= 3; saveAttempt++) {
        try {
          const updated = await HelpWantedQuest.findOneAndUpdate(
            { questId: quest.questId },
            quest,
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          
          if (!updated) {
            throw new Error('Save returned null');
          }
          
          results.push(updated);
          saved = true;
          break;
        } catch (saveError) {
          if (saveAttempt === 3) {
            logger.error('QUEST', `Failed to save quest ${quest.questId} for ${quest.village} after 3 attempts`, saveError);
            saveErrors.push(`${quest.village} (${quest.questId}): ${saveError.message}`);
          } else {
            logger.warn('QUEST', `Save attempt ${saveAttempt}/3 failed for ${quest.village} quest ${quest.questId}`, saveError);
            await new Promise(resolve => setTimeout(resolve, 100 * saveAttempt)); // Exponential backoff
          }
        }
      }
      
      if (!saved) {
        errors.push(`Failed to save quest ${quest.questId} for ${quest.village}`);
      }
    }
    
    if (results.length === 0) {
      throw new Error(`Failed to save any quests. Save errors: ${saveErrors.join('; ')}`);
    }
    
    // Log quest counts per village
    const questCountsByVillage = new Map();
    for (const quest of results) {
      const count = questCountsByVillage.get(quest.village) || 0;
      questCountsByVillage.set(quest.village, count + 1);
    }
    const villageQuestSummary = Array.from(questCountsByVillage.entries())
      .map(([village, count]) => {
        const level = villageLevelMap.get(village) || 1;
        return `${village} (level ${level}): ${count} quest(s)`;
      })
      .join(', ');
    logger.info('QUEST', `Quest generation summary for ${date}: ${villageQuestSummary}`);
    
    // Log the final schedule for the day with detailed information
    const scheduleDetails = results.map(quest => {
      const hour = cronToHour(quest.scheduledPostTime);
      if (!quest.scheduledPostTime) {
        logger.error('QUEST', `CRITICAL: Quest ${quest.questId} for ${quest.village} has no scheduledPostTime after generation!`);
        return `${quest.village}: ${quest.npcName} (${quest.questId}) - MISSING POST TIME`;
      }
      return `${quest.village}: ${quest.npcName} (${quest.type}) at ${formatHour(hour)} (${quest.scheduledPostTime})`;
    }).join(', ');
    logger.info('QUEST', `Daily quest schedule for ${date}: ${scheduleDetails}`);
    
    // Final validation log
    const allHaveTimes = results.every(quest => quest.scheduledPostTime && quest.questId && quest.type);
    if (!allHaveTimes) {
      const missingFields = results.filter(quest => !quest.scheduledPostTime || !quest.questId || !quest.type);
      logger.error('QUEST', `CRITICAL: ${missingFields.length} quest(s) missing required fields: ${missingFields.map(q => `${q.village} (${q.questId})`).join(', ')}`);
    } else {
      logger.success('QUEST', `All ${results.length} quest(s) have valid required fields for ${date}`);
    }
    
    // Attempt to regenerate missing quests if validation failed
    if (failedVillages.length > 0 && results.length < totalQuestsNeeded) {
      logger.info('QUEST', `Attempting to regenerate quests for failed villages: ${failedVillages.join(', ')}`);
      // Could add retry logic here, but for now just log
    }
    
    // Log warnings if any
    if (warnings.length > 0) {
      logger.warn('QUEST', `Warnings during quest generation: ${warnings.join('; ')}`);
    }
    
    const duration = Date.now() - startTime;
    logger.info('QUEST', `Quest generation completed in ${duration}ms. Generated ${results.length}/${totalQuestsNeeded} quest(s) successfully across ${VILLAGES.length} villages.`);
    
    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('QUEST', `Error generating daily quests (took ${duration}ms)`, error);
    throw error;
  }
}

// ============================================================================
// ------------------- Time Selection with Variable Buffer -------------------
// ============================================================================

// ------------------- Function: selectTimesWithVariableBuffer -------------------
// Selects times from FIXED_CRON_TIMES ensuring variable buffer (3-6 hours) between each
function selectTimesWithVariableBuffer(availableTimes, count) {
  if (!availableTimes || availableTimes.length === 0) {
    throw new Error(`No available times provided for time selection`);
  }
  
  if (count <= 0) {
    throw new Error(`Invalid count (${count}) for time selection`);
  }
  
  if (availableTimes.length < count) {
    logger.warn('QUEST', `Warning: Only ${availableTimes.length} available times for ${count} requested times. Some villages may not get optimal spacing.`);
  }

  // Convert cron times to time slots with hour information
  const timeSlots = availableTimes.map(cronTime => ({
    cron: cronTime,
    hour: cronToHour(cronTime)
  }));

  const selected = [];
  const shuffled = shuffleArray([...timeSlots]); // Start with random order
  const minBuffer = 3; // Minimum 3 hours between quests
  const maxBuffer = 6; // Maximum 6 hours between quests

  // Try variable buffer approach: assign a consistent buffer to each selected time
  for (const timeSlot of shuffled) {
    // Check if this time slot is compatible with all already selected times
    // Use a consistent buffer check: each selected time maintains at least minBuffer hours from others
    const isCompatible = selected.every(selectedTime => 
      isHoursApart(timeSlot.hour, selectedTime.hour, minBuffer)
    );

    if (isCompatible) {
      selected.push(timeSlot);
      if (selected.length === count) {
        break;
      }
    }
  }

  // If we couldn't find enough compatible times, fall back to fixed 3-hour buffer
  if (selected.length < count) {
    logger.warn('QUEST', `Could only find ${selected.length} times with variable buffer, falling back to 3-hour minimum`);
    selected.length = 0; // Reset and try again with fixed buffer
    
    for (const timeSlot of shuffled) {
      const isCompatible = selected.every(selectedTime => 
        isHoursApart(timeSlot.hour, selectedTime.hour, 3)
      );

      if (isCompatible) {
        selected.push(timeSlot);
        if (selected.length === count) {
          break;
        }
      }
    }
  }

  // Final fallback: if still not enough, just take the first N times (ensures we always return count times)
  if (selected.length < count) {
    logger.warn('QUEST', `Could only find ${selected.length} times with 3-hour buffer, using final fallback to ensure all villages get posting times`);
    selected.length = 0;
    
    // Sort by hour and take evenly spaced times, ensuring unique hours
    const sortedByHour = [...timeSlots].sort((a, b) => a.hour - b.hour);
    const step = Math.floor(sortedByHour.length / count);
    
    // Track used hours to prevent duplicates
    const usedHours = new Set();
    
    for (let i = 0; i < count && i < sortedByHour.length; i++) {
      const index = Math.min(i * step, sortedByHour.length - 1);
      const timeSlot = sortedByHour[index];
      // Only add if this hour hasn't been used yet
      if (!usedHours.has(timeSlot.hour)) {
        selected.push(timeSlot);
        usedHours.add(timeSlot.hour);
      }
    }
    
    // If still not enough, fill from remaining unused hours
    if (selected.length < count) {
      for (let i = 0; i < sortedByHour.length && selected.length < count; i++) {
        const timeSlot = sortedByHour[i];
        if (!usedHours.has(timeSlot.hour)) {
          selected.push(timeSlot);
          usedHours.add(timeSlot.hour);
        }
      }
    }
  }

  // Final validation: ensure we have exactly count times
  if (selected.length < count) {
    const errorMsg = `Failed to select ${count} times: only found ${selected.length} compatible times out of ${availableTimes.length} available. This should not happen.`;
    logger.error('QUEST', errorMsg);
    throw new Error(errorMsg);
  }

  // Sort selected times by hour for better scheduling
  selected.sort((a, b) => a.hour - b.hour);
  
  // Uniqueness pass: ensure all selected times have distinct hours
  // Dedupe by hour (keep first occurrence of each hour)
  const uniqueSelected = [];
  const seenHours = new Set();
  for (const timeSlot of selected) {
    if (!seenHours.has(timeSlot.hour)) {
      uniqueSelected.push(timeSlot);
      seenHours.add(timeSlot.hour);
    }
  }
  
  // If we lost some times due to deduplication, fill from unused hours
  if (uniqueSelected.length < count) {
    const allHours = new Set(timeSlots.map(ts => ts.hour));
    const unusedHours = [...allHours].filter(h => !seenHours.has(h));
    const unusedTimeSlots = timeSlots.filter(ts => unusedHours.includes(ts.hour));
    
    for (const timeSlot of unusedTimeSlots) {
      if (uniqueSelected.length >= count) break;
      if (!seenHours.has(timeSlot.hour)) {
        uniqueSelected.push(timeSlot);
        seenHours.add(timeSlot.hour);
      }
    }
  }
  
  // Final check: if we still don't have enough distinct times, throw an error
  if (uniqueSelected.length < count) {
    const errorMsg = `Failed to select ${count} distinct times: only found ${uniqueSelected.length} unique hours out of ${availableTimes.length} available. This should not happen.`;
    logger.error('QUEST', errorMsg);
    throw new Error(errorMsg);
  }
  
  // Sort again after deduplication/filling
  uniqueSelected.sort((a, b) => a.hour - b.hour);
  
  // Log the selected times in a readable format
  const timeDisplay = uniqueSelected.map(t => formatHour(t.hour)).join(', ');
  logger.info('QUEST', `Selected ${uniqueSelected.length} distinct times with variable buffer (3-6 hours): ${timeDisplay}`);
  
  return uniqueSelected.map(timeSlot => timeSlot.cron);
}

// ============================================================================
// ------------------- Legacy Time Selection with Buffer (kept for compatibility) -------------------
// ============================================================================

// ------------------- Function: selectTimesWithBuffer -------------------
// Selects times from FIXED_CRON_TIMES ensuring at least 6-hour buffer between each (legacy function)
function selectTimesWithBuffer(availableTimes, count) {
  // Convert cron times to time slots with hour information
  const timeSlots = availableTimes.map(cronTime => ({
    cron: cronTime,
    hour: cronToHour(cronTime)
  }));

  const selected = [];
  const shuffled = shuffleArray([...timeSlots]); // Start with random order

  for (const timeSlot of shuffled) {
    // Check if this time slot is compatible with all already selected times
    const isCompatible = selected.every(selectedTime => 
      isHoursApart(timeSlot.hour, selectedTime.hour, 6) // Changed from 4 to 6
    );

    if (isCompatible) {
      selected.push(timeSlot);
      if (selected.length === count) {
        break;
      }
    }
  }

  // If we couldn't find enough compatible times, log a warning
  if (selected.length < count) {
    logger.warn('QUEST', `Could only find ${selected.length} times with 6-hour buffer out of ${availableTimes.length} available times`);
  }

  // Sort selected times by hour for better scheduling
  selected.sort((a, b) => a.hour - b.hour);
  
  // Log the selected times in a readable format
  const timeDisplay = selected.map(t => formatHour(t.hour)).join(', ');
  logger.info('QUEST', `Selected times with 6-hour buffer: ${timeDisplay}`);
  
  return selected.map(timeSlot => timeSlot.cron);
}

// ============================================================================
// ------------------- Quest Retrieval -------------------
// ============================================================================

// ------------------- Function: isQuestExpired -------------------
// Checks if a quest is expired (not from today)
function isQuestExpired(quest) {
  const now = new Date();
  const today = getUTCDateString(now);
  return quest.date !== today;
}

// ------------------- Function: getTodaysQuests -------------------
// Fetches all Help Wanted quests for today
async function getTodaysQuests() {
  try {
    const now = new Date();
    // Get EST date string (YYYY-MM-DD format)
    const date = getUTCDateString(now);
    const quests = await HelpWantedQuest.find({ date });
    
    // Ensure all quests have an npcName field
    for (const quest of quests) {
      if (!quest.npcName) {
        quest.npcName = getRandomNPCName();
        await quest.save();
      }
    }
    
    return quests;
  } catch (error) {
    logger.error('QUEST', 'Error fetching today\'s quests', error);
    throw error;
  }
}

// ------------------- Function: getQuestsForScheduledTime -------------------
// Fetches quests scheduled for a specific cron time
async function getQuestsForScheduledTime(cronTime) {
  try {
    const now = new Date();
    // Get EST date string (YYYY-MM-DD format)
    const date = getUTCDateString(now);
    return await HelpWantedQuest.find({ date, scheduledPostTime: cronTime });
  } catch (error) {
    logger.error('QUEST', 'Error fetching quests for scheduled time', error);
    throw error;
  }
}

// ------------------- Function: getCurrentQuestSchedule -------------------
// Gets the current quest schedule for debugging
async function getCurrentQuestSchedule() {
  try {
    const quests = await getTodaysQuests();
    const schedule = {};
    
    quests.forEach(quest => {
      const timeParts = quest.scheduledPostTime.split(' ');
      const hour = parseInt(timeParts[1]);
      const minute = parseInt(timeParts[0]);
      const timeString = `${hour}:${minute.toString().padStart(2, '0')}`;
      schedule[quest.village] = {
        time: timeString,
        cronTime: quest.scheduledPostTime,
        posted: !!quest.messageId,
        questId: quest.questId
      };
    });
    
    return schedule;
  } catch (error) {
    logger.error('QUEST', 'Error getting current quest schedule', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Embed Formatting -------------------
// ============================================================================

// ------------------- Function: getQuestTurnInInstructions -------------------
// Gets quest turn-in instructions based on quest type
function getQuestTurnInInstructions(type) {
  const instructions = {
    item: '• **Item Quest:** Gather the requested materials and bring them to the quest board. Use </helpwanted complete:1402779337270497370> when ready.',
    monster: '• **Monster Quest:** Hunt down the dangerous creatures threatening the village. Use </helpwanted monsterhunt:1402779337270497370> to complete this quest. **Costs 1 stamina per attempt.**',
    escort: '• **Escort Quest:** Safely guide the villager to their destination. Please travel from the quest village to the destination village using </travel:1379850586987430009>, then use </helpwanted complete:1402779337270497370>.',
    crafting: '• **Crafting Quest:** Create the requested item with your own hands. Craft the required item yourself, then use </helpwanted complete:1402779337270497370>.',
    art: '• **Art Quest:** Create the requested artwork and submit it using </submit art:1402779337270497370> with this quest ID. **Must be submitted before midnight (EST) today.** Once approved by a moderator, the quest will be automatically completed.',
    writing: '• **Writing Quest:** Write the requested content and submit it using </submit writing:1402779337270497370> with this quest ID. **Must be submitted before midnight (EST) today.** Once approved by a moderator, the quest will be automatically completed.',
    'character-guess': '• **Character Guess Quest:** Use </helpwanted guess:1402779337270497370> with the quest ID and your guess for the character name.'
  };
  
  return instructions[type] || '• Use </helpwanted complete:1402779337270497370> to turn in your quest.';
}

// ------------------- Function: formatQuestsAsEmbed -------------------
// Formats quests as a single embed
async function formatQuestsAsEmbed() {
  try {
    const quests = await getTodaysQuests();
    if (!quests.length) {
      return new EmbedBuilder()
        .setTitle('🌿 Help Wanted Board')
        .setDescription('No quests available today!');
    }

    const embed = new EmbedBuilder()
      .setTitle('🌿 Help Wanted Board')
      .setDescription('Daily quests for each village. First come, first served!')
      .setColor('#25c059');

    quests.forEach((quest) => {
      const npcName = quest.npcName || getRandomNPCName();
      const emoji = QUEST_TYPE_EMOJIS[quest.type] || '❓';
      
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      const formattedQuestLine = `${emoji} **[${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest]** ${questLine}`;
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';
        
      embed.addFields({
        name: `${quest.village} — ${npcName}`,
        value: `${formattedQuestLine}\n**Status:** ${status}\n**Type:** ${emoji} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest\n**Location:** ${quest.village}`
      });
    });

    embed.setFooter({ text: 'Only one quest per user per day. Natives only!' });
    return embed;
  } catch (error) {
    logger.error('QUEST', 'Error formatting quests as embed', error);
    throw error;
  }
}



// ------------------- Function: formatQuestsAsEmbedsByVillage -------------------
// Formats quests as separate embeds by village
async function formatQuestsAsEmbedsByVillage() {
  try {
    const quests = await getTodaysQuests();
    if (!quests.length) return {};
    
    const result = {};

    for (const quest of quests) {
      const npcName = quest.npcName || getRandomNPCName();
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';

      const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
      const image = VILLAGE_IMAGES[quest.village] || null;
      const divider = '<:br:788136157363306506>'.repeat(11);
      
      const questInfoFields = [
        { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
        { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
        { name: '__Location__', value: quest.village, inline: true }
      ];
      
      const embed = new EmbedBuilder()
        .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
        .setColor(color)
        .addFields(
          { name: 'Quest', value: `${questLine}\n${divider}` },
          ...questInfoFields
        );
      
      // Character-guess: add clue field and optionally set zoomed image
      if (quest.type === 'character-guess' && quest.requirements) {
        const { clueType, snippets, zoomedIconUrl } = quest.requirements;
        if (clueType === 'snippets' && snippets?.length) {
          const snippetText = snippets.map((snippet, index) => {
            const sourceLabel = snippet.source === 'personality' ? 'Personality' : 'History';
            return `**${sourceLabel} Clue ${index + 1}:**\n${snippet.text}`;
          }).join('\n\n');
          embed.addFields({ name: '🎭 Who is this person?', value: snippetText, inline: false });
        } else if (clueType === 'icon-zoom' && zoomedIconUrl) {
          embed.setImage(zoomedIconUrl);
          embed.addFields({ name: '🎭 Who is this person?', value: '*Guess from the zoomed-in picture above!*', inline: false });
        }
      }
      
      // Add character completion info if quest is completed
      if (quest.completed && quest.completedBy?.characterId) {
        try {
          const Character = require('@/models/CharacterModel');
          const character = await Character.findById(quest.completedBy.characterId);
          if (character) {
            embed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
            embed.addFields({
              name: '🏆 Completed By',
              value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
              inline: false
            });
          }
          if (quest.type === 'character-guess' && quest.requirements?.characterName) {
            embed.addFields({
              name: '🎭 Answer',
              value: `**${quest.requirements.characterName}**`,
              inline: true
            });
          }
        } catch (error) {
          logger.error('QUEST', 'Error fetching character for completed quest', error);
        }
      } else {
        // Add NPC icon as thumbnail for available quests
        try {
          const npcData = NPCs[npcName];
          if (npcData && npcData.icon) {
            embed.setThumbnail(npcData.icon);
          }
        } catch (error) {
          logger.error('QUEST', 'Error setting NPC thumbnail', error);
        }
        
        // Only add rules and how to complete for available quests
        const turnIn = getQuestTurnInInstructions(quest.type);
        const rules = '• Only natives of the village can complete this quest.\n' +
                     '• First come, first served—one completion per quest!\n' +
                     '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                     '• **All quests expire at midnight (EST) today!**\n' +
                     '• Complete quests to help your village prosper!';
        
        embed.addFields(
          { name: 'How to Complete', value: turnIn },
          { name: 'Rules', value: rules }
        );
      }
      
      embed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
      
      const imageToSet = (quest.type === 'character-guess' && quest.requirements?.clueType === 'icon-zoom' && quest.requirements?.zoomedIconUrl)
        ? quest.requirements.zoomedIconUrl
        : image;
      if (imageToSet) embed.setImage(imageToSet);
      result[quest.village] = embed;
    }
    
    return result;
  } catch (error) {
    logger.error('QUEST', 'Error formatting quests by village', error);
    throw error;
  }
}

// ------------------- Function: formatSpecificQuestsAsEmbedsByVillage -------------------
// Formats specific quests as separate embeds by village
async function formatSpecificQuestsAsEmbedsByVillage(quests) {
  try {
    if (!quests || !quests.length) return {};
    
    const result = {};

    for (const quest of quests) {
      const npcName = quest.npcName || getRandomNPCName();
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';

      const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
      const image = VILLAGE_IMAGES[quest.village] || null;
      const divider = '<:br:788136157363306506>'.repeat(11);
      
      const questInfoFields = [
        { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
        { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
        { name: '__Location__', value: quest.village, inline: true }
      ];
      
      const embed = new EmbedBuilder()
        .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
        .setColor(color)
        .addFields(
          { name: 'Quest', value: `${questLine}\n${divider}` },
          ...questInfoFields
        );
      
      // Character-guess: add clue field and optionally set zoomed image
      if (quest.type === 'character-guess' && quest.requirements) {
        const { clueType, snippets, zoomedIconUrl } = quest.requirements;
        if (clueType === 'snippets' && snippets?.length) {
          const snippetText = snippets.map((snippet, index) => {
            const sourceLabel = snippet.source === 'personality' ? 'Personality' : 'History';
            return `**${sourceLabel} Clue ${index + 1}:**\n${snippet.text}`;
          }).join('\n\n');
          embed.addFields({ name: '🎭 Who is this person?', value: snippetText, inline: false });
        } else if (clueType === 'icon-zoom' && zoomedIconUrl) {
          embed.setImage(zoomedIconUrl);
          embed.addFields({ name: '🎭 Who is this person?', value: '*Guess from the zoomed-in picture above!*', inline: false });
        }
      }
      
      // Add character completion info if quest is completed
      if (quest.completed && quest.completedBy?.characterId) {
        try {
          const Character = require('@/models/CharacterModel');
          const character = await Character.findById(quest.completedBy.characterId);
          if (character) {
            embed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
            embed.addFields({
              name: '🏆 Completed By',
              value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
              inline: false
            });
          }
          if (quest.type === 'character-guess' && quest.requirements?.characterName) {
            embed.addFields({
              name: '🎭 Answer',
              value: `**${quest.requirements.characterName}**`,
              inline: true
            });
          }
        } catch (error) {
          logger.error('QUEST', 'Error fetching character for completed quest', error);
        }
      } else {
        // Add NPC icon as thumbnail for available quests
        try {
          const npcData = NPCs[npcName];
          if (npcData && npcData.icon) {
            embed.setThumbnail(npcData.icon);
          }
        } catch (error) {
          logger.error('QUEST', 'Error setting NPC thumbnail', error);
        }
        
        // Only add rules and how to complete for available quests
        const turnIn = getQuestTurnInInstructions(quest.type);
        const rules = '• Only natives of the village can complete this quest.\n' +
                     '• First come, first served—one completion per quest!\n' +
                     '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                     '• **All quests expire at midnight (EST) today!**\n' +
                     '• Complete quests to help your village prosper!';
        
        embed.addFields(
          { name: 'How to Complete', value: turnIn },
          { name: 'Rules', value: rules }
        );
      }
      
      embed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
      
      const imageToSet = (quest.type === 'character-guess' && quest.requirements?.clueType === 'icon-zoom' && quest.requirements?.zoomedIconUrl)
        ? quest.requirements.zoomedIconUrl
        : image;
      if (imageToSet) embed.setImage(imageToSet);
      result[quest.village] = embed;
    }
    
    return result;
  } catch (error) {
    logger.error('QUEST', 'Error formatting specific quests by village', error);
    throw error;
  }
}

// ============================================================================
// ------------------- User Validation -------------------
// ============================================================================

// ------------------- Function: hasUserCompletedQuestToday -------------------
// Checks if a user has completed a quest today
async function hasUserCompletedQuestToday(userId) {
  try {
    const user = await require('@/models/UserModel').findOne({ discordId: userId });
    if (!user) {
      return false;
    }
    
    // Use EST date for midnight reset (matches completion storage)
    const now = new Date();
    const today = getESTDateString(now);
    const lastCompletion = user.helpWanted?.lastCompletion || 'null';
    
    return lastCompletion === today;
  } catch (error) {
    logger.error('QUEST', 'Error checking user quest completion', error);
    return false;
  }
}

// ------------------- Function: hasUserReachedWeeklyQuestLimit -------------------
// Checks if a user has reached the weekly quest limit
async function hasUserReachedWeeklyQuestLimit(userId) {
  try {
    const user = await require('@/models/UserModel').findOne({ discordId: userId });
    if (!user || !user.helpWanted.completions) return false;
    
    // Use EST-equivalent for weekly reset (UTC-5)
    const now = new Date();
    // EST is UTC-5, subtract 5 hours
    const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const startOfWeek = new Date(estNow.getUTCFullYear(), estNow.getUTCMonth(), estNow.getUTCDate());
    startOfWeek.setDate(estNow.getDate() - estNow.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weeklyCompletions = user.helpWanted.completions.filter(completion => {
      const completionDate = new Date(completion.date + 'T00:00:00-05:00'); // EST timezone
      return completionDate >= startOfWeek;
    });
    
    return weeklyCompletions.length >= 3;
  } catch (error) {
    logger.error('QUEST', 'Error checking weekly quest limit', error);
    return false;
  }
}

// ============================================================================
// ------------------- Quest Embed Updates -------------------
// ============================================================================

// ------------------- Function: updateQuestEmbed -------------------
// Updates the quest embed message to show completion status
async function updateQuestEmbed(client, quest, completedBy = null) {
  try {
    
    if (!quest.messageId) {
      return;
    }

    if (!quest.channelId) {
      logger.error('QUEST', `No channel ID found for quest ${quest.questId}`);
      return;
    }
    

    
    const channel = await client.channels.fetch(quest.channelId);
    if (!channel) {
      logger.error('QUEST', `Could not find channel ${quest.channelId} for quest ${quest.questId}`);
      return;
    }

    const message = await channel.messages.fetch(quest.messageId);
    if (!message) {
      logger.error('QUEST', `Could not find message ${quest.messageId}`);
      return;
    }

    const originalEmbed = message.embeds[0];
    if (!originalEmbed) {
      logger.error('QUEST', `No embed found in message ${quest.messageId}`);
      return;
    }

    // Create a new embed with the updated format
    const npcName = quest.npcName || getRandomNPCName();
    const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
    
    // Check if quest is expired
    const isExpired = isQuestExpired(quest);
    const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
    const image = VILLAGE_IMAGES[quest.village] || null;
    const divider = '<:br:788136157363306506>'.repeat(11);
    
    const questInfoFields = [
      { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
      { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
      { name: '__Location__', value: quest.village, inline: true }
    ];
    
    const updatedEmbed = new EmbedBuilder()
      .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
      .setColor(color)
      .addFields(
        { name: 'Quest', value: `${questLine}\n${divider}` },
        ...questInfoFields
      );
    
    // Character-guess: add clue field and optionally set zoomed image
    if (quest.type === 'character-guess' && quest.requirements) {
      const { clueType, snippets, zoomedIconUrl } = quest.requirements;
      if (clueType === 'snippets' && snippets?.length) {
        const snippetText = snippets.map((snippet, index) => {
          const sourceLabel = snippet.source === 'personality' ? 'Personality' : 'History';
          return `**${sourceLabel} Clue ${index + 1}:**\n${snippet.text}`;
        }).join('\n\n');
        updatedEmbed.addFields({ name: '🎭 Who is this person?', value: snippetText, inline: false });
      } else if (clueType === 'icon-zoom' && zoomedIconUrl) {
        updatedEmbed.setImage(zoomedIconUrl);
        updatedEmbed.addFields({ name: '🎭 Who is this person?', value: '*Guess from the zoomed-in picture above!*', inline: false });
      }
    }
    
    // Add character completion info if quest is completed
    if (quest.completed && quest.completedBy?.characterId) {
      try {
        const Character = require('@/models/CharacterModel');
        const character = await Character.findById(quest.completedBy.characterId);
        if (character) {
          updatedEmbed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
          updatedEmbed.addFields({
            name: '🏆 Completed By',
            value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
            inline: false
          });
        }
        if (quest.type === 'character-guess' && quest.requirements?.characterName) {
          updatedEmbed.addFields({
            name: '🎭 Answer',
            value: `**${quest.requirements.characterName}**`,
            inline: true
          });
        }
      } catch (error) {
        logger.error('QUEST', 'Error fetching character for completed quest', error);
      }
    } else if (!isExpired) {
      // Add NPC icon as thumbnail for available quests
      try {
        const npcData = NPCs[npcName];
        if (npcData && npcData.icon) {
          updatedEmbed.setThumbnail(npcData.icon);
        }
      } catch (error) {
        logger.error('QUEST', 'Error setting NPC thumbnail', error);
      }
      
      // Only add rules and how to complete for available quests
      const turnIn = getQuestTurnInInstructions(quest.type);
      const rules = '• Only natives of the village can complete this quest.\n' +
                   '• First come, first served—one completion per quest!\n' +
                   '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                   '• Complete quests to help your village prosper!';
      
      updatedEmbed.addFields(
        { name: 'How to Complete', value: turnIn },
        { name: 'Rules', value: rules }
      );
    } else {
      // Add expired quest message
      updatedEmbed.addFields({
        name: '⏰ Quest Expired',
        value: 'This quest was posted on a previous day and is no longer available for completion. Help Wanted quests expire at midnight (EST) on the day they are posted.',
        inline: false
      });
    }
    
    updatedEmbed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
    
    const imageToSet = (quest.type === 'character-guess' && quest.requirements?.clueType === 'icon-zoom' && quest.requirements?.zoomedIconUrl)
      ? quest.requirements.zoomedIconUrl
      : image;
    if (imageToSet) updatedEmbed.setImage(imageToSet);

    await message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    logger.error('QUEST', `Failed to update quest embed for ${quest.questId}`, error);
  }
}

// ============================================================================
// ------------------- Quest Posting -------------------
// ============================================================================

// ------------------- Function: verifyQuestMessageExists -------------------
// Verifies that a quest's Discord message actually exists
// Also updates postedToDiscord field based on verification result
async function verifyQuestMessageExists(client, quest) {
  try {
    if (!quest.messageId || !quest.channelId) {
      // No messageId/channelId means not posted
      if (quest.postedToDiscord) {
        quest.postedToDiscord = false;
        await quest.save();
      }
      return false;
    }

    if (!client?.channels) {
      return false;
    }

    const channel = await client.channels.fetch(quest.channelId).catch(() => null);
    if (!channel) {
      logger.warn('QUEST', `Could not fetch channel ${quest.channelId} for quest ${quest.questId}`);
      // Message doesn't exist - update flag
      if (quest.postedToDiscord) {
        quest.postedToDiscord = false;
        await quest.save();
      }
      return false;
    }

    const message = await channel.messages.fetch(quest.messageId).catch(() => null);
    const exists = !!message;
    
    // Update postedToDiscord flag to match reality
    if (exists && !quest.postedToDiscord) {
      quest.postedToDiscord = true;
      await quest.save();
    } else if (!exists && quest.postedToDiscord) {
      quest.postedToDiscord = false;
      await quest.save();
    }
    
    return exists;
  } catch (error) {
    logger.error('QUEST', `Error verifying message for quest ${quest.questId}: ${error.message}`);
    // On error, assume not posted
    if (quest.postedToDiscord) {
      quest.postedToDiscord = false;
      await quest.save().catch(() => {}); // Don't fail if save fails
    }
    return false;
  }
}

// ------------------- Function: postQuestToDiscord -------------------
// Posts a quest embed to the appropriate town hall channel
async function postQuestToDiscord(client, quest) {
  try {
    if (!client?.channels) {
      logger.error('QUEST', 'postQuestToDiscord: Discord client not available');
      return null;
    }

    // Get the town hall channel for the quest's village
    const townHallChannels = {
      'Rudania': process.env.RUDANIA_TOWNHALL || '629028823001858060',
      'Inariko': process.env.INARIKO_TOWNHALL || '629028490179510308',
      'Vhintl': process.env.VHINTL_TOWNHALL || '629030018965700668'
    };

    const channelId = townHallChannels[quest.village];
    if (!channelId) {
      logger.error('QUEST', `No town hall channel found for village ${quest.village}`);
      return null;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.error('QUEST', `Could not fetch town hall channel ${channelId} for village ${quest.village}`);
      return null;
    }

    // Format the quest as an embed
    const questEmbeds = await formatSpecificQuestsAsEmbedsByVillage([quest]);
    const embed = questEmbeds[quest.village];
    
    if (!embed) {
      logger.error('QUEST', `Failed to format embed for quest ${quest.questId}`);
      return null;
    }

    // Post the embed
    const message = await channel.send({ embeds: [embed] });
    
    // Verify the message was actually created before saving
    if (!message || !message.id) {
      logger.error('QUEST', `Failed to get message ID after posting quest ${quest.questId}`);
      return null;
    }
    
    // Update the quest with messageId, channelId, and postedToDiscord flag
    quest.messageId = message.id;
    quest.channelId = channelId;
    quest.postedToDiscord = true;
    await quest.save();
    
    logger.info('QUEST', `Posted quest ${quest.questId} for ${quest.village} to channel ${channelId} (message ${message.id})`);
    return message;
  } catch (error) {
    logger.error('QUEST', `Failed to post quest ${quest.questId} to Discord: ${error.message}`, error);
    // Don't save messageId/channelId if posting failed
    return null;
  }
}

// ============================================================================
// ------------------- Auto-Quest Completion -------------------
// ============================================================================

// ------------------- Function: checkAndCompleteQuestFromSubmission -------------------
// Checks if a submission is for a Help Wanted quest and completes it if approved
async function checkAndCompleteQuestFromSubmission(submissionData, client) {
  try {
    // Check if this submission has a quest ID
    if (!submissionData.questEvent || submissionData.questEvent === 'N/A') {
      return; // Not a quest submission
    }

    const questId = submissionData.questEvent;
    logger.debug('QUEST', `Checking quest completion for submission with quest ID: ${questId}`);

    // Find the quest
    const quest = await HelpWantedQuest.findOne({ questId });
    if (!quest) {
      logger.debug('QUEST', `Quest ${questId} not found`);
      return;
    }

    // Check if quest is already completed
    if (quest.completed) {
      logger.debug('QUEST', `Quest ${questId} is already completed`);
      return;
    }

    // Note: We don't check expiration here - let completeQuestFromSubmission handle it
    // This allows expired quests with approved submissions to be completed

    // Check if submission type matches quest type
    const submissionType = submissionData.category; // 'art' or 'writing'
    if (submissionType !== quest.type) {
      logger.debug('QUEST', `Submission type ${submissionType} doesn't match quest type ${quest.type}`);
      return;
    }

    // Check if the submission has been approved (has checkmark reaction)
    // Skip this check if called from mod approval system (indicated by approvedSubmissionData flag)
    if (submissionData.messageUrl && !submissionData.approvedSubmissionData) {
      const isApproved = await checkSubmissionApproval(submissionData.messageUrl, client);
      if (!isApproved) {
        logger.debug('QUEST', `Submission for quest ${questId} is not approved yet`);
        return;
      }
    }

    const userId = submissionData.userId;
    // Only enforce daily/weekly limits when NOT from mod approval. When a mod approves a submission,
    // the user already submitted for this specific quest—we must record the completion regardless
    // of whether they did another quest that day/week (approval can happen later).
    if (!submissionData.approvedSubmissionData) {
      const dailyCompleted = await hasUserCompletedQuestToday(userId);
      if (dailyCompleted) {
        logger.debug('QUEST', `Quest ${questId} not completed: user ${userId} already completed a Help Wanted quest today`);
        return;
      }
      const weeklyLimitReached = await hasUserReachedWeeklyQuestLimit(userId);
      if (weeklyLimitReached) {
        logger.debug('QUEST', `Quest ${questId} not completed: user ${userId} has reached the weekly Help Wanted limit (3)`);
        return;
      }
    }

    // Complete the quest
    await completeQuestFromSubmission(quest, submissionData, client);
    
  } catch (error) {
    logger.error('QUEST', 'Error checking quest completion from submission', error);
  }
}

// ------------------- Function: checkSubmissionApproval -------------------
// Checks if a submission message has been approved with a checkmark reaction
async function checkSubmissionApproval(messageUrl, client) {
  try {
    // Parse the message URL to get channel and message IDs
    const urlMatch = messageUrl.match(/\/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (!urlMatch) {
      return false;
    }

    const [, guildId, channelId, messageId] = urlMatch;
    
    // Fetch the message
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return false;
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return false;
    }

    // Check for checkmark emoji reactions from Tinglebot
    const checkmarkReactions = message.reactions.cache.filter(reaction => {
      const isCheckmark = reaction.emoji.name === '✅' || 
                         reaction.emoji.name === '☑️' || 
                         reaction.emoji.name === '✔️' ||
                         reaction.emoji.id === '854499720797618207'; // Custom checkmark emoji ID if exists
      
      return isCheckmark && reaction.users.cache.has(client.user.id);
    });

    return checkmarkReactions.size > 0;
  } catch (error) {
    logger.error('QUEST', 'Error checking submission approval', error);
    return false;
  }
}

// ------------------- Function: completeQuestFromSubmission -------------------
// Completes a quest when a mod approves an art/writing submission (immediately upon approval)
async function completeQuestFromSubmission(quest, submissionData, client) {
  try {
    // Mark quest as completed
    quest.completed = true;
    quest.completedBy = {
      userId: submissionData.userId,
      characterId: null, // We don't have character info in submission data
      timestamp: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
    };
    await quest.save();

    // Update user tracking
    const User = require('@/models/UserModel');
    const user = await User.findOne({ discordId: submissionData.userId });
    if (user) {
      await updateUserTracking(user, quest, submissionData.userId);
    }
    // Mark collab partners as having completed the quest
    const collabList = Array.isArray(submissionData.collab) ? submissionData.collab : (submissionData.collab ? [submissionData.collab] : []);
    for (const collaboratorMention of collabList) {
      if (!collaboratorMention || typeof collaboratorMention !== 'string') continue;
      const collaboratorId = collaboratorMention.replace(/[<@!>]/g, '').trim();
      if (!collaboratorId) continue;
      const collabUser = await User.findOne({ discordId: collaboratorId });
      if (collabUser) {
        await updateUserTracking(collabUser, quest, collaboratorId);
      }
    }

    // Update quest embed
    await updateQuestEmbed(client, quest, quest.completedBy);

    // Send completion message to the original town hall channel
    await sendQuestCompletionMessage(quest, submissionData, client);

    logger.success('QUEST', `Quest ${quest.questId} completed via submission approval`);
    
  } catch (error) {
    logger.error('QUEST', 'Error completing quest from submission', error);
  }
}

// ------------------- Function: updateUserTracking -------------------
// Updates user tracking for quest completion (copied from helpWanted.js)
async function updateUserTracking(user, quest, userId) {
  if (!user.helpWanted) {
    user.helpWanted = {
      lastCompletion: null,
      cooldownUntil: null,
      totalCompletions: 0,
      currentCompletions: 0,
      lastExchangeAmount: 0,
      lastExchangeAt: null,
      completions: []
    };
  }
  const now = new Date();
  const today = getESTDateString(now);
  
  user.helpWanted.lastCompletion = today;
  // Increment both total and current completions
  user.helpWanted.totalCompletions = (user.helpWanted.totalCompletions || 0) + 1;
  user.helpWanted.currentCompletions = (user.helpWanted.currentCompletions || 0) + 1;
  user.helpWanted.completions.push({
    date: today,
    village: quest.village,
    questType: quest.type,
    questId: quest.questId,
    timestamp: new Date()
  });
  await user.save();
}

// ------------------- Function: sendQuestCompletionMessage -------------------
// Sends a quest completion message to the original town hall channel
async function sendQuestCompletionMessage(quest, submissionData, client) {
  try {
    // Get the town hall channel for the quest's village
    const townHallChannels = {
      'Rudania': '629028823001858060', // RUDANIA_TOWNHALL
      'Inariko': '629028490179510308', // INARIKO_TOWNHALL
      'Vhintl': '629030018965700668'   // VHINTL_TOWNHALL
    };

    const channelId = townHallChannels[quest.village];
    if (!channelId) {
      logger.warn('QUEST', `No town hall channel found for village ${quest.village}`);
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logger.error('QUEST', `Could not fetch town hall channel ${channelId}`);
      return;
    }

    // Create completion embed
    const { EmbedBuilder } = require('discord.js');
    const completionEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Quest Completed!')
      .setDescription(`**${submissionData.username}** has successfully completed the Help Wanted quest for **${quest.village}**!`)
      .addFields(
        { name: '🎯 Quest Type', value: quest.type.charAt(0).toUpperCase() + quest.type.slice(1), inline: true },
        { name: '🏘️ Village', value: quest.village, inline: true },
        { name: '👤 Requested By', value: quest.npcName || 'Unknown NPC', inline: true },
        { name: '👤 Completed By', value: `<@${submissionData.userId}>`, inline: true },
        { name: '🆔 Quest ID', value: quest.questId, inline: true }
      )
      .setFooter({ text: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}) })
      .setTimestamp();

    // Add quest-specific details
    let questDetails = '';
    switch (quest.type) {
      case 'art':
        questDetails = `**Created:** ${quest.requirements.prompt}\n**Requirement:** ${quest.requirements.requirement}`;
        break;
      case 'writing':
        questDetails = `**Written:** ${quest.requirements.prompt}\n**Requirement:** ${quest.requirements.requirement}`;
        break;
      default:
        questDetails = 'Quest completed successfully!';
    }

    if (questDetails) {
      completionEmbed.addFields({ name: '📋 Quest Details', value: questDetails, inline: false });
    }

    // Add submission link
    if (submissionData.messageUrl) {
      completionEmbed.addFields({ 
        name: '🔗 View Submission', 
        value: `[Click Here](${submissionData.messageUrl})`, 
        inline: false 
      });
    }

    // Add border image
    completionEmbed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

    await channel.send({
      content: `<@${submissionData.userId}> Quest completed!`,
      embeds: [completionEmbed]
    });
    logger.success('QUEST', `Quest completion message sent to ${quest.village} town hall`);
    
  } catch (error) {
    logger.error('QUEST', 'Error sending quest completion message', error);
  }
}

// ------------------- Function: generateCharacterGuessQuestForTesting -------------------
// Generates a single character-guess quest for a given village (or random). Used by test script.
async function generateCharacterGuessQuestForTesting(village = null) {
  const targetVillage = village && VILLAGES.includes(village) ? village : getRandomElement(VILLAGES);
  const pools = await getAllQuestPools();
  const questId = generateUniqueId('X');
  if (!questId) {
    throw new Error('Failed to generate questId');
  }
  const npcName = getRandomNPCName();
  const requirements = await generateQuestRequirements('character-guess', pools, targetVillage, questId);
  const date = getUTCDateString();
  const scheduledPostTime = '0 12 * * *'; // noon UTC placeholder
  return {
    questId,
    village: targetVillage,
    date,
    type: 'character-guess',
    npcName,
    requirements,
    completed: false,
    completedBy: null,
    scheduledPostTime,
    messageId: null,
    channelId: null,
    postedToDiscord: false
  };
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================
module.exports = {
  generateDailyQuests,
  generateCharacterGuessQuestForTesting,
  getItemQuestPool,
  getMonsterQuestPool,
  hasUserCompletedQuestToday,
  hasUserReachedWeeklyQuestLimit,
  getCraftingQuestPool,
  getEscortQuestPool,
  getVillageShopQuestPool,
  getArtQuestPool,
  getWritingQuestPool,
  getAllQuestPools,
  VILLAGES,
  QUEST_TYPES,
  FIXED_CRON_TIMES,
  QUEST_TYPE_EMOJIS,
  getTodaysQuests,
  formatQuestsAsEmbed,
  formatQuestsAsEmbedsByVillage,
  formatSpecificQuestsAsEmbedsByVillage,
  getQuestsForScheduledTime,
  getCurrentQuestSchedule,
  updateQuestEmbed,
  updateUserTracking,
  postQuestToDiscord,
  verifyQuestMessageExists,
  isQuestExpired,
  checkAndCompleteQuestFromSubmission,
  isTravelBlockedByWeather,
  isTravelBlockedByWeatherCached,
  regenerateEscortQuest,
  regenerateArtWritingQuest,
  getRandomNPCName,
  getRandomNPCNameFromPool,
  getAvailableQuestTypes
}; 