require('dotenv').config();
const cron = require('node-cron');
const { handleError } = require('./utils/globalErrorHandler');
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('./modules/characterStatsModule');
const { generateVendingStockList, getCurrentVendingStockList, resetPetRollsForAllCharacters } = require('./database/db');
const { checkMissedRolls, postBlightRollCall } = require('./handlers/blightHandler');
const {sendBloodMoonAnnouncement, isBloodMoonDay, renameChannels, revertChannelNames} = require('./scripts/bloodmoon');
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

// ============================================================================
// ---- Utility Functions ----
// ============================================================================

// ---- Function: createCronJob ----
// Creates a cron job with standardized error handling and logging
function createCronJob(schedule, jobName, jobFunction, timezone = 'America/New_York') {
  return cron.schedule(schedule, async () => {
    try {
      await jobFunction();
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error(`[Scheduler] ❌ ${jobName} failed:`, error.message);
    }
  }, { timezone });
}

// ---- Function: createAnnouncementEmbed ----
// Creates a standardized embed for announcements
function createAnnouncementEmbed(title, description, thumbnail, image, footer) {
  const embed = new EmbedBuilder()
    .setColor('#88cc88')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: footer });

  // Only set thumbnail if valid, else use default
  if (isValidImageUrl(thumbnail)) {
    embed.setThumbnail(thumbnail);
  } else {
    embed.setThumbnail(DEFAULT_IMAGE_URL);
  }

  // Only set image if valid, else use default
  if (isValidImageUrl(image)) {
    embed.setImage(image);
  } else {
    embed.setImage(DEFAULT_IMAGE_URL);
  }

  return embed;
}

// ============================================================================
// ---- Weather Functions ----
// ============================================================================

const TOWNHALL_CHANNELS = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL
};

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Autumn';
  return 'Winter';
}

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
          console.error(`[Scheduler] ❌ Channel not found: ${channelId}`);
          continue;
        }
        
        const { embed, files } = await generateWeatherEmbed(village, weather);
        await channel.send({ embeds: [embed], files });
        console.log(`[Scheduler] ✅ Posted weather for ${village}`);
      } catch (error) {
        console.error(`[Scheduler] ❌ Error posting weather for ${village}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[Scheduler] ❌ Weather update process failed:', error.message);
  }
}

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
// ============================================================================

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
// ============================================================================

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
// ============================================================================

function setupBlightScheduler(client) {
  // Daily Blight Roll Call (8 PM)
  createCronJob('0 20 * * *', 'blight roll call', () => postBlightRollCall(client));

  // Check for Missed Rolls (Every 6 hours)
  createCronJob('0 */6 * * *', 'check missed blight rolls', () => checkMissedRolls(client));
}

// ============================================================================
// ---- Death Deadline Functions ----
// ============================================================================

async function checkDeathDeadlines(client) {
  try {
    console.log('[scheduler.js]: 🔍 Checking for expired death deadlines...');
    const now = new Date();
    const characters = await Character.find({
      blighted: true,
      blightStage: 5,
      deathDeadline: { $lte: now }
    });

    if (characters.length === 0) {
      console.log('[scheduler.js]: ✅ No expired death deadlines found');
      return;
    }

    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[scheduler.js]: ❌ Channel not found for death notifications');
      return;
    }

    for (const character of characters) {
      character.blighted = false;
      character.blightStage = 0;
      character.deathDeadline = null;

      // Delete any active blight submissions for this character
      try {
        const blightSubmissions = loadBlightSubmissions();
        const submissionIds = Object.keys(blightSubmissions).filter(id => {
          const submission = blightSubmissions[id];
          return submission.characterName === character.name && submission.status === 'pending';
        });
        
        // Delete each pending submission
        for (const submissionId of submissionIds) {
          delete blightSubmissions[submissionId];
          deleteSubmissionFromStorage(submissionId);
        }
        saveBlightSubmissions(blightSubmissions);
      } catch (error) {
        handleError(error, 'scheduler.js');
        console.error('[scheduler.js]: ❌ Error cleaning up blight submissions:', error);
      }

      // Wipe character's inventory from database only
      try {
        const inventoriesConnection = await dbFunctions.connectToInventories();
        const db = inventoriesConnection.useDb("inventories");
        const collectionName = character.name.toLowerCase();
        const inventoryCollection = db.collection(collectionName);
        
        // Delete all items from the character's inventory in database
        await inventoryCollection.deleteMany({ characterId: character._id });
      } catch (error) {
        handleError(error, 'scheduler.js');
        console.error('[scheduler.js]: ❌ Error wiping inventory:', error);
      }

      await character.save();

      const embed = new EmbedBuilder()
        .setColor('#D32F2F')
        .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
        .setDescription(`**${character.name}** has succumbed to Stage 5 Blight.\n\n *This character's inventory has been cleared from the database, but their inventory sheet remains for record-keeping purposes.*`)
        .setThumbnail(character.icon || 'https://example.com/default-icon.png')
        .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setTimestamp();

      if (character.userId) {
        await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
      } else {
        console.error(`[scheduler.js]: ❌ Missing userId for ${character.name}`);
        await channel.send({ embeds: [embed] });
      }

      // Send death notification to mod-log channel
      try {
        const modLogChannel = client.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
        if (modLogChannel) {
          const modLogEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('☠️ Character Death from Blight')
            .setDescription(`**Character**: ${character.name}\n**Owner**: <@${character.userId}>\n**Death Time**: <t:${Math.floor(Date.now() / 1000)}:F>`)
            .setThumbnail(character.icon || 'https://example.com/default-icon.png')
            .setFooter({ text: 'Blight Death Log', iconURL: 'https://example.com/blight-icon.png' })
            .setTimestamp();

          await modLogChannel.send({ embeds: [modLogEmbed] });
          console.log(`[scheduler.js]: ✅ Sent death notification to mod-log for ${character.name}`);
        } else {
          console.error('[scheduler.js]: ❌ Mod log channel not found');
        }
      } catch (error) {
        handleError(error, 'scheduler.js');
        console.error('[scheduler.js]: ❌ Error sending death notification to mod-log:', error);
      }
    }
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: ❌ Error checking death deadlines:', error);
  }
}

