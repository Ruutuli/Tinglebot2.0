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
const TIME_WINDOW = 10 * 60 * 1000;         // 10 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000;           // Check every 30 seconds

// ------------------- Village Channels -------------------
// Maps village names to their respective channel IDs (from environment variables)
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};

// Temporary raid channel - all raids will happen here
const TEMP_RAID_CHANNEL_ID = '1391812848099004578';

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

      // Use the temporary raid channel instead of randomly choosing a village channel
      const raidChannel = client.channels.cache.get(TEMP_RAID_CHANNEL_ID);

      if (raidChannel && raidChannel.type === ChannelType.GuildText) {
        await triggerRandomEncounter(raidChannel);
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
async function triggerRandomEncounter(channel) {
  try {
    // For temporary channel, we'll use a random village for the monster selection
    const villages = Object.keys(villageChannels);
    const selectedVillage = villages[Math.floor(Math.random() * villages.length)];
    
    console.log(`[randomMonsterEncounters.js]: 🎯 Selected village: ${selectedVillage}`);
    
    // Get the village region.
    const villageRegion = getVillageRegionByName(selectedVillage);
    console.log(`[randomMonsterEncounters.js]: 🗺️ Village region: ${villageRegion}`);

    // Select a monster above tier 5 from the region.
    const monster = await getMonstersAboveTierByRegion(5, villageRegion);
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[randomMonsterEncounters.js]: ❌ No eligible monsters found for region: ${villageRegion}`);
      await channel.send(`❌ **No eligible monsters found for ${selectedVillage} region.**`);
      return;
    }

    console.log(`[randomMonsterEncounters.js]: 🐉 Selected monster: ${monster.name} (Tier ${monster.tier}) from ${villageRegion} region`);

    // Start the raid using the raid module
    const { startRaid, createRaidEmbed } = require('../modules/raidModule');
    console.log(`[randomMonsterEncounters.js]: 🚀 Starting raid for ${monster.name} in ${selectedVillage}`);
    
    const { raidId, raidData } = await startRaid(monster, selectedVillage);
    console.log(`[randomMonsterEncounters.js]: ✅ Raid created with ID: ${raidId}`);

    // Get monster image from monsterMapping
    const { monsterMapping } = require('../models/MonsterModel');
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image;

    console.log(`[randomMonsterEncounters.js]: 🖼️ Using monster image: ${monsterImage}`);

    // Create encounter embed
    const encounterEmbed = createRaidEmbed(raidData, monsterImage);

    // Send the raid announcement to the temporary channel
    console.log(`[randomMonsterEncounters.js]: 📢 Sending raid announcement to channel ${channel.id}`);
    const raidMessage = await channel.send({
      content: `⚠️ **RANDOM ENCOUNTER RAID!** ⚠️`,
      embeds: [encounterEmbed]
    });
    console.log(`[randomMonsterEncounters.js]: ✅ Raid message sent with ID: ${raidMessage.id}`);

    // Create thread in the temporary channel
    console.log(`[randomMonsterEncounters.js]: 🧵 Creating thread for raid...`);
    const thread = await raidMessage.startThread({
      name: `🛡️ ${selectedVillage} - ${monster.name} (T${monster.tier})`,
      autoArchiveDuration: 60,
      reason: `Random encounter raid against ${monster.name}`
    });
    console.log(`[randomMonsterEncounters.js]: ✅ Thread created with ID: ${thread.id}`);

    // Send initial thread message
    const threadMessage = [
      `💀 A random encounter raid has been initiated against **${monster.name} (Tier ${monster.tier})**!`,
      `\n@${selectedVillage} residents — come help defend your home!`,
      `\nUse \`/raid ${raidId} <character>\` to join the fight!`,
      `\n\n**Raid ID:** \`\`\`${raidId}\`\`\``
    ].join('');

    await thread.send(threadMessage);
    console.log(`[randomMonsterEncounters.js]: 📝 Thread message sent`);

    console.log(`[randomMonsterEncounters.js]: 🎉 RANDOM ENCOUNTER COMPLETE! ${monster.name} (T${monster.tier}) in ${selectedVillage} - Raid ID: ${raidId}`);
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
