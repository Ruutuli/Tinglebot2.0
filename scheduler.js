const dotenv = require("dotenv");
const path = require("path");
const cron = require("node-cron");
const { handleError } = require("./utils/globalErrorHandler");
const { EmbedBuilder } = require("discord.js");
const { recoverDailyStamina } = require("./modules/characterStatsModule");
const {
 generateVendingStockList,
 getCurrentVendingStockList,
 resetPetRollsForAllCharacters,
} = require("./database/db");
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
} = require("./handlers/blightHandler");
const {
 sendBloodMoonAnnouncement,
 sendBloodMoonEndAnnouncement,
 isBloodMoonDay,
 renameChannels,
 revertChannelNames,
 cleanupOldTrackingData,
} = require("./scripts/bloodmoon");
const {
 cleanupExpiredEntries,
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require("./utils/storage");
const {
 authorizeSheets,
 clearSheetFormatting,
 writeSheetData,
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require("./utils/googleSheetsUtils");
const { convertToHyruleanDate } = require("./modules/calendarModule");
const Character = require("./models/CharacterModel");
const { sendUserDM } = require("./utils/messageUtils");
const { checkExpiredRequests } = require("./utils/expirationHandler");
const { isValidImageUrl } = require("./utils/validation");
const DEFAULT_IMAGE_URL =
 "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const TempData = require("./models/TempDataModel");
const {
 loadBlightSubmissions,
 saveBlightSubmissions,
} = require("./handlers/blightHandler");
const { connectToInventories } = require("./handlers/blightHandler");
const { getCurrentWeather, generateWeatherEmbed } = require("./services/weatherService");
const Pet = require("./models/PetModel");
const Raid = require("./models/RaidModel");
const fs = require('fs');
const { formatQuestsAsEmbedsByVillage, generateDailyQuests, getQuestsForScheduledTime } = require('./modules/helpWantedModule');
const HelpWantedQuest = require('./models/HelpWantedQuestModel');
const moment = require('moment');

const HELP_WANTED_SCHEDULE_FILE = './helpWantedSchedule.json';
const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';

const env = process.env.NODE_ENV || "development";
try {
 const envPath = path.resolve(process.cwd(), `.env.${env}`);
 dotenv.config({ path: envPath });
} catch (error) {
 console.error(`[scheduler.js]: Failed to load .env.${env}:`, error.message);
 dotenv.config();
}

// ============================================================================
// ---- Utility Functions ----
// Core utility functions for creating cron jobs and announcement embeds
// ============================================================================

function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = "America/New_York"
) {
 return cron.schedule(
  schedule,
  async () => {
   try {
    await jobFunction();
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ${jobName} failed:`, error.message);
   }
  },
  { timezone }
 );
}

function createAnnouncementEmbed(title, description, thumbnail, image, footer) {
 const embed = new EmbedBuilder()
  .setColor("#88cc88")
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
 Rudania: process.env.RUDANIA_TOWNHALL,
 Inariko: process.env.INARIKO_TOWNHALL,
 Vhintl: process.env.VHINTL_TOWNHALL,
};

function getCurrentSeason() {
 const month = new Date().getMonth() + 1;
 if (month >= 3 && month <= 5) return "Spring";
 if (month >= 6 && month <= 8) return "Summer";
 if (month >= 9 && month <= 11) return "Autumn";
 return "Winter";
}

async function postWeatherUpdate(client) {
 try {
  console.log(`[scheduler.js]: Starting 8am weather update process`);

  const villages = Object.keys(TOWNHALL_CHANNELS);

  for (const village of villages) {
   try {
    console.log(`[scheduler.js]: 🌤️ Processing weather for ${village}...`);
    const weather = await getCurrentWeather(village);

    if (!weather) {
     console.error(`[scheduler.js]: Failed to get or generate weather for ${village}`);
     continue;
    }

    const channelId = TOWNHALL_CHANNELS[village];
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
     console.error(`[scheduler.js]: Channel not found: ${channelId}`);
     continue;
    }

    const { embed, files } = await generateWeatherEmbed(village, weather);
    await channel.send({ embeds: [embed], files });
    console.log(`[scheduler.js]: Posted weather for ${village}`);

    if (village === "Rudania" || village === "Vhintl") {
     console.log(`[scheduler.js]: Special weather check for ${village}:`, {
      hasSpecial: !!weather.special,
      specialType: weather.special?.label || "None",
      specialEmoji: weather.special?.emoji || "None",
      temperature: weather.temperature?.label,
      precipitation: weather.precipitation?.label,
     });
    }
   } catch (error) {
    console.error(`[scheduler.js]: Error posting weather for ${village}:`, error.message);
   }
  }

  console.log(`[scheduler.js]: 8am weather update process completed`);
 } catch (error) {
  console.error("[scheduler.js]: Weather update process failed:", error.message);
 }
}

// ============================================================================
// ---- Raid Functions ----
// Handles raid cleanup and maintenance
// ============================================================================

async function cleanupExpiredRaids() {
 try {
  console.log(`[scheduler.js]: Starting raid cleanup process`);

  const expiredCount = await Raid.cleanupExpiredRaids();

  if (expiredCount > 0) {
   console.log(`[scheduler.js]: Cleaned up ${expiredCount} expired raids`);
  } else {
   console.log(`[scheduler.js]: No expired raids to clean up`);
  }
 } catch (error) {
  console.error(`[scheduler.js]: Error cleaning up expired raids:`, error);
  handleError(error, "scheduler.js");
 }
}

// ============================================================================
// ---- Birthday Functions ----
// Handles birthday announcements and celebrations
// ============================================================================

async function executeBirthdayAnnouncements(client) {
 const now = new Date();
 const estNow = new Date(
  now.toLocaleString("en-US", { timeZone: "America/New_York" })
 );
 const today = estNow.toISOString().slice(5, 10);
 const guildIds = [process.env.GUILD_ID];

 const guildChannelMap = {
  [process.env.GUILD_ID]:
   process.env.BIRTHDAY_CHANNEL_ID || "1326997448085995530",
 };

 const birthdayMessages = [
  "May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way!",
  "On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding!",
  "As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace!",
 ];

 const realWorldDate = estNow.toLocaleString("en-US", {
  month: "long",
  day: "numeric",
 });
 const hyruleanDate = convertToHyruleanDate(estNow);

 for (const guildId of guildIds) {
  const birthdayChannelId = guildChannelMap[guildId];
  if (!birthdayChannelId) continue;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) continue;

  const announcementChannel = guild.channels.cache.get(birthdayChannelId);
  if (!announcementChannel) continue;

  const characters = await Character.find({ birthday: today });
  console.log(
   `[scheduler.js]: Found ${characters.length} characters with birthdays today in guild ${guild.name}`
  );

  for (const character of characters) {
   try {
    const user = await client.users.fetch(character.userId);
    const randomMessage =
     birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

    const embed = new EmbedBuilder()
     .setColor("#FF709B")
     .setTitle(`Happy Birthday, ${character.name}!`)
     .setDescription(randomMessage)
     .addFields(
      { name: "Real-World Date", value: realWorldDate, inline: true },
      { name: "Hyrulean Date", value: hyruleanDate, inline: true }
     )
     .setThumbnail(character.icon)
     .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
     .setFooter({ text: `${character.name} belongs to ${user.username}!` })
     .setTimestamp();

    await announcementChannel.send({ embeds: [embed] });
    console.log(
     `[scheduler.js]: Announced ${character.name}'s birthday in ${guild.name}`
    );
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(
     `[scheduler.js]: Failed to announce birthday for ${character.name}: ${error.message}`
    );
   }
  }
 }
}

