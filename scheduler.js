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
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require("./utils/googleSheetsUtils");
const { convertToHyruleanDate } = require("./modules/calendarModule");
const Character = require("./models/CharacterModel");
const { sendUserDM } = require("./utils/messageUtils");
const { checkExpiredRequests } = require("./utils/expirationHandler");
const { isValidImageUrl } = require("./utils/validation");
const DEFAULT_IMAGE_URL =
 "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const { getCurrentWeather, generateWeatherEmbed } = require("./services/weatherService");
const Pet = require("./models/PetModel");
const Raid = require("./models/RaidModel");
const RuuGame = require("./models/RuuGameModel");
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests } = require('./modules/helpWantedModule');
const HelpWantedQuest = require('./models/HelpWantedQuestModel');
const { removeExpiredBuffs } = require('./modules/elixirModule');

const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';

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
// ------------------- Cron Job Management -------------------
// ============================================================================

// Store references to all cron jobs for management
const activeCronJobs = new Map();

function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = "America/New_York"
) {
 console.log(`[scheduler.js]: 📅 Creating cron job: ${jobName} with schedule: ${schedule} (${timezone})`);
 
 const job = cron.schedule(
  schedule,
  async () => {
   try {
    console.log(`[scheduler.js]: 🚀 Starting cron job: ${jobName}`);
    await jobFunction();
    console.log(`[scheduler.js]: ✅ Completed cron job: ${jobName}`);
   } catch (error) {
    handleError(error, "scheduler.js");
    console.error(`[scheduler.js]: ❌ Cron job ${jobName} failed:`, error.message);
   }
  },
  { timezone }
 );
 
 // Store the job reference
 activeCronJobs.set(jobName, {
  job,
  schedule,
  timezone,
  name: jobName,
  created: new Date(),
  lastRun: null,
  runCount: 0
 });
 
 console.log(`[scheduler.js]: ✅ Cron job created: ${jobName}`);
 return job;
}

function listActiveCronJobs() {
 console.log(`[scheduler.js]: 📋 Active Cron Jobs (${activeCronJobs.size}):`);
 
 if (activeCronJobs.size === 0) {
  console.log(`[scheduler.js]: ⚠️ No active cron jobs found`);
  return;
 }
 
 for (const [jobName, jobInfo] of activeCronJobs) {
  const status = jobInfo.job.running ? '🟢 Running' : '🔴 Stopped';
  const nextRun = jobInfo.job.nextDate();
  const nextRunStr = nextRun ? nextRun.toLocaleString('en-US', { timeZone: jobInfo.timezone }) : 'Unknown';
  
  console.log(`[scheduler.js]: 📅 ${jobName}:`);
  console.log(`   Status: ${status}`);
  console.log(`   Schedule: ${jobInfo.schedule}`);
  console.log(`   Timezone: ${jobInfo.timezone}`);
  console.log(`   Created: ${jobInfo.created.toLocaleString()}`);
  console.log(`   Next Run: ${nextRunStr}`);
  console.log(`   Run Count: ${jobInfo.runCount}`);
  console.log('');
 }
}

function stopAllCronJobs() {
 console.log(`[scheduler.js]: 🛑 Stopping all cron jobs...`);
 
 for (const [jobName, jobInfo] of activeCronJobs) {
  try {
   jobInfo.job.stop();
   console.log(`[scheduler.js]: ✅ Stopped cron job: ${jobName}`);
  } catch (error) {
   console.error(`[scheduler.js]: ❌ Error stopping cron job ${jobName}:`, error.message);
  }
 }
 
 activeCronJobs.clear();
 console.log(`[scheduler.js]: ✅ All cron jobs stopped`);
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
  const villageChannels = {
    'Rudania': process.env.RUDANIA_TOWNHALL,
    'Inariko': process.env.INARIKO_TOWNHALL,
    'Vhintl': process.env.VHINTL_TOWNHALL
  };
  
  return villageChannels[villageName] || process.env.HELP_WANTED_TEST_CHANNEL;
}

// ============================================================================
// ------------------- Weather Functions -------------------
// ============================================================================

