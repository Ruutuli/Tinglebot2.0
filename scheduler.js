// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// Core dependencies
const dotenv = require("dotenv");
const path = require("path");
const cron = require("node-cron");

// Discord.js
const { EmbedBuilder } = require("discord.js");

// Database models
const Character = require("./models/CharacterModel");
const Pet = require("./models/PetModel");
const Raid = require("./models/RaidModel");
const RuuGame = require("./models/RuuGameModel");
const HelpWantedQuest = require('./models/HelpWantedQuestModel');

// Database functions
const {
 generateVendingStockList,
 resetPetRollsForAllCharacters,
} = require("./database/db");

// Handlers
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
} = require("./handlers/blightHandler");

// Scripts
const {
 sendBloodMoonAnnouncement,
 sendBloodMoonEndAnnouncement,
 isBloodMoonDay,
 renameChannels,
 revertChannelNames,
 cleanupOldTrackingData,
} = require("./scripts/bloodmoon");

// Modules
const { recoverDailyStamina } = require("./modules/characterStatsModule");
const { bloodmoonDates, convertToHyruleanDate } = require("./modules/calendarModule");
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests, isTravelBlockedByWeather, regenerateEscortQuest } = require('./modules/helpWantedModule');
const { processMonthlyQuestRewards } = require('./modules/questRewardModule');

// Services
const { getCurrentWeather, generateWeatherEmbed, getWeatherWithoutGeneration } = require("./services/weatherService");

// Utils
const { handleError } = require("./utils/globalErrorHandler");
const { sendUserDM } = require("./utils/messageUtils");
const { checkExpiredRequests } = require("./utils/expirationHandler");
const { isValidImageUrl } = require("./utils/validation");
const {
 cleanupExpiredEntries,
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require("./utils/storage");
const {
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require("./utils/googleSheetsUtils");

// Constants
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';

// Channel mappings
const TOWNHALL_CHANNELS = {
 Rudania: process.env.RUDANIA_TOWNHALL,
 Inariko: process.env.INARIKO_TOWNHALL,
 Vhintl: process.env.VHINTL_TOWNHALL,
};

const BLOOD_MOON_CHANNELS = [
 process.env.RUDANIA_TOWNHALL,
 process.env.INARIKO_TOWNHALL,
 process.env.VHINTL_TOWNHALL,
];

// Monthly quest posting (uses existing postQuests function)
const { postQuests } = require('./scripts/questAnnouncements');

// ============================================================================
// ------------------- Environment Setup -------------------
// ============================================================================

const env = process.env.NODE_ENV || "development";
try {
 const envPath = path.resolve(process.cwd(), `.env.${env}`);
 dotenv.config({ path: envPath });
} catch (error) {
 console.error(`[scheduler.js]: Failed to load .env.${env}:`, error.message);
 dotenv.config();
}

// ============================================================================
// ------------------- Utility Functions -------------------
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
// ------------------- Helper Functions -------------------
// ============================================================================

// Helper function to get the appropriate village channel ID
function getVillageChannelId(villageName) {
  // Capitalize the village name to match the TOWNHALL_CHANNELS keys
  const capitalizedVillage = villageName.charAt(0).toUpperCase() + villageName.slice(1).toLowerCase();
  return TOWNHALL_CHANNELS[capitalizedVillage] || HELP_WANTED_TEST_CHANNEL;
}

// ============================================================================
// ------------------- Weather Functions -------------------
// ============================================================================

// ------------------- Weather Helper Functions ------------------

async function postWeatherForVillage(client, village, checkExisting = false) {
 try {
  if (checkExisting) {
   const existingWeather = await getWeatherWithoutGeneration(village);
   if (existingWeather) {
    return false; // Weather already exists
   }
  }

  const weather = await getCurrentWeather(village);
  if (!weather) {
   console.error(`[scheduler.js]: ❌ Failed to get weather for ${village}`);
   return false;
  }

  const channelId = TOWNHALL_CHANNELS[village];
  const channel = client.channels.cache.get(channelId);

  if (!channel) {
   console.error(`[scheduler.js]: ❌ Channel not found: ${channelId}`);
   return false;
  }

  const { embed, files } = await generateWeatherEmbed(village, weather);
  await channel.send({ embeds: [embed], files });
  return true;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error posting weather for ${village}:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: 'postWeatherForVillage',
   village: village
  });
  return false;
 }
}

async function processWeatherForAllVillages(client, checkExisting = false, context = '') {
 try {
  const villages = Object.keys(TOWNHALL_CHANNELS);
  let postedCount = 0;

  for (const village of villages) {
   const posted = await postWeatherForVillage(client, village, checkExisting);
   if (posted) postedCount++;
  }

  if (postedCount > 0) {
   const contextText = context ? ` ${context}` : '';
   console.log(`[scheduler.js]: ✅ Weather posted to ${postedCount}/${villages.length} villages${contextText}`);
  }

  return postedCount;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Weather process failed${context ? ` (${context})` : ''}:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: 'processWeatherForAllVillages',
   context: context
  });
  return 0;
 }
}

