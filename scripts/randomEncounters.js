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
const { getMonstersAboveTierByRegion } = require('../database/db');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer } = require('../modules/raidModule');

// ============================================================================
// Environment Configuration
// ------------------- Load environment variables -------------------
require('dotenv').config();

// ============================================================================
// Constants
// ------------------- Define thresholds and timing constants -------------------
const MESSAGE_THRESHOLD = 100;            // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4;               // Minimum unique users required for an encounter
const TIME_WINDOW = 10 * 60 * 1000;         // 10 minutes in milliseconds
const CHECK_INTERVAL = 20 * 1000;           // Check every 20 seconds

// ------------------- Village Channels -------------------
// Maps village names to their respective channel IDs (from environment variables)
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
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

  for (const [channelId, activity] of messageActivity.entries()) {
    // Remove outdated messages.
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;
    const meetsThreshold = messageCount >= MESSAGE_THRESHOLD && uniqueUserCount >= MIN_ACTIVE_USERS;

    if (meetsThreshold) {
      console.log(`[Encounter LOG] Triggering encounter for channel: ${channelId}`);
      // Reset the activity for the channel.
      messageActivity.set(channelId, { messages: [], users: new Set() });

      // Randomly choose a village channel.
      const villageChannelIds = Object.values(villageChannels);
      const randomChannelId = villageChannelIds[Math.floor(Math.random() * villageChannelIds.length)];
      const randomChannel = client.channels.cache.get(randomChannelId);

      if (randomChannel && randomChannel.type === ChannelType.GuildText) {
        await triggerRandomEncounter(randomChannel);
      }
    }
  }
}

// ============================================================================
// Random Encounter Trigger
// ------------------- Trigger Random Encounter -------------------
async function triggerRandomEncounter(channel) {
  try {
    // Identify the village corresponding to the channel.
    const selectedVillage = Object.keys(villageChannels).find(key => villageChannels[key] === channel.id);
    if (!selectedVillage) {
      console.error('[Encounter LOG] No matching village found for the channel:', channel.name);
      return;
    }

    // Get the village region.
    const villageRegion = getVillageRegionByName(selectedVillage);

    // Select a monster above tier 5 from the region.
    const monster = await getMonstersAboveTierByRegion(5, villageRegion);
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[Encounter LOG] No eligible monsters found for region: ${villageRegion}`);
      await channel.send(`❌ **Error: No eligible monsters found for the region: ${villageRegion}.**`);
      return;
    }

    // Generate a battle ID and create an encounter embed.
    const battleId = Date.now();
    const character = { name: 'Village Defender', currentVillage: selectedVillage }; // Dummy character for embed
    const encounterEmbed = createRaidEmbed(character, monster, battleId);

    // Send the encounter message and start a thread for the battle.
    const sentMessage = await channel.send({
      content: `> ⚠️ **A ${monster.name} has appeared in ${selectedVillage}!** Residents and visitors, please respond to the threat!`,
      embeds: [encounterEmbed],
    });

    const thread = await sentMessage.startThread({
      name: `⚠️ ${selectedVillage} Attack: ${monster.name}`,
      autoArchiveDuration: 1440,
      reason: 'Random Encounter',
    });

    // Schedule the raid timer
    scheduleRaidTimer(selectedVillage, monster, thread);
  } catch (error) {
    handleError(error, 'randomEncounters.js');
    console.error('[Encounter LOG] Error triggering encounter:', error);
  }
}

// ============================================================================
// Bot Initialization for Random Encounters
// ------------------- Initialize Random Encounter Bot -------------------
function initializeRandomEncounterBot(client) {
  client.on('messageCreate', (message) => {
    if (message.author.bot) return; // Ignore bot messages
    trackMessageActivity(message.channel.id, message.author.id, message.author.bot, message.author.username);
  });

  setInterval(() => checkForRandomEncounters(client), CHECK_INTERVAL);
}

// ============================================================================
// Module Exports
// ------------------- Exporting Initialization Function -------------------
module.exports = { initializeRandomEncounterBot };