const TOWNHALL_CHANNELS = {
 Rudania: process.env.RUDANIA_TOWNHALL,
 Inariko: process.env.INARIKO_TOWNHALL,
 Vhintl: process.env.VHINTL_TOWNHALL,
};

async function postWeatherUpdate(client) {
 try {
  console.log(`[scheduler.js]: 🌤️ Starting weather update process`);

  // Validate environment variables
  const missingChannels = [];
  const townhallChannels = {
   Rudania: process.env.RUDANIA_TOWNHALL,
   Inariko: process.env.INARIKO_TOWNHALL,
   Vhintl: process.env.VHINTL_TOWNHALL,
  };

  // Check for missing environment variables
  for (const [village, channelId] of Object.entries(townhallChannels)) {
   if (!channelId) {
    missingChannels.push(village);
    console.error(`[scheduler.js]: ❌ Missing environment variable for ${village}: RUDANIA_TOWNHALL, INARIKO_TOWNHALL, or VHINTL_TOWNHALL`);
   }
  }

  if (missingChannels.length > 0) {
   throw new Error(`Missing environment variables for villages: ${missingChannels.join(', ')}`);
  }

  const villages = Object.keys(townhallChannels);
  let postedCount = 0;
  let errorCount = 0;

  console.log(`[scheduler.js]: 📍 Processing ${villages.length} villages: ${villages.join(', ')}`);

  for (const village of villages) {
   try {
    console.log(`[scheduler.js]: 🌤️ Processing weather for ${village}...`);
    
    const weather = await getCurrentWeather(village);

    if (!weather) {
     console.error(`[scheduler.js]: ❌ Failed to get or generate weather for ${village}`);
     errorCount++;
     continue;
    }

    const channelId = townhallChannels[village];
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
     console.error(`[scheduler.js]: ❌ Channel not found for ${village}: ${channelId}`);
     errorCount++;
     continue;
    }

    console.log(`[scheduler.js]: 📤 Generating weather embed for ${village}...`);
    const { embed, files } = await generateWeatherEmbed(village, weather);
    
    console.log(`[scheduler.js]: 📤 Sending weather to ${village} town hall...`);
    await channel.send({ embeds: [embed], files });
    
    console.log(`[scheduler.js]: ✅ Weather posted successfully to ${village}`);
    postedCount++;
    
   } catch (error) {
    console.error(`[scheduler.js]: ❌ Error posting weather for ${village}:`, error.message);
    errorCount++;
    
    // Log detailed error for debugging
    handleError(error, "scheduler.js", {
     commandName: "postWeatherUpdate",
     village: village,
     channelId: townhallChannels[village]
    });
   }
  }

  if (postedCount === 0) {
   throw new Error(`Failed to post weather to any village. Errors: ${errorCount}`);
  }

  console.log(`[scheduler.js]: ✅ Weather update completed - posted to ${postedCount}/${villages.length} villages`);
  
  if (errorCount > 0) {
   console.warn(`[scheduler.js]: ⚠️ Weather update completed with ${errorCount} errors`);
  }
  
  return { success: true, postedCount, errorCount };
  
 } catch (error) {
  console.error("[scheduler.js]: ❌ Weather update process failed:", error.message);
  
  // Log the full error for debugging
  handleError(error, "scheduler.js", {
   commandName: "postWeatherUpdate",
   operation: "weather_update_process"
  });
  
  throw error;
 }
}

// ============================================================================
// ------------------- Cleanup Functions -------------------
// ============================================================================

async function cleanupExpiredRaids() {
 try {
  const expiredCount = await Raid.cleanupExpiredRaids();

  if (expiredCount > 0) {
   console.log(`[scheduler.js]: 🧹 Cleaned up ${expiredCount} expired raids`);
  }
 } catch (error) {
  console.error(`[scheduler.js]: Error cleaning up expired raids:`, error);
  handleError(error, "scheduler.js");
 }
}