// ------------------- Main Weather Functions ------------------

async function postWeatherUpdate(client) {
 return await processWeatherForAllVillages(client, false, 'update');
}

async function checkAndPostWeatherIfNeeded(client) {
 return await processWeatherForAllVillages(client, true, 'backup check');
}

async function checkAndPostWeatherOnRestart(client) {
 try {
  const now = new Date();
  const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentHour = estTime.getHours();
  
  if (currentHour < 8) {
   console.log(`[scheduler.js]: ⏰ Too early for weather generation (${currentHour}:00 AM)`);
   return 0;
  }
  
  return await processWeatherForAllVillages(client, true, 'restart check');
 } catch (error) {
  console.error("[scheduler.js]: ❌ Restart weather check failed:", error.message);
  handleError(error, "scheduler.js", {
   commandName: 'checkAndPostWeatherOnRestart'
  });
  return 0;
 }
}

// ============================================================================
// ------------------- Cleanup Functions -------------------
// ============================================================================

// ------------------- Individual Cleanup Functions ------------------

async function cleanupExpiredRaids() {
 try {
  const expiredCount = await Raid.cleanupExpiredRaids();
  if (expiredCount > 0) {
   console.log(`[scheduler.js]: 🧹 Cleaned up ${expiredCount} expired raids`);
  }
  return { expiredCount };
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error cleaning up expired raids:`, error);
  handleError(error, "scheduler.js");
  return { expiredCount: 0 };
 }
}

async function cleanupOldRuuGameSessions() {
 try {
  console.log(`[scheduler.js]: 🎲 Starting RuuGame session cleanup`);
  
  const result = await RuuGame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   console.log(`[scheduler.js]: ✅ No old RuuGame sessions to clean up`);
   return result;
  }
  
  console.log(`[scheduler.js]: ✅ RuuGame cleanup completed - deleted ${result.deletedCount} sessions`);
  
  if (result.finishedCount > 0) {
   console.log(`[scheduler.js]: 🏆 Cleaned up ${result.finishedCount} completed games`);
  }
  if (result.expiredCount > 0) {
   console.log(`[scheduler.js]: ⏰ Cleaned up ${result.expiredCount} expired sessions`);
  }
  
  return result;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Error cleaning up old RuuGame sessions:`, error);
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0, expiredCount: 0 };
 }
}

// ------------------- Combined Cleanup Functions ------------------

async function runDailyCleanupTasks(client) {
 try {
  console.log('[scheduler.js]: 🧹 Running daily cleanup tasks...');
  
  const results = await Promise.all([
   cleanupExpiredEntries(),
   cleanupExpiredHealingRequests(),
   checkExpiredRequests(client),
   cleanupExpiredBlightRequests(client),
   cleanupExpiredRaids(),
   cleanupOldRuuGameSessions(),
  ]);
  
  const blightResult = results[3];
  if (blightResult && typeof blightResult === 'object') {
   console.log(`[scheduler.js]: ✅ Daily blight cleanup - Expired: ${blightResult.expiredCount}, Notified: ${blightResult.notifiedUsers}, Deleted: ${blightResult.deletedCount}`);
  }
  
  return results;
 } catch (error) {
  console.error('[scheduler.js]: ❌ Error during daily cleanup:', error);
  handleError(error, 'scheduler.js');
  return [];
 }
}

// ============================================================================
// ------------------- Birthday Functions -------------------
// ============================================================================

async function executeBirthdayAnnouncements(client) {
 console.log(`[scheduler.js]: 🎂 Starting birthday announcement check...`);
 
 const now = new Date();
 const estNow = new Date(
  now.toLocaleString("en-US", { timeZone: "America/New_York" })
 );
 const today = estNow.toISOString().slice(5, 10);
 const guildIds = [process.env.GUILD_ID];
 
 console.log(`[scheduler.js]: 📅 Checking for birthdays on ${today} (EST: ${estNow.toLocaleString()})`);

 const guildChannelMap = {
  [process.env.GUILD_ID]:
   process.env.BIRTHDAY_CHANNEL_ID || "606004354419392513",
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

 let announcedCount = 0;

 for (const guildId of guildIds) {
  const birthdayChannelId = guildChannelMap[guildId];
  console.log(`[scheduler.js]: 🏰 Guild ID: ${guildId}, Birthday Channel ID: ${birthdayChannelId}`);
  
  if (!birthdayChannelId) {
   console.log(`[scheduler.js]: ❌ No birthday channel ID found for guild ${guildId}`);
   continue;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
   console.log(`[scheduler.js]: ❌ Guild ${guildId} not found in cache`);
   continue;
  }

  const announcementChannel = guild.channels.cache.get(birthdayChannelId);
  if (!announcementChannel) {
   console.log(`[scheduler.js]: ❌ Birthday channel ${birthdayChannelId} not found in guild ${guildId}`);
   continue;
  }

  console.log(`[scheduler.js]: ✅ Found birthday channel: ${announcementChannel.name} (${birthdayChannelId})`);
  
  const characters = await Character.find({ birthday: today });
  console.log(`[scheduler.js]: 👥 Found ${characters.length} characters with birthday on ${today}`);
  
  if (characters.length > 0) {
   console.log(`[scheduler.js]: 🎂 Characters with birthdays today:`, characters.map(c => `${c.name} (${c.birthday})`));
  } else {
   // Debug: Check if there are any characters with birthdays at all
   const allCharactersWithBirthdays = await Character.find({ birthday: { $exists: true, $ne: null } });
   console.log(`[scheduler.js]: 🔍 Total characters with birthdays: ${allCharactersWithBirthdays.length}`);
   if (allCharactersWithBirthdays.length > 0) {
    console.log(`[scheduler.js]: 📅 Sample birthday formats:`, allCharactersWithBirthdays.slice(0, 5).map(c => `${c.name}: ${c.birthday}`));
   }
  }

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
    announcedCount++;
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(
     `[scheduler.js]: Failed to announce birthday for ${character.name}: ${error.message}`
    );
   }
  }
 }

 if (announcedCount > 0) {
  console.log(`[scheduler.js]: 🎂 Announced ${announcedCount} birthdays`);
 }
}

