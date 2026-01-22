// scheduler/agenda.js
const Agenda = require("agenda");
const dbConfig = require("@/shared/config/database");
const Character = require("@/shared/models/CharacterModel");
const { handleError } = require("@/shared/utils/globalErrorHandler");
const { sendUserDM } = require("@/shared/utils/messageUtils");

let agenda;

/**
 * Initialize Agenda with MongoDB connection
 * @returns {Promise<Agenda>} The initialized Agenda instance
 */
async function initAgenda() {
  const mongo = dbConfig.tinglebot || process.env.MONGODB_URI;
  if (!mongo) {
    throw new Error("Missing MONGODB_URI - cannot initialize Agenda");
  }

  agenda = new Agenda({
    db: { address: mongo, collection: "agendaJobs" },
    processEvery: "10 seconds",
    defaultLockLifetime: 10 * 60 * 1000, // 10 min
  });

  agenda.on("start", (job) => {
    console.log(`[Agenda] start ${job.attrs.name} (id: ${job.attrs._id})`);
  });
  
  agenda.on("complete", (job) => {
    console.log(`[Agenda] done  ${job.attrs.name} (id: ${job.attrs._id})`);
  });
  
  agenda.on("fail", (err, job) => {
    console.error(`[Agenda] fail ${job?.attrs?.name} (id: ${job?.attrs?._id})`, err);
    handleError(err, "agenda.js", {
      jobName: job?.attrs?.name,
      jobId: job?.attrs?._id,
    });
  });

  return agenda;
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
        console.log(`[Agenda:releaseFromJail] Character ${characterId} not found, skipping`);
        return;
      }

      // Double-check the release time hasn't changed (character might have been released early)
      if (!character.inJail || !character.jailReleaseTime) {
        console.log(`[Agenda:releaseFromJail] Character ${character.name} is not in jail, skipping`);
        return;
      }

      const now = new Date();
      if (character.jailReleaseTime > now) {
        console.log(`[Agenda:releaseFromJail] Character ${character.name} release time not yet reached, rescheduling`);
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
        const villageChannel = await client.channels.fetch(villageChannelId);
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
          console.log(`[Agenda:releaseFromJail] Posted release for ${character.name} in ${character.currentVillage} town hall`);
        }
      } catch (channelError) {
        console.error(`[Agenda:releaseFromJail] Error posting release message:`, channelError);
      }

      // Send DM notification
      const dmMessage = wasBoostedRelease && boostDetails
        ? `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail.\n✨ ${boostDetails.boostFlavorText}`
        : `**Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`;
      
      await sendUserDM(userId, dmMessage, client);

      console.log(`[Agenda:releaseFromJail] Successfully released ${character.name} from jail`);
    } catch (error) {
      console.error(`[Agenda:releaseFromJail] Error releasing character ${characterId}:`, error);
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
        console.log(`[Agenda:expireDebuff] Character ${characterId} not found, skipping`);
        return;
      }

      // Check if debuff is still active and hasn't been manually removed
      if (!character.debuff || !character.debuff.active) {
        console.log(`[Agenda:expireDebuff] Character ${character.name} debuff is not active, skipping`);
        return;
      }

      const now = new Date();
      // EST is UTC-5, so midnight EST = 05:00 UTC
      // Get current UTC date and set to 05:00 UTC (midnight EST)
      const midnightEST = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));

      // Only expire if we're past midnight EST
      if (character.debuff.endDate && character.debuff.endDate > midnightEST) {
        console.log(`[Agenda:expireDebuff] Character ${character.name} debuff not yet expired, rescheduling`);
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
        client
      );

      console.log(`[Agenda:expireDebuff] Successfully expired debuff for ${character.name}`);
    } catch (error) {
      console.error(`[Agenda:expireDebuff] Error expiring debuff for character ${characterId}:`, error);
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
        console.log(`[Agenda:expireBuff] Character ${characterId} not found, skipping`);
        return;
      }

      // Check if buff is still active and hasn't been manually removed
      if (!character.buff || !character.buff.active) {
        console.log(`[Agenda:expireBuff] Character ${character.name} buff is not active, skipping`);
        return;
      }

      const now = new Date();
      // EST is UTC-5, so midnight EST = 05:00 UTC
      // Get current UTC date and set to 05:00 UTC (midnight EST)
      const midnightEST = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));

      // Only expire if we're past midnight EST
      if (character.buff.endDate && character.buff.endDate > midnightEST) {
        console.log(`[Agenda:expireBuff] Character ${character.name} buff not yet expired, rescheduling`);
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
        client
      );

      console.log(`[Agenda:expireBuff] Successfully expired buff for ${character.name}`);
    } catch (error) {
      console.error(`[Agenda:expireBuff] Error expiring buff for character ${characterId}:`, error);
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
        console.log(`[Agenda:postScheduledSpecialWeather] No client available, weather will be posted by cron job`);
        return;
      }

      const { postWeatherForVillage } = require("./scheduler");
      
      // Post the weather (checkExisting=false ensures it posts even if already exists)
      await postWeatherForVillage(clientRef, village, false, false);
      console.log(`[Agenda:postScheduledSpecialWeather] Successfully posted special weather for ${village}`);
    } catch (error) {
      console.error(`[Agenda:postScheduledSpecialWeather] Error posting special weather for ${village}:`, error);
      handleError(error, "agenda.js", {
        jobName: "postScheduledSpecialWeather",
        village: village,
      });
      // Don't throw - let cron job handle it as fallback
    }
  });
}

/**
 * Start the Agenda worker
 * @returns {Promise<void>}
 */
async function startAgenda() {
  if (!agenda) {
    throw new Error("Agenda not initialized - call initAgenda() first");
  }
  await agenda.start();
  console.log("[Agenda] started");
}

/**
 * Stop the Agenda worker gracefully
 * @returns {Promise<void>}
 */
async function stopAgenda() {
  if (!agenda) return;
  await agenda.stop();
  console.log("[Agenda] stopped");
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
