// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// Core dependencies
const dotenv = require("dotenv");
const path = require("path");
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");

// Discord.js
const { EmbedBuilder } = require("discord.js");

// Database models
const Character = require("../shared/models/CharacterModel");
const Pet = require("../shared/models/PetModel");
const Raid = require("../shared/models/RaidModel");
const RuuGame = require("../shared/models/RuuGameModel");
const HelpWantedQuest = require('../shared/models/HelpWantedQuestModel');
const ItemModel = require('../shared/models/ItemModel');
const Weather = require('../shared/models/WeatherModel');

// Database functions
const {
 generateVendingStockList,
 resetPetRollsForAllCharacters,
 connectToInventories,
 getCharacterInventoryCollection,
 fetchItemByName,
} = require("../shared/database/db");

// Handlers
const {
 postBlightRollCall,
 cleanupExpiredBlightRequests,
 checkExpiringBlightRequests,
 sendBlightReminders,
 checkMissedRolls,
 checkAndPostMissedBlightPing,
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
const { bloodmoonDates, convertToHyruleanDate } = require('./modules/calendarModule');
const { formatSpecificQuestsAsEmbedsByVillage, generateDailyQuests, isTravelBlockedByWeather, regenerateEscortQuest, regenerateArtWritingQuest } = require('./modules/helpWantedModule');
const { processMonthlyQuestRewards } = require('./modules/questRewardModule');
const { updateAllRoleCountChannels } = require('./modules/roleCountChannelsModule');
const { setupSecretSantaScheduler } = require('./modules/secretSantaModule');
const { addBoostFlavorText, buildFooterText } = require('./embeds/embeds');
const { generateBoostFlavorText } = require('./modules/flavorTextModule');

// Utilities
const { safeAppendDataToSheet, extractSpreadsheetId } = require('../shared/utils/googleSheetsUtils');

// Services
const { getCurrentWeather, generateWeatherEmbed, getWeatherWithoutGeneration } = require("../shared/services/weatherService");

// Village modules
const { damageVillage, Village } = require('./modules/villageModule');

// Utils
const { handleError } = require("../shared/utils/globalErrorHandler");
const { sendUserDM } = require("../shared/utils/messageUtils");
const { checkExpiredRequests } = require("../shared/utils/expirationHandler");
const { isValidImageUrl } = require("../shared/utils/validation");
const notificationService = require("../shared/utils/notificationService");
const logger = require("../shared/utils/logger");
const { releaseFromJail, DEFAULT_JAIL_DURATION_MS } = require("../shared/utils/jailCheck");
const {
 cleanupExpiredEntries,
 cleanupExpiredHealingRequests,
 cleanupExpiredBoostingRequests,
 getBoostingStatistics,
 archiveOldBoostingRequests,
} = require("../shared/utils/storage");
const {
 retryPendingSheetOperations,
 getPendingSheetOperationsCount,
} = require("../shared/utils/googleSheetsUtils");

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
 const rootEnvPath = path.resolve(__dirname, '..', '.env');
 const envSpecificPath = path.resolve(__dirname, '..', `.env.${env}`);
 // Try environment-specific file first, then fall back to root .env
 if (require('fs').existsSync(envSpecificPath)) {
   dotenv.config({ path: envSpecificPath });
 } else {
   dotenv.config({ path: rootEnvPath });
 }
} catch (error) {
 logger.error('SYSTEM', `Failed to load .env:`, error.message);
 dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
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
    logger.error('SCHEDULER', `${jobName} failed`, error.message);
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

// ------------------- Function: applyWeatherDamage -------------------
// Calculates and applies village damage based on weather conditions
async function applyWeatherDamage(villageName, weather) {
  try {
    // Fetch village from database
    const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
    if (!village) {
      logger.warn('WEATHER', `Village "${villageName}" not found for weather damage`);
      return;
    }

    // Check if damage was already applied today
    // Compare lastDamageTime to today's date (same day = already applied)
    if (village.lastDamageTime) {
      const lastDamageDate = new Date(village.lastDamageTime);
      const today = new Date();
      const isSameDay = lastDamageDate.getDate() === today.getDate() &&
                        lastDamageDate.getMonth() === today.getMonth() &&
                        lastDamageDate.getFullYear() === today.getFullYear();
      
      if (isSameDay) {
        logger.info('WEATHER', `Weather damage already applied to ${villageName} today, skipping`);
        return;
      }
    }

    let totalDamage = 0;
    const damageSources = [];

    // Wind damage (based on wind speed)
    if (weather.wind && weather.wind.speed) {
      const windSpeed = weather.wind.speed;
      if (windSpeed >= 118) {
        // Hurricane (≥118 km/h) → 2 HP
        totalDamage += 2;
        damageSources.push('Hurricane (2 HP)');
      } else if (windSpeed >= 88) {
        // Storm (88-117 km/h) → 1 HP
        totalDamage += 1;
        damageSources.push('Storm (1 HP)');
      } else if (windSpeed >= 63) {
        // Gale (63-87 km/h) → 1 HP
        totalDamage += 1;
        damageSources.push('Gale (1 HP)');
      } else if (windSpeed >= 41) {
        // Strong Winds (41-62 km/h) → 1 HP
        totalDamage += 1;
        damageSources.push('Strong Winds (1 HP)');
      }
    }

    // Precipitation damage
    if (weather.precipitation) {
      const precipLabel = weather.precipitation.label || '';
      if (precipLabel === 'Blizzard') {
        totalDamage += 5;
        damageSources.push('Blizzard (5 HP)');
      } else if (precipLabel === 'Heavy Snow') {
        totalDamage += 2;
        damageSources.push('Heavy Snow (2 HP)');
      } else if (precipLabel === 'Hail') {
        totalDamage += 3;
        damageSources.push('Hail (3 HP)');
      }
    }

    // Special weather damage
    if (weather.special) {
      const specialLabel = weather.special.label || '';
      if (specialLabel === 'Blight Rain') {
        totalDamage += 50;
        damageSources.push('Blight Rain (50 HP)');
      } else if (specialLabel === 'Avalanche') {
        totalDamage += 15;
        damageSources.push('Avalanche (15 HP)');
      } else if (specialLabel === 'Rock Slide') {
        totalDamage += 15;
        damageSources.push('Rock Slide (15 HP)');
      } else if (specialLabel === 'Flood') {
        totalDamage += 20;
        damageSources.push('Flood (20 HP)');
      } else if (specialLabel === 'Lightning Storm') {
        totalDamage += 5;
        damageSources.push('Lightning Storm (5 HP)');
      } else if (specialLabel === 'Cinder Storm') {
        // Cinder storms always have strong winds by necessity
        // Currently causes wind-based damage (already counted above if wind speed >= 41)
        // If wind damage wasn't already counted, add 1-2 HP depending on wind category
        if (totalDamage === 0 || !damageSources.some(d => d.includes('Strong') || d.includes('Gale') || d.includes('Storm') || d.includes('Hurricane'))) {
          const windSpeed = weather.wind?.speed || 63; // Default to gale speed for cinder storms
          if (windSpeed >= 118) {
            totalDamage += 2;
            damageSources.push('Cinder Storm - Hurricane winds (2 HP)');
          } else {
            totalDamage += 1;
            damageSources.push('Cinder Storm - Strong winds (1 HP)');
          }
        }
      }
    }

    // Apply damage if any was calculated
    if (totalDamage > 0) {
      logger.info('WEATHER', `Applying ${totalDamage} HP weather damage to ${villageName} from: ${damageSources.join(', ')}`);
      
      // Apply damage to village (damageVillage will update lastDamageTime)
      await damageVillage(villageName, totalDamage);
      
      logger.success('WEATHER', `Applied ${totalDamage} HP weather damage to ${villageName}`);
    } else {
      logger.info('WEATHER', `No weather damage for ${villageName} - weather conditions do not cause damage`);
    }
  } catch (error) {
    logger.error('WEATHER', `Error in applyWeatherDamage for ${villageName}: ${error.message}`, error.stack);
    throw error;
  }
}

// Helper function to check if current time is within a valid weather posting window
// Valid windows: 8:00-8:15 AM EST or 8:00-8:15 PM EST
function isWithinWeatherPostingWindow() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentHour = estTime.getHours();
  const currentMinute = estTime.getMinutes();
  
  // Morning window: 8:00-8:15 AM
  if (currentHour === 8 && currentMinute <= 15) {
    return { valid: true, window: 'morning' };
  }
  
  // Evening window: 8:00-8:15 PM (20:00-20:15)
  if (currentHour === 20 && currentMinute <= 15) {
    return { valid: true, window: 'evening' };
  }
  
  return { valid: false, window: null };
}

// ============================================================================
// ------------------- Weather Functions -------------------
// ============================================================================

// ------------------- Weather Helper Functions ------------------

