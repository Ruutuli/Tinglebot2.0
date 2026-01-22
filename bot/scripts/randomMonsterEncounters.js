// ============================================================================
// ------------------- randomMonsterEncounters.js -------------------
// ============================================================================
// This module handles random encounters in the game.
// It tracks message activity in channels, determines if an encounter should be triggered,
// creates encounter embeds, and triggers random encounters based on server activity.
// It also manages the timing and channel selection for encounters.
//
// IMPORTANT: Users with role ID 788137818135330837 cannot trigger raids
// (their messages are excluded from activity tracking)

// ============================================================================
// ------------------- Discord.js Components -------------------
// ============================================================================
const { ChannelType } = require('discord.js');

// ============================================================================
// ------------------- Shared Utilities -------------------
// ============================================================================
const { handleError } = require('@/shared/utils/globalErrorHandler');
const logger = require('@/shared/utils/logger');
const { capitalizeVillageName } = require('@/shared/utils/stringUtils');

// ============================================================================
// ------------------- Database Models -------------------
// ============================================================================
const TempData = require('@/shared/models/TempDataModel');
const { Village } = require('@/shared/models/VillageModel');

// ============================================================================
// ------------------- Local Modules -------------------
// ============================================================================
const { getVillageRegionByName } = require('../modules/locationsModule');

// ============================================================================
// ------------------- Environment Configuration -------------------
// ============================================================================
require('dotenv').config();

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const MESSAGE_THRESHOLD = 200;                    // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4;                        // Minimum unique users required for an encounter
const TIME_WINDOW = 30 * 60 * 1000;                // 30 minutes in milliseconds
const CHECK_INTERVAL = 30 * 60 * 1000;             // Check every 30 minutes
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;      // Cleanup every 6 hours
const RAID_COOLDOWN = 4 * 60 * 60 * 1000;         // 4 hour cooldown between raids
const RAID_COOLDOWN_KEY = 'global_raid_cooldown';  // Key for storing raid cooldown in TempData
const VILLAGE_RAID_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hour cooldown per village for quota-based raids
const VILLAGE_RAID_COOLDOWN_PREFIX = 'village_raid_cooldown_'; // Prefix for per-village cooldown keys
const RESTRICTED_ROLE_ID = '788137818135330837';  // Role ID that cannot trigger raids
const EXCLUDED_CHANNELS = ['606126567302627329']; // Channels to exclude from message threshold calculations

// ------------------- Village Channel Mapping -------------------
const villageChannelMap = {
  'rudania': process.env.RUDANIA_TOWNHALL,
  'inariko': process.env.INARIKO_TOWNHALL,
  'vhintl': process.env.VHINTL_TOWNHALL
};

// ============================================================================
// ------------------- Time Constants -------------------
// ============================================================================
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = 7 * DAY_IN_MS;
const MIN_SPACING_MS = 36 * 60 * 60 * 1000; // 36 hours minimum spacing between raids

// ============================================================================
// ------------------- Message Activity Tracking -------------------
// ============================================================================
const messageActivity = new Map();

// ============================================================================
// ------------------- Period Calculation Functions -------------------
// ============================================================================

// ------------------- Get Midnight EST in UTC -------------------
function getMidnightESTInUTC(year, month, day) {
  // EST is UTC-5, so midnight EST = 05:00 UTC
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
}

// ------------------- Get Current Week Start -------------------
function getCurrentWeekStart() {
  const now = new Date();
  const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  
  const values = {
    year: estNow.getUTCFullYear(),
    month: estNow.getUTCMonth() + 1,
    day: estNow.getUTCDate(),
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][estNow.getUTCDay()]
  };
  
  const estYear = parseInt(values.year);
  const estMonth = parseInt(values.month);
  const estDay = parseInt(values.day);
  const weekdayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
  const dayOfWeek = weekdayMap[values.weekday] || 0;
  
  const todayMidnightEST = getMidnightESTInUTC(estYear, estMonth, estDay);
  const todayNoonUTC = new Date(todayMidnightEST);
  todayNoonUTC.setUTCHours(todayNoonUTC.getUTCHours() + 12);
  
  const sundayNoonUTC = new Date(todayNoonUTC);
  sundayNoonUTC.setUTCDate(sundayNoonUTC.getUTCDate() - dayOfWeek);
  
  const sundayEST = new Date(sundayNoonUTC.getTime() - 5 * 60 * 60 * 1000);
  const sundayValues = {
    year: sundayEST.getUTCFullYear(),
    month: sundayEST.getUTCMonth() + 1,
    day: sundayEST.getUTCDate()
  };
  
  return getMidnightESTInUTC(sundayValues.year, sundayValues.month, sundayValues.day);
}

