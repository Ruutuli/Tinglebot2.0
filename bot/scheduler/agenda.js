// scheduler/agenda.js
const Agenda = require("agenda");
const DatabaseConnectionManager = require("../database/connectionManager");
const Character = require("../models/CharacterModel");
const { handleError } = require("../utils/globalErrorHandler");
const { sendUserDM } = require("../utils/messageUtils");
const logger = require("../utils/logger");

let agenda;

/**
 * Initialize Agenda with MongoDB connection from DatabaseConnectionManager
 * @returns {Promise<Agenda>} The initialized Agenda instance
 */
async function initAgenda() {
  try {
    // Get Mongoose connection from connection manager (shares connection pool)
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      throw new Error("Tinglebot connection not established. Call DatabaseConnectionManager.initialize() first.");
    }

    // Use existing Mongoose connection to share connection pool
    agenda = new Agenda({
      mongo: mongooseConnection.db, // Use existing connection
      collection: "agendaJobs",
      processEvery: "30 seconds", // Reduced from 10s to reduce polling overhead
      defaultLockLifetime: 10 * 60 * 1000, // 10 min
      maxConcurrency: 20, // Limit concurrent job execution
    });

    // Agenda event listeners for diagnostics
    agenda.on("start", (job) => {
      logger.info('SCHEDULER', `Job started: ${job.attrs.name}`, { jobId: job.attrs._id });
    });
    
    agenda.on("complete", (job) => {
      logger.success('SCHEDULER', `Job completed: ${job.attrs.name}`, { jobId: job.attrs._id });
    });
    
    agenda.on("fail", (err, job) => {
      logger.error('SCHEDULER', `Job failed: ${job?.attrs?.name}`, err);
      handleError(err, "agenda.js", {
        jobName: job?.attrs?.name,
        jobId: job?.attrs?._id,
      });
    });
    
    // Add ready event listener to know when Agenda is actually ready
    agenda.on("ready", () => {
      logger.success('SCHEDULER', 'Agenda is ready and processing jobs');
    });
    
    // Add error event listener for Agenda-level errors
    agenda.on("error", (err) => {
      logger.error('SCHEDULER', `Agenda error: ${err.message}`, err);
    });

    logger.success('SCHEDULER', 'Agenda initialized with managed connection');
    return agenda;
  } catch (error) {
    logger.error('SCHEDULER', `Failed to initialize Agenda: ${error.message}`);
    handleError(error, "agenda.js");
    throw error;
  }
}

// Store client reference for Agenda jobs
let clientRef = null;

/**
 * Define all Agenda job types
 * @param {Object} params - Parameters object
 * @param {Object} params.client - Discord client instance
 */
