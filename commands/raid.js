// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { Client, GatewayIntentBits, ChannelType, EmbedBuilder } = require('discord.js');

// Local service and module imports
const { getMonstersAboveTier } = require('../database/monsterService');
const { monsterMapping } = require('../models/MonsterModel'); // Import monsterMapping
const { storeBattleProgress } = require('../modules/combatModule'); // Import battle storage and retrieval

// Environment configuration
require('dotenv').config();

// Constants
const MESSAGE_THRESHOLD = 2; // Number of messages to trigger an encounter
const TIME_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds
const CHECK_INTERVAL = 20 * 1000; // Check every 20 seconds

// Village Channels
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};

// ------------------- Track Server Activity -------------------

const messageActivity = new Map();

function trackMessageActivity(channelId, userId, isBot) {
  if (isBot) return; // Ignore bot messages

  const currentTime = Date.now();

  if (!messageActivity.has(channelId)) {
    messageActivity.set(channelId, { messages: [], users: new Set() });
  }

  const activity = messageActivity.get(channelId);

  // Filter out old messages
  activity.messages = activity.messages.filter(
    (timestamp) => currentTime - timestamp <= TIME_WINDOW
  );

  // Add the current message and user
  activity.messages.push(currentTime);
  activity.users.add(userId); // Track unique users

  messageActivity.set(channelId, activity);
}

// ------------------- Check for Random Encounter -------------------

async function checkForRandomEncounters(client) {
  const currentTime = Date.now();

  for (const [channelId, activity] of messageActivity.entries()) {
    // Remove outdated messages
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;

    // Check if thresholds are met
    if (messageCount >= MESSAGE_THRESHOLD) {
      messageActivity.set(channelId, { messages: [], users: new Set() }); // Reset activity for the channel

      // Randomly pick a village channel for the encounter
      const villageChannelIds = Object.values(villageChannels);
      const randomChannelId = villageChannelIds[Math.floor(Math.random() * villageChannelIds.length)];
      const randomChannel = client.channels.cache.get(randomChannelId);

      if (randomChannel && randomChannel.type === ChannelType.GuildText) {
        console.log(`[RANDOM ENCOUNTER LOG] Checking for random encounter in channel: ${randomChannel.name}`);
        await triggerRandomEncounter(randomChannel);
      }
    }
  }
}

// ------------------- Create Encounter Embed -------------------

function createEncounterEmbed(monster, battleId, villageName) {
  const fallbackImage = 'https://via.placeholder.com/150'; // Default image in case no monster image is found.
  const monsterData = monsterMapping[monster.nameMapping] || {}; // Retrieve mapped data
  const monsterImage = monsterData.image || monster.image || fallbackImage; // Prioritize mapped image

  console.log(`[EMBED LOG] Creating embed for monster: ${monster.name}, Thumbnail: ${monsterImage}`);

  return new EmbedBuilder()
    .setTitle(`🛡️ **A ${monster.name} Appears!**`)
    .setDescription(
      `Use </raid:1319205813990199328> id:${battleId} to join or continue the raid!
` +
      `Use </itemheal:1306176789755858979> to heal during the raid!`
    )
    .addFields(
      { name: `__Monster Hearts__`, value: `💙 ${monster.hearts}/${monster.hearts}`, inline: false },
      { name: `__Tier__`, value: `Tier ${monster.tier}`, inline: false },
      { name: `__Battle ID__`, value: `\`${battleId}\``, inline: false }
    )
    .setThumbnail(monsterImage.startsWith('http') ? monsterImage : fallbackImage) // Ensure thumbnail is valid
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Main image
    .setFooter({ text: "You have 10 minutes to complete this raid!" })
    .setColor('#FF4500');
}

// ------------------- Trigger Random Encounter -------------------

async function triggerRandomEncounter(channel) {
  try {
    console.log(`[RANDOM ENCOUNTER LOG] Attempting to fetch monster data.`);
    const monster = await getMonstersAboveTier(5); // Fetch a random monster tier 5-10

    if (!monster || !monster.name || !monster.tier) {
      console.error('[RANDOM ENCOUNTER] Monster data is incomplete:', monster);
      await channel.send('❌ **Error: Unable to create encounter. Monster data is incomplete.**');
      return;
    }

    console.log(`[RANDOM ENCOUNTER LOG] Monster selected: ${monster.name}, Tier: ${monster.tier}, Image: ${monster.image}`);

    // Generate a unique Battle ID for the encounter
    const battleId = Date.now();

    // Determine the village name for the message
    const villageName = Object.keys(villageChannels).find(key => villageChannels[key] === channel.id) || 'Unknown Village';

    // Post the combined embed in the main channel
    const encounterEmbed = createEncounterEmbed(monster, battleId, villageName);
    const sentMessage = await channel.send({
      content: `A ${monster.name} has appeared! This is a random attack! Any **${villageName}** Residents or Visitors, please help!`,
      embeds: [encounterEmbed],
    });

    console.log(`[RANDOM ENCOUNTER LOG] Message sent with ID: ${sentMessage.id}, Content: ${sentMessage.content}`);

    // Create a thread on the embed message
    const thread = await sentMessage.startThread({
      name: `⚠️ ${villageName} Attack: ${monster.name}`,
      autoArchiveDuration: 1440, // Archive after 24 hours
      reason: 'Random Encounter',
    });

    console.log(`[RANDOM ENCOUNTER LOG] Thread created with ID: ${thread.id}, Name: ${thread.name}`);

    // Store the raid progress in the database
    await storeBattleProgress(
      battleId,
      { name: '⠀', icon: 'https://via.placeholder.com/50' }, // Placeholder for initiating character
      monster,
      monster.tier,
      { current: monster.hearts, max: monster.hearts },
      thread.id,
      'Random Encounter initiated. Player turn next.'
    );

    console.log(`[RANDOM ENCOUNTER LOG] Raid saved to database with Battle ID: ${battleId}`);

  } catch (error) {
    console.error('[RANDOM ENCOUNTER] Error triggering encounter:', error);
  }
}

// ------------------- Initialize the Bot -------------------

function initializeRandomEncounterBot(client) {
  client.on('messageCreate', (message) => {
    if (message.author.bot) return; // Ignore bot messages
    trackMessageActivity(message.channel.id, message.author.id, message.author.bot);
  });

  setInterval(() => checkForRandomEncounters(client), CHECK_INTERVAL);
}

// ------------------- Export Initialization -------------------

module.exports = { initializeRandomEncounterBot };
