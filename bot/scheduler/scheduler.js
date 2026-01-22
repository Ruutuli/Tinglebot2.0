// ============================================================================
// bot/scheduler/scheduler.js
// Bot-specific scheduler setup functions
// ============================================================================

// Core dependencies
const dotenv = require("dotenv");
const path = require("path");
const { createCronJob: createCronJobWrapper, shutdownCroner, listCronJobs, getCronJobStats, checkInitialization, cleanupOrphanedTimers, checkJobHealth, restartAllJobs, forceCleanupCronerTimers } = require("./croner");
const { v4: uuidv4 } = require("uuid");

// Discord.js
const { EmbedBuilder } = require("discord.js");

// Database models
const Character = require('@/shared/models/CharacterModel');
const Pet = require('@/shared/models/PetModel');
const Raid = require('@/shared/models/RaidModel');
const RuuGame = require('@/shared/models/RuuGameModel');
const HelpWantedQuest = require('@/shared/models/HelpWantedQuestModel');
const ItemModel = require('@/shared/models/ItemModel');
const Weather = require('@/shared/models/WeatherModel');

// Database functions
const {
 generateVendingStockList,
 resetPetRollsForAllCharacters,
 connectToInventories,
 getCharacterInventoryCollection,
 fetchItemByName,
} = require('@/shared/database/db');

// Bot-specific handlers (relative to bot folder)
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
 checkAndPostMissedBlightPing,
} = require("../handlers/blightHandler");

// Bot-specific scripts (relative to bot folder)
const {
 sendBloodMoonAnnouncement,
 sendBloodMoonEndAnnouncement,
 isBloodMoonDay,
 renameChannels,
 revertChannelNames,
 cleanupOldTrackingData,
} = require("../scripts/bloodmoon");
const { resetAllVillageRaidQuotas, checkVillageRaidQuotas } = require("../scripts/randomMonsterEncounters");

// Bot-specific modules (relative to bot folder)
const { recoverDailyStamina } = require("../modules/characterStatsModule");
const { bloodmoonDates, convertToHyruleanDate } = require('../modules/calendarModule');
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests, isTravelBlockedByWeather, regenerateEscortQuest, regenerateArtWritingQuest } = require('../modules/helpWantedModule');
const { processMonthlyQuestRewards } = require('../modules/questRewardModule');
const { updateAllRoleCountChannels } = require('../modules/roleCountChannelsModule');
// Secret Santa - Disabled outside December
// const { setupSecretSantaScheduler } = require('../../bot/modules/secretSantaModule');
const { addBoostFlavorText, buildFooterText } = require('../embeds/embeds');
const { generateBoostFlavorText } = require('../modules/flavorTextModule');

// Utilities
const { safeAppendDataToSheet, extractSpreadsheetId } = require('@/shared/utils/googleSheetsUtils');
const { logItemAcquisitionToDatabase } = require('@/shared/utils/inventoryUtils');

// Services
const { getCurrentWeather, generateWeatherEmbed, getWeatherWithoutGeneration, getCurrentPeriodBounds } = require('@/shared/services/weatherService');

// Bot-specific village modules (relative to bot folder)
const { damageVillage, Village } = require('../modules/villageModule');