function defineAgendaJobs({ client }) {
  if (!agenda) {
    throw new Error("Agenda not initialized - call initAgenda() first");
  }

  // Store client reference for use in jobs
  clientRef = client;

  // Job: Release character from jail
  agenda.define("releaseFromJail", { concurrency: 5 }, async (job) => {
    const { characterId, userId } = job.attrs.data;
    
    try {
      const character = await Character.findById(characterId);
      if (!character) {
        logger.debug('SCHEDULER', `Character ${characterId} not found, skipping releaseFromJail`);
        return;
      }

      // Double-check the release time hasn't changed (character might have been released early)
      if (!character.inJail || !character.jailReleaseTime) {
        logger.debug('SCHEDULER', `Character ${character.name} is not in jail, skipping releaseFromJail`);
        return;
      }

      const now = new Date();
      if (character.jailReleaseTime > now) {
        logger.debug('SCHEDULER', `Character ${character.name} release time not yet reached, rescheduling`);
        // Reschedule for the correct time
        await agenda.schedule(character.jailReleaseTime, "releaseFromJail", {
          characterId: characterId,
          userId: userId,
        });
        return;
      }

      // Capture boost details before release (they get cleared by releaseFromJail)
      const jailDurationMs = character.jailDurationMs;
      const jailBoostSource = character.jailBoostSource;
      const DEFAULT_JAIL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
      const wasBoostedRelease = typeof jailDurationMs === 'number' && jailDurationMs > 0 && jailDurationMs < DEFAULT_JAIL_DURATION_MS;
      const servedDays = jailDurationMs ? Math.max(1, Math.round(jailDurationMs / (24 * 60 * 60 * 1000))) : 3;

      // Generate boost flavor text if needed
      let boostDetails = null;
      if (wasBoostedRelease) {
        const { generateBoostFlavorText } = require('../modules/flavorTextModule');
        boostDetails = generateBoostFlavorText();
      }

      // Release the character using shared function
      const { releaseFromJail } = require("@/shared/utils/jailCheck");
      await releaseFromJail(character);

      // Post announcement in character's current village town hall channel
      // Import TOWNHALL_CHANNELS from scheduler
      const TOWNHALL_CHANNELS = {
        Rudania: process.env.RUDANIA_TOWNHALL,
        Inariko: process.env.INARIKO_TOWNHALL,
        Vhintl: process.env.VHINTL_TOWNHALL,
      };
      const HELP_WANTED_TEST_CHANNEL = process.env.HELP_WANTED_TEST_CHANNEL || '1391812848099004578';
      
      // Helper to get village channel ID
      const capitalizedVillage = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();
      const villageChannelId = TOWNHALL_CHANNELS[capitalizedVillage] || HELP_WANTED_TEST_CHANNEL;
      
      try {
        const villageChannel = await clientRef.channels.fetch(villageChannelId);
        if (villageChannel) {
          const { EmbedBuilder } = require("discord.js");
          const releaseEmbed = new EmbedBuilder()
            .setColor("#88cc88")
            .setTitle("Town Hall Proclamation")
            .setDescription(
              `The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`
            )
            .setThumbnail(character.icon || "https://storage.googleapis.com/tinglebot/Graphics/border.png")
            .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
            .setFooter({ text: "Town Hall Records • Reformed & Released" })
            .setTimestamp();

          await villageChannel.send({
            content: `<@${userId}>, your character **${character.name}** has been released from jail.`,
            embeds: [releaseEmbed],
          });
          logger.debug('SCHEDULER', `Posted release for ${character.name} in ${character.currentVillage} town hall`);
        }
      } catch (channelError) {
        logger.error('SCHEDULER', `Error posting release message for ${character.name}`, channelError);
      }

      // Send DM notification
      const dmMessage = wasBoostedRelease && boostDetails
        ? `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail.\n✨ ${boostDetails.boostFlavorText}`
        : `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`;
      
      await sendUserDM(userId, dmMessage, clientRef);

      logger.info('SCHEDULER', `Successfully released ${character.name} from jail`);
    } catch (error) {
      logger.error('SCHEDULER', `Error releasing character ${characterId}`, error);
      handleError(error, "agenda.js", {
        jobName: "releaseFromJail",
        characterId: characterId,
      });
      throw error; // Re-throw so Agenda can retry if configured
    }
  });

  // Job: Expire debuff
  agenda.define("expireDebuff", { concurrency: 5 }, async (job) => {
    const { characterId, userId } = job.attrs.data;
    
    try {
      const character = await Character.findById(characterId);
      if (!character) {
        logger.debug('SCHEDULER', `Character ${characterId} not found, skipping expireDebuff`);
        return;
      }

      // Check if debuff is still active and hasn't been manually removed
      if (!character.debuff || !character.debuff.active) {
        logger.debug('SCHEDULER', `Character ${character.name} debuff is not active, skipping expireDebuff`);
        return;
      }

      const now = new Date();
      // EST is UTC-5, so midnight EST = 05:00 UTC
      // Get current UTC date and set to 05:00 UTC (midnight EST)
      const midnightEST = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));

      // Only expire if we're past midnight EST
      if (character.debuff.endDate && character.debuff.endDate > midnightEST) {
        logger.debug('SCHEDULER', `Character ${character.name} debuff not yet expired, rescheduling`);
        await agenda.schedule(character.debuff.endDate, "expireDebuff", {
          characterId: characterId,
          userId: userId,
        });
        return;
      }

      // Expire the debuff
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();

      // Send DM notification
      await sendUserDM(
        userId,
        `Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`,
        clientRef
      );

      logger.info('SCHEDULER', `Successfully expired debuff for ${character.name}`);
    } catch (error) {
      logger.error('SCHEDULER', `Error expiring debuff for character ${characterId}`, error);
      handleError(error, "agenda.js", {
        jobName: "expireDebuff",
        characterId: characterId,
      });
      throw error;
    }
  });

  // Job: Expire buff
  agenda.define("expireBuff", { concurrency: 5 }, async (job) => {
    const { characterId, userId } = job.attrs.data;
    
    try {
      const character = await Character.findById(characterId);
      if (!character) {
        logger.debug('SCHEDULER', `Character ${characterId} not found, skipping expireBuff`);
        return;
      }

      // Check if buff is still active and hasn't been manually removed
      if (!character.buff || !character.buff.active) {
        logger.debug('SCHEDULER', `Character ${character.name} buff is not active, skipping expireBuff`);
        return;
      }

      const now = new Date();
      // EST is UTC-5, so midnight EST = 05:00 UTC
      // Get current UTC date and set to 05:00 UTC (midnight EST)
      const midnightEST = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));

      // Only expire if we're past midnight EST
      if (character.buff.endDate && character.buff.endDate > midnightEST) {
        logger.debug('SCHEDULER', `Character ${character.name} buff not yet expired, rescheduling`);
        await agenda.schedule(character.buff.endDate, "expireBuff", {
          characterId: characterId,
          userId: userId,
        });
        return;
      }

      // Expire the buff
      character.buff.active = false;
      character.buff.endDate = null;
      await character.save();

      // Send DM notification
      await sendUserDM(
        userId,
        `Your character **${character.name}**'s buff has ended! You can now heal them with items or a Healer.`,
        clientRef
      );

      logger.info('SCHEDULER', `Successfully expired buff for ${character.name}`);
    } catch (error) {
      logger.error('SCHEDULER', `Error expiring buff for character ${characterId}`, error);
      handleError(error, "agenda.js", {
        jobName: "expireBuff",
        characterId: characterId,
      });
      throw error;
    }
  });

  // Job: Post scheduled special weather
  agenda.define("postScheduledSpecialWeather", { concurrency: 3 }, async (job) => {
    const { village } = job.attrs.data;
    
    try {
      // Get client from stored reference
      if (!clientRef) {
        // If no client available, weather will be posted by regular cron job
        logger.debug('SCHEDULER', `No client available, weather will be posted by cron job for ${village}`);
        return;
      }

      const { postWeatherForVillage } = require("./scheduler");
      
      // Post the weather (checkExisting=false ensures it posts even if already exists)
      await postWeatherForVillage(clientRef, village, false, false);
      logger.info('SCHEDULER', `Successfully posted special weather for ${village}`);
    } catch (error) {
      logger.error('SCHEDULER', `Error posting special weather for ${village}`, error);
      handleError(error, "agenda.js", {
        jobName: "postScheduledSpecialWeather",
        village: village,
      });
      // Don't throw - let cron job handle it as fallback
    }
  });

  // ============================================================================
  // ------------------- Recurring Job Definitions -------------------
  // ============================================================================

  // Import scheduler functions for recurring jobs
  const {
    resetPetLastRollDates,
    handleBirthdayRoleAssignment,
    resetDailyRolls,
    recoverDailyStamina,
    generateDailyQuestsAtMidnight,
    resetAllStealProtections,
    resetPetRollsForAllCharacters,
    generateVendingStockList,
    distributeMonthlyBoostRewards,
    cleanupExpiredRaids,
    checkVillageRaidQuotas,
    checkQuestCompletions,
    checkVillageTracking,
    cleanupOldTrackingData,
    postWeatherUpdate,
    checkAndPostWeatherIfNeeded,
    postWeatherReminder,
    postBlightRollCall,
    cleanupExpiredBoostingRequests,
    archiveOldBoostingRequests,
    handleBloodMoonStart,
    handleBloodMoonEnd,
    checkAndPostScheduledQuests,
    checkAndPostAllScheduledQuests,
  } = require("./scheduler");
  
  // Import from modules
  const { processMonthlyQuestRewards } = require('../modules/questRewardModule');

  // Daily Tasks (Midnight EST = 05:00 UTC)
  agenda.define("reset pet last roll dates", { concurrency: 1 }, async (job) => {
    try {
      await resetPetLastRollDates(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in reset pet last roll dates:`, error);
      handleError(error, "agenda.js", { jobName: "reset pet last roll dates" });
    }
  });

  agenda.define("birthday role assignment", { concurrency: 1 }, async (job) => {
    try {
      await handleBirthdayRoleAssignment(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in birthday role assignment:`, error);
      handleError(error, "agenda.js", { jobName: "birthday role assignment" });
    }
  });

  agenda.define("reset daily rolls", { concurrency: 1 }, async (job) => {
    try {
      await resetDailyRolls(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in reset daily rolls:`, error);
      handleError(error, "agenda.js", { jobName: "reset daily rolls" });
    }
  });

  agenda.define("recover daily stamina", { concurrency: 1 }, async (job) => {
    try {
      await recoverDailyStamina(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in recover daily stamina:`, error);
      handleError(error, "agenda.js", { jobName: "recover daily stamina" });
    }
  });

  agenda.define("generate daily quests", { concurrency: 1 }, async (job) => {
    try {
      await generateDailyQuestsAtMidnight();
    } catch (error) {
      logger.error('SCHEDULER', `Error in generate daily quests:`, error);
      handleError(error, "agenda.js", { jobName: "generate daily quests" });
    }
  });

  agenda.define("global steal protections reset", { concurrency: 1 }, async (job) => {
    try {
      await resetAllStealProtections();
      logger.success('CLEANUP', 'Global steal protections reset completed');
    } catch (error) {
      logger.error('CLEANUP', 'Error resetting global steal protections', error);
      handleError(error, "agenda.js", { jobName: "global steal protections reset" });
    }
  });

  // Weekly Tasks (Sunday Midnight EST = Monday 05:00 UTC)
  agenda.define("weekly pet rolls reset", { concurrency: 1 }, async (job) => {
    try {
      await resetPetRollsForAllCharacters(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in weekly pet rolls reset:`, error);
      handleError(error, "agenda.js", { jobName: "weekly pet rolls reset" });
    }
  });

  // Monthly Tasks
  agenda.define("monthly vending stock generation", { concurrency: 1 }, async (job) => {
    try {
      await generateVendingStockList(clientRef);
    } catch (error) {
      logger.error('SCHEDULER', `Error in monthly vending stock generation:`, error);
      handleError(error, "agenda.js", { jobName: "monthly vending stock generation" });
    }
  });

  agenda.define("monthly nitro boost rewards", { concurrency: 1 }, async (job) => {
    try {
      logger.info('BOOST', 'Starting monthly Nitro boost reward distribution (1st of month)...');
      const result = await distributeMonthlyBoostRewards(clientRef);
      logger.success('BOOST', `Nitro boost rewards distributed - Rewarded: ${result.rewardedCount}, Already Rewarded: ${result.alreadyRewardedCount}, Errors: ${result.errorCount}, Total Tokens: ${result.totalTokens}`);
    } catch (error) {
      logger.error('BOOST', 'Monthly Nitro boost reward distribution failed', error.message);
      handleError(error, "agenda.js", { jobName: "monthly nitro boost rewards" });
    }
  });

  agenda.define("monthly quest reward distribution", { concurrency: 1 }, async (job) => {
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
      logger.error('QUEST', 'Monthly quest reward distribution failed', error.message);
      handleError(error, "agenda.js", { jobName: "monthly quest reward distribution" });
    }
  });

  // Periodic Tasks
  agenda.define("raid expiration check", { concurrency: 5 }, async (job) => {
    const startTime = Date.now();
    logger.warn('SCHEDULER', `🔍 [RAID CHECK] Starting execution at ${new Date().toISOString()}`);
    
    try {
      const result = await cleanupExpiredRaids(clientRef);
      const duration = Date.now() - startTime;
      if (result.expiredCount > 0) {
        logger.info('RAID', `Periodic raid check - ${result.expiredCount} raid(s) expired (took ${duration}ms)`);
      } else {
        logger.warn('SCHEDULER', `🔍 [RAID CHECK] Completed in ${duration}ms (no expired raids)`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('RAID', `Periodic raid expiration check failed after ${duration}ms`, error);
      handleError(error, "agenda.js", { jobName: "raid expiration check" });
    }
  });

  agenda.define("village raid quota check", { concurrency: 1 }, async (job) => {
    try {
      logger.info('RAID_QUOTA', 'Starting hourly village raid quota check...');
      await checkVillageRaidQuotas(clientRef);
    } catch (error) {
      logger.error('RAID_QUOTA', 'Error during hourly village raid quota check', error.message);
      handleError(error, "agenda.js", { jobName: "village raid quota check" });
    }
  });

  agenda.define("quest completion check", { concurrency: 1 }, async (job) => {
    try {
      await checkQuestCompletions(clientRef);
    } catch (error) {
      logger.error('QUEST', 'Error checking quest completions:', error.message);
      handleError(error, "agenda.js", { jobName: "quest completion check" });
    }
  });

  agenda.define("village tracking check", { concurrency: 1 }, async (job) => {
    try {
      await checkVillageTracking(clientRef);
    } catch (error) {
      logger.error('VILLAGE', 'Error checking village tracking:', error.message);
      handleError(error, "agenda.js", { jobName: "village tracking check" });
    }
  });

  agenda.define("blood moon tracking cleanup", { concurrency: 1 }, async (job) => {
    try {
      logger.info('CLEANUP', 'Starting Blood Moon tracking cleanup');
      cleanupOldTrackingData();
      logger.success('CLEANUP', 'Blood Moon tracking cleanup completed');
    } catch (error) {
      logger.error('CLEANUP', 'Error in blood moon tracking cleanup', error);
      handleError(error, "agenda.js", { jobName: "blood moon tracking cleanup" });
    }
  });

  // Weather Tasks
  agenda.define("Daily Weather Update", { concurrency: 3 }, async (job) => {
    try {
      await postWeatherUpdate(clientRef);
    } catch (error) {
      logger.error('WEATHER', `Error in Daily Weather Update:`, error);
      handleError(error, "agenda.js", { jobName: "Daily Weather Update" });
    }
  });

  agenda.define("Weather Fallback Check", { concurrency: 1 }, async (job) => {
    try {
      await checkAndPostWeatherIfNeeded(clientRef);
    } catch (error) {
      logger.error('WEATHER', `Error in Weather Fallback Check:`, error);
      handleError(error, "agenda.js", { jobName: "Weather Fallback Check" });
    }
  });

  agenda.define("Daily Weather Forecast Reminder", { concurrency: 1 }, async (job) => {
    try {
      await postWeatherReminder(clientRef);
    } catch (error) {
      logger.error('WEATHER', `Error in Daily Weather Forecast Reminder:`, error);
      handleError(error, "agenda.js", { jobName: "Daily Weather Forecast Reminder" });
    }
  });

  // Blight Tasks
  agenda.define("Blight Roll Call", { concurrency: 1 }, async (job) => {
    try {
      await postBlightRollCall(clientRef);
    } catch (error) {
      logger.error('BLIGHT', 'Blight roll call failed', error.message);
      handleError(error, "agenda.js", { jobName: "Blight Roll Call" });
    }
  });

  // Boost Tasks
  agenda.define("Boost Cleanup", { concurrency: 1 }, async (job) => {
    try {
      logger.info('CLEANUP', 'Starting boost cleanup');
      await cleanupExpiredBoostingRequests();
      await archiveOldBoostingRequests();
      logger.success('CLEANUP', 'Boost cleanup completed');
    } catch (error) {
      logger.error('CLEANUP', 'Boost cleanup failed', error.message);
      handleError(error, "agenda.js", { jobName: "Boost Cleanup" });
    }
  });

  // Expiration Tasks - Check for expired TempData requests
  agenda.define("checkExpiredRequests", { concurrency: 1 }, async (job) => {
    try {
      if (!clientRef) {
        logger.debug('SCHEDULER', 'No client available for expiration check');
        return;
      }

      const TempData = require('../models/TempDataModel');
      const { EmbedBuilder } = require('discord.js');
      
      // Find all expired requests
      const expiredRequests = await TempData.findExpired();
      
      logger.info('CLEANUP', `Checking ${expiredRequests.length} expired TempData requests`);
      
      for (const request of expiredRequests) {
        try {
          // Get the request data
          const { type, key, data } = request;
          
          // Prepare notification message based on request type
          let message = '';
          let userId = '';
          
          switch (type) {
            case 'healing':
              message = `Your healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
              break;
            case 'vending':
              message = `Your vending request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
              break;
            case 'boosting':
              message = `Your boosting request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
              break;
            case 'battle':
              message = `Your battle progress for ${data.characterName} has expired after 48 hours without being completed.`;
              userId = data.userId;
              break;
            case 'encounter':
              message = `Your encounter request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
              break;
            case 'blight':
              message = `Your blight healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
              break;
            case 'travel':
              message = `Your travel request for ${data.characterName} has expired after 48 hours without being completed.`;
              userId = data.userId;
              break;
            case 'gather':
              message = `Your gathering request for ${data.characterName} has expired after 48 hours without being completed.`;
              userId = data.userId;
              break;
            case 'delivery':
              message = `Your delivery request from ${data.sender} to ${data.recipient} has expired after 48 hours without being completed.`;
              userId = data.userId;
              break;
            default:
              message = `Your ${type} request has expired after 48 hours without being fulfilled.`;
              userId = data.userId;
          }

          // Send DM to user if we have their ID
          if (userId) {
            try {
              await sendUserDM(userId, message, clientRef);
            } catch (dmError) {
              logger.debug('CLEANUP', `Could not send DM to user ${userId} for expired ${type} request - user may have blocked DMs`);
            }
          }

          // Delete the expired request
          await TempData.findByIdAndDelete(request._id);
          
          logger.debug('CLEANUP', `Deleted expired ${type} request for ${key}`);
        } catch (requestError) {
          logger.error('CLEANUP', `Error processing expired request ${request._id}:`, requestError);
        }
      }
      
      if (expiredRequests.length > 0) {
        logger.success('CLEANUP', `Processed ${expiredRequests.length} expired TempData requests`);
      }
    } catch (error) {
      logger.error('CLEANUP', 'Error checking expired requests:', error);
      handleError(error, "agenda.js", { jobName: "checkExpiredRequests" });
    }
  });

  // Blood Moon Tasks
  agenda.define("blood moon start announcement", { concurrency: 1 }, async (job) => {
    try {
      await handleBloodMoonStart(clientRef);
    } catch (error) {
      logger.error('BLOODMOON', 'Blood moon start announcement failed', error.message);
      handleError(error, "agenda.js", { jobName: "blood moon start announcement" });
    }
  });

  agenda.define("blood moon end announcement", { concurrency: 1 }, async (job) => {
    try {
      await handleBloodMoonEnd(clientRef);
    } catch (error) {
      logger.error('BLOODMOON', 'Blood moon end announcement failed', error.message);
      handleError(error, "agenda.js", { jobName: "blood moon end announcement" });
    }
  });

  // Quest Tasks
  agenda.define("quest posting check", { concurrency: 1 }, async (job) => {
    try {
      process.env.TEST_CHANNEL_ID = '706880599863853097';
      delete require.cache[require.resolve('../scripts/questAnnouncements')];
      const { postQuests } = require('../scripts/questAnnouncements');
      await postQuests(clientRef);
    } catch (error) {
      logger.error('QUEST', 'Quest posting check failed', error.message);
      handleError(error, "agenda.js", { jobName: "quest posting check" });
    }
  });

  // Help Wanted Task - single recurring job that runs every hour
  agenda.define("help wanted board check", { concurrency: 1 }, async (job) => {
    try {
      await checkAndPostAllScheduledQuests(clientRef);
    } catch (error) {
      logger.error('QUEST', `Error in help wanted board check:`, error);
      handleError(error, "agenda.js", { jobName: "help wanted board check" });
    }
  });

  // Memory logging job - runs hourly
  agenda.define("memory log", { concurrency: 1 }, async (job) => {
    try {
      const { getMemoryMonitor } = require('../utils/memoryMonitor');
      const memoryMonitor = getMemoryMonitor();
      if (memoryMonitor && memoryMonitor.enabled) {
        memoryMonitor.logMemoryStats();
      }
    } catch (error) {
      logger.error('MEM', 'Memory log job failed', error.message);
      handleError(error, "agenda.js", { jobName: "memory log" });
    }
  });

  // Weekly inventory snapshot job
  agenda.define("weekly inventory snapshot", { concurrency: 1 }, async (job) => {
    try {
      logger.info('SNAPSHOT', 'Starting weekly inventory snapshot for all characters...');
      
      // Ensure database connections are ready
      const tinglebotConnection = DatabaseConnectionManager.getTinglebotConnection();
      if (!tinglebotConnection || tinglebotConnection.readyState !== 1) {
        throw new Error('Tinglebot database connection not ready');
      }
      
      const { createAllSnapshots } = require('../scripts/createInventorySnapshot');
      
      // Delete old snapshots before creating new ones (overwrite behavior)
      const inventoriesConnection = await DatabaseConnectionManager.connectToInventoriesNative();
      if (!inventoriesConnection) {
        throw new Error('Failed to connect to inventories database');
      }
      
      const db = inventoriesConnection.useDb('inventories');
      const snapshotsCollection = db.collection('inventory_snapshots');
      
      // Delete all existing snapshots (weekly overwrite)
      const deleteResult = await snapshotsCollection.deleteMany({});
      logger.info('SNAPSHOT', `Deleted ${deleteResult.deletedCount} old snapshot(s)`);
      
      // Create new snapshots for all characters
      const results = await createAllSnapshots();
      
      logger.success('SNAPSHOT', `Weekly inventory snapshot completed - Created: ${results.created}, Failed: ${results.failed}`);
      
      if (results.failed > 0) {
        logger.warn('SNAPSHOT', `${results.failed} snapshot(s) failed. Check logs for details.`);
      }
    } catch (error) {
      logger.error('SNAPSHOT', `Weekly inventory snapshot failed: ${error.message}`, error);
      handleError(error, "agenda.js", { jobName: "weekly inventory snapshot" });
      throw error; // Re-throw so Agenda can retry if configured
    }
  });
}