async function postWeatherForVillage(client, village, checkExisting = false, isReminder = false) {
 try {
  if (checkExisting) {
   const existingWeather = await getWeatherWithoutGeneration(village);
   if (existingWeather && existingWeather.postedToDiscord) {
    logger.info('WEATHER', `Weather already exists and posted for ${village}, skipping post`);
    return true; // Weather already exists and was posted - this is a success state
   }
   if (existingWeather && !existingWeather.postedToDiscord) {
    logger.info('WEATHER', `Weather exists for ${village} but not posted, will post now`);
   }
  }

  logger.info('WEATHER', `Getting weather for ${village}...`);
  const weather = await getCurrentWeather(village);
  if (!weather) {
   logger.error('WEATHER', `Failed to get weather for ${village} - getCurrentWeather returned null/undefined`);
   return false;
  }

  const channelId = TOWNHALL_CHANNELS[village];
  if (!channelId) {
   logger.error('WEATHER', `No channel ID configured for ${village} in TOWNHALL_CHANNELS`);
   return false;
  }

  logger.info('WEATHER', `Looking up channel ${channelId} for ${village}...`);
  let channel = client.channels.cache.get(channelId);

  if (!channel) {
   logger.error('WEATHER', `Channel not found in cache: ${channelId} for ${village}. Attempting fetch...`);
   try {
    channel = await client.channels.fetch(channelId);
    if (!channel) {
     logger.error('WEATHER', `Channel ${channelId} does not exist for ${village}`);
     return false;
    }
    logger.info('WEATHER', `Successfully fetched channel ${channelId} for ${village}`);
   } catch (fetchError) {
    logger.error('WEATHER', `Failed to fetch channel ${channelId} for ${village}: ${fetchError.message}`);
    return false;
   }
  }

  logger.info('WEATHER', `Generating embed for ${village}...`);
  const title = isReminder ? `${village}'s Daily Weather Forecast Reminder` : undefined;
  const { embed, files } = await generateWeatherEmbed(village, weather, { title });
  
  logger.info('WEATHER', `Sending weather message to ${village} channel...`);
  await channel.send({ embeds: [embed], files });
  
  // Mark weather as posted to Discord (only for non-reminder posts to avoid overwriting)
  if (!isReminder && weather._id) {
   await Weather.updateOne(
    { _id: weather._id },
    { $set: { postedToDiscord: true, postedAt: new Date() } }
   );
   logger.info('WEATHER', `Marked weather as posted for ${village}`);
   
   // Apply weather damage if applicable (only once per weather period)
   try {
     await applyWeatherDamage(village, weather);
   } catch (damageError) {
     logger.error('WEATHER', `Error applying weather damage to ${village}: ${damageError.message}`);
     // Don't fail weather posting if damage application fails
   }
  }
  
  logger.success('WEATHER', `Successfully posted weather for ${village}${isReminder ? ' (reminder)' : ''}`);
  return true;
 } catch (error) {
  logger.error('WEATHER', `Error posting weather for ${village}: ${error.message}`, error.stack);
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
  const results = [];
  const weatherDataForNotifications = [];
  const isReminder = context === 'reminder';

  for (const village of villages) {
   try {
    const posted = await postWeatherForVillage(client, village, checkExisting, isReminder);
    if (posted) {
     postedCount++;
     results.push({ village, success: true });
     
     // Collect weather data for notifications (only for daily update, not backup checks or reminders)
     if ((context === 'update' || context === '') && !isReminder) {
      try {
       const weather = await getWeatherWithoutGeneration(village);
       if (weather) {
        // Determine weather type (special weather or normal)
        const weatherType = weather.special || weather.precipitation || 'Clear';
        weatherDataForNotifications.push({
          village: village,
          weather: weatherType,
          type: weatherType
        });
       }
      } catch (weatherError) {
       logger.warn('WEATHER', `Failed to get weather data for notifications for ${village}: ${weatherError.message}`);
      }
     }
    } else {
     results.push({ village, success: false, reason: 'postWeatherForVillage returned false' });
    }
   } catch (error) {
    results.push({ village, success: false, reason: error.message });
    logger.error('WEATHER', `Failed to post weather for ${village}: ${error.message}`);
   }
  }

  const failedVillages = results.filter(r => !r.success).map(r => r.village);
  const successVillages = results.filter(r => r.success).map(r => r.village);
  
  if (failedVillages.length > 0) {
   logger.error('WEATHER', `Failed to post weather for: ${failedVillages.join(', ')}`);
  }
  
  if (postedCount > 0) {
   logger.success('WEATHER', `Successfully processed ${postedCount}/${villages.length} villages${context ? ` (${context})` : ''}`);
   
   // Send daily weather notifications if this was a daily update
   if ((context === 'update' || context === '') && weatherDataForNotifications.length > 0) {
    try {
     await notificationService.sendDailyWeatherNotifications({
       villages: weatherDataForNotifications
     });
    } catch (notificationError) {
     logger.error('WEATHER', `Failed to send daily weather notifications: ${notificationError.message}`);
     // Don't throw - notification failures shouldn't break weather posting
    }
   }
  } else if (failedVillages.length === villages.length && villages.length > 0) {
   logger.error('WEATHER', `No weather posted - all villages failed${context ? ` (${context})` : ''}`);
  }

  return postedCount;
 } catch (error) {
  logger.error('WEATHER', `Process failed${context ? ` (${context})` : ''}`, error.message);
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

async function postWeatherReminder(client) {
 return await processWeatherForAllVillages(client, false, 'reminder');
}

async function checkAndPostWeatherIfNeeded(client) {
 try {
  const windowCheck = isWithinWeatherPostingWindow();
  
  if (!windowCheck.valid) {
   const now = new Date();
   const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
   const currentHour = estTime.getHours();
   const currentMinute = estTime.getMinutes();
   logger.info('WEATHER', `Backup check skipped - outside valid posting window (${currentHour}:${String(currentMinute).padStart(2, '0')} EST). Valid windows: 8:00-8:15 AM or 8:00-8:15 PM EST`);
   return 0;
  }
  
  logger.info('WEATHER', `Backup check within valid ${windowCheck.window} posting window, proceeding...`);
  return await processWeatherForAllVillages(client, true, 'backup check');
 } catch (error) {
  logger.error('WEATHER', 'Backup check failed');
  handleError(error, "scheduler.js", {
   commandName: 'checkAndPostWeatherIfNeeded'
  });
  return 0;
 }
}

async function checkAndPostWeatherOnRestart(client) {
 try {
  const windowCheck = isWithinWeatherPostingWindow();
  
  if (!windowCheck.valid) {
   const now = new Date();
   const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
   const currentHour = estTime.getHours();
   const currentMinute = estTime.getMinutes();
   logger.info('WEATHER', `Restart check skipped - outside valid posting window (${currentHour}:${String(currentMinute).padStart(2, '0')} EST). Valid windows: 8:00-8:15 AM or 8:00-8:15 PM EST`);
   return 0;
  }
  
  logger.info('WEATHER', `Restart check within valid ${windowCheck.window} posting window, proceeding...`);
  
  // Restart check with checkExisting=true will:
  // - Skip if weather exists and is already posted
  // - Post if weather exists but wasn't posted (catches missed posts)
  // - Generate and post if weather doesn't exist
  return await processWeatherForAllVillages(client, true, 'restart check');
 } catch (error) {
  logger.error('WEATHER', 'Restart check failed');
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

async function cleanupExpiredRaids(client = null) {
 try {
  const expiredRaids = await Raid.findExpiredRaids();
  
  if (expiredRaids.length === 0) {
   return { expiredCount: 0 };
  }
  
  logger.info('CLEANUP', `Found ${expiredRaids.length} expired raid(s)`);
  
  const { EmbedBuilder } = require('discord.js');
  let cleanedCount = 0;
  
  for (const raid of expiredRaids) {
   try {
    logger.info('RAID', `Processing ${raid.raidId} - ${raid.monster.name}`);
    
    // Mark raid as failed and KO all participants
    await raid.failRaid(client);
    
    // Send failure message if client is available
    if (client) {
     const failureEmbed = new EmbedBuilder()
       .setColor('#FF0000')
       .setTitle('💥 **Raid Failed!**')
       .setDescription(`The raid against **${raid.monster.name}** has failed!`)
       .addFields(
         {
           name: '__Monster Status__',
           value: `💙 **Hearts:** ${raid.monster.currentHearts}/${raid.monster.maxHearts}`,
           inline: false
         },
         {
           name: '__Participants__',
           value: (raid.participants && raid.participants.length > 0)
             ? raid.participants.map(p => `• **${p.name}** (${p.damage} hearts) - **KO'd**`).join('\n')
             : 'No participants',
           inline: false
         },
         {
           name: '__Failure__',
           value: (raid.participants && raid.participants.length > 0)
             ? `The raid timer expired! All participants have been knocked out! 💀`
             : `The monster caused havoc as no one defended the village from it and then ran off!`,
           inline: false
         }
       )
       .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
       .setFooter({ text: `Raid ID: ${raid.raidId}` })
       .setTimestamp();
     
     // Try to send to thread first, then channel
     let sent = false;
     if (raid.threadId) {
       try {
         const thread = await client.channels.fetch(raid.threadId);
         if (thread) {
           await thread.send({ embeds: [failureEmbed] });
           logger.info('RAID', `Failure message sent to thread`);
           sent = true;
         }
       } catch (threadError) {
         logger.error('RAID', 'Error sending to thread');
       }
     }
     
     if (!sent && raid.channelId) {
       try {
         const channel = await client.channels.fetch(raid.channelId);
         if (channel) {
           await channel.send({ embeds: [failureEmbed] });
           logger.info('RAID', `Failure message sent to channel`);
           sent = true;
         }
       } catch (channelError) {
         logger.error('RAID', 'Error sending to channel');
       }
     }
     
     if (!sent) {
       logger.warn('RAID', `No valid channel found for ${raid.raidId}`);
     }
    }
    
    cleanedCount++;
    logger.success('RAID', `Cleaned up ${raid.raidId}`);
    
   } catch (raidError) {
    logger.error('RAID', `Error cleaning up ${raid.raidId}`);
    handleError(raidError, "scheduler.js", {
     raidId: raid.raidId,
     functionName: 'cleanupExpiredRaids'
    });
   }
  }
  
  if (cleanedCount > 0) {
   logger.success('CLEANUP', `Raid cleanup - ${cleanedCount} expired`);
  }
  
  return { expiredCount: cleanedCount };
 } catch (error) {
  logger.error('CLEANUP', 'Error cleaning up expired raids');
  handleError(error, "scheduler.js");
  return { expiredCount: 0 };
 }
}

async function cleanupOldRuuGameSessions() {
 try {
  logger.info('CLEANUP', 'RuuGame cleanup');
  
  const result = await RuuGame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   return result;
  }
  
  logger.success('CLEANUP', `RuuGame cleanup - ${result.deletedCount} deleted`);
  
  if (result.finishedCount > 0) {
   logger.info('CLEANUP', `${result.finishedCount} completed games`);
  }
  if (result.expiredCount > 0) {
   logger.info('CLEANUP', `${result.expiredCount} expired sessions`);
  }
  
  return result;
 } catch (error) {
  logger.error('CLEANUP', 'Error cleaning up RuuGame sessions');
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0, expiredCount: 0 };
 }
}

async function cleanupFinishedMinigameSessions() {
 try {
  logger.info('CLEANUP', 'Minigame cleanup');
  
  const Minigame = require('../shared/models/MinigameModel');
  const result = await Minigame.cleanupOldSessions();
  
  if (result.deletedCount === 0) {
   return result;
  }
  
  logger.success('CLEANUP', `Minigame cleanup - ${result.deletedCount} deleted`);
  
  if (result.finishedCount > 0) {
   logger.info('CLEANUP', `${result.finishedCount} completed games`);
  }
  
  return result;
 } catch (error) {
  logger.error('CLEANUP', 'Error cleaning up Minigame sessions');
  handleError(error, "scheduler.js");
  return { deletedCount: 0, finishedCount: 0 };
 }
}

// ------------------- Combined Cleanup Functions ------------------

async function runDailyCleanupTasks(client) {
 try {
  logger.info('CLEANUP', 'Running daily cleanup tasks...');
  
  const results = await Promise.all([
   cleanupExpiredEntries(),
   cleanupExpiredHealingRequests(),
   checkExpiredRequests(client),
   cleanupExpiredBlightRequests(client),
   cleanupExpiredRaids(client),
   cleanupOldRuuGameSessions(),
   cleanupFinishedMinigameSessions(),
  ]);
  
  const blightResult = results[3];
  if (blightResult && typeof blightResult === 'object') {
   logger.success('CLEANUP', `Daily blight cleanup - Expired: ${blightResult.expiredCount}, Notified: ${blightResult.notifiedUsers}, Deleted: ${blightResult.deletedCount}`);
  }
  
  return results;
 } catch (error) {
  logger.error('CLEANUP', 'Error during daily cleanup', error);
  handleError(error, 'scheduler.js');
  return [];
 }
}

// ============================================================================
// ------------------- Nitro Boost Rewards Functions -------------------
// ============================================================================

async function distributeMonthlyBoostRewards(client) {
  logger.info('BOOST', 'Starting monthly Nitro boost reward distribution...');
  
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      logger.error('BOOST', 'Guild not found');
      return { success: false, error: 'Guild not found' };
    }

    // Fetch all members to ensure we have premium data
    await guild.members.fetch();
    
    // Get all members who are currently boosting
    const boosters = guild.members.cache.filter(member => member.premiumSince !== null);
    
    if (boosters.size === 0) {
      logger.info('BOOST', 'No active boosters found');
      return { success: true, rewardedCount: 0, totalTokens: 0 };
    }
    
    logger.info('BOOST', `Found ${boosters.size} active booster(s)`);
    
    const User = require('../shared/models/UserModel');
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let rewardedCount = 0;
    let totalTokensDistributed = 0;
    let alreadyRewardedCount = 0;
    let errorCount = 0;
    const rewardDetails = [];
    
    for (const [memberId, member] of boosters) {
      try {
        // Get or create user record
        const user = await User.getOrCreateUser(memberId);
        
        logger.info('BOOST', `Processing ${member.user.tag} - Checking boost status...`);
        
        // Give boost rewards (flat 1000 tokens for anyone boosting)
        const result = await user.giveBoostRewards();
        
        if (result.success) {
          rewardedCount++;
          totalTokensDistributed += result.tokensReceived;
          rewardDetails.push({
            userId: memberId,
            username: member.user.tag,
            tokensReceived: result.tokensReceived
          });
          
          logger.success('BOOST', `Rewarded ${member.user.tag} with ${result.tokensReceived} tokens for boosting`);
          
          // Send DM notification
          try {
            await member.send({
              content: `🎉 **Monthly Nitro Boost Reward!**\n\nThank you for boosting **Roots Of The Wild**!\n\n💎 You've received **${result.tokensReceived} tokens** for boosting the server this month.\n\n**New Balance:** ${result.newTokenBalance} tokens\n**Month:** ${currentMonth}\n\nYour support helps keep our server amazing! ✨`
            });
          } catch (dmError) {
            logger.warn('BOOST', `Could not send DM to ${member.user.tag} - user may have blocked DMs`);
          }
          
          // Send public announcement in boost rewards channel
          const boostAnnouncementChannelId = process.env.BOOST_ANNOUNCEMENT_CHANNEL || '651614266046152705';
          try {
            const announcementChannel = await client.channels.fetch(boostAnnouncementChannelId);
            if (announcementChannel) {
              const { EmbedBuilder } = require('discord.js');
              const announcementEmbed = new EmbedBuilder()
                .setColor('#ff73fa')
                .setTitle('💎 Nitro Boost Reward!')
                .setDescription(`Thank you for boosting **Roots Of The Wild**!`)
                .addFields(
                  { name: '🎉 Booster', value: `<@${memberId}>`, inline: false },
                  { name: '💰 Tokens Earned', value: `${result.tokensReceived} tokens`, inline: false },
                  { name: '📅 Month', value: currentMonth, inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                .setFooter({ text: 'Boost the server to earn 1000 tokens every month!' })
                .setTimestamp();
              
              await announcementChannel.send({
                content: `<@${memberId}>`,
                embeds: [announcementEmbed]
              });
              
              logger.info('BOOST', `Posted boost reward announcement for ${member.user.tag} in channel ${boostAnnouncementChannelId}`);
            }
          } catch (announcementError) {
            logger.error('BOOST', `Error posting boost reward announcement for ${member.user.tag}`, announcementError);
          }
        } else if (result.alreadyRewarded) {
          alreadyRewardedCount++;
          logger.info('BOOST', `${member.user.tag} already received boost rewards this month`);
        } else {
          errorCount++;
          logger.error('BOOST', `Failed to reward ${member.user.tag}: ${result.message}`);
        }
        
      } catch (error) {
        errorCount++;
        logger.error('BOOST', `Error processing boost reward for ${member.user.tag}`, error);
      }
    }
    
    // Send summary to a log channel if configured
    const logChannelId = process.env.BOOST_LOG_CHANNEL || process.env.MOD_LOG_CHANNEL;
    if (logChannelId) {
      try {
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel) {
          const { EmbedBuilder } = require('discord.js');
          const summaryEmbed = new EmbedBuilder()
            .setColor('#ff73fa')
            .setTitle('💎 Monthly Nitro Boost Rewards Distributed')
            .setDescription(`Automatic boost reward distribution completed for ${currentMonth}`)
            .addFields(
              { name: '✅ Rewarded', value: `${rewardedCount} booster(s)`, inline: true },
              { name: '💰 Total Tokens', value: `${totalTokensDistributed} tokens`, inline: true },
              { name: 'ℹ️ Already Rewarded', value: `${alreadyRewardedCount}`, inline: true },
              { name: '❌ Errors', value: `${errorCount}`, inline: true },
              { name: '📊 Total Boosters', value: `${boosters.size}`, inline: true },
              { name: '📅 Month', value: currentMonth, inline: true }
            )
            .setTimestamp();
          
          if (rewardDetails.length > 0) {
            const detailsText = rewardDetails
              .map(d => `• **${d.username}**: ${d.tokensReceived} tokens`)
              .join('\n');
            
            // Discord has a 1024 character limit per field, so split if needed
            if (detailsText.length <= 1024) {
              summaryEmbed.addFields({ name: '📋 Rewards Given', value: detailsText, inline: false });
            } else {
              summaryEmbed.addFields({ 
                name: '📋 Rewards Given', 
                value: `${rewardDetails.length} users rewarded (too many to list)`, 
                inline: false 
              });
            }
          }
          
          await logChannel.send({ embeds: [summaryEmbed] });
        }
      } catch (logError) {
        logger.error('BOOST', 'Error sending boost reward summary to log channel', logError);
      }
    }
    
    logger.success('BOOST', `Boost reward distribution completed - Rewarded: ${rewardedCount}, Already Rewarded: ${alreadyRewardedCount}, Errors: ${errorCount}, Total Tokens: ${totalTokensDistributed}`);
    
    return {
      success: true,
      rewardedCount,
      alreadyRewardedCount,
      errorCount,
      totalTokens: totalTokensDistributed,
      totalBoosters: boosters.size
    };
    
  } catch (error) {
    logger.error('BOOST', 'Error during boost reward distribution', error);
    handleError(error, 'scheduler.js', {
      commandName: 'distributeMonthlyBoostRewards'
    });
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// ------------------- Birthday Functions -------------------
// ============================================================================

// Birthday role IDs
const BIRTHDAY_ROLE_ID = '658152196642308111';
const MOD_BIRTHDAY_ROLE_ID = '1095909468941864990';
const BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID = '606004354419392513';

async function handleBirthdayRoleAssignment(client) {
  logger.info('SCHEDULER', 'Starting birthday role assignment check...');
  
  try {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = estNow.toISOString().slice(5, 10); // MM-DD format
    const month = estNow.getMonth() + 1;
    const day = estNow.getDate();
    
    logger.info('SCHEDULER', `Checking for birthdays on ${today} (EST: ${estNow.toLocaleString()})`);
    
    // Get all users with birthdays today
    const User = require('../shared/models/UserModel');
    const usersWithBirthdays = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    if (usersWithBirthdays.length === 0) {
      logger.info('SCHEDULER', 'No users have birthdays today');
      return;
    }
    
    logger.info('BIRTHDAY', `Found ${usersWithBirthdays.length} users with birthdays today`);
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      logger.error('BIRTHDAY', 'Guild not found');
      return;
    }
    
    // Get the birthday roles
    const birthdayRole = guild.roles.cache.get(BIRTHDAY_ROLE_ID);
    const modBirthdayRole = guild.roles.cache.get(MOD_BIRTHDAY_ROLE_ID);
    
    if (!birthdayRole && !modBirthdayRole) {
      logger.error('BIRTHDAY', 'Birthday roles not found');
      return;
    }
    
    let assignedCount = 0;
    const birthdayUsers = [];
    
    for (const user of usersWithBirthdays) {
      try {
        const member = await guild.members.fetch(user.discordId);
        if (!member) {
          logger.warn('BIRTHDAY', `Member ${user.discordId} not found in guild`);
          continue;
        }
        
        // Check if user is a mod (has mod permissions or specific mod roles)
        const isMod = member.permissions.has('ManageMessages') || 
                      member.permissions.has('Administrator') ||
                      member.roles.cache.some(role => role.name.toLowerCase().includes('mod') || role.name.toLowerCase().includes('admin'));
        
        const roleToAssign = isMod ? modBirthdayRole : birthdayRole;
        
        if (!roleToAssign) {
          logger.warn('BIRTHDAY', `Role not found for ${isMod ? 'mod' : 'regular'} user ${member.user.tag}`);
          continue;
        }
        
        // Remove any existing birthday roles first
        if (member.roles.cache.has(BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(BIRTHDAY_ROLE_ID);
        }
        if (member.roles.cache.has(MOD_BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(MOD_BIRTHDAY_ROLE_ID);
        }
        
        // Assign the appropriate role
        await member.roles.add(roleToAssign);
        assignedCount++;
        birthdayUsers.push({
          user: member.user,
          isMod: isMod,
          roleName: roleToAssign.name
        });
        
        logger.success('BIRTHDAY', `Assigned ${roleToAssign.name} to ${member.user.tag} (${isMod ? 'mod' : 'regular'})`);
        
      } catch (error) {
        logger.error('BIRTHDAY', `Error assigning birthday role to user ${user.discordId}`, error);
      }
    }
    
    // Send birthday announcements if there are birthday users
    if (birthdayUsers.length > 0) {
      await sendBirthdayAnnouncements(client, birthdayUsers);
    }
    
    logger.success('BIRTHDAY', `Birthday role assignment completed - ${assignedCount} roles assigned`);
    
  } catch (error) {
    logger.error('BIRTHDAY', 'Error in birthday role assignment', error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleAssignment'
    });
  }
}

async function sendBirthdayAnnouncements(client, birthdayUsers) {
  try {
    const announcementChannel = client.channels.cache.get(BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID);
    if (!announcementChannel) {
      logger.error('BIRTHDAY', 'Birthday announcement channel not found');
      return;
    }
    
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const realWorldDate = estNow.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
    });
    const hyruleanDate = convertToHyruleanDate(estNow);
    
    // Create birthday messages
    const birthdayMessages = [
      "May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way!",
      "On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding!",
      "As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace!",
    ];
    
    for (const birthdayUser of birthdayUsers) {
      try {
        const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
        
        const embed = new EmbedBuilder()
          .setColor("#FF709B")
          .setTitle(`🎉 Happy Birthday, ${birthdayUser.user.displayName}! 🎉`)
          .setDescription(`${randomMessage}\n\n🎂 **It's ${birthdayUser.user.displayName}'s birthday today!** 🎂`)
          .addFields(
            { 
              name: "📅 Real-World Date", 
              value: realWorldDate, 
              inline: true 
            },
            { 
              name: "🗓️ Hyrulean Date", 
              value: hyruleanDate, 
              inline: true 
            },
            {
              name: "🎁 Special Birthday Features",
              value: `• **Birthday role** assigned: ${birthdayUser.roleName}\n• **Birthday rewards** available with \`/birthday claim\`\n• **1500 tokens OR 75% shop discount**`,
              inline: false
            }
          )
          .setThumbnail(birthdayUser.user.displayAvatarURL({ dynamic: true }))
          .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
          .setFooter({ 
            text: `Happy Birthday, ${birthdayUser.user.displayName}! 🎂`,
            icon_url: client.user.displayAvatarURL()
          })
          .setTimestamp();
        
        // Send @everyone announcement
        await announcementChannel.send({
          content: `@everyone 🎉 **It's ${birthdayUser.user.displayName}'s birthday today!** 🎉`,
          embeds: [embed]
        });
        
        logger.info('BIRTHDAY', `Sent birthday announcement for ${birthdayUser.user.displayName}`);
        
      } catch (error) {
        logger.error('BIRTHDAY', `Error sending birthday announcement for ${birthdayUser.user.displayName}`, error);
      }
    }
    
  } catch (error) {
    logger.error('BIRTHDAY', 'Error in birthday announcements', error);
    handleError(error, "scheduler.js", {
      commandName: 'sendBirthdayAnnouncements'
    });
  }
}

async function handleBirthdayRoleRemoval(client) {
  logger.info('CLEANUP', 'Starting birthday role cleanup...');
  
  try {
    // Calculate yesterday's date in EST timezone
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const yesterday = new Date(estNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMonth = yesterday.getMonth() + 1;
    const yesterdayDay = yesterday.getDate();
    const yesterdayDateStr = yesterday.toISOString().slice(5, 10); // MM-DD format
    
    logger.info('CLEANUP', `Removing birthday roles from users whose birthday was yesterday (${yesterdayDateStr})`);
    
    // Get all users whose birthday was yesterday
    const User = require('../shared/models/UserModel');
    const usersWithBirthdaysYesterday = await User.find({
      'birthday.month': yesterdayMonth,
      'birthday.day': yesterdayDay
    });
    
    if (usersWithBirthdaysYesterday.length === 0) {
      logger.info('CLEANUP', 'No users had birthdays yesterday, nothing to clean up');
      return;
    }
    
    logger.info('CLEANUP', `Found ${usersWithBirthdaysYesterday.length} users whose birthday was yesterday`);
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      logger.error('CLEANUP', 'Guild not found');
      return;
    }
    
    // Get the birthday roles
    const birthdayRole = guild.roles.cache.get(BIRTHDAY_ROLE_ID);
    const modBirthdayRole = guild.roles.cache.get(MOD_BIRTHDAY_ROLE_ID);
    
    if (!birthdayRole && !modBirthdayRole) {
      logger.error('CLEANUP', 'Birthday roles not found');
      return;
    }
    
    let removedCount = 0;
    
    // Remove roles only from users whose birthday was yesterday
    for (const user of usersWithBirthdaysYesterday) {
      try {
        const member = await guild.members.fetch(user.discordId).catch(() => null);
        if (!member) {
          logger.warn('CLEANUP', `Member ${user.discordId} not found in guild`);
          continue;
        }
        
        // Remove regular birthday role if present
        if (birthdayRole && member.roles.cache.has(BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(BIRTHDAY_ROLE_ID);
          removedCount++;
          logger.info('CLEANUP', `Removed birthday role from ${member.user.tag} (birthday was yesterday)`);
        }
        
        // Remove mod birthday role if present
        if (modBirthdayRole && member.roles.cache.has(MOD_BIRTHDAY_ROLE_ID)) {
          await member.roles.remove(MOD_BIRTHDAY_ROLE_ID);
          removedCount++;
          logger.info('CLEANUP', `Removed mod birthday role from ${member.user.tag} (birthday was yesterday)`);
        }
        
      } catch (error) {
        logger.error('CLEANUP', `Error removing birthday role from user ${user.discordId}`, error);
      }
    }
    
    logger.success('CLEANUP', `Birthday role cleanup completed - ${removedCount} roles removed from ${usersWithBirthdaysYesterday.length} users whose birthday was yesterday`);
    
  } catch (error) {
    logger.error('CLEANUP', 'Error in birthday role cleanup', error);
    handleError(error, "scheduler.js", {
      commandName: 'handleBirthdayRoleRemoval'
    });
  }
}

async function executeBirthdayAnnouncements(client) {
 logger.info('SCHEDULER', 'Starting birthday announcement check...');
 
 const now = new Date();
 const estNow = new Date(
  now.toLocaleString("en-US", { timeZone: "America/New_York" })
 );
 const today = estNow.toISOString().slice(5, 10);
 const guildIds = [process.env.GUILD_ID];
 
 logger.info('SCHEDULER', `Checking for birthdays on ${today} (EST: ${estNow.toLocaleString()})`);

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
  logger.info('SCHEDULER', `Guild ID: ${guildId}, Birthday Channel ID: ${birthdayChannelId}`);
  
  if (!birthdayChannelId) {
   logger.error('BIRTHDAY', `No birthday channel ID found for guild ${guildId}`);
   continue;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
   logger.error('BIRTHDAY', `Guild ${guildId} not found in cache`);
   continue;
  }

  const announcementChannel = guild.channels.cache.get(birthdayChannelId);
  if (!announcementChannel) {
   logger.error('BIRTHDAY', `Birthday channel ${birthdayChannelId} not found in guild ${guildId}`);
   continue;
  }

  logger.success('SCHEDULER', `Found birthday channel: ${announcementChannel.name} (${birthdayChannelId})`);
  
  const characters = await Character.find({ birthday: today });
  logger.info('SCHEDULER', `Found ${characters.length} characters with birthday on ${today}`);
  
  // Also check for mod characters with birthdays
  const ModCharacter = require('../shared/models/ModCharacterModel');
  const modCharacters = await ModCharacter.find({ birthday: today });
  logger.info('SCHEDULER', `Found ${modCharacters.length} mod characters with birthday on ${today}`);
  
  if (characters.length > 0) {
   logger.info('BIRTHDAY', `Characters with birthdays today: ${characters.map(c => `${c.name} (${c.birthday})`).join(', ')}`);
  } else {
   // Debug: Check if there are any characters with birthdays at all
   const allCharactersWithBirthdays = await Character.find({ birthday: { $exists: true, $ne: null } });
   logger.debug('SCHEDULER', `Total characters with birthdays: ${allCharactersWithBirthdays.length}`);
   if (allCharactersWithBirthdays.length > 0) {
    logger.debug('SCHEDULER', `Sample birthday formats: ${allCharactersWithBirthdays.slice(0, 5).map(c => `${c.name}: ${c.birthday}`).join(', ')}`);
   }
  }
  
  if (modCharacters.length > 0) {
   logger.info('BIRTHDAY', `Mod characters with birthdays today: ${modCharacters.map(c => `${c.name} (${c.birthday})`).join(', ')}`);
  }

  for (const character of characters) {
   try {
    const user = await client.users.fetch(character.userId);
    const randomMessage =
     birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

    // Give character a random birthday gift (1% chance for Spirit Orb, 99% chance for cake)
    const isLuckyRoll = Math.random() < 0.01; // 1% chance
    let giftItemName = '';
    let giftGiven = null;
    let isRareGift = false;

    if (isLuckyRoll) {
      giftItemName = 'Spirit Orb';
      isRareGift = true;
    } else {
      const cakeOptions = ['Carrot Cake', 'Monster Cake', 'Nut Cake', 'Fruit Cake'];
      giftItemName = cakeOptions[Math.floor(Math.random() * cakeOptions.length)];
    }

    try {
      // Connect to inventories database
      await connectToInventories();
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      
      // Check if the gift item exists in the ItemModel
      const giftItem = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${giftItemName}$`, 'i') } });
      
      if (giftItem) {
        const currentDate = new Date();
        const itemLocation = character.currentVillage || character.homeVillage || "Unknown";
        
        // Check if character already has this item in inventory
        const existingItem = await inventoryCollection.findOne({
          characterId: character._id,
          itemName: { $regex: new RegExp(`^${giftItemName}$`, 'i') }
        });

        if (existingItem) {
          // Increment quantity
          await inventoryCollection.updateOne(
            { _id: existingItem._id },
            { $inc: { quantity: 1 } }
          );
        } else {
          // Insert new gift item with metadata from database
          await inventoryCollection.insertOne({
            characterId: character._id,
            itemName: giftItem.itemName,
            itemId: giftItem._id,
            quantity: 1,
            category: Array.isArray(giftItem.category) ? giftItem.category.join(", ") : giftItem.category,
            type: Array.isArray(giftItem.type) ? giftItem.type.join(", ") : giftItem.type,
            subtype: Array.isArray(giftItem.subtype) ? giftItem.subtype.join(", ") : giftItem.subtype,
            location: itemLocation,
            date: currentDate,
            obtain: "Gift",
            synced: ""
          });
        }
        
        giftGiven = giftItem.itemName;
        
        if (isRareGift) {
          logger.info('BIRTHDAY', `✨🎁 RARE! ${character.name} got a ${giftItem.itemName} for their birthday! (1% chance)`);
        } else {
          logger.info('BIRTHDAY', `🎂 Gave ${character.name} a ${giftItem.itemName} for their birthday`);
        }

        // Log to Google Sheets if character has inventory URL
        if (character.inventory) {
          try {
            const spreadsheetId = extractSpreadsheetId(character.inventory);
            if (spreadsheetId) {
              const sheetRow = [
                character.name,
                giftItem.itemName,
                1, // quantity
                Array.isArray(giftItem.category) ? giftItem.category.join(", ") : giftItem.category,
                Array.isArray(giftItem.type) ? giftItem.type.join(", ") : giftItem.type,
                Array.isArray(giftItem.subtype) ? giftItem.subtype.join(", ") : giftItem.subtype,
                "Gift", // obtain
                "", // job
                "", // perk
                itemLocation,
                isRareGift ? "Birthday Gift (RARE - 1%!)" : "Birthday Gift", // link/description
                currentDate.toISOString(),
                uuidv4() // Confirmed Sync ID
              ];

              await safeAppendDataToSheet(
                character.inventory,
                character,
                'loggedInventory!A:M',
                [sheetRow],
                null,
                { skipValidation: true, context: { commandName: 'birthday', userTag: 'System', userId: character.userId } }
              );
              
              logger.info('BIRTHDAY', `📝 Logged birthday gift to ${character.name}'s inventory sheet`);
            }
          } catch (sheetError) {
            logger.warn('BIRTHDAY', `Failed to log gift to sheet for ${character.name}`, sheetError.message);
            // Don't throw - sheet logging is not critical
          }
        }
      } else {
        logger.warn('BIRTHDAY', `Gift item "${giftItemName}" not found in database`);
      }
    } catch (giftError) {
      logger.error('BIRTHDAY', `Error giving birthday gift to ${character.name}`, giftError.message);
    }

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

    // Add gift field if gift was successfully given
    if (giftGiven) {
      if (isRareGift) {
        embed.addFields({
          name: "✨ **RARE BIRTHDAY GIFT!** ✨",
          value: `> 🎊 **WOW!** ${character.name} received a **${giftGiven}**! (1% chance!) 🎊`,
          inline: false
        });
      } else {
        embed.addFields({
          name: "🎁 Birthday Gift",
          value: `> ${character.name} received a **${giftGiven}**!`,
          inline: false
        });
      }
    }

    await announcementChannel.send({ embeds: [embed] });
    announcedCount++;
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('BIRTHDAY', `Failed to announce birthday for ${character.name}`, error.message);
   }
  }

  // Process mod character birthdays
  for (const modCharacter of modCharacters) {
   try {
    const user = await client.users.fetch(modCharacter.userId);
    const randomMessage =
     birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

    const embed = new EmbedBuilder()
     .setColor("#FF709B")
     .setTitle(`Happy Birthday, ${modCharacter.name}!`)
     .setDescription(`${randomMessage}\n\n✨ **${modCharacter.modTitle} of ${modCharacter.modType}** ✨`)
     .addFields(
      { name: "Real-World Date", value: realWorldDate, inline: true },
      { name: "Hyrulean Date", value: hyruleanDate, inline: true },
      { name: "👑 Mod Character", value: `> **${modCharacter.modTitle} of ${modCharacter.modType}**`, inline: false }
     )
     .setThumbnail(modCharacter.icon)
     .setImage("https://storage.googleapis.com/tinglebot/Graphics/bday.png")
     .setFooter({ text: `${modCharacter.name} belongs to ${user.username}!` })
     .setTimestamp();

    await announcementChannel.send({ embeds: [embed] });
    announcedCount++;
    logger.info('BIRTHDAY', `🎂👑 Announced birthday for mod character ${modCharacter.name}`);
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('BIRTHDAY', `Failed to announce birthday for mod character ${modCharacter.name}`, error.message);
   }
  }
 }

 if (announcedCount > 0) {
  logger.success('BIRTHDAY', `Announced ${announcedCount} birthdays`);
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
 const jailDurationMs = character.jailDurationMs;
 const jailBoostSource = character.jailBoostSource;
 const wasBoostedRelease = typeof jailDurationMs === 'number' && jailDurationMs > 0 && jailDurationMs < DEFAULT_JAIL_DURATION_MS;
 const servedDays = jailDurationMs ? Math.max(1, Math.round(jailDurationMs / (24 * 60 * 60 * 1000))) : 3;
 const boostDetails = wasBoostedRelease ? {
  boosterJob: 'Priest',
  boosterName: jailBoostSource || 'Priest Ally',
  boostName: 'Merciful Sentence',
  boostFlavorText: generateBoostFlavorText('Priest', 'Stealing'),
 } : null;

 let description = `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`;
description = addBoostFlavorText(description, boostDetails);

 const releaseEmbed = new EmbedBuilder()
  .setColor("#88cc88")
  .setTitle("Town Hall Proclamation")
  .setDescription(description)
  .addFields(
   { name: '⏳ Time Served', value: `> ${servedDays} day${servedDays !== 1 ? 's' : ''}`, inline: true }
  )
  .setThumbnail(isValidImageUrl(character.icon) ? character.icon : DEFAULT_IMAGE_URL)
  .setImage(DEFAULT_IMAGE_URL)
  .setFooter({ text: buildFooterText("Town Hall Records • Reformed & Released", character, boostDetails) })
  .setTimestamp();

 // Release character using shared function
 await releaseFromJail(character);

  // Post announcement in character's current village town hall channel
  try {
   const villageChannelId = getVillageChannelId(character.currentVillage);
   const villageChannel = await client.channels.fetch(villageChannelId);
   
   if (villageChannel) {
    await villageChannel.send({
    content: `<@${character.userId}>, your character **${character.name}** has been released from jail.${wasBoostedRelease ? ' They were granted early release thanks to a Priest\'s Merciful Sentence.' : ''}`,
     embeds: [releaseEmbed],
    });
    releasedCount++;
    logger.info('JOB', `Posted jail release for ${character.name} in ${character.currentVillage} town hall`);
   } else {
    logger.error('JOB', `Could not find town hall channel for ${character.currentVillage} (ID: ${villageChannelId})`);
   }
  } catch (error) {
   logger.error('JOB', `Error posting jail release for ${character.name} in ${character.currentVillage}`, error.message);
  }

  const dmSent = await sendUserDM(
   character.userId,
 `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail.${wasBoostedRelease ? `\n✨ ${boostDetails.boostFlavorText}` : '\nRemember, a fresh start awaits you!'}`,
   client
  );
  
  if (!dmSent) {
    logger.info('JOB', `Could not send jail release DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
  }
 }

 if (releasedCount > 0) {
  logger.success('JOB', `Released ${releasedCount} characters from jail`);
 }
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

      // Send notification via notification service (checks user preferences)
      try {
        await notificationService.sendDebuffEndNotification(character.userId, {
          name: character.name
        });
      } catch (error) {
        logger.error('CLEANUP', `Error sending debuff end notification for ${character.name}: ${error.message}`);
        // Fallback to direct DM if notification service fails
        const dmSent = await sendUserDM(
          character.userId,
          `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`,
          client
        );
        
        if (!dmSent) {
          logger.info('CLEANUP', `Could not send debuff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
        }
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
    logger.info('CLEANUP', `Expiring buffs for ${charactersWithActiveBuffs.length} characters`);
    
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
        logger.info('CLEANUP', `Could not send buff expiry DM to user ${character.userId} for ${character.name} - user may have blocked DMs`);
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
   logger.success('CLEANUP', `Reset daily rolls for ${resetCount} characters`);
  }
 } catch (error) {
  handleError(error, "scheduler.js");
  logger.error('CLEANUP', 'Failed to reset daily rolls', error.message);
 }
}