// Utils
const { handleError } = require('@/shared/utils/globalErrorHandler');
const { sendUserDM } = require('@/shared/utils/messageUtils');
// Expiration handler removed - see docs/FUTURE_PLANS.md
// const { checkExpiredRequests } = require('@/shared/utils/expirationHandler");
const { isValidImageUrl } = require('@/shared/utils/validation');
const notificationService = require('@/shared/utils/notificationService');
const logger = require('@/shared/utils/logger');
const { releaseFromJail, DEFAULT_JAIL_DURATION_MS } = require('@/shared/utils/jailCheck');
const {
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require('@/shared/utils/storage');
const {
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require('@/shared/utils/googleSheetsUtils');

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
const { postQuests } = require('../scripts/questAnnouncements');

// Agenda for one-time scheduled jobs (relative to bot folder)
const { getAgenda } = require('./agenda');

// ============================================================================
// ------------------- Environment Setup -------------------
// ============================================================================

const env = process.env.NODE_ENV || "development";
try {
 const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
 const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
 // Try environment-specific file first, then fall back to root .env
 if (require('fs').existsSync(envSpecificPath)) {
   dotenv.config({ path: envSpecificPath });
 } else {
   dotenv.config({ path: rootEnvPath });
 }
} catch (error) {
 logger.error('SYSTEM', `[scheduler.js]❌ Failed to load .env:`, error.message);
 dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Convert EST cron expression to UTC (EST is UTC-5, so add 5 hours)
// Format: "minute hour * * *" -> "minute (hour+5) * * *"
function convertEstCronToUtc(estCronTime) {
  const parts = estCronTime.split(' ');
  if (parts.length >= 2) {
    const minute = parts[0];
    const hour = parseInt(parts[1]);
    const utcHour = (hour + 5) % 24; // EST is UTC-5, wrap around at 24
    return `${minute} ${utcHour} ${parts.slice(2).join(' ')}`;
  }
  return estCronTime; // Return as-is if format is unexpected
}

// Track all cron jobs to prevent leaks (for backward compatibility)
const activeCronJobs = new Set();
let isSchedulerInitialized = false;
let schedulerInitCallCount = 0; // Track how many times initializeScheduler is called

/**
 * Create a cron job using the Croner wrapper
 * Wraps the wrapper to maintain backward compatibility with existing code
 * @param {string} schedule - Cron pattern (in UTC)
 * @param {string} jobName - Unique name for the job
 * @param {Function} jobFunction - Function to execute
 * @param {string|Object} timezone - Deprecated: Timezone string or options object (no longer used - kept for backward compatibility)
 * @returns {Object} The created Cron instance (from croner library)
 */
function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = null, // Deprecated - no longer used, kept for backward compatibility
 silent = false // If true, suppress individual job creation logs (for batch operations)
) {
 // Log when creating jobs to track timer leaks (unless silent)
 if (!silent) {
  const stack = new Error().stack;
  const caller = stack.split('\n')[2]?.trim() || 'unknown';
  logger.warn('SCHEDULER', `🔍 Creating cron job "${jobName}" (schedule: ${schedule}) - Called from: ${caller}`);
 }
 
 // Guard: Warn if creating jobs after initialization (this should only happen during init)
 // Note: We allow it during init (when schedulerInitCallCount > 0 but isSchedulerInitialized is false)
 if (isSchedulerInitialized) {
  logger.error('SCHEDULER', `⚠️ CRITICAL: Attempted to create cron job "${jobName}" after scheduler already initialized! This will cause timer leaks!`);
  logger.error('SCHEDULER', `Full stack trace:`, stack);
 }
 
 // Adapt signature: wrapper expects (name, pattern, fn, options)
 // No longer pass timezone to avoid memory leaks
 const options = {};
 if (timezone && typeof timezone === 'object' && !timezone.timezone) {
   // If timezone is an object with other options, use those
   Object.assign(options, timezone);
 }
 // Explicitly do NOT set timezone option
 // Pass silent flag to wrapper
 if (silent) {
   options.silent = true;
 }
 
 const task = createCronJobWrapper(
  jobName,
  schedule,
  async () => {
   try {
    await jobFunction();
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('SCHEDULER', `[scheduler.js]❌ ${jobName} failed:`, error.message);
   }
  },
  options
 );
 
 // Track the cron job instance (for backward compatibility)
 activeCronJobs.add(task);
 
 return task;
}

// Function to destroy all active cron jobs
function destroyAllCronJobs() {
 let destroyedCount = 0;
 for (const task of activeCronJobs) {
  try {
   task.stop(); // croner uses stop() instead of destroy()
   destroyedCount++;
  } catch (error) {
   logger.error('SCHEDULER', 'Error destroying cron job', error.message);
  }
 }
 activeCronJobs.clear();
 logger.info('SCHEDULER', `Destroyed ${destroyedCount} cron jobs`);
 return destroyedCount;
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function getVillageChannelId(villageName) {
 return TOWNHALL_CHANNELS[villageName] || null;
}

function getESTDate(date = new Date()) {
 const estDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
 return estDate;
}

// ============================================================================
// ------------------- Weather Functions -------------------
// ============================================================================

async function postWeatherForVillage(client, village, isReminder = false) {
 try {
  let weather;
  
  if (isReminder) {
   // For reminders, get existing weather without generating new
   weather = await getWeatherWithoutGeneration(village);
   
   // Reminder should always post - it's just a reminder of the same weather from 8am
   if (!weather) {
    logger.error('WEATHER', `[scheduler.js]❌ Failed to get weather for ${village} reminder`);
    return false;
   }
  } else {
   // For main update, generate/get current weather
   weather = await getCurrentWeather(village);
   
   if (!weather) {
    logger.error('WEATHER', `[scheduler.js]❌ Failed to get weather for ${village} - getCurrentWeather returned null/undefined`);
    return false;
   }
  }

  // Ensure weather object has all required fields before posting
  if (!weather.temperature || !weather.temperature.label) {
   logger.error('WEATHER', `[scheduler.js]❌ Invalid weather object for ${village}: missing temperature.label`);
   return false;
  }
  if (!weather.wind || !weather.wind.label) {
   logger.error('WEATHER', `[scheduler.js]❌ Invalid weather object for ${village}: missing wind.label`);
   return false;
  }
  if (!weather.precipitation || !weather.precipitation.label) {
   logger.error('WEATHER', `[scheduler.js]❌ Invalid weather object for ${village}: missing precipitation.label`);
   return false;
  }

  const channelId = TOWNHALL_CHANNELS[village];
  if (!channelId) {
   logger.error('WEATHER', `[scheduler.js]❌ No channel ID configured for ${village} in TOWNHALL_CHANNELS`);
   return false;
  }

  let channel = client.channels.cache.get(channelId);

  if (!channel) {
   logger.error('WEATHER', `[scheduler.js]❌ Channel not found in cache: ${channelId} for ${village}. Attempting fetch...`);
   try {
    channel = await client.channels.fetch(channelId);
    if (!channel) {
     logger.error('WEATHER', `[scheduler.js]❌ Channel ${channelId} does not exist for ${village}`);
     return false;
    }
    logger.info('WEATHER', `Successfully fetched channel ${channelId} for ${village}`);
   } catch (fetchError) {
    logger.error('WEATHER', `[scheduler.js]❌ Failed to fetch channel ${channelId} for ${village}: ${fetchError.message}`);
    return false;
   }
  }

  const embedResult = await generateWeatherEmbed(village, weather);
  
  if (!embedResult || !embedResult.embed) {
   logger.error('WEATHER', `[scheduler.js]❌ Failed to generate weather embed for ${village} - embedResult is invalid`);
   return false;
  }
  
  try {
   await channel.send({ embeds: [embedResult.embed], files: embedResult.files });
  } catch (sendError) {
   logger.error('WEATHER', `[scheduler.js]❌ Failed to send weather embed to ${village} channel:`, sendError.message);
   return false;
  }

  // Mark weather as posted to Discord (only for non-reminder posts)
  if (!isReminder) {
   try {
     const updateQuery = weather._id 
      ? { _id: weather._id }
      : { village: village, date: weather.date };
     
     const updateResult = await Weather.updateOne(
      updateQuery,
      { 
       $set: { 
        postedToDiscord: true,
        postedAt: new Date()
       }
      }
     );
     
     if (updateResult.matchedCount > 0) {
      logger.info('WEATHER', `Marked weather as posted for ${village}${weather._id ? ` (ID: ${weather._id})` : ''}`);
     } else {
      logger.warn('WEATHER', `Could not find weather record to update for ${village} - weather may have been posted but not marked in database`);
     }
   } catch (updateError) {
    logger.error('WEATHER', `[scheduler.js]❌ Failed to update postedToDiscord flag for ${village}: ${updateError.message}`);
    // Don't fail the function if the update fails - weather was still posted
   }
  }

  // Apply weather damage if applicable (non-blocking)
  if (!isReminder) {
   try {
     await applyWeatherDamage(village, weather);
   } catch (damageError) {
     logger.error('WEATHER', `[scheduler.js]❌ Error applying weather damage to ${village}: ${damageError.message}`);
     // Don't fail weather posting if damage application fails
   }
  }

  logger.success('WEATHER', `Successfully posted weather for ${village}${isReminder ? ' (reminder)' : ''}`);
  return true;
 } catch (error) {
  logger.error('WEATHER', `[scheduler.js]❌ Error posting weather for ${village}: ${error.message}`, error.stack);
  handleError(error, "scheduler.js", {
   commandName: 'postWeatherForVillage',
   village: village
  });
  return false;
 }
}

async function applyWeatherDamage(villageName, weather) {
  try {
    const weatherDamage = weather.damage || 0;
    
    if (weatherDamage > 0) {
      logger.info('WEATHER', `Applying ${weatherDamage} damage to ${villageName} due to weather conditions`);
      await damageVillage(villageName, weatherDamage, 'weather');
      logger.success('WEATHER', `Applied ${weatherDamage} damage to ${villageName}`);
    } else {
      logger.info('WEATHER', `No weather damage for ${villageName} - weather conditions do not cause damage`);
    }
  } catch (error) {
    logger.error('WEATHER', `[scheduler.js]❌ Error in applyWeatherDamage for ${villageName}: ${error.message}`, error.stack);
    handleError(error, "scheduler.js", {
      functionName: 'applyWeatherDamage',
      villageName: villageName
    });
  }
}

async function processWeatherForAllVillages(client, checkExisting = false, context = '') {
 try {
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  const results = [];
  let postedCount = 0;
  
  for (const village of villages) {
   try {
    let posted = false;
    
    if (checkExisting) {
     // Check if weather already exists and was posted today
     const periodBounds = getCurrentPeriodBounds();
     const existingWeather = await Weather.findOne({
      village: village,
      date: { $gte: periodBounds.startUTC, $lte: periodBounds.endUTC },
      postedToDiscord: true
     });
     
     if (existingWeather) {
      logger.info('WEATHER', `Weather already exists and posted for ${village} (ID: ${existingWeather._id}, postedAt: ${existingWeather.postedAt}), skipping duplicate post`);
      results.push({ village, success: true, reason: 'already posted' });
      continue;
     }
    }
    
    posted = await postWeatherForVillage(client, village, false);
    results.push({ village, success: posted });
    
    if (posted) postedCount++;
   } catch (error) {
    results.push({ village, success: false, reason: error.message });
    logger.error('WEATHER', `[scheduler.js]❌ Failed to post weather for ${village}: ${error.message}`);
   }
  }

  const failedVillages = results.filter(r => !r.success).map(r => r.village);
  const successVillages = results.filter(r => r.success).map(r => r.village);
  
  if (failedVillages.length > 0) {
   logger.error('WEATHER', `[scheduler.js]❌ Failed to post weather for: ${failedVillages.join(', ')}`);
  }
  
  if (postedCount > 0) {
   // Notifications removed - no longer sending DMs
  } else if (failedVillages.length === villages.length && villages.length > 0) {
   logger.error('WEATHER', `[scheduler.js]❌ No weather posted - all villages failed${context ? ` (${context})` : ''}`);
  }

  return postedCount;
 } catch (error) {
  logger.error('WEATHER', `[scheduler.js]❌ Process failed${context ? ` (${context})` : ''}:`, error.message);
  handleError(error, "scheduler.js", {
   commandName: 'processWeatherForAllVillages',
   context: context
  });
  return 0;
 }
}

async function postWeatherUpdate(client) {
 return await processWeatherForAllVillages(client, false, 'scheduled update');
}

async function checkAndPostWeatherIfNeeded(client) {
 try {
  return await processWeatherForAllVillages(client, true, 'backup check');
 } catch (error) {
  logger.error('WEATHER', '[scheduler.js]❌ Backup check failed');
  handleError(error, "scheduler.js", {
   commandName: 'checkAndPostWeatherIfNeeded'
  });
  return 0;
 }
}

async function checkAndPostWeatherOnRestart(client) {
 try {
  // - Generate and post if weather doesn't exist (getCurrentWeather handles generation)
  return await processWeatherForAllVillages(client, true, 'restart check');
 } catch (error) {
  logger.error('WEATHER', '[scheduler.js]❌ Restart check failed');
  handleError(error, "scheduler.js", {
   commandName: 'checkAndPostWeatherOnRestart'
  });
  return 0;
 }
}

// ============================================================================
// ------------------- Cleanup Functions -------------------
// ============================================================================

async function cleanupExpiredRaids(client) {
 try {
  const now = new Date();
  const expiredRaids = await Raid.find({
   status: 'active',
   $or: [
    { endTime: { $lte: now } },
    { createdAt: { $lte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } } // 2 hours old
   ]
  });
  
  let cleanedCount = 0;
  
  for (const raid of expiredRaids) {
   try {
    raid.status = 'expired';
    await raid.save();
    cleanedCount++;
    logger.success('RAID', `Cleaned up ${raid.raidId}`);
    
   } catch (raidError) {
    logger.error('RAID', `[scheduler.js]❌ Error cleaning up ${raid.raidId}`);
    handleError(raidError, "scheduler.js", {
     raidId: raid.raidId,
     functionName: 'cleanupExpiredRaids'
    });
   }
  }
  
  return { expiredCount: cleanedCount };
 } catch (error) {
  logger.error('CLEANUP', '[scheduler.js]❌ Error cleaning up expired raids');
  handleError(error, "scheduler.js");
  return { expiredCount: 0 };
 }
}

async function cleanupOldRuuGameSessions() {
 try {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  const result = await RuuGame.updateMany(
   {
    status: { $in: ['waiting', 'active'] },
    updatedAt: { $lt: twoHoursAgo }
   },
   {
    $set: { status: 'expired' }
   }
  );
  
  return {
   deletedCount: 0,
   finishedCount: 0,
   expiredCount: result.modifiedCount || 0
  };
 } catch (error) {
  logger.error('CLEANUP', '[scheduler.js]❌ Error cleaning up RuuGame sessions');
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0, expiredCount: 0 };
 }
}

// ============================================================================
// ------------------- Boost Functions -------------------
// ============================================================================

async function distributeMonthlyBoostRewards(client) {
 try {
  logger.info('BOOST', 'Starting monthly Nitro boost reward distribution...');
  
  const now = new Date();
  const nowEST = getESTDate(now);
  const currentMonth = `${nowEST.getFullYear()}-${String(nowEST.getMonth() + 1).padStart(2, '0')}`;
  
  const User = require('@/shared/models/UserModel');
  const allUsers = await User.find({});
  
  let rewardedCount = 0;
  let alreadyRewardedCount = 0;
  let errorCount = 0;
  let totalTokens = 0;
  
  for (const user of allUsers) {
   try {
    // Check if user already received rewards this month
    if (user.boostRewards && user.boostRewards.lastRewardMonth === currentMonth) {
     alreadyRewardedCount++;
     continue;
    }
    
    // Get user's boost level from Discord
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
     logger.error('BOOST', '[scheduler.js]❌ Guild not found');
     continue;
    }
    
    const member = await guild.members.fetch(user.discordId).catch(() => null);
    if (!member || !member.premiumSince) {
     continue; // User doesn't have Nitro boost
    }
    
    // Calculate tokens based on boost tier
    const boostTier = member.premiumSince ? 2 : 1; // Tier 2 = Nitro, Tier 1 = Classic
    const tokens = boostTier === 2 ? 100 : 50;
    
    // Update user
    if (!user.boostRewards) {
     user.boostRewards = {};
    }
    user.boostRewards.lastRewardMonth = currentMonth;
    user.boostRewards.totalTokensEarned = (user.boostRewards.totalTokensEarned || 0) + tokens;
    user.tokens = (user.tokens || 0) + tokens;
    await user.save();
    
    rewardedCount++;
    totalTokens += tokens;
    
    // Send DM notification
    try {
     const boostDetails = generateBoostFlavorText();
     await sendUserDM(
      user.discordId,
      `**Monthly Nitro Boost Reward**\n\nThank you for boosting the server! You've received **${tokens} tokens** for this month.\n\n${boostDetails.boostFlavorText}`,
      client
     );
    } catch (dmError) {
     logger.warn('BOOST', `Could not send DM to user ${user.discordId}`);
    }
    
   } catch (error) {
    errorCount++;
    logger.error('BOOST', `Error processing boost reward for user ${user.discordId}:`, error.message);
   }
  }
  
  logger.success('BOOST', `Monthly boost rewards distributed - Rewarded: ${rewardedCount}, Already Rewarded: ${alreadyRewardedCount}, Errors: ${errorCount}, Total Tokens: ${totalTokens}`);
  
  return {
   rewardedCount,
   alreadyRewardedCount,
   errorCount,
   totalTokens
  };
  
 } catch (error) {
  logger.error('BOOST', '[scheduler.js]❌ Error during boost reward distribution', error);
  handleError(error, 'scheduler.js', {
   commandName: 'distributeMonthlyBoostRewards'
  });
  return {
   rewardedCount: 0,
   alreadyRewardedCount: 0,
   errorCount: 1,
   totalTokens: 0
  };
 }
}

// ============================================================================
// ------------------- Birthday Functions -------------------
// ============================================================================

async function executeBirthdayAnnouncements(client) {
 try {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const characters = await Character.find({
   birthday: {
    $gte: new Date(today.getFullYear(), 0, 1),
    $lt: new Date(today.getFullYear() + 1, 0, 1)
   }
  });
  
  let announcedCount = 0;
  
  for (const character of characters) {
   try {
    const characterBirthday = new Date(character.birthday);
    const isToday = characterBirthday.getMonth() === today.getMonth() && 
                   characterBirthday.getDate() === today.getDate();
    
    if (!isToday) continue;
    
    const villageChannelId = getVillageChannelId(character.currentVillage);
    if (!villageChannelId) continue;
    
    const channel = await client.channels.fetch(villageChannelId);
    if (!channel) continue;
    
    const embed = new EmbedBuilder()
     .setTitle(`🎂 Happy Birthday, ${character.name}!`)
     .setDescription(`Today is ${character.name}'s birthday!`)
     .setColor(0xFF69B4)
     .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    announcedCount++;
    
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('BIRTHDAY', `Failed to announce birthday for ${character.name}`, error.message);
   }
  }
  
  return announcedCount;
 } catch (error) {
  logger.error('BIRTHDAY', 'Error in birthday announcements', error);
  handleError(error, "scheduler.js", {
   commandName: 'executeBirthdayAnnouncements'
  });
  return 0;
 }
}

// ============================================================================
// ------------------- Jail/Debuff/Buff Functions -------------------
// ============================================================================

async function handleJailRelease(client) {
 const now = new Date();
 const charactersInJail = await Character.find({
  inJail: true,
  jailReleaseTime: { $lte: now }
 });
 
 let releasedCount = 0;
 
 for (const character of charactersInJail) {
  try {
   await releaseFromJail(character);
   
   const villageChannelId = getVillageChannelId(character.currentVillage);
   const villageChannel = await client.channels.fetch(villageChannelId);
   
   if (villageChannel) {
    await villageChannel.send({
     content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
     embeds: [new EmbedBuilder().setDescription('They can now continue their adventures!').setColor(0x00FF00)]
    });
    releasedCount++;
   }
  } catch (error) {
   logger.error('JOB', `Error releasing ${character.name} from jail:`, error.message);
  }
 }
 
 return releasedCount;
}

async function handleDebuffExpiry(client) {
  const now = new Date();
  
  const charactersWithActiveDebuffs = await Character.find({
    "debuff.active": true,
    "debuff.endDate": { $lte: now },
  });

  if (charactersWithActiveDebuffs.length > 0) {
    logger.info('CLEANUP', `Expiring debuffs for ${charactersWithActiveDebuffs.length} characters`);
    
    for (const character of charactersWithActiveDebuffs) {
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();

      // Notification removed - no longer sending DMs
    }
  }
}

async function handleBuffExpiry(client) {
  const now = new Date();
  const estDate = getESTDate(now);
  
  const charactersWithActiveBuffs = await Character.find({
    "buff.active": true,
    "buff.endDate": { $lte: now },
  });

  if (charactersWithActiveBuffs.length > 0) {
    logger.info('CLEANUP', `Expiring buffs for ${charactersWithActiveBuffs.length} characters`);
    
    for (const character of charactersWithActiveBuffs) {
      character.buff.active = false;
      character.buff.endDate = null;
      await character.save();
    }
  }
}

// ============================================================================
// ------------------- Quest Functions -------------------
// ============================================================================

async function resetDailyRolls(client) {
 try {
  const characters = await Character.find({});
  let resetCount = 0;
  
  for (const character of characters) {
   if (character.dailyRollsUsed > 0) {
    character.dailyRollsUsed = 0;
    await character.save();
    resetCount++;
   }
  }
  
  logger.success('CLEANUP', `Reset daily rolls for ${resetCount} characters`);
 } catch (error) {
  logger.error('CLEANUP', 'Error resetting daily rolls', error);
 }
}

async function resetPetLastRollDates(client) {
 try {
  const pets = await Pet.find({});
  let resetCount = 0;
  
  for (const pet of pets) {
   if (pet.lastRollDate) {
    pet.lastRollDate = null;
    await pet.save();
    resetCount++;
   }
  }
  
  logger.success('CLEANUP', `Reset last roll dates for ${resetCount} pets`);
 } catch (error) {
  logger.error('CLEANUP', 'Failed to reset pet lastRollDates', error.message);
 }
}

// ============================================================================
// ------------------- Blight Functions -------------------
// ============================================================================

function setupBlightScheduler(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupBlightScheduler called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 // 8:00 PM EST = 01:00 UTC next day
 createCronJob("0 1 * * *", "Blight Roll Call", async () => {
  try {
   await postBlightRollCall(client);
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('BLIGHT', 'Blight roll call failed', error.message);
  }
 });
}

// ============================================================================
// ------------------- Boosting Functions -------------------
// ============================================================================

async function setupBoostingScheduler(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupBoostingScheduler called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 // Daily boost cleanup at midnight EST = 05:00 UTC
 createCronJob("0 5 * * *", "Boost Cleanup", async () => {
  try {
   logger.info('CLEANUP', 'Starting boost cleanup');
   await cleanupExpiredBoostingRequests();
   await archiveOldBoostingRequests();
   logger.success('CLEANUP', 'Boost cleanup completed');
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Boost cleanup failed', error.message);
  }
 });
}

// ============================================================================
// ------------------- Weather Scheduler -------------------
// ============================================================================

function setupWeatherScheduler(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupWeatherScheduler called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 const { createCronJob: createCronJobDirect } = require('./croner');
 
 // Primary weather update at 8:00am EST = 13:00 UTC
 createCronJobDirect("Daily Weather Update", "0 13 * * *", () =>
  postWeatherUpdate(client)
 );
 
 // Fallback check at 8:15am EST = 13:15 UTC - ensures weather was posted, generates if missing
 createCronJobDirect("Weather Fallback Check", "15 13 * * *", () =>
  checkAndPostWeatherIfNeeded(client)
 );
 
 // Weather reminder at 8:00pm EST = 01:00 UTC next day
 createCronJobDirect("Daily Weather Forecast Reminder", "0 1 * * *", () =>
  postWeatherReminder(client)
 );
}

async function postWeatherReminder(client) {
 return await processWeatherForAllVillages(client, true, 'reminder');
}

// ============================================================================
// ------------------- Help Wanted Functions -------------------
// ============================================================================

async function checkAndGenerateDailyQuests() {
  try {
    const todaysQuests = await require('../modules/helpWantedModule').getTodaysQuests();
    
    if (todaysQuests.length === 0) {
      logger.info('QUEST', 'Generating new daily quests...');
      await generateDailyQuests();
      logger.success('QUEST', 'Daily quests generated');
    }
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndGenerateDailyQuests'
    });
    logger.error('QUEST', 'Error checking/generating daily quests', error);
  }
}