// ============================================================================
// ---- Job Functions ----
// Handles various job-related tasks like jail releases and debuffs
// ============================================================================

async function handleJailRelease(client) {
 const now = new Date();
 const charactersToRelease = await Character.find({
  inJail: true,
  jailReleaseTime: { $lte: now },
 });

 if (charactersToRelease.length === 0) {
  console.log(
   "[scheduler.js]: No characters to release from jail at this time"
  );
  return;
 }

 const announcementChannelId = "1354451878053937215";
 const announcementChannel = await client.channels.fetch(announcementChannelId);

 for (const character of charactersToRelease) {
  character.inJail = false;
  character.failedStealAttempts = 0;
  character.jailReleaseTime = null;
  await character.save();

  const releaseEmbed = createAnnouncementEmbed(
   "Town Hall Proclamation",
   `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`,
   character.icon,
   "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png",
   "Town Hall Records • Reformed & Released"
  );

  if (announcementChannel) {
   await announcementChannel.send({
    content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
    embeds: [releaseEmbed],
   });
   console.log(`[scheduler.js]: Released ${character.name} from jail`);
  }

  await sendUserDM(
   character.userId,
   `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`
  );
 }
}

async function handleDebuffExpiry(client) {
  // Get current date in EST timezone
  const now = new Date();
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Set to midnight EST today for comparison
  const midnightEST = new Date(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 0, 0, 0, 0);
  
  console.log(`[scheduler.js]: 🧹 Checking debuff expiry at ${midnightEST.toISOString()} (midnight EST)`);
  
  const charactersWithActiveDebuffs = await Character.find({
    "debuff.active": true,
    "debuff.endDate": { $lte: midnightEST },
  });

  console.log(`[scheduler.js]: 📊 Found ${charactersWithActiveDebuffs.length} characters with expired debuffs`);

  for (const character of charactersWithActiveDebuffs) {
    console.log(`[scheduler.js]: ✅ Expiring debuff for ${character.name} (endDate: ${character.debuff.endDate})`);
    character.debuff.active = false;
    character.debuff.endDate = null;
    await character.save();

    await sendUserDM(
      character.userId,
      `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`
    );
  }
}