async function resetPetLastRollDates(client) {
 try {
  const result = await Pet.updateMany(
   { status: "active" },
   { $set: { lastRollDate: null } }
  );
  if (result.modifiedCount > 0) {
   logger.success('SCHEDULER', `Reset lastRollDate for ${result.modifiedCount} pets`);
  }
 } catch (error) {
  handleError(error, "scheduler.js");
  logger.error('CLEANUP', 'Failed to reset pet lastRollDates', error.message);
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
   logger.error('BLIGHT', 'Blight roll call failed', error.message);
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
      logger.info('BLIGHT', 'Starting blight request cleanup');
      const result = await cleanupExpiredBlightRequests(client);
      logger.success('BLIGHT', `Blight cleanup complete - Expired: ${result.expiredCount}, Notified: ${result.notifiedUsers}, Deleted: ${result.deletedCount}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      logger.error('BLIGHT', 'Error during blight cleanup', error);
    }
  }
 );

 createCronJob(
  "0 */12 * * *",
  "Check Expiring Blight Requests",
  async () => {
    try {
      logger.info('BLIGHT', 'Running blight expiration warning check');
      const result = await checkExpiringBlightRequests(client);
      logger.success('BLIGHT', `Blight warning check complete - Warned: ${result.warnedUsers}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      logger.error('BLIGHT', 'Error during blight warning check', error);
    }
  }
 );

 createCronJob(
  "0 */4 * * *",
  "Send Blight Reminders",
  async () => {
    try {
      logger.info('BLIGHT', 'Running comprehensive blight reminder check');
      const result = await sendBlightReminders(client);
      logger.info('BLIGHT', `Reminder check complete - Death: ${result.deathWarnings}, Healing: ${result.healingWarnings}`);
    } catch (error) {
      handleError(error, 'scheduler.js');
      logger.error('BLIGHT', 'Error during blight reminder check', error);
    }
  }
 );

 // Periodic check to ensure blight ping was sent (fallback mechanism)
 // Runs every hour to catch any missed pings
 createCronJob(
  "0 * * * *",
  "Check Missed Blight Ping",
  async () => {
    try {
      await checkAndPostMissedBlightPing(client);
    } catch (error) {
      handleError(error, 'scheduler.js');
      logger.error('BLIGHT', 'Error during missed blight ping check', error.message);
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
   logger.info('CLEANUP', 'Starting boost cleanup');
   
   // Clean up old file-based boosting requests
   const stats = cleanupExpiredBoostingRequests();
   
   // Clean up TempData boosting requests
   const TempData = require('../shared/models/TempDataModel');
   const tempDataResult = await TempData.cleanupByType('boosting');
   
   logger.success('CLEANUP', `Boost cleanup complete - Expired requests: ${stats.expiredRequests}, Expired boosts: ${stats.expiredBoosts}, TempData boosting deleted: ${tempDataResult.deletedCount || 0}`);
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Error during boost cleanup', error);
  }
 });

 createCronJob("0 2 * * 0", "Weekly Boost Archive", async () => {
  try {
   logger.info('CLEANUP', 'Running weekly boost archive');
   const stats = archiveOldBoostingRequests(30);
   logger.success('CLEANUP', `Archive complete - Archived: ${stats.archived}, Remaining: ${stats.remaining}`);
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Error during weekly archive', error);
  }
 });

 createCronJob("0 0 * * *", "Daily Boost Statistics", async () => {
  try {
   const stats = getBoostingStatistics();
   logger.info('CLEANUP', 'Daily boost statistics', stats);
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Error getting boost statistics', error);
  }
 });

 // Additional cleanup every 6 hours for TempData boosting requests
 createCronJob("0 */6 * * *", "TempData Boost Cleanup", async () => {
  try {
   logger.info('CLEANUP', 'Starting TempData boost cleanup');
   const TempData = require('../shared/models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   if (result.deletedCount > 0) {
     logger.success('CLEANUP', `TempData boost cleanup complete - Deleted: ${result.deletedCount}`);
   }
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Error during TempData boost cleanup', error);
  }
 });

 // Hourly cleanup for boosting data to ensure expired boosts are removed quickly
 createCronJob("0 * * * *", "Hourly Boost Cleanup", async () => {
  try {
   logger.info('CLEANUP', 'Starting hourly boost cleanup');
   const TempData = require('../shared/models/TempDataModel');
   const result = await TempData.cleanupByType('boosting');
   if (result.deletedCount > 0) {
     logger.success('CLEANUP', `Hourly boost cleanup complete - Deleted: ${result.deletedCount}`);
   }
  } catch (error) {
   handleError(error, "scheduler.js");
   logger.error('CLEANUP', 'Error during hourly boost cleanup', error);
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
 
 // Weather reminder at 8:00pm EST (1:00am UTC during EST, 12:00am UTC during EDT)
 createCronJob("0 20 * * *", "Daily Weather Forecast Reminder", () =>
  postWeatherReminder(client),
  "America/New_York"
 );
 
 // Backup weather reminder check at 8:15pm EST to ensure reminder was posted
 createCronJob("15 20 * * *", "Backup Weather Reminder Check", () =>
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
    logger.error('QUEST', 'Error during midnight quest generation', error);
  }
}

async function handleQuestExpirationAtMidnight(client = null) {
  try {
    logger.info('SCHEDULER', 'Midnight quest expiration check starting...');
    
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
      logger.info('SCHEDULER', 'No quests to expire from yesterday');
      return;
    }
    
    logger.info('SCHEDULER', `Found ${expiredQuests.length} quests to mark as expired`);
    
    let updatedCount = 0;
    for (const quest of expiredQuests) {
      try {
        await updateQuestEmbed(client, quest);
        updatedCount++;
        logger.success('SCHEDULER', `Updated expired quest embed for ${quest.village} (${quest.questId})`);
      } catch (error) {
        logger.error('QUEST', `Failed to update expired quest embed for ${quest.questId}`, error);
      }
    }
    
    logger.success('SCHEDULER', `Quest expiration completed - ${updatedCount}/${expiredQuests.length} quests updated`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'handleQuestExpirationAtMidnight'
    });
    logger.error('QUEST', 'Error during quest expiration check', error);
  }
}