async function generateDailyQuestsAtMidnight() {
  try {
    logger.info('SCHEDULER', 'Midnight quest generation starting...');
    await generateDailyQuests();
    logger.success('SCHEDULER', 'Midnight quest generation completed');
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'generateDailyQuestsAtMidnight'
    });
    logger.error('QUEST', 'Error generating daily quests at midnight', error);
  }
}

async function checkAndPostMissedQuests(client) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const missedQuests = await HelpWantedQuest.find({
      date: today,
      messageId: null
    });
    
    if (missedQuests.length > 0) {
      logger.info('QUEST', `Found ${missedQuests.length} missed quests to post`);
      // Post missed quests logic here
    }
  } catch (error) {
    logger.error('QUEST', 'Error checking for missed quests', error);
  }
}

async function checkAndPostScheduledQuests(client, cronTime) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const estDate = getESTDate(now);
    const estHour = estDate.getHours();
    const isAfterNoon = estHour >= 12;
    
    const questsToPost = await HelpWantedQuest.find({
      date: today,
      scheduledPostTime: cronTime,
      messageId: null
    });
    
    if (!questsToPost.length) {
      logger.info('SCHEDULER', `No quests scheduled for ${cronTime} on ${today}`);
      return 0;
    }
    
    // Regenerate art and writing quests if it's after 12pm EST
    let processedQuests = questsToPost;
    if (isAfterNoon) {
      const artWritingQuests = questsToPost.filter(quest => quest.type === 'art' || quest.type === 'writing');
      if (artWritingQuests.length > 0) {
        logger.info('QUEST', `After 12pm EST (${estHour}:00) - Regenerating ${artWritingQuests.length} art/writing quest(s) to ensure adequate completion time`);
        
        for (const quest of artWritingQuests) {
          try {
            await regenerateArtWritingQuest(quest);
            logger.success('QUEST', `Regenerated ${quest.type} quest ${quest.questId} for ${quest.village}`);
          } catch (error) {
            logger.error('QUEST', `Failed to regenerate quest ${quest.questId}`, error);
          }
        }
      }
    }
    
    if (!processedQuests.length) {
      logger.info('QUEST', `No quests to post for ${cronTime} on ${today}`);
      return 0;
    }
    
    const shuffledQuests = processedQuests.sort(() => Math.random() - 0.5);
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
      logger.success('QUEST', `Posted ${posted} scheduled quests for ${cronTime}`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndPostScheduledQuests',
      scheduledTime: cronTime
    });
    logger.error('QUEST', 'Error checking and posting scheduled quests', error);
    return 0;
  }
}