/**
 * Clean up stuck/locked Agenda jobs before starting
 * @returns {Promise<number>} Number of stuck jobs cleaned up
 */
async function cleanupStuckJobsBeforeStart() {
  try {
    const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
    if (!mongooseConnection || mongooseConnection.readyState !== 1) {
      logger.warn('SCHEDULER', 'Cannot check for stuck jobs - database not ready');
      return 0;
    }
    
    const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
    
    // Find stuck jobs (locked for more than 10 minutes - longer than defaultLockLifetime)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckJobs = await agendaJobsCollection.find({
      lockedAt: { $exists: true, $ne: null, $lt: tenMinutesAgo }
    }).toArray();
    
    if (stuckJobs.length === 0) {
      logger.debug('SCHEDULER', 'No stuck jobs found');
      return 0;
    }
    
    logger.warn('SCHEDULER', `Found ${stuckJobs.length} stuck job(s) - unlocking them...`);
    
    // Unlock stuck jobs
    let unlockedCount = 0;
    for (const job of stuckJobs) {
      try {
        await agendaJobsCollection.updateOne(
          { _id: job._id },
          { 
            $unset: { 
              lockedAt: "",
              lastModifiedBy: ""
            }
          }
        );
        unlockedCount++;
        const jobName = job.name || job.attrs?.name || 'unknown';
        logger.debug('SCHEDULER', `   Unlocked: ${jobName}`);
      } catch (error) {
        logger.error('SCHEDULER', `   Failed to unlock job ${job._id}: ${error.message}`);
      }
    }
    
    if (unlockedCount > 0) {
      logger.success('SCHEDULER', `Unlocked ${unlockedCount} stuck job(s) before starting Agenda`);
    }
    
    return unlockedCount;
  } catch (error) {
    logger.error('SCHEDULER', `Error cleaning up stuck jobs: ${error.message}`);
    // Don't throw - allow Agenda to try starting anyway
    return 0;
  }
}