// ============================================================================
// ------------------- Job Functions -------------------
// ============================================================================

async function handleJailRelease(client) {
 const now = new Date();
 const charactersToRelease = await Character.find({
  inJail: true,
  jailReleaseTime: { $lte: now },
 });

 if (charactersToRelease.length === 0) {
  return;
 }

 let releasedCount = 0;

 for (const character of charactersToRelease) {
  character.inJail = false;
  character.failedStealAttempts = 0;
  character.jailReleaseTime = null;
  await character.save();

  const releaseEmbed = createAnnouncementEmbed(
   "Town Hall Proclamation",
   `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`,
   character.icon,
   "https://storage.googleapis.com/tinglebot/Graphics/border.png",
   "Town Hall Records • Reformed & Released"
  );

  // Post announcement in character's current village town hall channel
  try {
   const villageChannelId = getVillageChannelId(character.currentVillage);
   const villageChannel = await client.channels.fetch(villageChannelId);
   
   if (villageChannel) {
    await villageChannel.send({
     content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
     embeds: [releaseEmbed],
    });
    releasedCount++;
    console.log(`[scheduler.js]: 🔓 Posted jail release for ${character.name} in ${character.currentVillage} town hall`);
   } else {
    console.error(`[scheduler.js]: ❌ Could not find town hall channel for ${character.currentVillage} (ID: ${villageChannelId})`);
   }
  } catch (error) {
   console.error(`[scheduler.js]: ❌ Error posting jail release for ${character.name} in ${character.currentVillage}:`, error.message);
  }

  const dmSent = await sendUserDM(
   character.userId,
   `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`,
   client
  );
  
  if (!dmSent) {
    console.log(`[scheduler.js]: ℹ️ Could not send jail release DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
  }
 }

 if (releasedCount > 0) {
  console.log(`[scheduler.js]: 🔓 Released ${releasedCount} characters from jail`);
 }
}

async function handleDebuffExpiry(client) {
  const now = new Date();
  // Get current time in EST
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Create midnight EST in UTC (5 AM UTC = midnight EST)
  const midnightEST = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 5, 0, 0, 0));
  
  const charactersWithActiveDebuffs = await Character.find({
    "debuff.active": true,
    "debuff.endDate": { $lte: midnightEST },
  });

  if (charactersWithActiveDebuffs.length > 0) {
    console.log(`[scheduler.js]: 🧹 Expiring debuffs for ${charactersWithActiveDebuffs.length} characters`);
    
    for (const character of charactersWithActiveDebuffs) {
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();

      const dmSent = await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`,
        client
      );
      
      if (!dmSent) {
        console.log(`[scheduler.js]: ℹ️ Could not send debuff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
      }
    }
  }
}

async function handleBuffExpiry(client) {
  const now = new Date();
  // Get current time in EST
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Create midnight EST in UTC (5 AM UTC = midnight EST)
  const midnightEST = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 5, 0, 0, 0));
  
  const charactersWithActiveBuffs = await Character.find({
    "buff.active": true,
    "buff.endDate": { $lte: midnightEST },
  });

  if (charactersWithActiveBuffs.length > 0) {
    console.log(`[scheduler.js]: 🧹 Expiring buffs for ${charactersWithActiveBuffs.length} characters`);
    
    for (const character of charactersWithActiveBuffs) {
      character.buff.active = false;
      character.buff.endDate = null;
      await character.save();

      const dmSent = await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s buff has ended! You can now heal them with items or a Healer.`,
        client
      );
      
      if (!dmSent) {
        console.log(`[scheduler.js]: ℹ️ Could not send buff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
      }
    }
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

  if (resetCount > 0) {
   console.log(`[scheduler.js]: 🔄 Reset daily rolls for ${resetCount} characters`);
  }
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
  if (result.modifiedCount > 0) {
   console.log(
    `[scheduler.js]: 🐾 Reset lastRollDate for ${result.modifiedCount} pets`
   );
  }
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(
   `[scheduler.js]: Failed to reset pet lastRollDates: ${error.message}`
  );
 }
}

// ============================================================================
// ------------------- Blight Functions -------------------
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
      const result = await cleanupExpiredBlightRequests(client);
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
      const result = await checkExpiringBlightRequests(client);
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
// ------------------- Boosting Functions -------------------
// ============================================================================

async function setupBoostingScheduler(client) {
 createCronJob("0 0 * * *", "Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting boost cleanup");
   
   // Clean up old file-based boosting requests
   const stats = cleanupExpiredBoostingRequests();
   
   // Clean up TempData boosting requests
   const TempData = require('./models/TempDataModel');
   const tempDataResult = await TempData.cleanupByType('boosting');
   
   console.log(
    `[scheduler.js]: ✅ Boost cleanup complete - Expired requests: ${stats.expiredRequests}, Expired boosts: ${stats.expiredBoosts}, TempData boosting deleted: ${tempDataResult.deletedCount || 0}`
   );
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during boost cleanup:", error);
  }
 });

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

 createCronJob("0 0 * * *", "Daily Boost Statistics", async () => {
  try {
   const stats = getBoostingStatistics();
   console.log("[scheduler.js]: 📊 Daily boost statistics:", stats);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error getting boost statistics:", error);
  }
 });

 // Additional cleanup every 6 hours for TempData boosting requests
 createCronJob("0 */6 * * *", "TempData Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting TempData boost cleanup");
   const TempData = require('./models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   console.log(`[scheduler.js]: ✅ TempData boost cleanup complete - Deleted: ${result.deletedCount || 0}`);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during TempData boost cleanup:", error);
  }
 });

 // Hourly cleanup for boosting data to ensure expired boosts are removed quickly
 createCronJob("0 * * * *", "Hourly Boost Cleanup", async () => {
  try {
   console.log("[scheduler.js]: 🧹 Starting hourly boost cleanup");
   const TempData = require('./models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   if (result.deletedCount > 0) {
     console.log(`[scheduler.js]: ✅ Hourly boost cleanup complete - Deleted: ${result.deletedCount}`);
   }
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error("[scheduler.js]: ❌ Error during hourly boost cleanup:", error);
  }
 });
}

// ============================================================================
// ------------------- Weather Scheduler -------------------
// ============================================================================

function setupWeatherScheduler(client) {
 // Primary weather update at 8:00am EST (1:00pm UTC during EST, 12:00pm UTC during EDT)
 createCronJob("0 8 * * *", "Daily Weather Update", () =>
  postWeatherUpdate(client),
  "America/New_York"
 );
 
 // Backup weather check at 8:15am EST to ensure weather was posted
 createCronJob("15 8 * * *", "Backup Weather Check", () =>
  checkAndPostWeatherIfNeeded(client),
  "America/New_York"
 );
}

// ============================================================================
// ------------------- Help Wanted Functions -------------------
// ============================================================================

// ------------------- Quest Generation Functions ------------------

async function checkAndGenerateDailyQuests() {
  try {
    const todaysQuests = await require('./modules/helpWantedModule').getTodaysQuests();
    
    if (todaysQuests.length === 0) {
      console.log('[scheduler.js]: 📝 Generating new daily quests...');
      await generateDailyQuests();
      console.log('[scheduler.js]: ✅ Daily quests generated');
    }
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndGenerateDailyQuests'
    });
    console.error('[scheduler.js]: ❌ Error checking/generating daily quests:', error);
  }
}

async function generateDailyQuestsAtMidnight() {
  try {
    console.log('[scheduler.js]: 🌙 Midnight quest generation starting...');
    await generateDailyQuests();
    console.log('[scheduler.js]: ✅ Midnight quest generation completed');
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'generateDailyQuestsAtMidnight'
    });
    console.error('[scheduler.js]: ❌ Error during midnight quest generation:', error);
  }
}

async function handleQuestExpirationAtMidnight(client = null) {
  try {
    console.log('[scheduler.js]: ⏰ Midnight quest expiration check starting...');
    
    const { updateQuestEmbed } = require('./modules/helpWantedModule');
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    const expiredQuests = await HelpWantedQuest.find({
      date: yesterdayDate,
      completed: false,
      messageId: { $ne: null }
    });
    
    if (expiredQuests.length === 0) {
      console.log('[scheduler.js]: ✅ No quests to expire from yesterday');
      return;
    }
    
    console.log(`[scheduler.js]: 📋 Found ${expiredQuests.length} quests to mark as expired`);
    
    let updatedCount = 0;
    for (const quest of expiredQuests) {
      try {
        await updateQuestEmbed(client, quest);
        updatedCount++;
        console.log(`[scheduler.js]: ✅ Updated expired quest embed for ${quest.village} (${quest.questId})`);
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Failed to update expired quest embed for ${quest.questId}:`, error);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Quest expiration completed - ${updatedCount}/${expiredQuests.length} quests updated`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'handleQuestExpirationAtMidnight'
    });
    console.error('[scheduler.js]: ❌ Error during quest expiration check:', error);
  }
}

// ============================================================================
// ------------------- Function: checkQuestCompletions -------------------
// Checks all active quests for completion using unified system
// ============================================================================
async function checkQuestCompletions(client) {
  try {
    console.log('[scheduler.js]: 🔍 Checking quest completions...');
    
    const Quest = require('./models/QuestModel');
    const questRewardModule = require('./modules/questRewardModule');
    
    const activeQuests = await Quest.find({ status: 'active' });
    
    if (activeQuests.length === 0) {
      console.log('[scheduler.js]: ✅ No active quests to check');
      return;
    }
    
    console.log(`[scheduler.js]: 📋 Found ${activeQuests.length} active quests to check`);
    
    let completedCount = 0;
    let processedCount = 0;
    
    for (const quest of activeQuests) {
      try {
        const completionResult = await quest.checkAutoCompletion(true); // Force check for scheduler
        
        if (completionResult.completed && completionResult.needsRewardProcessing) {
          completedCount++;
          console.log(`[scheduler.js]: ✅ Quest "${quest.title}" completed: ${completionResult.reason}`);
          
          // Distribute rewards if quest was completed
          if (completionResult.reason === 'all_participants_completed' || completionResult.reason === 'time_expired') {
            await questRewardModule.processQuestCompletion(quest.questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
          }
        } else if (completionResult.completed) {
          console.log(`[scheduler.js]: ℹ️ Quest "${quest.title}" already processed: ${completionResult.reason}`);
        }
        
        processedCount++;
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Error checking quest ${quest.questID}:`, error);
      }
    }
    
    console.log(`[scheduler.js]: ✅ Quest completion check finished - ${completedCount} completed, ${processedCount} processed`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkQuestCompletions'
    });
    console.error('[scheduler.js]: ❌ Error during quest completion check:', error);
  }
}

