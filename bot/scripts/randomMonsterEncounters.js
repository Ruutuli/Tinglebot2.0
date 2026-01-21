// ------------------- randomEncounters.js -------------------
// This module handles random encounters in the game.
// It tracks message activity in channels, determines if an encounter should be triggered,
// creates encounter embeds, and triggers random encounters based on server activity.
// It also manages the timing and channel selection for encounters.
//
// IMPORTANT: Users with role ID 788137818135330837 cannot trigger raids
// (their messages are excluded from activity tracking)

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { ChannelType } = require('discord.js');

const { handleError } = require('@/shared/utils/globalErrorHandler');
const logger = require('@/shared/utils/logger');
// ============================================================================
// Local Modules & Database Models
// ------------------- Importing local services and models -------------------
const { getMonstersAboveTierByRegion, fetchMonsterByName } = require('@/shared/database/db');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer, storeRaidProgress, getRaidProgressById } = require('../modules/raidModule');
const { capitalizeVillageName } = require('@/shared/utils/stringUtils');
const TempData = require('@/shared/models/TempDataModel');
const { Village } = require('@/shared/models/VillageModel');

// ============================================================================
// Environment Configuration
// ------------------- Load environment variables -------------------
require('dotenv').config();

// ============================================================================
// Constants
// ------------------- Define thresholds and timing constants -------------------
const MESSAGE_THRESHOLD = 200;            // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4;               // Minimum unique users required for an encounter
const TIME_WINDOW = 30 * 60 * 1000;         // 30 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000;           // Check every 60 seconds
const RAID_COOLDOWN = 4 * 60 * 60 * 1000;  // 4 hour cooldown between raids
const RAID_COOLDOWN_KEY = 'global_raid_cooldown'; // Key for storing raid cooldown in TempData
const VILLAGE_RAID_COOLDOWN = 4 * 60 * 60 * 1000;  // 4 hour cooldown per village for quota-based raids
const VILLAGE_RAID_COOLDOWN_PREFIX = 'village_raid_cooldown_'; // Prefix for per-village cooldown keys

// ------------------- Restricted Role -------------------
// Role ID that cannot trigger raids
const RESTRICTED_ROLE_ID = '788137818135330837';

// ------------------- Excluded Channels -------------------
// Channels to exclude from message threshold calculations
const EXCLUDED_CHANNELS = [
  '606126567302627329'  // Category channel to exclude
];

// ------------------- Village Channels -------------------
// Maps village names to their respective channel IDs (from environment variables)
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL,
};

// Village channel mapping for raids
const villageChannelMap = {
  'rudania': process.env.RUDANIA_TOWNHALL,
  'inariko': process.env.INARIKO_TOWNHALL,
  'vhintl': process.env.VHINTL_TOWNHALL
};

// ============================================================================
// Message Activity Tracking
// ------------------- Track Server Activity -------------------
const messageActivity = new Map();

// ============================================================================
// Village Raid Quota System Constants
// ------------------- Quota Period Constants -------------------
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = 7 * DAY_IN_MS;
const HOURS_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// ============================================================================
// Period Calculation Functions
// ------------------- Get Midnight EST in UTC -------------------
function getMidnightESTInUTC(year, month, day) {
  // Create a test date at noon on the target date to determine DST status
  const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Format this date in EST/EDT to determine if DST is active
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
    hour: 'numeric',
    hour12: false
  });
  
  // Get the formatted string to check for DST
  const parts = estFormatter.formatToParts(testDate);
  const timeZoneName = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const isDST = timeZoneName === 'EDT'; // EDT means DST is active (UTC-4), EST is UTC-5
  
  // Calculate offset: EST is UTC-5, EDT is UTC-4
  const offsetHours = isDST ? 4 : 5;
  
  // Create UTC date for midnight EST/EDT (00:00)
  // midnight EST/EDT = 0 + offsetHours in UTC (which wraps to previous day)
  // EST: 00:00 EST = 05:00 UTC (same day)
  // EDT: 00:00 EDT = 04:00 UTC (same day)
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0 + offsetHours, 0, 0));
  
  return utcDate;
}

// ------------------- Get Current Week Start -------------------
function getCurrentWeekStart() {
  const now = new Date();
  
  // Get current date in EST/EDT
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long'
  });
  
  const parts = estFormatter.formatToParts(now);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });
  
  const estYear = parseInt(values.year);
  const estMonth = parseInt(values.month);
  const estDay = parseInt(values.day);
  
  // Get day of week (0=Sunday, 1=Monday, etc.)
  const weekdayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
  const dayOfWeek = weekdayMap[values.weekday] || 0;
  
  // Calculate Sunday's date by subtracting days
  // Use a Date object to handle month/year boundaries correctly
  // Create a date representing today at noon EST (converted to UTC) to avoid DST edge cases
  const todayMidnightEST = getMidnightESTInUTC(estYear, estMonth, estDay);
  const todayNoonUTC = new Date(todayMidnightEST);
  todayNoonUTC.setUTCHours(todayNoonUTC.getUTCHours() + 12); // Noon to avoid midnight edge cases
  
  // Subtract days to get to Sunday
  const sundayNoonUTC = new Date(todayNoonUTC);
  sundayNoonUTC.setUTCDate(sundayNoonUTC.getUTCDate() - dayOfWeek);
  
  // Format Sunday's date in EST to get the correct date components
  const sundayParts = estFormatter.formatToParts(sundayNoonUTC);
  const sundayValues = {};
  sundayParts.forEach(part => {
    if (part.type !== 'literal') {
      sundayValues[part.type] = part.value;
    }
  });
  
  // Get midnight EST for that Sunday in UTC
  const sundayMidnightEST = getMidnightESTInUTC(
    parseInt(sundayValues.year),
    parseInt(sundayValues.month),
    parseInt(sundayValues.day)
  );
  
  return sundayMidnightEST;
}