// ============================================================================
// ---- Startup Check Functions ----
// ============================================================================

async function checkAndRunMissedTasks(client) {
  try {
    console.log('[scheduler.js]: 🔍 Checking for missed scheduled tasks...');
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const currentHour = estNow.getHours();
    const currentMinute = estNow.getMinutes();
    const currentDay = estNow.getDay();
    const currentDate = estNow.getDate();

    // Check if we missed the 8 AM tasks
    if (currentHour >= 8) {
      console.log('[scheduler.js]: 🔄 Running missed 8 AM tasks...');
      
      // Check if today's reset has already happened
      const today = estNow.toISOString().split('T')[0];
      const characters = await Character.find({});
      const needsReset = characters.some(char => {
        if (!char.dailyRoll) return true;
        const lastReset = char.dailyRoll.get('lastReset');
        return !lastReset || !lastReset.startsWith(today);
      });

      if (needsReset) {
        console.log('[scheduler.js]: 🔄 Daily reset was missed, running now...');
        await Promise.all([
          recoverDailyStamina(),
          resetDailyRolls(),
          cleanupExpiredEntries(),
          checkExpiredRequests(client),
          postWeatherUpdate(client)
        ]);
      } else {
        console.log('[scheduler.js]: ✅ Daily reset already ran today, skipping...');
        await Promise.all([
          cleanupExpiredEntries(),
          checkExpiredRequests(client),
          postWeatherUpdate(client)
        ]);
      }
    }

    // Check if we missed the midnight tasks
    if (currentHour >= 0) {
      console.log('[scheduler.js]: 🔄 Running missed midnight tasks...');
      await Promise.all([
        handleJailRelease(),
        handleDebuffExpiry(),
        executeBirthdayAnnouncements(client)
      ]);
    }

    // Check if we missed the 8 PM tasks
    if (currentHour >= 20) {
      console.log('[scheduler.js]: 🔄 Running missed 8 PM tasks...');
      await Promise.all([
        postBlightRollCall(client),
        checkMissedRolls(client)
      ]);
    }

    // Check if we missed the 12:24 PM blood moon check
    if (currentHour >= 12 && currentMinute >= 24) {
      console.log('[scheduler.js]: 🔄 Running missed blood moon check...');
      const channels = [
        process.env.RUDANIA_TOWN_HALL,
        process.env.INARIKO_TOWN_HALL,
        process.env.VHINTL_TOWN_HALL,
      ];

      for (const channelId of channels) {
        if (isBloodMoonDay()) {
          await renameChannels(client);
          await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
        } else {
          await revertChannelNames(client);
        }
      }
    }

    // Check for monthly tasks (vending stock)
    if (currentDate === 1) {
      console.log('[scheduler.js]: 🔄 Running missed monthly tasks...');
      await generateVendingStockList();
    }

    // Check for weekly tasks (pet rolls)
    if (currentDay === 0) {
      console.log('[scheduler.js]: 🔄 Running missed weekly tasks...');
      await resetPetRollsForAllCharacters();
    }

    // Check for every 6-hour blight roll checks
    const hoursSinceLastCheck = currentHour % 6;
    if (hoursSinceLastCheck > 0) {
      console.log('[scheduler.js]: 🔄 Running missed blight roll checks...');
      await checkMissedRolls(client);
    }

    // Check for any pending delivery tasks that might have expired
    console.log('[scheduler.js]: 🔄 Checking for expired delivery tasks...');
    await cleanupExpiredEntries();

    // Check for any pending requests that might have expired
    console.log('[scheduler.js]: 🔄 Checking for expired requests...');
    await checkExpiredRequests(client);

    // Check for expired raid timers
    console.log('[scheduler.js]: 🔄 Checking for expired raid timers...');
    const { checkExpiredRaids } = require('./modules/raidModule');
    await checkExpiredRaids(client);

    // Check for expired relic appraisals
    console.log('[scheduler.js]: 🔄 Checking for expired relic appraisals...');
    const { checkExpiredRelics } = require('./utils/relicUtils');
    await checkExpiredRelics(client);

    // Check for expired random encounters
    console.log('[scheduler.js]: 🔄 Checking for expired random encounters...');
    const { checkExpiredEncounters } = require('./modules/randomMountEncounterModule');
    await checkExpiredEncounters(client);

    // Check for expired village cooldowns
    console.log('[scheduler.js]: 🔄 Checking for expired village cooldowns...');
    const { checkExpiredVillageCooldowns } = require('./commands/world/village');
    await checkExpiredVillageCooldowns();

    console.log('[scheduler.js]: ✅ Finished checking for missed tasks');
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: ❌ Error checking missed tasks:', error.message);
  }
}