// ------------------- Quest Posting Helper Functions ------------------

async function handleEscortQuestWeather(quest) {
  if (quest.type === 'escort') {
    const travelBlocked = await isTravelBlockedByWeather(quest.village);
    if (travelBlocked) {
      console.log(`[scheduler.js]: 🌤️ Regenerating escort quest ${quest.questId} for ${quest.village} due to travel-blocking weather`);
      try {
        await regenerateEscortQuest(quest);
        console.log(`[scheduler.js]: ✅ Successfully regenerated quest ${quest.questId} as ${quest.type} quest`);
        return true;
      } catch (error) {
        console.error(`[scheduler.js]: ❌ Failed to regenerate escort quest ${quest.questId}:`, error);
        return false;
      }
    }
  }
  return true;
}

async function postQuestToChannel(client, quest, context = '') {
  try {
    const embedsByVillage = await formatSpecificQuestsAsEmbedsByVillage([quest]);
    const embed = embedsByVillage[quest.village];
    
    if (!embed) return false;
    
    const villageChannelId = getVillageChannelId(quest.village);
    const channel = await client.channels.fetch(villageChannelId);
    
    if (!channel) {
      console.log(`[scheduler.js]: ❌ Could not fetch channel for ${quest.village} (ID: ${villageChannelId})`);
      return false;
    }
    
    const message = await channel.send({ embeds: [embed] });
    const updatedQuest = await HelpWantedQuest.findOneAndUpdate(
      { _id: quest._id, messageId: null },
      { 
        messageId: message.id,
        channelId: channel.id
      },
      { new: true }
    );
    
    if (updatedQuest) {
      console.log(`[scheduler.js]: ✅ Posted quest ${quest.questId} for ${quest.village}${context}`);
      return true;
    } else {
      console.log(`[scheduler.js]: ℹ️ Quest ${quest.questId} was already posted by another process, skipping`);
      return false;
    }
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error posting quest ${quest.questId}:`, error);
    return false;
  }
}

// ------------------- Quest Posting Functions ------------------

async function checkAndPostMissedQuests(client) {
  try {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    const currentMinute = estTime.getMinutes();
    
    // Check if it's after 12pm EST - if so, don't post art/writing quests
    const isAfterNoon = currentHour >= 12;
    
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const unpostedQuests = await HelpWantedQuest.find({
      date: today,
      messageId: null
    });
    
    if (!unpostedQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No missed quests to post during startup`);
      return 0;
    }
    
    // Filter out art and writing quests if it's after 12pm EST
    let filteredQuests = unpostedQuests;
    if (isAfterNoon) {
      filteredQuests = unpostedQuests.filter(quest => quest.type !== 'art' && quest.type !== 'writing');
      const skippedCount = unpostedQuests.length - filteredQuests.length;
      if (skippedCount > 0) {
        console.log(`[scheduler.js]: ⏰ After 12pm EST (${currentHour}:00) - Skipping ${skippedCount} art/writing quest(s) to ensure adequate completion time`);
      }
    }
    
    if (!filteredQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No missed quests to post during startup (filtered out art/writing quests)`);
      return 0;
    }
    
    const shuffledQuests = filteredQuests.sort(() => Math.random() - 0.5);
    let posted = 0;
    
    for (const quest of shuffledQuests) {
      const scheduledTime = quest.scheduledPostTime;
      if (!scheduledTime) continue;
      
      const parts = scheduledTime.split(' ');
      if (parts.length !== 5) continue;
      
      const scheduledMinute = parseInt(parts[0]);
      const scheduledHour = parseInt(parts[1]);
      const scheduledTimeInMinutes = scheduledHour * 60 + scheduledMinute;
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      
      if (currentTimeInMinutes >= scheduledTimeInMinutes) {
        const weatherHandled = await handleEscortQuestWeather(quest);
        if (!weatherHandled) continue;
        
        const context = ` in ${quest.village} town hall (was scheduled for ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')})`;
        const success = await postQuestToChannel(client, quest, context);
        if (success) posted++;
      }
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: 📤 Posted ${posted} missed quests during startup`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', { commandName: 'checkAndPostMissedQuests' });
    console.error('[scheduler.js]: ❌ Error checking for missed quests:', error);
    return 0;
  }
}

async function checkAndPostScheduledQuests(client, cronTime) {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    // Check if it's after 12pm EST - if so, don't post art/writing quests
    const estHour = parseInt(now.toLocaleString('en-US', {timeZone: 'America/New_York', hour: 'numeric', hour12: false}));
    const isAfterNoon = estHour >= 12;
    
    const questsToPost = await HelpWantedQuest.find({
      date: today,
      scheduledPostTime: cronTime,
      messageId: null
    });
    
    if (!questsToPost.length) {
      console.log(`[scheduler.js]: ℹ️ No quests scheduled for ${cronTime} on ${today}`);
      return 0;
    }
    
    // Filter out art and writing quests if it's after 12pm EST
    let filteredQuests = questsToPost;
    if (isAfterNoon) {
      filteredQuests = questsToPost.filter(quest => quest.type !== 'art' && quest.type !== 'writing');
      const skippedCount = questsToPost.length - filteredQuests.length;
      if (skippedCount > 0) {
        console.log(`[scheduler.js]: ⏰ After 12pm EST (${estHour}:00) - Skipping ${skippedCount} art/writing quest(s) to ensure adequate completion time`);
      }
    }
    
    if (!filteredQuests.length) {
      console.log(`[scheduler.js]: ℹ️ No quests to post for ${cronTime} on ${today} (filtered out art/writing quests)`);
      return 0;
    }
    
    const shuffledQuests = filteredQuests.sort(() => Math.random() - 0.5);
    let posted = 0;
    
    for (const quest of shuffledQuests) {
      const weatherHandled = await handleEscortQuestWeather(quest);
      if (!weatherHandled) continue;
      
      const parts = cronTime.split(' ');
      const scheduledMinute = parseInt(parts[0]);
      const scheduledHour = parseInt(parts[1]);
      const context = ` in ${quest.village} town hall at ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')} (scheduled time: ${cronTime})`;
      
      const success = await postQuestToChannel(client, quest, context);
      if (success) posted++;
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: 📤 Posted ${posted} scheduled quests for ${cronTime}`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndPostScheduledQuests',
      scheduledTime: cronTime
    });
    console.error('[scheduler.js]: ❌ Error checking and posting scheduled quests:', error);
    return 0;
  }
}

function setupHelpWantedFixedScheduler(client) {
  const { FIXED_CRON_TIMES } = require('./modules/helpWantedModule');
  
  // Schedule all 24 time slots for full 24-hour coverage
  // The variable buffer (3-6 hours) is handled in the quest generation logic
  FIXED_CRON_TIMES.forEach(cronTime => {
    createCronJob(
      cronTime,
      `Help Wanted Board Check - ${cronTime}`,
      () => checkAndPostScheduledQuests(client, cronTime),
      'America/New_York'
    );
    console.log(`[scheduler.js]: 📋 Scheduled Help Wanted board check for ${cronTime}`);
  });
  
  console.log(`[scheduler.js]: ✅ Help Wanted scheduler configured with ${FIXED_CRON_TIMES.length} time slots (full 24-hour coverage with variable 3-6 hour buffer in quest generation)`);
}

// ============================================================================
// ------------------- Blood Moon Functions -------------------
// ============================================================================

// ------------------- Blood Moon Helper Functions ------------------

async function sendBloodMoonAnnouncementsToChannels(client, message) {
 const channels = BLOOD_MOON_CHANNELS.filter(channelId => channelId);
 let successCount = 0;

 for (const channelId of channels) {
  try {
   await sendBloodMoonAnnouncement(client, channelId, message);
   successCount++;
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error(`[scheduler.js]: ❌ Blood Moon announcement failed for channel ${channelId}: ${error.message}`);
  }
 }

 return successCount;
}

// ------------------- Main Blood Moon Functions ------------------

async function handleBloodMoonStart(client) {
  console.log(`[scheduler.js]: 🌕 Starting Blood Moon start check at 8 PM EST`);

  const isBloodMoonActive = isBloodMoonDay();
  
  if (isBloodMoonActive) {
   console.log(`[scheduler.js]: 🌕 Blood Moon is active - processing channels`);
   await renameChannels(client);

   const successCount = await sendBloodMoonAnnouncementsToChannels(
    client, 
    "The Blood Moon rises at nightfall! Beware!"
   );
   
   console.log(`[scheduler.js]: ✅ Blood Moon start announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   console.log(`[scheduler.js]: 📅 Blood Moon not active - no announcement needed`);
  }

  console.log(`[scheduler.js]: ✅ Blood Moon start check completed`);
}