async function postQuestToChannel(client, quest, context) {
  try {
    const villageChannelId = getVillageChannelId(quest.village);
    if (!villageChannelId) {
      logger.error('QUEST', `No channel ID for village ${quest.village}`);
      return false;
    }
    
    const channel = await client.channels.fetch(villageChannelId);
    if (!channel) {
      logger.error('QUEST', `Channel not found for ${quest.village}`);
      return false;
    }
    
    const embeds = await formatSpecificQuestsAsEmbedsByVillage([quest], quest.village);
    if (!embeds || embeds.length === 0) {
      logger.error('QUEST', `No embeds generated for quest ${quest.questId}`);
      return false;
    }
    
    const message = await channel.send({ embeds });
    quest.messageId = message.id;
    await quest.save();
    
    return true;
  } catch (error) {
    logger.error('QUEST', `Error posting quest ${quest.questId}:`, error);
    return false;
  }
}

async function handleEscortQuestWeather(quest) {
  if (quest.type !== 'escort') return true;
  
  try {
    const weather = await getCurrentWeather(quest.village);
    if (isTravelBlockedByWeather(weather, quest.village)) {
      await regenerateEscortQuest(quest);
      return false;
    }
    return true;
  } catch (error) {
    logger.error('QUEST', `Error checking weather for escort quest:`, error);
    return true; // Allow quest to post if weather check fails
  }
}

function setupHelpWantedFixedScheduler(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupHelpWantedFixedScheduler called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
  const { FIXED_CRON_TIMES } = require('../modules/helpWantedModule');
  
  // Schedule all 24 time slots for full 24-hour coverage
  // The variable buffer (3-6 hours) is handled in the quest generation logic
  // Note: FIXED_CRON_TIMES contains EST times, convert to UTC (add 5 hours)
  // Use silent=true to suppress individual job creation logs (we'll log once at the end)
  let jobsCreated = 0;
  FIXED_CRON_TIMES.forEach(cronTime => {
    const utcCronTime = convertEstCronToUtc(cronTime);
    createCronJob(
      utcCronTime,
      `Help Wanted Board Check - ${cronTime} (EST) -> ${utcCronTime} (UTC)`,
      () => checkAndPostScheduledQuests(client, cronTime),
      null, // timezone (deprecated)
      true  // silent - suppress individual logs
    );
    jobsCreated++;
  });
  
  logger.success('SCHEDULER', `Help Wanted scheduler configured with ${jobsCreated} time slots (full 24-hour coverage with variable 3-6 hour buffer in quest generation)`);
}

