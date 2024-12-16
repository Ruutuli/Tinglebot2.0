// // ------------------- Import Necessary Modules and Services -------------------

// // Discord.js imports
// const { Client, GatewayIntentBits, ChannelType, EmbedBuilder } = require('discord.js');

// // Local service and module imports
// const { getMonstersAboveTier } = require('../database/monsterService');
// const { triggerRaid } = require('../handlers/raidHandler');

// // Environment configuration
// require('dotenv').config();

// // Constants
// const MESSAGE_THRESHOLD = 2; // Number of messages to trigger an encounter
// const TIME_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds
// const CHECK_INTERVAL = 20 * 1000; // Check every 20 seconds

// // Village Channels
// const villageChannels = {
//   Rudania: process.env.RUDANIA_TOWN_HALL,
//   Inariko: process.env.INARIKO_TOWN_HALL,
//   Vhintl: process.env.VHINTL_TOWN_HALL,
// };

// // ------------------- Track Server Activity -------------------

// const messageActivity = new Map();

// function trackMessageActivity(channelId, userId) {
//   const currentTime = Date.now();

//   if (!messageActivity.has(channelId)) {
//     messageActivity.set(channelId, { messages: [], users: new Set() });
//   }

//   const activity = messageActivity.get(channelId);

//   // Filter out old messages
//   activity.messages = activity.messages.filter(
//     (timestamp) => currentTime - timestamp <= TIME_WINDOW
//   );

//   // Add the current message and user
//   activity.messages.push(currentTime);
//   activity.users.add(userId); // Track unique users

//   messageActivity.set(channelId, activity);

//   console.log(`[RANDOM ENCOUNTER LOG] Tracked message in channel ID ${channelId} by user ID ${userId}`);
// }

// // ------------------- Check for Random Encounter -------------------

// async function checkForRandomEncounters(client) {
//   const currentTime = Date.now();

//   for (const [channelId, activity] of messageActivity.entries()) {
//     // Remove outdated messages
//     activity.messages = activity.messages.filter(
//       (timestamp) => currentTime - timestamp <= TIME_WINDOW
//     );

//     const messageCount = activity.messages.length;

//     // Check if thresholds are met
//     if (messageCount >= MESSAGE_THRESHOLD) {
//       console.log(`[RANDOM ENCOUNTER] Threshold met for channel ID ${channelId}`);

//       messageActivity.set(channelId, { messages: [], users: new Set() }); // Reset activity for the channel

//       // Randomly pick a village channel for the encounter
//       const villageChannelIds = Object.values(villageChannels);
//       const randomChannelId = villageChannelIds[Math.floor(Math.random() * villageChannelIds.length)];
//       const randomChannel = client.channels.cache.get(randomChannelId);

//       if (randomChannel && randomChannel.type === ChannelType.GuildText) {
//         console.log(`[RANDOM ENCOUNTER] Triggering encounter in channel ${randomChannel.name}`);
//         await triggerRandomEncounter(randomChannel);
//       }
//     }
//   }
// }

// // ------------------- Create Encounter Embed -------------------

// function createEncounterEmbed(monster) {
//   const fallbackImage = 'https://via.placeholder.com/150'; // Default image in case no monster image is found.

//   // Create and return an embed for the monster encounter
//   return new EmbedBuilder()
//     .setTitle(`⚔️ Encounter: ${monster.name}`)
//     .setDescription(`A dangerous **${monster.name}** (Tier ${monster.tier}) has appeared! Prepare for battle.`)
//     .addFields(
//       { name: 'Tier', value: `Tier ${monster.tier}`, inline: true },
//       { name: 'Hearts', value: `${monster.hearts} ❤️`, inline: true }
//     )
//     .setThumbnail(monster.image || fallbackImage)
//     .setColor('#FF4500')
//     .setFooter({ text: 'Join the thread to participate in the encounter!' });
// }

// // ------------------- Trigger Random Encounter -------------------

// async function triggerRandomEncounter(channel) {
//     try {
//       const monster = await getMonstersAboveTier(5); // Fetch a random monster tier 5-10
//       console.log('[RANDOM ENCOUNTER] Monster object fetched:', monster);
  
//       // Check if the monster object has the required properties
//       if (!monster || !monster.name || !monster.tier) {
//         console.error('[RANDOM ENCOUNTER] Monster data is incomplete:', monster);
//         await channel.send('❌ **Error: Unable to create encounter. Monster data is incomplete.**');
//         return;
//       }
  
//       // Create a thread for the encounter
//       const thread = await channel.threads.create({
//         name: `Encounter: ${monster.name}`,
//         autoArchiveDuration: 1440, // Archive after 24 hours
//         reason: 'Random Encounter',
//       });
  
//       console.log(`[RANDOM ENCOUNTER] Thread created for monster: ${monster.name} in channel ${channel.name}`);
  
//       // Create and send the encounter embed
//       const encounterEmbed = createEncounterEmbed(monster);
  
//       await channel.send({
//         content: `A wild **${monster.name}** has appeared! 🧟\nJoin the encounter in the thread: <#${thread.id}>!`,
//         embeds: [encounterEmbed],
//       });
  
//       // Pass the validated monster object to triggerRaid
//       await triggerRaid(null, monster, null, thread.id);
//     } catch (error) {
//       console.error('[RANDOM ENCOUNTER] Error triggering encounter:', error);
//     }
//   }
  
  

// // ------------------- Initialize the Bot -------------------

// function initializeRandomEncounterBot(client) {
//   client.on('messageCreate', (message) => {
//     if (message.author.bot) return; // Ignore bot messages
//     trackMessageActivity(message.channel.id, message.author.id);
//   });

//   setInterval(() => checkForRandomEncounters(client), CHECK_INTERVAL);
// }

// // ------------------- Export Initialization -------------------

// module.exports = { initializeRandomEncounterBot };
