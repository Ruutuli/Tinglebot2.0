// ============================================================================
// bot/scheduler/scheduler.js
// Bot-specific scheduler setup functions
// ============================================================================

// ============================================================================
// ------------------- Core Dependencies -------------------
// ============================================================================
const dotenv = require("dotenv");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
// Croner removed - using Agenda for all scheduling

// ============================================================================
// ------------------- Discord.js -------------------
// ============================================================================
const { EmbedBuilder } = require("discord.js");

// ============================================================================
// ------------------- Database Models -------------------
// ============================================================================
const Character = require('@/shared/models/CharacterModel');
const Pet = require('@/shared/models/PetModel');
const Raid = require('@/shared/models/RaidModel');
const RuuGame = require('@/shared/models/RuuGameModel');
const HelpWantedQuest = require('@/shared/models/HelpWantedQuestModel');
const ItemModel = require('@/shared/models/ItemModel');
const Weather = require('@/shared/models/WeatherModel');

// ============================================================================
// ------------------- Database Functions -------------------
// ============================================================================
const {
 generateVendingStockList,
 resetPetRollsForAllCharacters,
 connectToInventories,
 getCharacterInventoryCollection,
 fetchItemByName,
} = require('@/shared/database/db');

// ============================================================================
// ------------------- Bot Handlers -------------------
// ============================================================================
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
 checkAndPostMissedBlightPing,
} = require("../handlers/blightHandler");

// ============================================================================
// ------------------- Bot Scripts -------------------
// ============================================================================
const {
 sendBloodMoonAnnouncement,
 sendBloodMoonEndAnnouncement,
 isBloodMoonDay,
 renameChannels,
 revertChannelNames,
 cleanupOldTrackingData,
} = require("../scripts/bloodmoon");
const { resetAllVillageRaidQuotas, checkVillageRaidQuotas } = require("../scripts/randomMonsterEncounters");
const { postQuests } = require('../scripts/questAnnouncements');

// ============================================================================
// ------------------- Bot Modules -------------------
// ============================================================================
const { recoverDailyStamina } = require("../modules/characterStatsModule");
const { bloodmoonDates, convertToHyruleanDate } = require('../modules/calendarModule');
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests, isTravelBlockedByWeather, regenerateEscortQuest, regenerateArtWritingQuest } = require('../modules/helpWantedModule');
const { processMonthlyQuestRewards } = require('../modules/questRewardModule');
const { updateAllRoleCountChannels } = require('../modules/roleCountChannelsModule');
const { damageVillage, Village } = require('../modules/villageModule');
const { addBoostFlavorText, buildFooterText } = require('../embeds/embeds');
const { generateBoostFlavorText } = require('../modules/flavorTextModule');
// Secret Santa - Disabled outside December
// const { setupSecretSantaScheduler } = require('../modules/secretSantaModule');

