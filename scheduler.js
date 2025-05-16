require('dotenv').config();
const cron = require('node-cron');
const { handleError } = require('./utils/globalErrorHandler');
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('./modules/characterStatsModule');
const { generateVendingStockList, getCurrentVendingStockList, resetPetRollsForAllCharacters } = require('./database/db');
const { postBlightRollCall, cleanupExpiredBlightRequests } = require('./handlers/blightHandler');
const { sendBloodMoonAnnouncement, isBloodMoonDay, renameChannels, revertChannelNames } = require('./scripts/bloodmoon');
const { cleanupExpiredEntries, cleanupExpiredHealingRequests } = require('./utils/storage');
const { authorizeSheets, clearSheetFormatting, writeSheetData } = require('./utils/googleSheetsUtils');
const { convertToHyruleanDate } = require('./modules/calendarModule');
const Character = require('./models/CharacterModel');
const weatherHandler = require('./handlers/weatherHandler');
const { sendUserDM } = require('./utils/messageUtils');
const { generateWeatherEmbed } = require('./embeds/weatherEmbed');
const { checkExpiredRequests } = require('./utils/expirationHandler');
const { isValidImageUrl } = require('./utils/validation');
const DEFAULT_IMAGE_URL = "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const TempData = require('./models/TempDataModel');
const { loadBlightSubmissions, saveBlightSubmissions } = require('./handlers/blightHandler');
const { connectToInventories } = require('./handlers/blightHandler');

// ============================================================================
// ---- Utility Functions ----
// Core utility functions for creating cron jobs and announcement embeds
// ============================================================================

// ---- Function: createCronJob ----
// Creates a cron job with standardized error handling and logging
function createCronJob(schedule, jobName, jobFunction, timezone = 'America/New_York') {
  return cron.schedule(schedule, async () => {
    try {
      await jobFunction();
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error(`[scheduler.js]: ❌ ${jobName} failed:`, error.message);
    }
  }, { timezone });
}

// ---- Function: createAnnouncementEmbed ----
// Creates a standardized embed for announcements with fallback images
function createAnnouncementEmbed(title, description, thumbnail, image, footer) {
  const embed = new EmbedBuilder()
    .setColor('#88cc88')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: footer });

  if (isValidImageUrl(thumbnail)) {
    embed.setThumbnail(thumbnail);
  } else {
    embed.setThumbnail(DEFAULT_IMAGE_URL);
  }

  if (isValidImageUrl(image)) {
    embed.setImage(image);
  } else {
    embed.setImage(DEFAULT_IMAGE_URL);
  }

  return embed;
}

// ============================================================================
// ---- Weather Functions ----
// Handles weather simulation and updates for each village
// ============================================================================

const TOWNHALL_CHANNELS = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL
};

// ---- Function: getCurrentSeason ----
// Determines the current season based on the month
function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Autumn';
  return 'Winter';
}

// ---- Function: formatWeatherMessage ----
// Formats weather information into a readable message
function formatWeatherMessage(village, weather) {
  const { temperature, wind, precipitation, special } = weather;
  let message = `## 🌤️ Daily Weather Report for ${village}\n\n`;
  message += `**Temperature:** ${temperature.emoji} ${temperature.label}\n`;
  message += `**Wind:** ${wind.emoji} ${wind.label}\n`;
  message += `**Conditions:** ${precipitation.emoji} ${precipitation.label}\n`;
  if (special) {
    message += `**Special:** ${special.emoji} ${special.label}\n`;
  }
  return message;
}