// ------------------- Get Current Month Start (First Monday 00:00 UTC) -------------------
// Uses UTC so period boundaries match MongoDB's UTC storage.
function getCurrentMonthStart() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  
  // Find first Monday of the month (getUTCDay: 0=Sunday, 1=Monday, ...)
  let dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0) {
    date.setUTCDate(2); // Sunday -> Monday is 2nd
  } else if (dayOfWeek > 1) {
    date.setUTCDate(1 + (8 - dayOfWeek));
  }
  return date;
}

// ------------------- Get Village Quota -------------------
function getVillageQuota(level) {
  switch (level) {
    case 1: return 1; // 1 raid per week
    case 2: return 2; // 2 raids per month
    case 3: return 1; // 1 raid per month
    default: return 0;
  }
}

// ------------------- Get Village Period Start -------------------
function getVillagePeriodStart(level) {
  if (level === 1) {
    return getCurrentWeekStart();
  } else {
    // Level 2 and 3 use monthly periods starting on Monday
    return getCurrentMonthStart();
  }
}

// ------------------- Get Period End Date (UTC, consistent with periodStart) -------------------
function getPeriodEnd(periodStart, level) {
  const end = new Date(periodStart.getTime());
  if (level === 1) {
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(1);
    let dayOfWeek = end.getUTCDay();
    if (dayOfWeek === 0) {
      end.setUTCDate(2);
    } else if (dayOfWeek > 1) {
      end.setUTCDate(1 + (8 - dayOfWeek));
    }
    end.setUTCDate(end.getUTCDate() - 1);
    end.setUTCHours(23, 59, 59, 999);
  }
  return end;
}

// ============================================================================
// Village Period Tracking Functions
// ------------------- Get Village Period Data -------------------
async function getVillagePeriodData(villageName) {
  try {
    const village = await Village.findOne({ name: villageName }).exec();
    
    if (!village || !village.raidQuotaPeriodStart) {
      return null;
    }
    
    return {
      periodStart: new Date(village.raidQuotaPeriodStart),
      raidCount: village.raidQuotaCount || 0,
      periodType: village.raidQuotaPeriodType || 'week'
    };
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error getting village period data for ${villageName}:`, error);
    return null;
  }
}

// ------------------- Set Village Period Data -------------------
async function setVillagePeriodData(villageName, periodStart, raidCount, periodType) {
  try {
    await Village.findOneAndUpdate(
      { name: villageName },
      {
        raidQuotaPeriodStart: periodStart,
        raidQuotaCount: raidCount,
        raidQuotaPeriodType: periodType,
        lastQuotaRaidTime: null // Reset when period resets
      },
      { upsert: false, new: true }
    );
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error setting village period data for ${villageName}:`, error);
  }
}

// ------------------- Check And Reset Period -------------------
async function checkAndResetPeriod(villageName, level) {
  const currentPeriodStart = getVillagePeriodStart(level);
  const periodData = await getVillagePeriodData(villageName);
  
  if (!periodData) {
    // No period data exists, initialize with current period
    const periodType = level === 1 ? 'week' : 'month';
    await setVillagePeriodData(villageName, currentPeriodStart, 0, periodType);
    return {
      periodStart: currentPeriodStart,
      raidCount: 0,
      periodType: periodType
    };
  }
  
  const storedPeriodStart = periodData.periodStart;
  const periodType = level === 1 ? 'week' : 'month';
  const periodDuration = level === 1 ? WEEK_IN_MS : 30 * DAY_IN_MS; // Approximate month duration
  
  const storedTime = storedPeriodStart.getTime();
  const currentTime = currentPeriodStart.getTime();
  const timeDiff = currentTime - storedTime;
  
  // For level 1 (weekly), check if we're in a different week
  // For level 2-3 (monthly), check if we're in a different month
  if (level === 1) {
    // Weekly period: if time difference is >= 5 days, we're likely in a new week
    // (5 days accounts for some timezone variance but catches week transitions)
    if (timeDiff >= 5 * DAY_IN_MS) {
      await setVillagePeriodData(villageName, currentPeriodStart, 0, periodType);
      return {
        periodStart: currentPeriodStart,
        raidCount: 0,
        periodType: periodType
      };
    } else if (timeDiff < -DAY_IN_MS) {
      // Stored period is in the future (shouldn't happen, but handle it)
      // This could happen if clocks are skewed - normalize without resetting
      await Village.findOneAndUpdate(
        { name: villageName },
        { 
          $set: {
            raidQuotaPeriodStart: currentPeriodStart,
            raidQuotaPeriodType: periodType
          }
        }
      );
      return {
        periodStart: currentPeriodStart,
        raidCount: periodData.raidCount,
        periodType: periodType
      };
    } else if (Math.abs(timeDiff) > 0 && Math.abs(timeDiff) < 6 * 60 * 60 * 1000) {
      // Within 6 hours difference - likely same period but different timezone calculation
      // Normalize to current period start without resetting count
      // This handles migration from UTC-based to EST-based period starts
      await Village.findOneAndUpdate(
        { name: villageName },
        { 
          $set: {
            raidQuotaPeriodStart: currentPeriodStart,
            raidQuotaPeriodType: periodType
          }
        }
      );
      return {
        periodStart: currentPeriodStart,
        raidCount: periodData.raidCount,
        periodType: periodType
      };
    }
  } else {
    if (timeDiff >= 25 * DAY_IN_MS) {
      await setVillagePeriodData(villageName, currentPeriodStart, 0, periodType);
      return {
        periodStart: currentPeriodStart,
        raidCount: 0,
        periodType: periodType
      };
    }
  }
  
  return periodData;
}