/**
 * Start the Agenda worker
 * @returns {Promise<void>}
 */
async function startAgenda() {
  if (!agenda) {
    throw new Error("Agenda not initialized - call initAgenda() first");
  }
  
  try {
    logger.info('SCHEDULER', 'Calling agenda.start()...');
    
    // Clean up stuck jobs before starting (this can help prevent initialization delays)
    await cleanupStuckJobsBeforeStart();
    
    // Add diagnostic logging
    const startTime = Date.now();
    logger.debug('SCHEDULER', 'Starting Agenda worker...');
    
    // Start Agenda (this returns a promise that resolves when start() is called)
    // Note: In Agenda v5, start() resolves quickly, but Agenda may still be initializing
    // The "ready" event will fire when Agenda is actually ready to process jobs
    // We don't block on this - Agenda will start processing jobs when ready
    await agenda.start();
    
    const duration = Date.now() - startTime;
    logger.info('SCHEDULER', `Agenda start() called (took ${duration}ms) - Agenda will initialize in background`);
    logger.info('SCHEDULER', 'Jobs can be created now - Agenda will pick them up when ready');
    
    // Note: The "ready" event listener (defined in initAgenda) will log when Agenda is actually ready
    // We don't wait for it here to avoid blocking initialization
  } catch (error) {
    logger.error('SCHEDULER', `Failed to start Agenda: ${error.message}`);
    logger.warn('SCHEDULER', 'Attempting to continue - jobs may not run until Agenda starts');
    
    // Try to get more diagnostic info
    try {
      const mongooseConnection = DatabaseConnectionManager.getTinglebotConnection();
      if (mongooseConnection && mongooseConnection.readyState === 1) {
        const agendaJobsCollection = mongooseConnection.db.collection('agendaJobs');
        const totalJobs = await agendaJobsCollection.countDocuments({});
        const lockedJobs = await agendaJobsCollection.countDocuments({ lockedAt: { $exists: true, $ne: null } });
        const stuckJobs = await agendaJobsCollection.countDocuments({ 
          lockedAt: { $exists: true, $ne: null, $lt: new Date(Date.now() - 10 * 60 * 1000) }
        });
        logger.warn('SCHEDULER', `Diagnostics: ${totalJobs} total jobs, ${lockedJobs} currently locked, ${stuckJobs} stuck (>10min)`);
      }
    } catch (diagError) {
      logger.debug('SCHEDULER', `Could not get diagnostics: ${diagError.message}`);
    }
    
    // Don't throw - allow initialization to continue
    // Agenda may still start in the background
  }
}

/**
 * Stop the Agenda worker gracefully
 * @returns {Promise<void>}
 */
async function stopAgenda() {
  if (!agenda) return;
  await agenda.stop();
  logger.info('SCHEDULER', 'Agenda stopped');
}

/**
 * Get the Agenda instance (for scheduling jobs from other modules)
 * @returns {Agenda|null} The Agenda instance or null if not initialized
 */
function getAgenda() {
  return agenda;
}

module.exports = {
  initAgenda,
  defineAgendaJobs,
  startAgenda,
  stopAgenda,
  getAgenda,
};