// ============================================================================
// ------------------- Function: checkQuestCompletions -------------------
// Checks all active quests for completion using unified system
// ============================================================================
async function checkQuestCompletions(client) {
  try {
    logger.info('QUEST', 'Checking quest completions...');
    
    const Quest = require('../shared/models/QuestModel');
    const questRewardModule = require('./modules/questRewardModule');
    
    const activeQuests = await Quest.find({ status: 'active' });
    
    if (activeQuests.length === 0) {
      logger.info('QUEST', 'No active quests to check');
      return;
    }
    
    if (activeQuests.length > 0) {
      logger.info('SCHEDULER', `Found ${activeQuests.length} active quests to check`);
    }
    
    let completedCount = 0;
    let processedCount = 0;
    
    for (const quest of activeQuests) {
      try {
        const completionResult = await quest.checkAutoCompletion(true); // Force check for scheduler
        
        if (completionResult.completed && completionResult.needsRewardProcessing) {
          completedCount++;
          logger.success('QUEST', `Quest "${quest.title}" completed: ${completionResult.reason}`);
          
          // Distribute rewards if quest was completed
          if (completionResult.reason === 'all_participants_completed' || completionResult.reason === 'time_expired') {
            await questRewardModule.processQuestCompletion(quest.questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
          }
        } else if (completionResult.completed) {
          logger.info('QUEST', `Quest "${quest.title}" already processed: ${completionResult.reason}`);
        }
        
        processedCount++;
      } catch (error) {
        logger.error('QUEST', `Error checking quest ${quest.questID}`, error);
      }
    }
    
    if (completedCount > 0 || processedCount > 0) {
      logger.success('SCHEDULER', `Quest completion check finished - ${completedCount} completed, ${processedCount} processed`);
    }
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkQuestCompletions'
    });
    logger.error('QUEST', 'Error during quest completion check', error);
  }
}

