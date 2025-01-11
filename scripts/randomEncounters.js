// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { Client, GatewayIntentBits, ChannelType, EmbedBuilder } = require('discord.js');

// Local service and module imports
const { getMonstersAboveTierByRegion } = require('../database/monsterService');
const { monsterMapping } = require('../models/MonsterModel'); 
const { storeBattleProgress } = require('../modules/combatModule'); 
const { getVillageRegionByName } = require('../modules/locationsModule');
const { applyVillageDamage } = require('../modules/villageModule');

// Environment configuration
require('dotenv').config();



// Constants
const MESSAGE_THRESHOLD = 100; // Number of messages to trigger an encounter
const MIN_ACTIVE_USERS = 4; // Minimum unique users required for an encounter
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

function trackMessageActivity(channelId, userId, isBot, username) {
  if (isBot) return; // Ignore bot messages

  const currentTime = Date.now();

  if (!messageActivity.has(channelId)) {
    messageActivity.set(channelId, { messages: [], users: new Set() });
  }

  const activity = messageActivity.get(channelId);

  // Filter out old messages and ensure no duplicate timestamps
  activity.messages = activity.messages
    .filter((timestamp) => currentTime - timestamp <= TIME_WINDOW)
    .concat(currentTime); // Add current message timestamp

  // Track unique users, but prevent duplicate additions
  const userAlreadyActive = activity.users.has(userId);
  activity.users.add(userId);
  messageActivity.set(channelId, activity);
}

// ------------------- Check for Random Encounter -------------------

async function checkForRandomEncounters(client) {
  const currentTime = Date.now();

  for (const [channelId, activity] of messageActivity.entries()) {
    activity.messages = activity.messages.filter(
      (timestamp) => currentTime - timestamp <= TIME_WINDOW
    );

    const messageCount = activity.messages.length;
    const uniqueUserCount = activity.users.size;
    const meetsThreshold = messageCount >= MESSAGE_THRESHOLD && uniqueUserCount >= MIN_ACTIVE_USERS;

    if (meetsThreshold) {
      console.log(`[Encounter LOG] Triggering encounter for channel: ${channelId}`);
      messageActivity.set(channelId, { messages: [], users: new Set() });

      const villageChannelIds = Object.values(villageChannels);
      const randomChannelId = villageChannelIds[Math.floor(Math.random() * villageChannelIds.length)];
      const randomChannel = client.channels.cache.get(randomChannelId);

      if (randomChannel && randomChannel.type === ChannelType.GuildText) {
        await triggerRandomEncounter(randomChannel);
      }
    }
  }
}


// ------------------- Create Encounter Embed -------------------

function createEncounterEmbed(monster, battleId, villageName) {
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
      {
        name: `🔢 __Battle ID__`,
        value: `\`\`\`${battleId}\`\`\``,
        inline: false
      }
    )
    .setThumbnail(monsterImage.startsWith('http') ? monsterImage : fallbackImage)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ text: "⚠️ Act Quickly! You have 10 minutes to complete this raid!" })
    .setColor('#FF4500');
}

// ------------------- Trigger Random Encounter -------------------

async function triggerRandomEncounter(channel) {
  try {
    const selectedVillage = Object.keys(villageChannels).find(key => villageChannels[key] === channel.id);
    if (!selectedVillage) {
      console.error('[Encounter LOG] No matching village found for the channel:', channel.name);
      return;
    }

    const villageRegion = getVillageRegionByName(selectedVillage);

    const monster = await getMonstersAboveTierByRegion(5, villageRegion);
    if (!monster || !monster.name || !monster.tier) {
      console.error(`[Encounter LOG] No eligible monsters found for region: ${villageRegion}`);
      await channel.send(`❌ **Error: No eligible monsters found for the region: ${villageRegion}.**`);
      return;
    }

    const battleId = Date.now();
    const encounterEmbed = createEncounterEmbed(monster, battleId, selectedVillage);

    const sentMessage = await channel.send({
      content: `> ⚠️ **A ${monster.name} has appeared in ${selectedVillage}!** Residents and visitors, please respond to the threat!`,
      embeds: [encounterEmbed],
    });

    const thread = await sentMessage.startThread({
      name: `⚠️ ${selectedVillage} Attack: ${monster.name}`,
      autoArchiveDuration: 1440,
      reason: 'Random Encounter',
    });

    const timerDuration = 10 * 60 * 1000; // 10 minutes
    setTimeout(async () => {
      try {
        await applyVillageDamage(selectedVillage, monster, thread);
      } catch (error) {
        console.error(`[Timer LOG] Error during applyVillageDamage execution:`, error);
      }
    }, timerDuration);

  } catch (error) {
    console.error('[Encounter LOG] Error triggering encounter:', error);
  }
}

// ------------------- Initialize the Bot -------------------

function initializeRandomEncounterBot(client) {
  client.on('messageCreate', (message) => {
    if (message.author.bot) return; // Ignore bot messages
    trackMessageActivity(message.channel.id, message.author.id, message.author.bot, message.author.username);
  });

  setInterval(() => checkForRandomEncounters(client), CHECK_INTERVAL);
}


// ------------------- Export Initialization -------------------

module.exports = { initializeRandomEncounterBot };