async function resetDailyRolls(client) {
 try {
  const characters = await Character.find({});
  let resetCount = 0;

  for (const character of characters) {
   if (character.dailyRoll && character.dailyRoll.size > 0) {
    character.dailyRoll = new Map();
    character.markModified("dailyRoll");
    await character.save();
    resetCount++;
   }
  }

  console.log(`[scheduler.js]: Reset daily rolls for ${resetCount} characters`);
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(
   `[scheduler.js]: Failed to reset daily rolls: ${error.message}`
  );
 }
}

async function resetPetLastRollDates(client) {
 try {
  const result = await Pet.updateMany(
   { status: "active" },
   { $set: { lastRollDate: null } }
  );
  console.log(
   `[scheduler.js]: Reset lastRollDate for ${result.modifiedCount} pets`
  );
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(
   `[scheduler.js]: Failed to reset pet lastRollDates: ${error.message}`
  );
 }
}

// ============================================================================
// ---- Blight Functions ----
// Handles blight-related tasks and checks
// ============================================================================

function setupBlightScheduler(client) {
 createCronJob("0 20 * * *", "Blight Roll Call", async () => {
  try {
   await postBlightRollCall(client);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: Blight roll call failed:", error.message);
  }
 });

 createCronJob("0 20 * * *", "Check Missed Rolls", () =>
  checkMissedRolls(client)
 );

 createCronJob(
  "0 0 * * *",
  "Cleanup Expired Blight Requests",
  async () => {
    try {
      console.log('[scheduler.js]: 🧹 Starting blight request cleanup');
      const result = await cleanupExpiredBlightRequests();
      console.log(`[scheduler.js]: ✅ Blight cleanup complete - Expired: ${result.expiredCount}, Notified: ${result.notifiedUsers}, Deleted: ${result.deletedCount}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight cleanup:', error);
    }
  }
 );

 createCronJob(
  "0 */12 * * *",
  "Check Expiring Blight Requests",
  async () => {
    try {
      console.log('[scheduler.js]: ⚠️ Running blight expiration warning check');
      const result = await checkExpiringBlightRequests();
      console.log(`[scheduler.js]: ✅ Blight warning check complete - Warned: ${result.warnedUsers}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight warning check:', error);
    }
  }
 );

 createCronJob(
  "0 */4 * * *",
  "Send Blight Reminders",
  async () => {
    try {
      console.log('[scheduler.js]: 📢 Running comprehensive blight reminder check');
      const result = await sendBlightReminders(client);
      console.log(`[scheduler.js]: ✅ Blight reminder check complete - Death: ${result.deathWarnings}, Healing: ${result.healingWarnings}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      console.error('[scheduler.js]: ❌ Error during blight reminder check:', error);
    }
  }
 );
}

// ============================================================================
// ---- Boosting Functions ----
// Handles boosting system cleanup and maintenance
// ============================================================================

async function setupBoostingScheduler(client) {
 // Clean up expired boost requests at midnight
 createCronJob("0 0 * * *", "Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting boost cleanup");
   const stats = cleanupExpiredBoostingRequests();
   console.log(
    `[scheduler.js]: ✅ Boost cleanup complete - Expired requests: ${stats.expiredRequests}, Expired boosts: ${stats.expiredBoosts}`
   );
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during boost cleanup:", error);
  }
 });

 // Archive old boost requests weekly (Sundays at 2 AM)
 createCronJob("0 2 * * 0", "Weekly Boost Archive", async () => {
  try {
   console.log("[scheduler.js]: 📦 Running weekly boost archive");
   const stats = archiveOldBoostingRequests(30);
   console.log(
    `[scheduler.js]: ✅ Archive complete - Archived: ${stats.archived}, Remaining: ${stats.remaining}`
   );
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during weekly archive:", error);
  }
 });

 // Log boost statistics daily at midnight
 createCronJob("0 0 * * *", "Daily Boost Statistics", async () => {
  try {
   const stats = getBoostingStatistics();
   console.log("[scheduler.js]: 📊 Daily boost statistics:", stats);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error getting boost statistics:", error);
  }
 });
}

// ============================================================================
// ---- Weather Scheduler ----
// Enhanced weather scheduler functionality
// ============================================================================

function setupWeatherScheduler(client) {
 // Weather updates at 8 AM EST daily - THIS IS THE ONLY WEATHER POSTING JOB
 createCronJob("0 8 * * *", "Daily Weather Update", () =>
  postWeatherUpdate(client)
 );
}

// ============================================================================
// ---- Help Wanted Functions ----
// Handles Help Wanted quest generation and posting
// ============================================================================

// ------------------- Function: checkAndGenerateDailyQuests -------------------
// Checks if quests exist for today, generates them if they don't
// ============================================================================
async function checkAndGenerateDailyQuests() {
  try {
    console.log('[scheduler.js]: 🔍 Checking for existing Help Wanted quests for today...');
    
    const todaysQuests = await require('./modules/helpWantedModule').getTodaysQuests();
    
    if (todaysQuests.length === 0) {
      console.log('[scheduler.js]: 📝 No quests found for today. Generating new daily quests...');
      await generateDailyQuests();
      console.log('[scheduler.js]: ✅ Daily quests generated successfully');
    } else {
      console.log(`[scheduler.js]: ✅ Found ${todaysQuests.length} existing quests for today. No generation needed.`);
    }
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndGenerateDailyQuests'
    });
    console.error('[scheduler.js]: ❌ Error checking/generating daily quests:', error);
  }
}

// ------------------- Function: generateDailyQuestsAtMidnight -------------------
// Generates new quests for the day at midnight with random times
// ============================================================================
async function generateDailyQuestsAtMidnight() {
  try {
    console.log('[scheduler.js]: 🌙 Midnight quest generation starting...');
    
    // Always generate new quests at midnight for the new day
    await generateDailyQuests();
    console.log('[scheduler.js]: ✅ Midnight quest generation completed');
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'generateDailyQuestsAtMidnight'
    });
    console.error('[scheduler.js]: ❌ Error during midnight quest generation:', error);
  }
}

// ------------------- Function: checkAndPostMissedQuests -------------------
// Checks for quests that were scheduled for times that have already passed
// and posts them immediately to ensure no quests are missed
// ============================================================================
async function checkAndPostMissedQuests(client) {
  try {
    console.log('[scheduler.js]: 🔍 Checking for missed quest posts...');
    
    const { FIXED_CRON_TIMES } = require('./modules/helpWantedModule');
    const { getQuestsForScheduledTime } = require('./modules/helpWantedModule');
    const HelpWantedQuest = require('./models/HelpWantedQuestModel');
    
    // Get current time in EST
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    const currentMinute = estTime.getMinutes();
    
    console.log(`[scheduler.js]: 🕐 Current time (EST): ${estTime.toLocaleString()}`);
    
    let postedCount = 0;
    
    // Check each cron time to see if it has passed today
    for (const cronTime of FIXED_CRON_TIMES) {
      const [minute, hour] = cronTime.split(' ').map(Number);
      
      // Check if this time has already passed today
      if (currentHour > hour || (currentHour === hour && currentMinute >= minute)) {
        console.log(`[scheduler.js]: ⏰ Time ${cronTime} (${hour}:${minute.toString().padStart(2, '0')}) has passed, checking for quests...`);
        
        // Get quests scheduled for this time
        const quests = await getQuestsForScheduledTime(cronTime);
        
        // Filter out quests that have already been posted (have channelId)
        const unpostedQuests = quests.filter(quest => !quest.channelId);
        
        if (unpostedQuests.length > 0) {
          console.log(`[scheduler.js]: 📤 Found ${unpostedQuests.length} unposted quests for ${cronTime}, posting now...`);
          
          // Post the quests
          await postHelpWantedBoardToTestChannel(client, cronTime);
          postedCount += unpostedQuests.length;
        } else {
          console.log(`[scheduler.js]: ✅ All quests for ${cronTime} have already been posted or no quests found`);
        }
      } else {
        console.log(`[scheduler.js]: ⏳ Time ${cronTime} (${hour}:${minute.toString().padStart(2, '0')}) has not passed yet`);
      }
    }
    
    if (postedCount > 0) {
      console.log(`[scheduler.js]: ✅ Posted ${postedCount} missed quests during startup`);
    } else {
      console.log('[scheduler.js]: ✅ No missed quests found');
    }
    
  } catch (error) {
    handleError(error, 'scheduler.js', { commandName: 'checkAndPostMissedQuests' });
    console.error('[scheduler.js]: ❌ Error checking for missed quests:', error);
  }
}

// ------------------- Fixed Times for Help Wanted Board -------------------
async function postHelpWantedBoardToTestChannel(client, cronTime) {
  try {
    // Only post quests scheduled for this cron time
    const quests = await getQuestsForScheduledTime(cronTime);
    if (!quests.length) {
      console.log(`[scheduler.js]: No Help Wanted quests scheduled for ${cronTime}. Skipping post.`);
      return;
    }
    const channel = await client.channels.fetch(HELP_WANTED_TEST_CHANNEL);
    let posted = 0;
    for (const quest of quests) {
      // Format embed for this quest only
      const embedsByVillage = await formatQuestsAsEmbedsByVillage();
      const embed = embedsByVillage[quest.village];
      if (embed) {
        const message = await channel.send({ embeds: [embed] });
        // Save the message ID and channel ID for future edits
        const updatedQuest = await HelpWantedQuest.findOneAndUpdate(
          { _id: quest._id },
          { 
            messageId: message.id,
            channelId: channel.id
          },
          { new: true }
        );
        console.log(`[scheduler.js]: Saved message ID ${message.id} and channel ID ${channel.id} for quest ${quest.questId} in ${quest.village}`);
        posted++;
      }
    }
    console.log(`[scheduler.js]: Posted Help Wanted board for ${posted} village(s) at ${cronTime}`);
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'postHelpWantedBoardToTestChannel',
      cronTime
    });
    console.error('[scheduler.js]: Error posting Help Wanted board:', error);
  }
}

function setupHelpWantedFixedScheduler(client) {
  const { FIXED_CRON_TIMES } = require('./modules/helpWantedModule');
  FIXED_CRON_TIMES.forEach((cronTime, idx) => {
    createCronJob(
      cronTime,
      `Help Wanted Board Fixed Post #${idx + 1}`,
      () => postHelpWantedBoardToTestChannel(client, cronTime),
      'America/New_York'
    );
    console.log(`[scheduler.js]: Scheduled Help Wanted board post at ${cronTime} EST`);
  });
}

// ============================================================================
// ---- Scheduler Initialization ----
// Main initialization function for all scheduled tasks
// ============================================================================

function initializeScheduler(client) {
 if (!client || !client.isReady()) {
  console.error(
   "[scheduler.js]: Invalid or unready Discord client provided to scheduler"
  );
  return;
 }

 // Add startup Blood Moon check
 (async () => {
  try {
   console.log(`[scheduler.js]: 🌕 Starting Blood Moon startup check`);

   const channels = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL,
   ];

   const isBloodMoonActive = isBloodMoonDay();
   console.log(
    `[scheduler.js]: 🌕 Blood Moon status: ${isBloodMoonActive ? "ACTIVE" : "INACTIVE"}`
   );

   if (isBloodMoonActive) {
    console.log(`[scheduler.js]: 🌕 Blood Moon active - processing channels`);
    await renameChannels(client);

    for (const channelId of channels) {
     if (!channelId) {
      console.warn(`[scheduler.js]: ⚠️ Skipping undefined channel ID`);
      continue;
     }
     await sendBloodMoonAnnouncement(
      client,
      channelId,
      "The Blood Moon is upon us! Beware!"
     );
    }
   } else {
    console.log(`[scheduler.js]: 📅 No Blood Moon - reverting channels`);
    await revertChannelNames(client);
   }

   console.log(`[scheduler.js]: ✅ Blood Moon startup check completed`);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error(`[scheduler.js]: ❌ Blood Moon check failed: ${error.message}`);
  }
 })();

 // Add startup debuff expiry check
 (async () => {
  try {
   console.log("[scheduler.js]: 🧹 Running startup debuff expiry check...");
   await handleDebuffExpiry(client);
   console.log("[scheduler.js]: ✅ Startup debuff expiry check completed");
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Startup debuff expiry check failed:", error.message);
  }
 })();

 // Add startup quest generation check
 (async () => {
  try {
   console.log("[scheduler.js]: 🔍 Running startup quest generation check...");
   await checkAndGenerateDailyQuests();
   console.log("[scheduler.js]: ✅ Startup quest generation check completed");
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Startup quest generation check failed:", error.message);
  }
 })();

 // Add startup quest posting check for missed cron jobs
 (async () => {
  try {
   console.log("[scheduler.js]: 🔍 Running startup quest posting check for missed cron jobs...");
   await checkAndPostMissedQuests(client);
   console.log("[scheduler.js]: ✅ Startup quest posting check completed");
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Startup quest posting check failed:", error.message);
  }
 })();

 // Initialize all schedulers
 createCronJob("0 0 * * *", "jail release check", () =>
  handleJailRelease(client)
 );
 createCronJob("0 8 * * *", "reset daily rolls", () => resetDailyRolls(client));
 createCronJob("0 8 * * *", "daily stamina recovery", () =>
  recoverDailyStamina(client)
 );
 createCronJob("0 0 1 * *", "monthly vending stock generation", () =>
  generateVendingStockList(client)
 );
 createCronJob("0 0 * * 0", "weekly pet rolls reset", () =>
  resetPetRollsForAllCharacters(client)
 );
 createCronJob("0 0 * * *", "reset pet last roll dates", () =>
  resetPetLastRollDates(client)
 );
 createCronJob("0 0 * * *", "request expiration and cleanup", async () => {
  try {
    console.log('[scheduler.js]: Running daily cleanup tasks...');
    const results = await Promise.all([
     cleanupExpiredEntries(),
     cleanupExpiredHealingRequests(),
     checkExpiredRequests(client),
     cleanupExpiredBlightRequests(),
     cleanupExpiredRaids(),
    ]);
    
    // Log blight cleanup results specifically
    const blightResult = results[3]; // cleanupExpiredBlightRequests is 4th in the array
    if (blightResult && typeof blightResult === 'object') {
      console.log(`[scheduler.js]: Daily blight cleanup - Expired: ${blightResult.expiredCount}, Notified: ${blightResult.notifiedUsers}, Deleted: ${blightResult.deletedCount}`);
    }
  } catch (error) {
    handleError(error, 'scheduler.js');
    console.error('[scheduler.js]: Error during daily cleanup:', error);
  }
 });
 createCronJob("0 0 * * *", "debuff expiry check", () =>
  handleDebuffExpiry(client)
 );
 // Weather update is handled by setupWeatherScheduler() - removed duplicate
 createCronJob("0 0 * * *", "birthday announcements", () =>
  executeBirthdayAnnouncements(client)
 );
 
 // Midnight quest generation - generates new quests for the day
 createCronJob("0 0 * * *", "midnight quest generation", () =>
  generateDailyQuestsAtMidnight()
 );

 createCronJob("0 1 * * *", "blood moon tracking cleanup", () => {
  console.log(`[scheduler.js]: 🧹 Starting Blood Moon tracking cleanup`);
  cleanupOldTrackingData();
  console.log(`[scheduler.js]: ✅ Blood Moon tracking cleanup completed`);
 });

 setupBlightScheduler(client);
 setupBoostingScheduler(client);
 setupWeatherScheduler(client);
 setupHelpWantedFixedScheduler(client);

 // ============================================================================
 // ---- Blood Moon Scheduling ----
 // Handles Blood Moon announcements at correct times
 // ============================================================================

 // 8 PM EST - Blood Moon start announcement (day before blood moon)
 createCronJob(
  "0 20 * * *",
  "blood moon start announcement",
  async () => {
   console.log(`[scheduler.js]: 🌕 Starting Blood Moon start check at 8 PM EST`);

   const channels = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL,
   ];

   // Check if tomorrow is a blood moon day
   const tomorrow = new Date();
   tomorrow.setDate(tomorrow.getDate() + 1);
   const tomorrowDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
   
   // Check if tomorrow is a blood moon date
   const { bloodmoonDates } = require('./modules/calendarModule');
   let isTomorrowBloodMoon = false;
   
   for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = new Date(tomorrowDate.getFullYear(), month - 1, day);
    if (tomorrowDate.getTime() === bloodMoonDate.getTime()) {
     isTomorrowBloodMoon = true;
     console.log(`[scheduler.js]: 🌕 Tomorrow (${realDate}) is a Blood Moon day - sending start announcement`);
     break;
    }
   }

   if (isTomorrowBloodMoon) {
    console.log(`[scheduler.js]: 🌕 Blood Moon starts tomorrow - processing channels`);
    await renameChannels(client);

    for (const channelId of channels) {
     if (!channelId) {
      console.warn(`[scheduler.js]: ⚠️ Skipping undefined channel ID in Blood Moon start check`);
      continue;
     }

     try {
      await sendBloodMoonAnnouncement(
       client,
       channelId,
       "The Blood Moon rises at nightfall! Beware!"
      );
     } catch (error) {
      handleError(error, "scheduler.js");
      console.error(`[scheduler.js]: ❌ Blood Moon start announcement failed for channel ${channelId}: ${error.message}`);
     }
    }
   } else {
    console.log(`[scheduler.js]: 📅 No Blood Moon starting tomorrow - no announcement needed`);
   }

   console.log(`[scheduler.js]: ✅ Blood Moon start check completed`);
  },
  "America/New_York"
 );

 // 8 AM EST - Blood Moon end announcement (day after blood moon)
 createCronJob(
  "0 8 * * *",
  "blood moon end announcement",
  async () => {
   console.log(`[scheduler.js]: 🌙 Starting Blood Moon end check at 8 AM EST`);

   const channels = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL,
   ];

   // Check if yesterday was a blood moon day
   const yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);
   const yesterdayDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
   
   // Check if yesterday was a blood moon date
   const { bloodmoonDates } = require('./modules/calendarModule');
   let wasYesterdayBloodMoon = false;
   
   for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = new Date(yesterdayDate.getFullYear(), month - 1, day);
    if (yesterdayDate.getTime() === bloodMoonDate.getTime()) {
     wasYesterdayBloodMoon = true;
     console.log(`[scheduler.js]: 🌙 Yesterday (${realDate}) was a Blood Moon day - sending end announcement`);
     break;
    }
   }

   if (wasYesterdayBloodMoon) {
    console.log(`[scheduler.js]: 🌙 Blood Moon ended yesterday - processing channels`);
    await revertChannelNames(client);

    for (const channelId of channels) {
     if (!channelId) {
      console.warn(`[scheduler.js]: ⚠️ Skipping undefined channel ID in Blood Moon end check`);
      continue;
     }

     try {
      await sendBloodMoonEndAnnouncement(client, channelId);
     } catch (error) {
      handleError(error, "scheduler.js");
      console.error(`[scheduler.js]: ❌ Blood Moon end announcement failed for channel ${channelId}: ${error.message}`);
     }
    }
   } else {
    console.log(`[scheduler.js]: 📅 No Blood Moon ended yesterday - no announcement needed`);
   }

   console.log(`[scheduler.js]: ✅ Blood Moon end check completed`);
  },
  "America/New_York"
 );

 // Retry pending Google Sheets operations every 15 minutes
 createCronJob(
  "*/15 * * * *",
  "retry pending Google Sheets operations",
  async () => {
   try {
    const pendingCount = await getPendingSheetOperationsCount();
    if (pendingCount > 0) {
     console.log(`[scheduler.js]: 🔄 Retrying ${pendingCount} pending Google Sheets operations`);
     const result = await retryPendingSheetOperations();
     if (result.success) {
      console.log(`[scheduler.js]: ✅ Retry completed: ${result.retried} successful, ${result.failed} failed`);
     } else {
      console.error(`[scheduler.js]: ❌ Retry failed: ${result.error}`);
     }
    } else {
     console.log(`[scheduler.js]: ✅ No pending Google Sheets operations to retry`);
    }
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ❌ Google Sheets retry task failed: ${error.message}`);
   }
  },
  "America/New_York"
 );

 console.log("[scheduler.js]: All scheduled tasks initialized");
}

module.exports = {
 initializeScheduler,
 setupBlightScheduler,
 setupBoostingScheduler,
 setupWeatherScheduler,
 postWeatherUpdate,
 executeBirthdayAnnouncements,
 handleJailRelease,
 handleDebuffExpiry,
 resetDailyRolls,
 resetPetLastRollDates,
 checkAndGenerateDailyQuests,
 generateDailyQuestsAtMidnight,
 checkAndPostMissedQuests,
};