// ------------------- Reset All Village Raid Quotas -------------------
// This function checks all villages and resets their raid quota counts if the period has changed
async function resetAllVillageRaidQuotas() {
  try {
    console.log('[randomMonsterEncounters.js]: 🔄 Checking all villages for raid quota period resets...');
    
    const villages = await Village.find({}).exec();
    
    if (!villages || villages.length === 0) {
      return;
    }
    
    let resetCount = 0;
    
    for (const village of villages) {
      const villageName = village.name;
      const level = village.level || 1;
      const currentPeriodStart = getVillagePeriodStart(level);
      const periodType = level === 1 ? 'week' : 'month';
      
      // Check if period has changed
      const storedPeriodStart = village.raidQuotaPeriodStart;
      const needsReset = !storedPeriodStart || 
                        new Date(storedPeriodStart).getTime() !== currentPeriodStart.getTime();
      
      if (needsReset) {
        // Period has changed or doesn't exist, reset the count
        await Village.findOneAndUpdate(
          { name: villageName },
          {
            raidQuotaPeriodStart: currentPeriodStart,
            raidQuotaCount: 0,
            raidQuotaPeriodType: periodType,
            lastQuotaRaidTime: null
          }
        );
        
        resetCount++;
      }
    }
    
    if (resetCount > 0) {
      console.log(`[randomMonsterEncounters.js]: 🔄 Reset ${resetCount} village raid quota(s)`);
    }
    
    return resetCount;
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error resetting village raid quotas:', error);
    handleError(error, 'randomMonsterEncounters.js');
    return 0;
  }
}

// ------------------- Get Period Remaining Ratio -------------------
function getPeriodRemainingRatio(periodStart, level) {
  const now = new Date();
  const periodEnd = getPeriodEnd(periodStart, level);
  const periodDuration = periodEnd.getTime() - periodStart.getTime();
  const elapsed = now.getTime() - periodStart.getTime();
  const remaining = periodEnd.getTime() - now.getTime();
  
  // Return ratio of time remaining (0.0 = period ended, 1.0 = period just started)
  if (remaining <= 0) return 0;
  if (periodDuration <= 0) return 0;
  return remaining / periodDuration;
}

// ============================================================================
// Village Raid Distribution Helper Functions
// ------------------- Has Raid Within Last Day -------------------
function hasRaidWithinLastDay(lastRaidTime) {
  if (!lastRaidTime) return false;
  
  const now = new Date();
  const timeSinceLastRaid = now.getTime() - new Date(lastRaidTime).getTime();
  const MIN_SPACING_MS = 36 * 60 * 60 * 1000;
  
  return timeSinceLastRaid < MIN_SPACING_MS;
}

// ------------------- Calculate Time-Based Probability -------------------
function calculateTimeBasedProbability(timeSinceReset, timeRemainingRatio) {
  const daysSinceReset = timeSinceReset / DAY_IN_MS;
  
  // Days 0-1 (Sun-Mon after reset): Very low probability (2-5%) - grace period
  if (daysSinceReset < 1.5) {
    return 0.02 + (daysSinceReset / 1.5) * 0.03; // 2% to 5%
  }
  
  // Days 2-4 (Tue-Thu): Low-medium probability (8-15%) - early week window
  if (daysSinceReset < 4.5) {
    const progress = (daysSinceReset - 1.5) / 3.0; // Progress within Tue-Thu window
    return 0.08 + progress * 0.07; // 8% to 15%
  }
  
  // Days 5-6 (Fri-Sat): Medium-high probability (20-40%) - increasing urgency
  if (daysSinceReset < 6.5) {
    const progress = (daysSinceReset - 4.5) / 2.0; // Progress within Fri-Sat window
    return 0.20 + progress * 0.20; // 20% to 40%
  }
  
  // Day 7+ (Overdue): High probability (60-100%) - ensure quota met before reset
  if (timeRemainingRatio < 0.1) {
    return 1.0; // Guarantee raid if less than 10% of period remains
  }
  
  // Between day 7 and end of period
  const urgency = (1.0 - timeRemainingRatio) * 2.0; // Increases as time remaining decreases
  return Math.min(0.60 + urgency * 0.40, 1.0); // 60% to 100%
}