async function handleBloodMoonEnd(client) {
  console.log(`[scheduler.js]: 🌙 Starting Blood Moon end check at 8 AM EST`);

  const wasBloodMoonYesterday = checkBloodMoonTransition();
  
  if (wasBloodMoonYesterday && !isBloodMoonDay()) {
   console.log(`[scheduler.js]: 🌙 Blood Moon has ended - transitioning from Blood Moon period`);
   await revertChannelNames(client);

   const successCount = await sendBloodMoonEndAnnouncementsToChannels(client);
   console.log(`[scheduler.js]: ✅ Blood Moon end announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   console.log(`[scheduler.js]: 📅 No Blood Moon transition detected - no end announcement needed`);
  }

  console.log(`[scheduler.js]: ✅ Blood Moon end check completed`);
}

// ------------------- Blood Moon Transition Helper ------------------

function checkBloodMoonTransition() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    return false;
  }
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const currentYearBloodMoonDate = new Date(today.getFullYear(), month - 1, day);
    const dayBefore = new Date(currentYearBloodMoonDate);
    dayBefore.setDate(currentYearBloodMoonDate.getDate() - 1);
    const dayAfter = new Date(currentYearBloodMoonDate);
    dayAfter.setDate(currentYearBloodMoonDate.getDate() + 1);
    
    if (yesterday >= dayBefore && yesterday <= dayAfter) {
      const yesterdayHour = 23; // Assume 8 AM check means yesterday ended at 8 AM
      let wasActiveYesterday = false;
      
      if (yesterday.getTime() === dayBefore.getTime()) {
        wasActiveYesterday = yesterdayHour >= 20; // 8 PM or later
      } else if (yesterday.getTime() === currentYearBloodMoonDate.getTime()) {
        wasActiveYesterday = true; // Full day active
      } else if (yesterday.getTime() === dayAfter.getTime()) {
        wasActiveYesterday = yesterdayHour < 8; // Before 8 AM
      }
      
      if (wasActiveYesterday) {
        return true;
      }
    }
  }
  
  return false;
}

async function sendBloodMoonEndAnnouncementsToChannels(client) {
  const channels = BLOOD_MOON_CHANNELS.filter(channelId => channelId);
  let successCount = 0;

  for (const channelId of channels) {
   try {
    await sendBloodMoonEndAnnouncement(client, channelId);
    successCount++;
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ❌ Blood Moon end announcement failed for channel ${channelId}: ${error.message}`);
   }
  }

  return successCount;
}