// ============================================================================
// ------------------- Function: checkVillageTracking -------------------
// Checks village locations for all active RP quest participants
// ============================================================================
async function checkVillageTracking(client) {
  try {
    logger.info('SCHEDULER', 'Starting village tracking check...');
    
    const Quest = require('../shared/models/QuestModel');
    
    // Find all active RP quests
    const activeRPQuests = await Quest.find({ 
      status: 'active', 
      questType: 'RP',
      requiredVillage: { $exists: true, $ne: null }
    });
    
    if (activeRPQuests.length === 0) {
      logger.info('SCHEDULER', 'No active RP quests with village requirements to check');
      return;
    }
    
    logger.info('QUEST', `Found ${activeRPQuests.length} active RP quests with village requirements`);
    
    let totalChecked = 0;
    let totalDisqualified = 0;
    
    for (const quest of activeRPQuests) {
      try {
        logger.info('QUEST', `Checking village locations for quest "${quest.title}" (${quest.questID})`);
        
        const villageCheckResult = await quest.checkAllParticipantsVillages();
        totalChecked += villageCheckResult.checked;
        totalDisqualified += villageCheckResult.disqualified;
        
        if (villageCheckResult.disqualified > 0) {
          logger.warn('QUEST', `Disqualified ${villageCheckResult.disqualified} participants from quest "${quest.title}" for village violations`);
          
          // Check if quest should be completed after disqualifications
          const completionResult = await quest.checkAutoCompletion(true);
          if (completionResult.completed && completionResult.needsRewardProcessing) {
            logger.success('QUEST', `Quest "${quest.title}" completed after village disqualifications: ${completionResult.reason}`);
            
            // Distribute rewards if quest was completed
            const questRewardModule = require('./modules/questRewardModule');
            await questRewardModule.processQuestCompletion(quest.questID);
            await quest.markCompletionProcessed();
          }
        }
        
        // Save quest after village checks
        await quest.save();
        
      } catch (error) {
        logger.error('QUEST', `Error checking village locations for quest ${quest.questID}`, error);
      }
    }
    
    logger.success('QUEST', `Village tracking check completed - ${totalChecked} participants checked, ${totalDisqualified} disqualified`);
    
  } catch (error) {
    handleError(error, 'scheduler.js', {
      commandName: 'checkVillageTracking'
    });
    logger.error('QUEST', 'Error during village tracking check', error);
  }
}