async function cleanupOldRuuGameSessions() {
 try {
  console.log(`[scheduler.js]: 🎲 Starting RuuGame session cleanup`);
  
  const result = await RuuGame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   console.log(`[scheduler.js]: ✅ No old RuuGame sessions to clean up`);
   return;
  }
  
  console.log(`[scheduler.js]: ✅ RuuGame cleanup completed - deleted ${result.deletedCount} sessions`);
  
  if (result.finishedCount > 0) {
   console.log(`[scheduler.js]: 🏆 Cleaned up ${result.finishedCount} completed games`);
  }
  if (result.expiredCount > 0) {
   console.log(`[scheduler.js]: ⏰ Cleaned up ${result.expiredCount} expired sessions`);
  }
  
 } catch (error) {
  console.error(`[scheduler.js]: Error cleaning up old RuuGame sessions:`, error);
  handleError(error, "scheduler.js");
 }
}

// ============================================================================
// ------------------- Birthday Functions -------------------
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

 let announcedCount = 0;

 for (const guildId of guildIds) {
  const birthdayChannelId = guildChannelMap[guildId];
  if (!birthdayChannelId) continue;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) continue;

  const announcementChannel = guild.channels.cache.get(birthdayChannelId);
  if (!announcementChannel) continue;

  const characters = await Character.find({ birthday: today });

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

 const testChannel = await client.channels.fetch(HELP_WANTED_TEST_CHANNEL);

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

  if (testChannel) {
   await testChannel.send({
    content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
    embeds: [releaseEmbed],
   });
   releasedCount++;
  }

  await sendUserDM(
   character.userId,
   `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`,
   client
  );
 }

 if (releasedCount > 0) {
  console.log(`[scheduler.js]: 🔓 Released ${releasedCount} characters from jail`);
 }
}

