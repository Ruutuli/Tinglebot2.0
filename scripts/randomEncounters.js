// ------------------- randomEncounters.js -------------------
// This module handles random encounters in the game.
// It tracks message activity in channels, determines if an encounter should be triggered,
// creates encounter embeds, and triggers random encounters based on server activity.
// It also manages the timing and channel selection for encounters.

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { ChannelType, EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Local Modules & Database Models
// ------------------- Importing local services and models -------------------
const { getMonstersAboveTierByRegion } = require('../database/db');
const { monsterMapping } = require('../models/MonsterModel');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { applyVillageDamage } = require('../modules/villageModule');

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
// Checks message activity in each channel; if thresholds are met, triggers an encounter.
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
// Encounter Embed Creation
// ------------------- Create Encounter Embed -------------------
// Generates a Discord embed for a monster encounter with details such as monster hearts, tier, and battle ID.
function createEncounterEmbed(monster, battleId) {
  const fallbackImage = 'https://via.placeholder.com/150';
  const monsterData = monsterMapping[monster.nameMapping] || {};
  const monsterImage = monsterData.image || monster.image || fallbackImage;

  return new EmbedBuilder()
    .setTitle(`⚔️ **A Wild ${monster.name} Has Appeared!**`)
    .setDescription(
      `📢 **Commands to Engage:**\n` +
      `> 🔥 **Join the Raid:** Use </raid:1319247998412132384> \n` +
      `> 💊 **Heal During Raid:** Use </item:1306176789755858979> \n\n`
    )
    .addFields(
      { name: `💙 __Monster Hearts__`, value: `> ${monster.hearts} / ${monster.hearts}`, inline: false },
      { name: `⭐ __Tier__`, value: `> **Tier ${monster.tier}**`, inline: false },
      { name: `🔢 __Battle ID__`, value: `\`\`\`${battleId}\`\`\``, inline: false }
    )
    .setThumbnail(monsterImage.startsWith('http') ? monsterImage : fallbackImage)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ text: "⚠️ Act Quickly! You have 10 minutes to complete this raid!" })
    .setColor('#FF4500');
}


// ============================================================================
// Random Encounter Trigger
// ------------------- Trigger Random Encounter -------------------
// Triggers a random encounter in a given channel by selecting a monster and starting a battle thread.
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
    const encounterEmbed = createEncounterEmbed(monster, battleId, selectedVillage);

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

    // Set a timer to apply village damage after 10 minutes.
    const timerDuration = 10 * 60 * 1000;
    setTimeout(async () => {
      try {
        await applyVillageDamage(selectedVillage, monster, thread);
      } catch (error) {
    handleError(error, 'randomEncounters.js');

        console.error(`[Timer LOG] Error during applyVillageDamage execution:`, error);
      }
    }, timerDuration);
  } catch (error) {
    handleError(error, 'randomEncounters.js');

    console.error('[Encounter LOG] Error triggering encounter:', error);
  }
}


// ============================================================================
// Bot Initialization for Random Encounters
// ------------------- Initialize Random Encounter Bot -------------------
// Listens for message events to track activity and periodically checks for random encounters.
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