// ============================================================================
// ------------------- Scheduler Initialization -------------------
// ============================================================================

// ------------------- Startup Functions ------------------

async function runStartupChecks(client) {
 try {
  console.log(`[scheduler.js]: 🚀 Running startup checks...`);
  
  // Blood Moon startup check
  const isBloodMoonActive = isBloodMoonDay();
  if (isBloodMoonActive) {
   await renameChannels(client);
   const successCount = await sendBloodMoonAnnouncementsToChannels(
    client, 
    "The Blood Moon is upon us! Beware!"
   );
   console.log(`[scheduler.js]: 🌕 Blood Moon startup announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   await revertChannelNames(client);
  }

  // Character and quest startup tasks
  await Promise.all([
   handleDebuffExpiry(client),
   handleBuffExpiry(client),
   checkAndGenerateDailyQuests(),
   checkAndPostMissedQuests(client),
   handleQuestExpirationAtMidnight(client)
  ]);

  console.log(`[scheduler.js]: ✅ Startup completed`);
 } catch (error) {
  handleError(error, "scheduler.js");
  console.error(`[scheduler.js]: ❌ Startup checks failed: ${error.message}`);
 }
}

// ------------------- Scheduler Setup Functions ------------------

function setupDailyTasks(client) {
 // Daily tasks at midnight
 createCronJob("0 0 * * *", "jail release check", () => handleJailRelease(client));
 createCronJob("0 0 * * *", "reset pet last roll dates", () => resetPetLastRollDates(client));
 createCronJob("0 0 * * *", "birthday announcements", () => executeBirthdayAnnouncements(client));
 createCronJob("0 0 * * *", "midnight quest generation", () => generateDailyQuestsAtMidnight());
 createCronJob("0 0 * * *", "quest expiration check", () => handleQuestExpirationAtMidnight(client));
 createCronJob("0 0 * * *", "request expiration and cleanup", () => runDailyCleanupTasks(client));

 // Daily tasks at 8 AM
 createCronJob("0 8 * * *", "reset daily rolls", () => resetDailyRolls(client));
 createCronJob("0 8 * * *", "daily stamina recovery", () => recoverDailyStamina(client));

 // Daily tasks at 5 AM
 createCronJob("0 5 * * *", "debuff expiry check", () => handleDebuffExpiry(client));
 createCronJob("0 5 * * *", "buff expiry check", () => handleBuffExpiry(client));
 createCronJob("0 5 * * *", "reset global steal protections", () => {
  console.log(`[scheduler.js]: 🛡️ Starting global steal protection reset`);
  try {
   const { resetAllStealProtections } = require('./commands/jobs/steal.js');
   resetAllStealProtections();
   console.log(`[scheduler.js]: ✅ Global steal protections reset completed`);
  } catch (error) {
   console.error(`[scheduler.js]: ❌ Error resetting global steal protections:`, error);
  }
 }, "America/New_York");

 // Weekly tasks
 createCronJob("0 0 * * 0", "weekly pet rolls reset", () => resetPetRollsForAllCharacters(client));

 // Monthly tasks
 createCronJob("0 0 1 * *", "monthly vending stock generation", () => generateVendingStockList(client));
 createCronJob("0 5 1 * *", "monthly quest posting", async () => {
  try {
   console.log('[scheduler.js]: 📅 Starting monthly quest posting...');
   await postQuests(client);
   console.log('[scheduler.js]: ✅ Monthly quest posting completed');
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Monthly quest posting failed:', error.message);
  }
 }, "America/New_York");
 createCronJob("0 1 1 * *", "monthly quest reward distribution", async () => {
  try {
   console.log('[scheduler.js]: 🏆 Starting monthly quest reward distribution...');
   const result = await processMonthlyQuestRewards();
   console.log(`[scheduler.js]: ✅ Monthly quest rewards distributed - Processed: ${result.processed}, Rewarded: ${result.rewarded}, Errors: ${result.errors}`);
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Monthly quest reward distribution failed:', error.message);
  }
 });

 // Hourly tasks
 createCronJob("0 */6 * * *", "quest completion check", () => checkQuestCompletions(client));
 createCronJob("0 1 * * *", "blood moon tracking cleanup", () => {
  console.log(`[scheduler.js]: 🧹 Starting Blood Moon tracking cleanup`);
  cleanupOldTrackingData();
  console.log(`[scheduler.js]: ✅ Blood Moon tracking cleanup completed`);
 });
}

function setupQuestPosting(client) {
 // Quest posting check - runs daily at midnight
 createCronJob("0 0 * * *", "quest posting check", async () => {
  try {
   process.env.TEST_CHANNEL_ID = '706880599863853097';
   delete require.cache[require.resolve('./scripts/questAnnouncements')];
   const { postQuests } = require('./scripts/questAnnouncements');
   await postQuests(client);
  } catch (error) {
   handleError(error, 'scheduler.js');
   console.error('[scheduler.js]: ❌ Quest posting check failed:', error.message);
  }
 }, "America/New_York");
}

function setupBloodMoonScheduling(client) {
 createCronJob("0 20 * * *", "blood moon start announcement", () => handleBloodMoonStart(client), "America/New_York");
 createCronJob("0 8 * * *", "blood moon end announcement", () => handleBloodMoonEnd(client), "America/New_York");
}

function setupGoogleSheetsRetry() {
 createCronJob("*/15 * * * *", "retry pending Google Sheets operations", async () => {
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
 }, "America/New_York");
}

// ------------------- Main Initialization Function ------------------

function initializeScheduler(client) {
 if (!client || !client.isReady()) {
  console.error("[scheduler.js]: ❌ Invalid or unready Discord client provided to scheduler");
  return;
 }

 // Run startup checks
 runStartupChecks(client);

 // Setup all schedulers
 setupDailyTasks(client);
 setupQuestPosting(client);
 setupBloodMoonScheduling(client);
 setupGoogleSheetsRetry();

 // Initialize specialized schedulers
 setupBlightScheduler(client);
 setupBoostingScheduler(client);
 setupWeatherScheduler(client);
 setupHelpWantedFixedScheduler(client);
 
 // Check and post weather on restart if needed
 (async () => {
   try {
     await checkAndPostWeatherOnRestart(client);
   } catch (error) {
     console.error(`[scheduler.js]: ❌ Restart weather check failed:`, error.message);
     handleError(error, "scheduler.js", {
       commandName: 'initializeScheduler',
       operation: 'restartWeatherCheck'
     });
   }
 })();

 console.log("[scheduler.js]: ✅ All scheduled tasks initialized");
}

module.exports = {
 initializeScheduler,
 setupBlightScheduler,
 setupBoostingScheduler,
 setupWeatherScheduler,
 postWeatherUpdate,
 checkAndPostWeatherIfNeeded,
 checkAndPostWeatherOnRestart,
 executeBirthdayAnnouncements,
 handleJailRelease,
 handleDebuffExpiry,
 handleBuffExpiry,
 resetDailyRolls,
 resetPetLastRollDates,
 checkAndGenerateDailyQuests,
 generateDailyQuestsAtMidnight,
 checkAndPostMissedQuests,
 cleanupOldRuuGameSessions,
};