async function handleDebuffExpiry(client) {
  const now = new Date();
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const midnightEST = new Date(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 0, 0, 0, 0);
  
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

      await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`,
        client
      );
    }
  }
}

async function handleBuffExpiry(client) {
  const now = new Date();
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const midnightEST = new Date(estDate.getFullYear(), estDate.getMonth(), estDate.getDate(), 0, 0, 0, 0);
  
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

      await sendUserDM(
        character.userId,
        `Your character **${character.name}**'s buff has ended! You can now heal them with items or a Healer.`,
        client
      );
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
 console.log(`[scheduler.js]: 🌤️ Setting up weather scheduler...`);
 
 // Primary weather update at 8:00 AM EST
 const primaryWeatherJob = createCronJob("0 8 * * *", "Daily Weather Update", async () => {
  try {
   console.log(`[scheduler.js]: 🌤️ Starting scheduled weather update at 8:00 AM EST`);
   await postWeatherUpdate(client);
   console.log(`[scheduler.js]: ✅ Scheduled weather update completed successfully`);
  } catch (error) {
   handleError(error, "scheduler.js", {
    commandName: "Daily Weather Update",
    scheduledTime: "8:00 AM EST"
   });
   console.error(`[scheduler.js]: ❌ Scheduled weather update failed:`, error.message);
  }
 }, "America/New_York");
 
 console.log(`[scheduler.js]: ✅ Primary weather cron job created: 0 8 * * * (8:00 AM EST)`);

 // Backup weather update at 8:15 AM EST in case the 8:00 AM fails
 const backupWeatherJob = createCronJob("15 8 * * *", "Backup Weather Update", async () => {
  try {
   console.log(`[scheduler.js]: 🌤️ Starting backup weather update at 8:15 AM EST`);
   
   // Check if weather was already posted today
   const now = new Date();
   const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
   const today = estTime.toISOString().slice(0, 10);
   
   // Check if any weather was posted today by looking at recent messages in town hall channels
   let weatherAlreadyPosted = false;
   const townhallChannels = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL
   ];
   
   for (const channelId of townhallChannels) {
    if (!channelId) continue;
    
    try {
     const channel = client.channels.cache.get(channelId);
     if (channel) {
      const messages = await channel.messages.fetch({ limit: 10 });
      const weatherMessage = messages.find(msg => 
       msg.author.id === client.user.id && 
       msg.embeds.length > 0 && 
       msg.embeds[0].title && 
       msg.embeds[0].title.includes("Weather Forecast") &&
       msg.createdAt.toISOString().slice(0, 10) === today
      );
      
      if (weatherMessage) {
       console.log(`[scheduler.js]: ✅ Weather already posted today in ${channel.name} at ${weatherMessage.createdAt.toLocaleString()}`);
       weatherAlreadyPosted = true;
       break;
      }
     }
    } catch (channelError) {
     console.error(`[scheduler.js]: Error checking channel ${channelId}:`, channelError.message);
    }
   }
   
   if (weatherAlreadyPosted) {
    console.log(`[scheduler.js]: ✅ Weather already posted today, skipping backup update`);
    return;
   }
   
   console.log(`[scheduler.js]: ⚠️ No weather found for today, proceeding with backup update`);
   await postWeatherUpdate(client);
   console.log(`[scheduler.js]: ✅ Backup weather update completed successfully`);
   
  } catch (error) {
   handleError(error, "scheduler.js", {
    commandName: "Backup Weather Update",
    scheduledTime: "8:15 AM EST"
   });
   console.error(`[scheduler.js]: ❌ Backup weather update failed:`, error.message);
  }
 }, "America/New_York");
 
 console.log(`[scheduler.js]: ✅ Backup weather cron job created: 15 8 * * * (8:15 AM EST)`);

 // Additional check every hour to ensure weather is posted
 const hourlyWeatherJob = createCronJob("0 * * * *", "Hourly Weather Check", async () => {
  try {
   const now = new Date();
   const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
   const currentHour = estTime.getHours();
   
   // Only check during business hours (8 AM - 6 PM EST)
   if (currentHour < 8 || currentHour >= 18) {
    return;
   }
   
   // Check if weather was posted today
   const today = estTime.toISOString().slice(0, 10);
   let weatherPosted = false;
   const townhallChannels = [
    process.env.RUDANIA_TOWNHALL,
    process.env.INARIKO_TOWNHALL,
    process.env.VHINTL_TOWNHALL
   ];
   
   for (const channelId of townhallChannels) {
    if (!channelId) continue;
    
    try {
     const channel = client.channels.cache.get(channelId);
     if (channel) {
      const messages = await channel.messages.fetch({ limit: 20 });
      const weatherMessage = messages.find(msg => 
       msg.author.id === client.user.id && 
       msg.embeds.length > 0 && 
       msg.embeds[0].title && 
       msg.embeds[0].title.includes("Weather Forecast") &&
       msg.createdAt.toISOString().slice(0, 10) === today
      );
      
      if (weatherMessage) {
       weatherPosted = true;
       break;
      }
     }
    } catch (channelError) {
     console.error(`[scheduler.js]: Error checking channel ${channelId}:`, channelError.message);
    }
   }
   
   if (!weatherPosted) {
    console.log(`[scheduler.js]: ⚠️ No weather posted today at ${currentHour}:00, posting now`);
    await postWeatherUpdate(client);
    console.log(`[scheduler.js]: ✅ Emergency weather update completed at ${currentHour}:00`);
   }
   
  } catch (error) {
   handleError(error, "scheduler.js", {
    commandName: "Hourly Weather Check"
   });
   console.error(`[scheduler.js]: ❌ Hourly weather check failed:`, error.message);
  }
 }, "America/New_York");
 
 console.log(`[scheduler.js]: ✅ Hourly weather check cron job created: 0 * * * * (every hour)`);
 
 // Test cron job to verify cron is working (runs every minute for 5 minutes after startup)
 let testCounter = 0;
 const testWeatherJob = createCronJob("* * * * *", "Weather Cron Test", () => {
  testCounter++;
  console.log(`[scheduler.js]: 🧪 Weather cron test ${testCounter}/5 - cron jobs are working`);
  
  if (testCounter >= 5) {
   console.log(`[scheduler.js]: ✅ Weather cron test completed - cron system is functional`);
   testWeatherJob.stop();
  }
 }, "America/New_York");
 
 console.log(`[scheduler.js]: ✅ Weather cron test job created: * * * * * (every minute for 5 minutes)`);
 
 console.log(`[scheduler.js]: 🌤️ Weather scheduler setup completed with ${4} cron jobs`);
}