// ------------------- Is Village Eligible For Raid -------------------
async function isVillageEligibleForRaid(village, periodData, quota) {
  if (!periodData) {
    return { eligible: false, reason: 'No period data' };
  }
  
  const raidCount = periodData.raidCount || 0;
  const quotaRemaining = Math.max(0, quota - raidCount);
  
  if (quotaRemaining <= 0) {
    return { eligible: false, reason: 'Quota already met' };
  }
  
  if (village.lastQuotaRaidTime && hasRaidWithinLastDay(village.lastQuotaRaidTime)) {
    return { eligible: false, reason: 'Raid within last 36 hours' };
  }
  
  return { eligible: true };
}

// ------------------- Rollback Quota Reservation -------------------
async function rollbackQuotaReservation(villageDisplayName) {
  try {
    await Village.findOneAndUpdate(
      { name: villageDisplayName },
      { $inc: { raidQuotaCount: -1 } }
    );
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Failed to rollback quota for ${villageDisplayName}:`, error);
  }
}

// ------------------- Select Monster For Raid -------------------
async function selectMonsterForRaid(villageRegion, villageDisplayName, channel) {
  const Monster = require('@/shared/models/MonsterModel');
  const monsters = await Monster.find({
    tier: { $gte: 5 },
    [villageRegion.toLowerCase()]: true,
    $or: [
      { species: { $exists: false } },
      { species: { $ne: 'Yiga' } }
    ]
  }).exec();
  
  if (!monsters || monsters.length === 0) {
    const errorMsg = `No tier 5+ monsters (excluding Yiga) found in ${villageRegion} region for ${villageDisplayName}.`;
    console.error(`[randomMonsterEncounters.js]: ❌ ${errorMsg}`);
    if (channel) {
      await channel.send(`❌ **${errorMsg}**`);
    }
    return null;
  }
  
  const monster = monsters[Math.floor(Math.random() * monsters.length)];
  if (!monster || !monster.name || !monster.tier) {
    const errorMsg = `No eligible monsters found for region: ${villageRegion}`;
    console.error(`[randomMonsterEncounters.js]: ❌ ${errorMsg}`);
    if (channel) {
      await channel.send(`❌ **No tier 5+ monsters found in ${villageRegion} region for ${villageDisplayName}.**`);
    }
    return null;
  }
  
  return monster;
}

// ------------------- Create Mock Interaction -------------------
function createMockInteraction(channel, botId = 'quota-raid-bot', botTag = 'Quota Raid Bot') {
  return {
    channel: channel,
    client: channel.client,
    user: { id: botId, tag: botTag },
    guild: channel.guild,
    editReply: async (options) => {
      return await channel.send(options);
    },
    followUp: async (options) => {
      return await channel.send(options);
    }
  };
}

// ------------------- Increment Village Raid Count (Atomic) -------------------
async function incrementVillageRaidCount(villageName, level) {
  try {
    const periodStart = getVillagePeriodStart(level);
    const periodType = level === 1 ? 'week' : 'month';
    
    // Use atomic increment to prevent race conditions
    // Note: Period should already be set by checkAndResetPeriod, so we just increment
    const result = await Village.findOneAndUpdate(
      { name: villageName },
      {
        $inc: { raidQuotaCount: 1 }
      },
      { upsert: false, new: true }
    );
    
    if (!result) {
      console.error(`[randomMonsterEncounters.js]: ❌ Village ${villageName} not found for raid count increment`);
      return 0;
    }
    
    const newCount = result.raidQuotaCount || 1;
    return newCount;
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error incrementing raid count for ${villageName}:`, error);
    throw error;
  }
}

// ============================================================================
// Raid Cooldown Management Functions
// ------------------- Get Global Raid Cooldown -------------------
async function getGlobalRaidCooldown() {
  try {
    const cooldownData = await TempData.findOne({ key: RAID_COOLDOWN_KEY, type: 'temp' });
    
    // If no cooldown data found, also check for any old entries without type field and clean them up
    if (!cooldownData) {
      const oldCooldownData = await TempData.findOne({ key: RAID_COOLDOWN_KEY });
      if (oldCooldownData) {
        await TempData.findOneAndDelete({ key: RAID_COOLDOWN_KEY });
      }
      return 0;
    }
    
    const lastRaidTime = cooldownData.data.lastRaidTime;
    const currentTime = Date.now();
    const oneYearAgo = currentTime - (365 * 24 * 60 * 60 * 1000);
    
    if (lastRaidTime && lastRaidTime < oneYearAgo) {
      await resetGlobalRaidCooldown();
      return 0;
    }
    
    return lastRaidTime || 0;
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error getting raid cooldown:', error);
    return 0; // Default to 0 if there's an error
  }
}

