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

const { handleError } = require('../../shared/utils/globalErrorHandler');
const logger = require('../../shared/utils/logger');
// ============================================================================
// Local Modules & Database Models
// ------------------- Importing local services and models -------------------
const { getMonstersAboveTierByRegion, fetchMonsterByName } = require('../../shared/database/db');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer, storeRaidProgress, getRaidProgressById } = require('../modules/raidModule');
const { capitalizeVillageName } = require('../../shared/utils/stringUtils');
const TempData = require('../../shared/models/TempDataModel');
const { Village } = require('../../shared/models/VillageModel');

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
// Message Activity Tracking & Cooldown System
// ------------------- Track Server Activity -------------------
// Tracks message timestamps and unique users in each channel.
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
// ------------------- Get Current Week Start (Sunday) -------------------
function getCurrentWeekStart() {
  const now = new Date();
  const date = new Date(now);
  // Sunday is 0, so subtract day of week to get Sunday
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

// ------------------- Get Current Month Start (First Monday) -------------------
function getCurrentMonthStart() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Find first Monday of the month
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  let dayOfWeek = date.getDay();
  // If day 1 is not Monday, find the first Monday
  // Monday = 1, so if dayOfWeek is 0 (Sunday), add 1; if 2-6, subtract to get Monday
  if (dayOfWeek === 0) {
    // If 1st is Sunday, Monday is 2nd
    date.setDate(2);
  } else if (dayOfWeek > 1) {
    // If 1st is Tuesday-Saturday, find next Monday
    const daysUntilMonday = 8 - dayOfWeek; // 8 - dayOfWeek gives us days to add
    date.setDate(1 + daysUntilMonday);
  }
  
  date.setHours(0, 0, 0, 0);
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

// ------------------- Get Period End Date -------------------
function getPeriodEnd(periodStart, level) {
  const end = new Date(periodStart);
  if (level === 1) {
    // Week ends on Saturday 23:59:59
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    // Month: find first Monday of next month, then go back 1 day
    end.setMonth(end.getMonth() + 1);
    end.setDate(1);
    // Find first Monday of next month
    let dayOfWeek = end.getDay();
    if (dayOfWeek === 0) {
      end.setDate(2);
    } else if (dayOfWeek > 1) {
      const daysUntilMonday = 8 - dayOfWeek;
      end.setDate(1 + daysUntilMonday);
    }
    // Go back 1 day to get last day of current period
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
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
        raidQuotaPeriodType: periodType
      },
      { upsert: false, new: true }
    );
    console.log(`[randomMonsterEncounters.js]: ✅ Updated raid quota for ${villageName}: ${raidCount} raids (${periodType})`);
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error setting village period data for ${villageName}:`, error);
  }
}

// ------------------- Check And Reset Period -------------------
async function checkAndResetPeriod(villageName, level) {
  const currentPeriodStart = getVillagePeriodStart(level);
  const periodData = await getVillagePeriodData(villageName);
  
  if (!periodData || periodData.periodStart.getTime() !== currentPeriodStart.getTime()) {
    // Period has changed, reset
    const periodType = level === 1 ? 'week' : 'month';
    await setVillagePeriodData(villageName, currentPeriodStart, 0, periodType);
    console.log(`[randomMonsterEncounters.js]: 🔄 Reset raid quota period for ${villageName} (${periodType})`);
    return {
      periodStart: currentPeriodStart,
      raidCount: 0,
      periodType: periodType
    };
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
      console.log('[randomMonsterEncounters.js]: ⚠️ No villages found in database');
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
            raidQuotaPeriodType: periodType
          }
        );
        
        console.log(`[randomMonsterEncounters.js]: ✅ Reset raid quota for ${villageName} (L${level}, ${periodType})`);
        resetCount++;
      }
    }
    
    if (resetCount > 0) {
      console.log(`[randomMonsterEncounters.js]: 🔄 Reset ${resetCount} village raid quota(s)`);
    } else {
      console.log('[randomMonsterEncounters.js]: ✓ All village raid quotas are current');
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
    console.log(`[randomMonsterEncounters.js]: ✅ Atomically incremented raid count for ${villageName} to ${newCount}`);
    
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
        console.log('[randomMonsterEncounters.js]: 🧹 Found old cooldown entry without type field, cleaning up...');
        await TempData.findOneAndDelete({ key: RAID_COOLDOWN_KEY });
      }
      return 0;
    }
    
    // Validate the timestamp is reasonable (not more than 1 year ago)
    const lastRaidTime = cooldownData.data.lastRaidTime;
    const currentTime = Date.now();
    const oneYearAgo = currentTime - (365 * 24 * 60 * 60 * 1000);
    
    if (lastRaidTime && lastRaidTime < oneYearAgo) {
      console.log('[randomMonsterEncounters.js]: 🧹 Found corrupted cooldown timestamp, resetting...');
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
    console.log(`[randomMonsterEncounters.js]: ⏰ Global raid cooldown set to: ${new Date(timestamp).toISOString()}`);
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error setting raid cooldown:', error);
  }
}

// ------------------- Reset Global Raid Cooldown -------------------
async function resetGlobalRaidCooldown() {
  try {
    await TempData.findOneAndDelete({ key: RAID_COOLDOWN_KEY, type: 'temp' });
    console.log(`[randomMonsterEncounters.js]: 🔄 Global raid cooldown reset - raids can now be triggered immediately`);
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error resetting raid cooldown:', error);
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

  // First pass: collect total activity across all channels
  for (const [channelId, activity] of messageActivity.entries()) {
    // Skip excluded channels
    if (EXCLUDED_CHANNELS.includes(channelId)) {
      continue;
    }
    
    // Remove outdated messages.
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;

    if (messageCount > 0) {
      totalMessages += messageCount;
      activity.users.forEach(userId => totalUsers.add(userId));
      activeChannels++;
    }
  }

  // Check if server-wide activity meets threshold
  const meetsThreshold = totalMessages >= MESSAGE_THRESHOLD && totalUsers.size >= MIN_ACTIVE_USERS;

  if (meetsThreshold) {
    console.log(`[randomMonsterEncounters.js]: 🐉 TRIGGERING ENCOUNTER! Server-wide activity: ${totalMessages} messages, ${totalUsers.size} users across ${activeChannels} channels`);
    
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
    
    console.log(`[randomMonsterEncounters.js]: 🎯 Selected village for raid: ${selectedVillage}`);
    
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
    console.log(`[randomMonsterEncounters.js]: 🎯 Processing raid for village: ${selectedVillage}`);
    
    // Get the village region.
    const villageRegion = getVillageRegionByName(selectedVillage);
    console.log(`[randomMonsterEncounters.js]: 🗺️ Village region: ${villageRegion}`);

    if (!villageRegion) {
      console.error(`[randomMonsterEncounters.js]: ❌ Invalid village: ${selectedVillage}`);
      await channel.send(`❌ **Invalid village: ${selectedVillage}**`);
      return;
    }

    // Select a monster above tier 5 from the region.
    // Filter out Yiga monsters - they should not appear in regular raids
    const Monster = require('../../shared/models/MonsterModel');
    const monsters = await Monster.find({
      tier: { $gte: 5 },
      [villageRegion.toLowerCase()]: true,
      $or: [
        { species: { $exists: false } },
        { species: { $ne: 'Yiga' } }
      ]
    }).exec();
    
    if (!monsters || monsters.length === 0) {
      console.error(`[randomMonsterEncounters.js]: ❌ No eligible monsters (excluding Yiga) found for region: ${villageRegion}`);
      await channel.send(`❌ **No tier 5+ monsters (excluding Yiga) found in ${villageRegion} region for ${selectedVillage}.**`);
      return;
    }
    
    const monster = monsters[Math.floor(Math.random() * monsters.length)];
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[randomMonsterEncounters.js]: ❌ No eligible monsters found for region: ${villageRegion}`);
      await channel.send(`❌ **No tier 5+ monsters found in ${villageRegion} region for ${selectedVillage}.**`);
      return;
    }

    console.log(`[randomMonsterEncounters.js]: 🐉 Selected monster: ${monster.name} (Tier ${monster.tier}) from ${villageRegion} region`);

    // Create a mock interaction object for the triggerRaid function
    const mockInteraction = {
      channel: channel,
      client: channel.client,
      user: { id: 'random-encounter-bot', tag: 'Random Encounter Bot' },
      guild: channel.guild,
      editReply: async (options) => {
        return await channel.send(options);
      },
      followUp: async (options) => {
        return await channel.send(options);
      }
    };
    
    // Use the same triggerRaid function as the mod command
    const { triggerRaid } = require('../modules/raidModule');
    
    // Capitalize the village name to match the RaidModel enum values
    const capitalizedVillage = capitalizeVillageName(selectedVillage);
    console.log(`[randomMonsterEncounters.js]: 🚀 Triggering raid for ${monster.name} in ${capitalizedVillage}`);
    
    const result = await triggerRaid(monster, mockInteraction, capitalizedVillage, false);

    if (!result || !result.success) {
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to trigger raid: ${result?.error || 'Unknown error'}`);
      
      // Don't send error messages to channel for cooldown - this is expected behavior
      if (result?.error && result.error.includes('Raid cooldown active')) {
        console.log(`[randomMonsterEncounters.js]: ⏰ Raid cooldown active - skipping random encounter`);
        return;
      }
      
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }

    console.log(`[randomMonsterEncounters.js]: ✅ Raid triggered successfully in ${selectedVillage} channel`);
    console.log(`[randomMonsterEncounters.js]: 🎉 RANDOM ENCOUNTER COMPLETE! ${monster.name} (T${monster.tier}) in ${selectedVillage}`);
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error triggering encounter:', error);
    
    // Don't send cooldown errors to Discord - they're expected behavior
    if (error.message && error.message.includes('Raid cooldown active')) {
      console.log(`[randomMonsterEncounters.js]: ⏰ Raid cooldown active - skipping random encounter`);
      return;
    }
    
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// Village Raid Quota Checking Functions
// ------------------- Check Village Raid Quotas -------------------
async function checkVillageRaidQuotas(client) {
  try {
    // Fetch all villages from database
    const villages = await Village.find({}).exec();
    
    if (!villages || villages.length === 0) {
      console.log('[randomMonsterEncounters.js]: ⚠️ No villages found in database');
      return;
    }
    
    const eligibleVillages = [];
    
    // Check each village for quota status
    for (const village of villages) {
      const villageName = village.name;
      const level = village.level || 1;
      const quota = getVillageQuota(level);
      
      // Check and reset period if needed
      const periodData = await checkAndResetPeriod(villageName, level);
      
      if (!periodData) {
        console.log(`[randomMonsterEncounters.js]: ⚠️ Could not get period data for ${villageName}`);
        continue;
      }
      
      const raidCount = periodData.raidCount || 0;
      const quotaRemaining = Math.max(0, quota - raidCount);
      
      // If quota is already met, skip this village
      if (quotaRemaining <= 0) {
        continue;
      }
      
      // Calculate urgency based on time remaining and quota remaining
      const periodStart = periodData.periodStart;
      const timeRemainingRatio = getPeriodRemainingRatio(periodStart, level);
      
      if (timeRemainingRatio <= 0) {
        // Period ended but quota not met - should have been handled by reset, but trigger anyway
        eligibleVillages.push({ village, urgency: 1.0 });
        continue;
      }
      
      // Calculate urgency: higher urgency = higher probability
      // urgency = (quotaRemaining / quotaTotal) / timeRemainingRatio
      const urgency = quotaRemaining / quota / timeRemainingRatio;
      
      // Calculate probability based on urgency
      // Early period: 5-10% chance per hour
      // Mid period: 15-25% chance per hour
      // Late period: 50-100% chance per hour
      let probability = 0.05; // Base 5% chance
      if (urgency > 2) {
        // Very urgent - high probability (50-100%)
        probability = 0.5 + (urgency - 2) * 0.25;
        probability = Math.min(1.0, probability);
      } else if (urgency > 1) {
        // Moderately urgent - medium probability (15-25%)
        probability = 0.15 + (urgency - 1) * 0.1;
      } else if (urgency > 0.5) {
        // Some urgency - low-medium probability (10-15%)
        probability = 0.10 + (urgency - 0.5) * 0.1;
      }
      
      // If very little time remains (less than 10% of period), guarantee raid
      if (timeRemainingRatio < 0.1 && quotaRemaining > 0) {
        probability = 1.0;
      }
      
      // Random roll
      const roll = Math.random();
      
      if (roll < probability) {
        eligibleVillages.push({ village, urgency, probability });
        console.log(`[randomMonsterEncounters.js]: 🎲 ${villageName} (L${level}) eligible for raid - urgency: ${urgency.toFixed(2)}, prob: ${(probability * 100).toFixed(1)}%, rolled: ${(roll * 100).toFixed(1)}%`);
      }
    }
    
    // If no villages are eligible, return
    if (eligibleVillages.length === 0) {
      return;
    }
    
    // Select a random eligible village
    const selected = eligibleVillages[Math.floor(Math.random() * eligibleVillages.length)];
    const selectedVillage = selected.village;
    const selectedVillageName = selectedVillage.name.toLowerCase();
    
    console.log(`[randomMonsterEncounters.js]: 🎯 Selected ${selectedVillage.name} (L${selectedVillage.level}) for quota-based raid`);
    
    // Get the target channel for the selected village
    const targetChannelId = villageChannelMap[selectedVillageName];
    if (!targetChannelId) {
      console.error(`[randomMonsterEncounters.js]: ❌ No channel mapping found for ${selectedVillageName}`);
      return;
    }
    
    const raidChannel = client.channels.cache.get(targetChannelId);
    
    if (raidChannel && raidChannel.type === ChannelType.GuildText) {
      // Trigger the raid (pass level and quota for atomic quota reservation)
      const quota = getVillageQuota(selectedVillage.level || 1);
      await triggerQuotaBasedRaid(raidChannel, selectedVillageName, selectedVillage.name, selectedVillage.level || 1, quota);
    } else {
      console.error(`[randomMonsterEncounters.js]: ❌ Could not find channel for ${selectedVillageName} (ID: ${targetChannelId})`);
    }
    
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error checking village raid quotas:', error);
    handleError(error, 'randomMonsterEncounters.js');
  }
}

// ------------------- Try Reserve Quota Slot (Atomic) -------------------
async function tryReserveQuotaSlot(villageName, level, quota) {
  try {
    const periodStart = getVillagePeriodStart(level);
    const periodType = level === 1 ? 'week' : 'month';
    
    // First, ensure the period data exists and is current
    // This resets the period if needed, so we can trust it
    const periodData = await checkAndResetPeriod(villageName, level);
    if (!periodData) {
      return { success: false, reason: 'Could not get period data' };
    }
    
    // Atomically increment only if current count is less than quota AND period matches
    // This prevents race conditions where multiple checks happen simultaneously
    // We need to check both: period matches AND count is less than quota
    const result = await Village.findOneAndUpdate(
      { 
        name: villageName,
        $and: [
          {
            $or: [
              { raidQuotaPeriodStart: { $exists: false } },
              { raidQuotaPeriodStart: periodStart } // Ensure period matches
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
          raidQuotaPeriodType: periodType
        }
      },
      { upsert: false, new: true }
    );
    
    if (!result) {
      // Another process already reserved the last slot or period mismatch
      return { success: false, reason: 'Quota already met or period mismatch' };
    }
    
    const newCount = result.raidQuotaCount || 1;
    
    // Double-check we didn't exceed quota (shouldn't happen with the condition above, but be safe)
    if (newCount > quota) {
      // Rollback the increment
      await Village.findOneAndUpdate(
        { name: villageName },
        { $inc: { raidQuotaCount: -1 } }
      );
      return { success: false, reason: 'Quota exceeded' };
    }
    
    console.log(`[randomMonsterEncounters.js]: ✅ Reserved quota slot for ${villageName}: ${newCount}/${quota} (period: ${periodType})`);
    return { success: true, newCount };
  } catch (error) {
    console.error(`[randomMonsterEncounters.js]: ❌ Error reserving quota slot for ${villageName}:`, error);
    return { success: false, reason: error.message };
  }
}

// ------------------- Trigger Quota-Based Raid -------------------
async function triggerQuotaBasedRaid(channel, selectedVillage, villageDisplayName, villageLevel, quota) {
  try {
    console.log(`[randomMonsterEncounters.js]: 🎯 Processing quota-based raid for village: ${villageDisplayName}`);
    
    // Atomically reserve a quota slot BEFORE triggering the raid
    // This prevents race conditions where multiple checks happen simultaneously
    const quotaReservation = await tryReserveQuotaSlot(villageDisplayName, villageLevel, quota);
    
    if (!quotaReservation.success) {
      console.log(`[randomMonsterEncounters.js]: ⚠️ Could not reserve quota slot for ${villageDisplayName}: ${quotaReservation.reason}`);
      return;
    }
    
    // Get the village region
    const villageRegion = getVillageRegionByName(selectedVillage);
    console.log(`[randomMonsterEncounters.js]: 🗺️ Village region: ${villageRegion}`);
    
    if (!villageRegion) {
      console.error(`[randomMonsterEncounters.js]: ❌ Invalid village: ${selectedVillage}`);
      // Rollback the quota reservation
      await Village.findOneAndUpdate(
        { name: villageDisplayName },
        { $inc: { raidQuotaCount: -1 } }
      );
      await channel.send(`❌ **Invalid village: ${selectedVillage}**`);
      return;
    }
    
    // Select a monster above tier 5 from the region
    // Filter out Yiga monsters - they should not appear in regular raids
    const Monster = require('../../shared/models/MonsterModel');
    const monsters = await Monster.find({
      tier: { $gte: 5 },
      [villageRegion.toLowerCase()]: true,
      $or: [
        { species: { $exists: false } },
        { species: { $ne: 'Yiga' } }
      ]
    }).exec();
    
    if (!monsters || monsters.length === 0) {
      console.error(`[randomMonsterEncounters.js]: ❌ No eligible monsters (excluding Yiga) found for region: ${villageRegion}`);
      // Rollback the quota reservation
      await Village.findOneAndUpdate(
        { name: villageDisplayName },
        { $inc: { raidQuotaCount: -1 } }
      );
      await channel.send(`❌ **No tier 5+ monsters (excluding Yiga) found in ${villageRegion} region for ${villageDisplayName}.**`);
      return;
    }
    
    const monster = monsters[Math.floor(Math.random() * monsters.length)];
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[randomMonsterEncounters.js]: ❌ No eligible monsters found for region: ${villageRegion}`);
      // Rollback the quota reservation
      await Village.findOneAndUpdate(
        { name: villageDisplayName },
        { $inc: { raidQuotaCount: -1 } }
      );
      await channel.send(`❌ **No tier 5+ monsters found in ${villageRegion} region for ${villageDisplayName}.**`);
      return;
    }
    
    console.log(`[randomMonsterEncounters.js]: 🐉 Selected monster: ${monster.name} (Tier ${monster.tier}) from ${villageRegion} region`);
    
    // Create a mock interaction object for the triggerRaid function
    const mockInteraction = {
      channel: channel,
      client: channel.client,
      user: { id: 'quota-raid-bot', tag: 'Quota Raid Bot' },
      guild: channel.guild,
      editReply: async (options) => {
        return await channel.send(options);
      },
      followUp: async (options) => {
        return await channel.send(options);
      }
    };
    
    // Use the same triggerRaid function as the mod command
    const { triggerRaid } = require('../modules/raidModule');
    
    // Capitalize the village name to match the RaidModel enum values
    const capitalizedVillage = capitalizeVillageName(selectedVillage);
    console.log(`[randomMonsterEncounters.js]: 🚀 Triggering quota-based raid for ${monster.name} in ${capitalizedVillage}`);
    
    // Trigger raid with isQuotaBased flag set to true
    const result = await triggerRaid(monster, mockInteraction, capitalizedVillage, false, null, true);
    
    if (!result || !result.success) {
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to trigger quota-based raid: ${result?.error || 'Unknown error'}`);
      // Rollback the quota reservation if raid failed
      await Village.findOneAndUpdate(
        { name: villageDisplayName },
        { $inc: { raidQuotaCount: -1 } }
      );
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }
    
    // Quota was already incremented before triggering, so we're done
    console.log(`[randomMonsterEncounters.js]: ✅ Quota-based raid triggered successfully in ${villageDisplayName} channel (quota: ${quotaReservation.newCount}/${quota})`);
    console.log(`[randomMonsterEncounters.js]: 🎉 QUOTA-BASED RAID COMPLETE! ${monster.name} (T${monster.tier}) in ${villageDisplayName}`);
    
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error triggering quota-based raid:', error);
    
    // Try to rollback quota on error
    try {
      await Village.findOneAndUpdate(
        { name: villageDisplayName },
        { $inc: { raidQuotaCount: -1 } }
      );
    } catch (rollbackError) {
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to rollback quota for ${villageDisplayName}:`, rollbackError);
    }
    
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// Initialization Function
// ------------------- Initialize Random Encounter Bot -------------------
async function initializeRandomEncounterBot(client) {
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
  setInterval(() => {
    checkForRandomEncounters(client).catch(error => {
      console.error('[randomMonsterEncounters.js]: ❌ Encounter check failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, CHECK_INTERVAL);

  // Note: Hourly quota checks are handled by scheduler.js
  
  // Also check immediately on startup (after a short delay to let everything initialize)
  setTimeout(() => {
    checkVillageRaidQuotas(client).catch(error => {
      console.error('[randomMonsterEncounters.js]: ❌ Initial village quota check failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, 60000); // Check after 1 minute

  // Also run immediately on startup to reset any outdated periods
  // (The scheduler.js handles daily resets at midnight)
  setTimeout(() => {
    resetAllVillageRaidQuotas().catch(error => {
      console.error('[randomMonsterEncounters.js]: ❌ Initial raid quota reset failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, 30000); // Check after 30 seconds

}

// ============================================================================
// Exports
// ------------------- Export Functions -------------------
module.exports = {
  initializeRandomEncounterBot,
  trackMessageActivity,
  checkForRandomEncounters,
  triggerRandomEncounter,
  getGlobalRaidCooldown,
  setGlobalRaidCooldown,
  resetGlobalRaidCooldown,
  checkVillageRaidQuotas,
  incrementVillageRaidCount,
  getVillagePeriodData,
  setVillagePeriodData,
  resetAllVillageRaidQuotas
};