// ---- Function: postWeatherUpdate ----
// Posts weather updates to all village town halls
async function postWeatherUpdate(client) {
  try {
    const villages = Object.keys(TOWNHALL_CHANNELS);
    const currentSeason = getCurrentSeason();
    
    for (const village of villages) {
      try {
        const weather = weatherHandler.simulateWeightedWeather(village, currentSeason);
        const channelId = TOWNHALL_CHANNELS[village];
        const channel = client.channels.cache.get(channelId);
        
        if (!channel) {
          console.error(`[scheduler.js]: ❌ Channel not found: ${channelId}`);
          continue;
        }
        
        const { embed, files } = await generateWeatherEmbed(village, weather);
        await channel.send({ embeds: [embed], files });
        console.log(`[scheduler.js]: ✅ Posted weather for ${village}`);
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error posting weather for ${village}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[scheduler.js]: ❌ Weather update process failed:', error.message);
  }
}

// ---- Function: setupWeatherScheduler ----
// Initializes the weather update scheduler
function setupWeatherScheduler(client) {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);
  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  const timeUntilNext = nextRun - now;
  
  setTimeout(() => {
    postWeatherUpdate(client);
    setInterval(() => postWeatherUpdate(client), 24 * 60 * 60 * 1000);
  }, timeUntilNext);
}

// ============================================================================
// ---- Birthday Functions ----
// Handles birthday announcements and celebrations
// ============================================================================

// ---- Function: executeBirthdayAnnouncements ----
// Posts birthday announcements for characters with birthdays today
async function executeBirthdayAnnouncements(client) {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = estNow.toISOString().slice(5, 10);
  const guildIds = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',') : [];
  
  const guildChannelMap = {
    '1305484048063529002': '1326997448085995530', // Roots Of The Wild
    '603960955839447050': 'AnotherChannelIDHere', // Replace with the appropriate channel ID
  };

  const birthdayMessages = [
    "🔥🌍 May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way! 🔴",
    "💧❄️ On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding! 🔵",
    "🌿⚡ As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace! 🟢",
  ];

  const realWorldDate = estNow.toLocaleString("en-US", { month: "long", day: "numeric" });
  const hyruleanDate = convertToHyruleanDate(estNow);

  for (const guildId of guildIds) {
    const birthdayChannelId = guildChannelMap[guildId];
    if (!birthdayChannelId) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const announcementChannel = guild.channels.cache.get(birthdayChannelId);
    if (!announcementChannel) continue;

    const characters = await Character.find({ birthday: today });
    console.log(`[scheduler.js]: 🎂 Found ${characters.length} characters with birthdays today in guild ${guild.name}`);

    for (const character of characters) {
      try {
        const user = await client.users.fetch(character.userId);
        const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

        const embed = new EmbedBuilder()
          .setColor('#FF709B')
          .setTitle(`🎉🎂🎈 Happy Birthday, ${character.name}! 🎈🎂🎉`)
          .setDescription(randomMessage)
          .addFields(
            { name: "Real-World Date", value: realWorldDate, inline: true },
            { name: "Hyrulean Date", value: hyruleanDate, inline: true }
          )
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/bday.png')
          .setFooter({ text: `🎉 ${character.name} belongs to ${user.username}! 🎉` })
          .setTimestamp();

        await announcementChannel.send({ embeds: [embed] });
        console.log(`[scheduler.js]: 🎉 Announced ${character.name}'s birthday in ${guild.name}`);
      } catch (error) {
        handleError(error, 'scheduler.js');
        console.error(`[scheduler.js]: ❌ Failed to announce birthday for ${character.name}: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// ---- Job Functions ----
// Handles various job-related tasks like jail releases and debuffs
// ============================================================================

// ---- Function: handleJailRelease ----
// Releases characters from jail when their time is served
async function handleJailRelease() {
  const now = new Date();
  const charactersToRelease = await Character.find({ inJail: true, jailReleaseTime: { $lte: now } });
  
  if (charactersToRelease.length === 0) {
    console.log('[scheduler.js]: 🔄 No characters to release from jail at this time');
    return;
  }

  const announcementChannelId = '1354451878053937215';
  const announcementChannel = await client.channels.fetch(announcementChannelId);

  for (const character of charactersToRelease) {
    character.inJail = false;
    character.failedStealAttempts = 0;
    character.jailReleaseTime = null;
    await character.save();

    const releaseEmbed = createAnnouncementEmbed(
      '🏛️ Town Hall Proclamation',
      `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`,
      character.icon,
      'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
      'Town Hall Records • Reformed & Released'
    );

    if (announcementChannel) {
      await announcementChannel.send({
        content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
        embeds: [releaseEmbed]
      });
      console.log(`[scheduler.js]: 🏛️ Released ${character.name} from jail`);
    }

    await sendUserDM(character.userId, `🏛️ **Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`);
  }
}

// ---- Function: handleDebuffExpiry ----
// Removes expired debuffs from characters
async function handleDebuffExpiry() {
  const now = new Date();
  const charactersWithActiveDebuffs = await Character.find({
    'debuff.active': true,
    'debuff.endDate': { $lte: now }
  });

  for (const character of charactersWithActiveDebuffs) {
    character.debuff.active = false;
    character.debuff.endDate = null;
    await character.save();

    await sendUserDM(
      character.userId,
      `💖 Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`
    );
  }
}

// ---- Function: resetDailyRolls ----
// Resets daily rolls for all characters
async function resetDailyRolls() {
  try {
    const characters = await Character.find({});
    let resetCount = 0;

    for (const character of characters) {
      if (character.dailyRoll && character.dailyRoll.size > 0) {
        character.dailyRoll = new Map();
        await character.save();
        resetCount++;
      }
    }

    console.log(`[scheduler.js]: 🔄 Reset daily rolls for ${resetCount} characters`);
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error(`[scheduler.js]: ❌ Failed to reset daily rolls: ${error.message}`);
  }
}

// ============================================================================
// ---- Blight Functions ----
// Handles blight-related tasks and checks
// ============================================================================

// ---- Function: checkMissedRolls ----
// Checks for missed blight rolls and handles character deaths
async function checkMissedRolls(client) {
  try {
    const blightSubmissions = await loadBlightSubmissions();
    const now = new Date();
    
    // Check for expired submissions
    for (const [id, submission] of Object.entries(blightSubmissions)) {
      if (submission.status === 'pending' && submission.timestamp && new Date(submission.timestamp) < now) {
        submission.status = 'expired';
        await saveBlightSubmissions(blightSubmissions);
        
        if (submission.userId) {
          try {
            await sendUserDM(client, submission.userId, `Your blight submission for ${submission.characterName} has expired.`);
          } catch (error) {
            console.error('[scheduler.js]: ❌ Error sending DM:', error);
          }
        }
      }
    }

    // Check for characters that need to be deleted
    const characters = await Character.find({
      blighted: true,
      blightStage: 5,
      deathDeadline: { $exists: true, $ne: null }
    });
    
    for (const character of characters) {
      if (character.deathDeadline <= now) {
        try {
          // Store character info for notifications before deletion
          const characterInfo = {
            name: character.name,
            userId: character.userId,
            icon: character.icon,
            inventory: character.inventory
          };

          // Delete character's inventory from inventories database
          try {
            const inventoriesConnection = await connectToInventories();
            const db = inventoriesConnection.useDb("inventories");
            const collectionName = character.name.toLowerCase();
            const inventoryCollection = db.collection(collectionName);
            await inventoryCollection.deleteMany({});
          } catch (error) {
            console.error(`[scheduler.js]: ❌ Error deleting inventory for ${character.name}:`, error);
          }

          // Delete character from database
          await Character.deleteOne({ _id: character._id });

          // Delete any active blight submissions
          const submissionIds = Object.keys(blightSubmissions).filter(id => {
            const submission = blightSubmissions[id];
            return submission.characterName === character.name && submission.status === 'pending';
          });
          
          for (const submissionId of submissionIds) {
            delete blightSubmissions[submissionId];
          }
          await saveBlightSubmissions(blightSubmissions);

          // Send notifications
          const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
          const channel = client.channels.cache.get(channelId);
          if (channel) {
            const embed = new EmbedBuilder()
              .setColor('#D32F2F')
              .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
              .setDescription(`**${characterInfo.name}** has succumbed to Stage 5 Blight.\n\n*This character has been permanently removed from the database.*`)
              .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
              .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
              .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
              .setTimestamp();

            if (characterInfo.userId) {
              await channel.send({ content: `<@${characterInfo.userId}>`, embeds: [embed] });
            } else {
              await channel.send({ embeds: [embed] });
            }
          }

          // Send to mod-log
          const modLogChannel = client.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
          if (modLogChannel) {
            const modLogEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('☠️ Character Death from Blight')
              .setDescription(`**Character**: ${characterInfo.name}\n**Owner**: <@${characterInfo.userId}>\n**Death Time**: <t:${Math.floor(Date.now() / 1000)}:F>\n**Inventory Sheet**: ${characterInfo.inventory || 'None'}`)
              .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
              .setFooter({ text: 'Blight Death Log', iconURL: 'https://example.com/blight-icon.png' })
              .setTimestamp();

            await modLogChannel.send({ embeds: [modLogEmbed] });
          }

          // Try to send DM to user
          if (characterInfo.userId) {
            try {
              await sendUserDM(client, characterInfo.userId, 
                `⚠️ **Blight Death Notice**\n\nYour character **${characterInfo.name}** has succumbed to Stage 5 Blight and has been permanently removed from the database.`
              );
            } catch (error) {
              console.error(`[scheduler.js]: ❌ Error sending death notification DM:`, error);
            }
          }

          console.log(`[scheduler.js]: ✅ Character ${character.name} has been deleted`);
        } catch (error) {
          console.error(`[scheduler.js]: ❌ Error processing death for ${character.name}:`, error);
        }
      }
    }
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: ❌ Error checking missed rolls:', error);
  }
}

// ---- Function: setupBlightScheduler ----
// Sets up the blight roll call and missed rolls check
function setupBlightScheduler(client) {
  // Daily Blight Roll Call (8 PM)
  createCronJob('0 20 * * *', 'blight roll call', () => postBlightRollCall(client));

  // Check for Missed Rolls and Death Deadlines (7:59 PM)
  createCronJob('59 19 * * *', 'check missed blight rolls and death deadlines', async () => {
    try {
      await checkMissedRolls(client);
      console.log('[scheduler.js]: ✅ Completed blight checks for missed rolls and death deadlines');
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error in blight checks:', error.message);
    }
  });
}

// ============================================================================
// ---- Scheduler Initialization ----
// Main initialization function for all scheduled tasks
// ============================================================================

// ---- Function: cleanupExpiredHealingRequests ----
// Cleans up expired healing requests from the database
async function cleanupExpiredHealingRequests() {
  try {
    const result = await TempData.deleteMany({
      type: 'healing',
      expiresAt: { $lt: new Date() }
    });
    console.log(`[scheduler.js]: ✅ Cleaned up ${result.deletedCount} expired healing requests`);
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: ❌ Error cleaning up expired healing requests:', error.message);
  }
}

// ---- Function: initializeScheduler ----
// Initializes all scheduled tasks and cron jobs
function initializeScheduler(client) {
  // Initialize all schedulers
  createCronJob('0 0 * * *', 'jail release check', handleJailRelease);
  createCronJob('0 0 * * *', 'reset daily rolls', resetDailyRolls);
  createCronJob('0 8 * * *', 'daily stamina recovery', recoverDailyStamina);
  createCronJob('0 0 1 * *', 'monthly vending stock generation', generateVendingStockList);
  createCronJob('0 0 * * 0', 'weekly pet rolls reset', resetPetRollsForAllCharacters);
  createCronJob('0 0 * * *', 'request expiration and cleanup', async () => {
    await Promise.all([
      cleanupExpiredEntries(),
      cleanupExpiredHealingRequests(),
      checkExpiredRequests(client),
      cleanupExpiredBlightRequests()
    ]);
  });
  createCronJob('0 0 * * *', 'debuff expiry check', handleDebuffExpiry);
  createCronJob('0 8 * * *', 'daily weather update', () => postWeatherUpdate(client));
  createCronJob('0 0 * * *', 'birthday announcements', () => executeBirthdayAnnouncements(client));
  
  // Initialize blight scheduler
  setupBlightScheduler(client);

  // Blood moon tracking 
  createCronJob('00 12 * * *', 'blood moon tracking', async () => {
    const channels = [
      process.env.RUDANIA_TOWN_HALL,
      process.env.INARIKO_TOWN_HALL,
      process.env.VHINTL_TOWN_HALL,
    ];

    for (const channelId of channels) {
      try {
        if (isBloodMoonDay()) {
          await renameChannels(client);
          await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
        } else {
          await revertChannelNames(client);
        }
      } catch (error) {
        handleError(error, 'scheduler.js');
        console.error(`[scheduler.js]: ❌ Blood Moon tracking failed: ${error.message}`);
      }
    }
  });

  // Initialize weather scheduler
  setupWeatherScheduler(client);
}

module.exports = {
  initializeScheduler,
  setupWeatherScheduler,
  postWeatherUpdate,
  setupBlightScheduler,
  cleanupExpiredHealingRequests
};