// ------------------- Set Global Raid Cooldown -------------------
async function setGlobalRaidCooldown(timestamp) {
  try {
    await TempData.findOneAndUpdate(
      { key: RAID_COOLDOWN_KEY },
      { 
        key: RAID_COOLDOWN_KEY,
        type: 'temp',
        data: { lastRaidTime: timestamp }
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error setting raid cooldown:', error);
  }
}

// ------------------- Reset Global Raid Cooldown -------------------
async function resetGlobalRaidCooldown() {
  try {
    await TempData.findOneAndDelete({ key: RAID_COOLDOWN_KEY, type: 'temp' });
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error resetting raid cooldown:', error);
  }
}

// ------------------- Get Village Raid Cooldown -------------------
async function getVillageRaidCooldown(villageName) {
  try {
    const cooldownKey = `${VILLAGE_RAID_COOLDOWN_PREFIX}${villageName.toLowerCase()}`;
    const cooldownData = await TempData.findOne({ key: cooldownKey, type: 'temp' });
    
    const lastRaidTime = cooldownData?.data?.lastRaidTime;
    if (!lastRaidTime) {
      return 0;
    }
    
    const currentTime = Date.now();
    const oneYearAgo = currentTime - (365 * 24 * 60 * 60 * 1000);
    
    if (lastRaidTime < oneYearAgo) {
      await resetVillageRaidCooldown(villageName);
      return 0;
    }
    
    return lastRaidTime;
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error getting village raid cooldown for ${villageName}:`, error);
    return 0; // Default to 0 if there's an error
  }
}

// ------------------- Set Village Raid Cooldown -------------------
async function setVillageRaidCooldown(villageName, timestamp) {
  try {
    const cooldownKey = `${VILLAGE_RAID_COOLDOWN_PREFIX}${villageName.toLowerCase()}`;
    await TempData.findOneAndUpdate(
      { key: cooldownKey },
      { 
        key: cooldownKey,
        type: 'temp',
        data: { lastRaidTime: timestamp }
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error setting village raid cooldown for ${villageName}:`, error);
  }
}

// ------------------- Reset Village Raid Cooldown -------------------
async function resetVillageRaidCooldown(villageName) {
  try {
    const cooldownKey = `${VILLAGE_RAID_COOLDOWN_PREFIX}${villageName.toLowerCase()}`;
    await TempData.findOneAndDelete({ key: cooldownKey, type: 'temp' });
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error resetting village raid cooldown for ${villageName}:`, error);
  }
}

function trackMessageActivity(channelId, userId, isBot, username) {
  if (isBot) return; // Ignore bot messages
  
  // Skip excluded channels
  if (EXCLUDED_CHANNELS.includes(channelId)) {
    return;
  }

  // Check if the user has the restricted role
  // Note: We need the message object to check roles, so this will be handled in the messageCreate event
  const currentTime = Date.now();

  if (!messageActivity.has(channelId)) {
    messageActivity.set(channelId, { messages: [], users: new Set() });
  }

  const activity = messageActivity.get(channelId);

  // Filter out messages older than TIME_WINDOW and add the current message timestamp.
  activity.messages = activity.messages
    .filter((timestamp) => currentTime - timestamp <= TIME_WINDOW)
    .concat(currentTime);

  // Add the user to the set of active users.
  activity.users.add(userId);
  messageActivity.set(channelId, activity);
}

// ============================================================================
// Encounter Triggering Functions
// ------------------- Check for Random Encounter -------------------
async function checkForRandomEncounters(client) {
  const currentTime = Date.now();
  let totalMessages = 0;
  let totalUsers = new Set();
  let activeChannels = 0;

  // First pass: collect total activity across all channels and clean up inactive ones
  const channelsToRemove = [];
  for (const [channelId, activity] of messageActivity.entries()) {
    // Skip excluded channels
    if (EXCLUDED_CHANNELS.includes(channelId)) {
      continue;
    }
    
    // Remove outdated messages.
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    // Clean up users that haven't been active (remove users from set if no recent messages)
    // This is a simple cleanup - in practice, users are only added when they send messages
    // so we don't need to track individual user timestamps for cleanup

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;

    // If channel has no recent activity, mark it for removal to prevent memory leak
    if (messageCount === 0 && uniqueUserCount === 0) {
      channelsToRemove.push(channelId);
      continue;
    }

    if (messageCount > 0) {
      totalMessages += messageCount;
      activity.users.forEach(userId => totalUsers.add(userId));
      activeChannels++;
    }
  }

  // Clean up inactive channels from the Map to prevent memory leak
  for (const channelId of channelsToRemove) {
    messageActivity.delete(channelId);
  }

  // Check if server-wide activity meets threshold
  const meetsThreshold = totalMessages >= MESSAGE_THRESHOLD && totalUsers.size >= MIN_ACTIVE_USERS;

  if (meetsThreshold) {
    // Reset all channel activity after triggering encounter
    for (const [channelId, activity] of messageActivity.entries()) {
      if (!EXCLUDED_CHANNELS.includes(channelId)) {
        messageActivity.set(channelId, { messages: [], users: new Set() });
      }
    }

    // Select a random village for the raid
    const villages = Object.keys(villageChannelMap);
    const selectedVillage = villages[Math.floor(Math.random() * villages.length)];
    const selectedVillageKey = selectedVillage.toLowerCase();
    
    // Get the target channel for the selected village
    const targetChannelId = villageChannelMap[selectedVillageKey];
    const raidChannel = client.channels.cache.get(targetChannelId);

    if (raidChannel && raidChannel.type === ChannelType.GuildText) {
      await triggerRandomEncounter(raidChannel, selectedVillage);
    } else {
      console.error(`[randomMonsterEncounters.js]: ❌ Could not find channel for ${selectedVillage} (ID: ${targetChannelId})`);
    }
  }
}

// ============================================================================
// Random Encounter Trigger
// ------------------- Trigger Random Encounter -------------------
async function triggerRandomEncounter(channel, selectedVillage) {
  try {
    const villageRegion = getVillageRegionByName(selectedVillage);
    if (!villageRegion) {
      console.error(`[randomMonsterEncounters.js]: ❌ Invalid village: ${selectedVillage}`);
      await channel.send(`❌ **Invalid village: ${selectedVillage}**`);
      return;
    }

    const monster = await selectMonsterForRaid(villageRegion, selectedVillage, channel);
    if (!monster) {
      return;
    }

    const mockInteraction = createMockInteraction(channel, 'random-encounter-bot', 'Random Encounter Bot');
    const { triggerRaid } = require('../modules/raidModule');
    const capitalizedVillage = capitalizeVillageName(selectedVillage);
    
    const result = await triggerRaid(monster, mockInteraction, capitalizedVillage, false);

    if (!result || !result.success) {
      if (result?.error && result.error.includes('Raid cooldown active')) {
        return;
      }
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to trigger raid: ${result?.error || 'Unknown error'}`);
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }

    console.log(`[randomMonsterEncounters.js]: ✅ Raid triggered in ${selectedVillage}: ${monster.name} (T${monster.tier})`);
  } catch (error) {
    if (error.message && error.message.includes('Raid cooldown active')) {
      return;
    }
    console.error('[randomMonsterEncounters.js]: ❌ Error triggering encounter:', error);
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// Village Raid Quota Checking Functions
// ------------------- Check Village Raid Quotas -------------------
async function checkVillageRaidQuotas(client) {
  try {
    const villages = await Village.find({}).exec();
    
    if (!villages || villages.length === 0) {
      return;
    }
    
    const eligibleVillages = [];
    const now = new Date();
    
    // Check each village for eligibility and calculate probability
    for (const village of villages) {
      const villageName = village.name;
      const level = village.level || 1;
      const quota = getVillageQuota(level);
      
      // Check and reset period if needed
      const periodData = await checkAndResetPeriod(villageName, level);
      if (!periodData) {
        continue;
      }
      
      // Check if village is eligible (quota remaining, no same-day raid)
      const eligibility = await isVillageEligibleForRaid(village, periodData, quota);
      if (!eligibility.eligible) {
        continue;
      }
      
      // Calculate time-based probability (same for all villages at same point in week)
      const periodStart = periodData.periodStart;
      const timeSinceReset = now.getTime() - periodStart.getTime();
      const timeRemainingRatio = getPeriodRemainingRatio(periodStart, level);
      
      if (timeRemainingRatio <= 0) {
        // Period ended but quota not met - guarantee raid
        eligibleVillages.push({ village, periodData, quota });
        continue;
      }
      
      // Calculate uniform time-based probability
      const probability = calculateTimeBasedProbability(timeSinceReset, timeRemainingRatio);
      
      // Random roll
      const roll = Math.random();
      if (roll < probability) {
        eligibleVillages.push({ village, periodData, quota });
      }
    }
    
    // If no villages are eligible, return
    if (eligibleVillages.length === 0) {
      return;
    }
    
    // Random selection from eligible villages (equal probability for each)
    const selected = eligibleVillages[Math.floor(Math.random() * eligibleVillages.length)];
    const selectedVillage = selected.village;
    const selectedVillageName = selectedVillage.name.toLowerCase();
    const quota = selected.quota;
    
    // Double-check: Re-verify quota status before triggering raid
    const currentVillage = await Village.findOne({ name: selectedVillage.name }).exec();
    if (!currentVillage) {
      console.error(`[randomMonsterEncounters.js]: ❌ Village ${selectedVillage.name} not found during double-check`);
      return;
    }
    
    // Verify period matches and quota not met
    const currentPeriodStart = getVillagePeriodStart(selectedVillage.level || 1);
    const storedPeriodStart = currentVillage.raidQuotaPeriodStart ? new Date(currentVillage.raidQuotaPeriodStart) : null;
    const periodMatches = storedPeriodStart && Math.abs(storedPeriodStart.getTime() - currentPeriodStart.getTime()) < 1000;
    const currentCount = currentVillage.raidQuotaCount || 0;
    
    if (!periodMatches || currentCount >= quota) {
      console.log(`[randomMonsterEncounters.js]: ⚠️ Double-check failed for ${selectedVillage.name} - Period match: ${periodMatches}, Count: ${currentCount}/${quota}`);
      return;
    }
    
    // Get the target channel for the selected village
    const targetChannelId = villageChannelMap[selectedVillageName];
    if (!targetChannelId) {
      console.error(`[randomMonsterEncounters.js]: ❌ No channel mapping found for ${selectedVillageName}`);
      return;
    }
    
    const raidChannel = client.channels.cache.get(targetChannelId);
    if (!raidChannel || raidChannel.type !== ChannelType.GuildText) {
      console.error(`[randomMonsterEncounters.js]: ❌ Could not find channel for ${selectedVillageName} (ID: ${targetChannelId})`);
      return;
    }
    
    // Trigger the raid (atomic reservation happens inside triggerQuotaBasedRaid)
    await triggerQuotaBasedRaid(raidChannel, selectedVillageName, selectedVillage.name, selectedVillage.level || 1, quota);
    
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error checking village raid quotas:', error);
    handleError(error, 'randomMonsterEncounters.js');
  }
}

// ------------------- Try Reserve Quota Slot -------------------
async function tryReserveQuotaSlot(villageName, level, quota) {
  try {
    const periodStart = getVillagePeriodStart(level);
    const periodType = level === 1 ? 'week' : 'month';
    
    // Ensure period data exists and is current
    const periodData = await checkAndResetPeriod(villageName, level);
    if (!periodData) {
      return { success: false, reason: 'Could not get period data' };
    }
    
    // Atomically increment only if current count is less than quota AND period matches
    // This prevents race conditions where multiple checks happen simultaneously
    const result = await Village.findOneAndUpdate(
      { 
        name: villageName,
        $and: [
          {
            $or: [
              { raidQuotaPeriodStart: { $exists: false } },
              { raidQuotaPeriodStart: periodStart }
            ]
          },
          {
            $or: [
              { raidQuotaCount: { $exists: false } },
              { raidQuotaCount: { $lt: quota } }
            ]
          }
        ]
      },
      {
        $inc: { raidQuotaCount: 1 },
        $set: {
          raidQuotaPeriodStart: periodStart,
          raidQuotaPeriodType: periodType,
          lastQuotaRaidTime: new Date()
        }
      },
      { upsert: false, new: true }
    );
    
    // If reservation failed, get current state to determine reason
    if (!result) {
      const currentVillage = await Village.findOne({ name: villageName }).exec();
      if (currentVillage) {
        const storedPeriodTime = currentVillage.raidQuotaPeriodStart ? new Date(currentVillage.raidQuotaPeriodStart).getTime() : 0;
        const expectedPeriodTime = periodStart.getTime();
        const periodMatches = Math.abs(storedPeriodTime - expectedPeriodTime) < 1000;
        const count = currentVillage.raidQuotaCount || 0;
        
        if (!periodMatches) {
          return { success: false, reason: 'Period mismatch' };
        }
        if (count >= quota) {
          return { success: false, reason: 'Quota already met' };
        }
      }
      return { success: false, reason: 'Reservation failed' };
    }
    
    const newCount = result.raidQuotaCount || 1;
    
    // Post-reservation validation: verify we didn't exceed quota
    if (newCount > quota) {
      // Rollback the increment
      await Village.findOneAndUpdate(
        { name: villageName },
        { $inc: { raidQuotaCount: -1 } }
      );
      console.error(`[randomMonsterEncounters.js]: ❌ Quota exceeded for ${villageName} (${newCount}/${quota}) - rollback performed`);
      return { success: false, reason: 'Quota exceeded' };
    }
    
    return { success: true, newCount };
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error reserving quota slot for ${villageName}:`, error);
    return { success: false, reason: error.message };
  }
}

// ------------------- Trigger Quota-Based Raid -------------------
async function triggerQuotaBasedRaid(channel, selectedVillage, villageDisplayName, villageLevel, quota) {
  try {
    const currentVillage = await Village.findOne({ name: villageDisplayName }).exec();
    if (!currentVillage) {
      console.error(`[randomMonsterEncounters.js]: ❌ Village ${villageDisplayName} not found during pre-trigger check`);
      return;
    }
    
    const currentPeriodStart = getVillagePeriodStart(villageLevel);
    const storedPeriodStart = currentVillage.raidQuotaPeriodStart ? new Date(currentVillage.raidQuotaPeriodStart) : null;
    const periodMatches = storedPeriodStart && Math.abs(storedPeriodStart.getTime() - currentPeriodStart.getTime()) < 1000;
    const currentCount = currentVillage.raidQuotaCount || 0;
    
    if (!periodMatches || currentCount >= quota) {
      console.log(`[randomMonsterEncounters.js]: ⚠️ Pre-trigger check failed for ${villageDisplayName} - Period match: ${periodMatches}, Count: ${currentCount}/${quota}`);
      return;
    }
    
    const quotaReservation = await tryReserveQuotaSlot(villageDisplayName, villageLevel, quota);
    if (!quotaReservation.success) {
      console.log(`[randomMonsterEncounters.js]: ⚠️ Reservation failed for ${villageDisplayName}: ${quotaReservation.reason}`);
      return;
    }
    
    const villageRegion = getVillageRegionByName(selectedVillage);
    if (!villageRegion) {
      console.error(`[randomMonsterEncounters.js]: ❌ Invalid village: ${selectedVillage}`);
      await rollbackQuotaReservation(villageDisplayName);
      await channel.send(`❌ **Invalid village: ${selectedVillage}**`);
      return;
    }
    
    const monster = await selectMonsterForRaid(villageRegion, villageDisplayName, channel);
    if (!monster) {
      await rollbackQuotaReservation(villageDisplayName);
      return;
    }
    
    const mockInteraction = createMockInteraction(channel);
    const { triggerRaid } = require('../modules/raidModule');
    const capitalizedVillage = capitalizeVillageName(selectedVillage);
    
    const result = await triggerRaid(monster, mockInteraction, capitalizedVillage, false, null, true);
    
    if (!result || !result.success) {
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to trigger quota-based raid: ${result?.error || 'Unknown error'}`);
      await rollbackQuotaReservation(villageDisplayName);
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }
    
    console.log(`[randomMonsterEncounters.js]: ✅ Quota-based raid triggered in ${villageDisplayName}: ${monster.name} (T${monster.tier}) - ${quotaReservation.newCount}/${quota}`);
    
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error triggering quota-based raid:', error);
    await rollbackQuotaReservation(villageDisplayName);
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// Timer Tracking (to prevent leaks on reinitialization)
// ------------------- Track active timers -------------------
let encounterCheckInterval = null;
let cleanupInterval = null;

// ============================================================================
// Initialization Function
// ------------------- Initialize Random Encounter Bot -------------------
async function initializeRandomEncounterBot(client) {
  // Clear any existing timers to prevent leaks if function is called multiple times
  if (encounterCheckInterval !== null) {
    clearInterval(encounterCheckInterval);
    logger.info('SYSTEM', '[randomMonsterEncounters.js] Cleared existing encounter check interval');
  }
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    logger.info('SYSTEM', '[randomMonsterEncounters.js] Cleared existing cleanup interval');
  }

  // Log role restriction status
  logger.info('SYSTEM', `Role restriction active - Users with role ${RESTRICTED_ROLE_ID} cannot trigger raids`);

  // Set up message tracking
  client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    
    // Check if the user has the restricted role
    if (message.member && message.member.roles.cache.has(RESTRICTED_ROLE_ID)) {
      return;
    }
    
    trackMessageActivity(
      message.channel.id,
      message.author.id,
      message.author.bot,
      message.author.username
    );
  });

  // Start periodic encounter checks (activity-based raids)
  encounterCheckInterval = setInterval(() => {
    checkForRandomEncounters(client).catch(error => {
      console.error('[randomMonsterEncounters.js]: ❌ Encounter check failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, CHECK_INTERVAL);

  // Periodic cleanup of messageActivity Map to prevent memory leaks
  // Run cleanup every 10 minutes (600000ms) to remove completely inactive channels
  cleanupInterval = setInterval(() => {
    const currentTime = Date.now();
    const channelsToRemove = [];
    
    for (const [channelId, activity] of messageActivity.entries()) {
      // Skip excluded channels
      if (EXCLUDED_CHANNELS.includes(channelId)) {
        continue;
      }
      
      // Remove outdated messages
      activity.messages = activity.messages.filter(
        (timestamp) => currentTime - timestamp <= TIME_WINDOW
      );
      
      // If channel has no recent activity for 2x the time window, remove it
      const oldestMessage = activity.messages.length > 0 
        ? Math.min(...activity.messages) 
        : currentTime;
      const timeSinceLastActivity = currentTime - oldestMessage;
      
      if (timeSinceLastActivity > TIME_WINDOW * 2) {
        channelsToRemove.push(channelId);
      }
    }
    
    // Remove inactive channels
    for (const channelId of channelsToRemove) {
      messageActivity.delete(channelId);
    }
    
    if (channelsToRemove.length > 0) {
      console.log(`[randomMonsterEncounters.js]: 🧹 Cleaned up ${channelsToRemove.length} inactive channel(s) from messageActivity Map`);
    }
  }, 10 * 60 * 1000); // Every 10 minutes

  // Note: Hourly quota checks are handled by scheduler.js
  // Startup checks are disabled - raids will only trigger during scheduled hourly checks to prevent raids on bot restart
  
  // Also run immediately on startup to reset any outdated periods
  // (The scheduler.js handles daily resets at midnight)
  // Call directly without timeout - async function won't block initialization
  resetAllVillageRaidQuotas().catch(error => {
    console.error('[randomMonsterEncounters.js]: ❌ Initial raid quota reset failed:', error);
    handleError(error, 'randomMonsterEncounters.js');
  });

}

// ============================================================================
// Cleanup Function
// ------------------- Cleanup All Timers -------------------
function cleanupTimers() {
  let cleanedCount = 0;
  
  if (encounterCheckInterval !== null) {
    clearInterval(encounterCheckInterval);
    encounterCheckInterval = null;
    cleanedCount++;
  }
  
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    cleanedCount++;
  }
  
  if (cleanedCount > 0) {
    logger.info('SYSTEM', `[randomMonsterEncounters.js] Cleaned up ${cleanedCount} timer(s)`);
  }
  
  return cleanedCount;
}

// ============================================================================
// Exports
// ------------------- Export Functions -------------------
module.exports = {
  initializeRandomEncounterBot,
  cleanupTimers,
  trackMessageActivity,
  checkForRandomEncounters,
  triggerRandomEncounter,
  getGlobalRaidCooldown,
  setGlobalRaidCooldown,
  resetGlobalRaidCooldown,
  getVillageRaidCooldown,
  setVillageRaidCooldown,
  resetVillageRaidCooldown,
  VILLAGE_RAID_COOLDOWN,
  checkVillageRaidQuotas,
  incrementVillageRaidCount,
  getVillagePeriodData,
  setVillagePeriodData,
  resetAllVillageRaidQuotas
};