// ============================================================================
// ------------------- Blood Moon Functions -------------------
// ============================================================================

async function sendBloodMoonAnnouncementsToChannels(client, message) {
 const channels = BLOOD_MOON_CHANNELS.filter(channelId => channelId);
 let successCount = 0;

 for (const channelId of channels) {
  try {
   await sendBloodMoonAnnouncement(client, channelId, message);
   successCount++;
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('BLOODMOON', `Blood Moon announcement failed for channel ${channelId}`, error.message);
  }
 }

 return successCount;
}

async function handleBloodMoonStart(client) {
  logger.info('BLOODMOON', 'Starting Blood Moon start check at 8 PM EST');

  // Check if today is specifically the day BEFORE a Blood Moon (not the actual day or day after)
  const now = new Date();
  const estTime = getESTDate(now);
  // Normalize date by stripping time components
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  
  // Check if today is the day before a Blood Moon
  if (!isBloodMoonDay(today)) {
    logger.info('BLOODMOON', 'Today is not a Blood Moon day, skipping announcement');
    return;
  }
  
  // Check if transition happened yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasBloodMoonYesterday = isBloodMoonDay(yesterday);
  
  if (wasBloodMoonYesterday) {
    logger.info('BLOODMOON', 'Blood Moon was active yesterday, skipping start announcement');
    return;
  }
  
  // Send announcement
  const message = "🌙 **BLOOD MOON RISING** 🌙\n\nThe Blood Moon approaches! Prepare yourselves...";
  await sendBloodMoonAnnouncementsToChannels(client, message);
  await renameChannels(client);
  
  logger.success('BLOODMOON', 'Blood Moon start announcement sent');
}

async function handleBloodMoonEnd(client) {
  logger.info('BLOODMOON', 'Starting Blood Moon end check at 8 AM EST');
  
  const now = new Date();
  const estTime = getESTDate(now);
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  
  // Check if yesterday was a Blood Moon day
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (!isBloodMoonDay(yesterday)) {
    logger.info('BLOODMOON', 'Yesterday was not a Blood Moon day, skipping end announcement');
    return;
  }
  
  // Send end announcement
  await sendBloodMoonEndAnnouncementsToChannels(client);
  await revertChannelNames(client);
  
  logger.success('BLOODMOON', 'Blood Moon end announcement sent');
}

function checkBloodMoonTransition() {
  const now = new Date();
  const estTime = getESTDate(now);
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
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
    logger.error('BLOODMOON', `Blood Moon end announcement failed for channel ${channelId}`, error.message);
   }
  }

  return successCount;
}

// ============================================================================
// ------------------- Scheduler Initialization -------------------
// ============================================================================

// ------------------- Startup Functions ------------------

async function checkAndDistributeMonthlyBoostRewards(client) {
  try {
    logger.info('SCHEDULER', 'Checking if monthly boost rewards need to be distributed...');
    
    const now = new Date();
    const nowEST = getESTDate(now);
    const currentMonth = `${nowEST.getFullYear()}-${String(nowEST.getMonth() + 1).padStart(2, '0')}`;
    const currentDay = nowEST.getDate();
    
    // Only auto-distribute if we're past the 1st of the month
    if (currentDay === 1) {
      logger.info('BOOST', 'Today is the 1st - scheduled job will handle distribution');
      return;
    }
    
    // Check if any users have already received rewards this month
    const User = require('@/shared/models/UserModel');
    const sampleUsers = await User.find({ 
      'boostRewards.lastRewardMonth': currentMonth 
    }).limit(1);
    
    if (sampleUsers.length > 0) {
      logger.info('BOOST', `Boost rewards already distributed for ${currentMonth}`);
      return;
    }
    
    // Distribute rewards
    await distributeMonthlyBoostRewards(client);
  } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('BOOST', 'Error checking boost rewards', error.message);
  }
}

async function runStartupChecks(client) {
 try {
  // Check and distribute monthly boost rewards if needed
  await checkAndDistributeMonthlyBoostRewards(client);
  
  // Check for expired raids
  await cleanupExpiredRaids(client);
  
  // Check for expired RuuGame sessions
  await cleanupOldRuuGameSessions();
  
  logger.success('SCHEDULER', 'Startup checks complete');
 } catch (error) {
  handleError(error, "scheduler.js");
  logger.error('SCHEDULER', 'Startup checks failed', error.message);
 }
}

// ------------------- Scheduler Setup Functions ------------------

function setupDailyTasks(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupDailyTasks called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 // Daily tasks at midnight EST = 05:00 UTC
 // Note: jail release is now handled by Agenda (scheduled at exact release time)
 createCronJob("0 5 * * *", "reset pet last roll dates", () => resetPetLastRollDates(client));
 createCronJob("0 5 * * *", "birthday role assignment", () => handleBirthdayRoleAssignment(client));
 createCronJob("0 5 * * *", "reset daily rolls", () => resetDailyRolls(client));
 createCronJob("0 5 * * *", "recover daily stamina", () => recoverDailyStamina(client));
 createCronJob("0 5 * * *", "generate daily quests", () => generateDailyQuestsAtMidnight());
 createCronJob("0 5 * * *", "global steal protections reset", () => {
  try {
   resetAllStealProtections();
   logger.success('CLEANUP', 'Global steal protections reset completed');
  } catch (error) {
   logger.error('CLEANUP', 'Error resetting global steal protections', error);
  }
 });

 // Weekly tasks - Sunday midnight EST = Monday 05:00 UTC
 createCronJob("0 5 * * 1", "weekly pet rolls reset", () => resetPetRollsForAllCharacters(client));

 // Monthly tasks - 1st of month midnight EST = 05:00 UTC
 createCronJob("0 5 1 * *", "monthly vending stock generation", () => generateVendingStockList(client));
 createCronJob("0 5 1 * *", "monthly nitro boost rewards", async () => {
  try {
   logger.info('BOOST', 'Starting monthly Nitro boost reward distribution (1st of month)...');
   const result = await distributeMonthlyBoostRewards(client);
   logger.success('BOOST', `Nitro boost rewards distributed - Rewarded: ${result.rewardedCount}, Already Rewarded: ${result.alreadyRewardedCount}, Errors: ${result.errorCount}, Total Tokens: ${result.totalTokens}`);
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('BOOST', 'Monthly Nitro boost reward distribution failed', error.message);
  }
 });
 // Monthly quest reward distribution - runs at 11:59 PM EST = 04:59 UTC on the last day of month
 createCronJob("59 4 * * *", "monthly quest reward distribution", async () => {
  try {
   // Get current date/time in UTC
   const now = new Date();
   // Calculate tomorrow by adding 24 hours (86400000 milliseconds)
   const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
   
   // Check if tomorrow is the 1st (using UTC, which is 5 hours ahead of EST)
   // If tomorrow is the 1st in UTC, then today is the last day of the month
   if (tomorrow.getUTCDate() === 1) {
    logger.info('QUEST', 'Starting monthly quest reward distribution (last day of month at 11:59 PM EST / 04:59 UTC)...');
    const result = await processMonthlyQuestRewards();
    logger.success('SCHEDULER', `Monthly quest rewards distributed - Processed: ${result.processed}, Rewarded: ${result.rewarded}, Errors: ${result.errors}`);
   } else {
    logger.info('SCHEDULER', 'Not last day of month, skipping monthly quest reward distribution');
   }
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('QUEST', 'Monthly quest reward distribution failed', error.message);
  }
 });

 // Periodic raid expiration check (every 5 minutes) to ensure raids timeout even if bot restarts
 createCronJob("*/5 * * * *", "raid expiration check", async () => {
  const startTime = Date.now();
  logger.warn('SCHEDULER', `🔍 [RAID CHECK] Starting execution at ${new Date().toISOString()}`);
  
  try {
   const result = await cleanupExpiredRaids(client);
   const duration = Date.now() - startTime;
   if (result.expiredCount > 0) {
    logger.info('RAID', `Periodic raid check - ${result.expiredCount} raid(s) expired (took ${duration}ms)`);
   } else {
    logger.warn('SCHEDULER', `🔍 [RAID CHECK] Completed in ${duration}ms (no expired raids)`);
   }
  } catch (error) {
   const duration = Date.now() - startTime;
   logger.error('RAID', `Periodic raid expiration check failed after ${duration}ms`, error);
   handleError(error, 'scheduler.js');
  }
 });

 // Hourly tasks
 createCronJob("0 * * * *", "village raid quota check", async () => {
  try {
    logger.info('RAID_QUOTA', 'Starting hourly village raid quota check...');
    await checkVillageRaidQuotas(client);
  } catch (error) {
    logger.error('RAID_QUOTA', 'Error during hourly village raid quota check', error.message);
    handleError(error, 'scheduler.js');
  }
 });
 createCronJob("0 */6 * * *", "quest completion check", () => checkQuestCompletions(client));
 createCronJob("0 */2 * * *", "village tracking check", () => checkVillageTracking(client)); // Every 2 hours
 // Blood moon tracking cleanup at 1 AM EST = 06:00 UTC
 createCronJob("0 6 * * *", "blood moon tracking cleanup", () => {
  logger.info('CLEANUP', 'Starting Blood Moon tracking cleanup');
  cleanupOldTrackingData();
  logger.success('CLEANUP', 'Blood Moon tracking cleanup completed');
 });
}