// ============================================================================
// ---- Scheduler Initialization ----
// ============================================================================

function initializeScheduler(client) {
  // Run missed tasks check on startup
  checkAndRunMissedTasks(client);

  // Initialize all schedulers
  createCronJob('0 0 * * *', 'jail release check', handleJailRelease);
  createCronJob('0 8 * * *', 'daily stamina recovery', recoverDailyStamina);
  createCronJob('0 8 * * *', 'daily roll reset', resetDailyRolls);
  createCronJob('0 0 1 * *', 'monthly vending stock generation', generateVendingStockList);
  createCronJob('0 0 * * 0', 'weekly pet rolls reset', resetPetRollsForAllCharacters);
  createCronJob('0 8 * * *', 'request expiration and cleanup', async () => {
    await Promise.all([
      cleanupExpiredEntries(),
      checkExpiredRequests(client)
    ]);
  });
  createCronJob('0 0 * * *', 'debuff expiry check', handleDebuffExpiry);
  createCronJob('0 8 * * *', 'daily weather update', () => postWeatherUpdate(client));
  createCronJob('0 0 * * *', 'birthday announcements', () => executeBirthdayAnnouncements(client));
  createCronJob('0 20 * * *', 'blight management', async () => {
    await Promise.all([
      postBlightRollCall(client),
      checkMissedRolls(client)
    ]);
  });
  createCronJob('24 12 * * *', 'blood moon tracking', async () => {
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

  // Add death deadline check - runs every hour
  createCronJob('0 * * * *', 'death deadline check', () => checkDeathDeadlines(client));

  // Initialize weather scheduler
  setupWeatherScheduler(client);

  console.log('[scheduler.js]: ✅ All schedulers initialized');
}

module.exports = {
  initializeScheduler,
  setupWeatherScheduler,
  postWeatherUpdate,
  setupBlightScheduler
};