// ------------------- Quest Posting Helper Functions ------------------

async function handleEscortQuestWeather(quest) {
  if (quest.type === 'escort') {
    const travelBlocked = await isTravelBlockedByWeather(quest.village);
    if (travelBlocked) {
      logger.info('QUEST', `Regenerating escort quest ${quest.questId} for ${quest.village} due to travel-blocking weather`);
      try {
        await regenerateEscortQuest(quest);
        logger.success('QUEST', `Successfully regenerated quest ${quest.questId} as ${quest.type} quest`);
        return true;
      } catch (error) {
        logger.error('QUEST', `Failed to regenerate escort quest ${quest.questId}`, error);
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
      logger.error('QUEST', `Could not fetch channel for ${quest.village} (ID: ${villageChannelId})`);
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
      logger.success('QUEST', `Posted quest ${quest.questId} for ${quest.village}${context}`);
      return true;
    } else {
      logger.info('QUEST', `Quest ${quest.questId} was already posted by another process, skipping`);
      return false;
    }
  } catch (error) {
    logger.error('QUEST', `Error posting quest ${quest.questId}`, error);
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
      logger.info('SCHEDULER', 'No missed quests to post during startup');
      return 0;
    }
    
    // Regenerate art and writing quests if it's after 12pm EST
    let processedQuests = unpostedQuests;
    if (isAfterNoon) {
      const artWritingQuests = unpostedQuests.filter(quest => quest.type === 'art' || quest.type === 'writing');
      if (artWritingQuests.length > 0) {
        logger.info('QUEST', `After 12pm EST (${currentHour}:00) - Regenerating ${artWritingQuests.length} art/writing quest(s) to ensure adequate completion time`);
        
        // Regenerate each art/writing quest
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
      logger.info('SCHEDULER', 'No missed quests to post during startup');
      return 0;
    }
    
    const shuffledQuests = processedQuests.sort(() => Math.random() - 0.5);
    let posted = 0;
    let skippedNoTime = 0;
    let skippedInvalidFormat = 0;
    
    for (const quest of shuffledQuests) {
      const scheduledTime = quest.scheduledPostTime;
      if (!scheduledTime) {
        skippedNoTime++;
        logger.warn('QUEST', `Skipping quest ${quest.questId} for ${quest.village}: missing scheduledPostTime. This indicates a quest generation error.`);
        continue;
      }
      
      const parts = scheduledTime.split(' ');
      if (parts.length !== 5) {
        skippedInvalidFormat++;
        logger.warn('QUEST', `Skipping quest ${quest.questId} for ${quest.village}: invalid scheduledPostTime format "${scheduledTime}". Expected cron format.`);
        continue;
      }
      
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
      logger.success('QUEST', `Posted ${posted} missed quests during startup`);
    }
    
    if (skippedNoTime > 0 || skippedInvalidFormat > 0) {
      logger.warn('QUEST', `Skipped ${skippedNoTime + skippedInvalidFormat} quest(s) during startup: ${skippedNoTime} missing scheduledPostTime, ${skippedInvalidFormat} invalid format`);
    }
    
    return posted;
  } catch (error) {
    handleError(error, 'scheduler.js', { commandName: 'checkAndPostMissedQuests' });
    logger.error('QUEST', 'Error checking for missed quests', error);
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
      logger.info('SCHEDULER', `No quests scheduled for ${cronTime} on ${today}`);
      return 0;
    }
    
    // Regenerate art and writing quests if it's after 12pm EST
    let processedQuests = questsToPost;
    if (isAfterNoon) {
      const artWritingQuests = questsToPost.filter(quest => quest.type === 'art' || quest.type === 'writing');
      if (artWritingQuests.length > 0) {
        logger.info('QUEST', `After 12pm EST (${estHour}:00) - Regenerating ${artWritingQuests.length} art/writing quest(s) to ensure adequate completion time`);
        
        // Regenerate each art/writing quest
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
  });
  
  logger.success('SCHEDULER', `Help Wanted scheduler configured with ${FIXED_CRON_TIMES.length} time slots (full 24-hour coverage with variable 3-6 hour buffer in quest generation)`);
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
   logger.error('BLOODMOON', `Blood Moon announcement failed for channel ${channelId}`, error.message);
  }
 }

 return successCount;
}

