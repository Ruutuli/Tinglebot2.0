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

const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');
// ============================================================================
// Local Modules & Database Models
// ------------------- Importing local services and models -------------------
const { getMonstersAboveTierByRegion, fetchMonsterByName } = require('../database/db');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer, storeRaidProgress, getRaidProgressById } = require('../modules/raidModule');
const { capitalizeVillageName } = require('../utils/stringUtils');
const TempData = require('../models/TempDataModel');

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
    const monster = await getMonstersAboveTierByRegion(5, villageRegion);
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

  // Start periodic encounter checks
  setInterval(() => {
    checkForRandomEncounters(client).catch(error => {
      console.error('[randomMonsterEncounters.js]: ❌ Encounter check failed:', error);
      handleError(error, 'randomMonsterEncounters.js');
    });
  }, CHECK_INTERVAL);

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
  resetGlobalRaidCooldown
};