// ============================================================================
// ------------------- Help Wanted Functions -------------------
// ============================================================================

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

async function checkAndPostMissedQuests(client) {
  try {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    const currentMinute = estTime.getMinutes();
    
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const unpostedQuests = await HelpWantedQuest.find({
      date: today,
      messageId: null
    });
    
    if (!unpostedQuests.length) {
      console.log(`[scheduler.js]: No missed quests to post during startup`);
      return;
    }
    
    // Randomize the order of quests before posting to avoid always posting in the same order
    const shuffledQuests = unpostedQuests.sort(() => Math.random() - 0.5);
    
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
        const embedsByVillage = await formatSpecificQuestsAsEmbedsByVillage([quest]);
        const embed = embedsByVillage[quest.village];
        if (embed) {
          // Get the appropriate village channel
          const villageChannelId = getVillageChannelId(quest.village);
          const channel = await client.channels.fetch(villageChannelId);
          
          if (channel) {
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
              console.log(`[scheduler.js]: Posted missed quest ${quest.questId} for ${quest.village} in ${quest.village} town hall (was scheduled for ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')})`);
              posted++;
            } else {
              console.log(`[scheduler.js]: Quest ${quest.questId} was already posted by another process, skipping`);
            }
          } else {
            console.log(`[scheduler.js]: Could not fetch channel for ${quest.village} (ID: ${villageChannelId})`);
          }
        }
      }
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: 📤 Posted ${posted} missed quests during startup`);
    }
    
  } catch (error) {
    handleError(error, 'scheduler.js', { commandName: 'checkAndPostMissedQuests' });
    console.error('[scheduler.js]: ❌ Error checking for missed quests:', error);
  }
}

async function checkAndPostScheduledQuests(client, cronTime) {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    const questsToPost = await HelpWantedQuest.find({
      date: today,
      scheduledPostTime: cronTime,
      messageId: null
    });
    
    if (!questsToPost.length) {
      console.log(`[scheduler.js]: No quests scheduled for ${cronTime} on ${today}`);
      return;
    }
    
    // Randomize the order of quests before posting to avoid always posting in the same order
    const shuffledQuests = questsToPost.sort(() => Math.random() - 0.5);
    
    let posted = 0;
    
    for (const quest of shuffledQuests) {
      const embedsByVillage = await formatSpecificQuestsAsEmbedsByVillage([quest]);
      const embed = embedsByVillage[quest.village];
      if (embed) {
        // Get the appropriate village channel
        const villageChannelId = getVillageChannelId(quest.village);
        const channel = await client.channels.fetch(villageChannelId);
        
        if (channel) {
          const message = await channel.send({ embeds: [embed] });
          const updatedQuest = await HelpWantedQuest.findOneAndUpdate(
            { _id: quest._id, messageId: null },
            { 
              messageId: message.id,
              channelId: channel.id
            },
            { new: true }
          );
          
          const parts = cronTime.split(' ');
          const scheduledMinute = parseInt(parts[0]);
          const scheduledHour = parseInt(parts[1]);
          
          if (updatedQuest) {
            console.log(`[scheduler.js]: Posted quest ${quest.questId} for ${quest.village} in ${quest.village} town hall at ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')} (scheduled time: ${cronTime})`);
            posted++;
          } else {
            console.log(`[scheduler.js]: Quest ${quest.questId} was already posted by another process, skipping`);
          }
        } else {
          console.log(`[scheduler.js]: Could not fetch channel for ${quest.village} (ID: ${villageChannelId})`);
        }
      }
    }
    
    if (posted > 0) {
      console.log(`[scheduler.js]: Posted ${posted} scheduled quests for ${cronTime}`);
    }
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndPostScheduledQuests',
      scheduledTime: cronTime
    });
    console.error('[scheduler.js]: Error checking and posting scheduled quests:', error);
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