// ------------------- Get Current Month Start -------------------
function getCurrentMonthStart() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  
  let dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0) {
    date.setUTCDate(2);
  } else if (dayOfWeek > 1) {
    date.setUTCDate(1 + (8 - dayOfWeek));
  }
  return date;
}

// ------------------- Get Village Period Start -------------------
function getVillagePeriodStart(level) {
  return level === 1 ? getCurrentWeekStart() : getCurrentMonthStart();
}

// ------------------- Get Period End Date -------------------
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

// ------------------- Get Period Remaining Ratio -------------------
function getPeriodRemainingRatio(periodStart, level) {
  const now = new Date();
  const periodEnd = getPeriodEnd(periodStart, level);
  const periodDuration = periodEnd.getTime() - periodStart.getTime();
  const remaining = periodEnd.getTime() - now.getTime();
  
  if (remaining <= 0 || periodDuration <= 0) return 0;
  return remaining / periodDuration;
}

// ------------------- Get Village Quota -------------------
function getVillageQuota(level) {
  switch (level) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 1;
    default: return 0;
  }
}

// ============================================================================
// ------------------- Village Period Tracking Functions -------------------
// ============================================================================

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
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error getting village period data for ${villageName}:`, error);
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
        lastQuotaRaidTime: null
      },
      { upsert: false, new: true }
    );
  } catch (error) {
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error setting village period data for ${villageName}:`, error);
  }
}

