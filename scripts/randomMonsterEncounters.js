// ------------------- randomEncounters.js -------------------
// This module handles random encounters in the game.
// It tracks message activity in channels, determines if an encounter should be triggered,
// creates encounter embeds, and triggers random encounters based on server activity.
// It also manages the timing and channel selection for encounters.

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { ChannelType } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Local Modules & Database Models
// ------------------- Importing local services and models -------------------
const { getMonstersAboveTierByRegion, fetchMonsterByName } = require('../database/db');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer, storeRaidProgress, getRaidProgressById } = require('../modules/raidModule');
const { capitalizeVillageName } = require('../utils/stringUtils');

// ============================================================================
// Environment Configuration
// ------------------- Load environment variables -------------------
require('dotenv').config();

// ============================================================================
// Constants
// ------------------- Define thresholds and timing constants -------------------
const MESSAGE_THRESHOLD = 50;            // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4;               // Minimum unique users required for an encounter
const TIME_WINDOW = 30 * 60 * 1000;         // 10 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000;           // Check every 30 seconds

// ------------------- Village Channels -------------------
// Maps village names to their respective channel IDs (from environment variables)
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
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
// Tracks message timestamps and unique users in each channel.
const messageActivity = new Map();

function trackMessageActivity(channelId, userId, isBot, username) {
  if (isBot) return; // Ignore bot messages

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
  let totalActivity = 0;

  for (const [channelId, activity] of messageActivity.entries()) {
    // Remove outdated messages.
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;
    const meetsThreshold = messageCount >= MESSAGE_THRESHOLD && uniqueUserCount >= MIN_ACTIVE_USERS;

    if (messageCount > 0) {
      totalActivity += messageCount;
      console.log(`[randomMonsterEncounters.js]: 📊 Channel ${channelId}: ${messageCount} messages, ${uniqueUserCount} users`);
    }

    if (meetsThreshold) {
      console.log(`[randomMonsterEncounters.js]: 🐉 TRIGGERING ENCOUNTER! Channel: ${channelId} (${messageCount} messages, ${uniqueUserCount} users)`);
      // Reset the activity for the channel.
      messageActivity.set(channelId, { messages: [], users: new Set() });

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

  if (totalActivity === 0) {
    console.log(`[randomMonsterEncounters.js]: 💤 No activity detected in any channels`);
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
    console.log(`[randomMonsterEncounters.js]: 🚀 Triggering raid for ${monster.name} in ${selectedVillage}`);
    
    const result = await triggerRaid(monster, mockInteraction, selectedVillage, false);

    if (!result || !result.success) {
      console.error(`[randomMonsterEncounters.js]: ❌ Failed to trigger raid: ${result?.error || 'Unknown error'}`);
      await channel.send(`❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`);
      return;
    }

    console.log(`[randomMonsterEncounters.js]: ✅ Raid triggered successfully in ${selectedVillage} channel`);
    console.log(`[randomMonsterEncounters.js]: 🎉 RANDOM ENCOUNTER COMPLETE! ${monster.name} (T${monster.tier}) in ${selectedVillage}`);
  } catch (error) {
    console.error('[randomMonsterEncounters.js]: ❌ Error triggering encounter:', error);
    await handleError(error, 'randomMonsterEncounters.js');
  }
}

// ============================================================================
// Initialization Function
// ------------------- Initialize Random Encounter Bot -------------------
function initializeRandomEncounterBot(client) {
  // Set up message tracking
  client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    trackMessageActivity(
      message.channel.id,
      message.author.id,
      message.author.bot,
      message.author.username
    );
  });

  // Start periodic encounter checks
  setInterval(() => {
    console.log(`[randomMonsterEncounters.js]: 🔍 Checking for random encounters... (${new Date().toLocaleTimeString()})`);
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
  triggerRandomEncounter
};