async function handleBloodMoonStart(client) {
  console.log(`[scheduler.js]: 🌕 Starting Blood Moon start check at 8 PM EST`);

  const channels = [
   process.env.RUDANIA_TOWNHALL,
   process.env.INARIKO_TOWNHALL,
   process.env.VHINTL_TOWNHALL,
  ];

  // Get current EST time and calculate tomorrow in EST
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const tomorrow = new Date(estNow);
  tomorrow.setDate(estNow.getDate() + 1);
  const tomorrowDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  
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
}

async function handleBloodMoonEnd(client) {
  console.log(`[scheduler.js]: 🌙 Starting Blood Moon end check at 8 AM EST`);

  const channels = [
   process.env.RUDANIA_TOWNHALL,
   process.env.INARIKO_TOWNHALL,
   process.env.VHINTL_TOWNHALL,
  ];

  // Get current EST time and calculate yesterday in EST
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yesterday = new Date(estNow);
  yesterday.setDate(estNow.getDate() - 1);
  const yesterdayDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  
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
}

// ============================================================================
// ------------------- Manual Weather Functions -------------------
// ============================================================================

async function postWeatherNow(client) {
 try {
  console.log(`[scheduler.js]: 🌤️ Manual weather update requested`);
  const result = await postWeatherUpdate(client);
  console.log(`[scheduler.js]: ✅ Manual weather update completed:`, result);
  return result;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Manual weather update failed:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: "postWeatherNow",
   operation: "manual_weather_update"
  });
  throw error;
 }
}

async function postWeatherImmediately(client) {
 try {
  console.log(`[scheduler.js]: 🌤️ Immediate weather update requested`);
  
  // Force weather generation and posting
  const result = await postWeatherUpdate(client);
  
  if (result.success) {
   console.log(`[scheduler.js]: ✅ Immediate weather update completed successfully`);
   console.log(`[scheduler.js]: 📊 Posted to ${result.postedCount} villages with ${result.errorCount} errors`);
  } else {
   console.log(`[scheduler.js]: ⚠️ Immediate weather update completed with issues`);
  }
  
  return result;
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Immediate weather update failed:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: "postWeatherImmediately",
   operation: "immediate_weather_update"
  });
  throw error;
 }
}