// ------------------- Check And Reset Period -------------------
async function checkAndResetPeriod(villageName, level) {
  const currentPeriodStart = getVillagePeriodStart(level);
  const periodData = await getVillagePeriodData(villageName);
  
  if (!periodData) {
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
  const storedTime = storedPeriodStart.getTime();
  const currentTime = currentPeriodStart.getTime();
  const timeDiff = currentTime - storedTime;
  
  if (level === 1) {
    if (timeDiff >= 5 * DAY_IN_MS) {
      await setVillagePeriodData(villageName, currentPeriodStart, 0, periodType);
      return {
        periodStart: currentPeriodStart,
        raidCount: 0,
        periodType: periodType
      };
    } else if (timeDiff < -DAY_IN_MS) {
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
async function resetAllVillageRaidQuotas() {
  try {
    const villages = await Village.find({}).exec();
    
    if (!villages || villages.length === 0) {
      return 0;
    }
    
    let resetCount = 0;
    
    for (const village of villages) {
      const villageName = village.name;
      const level = village.level || 1;
      const currentPeriodStart = getVillagePeriodStart(level);
      const periodType = level === 1 ? 'week' : 'month';
      
      const storedPeriodStart = village.raidQuotaPeriodStart;
      const needsReset = !storedPeriodStart || 
                        new Date(storedPeriodStart).getTime() !== currentPeriodStart.getTime();
      
      if (needsReset) {
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
      logger.info('ENCOUNTERS', `[randomMonsterEncounters.js]✅ Reset ${resetCount} village raid quota(s)`);
    }
    
    return resetCount;
  } catch (error) {
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error resetting village raid quotas:', error);
    handleError(error, 'randomMonsterEncounters.js');
    return 0;
  }
}

// ============================================================================
// ------------------- Village Raid Distribution Helper Functions -------------------
// ============================================================================

// ------------------- Has Raid Within Last Day -------------------
function hasRaidWithinLastDay(lastRaidTime) {
  if (!lastRaidTime) return false;
  const now = new Date();
  const timeSinceLastRaid = now.getTime() - new Date(lastRaidTime).getTime();
  return timeSinceLastRaid < MIN_SPACING_MS;
}

// ------------------- Calculate Time-Based Probability -------------------
function calculateTimeBasedProbability(timeSinceReset, timeRemainingRatio) {
  const daysSinceReset = timeSinceReset / DAY_IN_MS;
  
  if (daysSinceReset < 1.5) {
    return 0.02 + (daysSinceReset / 1.5) * 0.03;
  }
  
  if (daysSinceReset < 4.5) {
    const progress = (daysSinceReset - 1.5) / 3.0;
    return 0.08 + progress * 0.07;
  }
  
  if (daysSinceReset < 6.5) {
    const progress = (daysSinceReset - 4.5) / 2.0;
    return 0.20 + progress * 0.20;
  }
  
  if (timeRemainingRatio < 0.1) {
    return 1.0;
  }
  
  const urgency = (1.0 - timeRemainingRatio) * 2.0;
  return Math.min(0.60 + urgency * 0.40, 1.0);
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
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Failed to rollback quota for ${villageDisplayName}:`, error);
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
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ ${errorMsg}`);
    if (channel) {
      await channel.send(`❌ **${errorMsg}**`);
    }
    return null;
  }
  
  const monster = monsters[Math.floor(Math.random() * monsters.length)];
  if (!monster || !monster.name || !monster.tier) {
    const errorMsg = `No eligible monsters found for region: ${villageRegion}`;
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ ${errorMsg}`);
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

// ------------------- Increment Village Raid Count -------------------
async function incrementVillageRaidCount(villageName, level) {
  try {
    const result = await Village.findOneAndUpdate(
      { name: villageName },
      { $inc: { raidQuotaCount: 1 } },
      { upsert: false, new: true }
    );
    
    if (!result) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Village ${villageName} not found for raid count increment`);
      return 0;
    }
    
    return result.raidQuotaCount || 1;
  } catch (error) {
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error incrementing raid count for ${villageName}:`, error);
    throw error;
  }
}

// ============================================================================
// ------------------- Raid Cooldown Management Functions -------------------
// ============================================================================

// ------------------- Get Cooldown Data -------------------
async function getCooldownData(cooldownKey) {
  try {
    const cooldownData = await TempData.findOne({ key: cooldownKey, type: 'temp' });
    
    if (!cooldownData) {
      const oldCooldownData = await TempData.findOne({ key: cooldownKey });
      if (oldCooldownData) {
        await TempData.findOneAndDelete({ key: cooldownKey });
      }
      return null;
    }
    
    const lastRaidTime = cooldownData.data.lastRaidTime;
    const currentTime = Date.now();
    const oneYearAgo = currentTime - (365 * 24 * 60 * 60 * 1000);
    
    if (lastRaidTime && lastRaidTime < oneYearAgo) {
      return null;
    }
    
    return cooldownData;
  } catch (error) {
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error getting cooldown data for ${cooldownKey}:`, error);
    return null;
  }
}

// ------------------- Get Global Raid Cooldown -------------------
async function getGlobalRaidCooldown() {
  const cooldownData = await getCooldownData(RAID_COOLDOWN_KEY);
  if (!cooldownData) {
    await resetGlobalRaidCooldown();
    return 0;
  }
  return cooldownData.data.lastRaidTime || 0;
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
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error setting raid cooldown:', error);
  }
}

// ------------------- Reset Global Raid Cooldown -------------------
async function resetGlobalRaidCooldown() {
  try {
    await TempData.findOneAndDelete({ key: RAID_COOLDOWN_KEY, type: 'temp' });
  } catch (error) {
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error resetting raid cooldown:', error);
  }
}

// ------------------- Get Village Raid Cooldown -------------------
async function getVillageRaidCooldown(villageName) {
  const cooldownKey = `${VILLAGE_RAID_COOLDOWN_PREFIX}${villageName.toLowerCase()}`;
  const cooldownData = await getCooldownData(cooldownKey);
  
  if (!cooldownData) {
    await resetVillageRaidCooldown(villageName);
    return 0;
  }
  
  return cooldownData.data.lastRaidTime || 0;
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
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error setting village raid cooldown for ${villageName}:`, error);
  }
}

// ------------------- Reset Village Raid Cooldown -------------------
async function resetVillageRaidCooldown(villageName) {
  try {
    const cooldownKey = `${VILLAGE_RAID_COOLDOWN_PREFIX}${villageName.toLowerCase()}`;
    await TempData.findOneAndDelete({ key: cooldownKey, type: 'temp' });
  } catch (error) {
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error resetting village raid cooldown for ${villageName}:`, error);
  }
}