// ============================================================================
// ------------------- Shared Utilities -------------------
// ============================================================================
const { handleError } = require('@/shared/utils/globalErrorHandler');
const { sendUserDM } = require('@/shared/utils/messageUtils');
const logger = require('@/shared/utils/logger');
const { releaseFromJail, DEFAULT_JAIL_DURATION_MS } = require('@/shared/utils/jailCheck');
const { logItemAcquisitionToDatabase } = require('@/shared/utils/inventoryUtils');
const { isValidImageUrl } = require('@/shared/utils/validation');
const notificationService = require('@/shared/utils/notificationService');
const {
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require('@/shared/utils/storage');

// ============================================================================
// ------------------- Shared Services -------------------
// ============================================================================
const { getCurrentWeather, generateWeatherEmbed, getWeatherWithoutGeneration, getCurrentPeriodBounds } = require('@/shared/services/weatherService');

// ============================================================================
// ------------------- Scheduler Dependencies -------------------
// ============================================================================
const { getAgenda } = require('./agenda');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';

// ============================================================================
// ------------------- Channel Mappings -------------------
// ============================================================================
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

// Track scheduler initialization state
let isSchedulerInitialized = false;
let schedulerInitCallCount = 0; // Track how many times initializeScheduler is called

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

// ------------------- Agenda Helper ------------------
// Ensure Agenda is initialized with consistent error logging -
function ensureAgendaInitialized(context) {
 const agenda = getAgenda();
 if (!agenda) {
  logger.error('SCHEDULER', `[scheduler.js]❌ Agenda not initialized - cannot ${context}`);
 }
 return agenda;
}

// ------------------- Job Creation Helper ------------------
// Check if a recurring job already exists before creating it
// This prevents duplicate jobs on restart
async function ensureRecurringJob(schedule, jobName) {
 const agenda = ensureAgendaInitialized('ensure recurring job');
 if (!agenda) return null;
 
 try {
  // Query MongoDB directly to check for existing job
  const mongooseConnection = require('../database/connectionManager').getTinglebotConnection();
  if (!mongooseConnection || mongooseConnection.readyState !== 1) {
   logger.warn('SCHEDULER', `Database not ready, creating job ${jobName} anyway`);
   return await agenda.every(schedule, jobName);
  }
  
  const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
  
  // Check if job with same name and schedule already exists
  // Agenda stores name in either 'name' or 'attrs.name', and schedule in 'repeatInterval'
  const existingJob = await agendaJobsCollection.findOne({
   $or: [
    { name: jobName, repeatInterval: schedule },
    { 'attrs.name': jobName, repeatInterval: schedule }
   ]
  });
  
  if (existingJob) {
   logger.debug('SCHEDULER', `Job already exists: ${jobName} (${schedule}) - skipping creation`);
   // Return a mock job object for consistency
   return { attrs: { name: jobName, _id: existingJob._id } };
  }
  
  // Job doesn't exist, create it
  const job = await agenda.every(schedule, jobName);
  logger.info('SCHEDULER', `Created recurring job: ${jobName} (${schedule})`);
  return job;
 } catch (error) {
  logger.error('SCHEDULER', `Error ensuring recurring job ${jobName}:`, error.message);
  // Fallback: try to create anyway
  try {
   return await agenda.every(schedule, jobName);
  } catch (fallbackError) {
   logger.error('SCHEDULER', `Failed to create job ${jobName} even as fallback:`, fallbackError.message);
   return null;
  }
 }
}

// ------------------- Birthday Helper ------------------
// Check if character's birthday is today -
function isBirthdayToday(character, today) {
 const characterBirthday = new Date(character.birthday);
 return characterBirthday.getMonth() === today.getMonth() && 
        characterBirthday.getDate() === today.getDate();
}

// ------------------- Channel Helper ------------------
// Fetch village channel with consistent error handling -
async function fetchVillageChannel(client, villageName) {
 const channelId = getVillageChannelId(villageName);
 if (!channelId) {
  logger.error('CHANNEL', `[scheduler.js]❌ No channel ID configured for ${villageName}`);
  return null;
 }
 
 let channel = client.channels.cache.get(channelId);
 if (!channel) {
  try {
   channel = await client.channels.fetch(channelId);
   if (!channel) {
    logger.error('CHANNEL', `[scheduler.js]❌ Channel ${channelId} does not exist for ${villageName}`);
    return null;
   }
  } catch (fetchError) {
   logger.error('CHANNEL', `[scheduler.js]❌ Failed to fetch channel ${channelId} for ${villageName}:`, fetchError.message);
   return null;
  }
 }
 
 return channel;
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

  const channel = await fetchVillageChannel(client, village);
  if (!channel) {
   logger.error('WEATHER', `[scheduler.js]❌ Failed to fetch channel for ${village}`);
   return false;
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
    if (!isBirthdayToday(character, today)) continue;
    
    const channel = await fetchVillageChannel(client, character.currentVillage);
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
    logger.error('BIRTHDAY', `[scheduler.js]❌ Failed to announce birthday for ${character.name}:`, error.message);
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
   
   const villageChannel = await fetchVillageChannel(client, character.currentVillage);
   
   if (villageChannel) {
    await villageChannel.send({
     content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
     embeds: [new EmbedBuilder().setDescription('They can now continue their adventures!').setColor(0x00FF00)]
    });
    releasedCount++;
   }
  } catch (error) {
   logger.error('JOB', `[scheduler.js]❌ Error releasing ${character.name} from jail:`, error.message);
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
  logger.error('CLEANUP', `[scheduler.js]❌ Error resetting daily rolls:`, error);
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
  logger.error('CLEANUP', `[scheduler.js]❌ Failed to reset pet lastRollDates:`, error.message);
 }
}

// ============================================================================
// ------------------- Blight Functions -------------------
// ============================================================================

async function setupBlightScheduler(client) {
 // 8:00 PM EST = 01:00 UTC next day
 await ensureRecurringJob("0 1 * * *", "Blight Roll Call");
}

// ============================================================================
// ------------------- Boosting Functions -------------------
// ============================================================================

async function setupBoostingScheduler(client) {
 // Daily boost cleanup at midnight EST = 05:00 UTC
 await ensureRecurringJob("0 5 * * *", "Boost Cleanup");
}

// ============================================================================
// ------------------- Weather Scheduler -------------------
// ============================================================================

async function setupWeatherScheduler(client) {
 try {
  // Primary weather update at 8:00am EST = 13:00 UTC
  const job1 = await ensureRecurringJob("0 13 * * *", "Daily Weather Update");
  logger.info('SCHEDULER', `Created recurring job: Daily Weather Update at 8am EST (${job1?.attrs?.name || 'created'})`);
  
  // Fallback check at 8:15am EST = 13:15 UTC - ensures weather was posted, generates if missing
  const job2 = await ensureRecurringJob("15 13 * * *", "Weather Fallback Check");
  logger.info('SCHEDULER', `Created recurring job: Weather Fallback Check at 8:15am EST (${job2?.attrs?.name || 'created'})`);
  
  // Weather reminder at 8:00pm EST = 01:00 UTC next day
  const job3 = await ensureRecurringJob("0 1 * * *", "Daily Weather Forecast Reminder");
  logger.info('SCHEDULER', `Created recurring job: Daily Weather Forecast Reminder at 8pm EST (${job3?.attrs?.name || 'created'})`);
 } catch (error) {
  logger.error('SCHEDULER', `Error creating weather scheduler jobs:`, error);
  throw error;
 }
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
    logger.error('QUEST', `[scheduler.js]❌ Error checking/generating daily quests:`, error);
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
    logger.error('QUEST', `[scheduler.js]❌ Error checking for missed quests:`, error);
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
    logger.error('QUEST', `[scheduler.js]❌ Error checking and posting scheduled quests:`, error);
    return 0;
  }
}