function setupQuestPosting(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupQuestPosting called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 // Quest posting check - runs on 1st of month at midnight EST = 05:00 UTC
 createCronJob("0 5 1 * *", "quest posting check", async () => {
  try {
   process.env.TEST_CHANNEL_ID = '706880599863853097';
   delete require.cache[require.resolve('../../bot/scripts/questAnnouncements')];
   const { postQuests } = require('../scripts/questAnnouncements');
   await postQuests(client);
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('QUEST', 'Quest posting check failed', error.message);
  }
 });
}

function setupBloodMoonScheduling(client) {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupBloodMoonScheduling called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
 // 8:00 PM EST = 01:00 UTC next day
 createCronJob("0 1 * * *", "blood moon start announcement", () => handleBloodMoonStart(client));
 // 8:00 AM EST = 13:00 UTC
 createCronJob("0 13 * * *", "blood moon end announcement", () => handleBloodMoonEnd(client));
}

 function setupGoogleSheetsRetry() {
 // Guard: Prevent setup if scheduler is already initialized (should only be called during init)
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', '⚠️ setupGoogleSheetsRetry called after scheduler already initialized! This will cause timer leaks!');
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.warn('SCHEDULER', 'Stack trace:', new Error().stack);
  }
  return;
 }
  createCronJob("*/15 * * * *", "retry pending Google Sheets operations", async () => {
   try {
    const pendingCount = await getPendingSheetOperationsCount();
    if (pendingCount > 0) {
     logger.info('SYNC', `Retrying ${pendingCount} pending Google Sheets operations`);
     const result = await retryPendingSheetOperations();
     if (result.success) {
      logger.success('SYNC', `Retry completed: ${result.retried} successful, ${result.failed} failed`);
     } else {
      logger.error('SYNC', 'Retry failed', result.error);
     }
    } else {
     logger.info('SCHEDULER', 'No pending Google Sheets operations to retry');
    }
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('SYNC', 'Google Sheets retry task failed', error.message);
   }
  });
}

// ------------------- Main Initialization Function ------------------

function initializeScheduler(client) {
 schedulerInitCallCount++;
 
 if (!client || !client.isReady()) {
  logger.error('SCHEDULER', 'Invalid or unready Discord client provided to scheduler');
  return;
 }

 // Check shared scheduler initialization
 if (!checkInitialization()) {
  logger.error('SCHEDULER', `⚠️ CRITICAL: Shared scheduler already initialized (call #${schedulerInitCallCount}) - refusing to reinitialize. This indicates a bug!`);
  // Only log stack trace and job list in verbose mode to avoid spam
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.error('SCHEDULER', 'Stack trace:', new Error().stack);
   const existingJobs = listCronJobs();
   logger.error('SCHEDULER', `Existing jobs (${existingJobs.length}):`, existingJobs.slice(0, 10).join(', '), existingJobs.length > 10 ? '...' : '');
  }
  return; // DO NOT reinitialize - this prevents timer leaks
 }

 // Prevent duplicate initialization - this should NEVER happen in normal operation
 if (isSchedulerInitialized) {
  logger.error('SCHEDULER', `⚠️ CRITICAL: Scheduler already initialized (call #${schedulerInitCallCount}) - refusing to reinitialize. This indicates a bug!`);
  // Only log stack trace and job list in verbose mode to avoid spam
  if (process.env.VERBOSE_LOGGING === 'true') {
   logger.error('SCHEDULER', 'Stack trace:', new Error().stack);
   const existingJobs = listCronJobs();
   logger.error('SCHEDULER', `Existing jobs (${existingJobs.length}):`, existingJobs.slice(0, 10).join(', '), existingJobs.length > 10 ? '...' : '');
  }
  return; // DO NOT reinitialize - this prevents timer leaks
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
 // Secret Santa - Disabled outside December
 // setupSecretSantaScheduler(client);
 
 isSchedulerInitialized = true;
 const totalCronJobs = listCronJobs().length;
 logger.success('SCHEDULER', `All scheduled tasks initialized (${totalCronJobs} active cron jobs)`);
 
 // Log all job names to help debug
 if (process.env.VERBOSE_LOGGING === 'true') {
  const jobNames = listCronJobs();
  logger.info('SCHEDULER', `Active cron jobs: ${jobNames.join(', ')}`);
 }
 
 // Set up periodic diagnostic check for timer leaks with fallback solutions
 // This will help us track when timers are being created and auto-fix leaks
 // Store client reference for job recreation after cleanup
 const schedulerClient = client;
 setTimeout(() => {
  const { logCronJobStats } = require('./croner');
  const { getMemoryMonitor } = require('@/shared/utils/memoryMonitor');
  const memMonitor = getMemoryMonitor();
  
  const checkTimerLeak = async () => {
   try {
    const cronerTimers = Array.from(memMonitor.activeTimers.values()).filter(t => t.isCroner).length;
    const stats = getCronJobStats();
    const timersPerJob = stats.totalJobs > 0 ? Math.round(cronerTimers / stats.totalJobs) : 0;
    
    // Check if jobs are missing (should have ~48 jobs but have 0)
    const expectedJobCount = 48; // Approximate expected job count
    if (stats.totalJobs === 0 && isSchedulerInitialized && schedulerClient && schedulerClient.isReady()) {
     logger.error('SCHEDULER', `🚨 CRITICAL: No jobs active but scheduler is initialized! Jobs may have been stopped by cleanup. Recreating...`);
     try {
      await recreateJobsAfterCleanup(schedulerClient);
      const newStats = getCronJobStats();
      logger.success('SCHEDULER', `✅ Recreated ${newStats.totalJobs} jobs`);
      // Recalculate after recreation
      const newCronerTimers = Array.from(memMonitor.activeTimers.values()).filter(t => t.isCroner).length;
      const newTimersPerJob = newStats.totalJobs > 0 ? Math.round(newCronerTimers / newStats.totalJobs) : 0;
      logger.warn('SCHEDULER', `🔍 Timer leak diagnostic: ${newCronerTimers} croner timers, ${newStats.totalJobs} jobs, ${newTimersPerJob} timers/job`);
      return; // Skip rest of check since we just recreated
     } catch (recreateError) {
      logger.error('SCHEDULER', `❌ Failed to recreate missing jobs:`, recreateError.message);
     }
    }
    
    logger.warn('SCHEDULER', `🔍 Timer leak diagnostic: ${cronerTimers} croner timers, ${stats.totalJobs} jobs, ${timersPerJob} timers/job`);
    logCronJobStats();
    
    // Fallback execution order based on timer ratio
    const ratioThreshold = parseInt(process.env.TIMER_LEAK_RATIO_THRESHOLD) || 5;
    const growthThreshold = parseFloat(process.env.TIMER_LEAK_GROWTH_THRESHOLD) || 1.0;
    
    // Calculate timer growth rate
    const now = Date.now();
    const timeSinceLastCheck = (now - (checkTimerLeak.lastCheckTime || now)) / 1000; // seconds
    const timerGrowth = cronerTimers - (checkTimerLeak.lastTimerCount || cronerTimers);
    const growthRate = timeSinceLastCheck > 0 ? timerGrowth / timeSinceLastCheck : 0;
    
    checkTimerLeak.lastTimerCount = cronerTimers;
    checkTimerLeak.lastCheckTime = now;
    
    // Always log detailed analysis
    if (timersPerJob > 3 || growthRate > growthThreshold) {
     logger.warn('SCHEDULER', `📈 Timer growth rate: ${growthRate.toFixed(2)} timers/sec (${timerGrowth} timers in ${Math.round(timeSinceLastCheck)}s)`);
    }
    
    // Fallback 1: Job deduplication check (if ratio > 3)
    if (timersPerJob > 3) {
     const health = await checkJobHealth();
     if (health.unhealthyJobs.length > 0) {
      logger.warn('SCHEDULER', `⚠️ Found ${health.unhealthyJobs.length} unhealthy jobs, will attempt cleanup`);
     }
    }
    
    // Fallback 2: Cleanup orphaned timers (if ratio > 5)
    if (timersPerJob > ratioThreshold) {
     logger.warn('SCHEDULER', `🧹 Timer ratio ${timersPerJob} exceeds threshold ${ratioThreshold}, triggering cleanup...`);
     const cleanupResult = await cleanupOrphanedTimers();
     if (cleanupResult.cleaned > 0) {
      logger.warn('SCHEDULER', `✅ Cleaned ${cleanupResult.cleaned} jobs with orphaned timers`);
      
      // Check memory impact
      const memStats = memMonitor.getMemoryStats();
      const memMB = memStats.rss / (1024 * 1024);
      if (memMB > 200) {
       logger.warn('SCHEDULER', `💾 Memory after cleanup: ${memMB.toFixed(2)} MB RSS. ${cleanupResult.totalTimers} timers still active.`);
      }
      
      // CRITICAL: Recreate jobs after cleanup
      // Jobs were stopped but need to be recreated to continue functioning
      const currentJobCount = listCronJobs().length;
      if (currentJobCount === 0 && isSchedulerInitialized && schedulerClient && schedulerClient.isReady()) {
       logger.warn('SCHEDULER', `🔄 All jobs were stopped. Recreating ${cleanupResult.cleaned} jobs...`);
       try {
        // Temporarily allow setup functions to run (they check for existing jobs and stop them first)
        // This is safe because we just stopped all jobs
        await recreateJobsAfterCleanup(schedulerClient);
        const newJobCount = listCronJobs().length;
        logger.success('SCHEDULER', `✅ Recreated ${newJobCount} jobs after cleanup`);
        
        // Check memory after recreation
        const memStatsAfter = memMonitor.getMemoryStats();
        const memMBAfter = memStatsAfter.rss / (1024 * 1024);
        logger.info('SCHEDULER', `💾 Memory after recreation: ${memMBAfter.toFixed(2)} MB RSS`);
       } catch (recreateError) {
        logger.error('SCHEDULER', `❌ Failed to recreate jobs after cleanup:`, recreateError.message);
       }
      } else if (currentJobCount === 0) {
       logger.warn('SCHEDULER', `⚠️ Jobs were stopped but cannot recreate: client=${!!schedulerClient}, ready=${schedulerClient?.isReady()}, initialized=${isSchedulerInitialized}`);
      }
     }
    }
    
    // Fallback 3: Force cleanup croner timers (if ratio > 8)
    if (timersPerJob > 8) {
     logger.warn('SCHEDULER', `🔧 Attempting to force cleanup croner internal timers...`);
     const forceResult = forceCleanupCronerTimers();
     if (forceResult.cleaned > 0) {
      logger.warn('SCHEDULER', `✅ Force cleaned ${forceResult.cleaned} internal timers`);
     }
    }
    
    // Fallback 4: Restart all jobs (if ratio > 10) - last resort
    if (timersPerJob > 10) {
     logger.error('SCHEDULER', `🚨 CRITICAL: Timer ratio ${timersPerJob} is extremely high! Restarting all jobs...`);
     const restartResult = await restartAllJobs();
     logger.error('SCHEDULER', `🔄 Restarted ${restartResult.stopped} jobs. Scheduler will need to recreate them.`);
     // Note: Jobs will need to be recreated - this is a last resort
    }
   } catch (error) {
    logger.error('SCHEDULER', `Error in timer leak check:`, error.message);
   }
  };
  
  // Initialize tracking
  checkTimerLeak.lastTimerCount = 0;
  checkTimerLeak.lastCheckTime = Date.now();
  
  // Run diagnostic every 2 minutes
  const diagnosticInterval = setInterval(checkTimerLeak, 2 * 60 * 1000);
  checkTimerLeak(); // Run immediately
  
  // Cleanup interval on process exit
  process.on('exit', () => {
   clearInterval(diagnosticInterval);
  });
 }, 30000); // Start after 30 seconds
 
 // Check and post weather on restart if needed (non-blocking)
 checkAndPostWeatherOnRestart(client).catch(error => {
   logger.error('WEATHER', 'Restart weather check failed', error.message);
   handleError(error, "scheduler.js", {
     commandName: 'initializeScheduler',
     operation: 'restartWeatherCheck'
   });
 });
}