// ------------------- Main Blood Moon Functions ------------------

async function handleBloodMoonStart(client) {
  logger.info('BLOODMOON', 'Starting Blood Moon start check at 8 PM EST');

  // Check if today is specifically the day BEFORE a Blood Moon (not the actual day or day after)
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Normalize date by stripping time components
  const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  
  logger.info('BLOODMOON', `Current EST date: ${today.toDateString()} (${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')})`);
  
  let isDayBeforeBloodMoon = false;
  let matchedBloodMoonDate = null;
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = new Date(today.getFullYear(), month - 1, day);
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    
    // Normalize both dates for comparison
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const normalizedDayBefore = new Date(dayBefore.getFullYear(), dayBefore.getMonth(), dayBefore.getDate());
    
    logger.info('BLOODMOON', `Checking: Blood Moon date ${realDate} (${bloodMoonDate.toDateString()}), Day before: ${normalizedDayBefore.toDateString()}, Today: ${normalizedToday.toDateString()}`);
    
    if (normalizedToday.getTime() === normalizedDayBefore.getTime()) {
      isDayBeforeBloodMoon = true;
      matchedBloodMoonDate = bloodMoonDate;
      logger.info('BLOODMOON', `Today is the day before Blood Moon (${bloodMoonDate.toDateString()})`);
      break;
    }
  }
  
  if (isDayBeforeBloodMoon) {
   logger.info('BLOODMOON', 'Sending Blood Moon rising announcement - processing channels');
   await renameChannels(client);

   const successCount = await sendBloodMoonAnnouncementsToChannels(
    client, 
    "The Blood Moon rises at nightfall! Beware!"
   );
   
   logger.info('BLOODMOON', `Startup announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   logger.info('BLOODMOON', 'Not the day before Blood Moon - no announcement needed');
  }

  logger.info('BLOODMOON', 'Blood Moon start check completed');
}

async function handleBloodMoonEnd(client) {
  logger.info('BLOODMOON', 'Starting Blood Moon end check at 8 AM EST');

  const wasBloodMoonYesterday = checkBloodMoonTransition();
  
  if (wasBloodMoonYesterday && !isBloodMoonDay()) {
   logger.info('BLOODMOON', 'Blood Moon has ended - transitioning from Blood Moon period');
   await revertChannelNames(client);

   const successCount = await sendBloodMoonEndAnnouncementsToChannels(client);
   logger.success('BLOODMOON', `Blood Moon end announcements sent to ${successCount}/${BLOOD_MOON_CHANNELS.length} channels`);
  } else {
   logger.info('BLOODMOON', 'No Blood Moon transition detected - no end announcement needed');
  }

  logger.success('BLOODMOON', 'Blood Moon end check completed');
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
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentDay = now.getDate();
    
    // Only auto-distribute if we're past the 1st of the month
    if (currentDay === 1) {
      logger.info('BOOST', 'Today is the 1st - scheduled job will handle distribution');
      return;
    }
    
    // Check if any users have already received rewards this month
    const User = require('../shared/models/UserModel');
    const sampleUsers = await User.find({ 
      'boostRewards.lastRewardMonth': currentMonth 
    }).limit(1);
    
    if (sampleUsers.length > 0) {
      logger.info('SCHEDULER', `Boost rewards already distributed for ${currentMonth}`);
      return;
    }
    
    // No rewards distributed yet this month - run distribution
    logger.info('BOOST', `No rewards found for ${currentMonth} - running distribution now...`);
    const result = await distributeMonthlyBoostRewards(client);
    
    if (result.success) {
      logger.success('BOOST', `Startup boost reward distribution completed - Rewarded: ${result.rewardedCount}, Total Tokens: ${result.totalTokens}`);
    } else {
      logger.error('BOOST', 'Startup boost reward distribution failed', result.error);
    }
    
  } catch (error) {
    logger.error('BOOST', 'Error checking/distributing monthly boost rewards', error);
    handleError(error, 'scheduler.js', {
      commandName: 'checkAndDistributeMonthlyBoostRewards'
    });
  }
}

async function runStartupChecks(client) {
 try {
  logger.separator('═', 60);
  logger.section('🗓️ SCHEDULER STARTUP');
  logger.separator('═', 60);
  
  // Raid expiration check (critical - do this first in case bot restarted during a raid)
  await cleanupExpiredRaids(client);
  
  // Blood Moon startup check
  // Only manage channel names - the scheduled 8 PM job handles announcements
  const isBloodMoonActive = isBloodMoonDay();
  if (isBloodMoonActive) {
    // Blood Moon is currently active, just rename channels if needed
    logger.info('BLOODMOON', 'Startup: Blood Moon is active - renaming channels only');
    await renameChannels(client);
  } else {
    // No active Blood Moon, revert channel names
    logger.info('BLOODMOON', 'Startup: No active Blood Moon - reverting channel names');
    await revertChannelNames(client);
  }

  // Check and distribute monthly boost rewards if not done yet this month
  await checkAndDistributeMonthlyBoostRewards(client);

  // Character and quest startup tasks
  await Promise.all([
   handleDebuffExpiry(client),
   handleBuffExpiry(client),
   checkAndGenerateDailyQuests(),
   checkAndPostMissedQuests(client),
   handleQuestExpirationAtMidnight(client)
  ]);

  // Check if blight ping was missed (fallback mechanism)
  await checkAndPostMissedBlightPing(client);

  logger.separator('═', 60);
  logger.success('SCHEDULER', '✨ Startup checks complete');
  logger.separator('═', 60);
 } catch (error) {
  handleError(error, "scheduler.js");
  logger.error('SCHEDULER', 'Startup checks failed', error.message);
 }
}

// ------------------- Scheduler Setup Functions ------------------

function setupDailyTasks(client) {
 // Daily tasks at midnight
 createCronJob("0 0 * * *", "jail release check", () => handleJailRelease(client));
 createCronJob("0 0 * * *", "reset pet last roll dates", () => resetPetLastRollDates(client));
 createCronJob("0 0 * * *", "birthday role assignment", () => handleBirthdayRoleAssignment(client));
 createCronJob("0 0 * * *", "birthday announcements", () => executeBirthdayAnnouncements(client));
 createCronJob("0 0 * * *", "midnight quest generation", () => generateDailyQuestsAtMidnight());
 createCronJob("0 0 * * *", "quest expiration check", () => handleQuestExpirationAtMidnight(client));
 createCronJob("0 0 * * *", "request expiration and cleanup", () => runDailyCleanupTasks(client));
 createCronJob("0 0 * * *", "update role count channels", async () => {
   try {
     const guild = client.guilds.cache.first();
     if (guild) {
       await updateAllRoleCountChannels(guild);
       logger.success('ROLE_COUNT', 'Daily role count channels update completed');
     }
   } catch (error) {
     logger.error('ROLE_COUNT', 'Error updating role count channels', error.message);
   }
 });
 
 // Daily tasks at 1 AM - remove birthday roles from previous day
 createCronJob("0 1 * * *", "birthday role cleanup", () => handleBirthdayRoleRemoval(client));

 // Daily tasks at 8 AM
 createCronJob("0 8 * * *", "reset daily rolls", () => resetDailyRolls(client));
 createCronJob("0 8 * * *", "daily stamina recovery", () => recoverDailyStamina(client));

 // Daily tasks at 5 AM
 createCronJob("0 5 * * *", "debuff expiry check", () => handleDebuffExpiry(client));
 createCronJob("0 5 * * *", "buff expiry check", () => handleBuffExpiry(client));
 createCronJob("0 5 * * *", "reset global steal protections", () => {
  logger.info('CLEANUP', 'Starting global steal protection reset');
  try {
   const { resetAllStealProtections } = require('./commands/jobs/steal.js');
   resetAllStealProtections();
   logger.success('CLEANUP', 'Global steal protections reset completed');
  } catch (error) {
   logger.error('CLEANUP', 'Error resetting global steal protections', error);
  }
 }, "America/New_York");

 // Weekly tasks
 createCronJob("0 0 * * 0", "weekly pet rolls reset", () => resetPetRollsForAllCharacters(client));

 // Monthly tasks
 createCronJob("0 0 1 * *", "monthly vending stock generation", () => generateVendingStockList(client));
 createCronJob("0 0 1 * *", "monthly nitro boost rewards", async () => {
  try {
   logger.info('BOOST', 'Starting monthly Nitro boost reward distribution (1st of month)...');
   const result = await distributeMonthlyBoostRewards(client);
   logger.success('BOOST', `Nitro boost rewards distributed - Rewarded: ${result.rewardedCount}, Already Rewarded: ${result.alreadyRewardedCount}, Errors: ${result.errorCount}, Total Tokens: ${result.totalTokens}`);
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('BOOST', 'Monthly Nitro boost reward distribution failed', error.message);
  }
 });
 // Monthly quest reward distribution - runs at 11:59 PM EST on the last day of month
 createCronJob("59 23 * * *", "monthly quest reward distribution", async () => {
  try {
   // Get current date/time
   const now = new Date();
   // Calculate tomorrow by adding 24 hours (86400000 milliseconds)
   const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
   
   // Format tomorrow's date in EST timezone to check the day
   const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    day: 'numeric'
   });
   
   const tomorrowDay = parseInt(estFormatter.formatToParts(tomorrow).find(p => p.type === 'day').value);
   
   // If tomorrow is the 1st in EST, then today is the last day of the month
   if (tomorrowDay === 1) {
    logger.info('QUEST', 'Starting monthly quest reward distribution (last day of month at 11:59 PM EST)...');
    const result = await processMonthlyQuestRewards();
    logger.success('SCHEDULER', `Monthly quest rewards distributed - Processed: ${result.processed}, Rewarded: ${result.rewarded}, Errors: ${result.errors}`);
   } else {
    logger.info('SCHEDULER', 'Not last day of month, skipping monthly quest reward distribution');
   }
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('QUEST', 'Monthly quest reward distribution failed', error.message);
  }
 }, "America/New_York");

 // Periodic raid expiration check (every 5 minutes) to ensure raids timeout even if bot restarts
 createCronJob("*/5 * * * *", "raid expiration check", async () => {
  try {
   const result = await cleanupExpiredRaids(client);
   if (result.expiredCount > 0) {
    logger.info('RAID', `Periodic raid check - ${result.expiredCount} raid(s) expired`);
   }
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('RAID', 'Periodic raid expiration check failed', error);
  }
 });

 // Hourly tasks
 createCronJob("0 */6 * * *", "quest completion check", () => checkQuestCompletions(client));
 createCronJob("0 */2 * * *", "village tracking check", () => checkVillageTracking(client)); // Every 2 hours
 createCronJob("0 1 * * *", "blood moon tracking cleanup", () => {
  logger.info('CLEANUP', 'Starting Blood Moon tracking cleanup');
  cleanupOldTrackingData();
  logger.success('CLEANUP', 'Blood Moon tracking cleanup completed');
 });
}

function setupQuestPosting(client) {
 // Quest posting check - runs on 1st of month at midnight
 createCronJob("0 0 1 * *", "quest posting check", async () => {
  try {
   process.env.TEST_CHANNEL_ID = '706880599863853097';
   delete require.cache[require.resolve('./scripts/questAnnouncements')];
   const { postQuests } = require('./scripts/questAnnouncements');
   await postQuests(client);
  } catch (error) {
   handleError(error, 'scheduler.js');
   logger.error('QUEST', 'Quest posting check failed', error.message);
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
  }, "America/New_York");
 }


// ------------------- Main Initialization Function ------------------

function initializeScheduler(client) {
 if (!client || !client.isReady()) {
  logger.error('SCHEDULER', 'Invalid or unready Discord client provided to scheduler');
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
 setupSecretSantaScheduler(client);
 
 logger.success('SCHEDULER', 'All scheduled tasks initialized');
 
 // Check and post weather on restart if needed
 (async () => {
   try {
     await checkAndPostWeatherOnRestart(client);
   } catch (error) {
     logger.error('WEATHER', 'Restart weather check failed', error.message);
     handleError(error, "scheduler.js", {
       commandName: 'initializeScheduler',
       operation: 'restartWeatherCheck'
     });
   }
 })();
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
};