// ============================================================================
// ------------------- Message Activity Tracking -------------------
// ============================================================================

// ------------------- Track Message Activity -------------------
function trackMessageActivity(channelId, userId, isBot, username) {
  if (isBot) return;
  if (EXCLUDED_CHANNELS.includes(channelId)) return;

  const currentTime = Date.now();

  if (!messageActivity.has(channelId)) {
    messageActivity.set(channelId, { messages: [], users: new Set() });
  }

  const activity = messageActivity.get(channelId);
  activity.messages = activity.messages
    .filter((timestamp) => currentTime - timestamp <= TIME_WINDOW)
    .concat(currentTime);
  activity.users.add(userId);
  messageActivity.set(channelId, activity);
}

// ============================================================================
// ------------------- Encounter Triggering Functions -------------------
// ============================================================================

// ------------------- Check for Random Encounter -------------------
async function checkForRandomEncounters(client) {
  const currentTime = Date.now();
  let totalMessages = 0;
  let totalUsers = new Set();
  const channelsToRemove = [];

  for (const [channelId, activity] of messageActivity.entries()) {
    if (EXCLUDED_CHANNELS.includes(channelId)) {
      continue;
    }
    
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;

    if (messageCount === 0 && uniqueUserCount === 0) {
      channelsToRemove.push(channelId);
      continue;
    }

    if (messageCount > 0) {
      totalMessages += messageCount;
      activity.users.forEach(userId => totalUsers.add(userId));
    }
  }

  for (const channelId of channelsToRemove) {
    messageActivity.delete(channelId);
  }

  const meetsThreshold = totalMessages >= MESSAGE_THRESHOLD && totalUsers.size >= MIN_ACTIVE_USERS;

  if (meetsThreshold) {
    for (const [channelId, activity] of messageActivity.entries()) {
      if (!EXCLUDED_CHANNELS.includes(channelId)) {
        messageActivity.set(channelId, { messages: [], users: new Set() });
      }
    }

    const villages = Object.keys(villageChannelMap);
    const selectedVillage = villages[Math.floor(Math.random() * villages.length)];
    const selectedVillageKey = selectedVillage.toLowerCase();
    const targetChannelId = villageChannelMap[selectedVillageKey];
    const raidChannel = client.channels.cache.get(targetChannelId);

    if (raidChannel && raidChannel.type === ChannelType.GuildText) {
      await triggerRandomEncounter(raidChannel, selectedVillage);
    } else {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Could not find channel for ${selectedVillage} (ID: ${targetChannelId})`);
    }
  }
}

// ------------------- Trigger Random Encounter -------------------
async function triggerRandomEncounter(channel, selectedVillage) {
  try {
    const villageRegion = getVillageRegionByName(selectedVillage);
    if (!villageRegion) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Invalid village: ${selectedVillage}`);
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
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Failed to trigger raid: ${result?.error || 'Unknown error'}`);
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }

    logger.info('ENCOUNTERS', `[randomMonsterEncounters.js]✅ Raid triggered in ${selectedVillage}: ${monster.name} (T${monster.tier})`);
  } catch (error) {
    if (error.message && error.message.includes('Raid cooldown active')) {
      return;
    }
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error triggering encounter:', error);
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// ------------------- Village Raid Quota Checking Functions -------------------
// ============================================================================

// ------------------- Check Village Raid Quotas -------------------
async function checkVillageRaidQuotas(client) {
  try {
    const villages = await Village.find({}).exec();
    
    if (!villages || villages.length === 0) {
      return;
    }
    
    const eligibleVillages = [];
    const now = new Date();
    
    for (const village of villages) {
      const villageName = village.name;
      const level = village.level || 1;
      const quota = getVillageQuota(level);
      
      const periodData = await checkAndResetPeriod(villageName, level);
      if (!periodData) {
        continue;
      }
      
      const eligibility = await isVillageEligibleForRaid(village, periodData, quota);
      if (!eligibility.eligible) {
        continue;
      }
      
      const periodStart = periodData.periodStart;
      const timeSinceReset = now.getTime() - periodStart.getTime();
      const timeRemainingRatio = getPeriodRemainingRatio(periodStart, level);
      
      if (timeRemainingRatio <= 0) {
        eligibleVillages.push({ village, periodData, quota });
        continue;
      }
      
      const probability = calculateTimeBasedProbability(timeSinceReset, timeRemainingRatio);
      const roll = Math.random();
      if (roll < probability) {
        eligibleVillages.push({ village, periodData, quota });
      }
    }
    
    if (eligibleVillages.length === 0) {
      return;
    }
    
    const selected = eligibleVillages[Math.floor(Math.random() * eligibleVillages.length)];
    const selectedVillage = selected.village;
    const selectedVillageName = selectedVillage.name.toLowerCase();
    const quota = selected.quota;
    
    const currentVillage = await Village.findOne({ name: selectedVillage.name }).exec();
    if (!currentVillage) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Village ${selectedVillage.name} not found during double-check`);
      return;
    }
    
    const currentPeriodStart = getVillagePeriodStart(selectedVillage.level || 1);
    const storedPeriodStart = currentVillage.raidQuotaPeriodStart ? new Date(currentVillage.raidQuotaPeriodStart) : null;
    const periodMatches = storedPeriodStart && Math.abs(storedPeriodStart.getTime() - currentPeriodStart.getTime()) < 1000;
    const currentCount = currentVillage.raidQuotaCount || 0;
    
    if (!periodMatches || currentCount >= quota) {
      logger.warn('ENCOUNTERS', `[randomMonsterEncounters.js]⚠️ Double-check failed for ${selectedVillage.name} - Period match: ${periodMatches}, Count: ${currentCount}/${quota}`);
      return;
    }
    
    const targetChannelId = villageChannelMap[selectedVillageName];
    if (!targetChannelId) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ No channel mapping found for ${selectedVillageName}`);
      return;
    }
    
    const raidChannel = client.channels.cache.get(targetChannelId);
    if (!raidChannel || raidChannel.type !== ChannelType.GuildText) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Could not find channel for ${selectedVillageName} (ID: ${targetChannelId})`);
      return;
    }
    
    await triggerQuotaBasedRaid(raidChannel, selectedVillageName, selectedVillage.name, selectedVillage.level || 1, quota);
    
  } catch (error) {
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error checking village raid quotas:', error);
    handleError(error, 'randomMonsterEncounters.js');
  }
}