async function checkWeatherStatus(client) {
 try {
  console.log(`[scheduler.js]: 🔍 Checking weather status...`);
  
  const now = new Date();
  const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = estTime.toISOString().slice(0, 10);
  const currentHour = estTime.getHours();
  const currentMinute = estTime.getMinutes();
  
  console.log(`[scheduler.js]: 📅 Current time: ${estTime.toLocaleString()} EST`);
  console.log(`[scheduler.js]: 📅 Today's date: ${today}`);
  
  // Check if weather was posted today
  const townhallChannels = [
   process.env.RUDANIA_TOWNHALL,
   process.env.INARIKO_TOWNHALL,
   process.env.VHINTL_TOWNHALL
  ];
  
  let weatherPosted = false;
  let lastWeatherTime = null;
  let lastWeatherChannel = null;
  
  for (const channelId of townhallChannels) {
   if (!channelId) continue;
   
   try {
    const channel = client.channels.cache.get(channelId);
    if (channel) {
     const messages = await channel.messages.fetch({ limit: 50 });
     const weatherMessage = messages.find(msg => 
      msg.author.id === client.user.id && 
      msg.embeds.length > 0 && 
      msg.embeds[0].title && 
      msg.embeds[0].title.includes("Weather Forecast") &&
      msg.createdAt.toISOString().slice(0, 10) === today
     );
     
     if (weatherMessage) {
      weatherPosted = true;
      lastWeatherTime = weatherMessage.createdAt;
      lastWeatherChannel = channel.name;
      break;
     }
    }
   } catch (channelError) {
    console.error(`[scheduler.js]: Error checking channel ${channelId}:`, channelError.message);
   }
  }
  
  if (weatherPosted) {
   const timeSinceWeather = now - lastWeatherTime;
   const hoursSinceWeather = Math.floor(timeSinceWeather / (1000 * 60 * 60));
   const minutesSinceWeather = Math.floor((timeSinceWeather % (1000 * 60 * 60)) / (1000 * 60));
   
   console.log(`[scheduler.js]: ✅ Weather posted today in ${lastWeatherChannel} at ${lastWeatherTime.toLocaleString()}`);
   console.log(`[scheduler.js]: ⏰ Time since weather: ${hoursSinceWeather}h ${minutesSinceWeather}m`);
  } else {
   console.log(`[scheduler.js]: ❌ No weather posted today`);
   
   // Check if it's past 8 AM and weather should have been posted
   if (currentHour > 8 || (currentHour === 8 && currentMinute > 0)) {
    console.log(`[scheduler.js]: ⚠️ Weather should have been posted by now (past 8:00 AM EST)`);
   }
  }
  
  // Check environment variables
  console.log(`[scheduler.js]: 🌤️ Environment variables:`);
  console.log(`[scheduler.js]: RUDANIA_TOWNHALL: ${process.env.RUDANIA_TOWNHALL || 'MISSING'}`);
  console.log(`[scheduler.js]: INARIKO_TOWNHALL: ${process.env.INARIKO_TOWNHALL || 'MISSING'}`);
  console.log(`[scheduler.js]: VHINTL_TOWNHALL: ${process.env.VHINTL_TOWNHALL || 'MISSING'}`);
  
  return {
   weatherPosted,
   lastWeatherTime,
   lastWeatherChannel,
   currentTime: estTime,
   environmentVariables: {
    RUDANIA_TOWNHALL: !!process.env.RUDANIA_TOWNHALL,
    INARIKO_TOWNHALL: !!process.env.INARIKO_TOWNHALL,
    VHINTL_TOWNHALL: !!process.env.VHINTL_TOWNHALL
   }
  };
  
 } catch (error) {
  console.error(`[scheduler.js]: ❌ Weather status check failed:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: "checkWeatherStatus",
   operation: "weather_status_check"
  });
  throw error;
 }
}

// ============================================================================
// ------------------- Scheduler Initialization -------------------
// ============================================================================

function initializeScheduler(client) {
 if (!client || !client.isReady()) {
  console.error(
   "[scheduler.js]: Invalid or unready Discord client provided to scheduler"
  );
  return;
 }

 // Startup checks
 (async () => {
  try {
   console.log(`[scheduler.js]: 🚀 Running startup checks...`);
   
   // Validate weather environment variables
   const weatherChannels = {
    'Rudania': process.env.RUDANIA_TOWNHALL,
    'Inariko': process.env.INARIKO_TOWNHALL,
    'Vhintl': process.env.VHINTL_TOWNHALL
   };
   
   console.log(`[scheduler.js]: 🌤️ Weather channel configuration:`);
   for (const [village, channelId] of Object.entries(weatherChannels)) {
    if (channelId) {
     console.log(`[scheduler.js]: ✅ ${village}: ${channelId}`);
    } else {
     console.error(`[scheduler.js]: ❌ ${village}: MISSING ENVIRONMENT VARIABLE`);
    }
   }
   
   const isBloodMoonActive = isBloodMoonDay();
   if (isBloodMoonActive) {
    console.log(`[scheduler.js]: 🌕 Blood Moon active - processing channels`);
    await renameChannels(client);
    
    const channels = [
     process.env.RUDANIA_TOWNHALL,
     process.env.INARIKO_TOWNHALL,
     process.env.VHINTL_TOWNHALL,
    ];
    
    for (const channelId of channels) {
     if (channelId) {
      await sendBloodMoonAnnouncement(
       client,
       channelId,
       "The Blood Moon is upon us! Beware!"
      );
     }
    }
   } else {
    await revertChannelNames(client);
   }

   await handleDebuffExpiry(client);
   await handleBuffExpiry(client);
   await checkAndGenerateDailyQuests();
   await checkAndPostMissedQuests(client);
   await handleQuestExpirationAtMidnight(client);

   // Check if weather needs to be posted today
   console.log(`[scheduler.js]: 🌤️ Checking if weather needs to be posted today...`);
   try {
    const weatherStatus = await checkWeatherStatus(client);
    
    if (!weatherStatus.weatherPosted) {
     const currentHour = weatherStatus.currentTime.getHours();
     const currentMinute = weatherStatus.currentTime.getMinutes();
     
     // If it's past 8 AM and no weather was posted, post it now
     if (currentHour > 8 || (currentHour === 8 && currentMinute > 0)) {
      console.log(`[scheduler.js]: ⚠️ No weather posted today and it's past 8 AM, posting weather now...`);
      await postWeatherUpdate(client);
      console.log(`[scheduler.js]: ✅ Startup weather update completed`);
     } else {
      console.log(`[scheduler.js]: ✅ Weather not needed yet (before 8 AM EST)`);
     }
    } else {
     console.log(`[scheduler.js]: ✅ Weather already posted today`);
    }
   } catch (weatherError) {
    console.error(`[scheduler.js]: ❌ Error checking weather status during startup:`, weatherError.message);
   }

   console.log(`[scheduler.js]: ✅ Startup checks completed`);
  } catch (error) {
   handleError(error, "scheduler.js");
   console.error(`[scheduler.js]: ❌ Startup checks failed: ${error.message}`);
  }
 })();

 // Daily tasks
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
           cleanupExpiredBlightRequests(client),
     cleanupExpiredRaids(),
     cleanupOldRuuGameSessions(),
    ]);
    
    const blightResult = results[3];
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
 createCronJob("0 0 * * *", "buff expiry check", () =>
  handleBuffExpiry(client)
 );
 createCronJob("0 0 * * *", "birthday announcements", () =>
  executeBirthdayAnnouncements(client)
 );
 
 createCronJob("0 0 * * *", "midnight quest generation", () =>
  generateDailyQuestsAtMidnight()
 );

 createCronJob("0 0 * * *", "quest expiration check", () =>
  handleQuestExpirationAtMidnight(client)
 );

 createCronJob("0 5 * * *", "reset global steal protections", () => {
  console.log(`[scheduler.js]: 🛡️ Starting global steal protection reset`);
  try {
    // Import the steal command to access the global protection reset function
    const { resetAllStealProtections } = require('./commands/jobs/steal.js');
    resetAllStealProtections();
    console.log(`[scheduler.js]: ✅ Global steal protections reset completed`);
  } catch (error) {
    console.error(`[scheduler.js]: ❌ Error resetting global steal protections:`, error);
  }
 }, "America/New_York");

 createCronJob("0 1 * * *", "blood moon tracking cleanup", () => {
  console.log(`[scheduler.js]: 🧹 Starting Blood Moon tracking cleanup`);
  cleanupOldTrackingData();
  console.log(`[scheduler.js]: ✅ Blood Moon tracking cleanup completed`);
 });

 // Initialize specialized schedulers
 setupBlightScheduler(client);
 setupBoostingScheduler(client);
 setupWeatherScheduler(client);
 setupHelpWantedFixedScheduler(client);

 // Blood Moon scheduling
 createCronJob(
  "0 20 * * *",
  "blood moon start announcement",
  () => handleBloodMoonStart(client),
  "America/New_York"
 );

 createCronJob(
  "0 8 * * *",
  "blood moon end announcement",
  () => handleBloodMoonEnd(client),
  "America/New_York"
 );

 // Google Sheets retry
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

 // List all active cron jobs for debugging
 setTimeout(() => {
  console.log(`[scheduler.js]: 📋 Listing all active cron jobs after initialization...`);
  listActiveCronJobs();
 }, 2000);

 console.log("[scheduler.js]: All scheduled tasks initialized");
}

module.exports = {
 initializeScheduler,
 setupBlightScheduler,
 setupBoostingScheduler,
 setupWeatherScheduler,
 postWeatherUpdate,
 postWeatherNow,
 postWeatherImmediately,
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
 checkWeatherStatus,
 listActiveCronJobs,
 stopAllCronJobs,
};
