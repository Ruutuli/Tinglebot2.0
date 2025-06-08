// // ------------------- randomEncounters.js -------------------
// // This module handles random encounters in the game.
// // It tracks message activity in channels, determines if an encounter should be triggered,
// // creates encounter embeds, and triggers random encounters based on server activity.
// // It also manages the timing and channel selection for encounters.

// // ============================================================================
// // Discord.js Components
// // ------------------- Importing Discord.js components -------------------
// const { ChannelType } = require('discord.js');

// const { handleError } = require('../utils/globalErrorHandler');
// // ============================================================================
// // Local Modules & Database Models
// // ------------------- Importing local services and models -------------------
// const { getMonstersAboveTierByRegion } = require('../database/db');
// const { getVillageRegionByName } = require('../modules/locationsModule');
// const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer, storeRaidProgress, getRaidProgressById } = require('../modules/raidModule');
// const { capitalizeVillageName } = require('../utils/stringUtils');

// // ============================================================================
// // Environment Configuration
// // ------------------- Load environment variables -------------------
// require('dotenv').config();

// // ============================================================================
// // Constants
// // ------------------- Define thresholds and timing constants -------------------
// const MESSAGE_THRESHOLD = 100;            // Number of messages to trigger an encounter
// const MIN_ACTIVE_USERS = 4;               // Minimum unique users required for an encounter
// const TIME_WINDOW = 10 * 60 * 1000;         // 10 minutes in milliseconds
// const CHECK_INTERVAL = 20 * 1000;           // Check every 20 seconds

// // ------------------- Village Channels -------------------
// // Maps village names to their respective channel IDs (from environment variables)
// const villageChannels = {
//   Rudania: process.env.RUDANIA_TOWN_HALL,
//   Inariko: process.env.INARIKO_TOWN_HALL,
//   Vhintl: process.env.VHINTL_TOWN_HALL,
// };

// // ============================================================================
// // Message Activity Tracking
// // ------------------- Track Server Activity -------------------
// // Tracks message timestamps and unique users in each channel.
// const messageActivity = new Map();

// function trackMessageActivity(channelId, userId, isBot, username) {
//   if (isBot) return; // Ignore bot messages

//   const currentTime = Date.now();

//   if (!messageActivity.has(channelId)) {
//     messageActivity.set(channelId, { messages: [], users: new Set() });
//   }

//   const activity = messageActivity.get(channelId);

//   // Filter out messages older than TIME_WINDOW and add the current message timestamp.
//   activity.messages = activity.messages
//     .filter((timestamp) => currentTime - timestamp <= TIME_WINDOW)
//     .concat(currentTime);

//   // Add the user to the set of active users.
//   activity.users.add(userId);
//   messageActivity.set(channelId, activity);
// }

// // ============================================================================
// // Encounter Triggering Functions
// // ------------------- Check for Random Encounter -------------------
// async function checkForRandomEncounters(client) {
//   const currentTime = Date.now();

//   for (const [channelId, activity] of messageActivity.entries()) {
//     // Remove outdated messages.
//     activity.messages = activity.messages.filter(
//       (timestamp) => currentTime - timestamp <= TIME_WINDOW
//     );

//     const messageCount = activity.messages.length;
//     const uniqueUserCount = activity.users.size;
//     const meetsThreshold = messageCount >= MESSAGE_THRESHOLD && uniqueUserCount >= MIN_ACTIVE_USERS;

//     if (meetsThreshold) {
//       console.log(`[Encounter LOG] Triggering encounter for channel: ${channelId}`);
//       // Reset the activity for the channel.
//       messageActivity.set(channelId, { messages: [], users: new Set() });

//       // Randomly choose a village channel.
//       const villageChannelIds = Object.values(villageChannels);
//       const randomChannelId = villageChannelIds[Math.floor(Math.random() * villageChannelIds.length)];
//       const randomChannel = client.channels.cache.get(randomChannelId);

//       if (randomChannel && randomChannel.type === ChannelType.GuildText) {
//         await triggerRandomEncounter(randomChannel);
//       }
//     }
//   }
// }

// // ============================================================================
// // Random Encounter Trigger
// // ------------------- Trigger Random Encounter -------------------
// async function triggerRandomEncounter(channel) {
//   try {
//     // Identify the village corresponding to the channel.
//     const selectedVillage = Object.keys(villageChannels).find(key => villageChannels[key] === channel.id);
//     if (!selectedVillage) {
//       console.error('[Encounter LOG] No matching village found for the channel:', channel.name);
//       return;
//     }

//     // Get the village region.
//     const villageRegion = getVillageRegionByName(selectedVillage);

//     // Select a monster above tier 5 from the region.
//     const monster = await getMonstersAboveTierByRegion(5, villageRegion);
//     if (!monster || !monster.name || !monster.tier) {
//       console.error(`[Encounter LOG] No eligible monsters found for region: ${villageRegion}`);
//       await channel.send(`❌ **No eligible monsters found for ${selectedVillage} region.**`);
//       return;
//     }

//     // Create encounter embed
//     const encounterEmbed = createRaidEmbed(monster);

//     // Trigger encounter
//     await createOrUpdateRaidThread(encounterEmbed, channel);
//   } catch (error) {
//     console.error('[Encounter LOG] Error triggering encounter:', error);
//     await handleError(error);
//   }
// }

// // ============================================================================
// // Initialization Function
// // ------------------- Initialize Random Encounter Bot -------------------
// function initializeRandomEncounterBot(client) {
//   // Set up message tracking
//   client.on('messageCreate', (message) => {
//     if (message.author.bot) return;
//     trackMessageActivity(
//       message.channel.id,
//       message.author.id,
//       message.author.bot,
//       message.author.username
//     );
//   });

//   // Start periodic encounter checks
//   setInterval(() => {
//     checkForRandomEncounters(client).catch(error => {
//       console.error('[encounters.js]: ❌ Encounter check failed:', error);
//       handleError(error, 'randomEncounters.js');
//     });
//   }, CHECK_INTERVAL);

// }

// // ============================================================================
// // Exports
// // ------------------- Export Functions -------------------
// module.exports = {
//   initializeRandomEncounterBot,
//   trackMessageActivity,
//   checkForRandomEncounters,
//   triggerRandomEncounter
// };