// ============================================================================
// ------------------- Job Recreation After Cleanup -------------------
// ============================================================================

/**
 * Recreate all jobs after cleanup
 * Called automatically after cleanupOrphanedTimers stops jobs
 * @param {Client} client - Discord client
 */
async function recreateJobsAfterCleanup(client) {
 if (!client || !client.isReady()) {
  logger.error('SCHEDULER', 'Cannot recreate jobs: Invalid or unready Discord client');
  return { recreated: 0, error: 'Invalid client' };
 }

 if (!isSchedulerInitialized) {
  logger.warn('SCHEDULER', 'Cannot recreate jobs: Scheduler not initialized');
  return { recreated: 0, error: 'Scheduler not initialized' };
 }

 logger.info('SCHEDULER', '🔄 Recreating all jobs after cleanup...');
 
 const jobsBefore = listCronJobs().length;
 
 // Recreate all schedulers
 // Note: Setup functions check for existing jobs and stop them first, which is safe
 // since we just stopped all jobs in cleanup
 setupDailyTasks(client);
 setupQuestPosting(client);
 setupBloodMoonScheduling(client);
 setupGoogleSheetsRetry();
 
 // Initialize specialized schedulers
 setupBlightScheduler(client);
 setupBoostingScheduler(client);
 setupWeatherScheduler(client);
 setupHelpWantedFixedScheduler(client);
 
 const jobsAfter = listCronJobs().length;
 const recreated = jobsAfter - jobsBefore;
 
 logger.success('SCHEDULER', `✅ Recreated ${recreated} jobs (${jobsBefore} → ${jobsAfter})`);
 
 return { recreated, jobsBefore, jobsAfter };
}

// ============================================================================
// ------------------- Agenda Helper Functions -------------------
// ============================================================================

async function scheduleJailRelease(character) {
  if (!character.jailReleaseTime || !character.inJail) {
    return; // Nothing to schedule
  }

  const agenda = getAgenda();
  if (!agenda) {
    logger.warn('SCHEDULER', 'Agenda not initialized, cannot schedule jail release');
    return;
  }

  try {
    // Cancel any existing job for this character
    await agenda.cancel({
      name: 'releaseFromJail',
      'data.characterId': character._id.toString(),
    });

    // Schedule new job
    await agenda.schedule(character.jailReleaseTime, 'releaseFromJail', {
      characterId: character._id.toString(),
      userId: character.userId,
    });

    logger.info('SCHEDULER', `Scheduled jail release for ${character.name} at ${character.jailReleaseTime}`);
  } catch (error) {
    logger.error('SCHEDULER', `Error scheduling jail release for ${character.name}:`, error.message);
    handleError(error, 'scheduler.js', {
      functionName: 'scheduleJailRelease',
      characterId: character._id?.toString(),
    });
  }
}

async function scheduleDebuffExpiry(character) {
  if (!character.debuff || !character.debuff.active || !character.debuff.endDate) {
    return; // Nothing to schedule
  }

  const agenda = getAgenda();
  if (!agenda) {
    logger.warn('SCHEDULER', 'Agenda not initialized, cannot schedule debuff expiry');
    return;
  }

  try {
    // Cancel any existing job for this character
    await agenda.cancel({
      name: 'expireDebuff',
      'data.characterId': character._id.toString(),
    });

    // Schedule new job
    await agenda.schedule(character.debuff.endDate, 'expireDebuff', {
      characterId: character._id.toString(),
      userId: character.userId,
    });

    logger.info('SCHEDULER', `Scheduled debuff expiry for ${character.name} at ${character.debuff.endDate}`);
  } catch (error) {
    logger.error('SCHEDULER', `Error scheduling debuff expiry for ${character.name}:`, error.message);
    handleError(error, 'scheduler.js', {
      functionName: 'scheduleDebuffExpiry',
      characterId: character._id?.toString(),
    });
  }
}