async function postQuestToChannel(client, quest, context) {
  try {
    const channel = await fetchVillageChannel(client, quest.village);
    if (!channel) {
      logger.error('QUEST', `[scheduler.js]❌ Failed to fetch channel for ${quest.village}`);
      return false;
    }
    
    const embeds = await formatSpecificQuestsAsEmbedsByVillage([quest], quest.village);
    if (!embeds || embeds.length === 0) {
      logger.error('QUEST', `[scheduler.js]❌ No embeds generated for quest ${quest.questId}`);
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
    logger.error('QUEST', `[scheduler.js]❌ Error checking weather for escort quest:`, error);
    return true; // Allow quest to post if weather check fails
  }
}

async function setupHelpWantedFixedScheduler(client) {
 const { FIXED_CRON_TIMES } = require('../modules/helpWantedModule');
 
 // Schedule all 24 time slots for full 24-hour coverage
 // The variable buffer (3-6 hours) is handled in the quest generation logic
 // Note: FIXED_CRON_TIMES contains EST times, convert to UTC (add 5 hours)
 let jobsCreated = 0;
 let jobsSkipped = 0;
 for (const cronTime of FIXED_CRON_TIMES) {
  const utcCronTime = convertEstCronToUtc(cronTime);
  const jobName = `Help Wanted Board Check - ${cronTime} (EST)`;
  const job = await ensureRecurringJob(utcCronTime, jobName);
  if (job && job.attrs?._id) {
   jobsCreated++;
  } else {
   jobsSkipped++;
  }
 }
 
 logger.success('SCHEDULER', `Help Wanted scheduler configured with ${jobsCreated} time slots (${jobsSkipped} already existed, full 24-hour coverage with variable 3-6 hour buffer in quest generation)`);
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

async function setupDailyTasks(client) {
 try {
  // Daily tasks at midnight EST = 05:00 UTC
  const job1 = await ensureRecurringJob("0 5 * * *", "reset pet last roll dates");
  logger.info('SCHEDULER', `Created recurring job: reset pet last roll dates (${job1?.attrs?.name || 'created'})`);
  
  const job2 = await ensureRecurringJob("0 5 * * *", "birthday role assignment");
  logger.info('SCHEDULER', `Created recurring job: birthday role assignment (${job2?.attrs?.name || 'created'})`);
  
  const job3 = await ensureRecurringJob("0 5 * * *", "reset daily rolls");
  logger.info('SCHEDULER', `Created recurring job: reset daily rolls (${job3?.attrs?.name || 'created'})`);
  
  const job4 = await ensureRecurringJob("0 5 * * *", "recover daily stamina");
  logger.info('SCHEDULER', `Created recurring job: recover daily stamina (${job4?.attrs?.name || 'created'})`);
  
  const job5 = await ensureRecurringJob("0 5 * * *", "generate daily quests");
  logger.info('SCHEDULER', `Created recurring job: generate daily quests (${job5?.attrs?.name || 'created'})`);
  
  const job6 = await ensureRecurringJob("0 5 * * *", "global steal protections reset");
  logger.info('SCHEDULER', `Created recurring job: global steal protections reset (${job6?.attrs?.name || 'created'})`);
  
  // Expiration check - daily at 8 AM EST = 13:00 UTC
  const job7 = await ensureRecurringJob("0 13 * * *", "checkExpiredRequests");
  logger.info('SCHEDULER', `Created recurring job: checkExpiredRequests at 8am EST (${job7?.attrs?.name || 'created'})`);
 } catch (error) {
  logger.error('SCHEDULER', `Error creating daily task jobs:`, error);
  throw error;
 }

 // Weekly tasks - Sunday midnight EST = Monday 05:00 UTC
 await ensureRecurringJob("0 5 * * 1", "weekly pet rolls reset");

 // Monthly tasks - 1st of month midnight EST = 05:00 UTC
 await ensureRecurringJob("0 5 1 * *", "monthly vending stock generation");
 await ensureRecurringJob("0 5 1 * *", "monthly nitro boost rewards");
 // Monthly quest reward distribution - runs at 11:59 PM EST = 04:59 UTC on the last day of month
 await ensureRecurringJob("59 4 * * *", "monthly quest reward distribution");

 // Periodic raid expiration check (every 5 minutes) to ensure raids timeout even if bot restarts
 await ensureRecurringJob("*/5 * * * *", "raid expiration check");

 // Hourly tasks
 await ensureRecurringJob("0 * * * *", "village raid quota check");
 await ensureRecurringJob("0 * * * *", "memory log"); // Memory stats logging
 await ensureRecurringJob("0 */6 * * *", "quest completion check");
 await ensureRecurringJob("0 */2 * * *", "village tracking check"); // Every 2 hours
 // Blood moon tracking cleanup at 1 AM EST = 06:00 UTC
 await ensureRecurringJob("0 6 * * *", "blood moon tracking cleanup");
}

async function setupQuestPosting(client) {
 // Quest posting check - runs on 1st of month at midnight EST = 05:00 UTC
 await ensureRecurringJob("0 5 1 * *", "quest posting check");
}

async function setupBloodMoonScheduling(client) {
 try {
  // 8:00 PM EST = 01:00 UTC next day
  const job1 = await ensureRecurringJob("0 1 * * *", "blood moon start announcement");
  logger.info('SCHEDULER', `Created recurring job: blood moon start announcement (${job1?.attrs?.name || 'created'})`);
  
  // 8:00 AM EST = 13:00 UTC
  const job2 = await ensureRecurringJob("0 13 * * *", "blood moon end announcement");
  logger.info('SCHEDULER', `Created recurring job: blood moon end announcement at 8am EST (${job2?.attrs?.name || 'created'})`);
 } catch (error) {
  logger.error('SCHEDULER', `Error creating blood moon scheduler jobs:`, error);
  throw error;
 }
}

// ------------------- Job Verification Function ------------------

/**
 * Verify and recreate missing recurring jobs
 * This ensures all scheduled jobs exist in the database
 */
async function verifyAndRecreateJobs(client) {
 const agenda = ensureAgendaInitialized('verify jobs');
 if (!agenda) return;

 try {
  // Query MongoDB directly to check for recurring jobs
  const mongooseConnection = require('../database/connectionManager').getTinglebotConnection();
  if (!mongooseConnection || mongooseConnection.readyState !== 1) {
   logger.error('SCHEDULER', 'Database connection not available for job verification');
   return;
  }
  
  const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
  
  // Get all jobs with repeatInterval (recurring jobs)
  const existingJobs = await agendaJobsCollection.find({ 
   repeatInterval: { $exists: true, $ne: null }
  }).toArray();
  
  logger.info('SCHEDULER', `Found ${existingJobs.length} recurring jobs in database`);
  
  // List of all expected recurring jobs that should run at 8am EST (13:00 UTC)
  const expected8amJobs = [
   { name: "checkExpiredRequests", schedule: "0 13 * * *", description: "8am EST expiration check" },
   { name: "Daily Weather Update", schedule: "0 13 * * *", description: "8am EST weather update" },
   { name: "blood moon end announcement", schedule: "0 13 * * *", description: "8am EST blood moon end" },
  ];
  
  // Also check for 8:15am job
  const expected815amJobs = [
   { name: "Weather Fallback Check", schedule: "15 13 * * *", description: "8:15am EST weather fallback" },
  ];
  
  const allExpectedJobs = [...expected8amJobs, ...expected815amJobs];
  
  let recreatedCount = 0;
  for (const expectedJob of allExpectedJobs) {
   // Check if job exists by name and has the correct schedule
   const jobExists = existingJobs.some(job => {
    const jobName = job.name || job.attrs?.name;
    const repeatInterval = job.repeatInterval || job.attrs?.repeatInterval;
    return jobName === expectedJob.name && repeatInterval === expectedJob.schedule;
   });
   
   if (!jobExists) {
    logger.warn('SCHEDULER', `Missing job: ${expectedJob.name} (${expectedJob.description}) - recreating...`);
    try {
     const createdJob = await ensureRecurringJob(expectedJob.schedule, expectedJob.name);
     if (createdJob && createdJob.attrs?._id) {
      recreatedCount++;
      logger.success('SCHEDULER', `Recreated missing job: ${expectedJob.name} (ID: ${createdJob.attrs._id})`);
     }
    } catch (error) {
     logger.error('SCHEDULER', `Failed to recreate job ${expectedJob.name}:`, error.message);
    }
   } else {
    logger.debug('SCHEDULER', `Job exists: ${expectedJob.name}`);
   }
  }
  
  if (recreatedCount > 0) {
   logger.success('SCHEDULER', `Recreated ${recreatedCount} missing recurring jobs`);
  } else {
   logger.info('SCHEDULER', 'All expected recurring jobs exist in database');
  }
  
  // Log all 8am jobs for debugging
  const eightAmJobs = existingJobs.filter(job => {
   const repeatInterval = job.repeatInterval || job.attrs?.repeatInterval;
   return repeatInterval === "0 13 * * *";
  });
  logger.info('SCHEDULER', `Found ${eightAmJobs.length} jobs scheduled for 8am EST (13:00 UTC):`, 
   eightAmJobs.map(j => (j.name || j.attrs?.name || 'unknown')).join(', '));
   
 } catch (error) {
  logger.error('SCHEDULER', `Error verifying jobs:`, error);
  handleError(error, "scheduler.js", { functionName: 'verifyAndRecreateJobs' });
 }
}

// ------------------- Main Initialization Function ------------------

async function initializeScheduler(client) {
 logger.info('SCHEDULER', `[initializeScheduler] Starting scheduler initialization (call #${schedulerInitCallCount + 1})...`);
 schedulerInitCallCount++;
 
 if (!client || !client.isReady()) {
  logger.error('SCHEDULER', 'Invalid or unready Discord client provided to scheduler');
  logger.error('SCHEDULER', `Client ready state: ${client ? client.isReady() : 'null'}`);
  return;
 }
 logger.debug('SCHEDULER', 'Discord client is ready');

 // Check if Agenda is initialized
 const agenda = getAgenda();
 if (!agenda) {
  logger.error('SCHEDULER', `[scheduler.js]❌ Agenda not initialized - cannot initialize scheduler. Make sure initAgenda() and defineAgendaJobs() are called first.`);
  return;
 }
 logger.debug('SCHEDULER', 'Agenda instance found');

 // Prevent duplicate initialization
 if (isSchedulerInitialized) {
  logger.warn('SCHEDULER', `⚠️ Scheduler already initialized (call #${schedulerInitCallCount}) - skipping reinitialization`);
  return;
 }
 logger.debug('SCHEDULER', 'Scheduler not yet initialized, proceeding...');

 // Run startup checks
 await runStartupChecks(client);

  // Setup all schedulers (now using Agenda)
  // Note: Even if Agenda.start() timed out, we can still create jobs
  // Agenda will pick them up when it eventually starts
  try {
   logger.info('SCHEDULER', 'Setting up daily tasks...');
   await setupDailyTasks(client);
   
   logger.info('SCHEDULER', 'Setting up quest posting...');
   await setupQuestPosting(client);
   
   logger.info('SCHEDULER', 'Setting up blood moon scheduling...');
   await setupBloodMoonScheduling(client);
   
   logger.info('SCHEDULER', 'Setting up blight scheduler...');
   await setupBlightScheduler(client);
   
   logger.info('SCHEDULER', 'Setting up boosting scheduler...');
   await setupBoostingScheduler(client);
   
   logger.info('SCHEDULER', 'Setting up weather scheduler...');
   await setupWeatherScheduler(client);
   
   logger.info('SCHEDULER', 'Setting up help wanted scheduler...');
   await setupHelpWantedFixedScheduler(client);
   // Secret Santa - Disabled outside December
   // await setupSecretSantaScheduler(client);
   
   // Verify all jobs were created (especially important for 8am jobs)
   logger.info('SCHEDULER', 'Verifying all jobs were created...');
   await verifyAndRecreateJobs(client);
   
   isSchedulerInitialized = true;
   logger.success('SCHEDULER', 'All scheduled tasks initialized with Agenda');
  } catch (error) {
   logger.error('SCHEDULER', 'Error initializing scheduler:', error);
   handleError(error, "scheduler.js", { functionName: 'initializeScheduler' });
   // Don't throw - allow bot to continue
  }
 
 // Croner diagnostic code removed - using Agenda for all scheduling
 
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
 * Recreate all jobs after cleanup (Agenda jobs are persistent, so this just re-initializes)
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

 logger.info('SCHEDULER', '🔄 Re-initializing schedulers...');
 
 // Re-initialize all schedulers
 // Agenda jobs are persistent in the database, so this just ensures they're set up
 await setupDailyTasks(client);
 await setupQuestPosting(client);
 await setupBloodMoonScheduling(client);
 
 // Initialize specialized schedulers
 await setupBlightScheduler(client);
 await setupBoostingScheduler(client);
 await setupWeatherScheduler(client);
 await setupHelpWantedFixedScheduler(client);
 
 logger.success('SCHEDULER', '✅ Schedulers re-initialized');
 
 return { recreated: 0, message: 'Agenda jobs are persistent - no recreation needed' };
}

// ============================================================================
// ------------------- Agenda Helper Functions -------------------
// ============================================================================

async function scheduleJailRelease(character) {
 if (!character.jailReleaseTime || !character.inJail) {
  return; // Nothing to schedule
 }

 const agenda = ensureAgendaInitialized('schedule jail release');
 if (!agenda) return;

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
  logger.error('SCHEDULER', `[scheduler.js]❌ Error scheduling jail release for ${character.name}:`, error.message);
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

 const agenda = ensureAgendaInitialized('schedule debuff expiry');
 if (!agenda) return;

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
  logger.error('SCHEDULER', `[scheduler.js]❌ Error scheduling debuff expiry for ${character.name}:`, error.message);
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

 const agenda = ensureAgendaInitialized('schedule buff expiry');
 if (!agenda) return;

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
  logger.error('SCHEDULER', `[scheduler.js]❌ Error scheduling buff expiry for ${character.name}:`, error.message);
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
      logger.error('BIRTHDAY', `[scheduler.js]❌ Birthday role not found`);
      return;
    }
    
    let assignedCount = 0;
    
    for (const character of characters) {
      try {
        if (!isBirthdayToday(character, today)) continue;
        
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
    logger.error('BIRTHDAY', `[scheduler.js]❌ Error in birthday role assignment:`, error);
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
      logger.error('BIRTHDAY', `[scheduler.js]❌ Birthday role not found`);
      return;
    }
    
    let removedCount = 0;
    
    for (const character of characters) {
      try {
        if (!isBirthdayToday(character, yesterday)) continue;
        
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
    logger.error('CLEANUP', `[scheduler.js]❌ Error in birthday role cleanup:`, error);
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
        if (!isBirthdayToday(character, today)) continue;
        
        const channel = await fetchVillageChannel(client, character.currentVillage);
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
        logger.error('BIRTHDAY', `[scheduler.js]❌ Failed to announce birthday for ${character.name}:`, error.message);
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
    logger.error('VILLAGE', `[scheduler.js]❌ Error checking village tracking:`, error.message);
    handleError(error, "scheduler.js", {
      functionName: 'checkVillageTracking'
    });
  }
}

module.exports = {
 initializeScheduler,
 recreateJobsAfterCleanup,
 verifyAndRecreateJobs,
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