// ------------------- Try Reserve Quota Slot -------------------
async function tryReserveQuotaSlot(villageName, level, quota) {
  try {
    const periodStart = getVillagePeriodStart(level);
    const periodType = level === 1 ? 'week' : 'month';
    
    const periodData = await checkAndResetPeriod(villageName, level);
    if (!periodData) {
      return { success: false, reason: 'Could not get period data' };
    }
    
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
    
    if (newCount > quota) {
      await Village.findOneAndUpdate(
        { name: villageName },
        { $inc: { raidQuotaCount: -1 } }
      );
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Quota exceeded for ${villageName} (${newCount}/${quota}) - rollback performed`);
      return { success: false, reason: 'Quota exceeded' };
    }
    
    return { success: true, newCount };
  } catch (error) {
    logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Error reserving quota slot for ${villageName}:`, error);
    return { success: false, reason: error.message };
  }
}

// ------------------- Trigger Quota-Based Raid -------------------
async function triggerQuotaBasedRaid(channel, selectedVillage, villageDisplayName, villageLevel, quota) {
  try {
    const currentVillage = await Village.findOne({ name: villageDisplayName }).exec();
    if (!currentVillage) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Village ${villageDisplayName} not found during pre-trigger check`);
      return;
    }
    
    const currentPeriodStart = getVillagePeriodStart(villageLevel);
    const storedPeriodStart = currentVillage.raidQuotaPeriodStart ? new Date(currentVillage.raidQuotaPeriodStart) : null;
    const periodMatches = storedPeriodStart && Math.abs(storedPeriodStart.getTime() - currentPeriodStart.getTime()) < 1000;
    const currentCount = currentVillage.raidQuotaCount || 0;
    
    if (!periodMatches || currentCount >= quota) {
      logger.warn('ENCOUNTERS', `[randomMonsterEncounters.js]⚠️ Pre-trigger check failed for ${villageDisplayName} - Period match: ${periodMatches}, Count: ${currentCount}/${quota}`);
      return;
    }
    
    const quotaReservation = await tryReserveQuotaSlot(villageDisplayName, villageLevel, quota);
    if (!quotaReservation.success) {
      logger.warn('ENCOUNTERS', `[randomMonsterEncounters.js]⚠️ Reservation failed for ${villageDisplayName}: ${quotaReservation.reason}`);
      return;
    }
    
    const villageRegion = getVillageRegionByName(selectedVillage);
    if (!villageRegion) {
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Invalid village: ${selectedVillage}`);
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
      logger.error('ENCOUNTERS', `[randomMonsterEncounters.js]❌ Failed to trigger quota-based raid: ${result?.error || 'Unknown error'}`);
      await rollbackQuotaReservation(villageDisplayName);
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }
    
    logger.info('ENCOUNTERS', `[randomMonsterEncounters.js]✅ Quota-based raid triggered in ${villageDisplayName}: ${monster.name} (T${monster.tier}) - ${quotaReservation.newCount}/${quota}`);
    
  } catch (error) {
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Error triggering quota-based raid:', error);
    await rollbackQuotaReservation(villageDisplayName);
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// ------------------- Timer Tracking -------------------
// ============================================================================
let encounterCheckInterval = null;
let cleanupInterval = null;

// ============================================================================
// ------------------- Initialization Function -------------------
// ============================================================================

// ------------------- Initialize Random Encounter Bot -------------------
async function initializeRandomEncounterBot(client) {
  if (encounterCheckInterval !== null) {
    clearInterval(encounterCheckInterval);
    logger.info('SYSTEM', '[randomMonsterEncounters.js]✅ Cleared existing encounter check interval');
  }
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    logger.info('SYSTEM', '[randomMonsterEncounters.js]✅ Cleared existing cleanup interval');
  }

  logger.info('SYSTEM', `[randomMonsterEncounters.js]🔍 Role restriction active - Users with role ${RESTRICTED_ROLE_ID} cannot trigger raids`);

  client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    
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

  encounterCheckInterval = setInterval(() => {
    checkForRandomEncounters(client).catch(error => {
      logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Encounter check failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, CHECK_INTERVAL);

  cleanupInterval = setInterval(() => {
    const currentTime = Date.now();
    const channelsToRemove = [];
    
    for (const [channelId, activity] of messageActivity.entries()) {
      if (EXCLUDED_CHANNELS.includes(channelId)) {
        continue;
      }
      
      activity.messages = activity.messages.filter(
        (timestamp) => currentTime - timestamp <= TIME_WINDOW
      );
      
      const oldestMessage = activity.messages.length > 0 
        ? Math.min(...activity.messages) 
        : currentTime;
      const timeSinceLastActivity = currentTime - oldestMessage;
      
      if (timeSinceLastActivity > TIME_WINDOW * 2) {
        channelsToRemove.push(channelId);
      }
    }
    
    for (const channelId of channelsToRemove) {
      messageActivity.delete(channelId);
    }
    
    if (channelsToRemove.length > 0) {
      logger.debug('ENCOUNTERS', `[randomMonsterEncounters.js]🔍 Cleaned up ${channelsToRemove.length} inactive channel(s) from messageActivity Map`);
    }
  }, CLEANUP_INTERVAL);

  resetAllVillageRaidQuotas().catch(error => {
    logger.error('ENCOUNTERS', '[randomMonsterEncounters.js]❌ Initial raid quota reset failed:', error);
    handleError(error, 'randomMonsterEncounters.js');
  });
  
  logger.info('ENCOUNTERS', '[randomMonsterEncounters.js]✅ Random encounters system initialized');
}

// ============================================================================
// ------------------- Cleanup Function -------------------
// ============================================================================

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
    logger.info('SYSTEM', `[randomMonsterEncounters.js]✅ Cleaned up ${cleanedCount} timer(s)`);
  }
  
  return cleanedCount;
}

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================
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