async function scheduleBuffExpiry(character) {
  if (!character.buff || !character.buff.active || !character.buff.endDate) {
    return; // Nothing to schedule
  }

  const agenda = getAgenda();
  if (!agenda) {
    logger.warn('SCHEDULER', 'Agenda not initialized, cannot schedule buff expiry');
    return;
  }

  try {
    // Cancel any existing job for this character
    await agenda.cancel({
      name: 'expireBuff',
      'data.characterId': character._id.toString(),
    });

    // Schedule new job
    await agenda.schedule(character.buff.endDate, 'expireBuff', {
      characterId: character._id.toString(),
      userId: character.userId,
    });

    logger.info('SCHEDULER', `Scheduled buff expiry for ${character.name} at ${character.buff.endDate}`);
  } catch (error) {
    logger.error('SCHEDULER', `Error scheduling buff expiry for ${character.name}:`, error.message);
    handleError(error, 'scheduler.js', {
      functionName: 'scheduleBuffExpiry',
      characterId: character._id?.toString(),
    });
  }
}

// ============================================================================
// ------------------- Birthday Role Functions -------------------
// ============================================================================

async function handleBirthdayRoleAssignment(client) {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const characters = await Character.find({
      birthday: {
        $gte: new Date(today.getFullYear(), 0, 1),
        $lt: new Date(today.getFullYear() + 1, 0, 1)
      }
    });
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      logger.error('BIRTHDAY', 'Guild not found');
      return;
    }
    
    const birthdayRole = guild.roles.cache.find(role => role.name === 'Birthday');
    if (!birthdayRole) {
      logger.error('BIRTHDAY', 'Birthday role not found');
      return;
    }
    
    let assignedCount = 0;
    
    for (const character of characters) {
      try {
        const characterBirthday = new Date(character.birthday);
        const isToday = characterBirthday.getMonth() === today.getMonth() && 
                       characterBirthday.getDate() === today.getDate();
        
        if (!isToday) continue;
        
        const member = await guild.members.fetch(character.userId).catch(() => null);
        if (!member) continue;
        
        if (!member.roles.cache.has(birthdayRole.id)) {
          await member.roles.add(birthdayRole);
          assignedCount++;
          logger.info('BIRTHDAY', `Assigned birthday role to ${character.name}`);
        }
      } catch (error) {
        logger.error('BIRTHDAY', `Error assigning birthday role to ${character.name}:`, error.message);
      }
    }
    
    if (assignedCount > 0) {
      logger.success('BIRTHDAY', `Assigned birthday role to ${assignedCount} characters`);
    }
  } catch (error) {
    logger.error('BIRTHDAY', 'Error in birthday role assignment', error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleAssignment'
    });
  }
}

async function handleBirthdayRoleRemoval(client) {
  try {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    
    const characters = await Character.find({
      birthday: {
        $gte: new Date(yesterday.getFullYear(), 0, 1),
        $lt: new Date(yesterday.getFullYear() + 1, 0, 1)
      }
    });
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      logger.error('BIRTHDAY', 'Guild not found');
      return;
    }
    
    const birthdayRole = guild.roles.cache.find(role => role.name === 'Birthday');
    if (!birthdayRole) {
      logger.error('BIRTHDAY', 'Birthday role not found');
      return;
    }
    
    let removedCount = 0;
    
    for (const character of characters) {
      try {
        const characterBirthday = new Date(character.birthday);
        const wasYesterday = characterBirthday.getMonth() === yesterday.getMonth() && 
                            characterBirthday.getDate() === yesterday.getDate();
        
        if (!wasYesterday) continue;
        
        const member = await guild.members.fetch(character.userId).catch(() => null);
        if (!member) continue;
        
        if (member.roles.cache.has(birthdayRole.id)) {
          await member.roles.remove(birthdayRole);
          removedCount++;
          logger.info('BIRTHDAY', `Removed birthday role from ${character.name}`);
        }
      } catch (error) {
        logger.error('BIRTHDAY', `Error removing birthday role from ${character.name}:`, error.message);
      }
    }
    
    if (removedCount > 0) {
      logger.success('BIRTHDAY', `Removed birthday role from ${removedCount} characters`);
    }
  } catch (error) {
    logger.error('CLEANUP', 'Error in birthday role cleanup', error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleRemoval'
    });
  }
}

async function sendBirthdayAnnouncements(client) {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const characters = await Character.find({
      birthday: {
        $gte: new Date(today.getFullYear(), 0, 1),
        $lt: new Date(today.getFullYear() + 1, 0, 1)
      }
    });
    
    let announcedCount = 0;
    
    for (const character of characters) {
      try {
        const characterBirthday = new Date(character.birthday);
        const isToday = characterBirthday.getMonth() === today.getMonth() && 
                       characterBirthday.getDate() === today.getDate();
        
        if (!isToday) continue;
        
        const villageChannelId = getVillageChannelId(character.currentVillage);
        if (!villageChannelId) continue;
        
        const channel = await client.channels.fetch(villageChannelId);
        if (!channel) continue;
        
        const embed = new EmbedBuilder()
         .setTitle(`🎂 Happy Birthday, ${character.name}!`)
         .setDescription(`Today is ${character.name}'s birthday!`)
         .setColor(0xFF69B4)
         .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        announcedCount++;
        logger.info('BIRTHDAY', `🎂 Announced birthday for ${character.name}`);
      } catch (error) {
        handleError(error, "scheduler.js");
        logger.error('BIRTHDAY', `Failed to announce birthday for ${character.name}`, error.message);
      }
    }
    
    return announcedCount;
  } catch (error) {
    logger.error('BIRTHDAY', 'Error in birthday announcements', error);
    handleError(error, "scheduler.js", {
      commandName: 'sendBirthdayAnnouncements'
    });
    return 0;
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

async function resetAllStealProtections() {
  // Import from steal.js
  const { resetAllStealProtections: resetSteal } = require('../commands/jobs/steal');
  return await resetSteal();
}

async function checkQuestCompletions(client) {
  try {
    // Import from questAnnouncements.js
    const { checkQuestCompletions: checkQuests } = require('../scripts/questAnnouncements');
    await checkQuests();
  } catch (error) {
    logger.error('QUEST', 'Error checking quest completions:', error.message);
    handleError(error, "scheduler.js", {
      functionName: 'checkQuestCompletions'
    });
  }
}

async function checkVillageTracking(client) {
  try {
    // This function checks village locations for RP quest participants
    // Implementation would go here - for now just log
    logger.info('VILLAGE', 'Checking village tracking');
    // TODO: Implement village tracking check
  } catch (error) {
    logger.error('VILLAGE', 'Error checking village tracking:', error.message);
    handleError(error, "scheduler.js", {
      functionName: 'checkVillageTracking'
    });
  }
}

module.exports = {
 initializeScheduler,
 destroyAllCronJobs,
 recreateJobsAfterCleanup,
 setupBlightScheduler,
 setupBoostingScheduler,
 setupWeatherScheduler,
 postWeatherUpdate,
 checkAndPostWeatherIfNeeded,
 checkAndPostWeatherOnRestart,
 executeBirthdayAnnouncements,
 handleBirthdayRoleAssignment,
 handleBirthdayRoleRemoval,
 sendBirthdayAnnouncements,
 handleJailRelease,
 handleDebuffExpiry,
 handleBuffExpiry,
 resetDailyRolls,
 resetPetLastRollDates,
 checkAndGenerateDailyQuests,
 generateDailyQuestsAtMidnight,
 checkAndPostMissedQuests,
 cleanupOldRuuGameSessions,
  cleanupExpiredRaids,
  distributeMonthlyBoostRewards,
  checkAndDistributeMonthlyBoostRewards,
  // Agenda helper functions
  scheduleJailRelease,
  scheduleDebuffExpiry,
  scheduleBuffExpiry,
  // Utility functions
  getVillageChannelId,
};
