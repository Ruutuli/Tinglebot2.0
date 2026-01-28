// ============================================================================
// ------------------- Scheduled Tasks -------------------
// Purpose: All Agenda-scheduled task handlers in one place
// Add new tasks here as async (client, data) => {} and register below
// Used by: index.js (via registerScheduledTasks), utils/scheduler.js
// ============================================================================

const logger = require('@/utils/logger');
const {
  getCurrentWeather,
  generateWeatherEmbed,
  markWeatherAsPosted,
  markWeatherAsPmPosted,
  getWeatherWithoutGeneration,
} = require('@/services/weatherService');
const Character = require('@/models/CharacterModel');
const User = require('@/models/UserModel');
const Pet = require('@/models/PetModel');
const Quest = require('@/models/QuestModel');
const Village = require('@/models/VillageModel');
const Raid = require('@/models/RaidModel');
const HelpWantedQuest = require('@/models/HelpWantedQuestModel');
const TempData = require('@/models/TempDataModel');
const { releaseFromJail } = require('@/utils/jailCheck');
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('@/modules/characterStatsModule');
const { processMonthlyQuestRewards } = require('@/modules/questRewardModule');
const { checkRaidExpiration } = require('@/modules/raidModule');
const { checkVillageRaidQuotas } = require('@/scripts/randomMonsterEncounters');
const {
  postBlightRollCall,
  checkMissedRolls,
  checkExpiringBlightRequests
} = require('@/handlers/blightHandler');
const {
  sendBloodMoonAnnouncement,
  sendBloodMoonEndAnnouncement,
  cleanupOldTrackingData
} = require('@/scripts/bloodmoon');
const { generateDailyQuests: runHelpWantedGeneration } = require('@/modules/helpWantedModule');

const VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const VILLAGE_CHANNELS = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL
};

// ============================================================================
// ------------------- Weather Tasks -------------------
// ============================================================================

// ------------------- daily-weather (1pm UTC = 13:00 UTC) -------------------
async function dailyWeather(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'daily-weather: Discord client not available');
    return;
  }
  logger.info('SCHEDULED', 'daily-weather: starting');
  for (const village of VILLAGES) {
    const channelId = VILLAGE_CHANNELS[village];
    if (!channelId) {
      logger.warn('SCHEDULED', `daily-weather: no town hall for ${village}`);
      continue;
    }
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        logger.warn('SCHEDULED', `daily-weather: could not fetch channel ${village}`);
        continue;
      }
      const weather = await getCurrentWeather(village);
      if (!weather) {
        logger.warn('SCHEDULED', `daily-weather: no weather for ${village}`);
        continue;
      }
      // Idempotency: if already posted this period, do nothing.
      if (weather.postedToDiscord === true) {
        logger.info('SCHEDULED', `daily-weather: already posted for ${village}, skipping`);
        continue;
      }
      const { embed, files } = await generateWeatherEmbed(village, weather);
      await channel.send({ embeds: [embed], files });
      await markWeatherAsPosted(village, weather);
      logger.success('SCHEDULED', `daily-weather: posted ${village}`);
    } catch (err) {
      logger.error('SCHEDULED', `daily-weather: ${village} failed: ${err.message}`);
    }
  }
  logger.success('SCHEDULED', 'daily-weather: done');
}

// ------------------- weather-fallback-check (1:15pm UTC = 13:15 UTC) -------------------
async function weatherFallbackCheck(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'weather-fallback-check: Discord client not available');
    return;
  }
  logger.info('SCHEDULED', 'weather-fallback-check: starting');
  
  for (const village of VILLAGES) {
    const channelId = VILLAGE_CHANNELS[village];
    if (!channelId) {
      continue;
    }
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        continue;
      }
      
      // Fallback triggers if DB record is missing OR record exists but AM post was not marked successful.
      // DB is the source of truth; never rely on scanning messages.
      let weather = await getWeatherWithoutGeneration(village);
      if (!weather) {
        logger.warn('SCHEDULED', `weather-fallback-check: No weather record for ${village}, generating`);
        weather = await getCurrentWeather(village); // generate+save if needed
      }

      if (!weather) {
        logger.warn('SCHEDULED', `weather-fallback-check: Still no weather for ${village} after generation attempt`);
        continue;
      }

      if (weather.postedToDiscord === true) {
        logger.info('SCHEDULED', `weather-fallback-check: Weather already marked as posted for ${village}, skipping`);
        continue;
      }

      logger.warn('SCHEDULED', `weather-fallback-check: Weather not posted for ${village}, attempting post`);
      const { embed, files } = await generateWeatherEmbed(village, weather);
      await channel.send({ embeds: [embed], files });
      await markWeatherAsPosted(village, weather);
      logger.success('SCHEDULED', `weather-fallback-check: Posted missing weather for ${village}`);
    } catch (err) {
      logger.error('SCHEDULED', `weather-fallback-check: ${village} failed: ${err.message}`);
    }
  }
  logger.success('SCHEDULED', 'weather-fallback-check: done');
}

// ------------------- weather-reminder (8pm EST = 01:00 UTC) -------------------
async function weatherReminder(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'weather-reminder: Discord client not available');
    return;
  }
  logger.info('SCHEDULED', 'weather-reminder: starting');

  // 8pm EST repost: read-only, never regenerate. Must repost the saved record for the day.
  for (const village of VILLAGES) {
    const channelId = VILLAGE_CHANNELS[village];
    if (!channelId) {
      logger.warn('SCHEDULED', `weather-reminder: no town hall for ${village}`);
      continue;
    }
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        logger.warn('SCHEDULED', `weather-reminder: could not fetch channel ${village}`);
        continue;
      }

      const weather = await getWeatherWithoutGeneration(village);
      if (!weather) {
        logger.warn('SCHEDULED', `weather-reminder: no saved weather to repost for ${village}`);
        continue;
      }

      if (weather.pmPostedToDiscord === true) {
        logger.info('SCHEDULED', `weather-reminder: already PM-posted for ${village}, skipping`);
        continue;
      }

      const { embed, files } = await generateWeatherEmbed(village, weather);
      await channel.send({ embeds: [embed], files });
      await markWeatherAsPmPosted(village, weather);
      logger.success('SCHEDULED', `weather-reminder: PM reposted ${village}`);
    } catch (err) {
      logger.error('SCHEDULED', `weather-reminder: ${village} failed: ${err.message}`);
    }
  }

  logger.success('SCHEDULED', 'weather-reminder: done');
}

// ============================================================================
// ------------------- Blood Moon Tasks -------------------
// ============================================================================

// ------------------- bloodmoon-start-announcement (8pm EST = 01:00 UTC) -------------------
async function bloodmoonStartAnnouncement(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'bloodmoon-start-announcement: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'bloodmoon-start-announcement: starting');
    
    for (const village of VILLAGES) {
      const channelId = VILLAGE_CHANNELS[village];
      if (!channelId) {
        continue;
      }
      try {
        await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
      } catch (err) {
        logger.error('SCHEDULED', `bloodmoon-start-announcement: ${village} failed: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', 'bloodmoon-start-announcement: done');
  } catch (err) {
    logger.error('SCHEDULED', `bloodmoon-start-announcement: ${err.message}`);
  }
}

// ------------------- bloodmoon-end-announcement (12am EST = 05:00 UTC) -------------------
async function bloodmoonEndAnnouncement(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'bloodmoon-end-announcement: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'bloodmoon-end-announcement: starting');
    
    for (const village of VILLAGES) {
      const channelId = VILLAGE_CHANNELS[village];
      if (!channelId) {
        continue;
      }
      try {
        await sendBloodMoonEndAnnouncement(client, channelId);
      } catch (err) {
        logger.error('SCHEDULED', `bloodmoon-end-announcement: ${village} failed: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', 'bloodmoon-end-announcement: done');
  } catch (err) {
    logger.error('SCHEDULED', `bloodmoon-end-announcement: ${err.message}`);
  }
}

// ------------------- bloodmoon-cleanup (1am EST = 06:00 UTC) -------------------
async function bloodmoonCleanup(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'bloodmoon-cleanup: starting');
    await cleanupOldTrackingData();
    logger.success('SCHEDULED', 'bloodmoon-cleanup: done');
  } catch (err) {
    logger.error('SCHEDULED', `bloodmoon-cleanup: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Blight Tasks -------------------
// ============================================================================

// ------------------- blight-roll-call (8pm EST = 01:00 UTC) -------------------
async function blightRollCall(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'blight-roll-call: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'blight-roll-call: starting');
    await postBlightRollCall(client);
    logger.success('SCHEDULED', 'blight-roll-call: done');
  } catch (err) {
    logger.error('SCHEDULED', `blight-roll-call: ${err.message}`);
  }
}

// ------------------- blight-roll-call-check (7:59pm EST = 00:59 UTC, 1 min before call) -------------------
async function blightRollCallCheck(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'blight-roll-call-check: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'blight-roll-call-check: starting');
    await checkMissedRolls(client);
    logger.success('SCHEDULED', 'blight-roll-call-check: done');
  } catch (err) {
    logger.error('SCHEDULED', `blight-roll-call-check: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Birthday Tasks -------------------
// ============================================================================

// Helper function to get birthday role IDs from environment
function getBirthdayRoleIds() {
  return {
    regular: process.env.BIRTHDAY_ROLE_ID,
    mod: process.env.BIRTHDAY_MOD_ROLE_ID
  };
}

// Helper function to check if user is a mod
async function isModUser(client, userId) {
  try {
    if (!client?.guilds) return false;
    const guild = client.guilds.cache.first();
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    return member.roles.cache.some(role => 
      role.name.toLowerCase().includes('mod') || 
      role.name.toLowerCase().includes('admin') ||
      role.name.toLowerCase().includes('oracle') ||
      role.name.toLowerCase().includes('dragon') ||
      role.name.toLowerCase().includes('sage')
    );
  } catch {
    return false;
  }
}

// ------------------- birthday-assign-role (12am EST = 05:00 UTC) -------------------
async function birthdayAssignRole(client, _data = {}) {
  if (!client?.guilds) {
    logger.error('SCHEDULED', 'birthday-assign-role: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'birthday-assign-role: starting');
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      logger.warn('SCHEDULED', 'birthday-assign-role: No guild found');
      return;
    }
    
    const roleIds = getBirthdayRoleIds();
    if (!roleIds.regular) {
      logger.warn('SCHEDULED', 'birthday-assign-role: BIRTHDAY_ROLE_ID not configured');
      return;
    }
    
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const day = today.getUTCDate();
    
    // Find all users with birthdays today
    const birthdayUsers = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    let assignedCount = 0;
    for (const user of birthdayUsers) {
      try {
        const member = await guild.members.fetch(user.discordId).catch(() => null);
        if (!member) continue;
        
        const isMod = await isModUser(client, user.discordId);
        const roleId = isMod && roleIds.mod ? roleIds.mod : roleIds.regular;
        const role = await guild.roles.fetch(roleId).catch(() => null);
        
        if (role && !member.roles.cache.has(roleId)) {
          await member.roles.add(role);
          assignedCount++;
          logger.info('SCHEDULED', `birthday-assign-role: Assigned role to ${user.discordId}`);
        }
      } catch (err) {
        logger.error('SCHEDULED', `birthday-assign-role: Failed for user ${user.discordId}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `birthday-assign-role: done (assigned ${assignedCount} roles)`);
  } catch (err) {
    logger.error('SCHEDULED', `birthday-assign-role: ${err.message}`);
  }
}

// ------------------- birthday-remove-role (12am EST = 05:00 UTC) -------------------
async function birthdayRemoveRole(client, _data = {}) {
  if (!client?.guilds) {
    logger.error('SCHEDULED', 'birthday-remove-role: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'birthday-remove-role: starting');
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      logger.warn('SCHEDULED', 'birthday-remove-role: No guild found');
      return;
    }
    
    const roleIds = getBirthdayRoleIds();
    if (!roleIds.regular) {
      logger.warn('SCHEDULED', 'birthday-remove-role: BIRTHDAY_ROLE_ID not configured');
      return;
    }
    
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const month = yesterday.getUTCMonth() + 1;
    const day = yesterday.getUTCDate();
    
    // Find all users with birthdays yesterday
    const yesterdayBirthdayUsers = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    let removedCount = 0;
    for (const user of yesterdayBirthdayUsers) {
      try {
        const member = await guild.members.fetch(user.discordId).catch(() => null);
        if (!member) continue;
        
        // Remove both regular and mod birthday roles
        for (const roleId of [roleIds.regular, roleIds.mod].filter(Boolean)) {
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            removedCount++;
            logger.info('SCHEDULED', `birthday-remove-role: Removed role ${roleId} from ${user.discordId}`);
          }
        }
      } catch (err) {
        logger.error('SCHEDULED', `birthday-remove-role: Failed for user ${user.discordId}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `birthday-remove-role: done (removed ${removedCount} roles)`);
  } catch (err) {
    logger.error('SCHEDULED', `birthday-remove-role: ${err.message}`);
  }
}

// ------------------- birthday-announcements (12am EST = 05:00 UTC) -------------------
async function birthdayAnnouncements(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'birthday-announcements: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'birthday-announcements: starting');
    
    const announcementChannelId = process.env.BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID;
    if (!announcementChannelId) {
      logger.warn('SCHEDULED', 'birthday-announcements: BIRTHDAY_ANNOUNCEMENT_CHANNEL_ID not configured');
      return;
    }
    
    const channel = await client.channels.fetch(announcementChannelId).catch(() => null);
    if (!channel) {
      logger.warn('SCHEDULED', `birthday-announcements: Channel ${announcementChannelId} not found`);
      return;
    }
    
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const day = today.getUTCDate();
    
    // Find all users with birthdays today
    const birthdayUsers = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    // Find all characters with birthdays today (MM-DD format)
    const todayBirthdayStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const birthdayCharacters = await Character.find({
      birthday: todayBirthdayStr
    });
    
    if (birthdayUsers.length === 0 && birthdayCharacters.length === 0) {
      logger.info('SCHEDULED', 'birthday-announcements: No birthdays today');
      return;
    }
    
    // Build announcement content
    let description = '**@everyone**\n\n';
    
    // User birthdays (with rewards)
    if (birthdayUsers.length > 0) {
      const userMentions = birthdayUsers.map(user => `<@${user.discordId}>`).join(' ');
      description += `🎂 **User Birthdays:**\n${userMentions}\n\n🎁 **It's your birthday!** Use \`/birthday claim\` to get your rewards!\n\n**Choose one:**\n• 💰 1500 tokens\n• 🛍️ 75% shop discount\n\n`;
    }
    
    // Character birthdays (OC birthdays, RP only)
    if (birthdayCharacters.length > 0) {
      const characterNames = birthdayCharacters.map(char => `**${char.name}**`).join(', ');
      description += `🎭 **Character Birthdays:**\n${characterNames}\n\n`;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('🎂 Happy Birthday! 🎉')
      .setDescription(description.trim())
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setTimestamp();
    
    await channel.send({ content: '@everyone', embeds: [embed] });
    logger.success('SCHEDULED', `birthday-announcements: Posted announcement for ${birthdayUsers.length} user(s) and ${birthdayCharacters.length} character(s)`);
  } catch (err) {
    logger.error('SCHEDULED', `birthday-announcements: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Daily Reset Tasks (12am EST = 05:00 UTC) -------------------
// ============================================================================

// Helper function to get today's date string in EST
function getTodayESTString() {
  const now = new Date();
  // EST is UTC-5
  const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return `${estNow.getUTCFullYear()}-${String(estNow.getUTCMonth() + 1).padStart(2, '0')}-${String(estNow.getUTCDate()).padStart(2, '0')}`;
}

// ------------------- reset-daily-rolls -------------------
async function resetDailyRolls(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'reset-daily-rolls: starting');
    
    const today = getTodayESTString();
    const characters = await Character.find({});
    let resetCount = 0;
    
    for (const character of characters) {
      try {
        // Check if dailyRoll exists and needs reset
        if (character.dailyRoll && character.dailyRoll instanceof Map) {
          // Clear all daily roll entries
          character.dailyRoll.clear();
          character.markModified('dailyRoll');
          await character.save();
          resetCount++;
        }
      } catch (err) {
        logger.error('SCHEDULED', `reset-daily-rolls: Failed for ${character.name}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `reset-daily-rolls: done (reset ${resetCount} characters)`);
  } catch (err) {
    logger.error('SCHEDULED', `reset-daily-rolls: ${err.message}`);
  }
}

// ------------------- reset-pet-roll-dates -------------------
async function resetPetRollDates(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'reset-pet-roll-dates: starting');
    
    // Reset lastRollDate for all active pets
    const result = await Pet.updateMany(
      { status: 'active' },
      { $set: { lastRollDate: null } }
    );
    
    logger.success('SCHEDULED', `reset-pet-roll-dates: done (reset ${result.modifiedCount} pets)`);
  } catch (err) {
    logger.error('SCHEDULED', `reset-pet-roll-dates: ${err.message}`);
  }
}

// ------------------- recover-daily-stamina -------------------
async function recoverDailyStaminaTask(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'recover-daily-stamina: starting');
    await recoverDailyStamina();
    logger.success('SCHEDULED', 'recover-daily-stamina: done');
  } catch (err) {
    logger.error('SCHEDULED', `recover-daily-stamina: ${err.message}`);
  }
}

// ------------------- generate-daily-quests (midnight EST = 05:00 UTC) -------------------
async function generateDailyQuests(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'generate-daily-quests: starting');
    await runHelpWantedGeneration();
    logger.success('SCHEDULED', 'generate-daily-quests: done');
  } catch (err) {
    logger.error('SCHEDULED', `generate-daily-quests: ${err.message}`);
  }
}

// ------------------- reset-global-steal-protections -------------------
async function resetGlobalStealProtections(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'reset-global-steal-protections: starting');
    
    // Reset steal protections for all characters
    const result = await Character.updateMany(
      { 'stealProtection.isProtected': true },
      { 
        $set: { 
          'stealProtection.isProtected': false,
          'stealProtection.protectionEndTime': null
        }
      }
    );
    
    // Also reset NPC steal protections if NPC model exists
    // Note: NPC model may not exist, so we'll skip if it doesn't
    try {
      const NPC = require('@/models/NPCModel');
      await NPC.updateMany(
        { 'stealProtection.isProtected': true },
        { 
          $set: { 
            'stealProtection.isProtected': false,
            'stealProtection.protectionEndTime': null
          }
        }
      );
    } catch (npcErr) {
      // NPC model might not exist, that's okay
      logger.debug('SCHEDULED', 'reset-global-steal-protections: NPC model not found, skipping');
    }
    
    logger.success('SCHEDULED', `reset-global-steal-protections: done (reset ${result.modifiedCount} characters)`);
  } catch (err) {
    logger.error('SCHEDULED', `reset-global-steal-protections: ${err.message}`);
  }
}

// ------------------- boost-cleanup -------------------
async function boostCleanup(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'boost-cleanup: starting');
    
    // Find all expired boosts in TempData
    const now = Date.now();
    const expiredBoosts = await TempData.find({
      type: 'boosting',
      $or: [
        { 'data.status': 'accepted', 'data.boostExpiresAt': { $lt: now } },
        { 'data.status': 'pending', 'data.expiresAt': { $lt: now } }
      ]
    });
    
    let updatedCount = 0;
    let clearedCount = 0;
    
    for (const boostData of expiredBoosts) {
      try {
        const data = boostData.data;
        
        // Update status to expired
        if (data.status !== 'expired') {
          data.status = 'expired';
          boostData.data = data;
          await boostData.save();
          updatedCount++;
        }
        
        // Clear character.boostedBy if this was an active boost
        if (data.status === 'expired' && data.targetCharacter && data.boostExpiresAt && now > data.boostExpiresAt) {
          const character = await Character.findOne({ name: data.targetCharacter });
          if (character && character.boostedBy) {
            character.boostedBy = null;
            await character.save();
            clearedCount++;
          }
        }
      } catch (err) {
        logger.error('SCHEDULED', `boost-cleanup: Failed for boost ${boostData._id}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `boost-cleanup: done (updated ${updatedCount} boosts, cleared ${clearedCount} character fields)`);
  } catch (err) {
    logger.error('SCHEDULED', `boost-cleanup: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Weekly Tasks (Sunday 12am EST = 05:00 UTC) -------------------
// ============================================================================

// ------------------- weekly-pet-rolls-reset -------------------
async function weeklyPetRollsReset(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'weekly-pet-rolls-reset: starting');
    
    // Reset pet rolls based on level (max 3)
    const pets = await Pet.find({ status: 'active' });
    let resetCount = 0;
    
    for (const pet of pets) {
      try {
        const newRolls = Math.min(pet.level, 3);
        if (pet.rollsRemaining !== newRolls) {
          pet.rollsRemaining = newRolls;
          await pet.save();
          resetCount++;
        }
      } catch (err) {
        logger.error('SCHEDULED', `weekly-pet-rolls-reset: Failed for pet ${pet.name}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `weekly-pet-rolls-reset: done (reset ${resetCount} pets)`);
  } catch (err) {
    logger.error('SCHEDULED', `weekly-pet-rolls-reset: ${err.message}`);
  }
}

// ------------------- weekly-inventory-snapshot -------------------
async function weeklyInventorySnapshot(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'weekly-inventory-snapshot: starting');
    
    // Weekly inventory snapshot logic would go here
    // This can be implemented when inventory snapshot system is ready
    
    logger.info('SCHEDULED', 'weekly-inventory-snapshot: done (snapshot system not yet implemented)');
  } catch (err) {
    logger.error('SCHEDULED', `weekly-inventory-snapshot: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Monthly Tasks -------------------
// ============================================================================

// Helper function to check if today is the first of the month
function isFirstOfMonth() {
  const now = new Date();
  // EST is UTC-5
  const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return estNow.getUTCDate() === 1;
}

// Helper function to check if yesterday was the last day of the month (for processing at 11:59pm EST = 04:59 UTC next day)
function wasYesterdayLastDayOfMonth() {
  const now = new Date();
  // EST is UTC-5, so 04:59 UTC = 11:59pm EST previous day
  // Check if yesterday (in EST) was the last day of the month
  const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const yesterday = new Date(estNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  
  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return yesterday.getUTCDate() === lastDay;
}

// ------------------- monthly-vending-stock (1st of month 12am EST = 05:00 UTC) -------------------
async function monthlyVendingStock(_client, _data = {}) {
  try {
    if (!isFirstOfMonth()) {
      logger.debug('SCHEDULED', 'monthly-vending-stock: Not first of month, skipping');
      return;
    }
    
    logger.info('SCHEDULED', 'monthly-vending-stock: starting');
    
    // Monthly vending stock reset logic would go here
    // This can be implemented when vending stock system is ready
    
    logger.info('SCHEDULED', 'monthly-vending-stock: done (vending stock system not yet implemented)');
  } catch (err) {
    logger.error('SCHEDULED', `monthly-vending-stock: ${err.message}`);
  }
}

// ------------------- monthly-nitro-boost-rewards (1st of month 12am EST = 05:00 UTC) -------------------
async function monthlyNitroBoostRewards(client, _data = {}) {
  try {
    if (!isFirstOfMonth()) {
      logger.debug('SCHEDULED', 'monthly-nitro-boost-rewards: Not first of month, skipping');
      return;
    }
    
    logger.info('SCHEDULED', 'monthly-nitro-boost-rewards: starting');
    
    if (!client?.guilds) {
      logger.error('SCHEDULED', 'monthly-nitro-boost-rewards: Discord client not available');
      return;
    }
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      logger.warn('SCHEDULED', 'monthly-nitro-boost-rewards: No guild found');
      return;
    }
    
    // Get all members with nitro boost
    const members = await guild.members.fetch();
    const boosters = members.filter(member => member.premiumSince !== null);
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    let rewardedCount = 0;
    for (const [userId, member] of boosters) {
      try {
        const user = await User.findOne({ discordId: userId });
        if (!user) continue;
        
        // Check if already rewarded this month
        if (user.boostRewards?.lastRewardMonth === currentMonth) {
          continue;
        }
        
        // Calculate tokens (1 boost = 500 tokens)
        const boostCount = 1; // Each member with premiumSince has 1 boost
        const tokens = boostCount * 500;
        
        // Update user
        if (!user.boostRewards) {
          user.boostRewards = {
            lastRewardMonth: null,
            totalRewards: 0,
            rewardHistory: []
          };
        }
        
        user.boostRewards.lastRewardMonth = currentMonth;
        user.boostRewards.totalRewards += tokens;
        user.boostRewards.rewardHistory.push({
          month: currentMonth,
          boostCount,
          tokensReceived: tokens,
          timestamp: new Date()
        });
        user.tokens = (user.tokens || 0) + tokens;
        
        await user.save();
        rewardedCount++;
        
        logger.info('SCHEDULED', `monthly-nitro-boost-rewards: Rewarded ${userId} with ${tokens} tokens`);
      } catch (err) {
        logger.error('SCHEDULED', `monthly-nitro-boost-rewards: Failed for user ${userId}: ${err.message}`);
      }
    }
    
    logger.success('SCHEDULED', `monthly-nitro-boost-rewards: done (rewarded ${rewardedCount} users)`);
  } catch (err) {
    logger.error('SCHEDULED', `monthly-nitro-boost-rewards: ${err.message}`);
  }
}

// ------------------- quest-posting-check (1st of month 12am EST = 05:00 UTC) -------------------
async function questPostingCheck(_client, _data = {}) {
  try {
    if (!isFirstOfMonth()) {
      logger.debug('SCHEDULED', 'quest-posting-check: Not first of month, skipping');
      return;
    }
    
    logger.info('SCHEDULED', 'quest-posting-check: starting');
    
    // Quest posting check logic would go here
    // This can be implemented when quest posting system is ready
    
    logger.info('SCHEDULED', 'quest-posting-check: done (quest posting system not yet implemented)');
  } catch (err) {
    logger.error('SCHEDULED', `quest-posting-check: ${err.message}`);
  }
}

// ------------------- monthly-quest-reward-payout (Last day of month 11:59pm EST = 04:59 UTC next day) -------------------
async function monthlyQuestRewardPayout(_client, _data = {}) {
  try {
    // Run at 04:59 UTC on 1st-4th of month, check if yesterday was last day
    if (!wasYesterdayLastDayOfMonth()) {
      logger.debug('SCHEDULED', 'monthly-quest-reward-payout: Yesterday was not last day of month, skipping');
      return;
    }
    
    logger.info('SCHEDULED', 'monthly-quest-reward-payout: starting');
    const result = await processMonthlyQuestRewards();
    logger.success('SCHEDULED', `monthly-quest-reward-payout: done (processed: ${result.processed}, rewarded: ${result.rewarded})`);
  } catch (err) {
    logger.error('SCHEDULED', `monthly-quest-reward-payout: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Quest/Help Wanted Tasks -------------------
// ============================================================================

// ------------------- help-wanted-board-check (Every hour) -------------------
async function helpWantedBoardCheck(client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'help-wanted-board-check: starting');
    
    if (!client?.channels) {
      logger.error('SCHEDULED', 'help-wanted-board-check: Discord client not available');
      return;
    }
    
    const { updateQuestEmbed, postQuestToDiscord, isQuestExpired } = require('@/modules/helpWantedModule');
    
    // Get today's date string (YYYY-MM-DD format in UTC)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Only check quests from today (active quests that might need updates)
    // Yesterday's quests are already expired and won't change
    const postedQuests = await HelpWantedQuest.find({
      messageId: { $exists: true, $ne: null },
      channelId: { $exists: true, $ne: null },
      date: today
    });
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Update each quest's embed only if it's been completed (status changed)
    // We don't need to update every quest every hour - only when something changes
    if (postedQuests && postedQuests.length > 0) {
      logger.info('SCHEDULED', `help-wanted-board-check: found ${postedQuests.length} today's posted quest(s) to check`);
      
      for (const quest of postedQuests) {
        try {
          // Refresh quest from database to get latest completion status
          const freshQuest = await HelpWantedQuest.findById(quest._id);
          if (!freshQuest) {
            logger.warn('SCHEDULED', `help-wanted-board-check: quest ${quest.questId} not found in database`);
            continue;
          }
          
          // Only update if quest has been completed (status changed)
          // We don't need to update available quests every hour
          if (freshQuest.completed) {
            // Update the embed to show completion status
            await updateQuestEmbed(client, freshQuest, freshQuest.completedBy || null);
            updatedCount++;
            logger.debug('SCHEDULED', `help-wanted-board-check: updated completed quest ${freshQuest.questId} (${freshQuest.village})`);
          } else {
            // Quest is still available, no need to update
            skippedCount++;
          }
        } catch (err) {
          errorCount++;
          logger.error('SCHEDULED', `help-wanted-board-check: failed to update quest ${quest.questId}: ${err.message}`);
          // Continue with other quests even if one fails
        }
      }
    }
    
    // Find unposted quests that should be posted (from today, no messageId/channelId)
    const unpostedQuests = await HelpWantedQuest.find({
      date: today,
      $or: [
        { messageId: { $exists: false } },
        { messageId: null },
        { channelId: { $exists: false } },
        { channelId: null }
      ]
    });
    
    let postedCount = 0;
    
    if (unpostedQuests && unpostedQuests.length > 0) {
      logger.info('SCHEDULED', `help-wanted-board-check: found ${unpostedQuests.length} unposted quest(s) to post`);
      
      for (const quest of unpostedQuests) {
        try {
          // Refresh quest from database
          const freshQuest = await HelpWantedQuest.findById(quest._id);
          if (!freshQuest) {
            logger.warn('SCHEDULED', `help-wanted-board-check: unposted quest ${quest.questId} not found in database`);
            continue;
          }
          
          // Skip if quest is already completed (shouldn't happen, but safety check)
          if (freshQuest.completed) {
            logger.debug('SCHEDULED', `help-wanted-board-check: skipping completed quest ${freshQuest.questId}`);
            continue;
          }
          
          // Post the quest to Discord
          const message = await postQuestToDiscord(client, freshQuest);
          if (message) {
            postedCount++;
            logger.info('SCHEDULED', `help-wanted-board-check: posted quest ${freshQuest.questId} for ${freshQuest.village}`);
          } else {
            errorCount++;
            logger.error('SCHEDULED', `help-wanted-board-check: failed to post quest ${freshQuest.questId}`);
          }
        } catch (err) {
          errorCount++;
          logger.error('SCHEDULED', `help-wanted-board-check: failed to post quest ${quest.questId}: ${err.message}`);
          // Continue with other quests even if one fails
        }
      }
    }
    
    const summary = [];
    if (updatedCount > 0) summary.push(`updated ${updatedCount} quest(s)`);
    if (skippedCount > 0) summary.push(`skipped ${skippedCount} quest(s) (no changes)`);
    if (postedCount > 0) summary.push(`posted ${postedCount} quest(s)`);
    if (errorCount > 0) summary.push(`${errorCount} error(s)`);
    
    const summaryText = summary.length > 0 ? summary.join(', ') : 'no changes';
    logger.success('SCHEDULED', `help-wanted-board-check: done (${summaryText})`);
  } catch (err) {
    logger.error('SCHEDULED', `help-wanted-board-check: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Raid/Village Tasks -------------------
// ============================================================================

// ------------------- raid-expiration-cleanup (Every hour) -------------------
async function raidExpirationCleanup(_client, _data = {}) {
  try {
    logger.debug('SCHEDULED', 'raid-expiration-cleanup: starting');
    
    const activeRaids = await Raid.find({ status: 'active' });
    let cleanedCount = 0;
    
    for (const raid of activeRaids) {
      try {
        await checkRaidExpiration(raid.raidId);
        cleanedCount++;
      } catch (err) {
        logger.error('SCHEDULED', `raid-expiration-cleanup: Failed for raid ${raid.raidId}: ${err.message}`);
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('SCHEDULED', `raid-expiration-cleanup: done (checked ${cleanedCount} raids)`);
    }
  } catch (err) {
    logger.error('SCHEDULED', `raid-expiration-cleanup: ${err.message}`);
  }
}

// ------------------- village-raid-quota-check (Every hour) -------------------
async function villageRaidQuotaCheck(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'village-raid-quota-check: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'village-raid-quota-check: starting');
    await checkVillageRaidQuotas(client);
    logger.success('SCHEDULED', 'village-raid-quota-check: done');
  } catch (err) {
    logger.error('SCHEDULED', `village-raid-quota-check: ${err.message}`);
  }
}

// ------------------- quest-completion-check (Every 6 hours) -------------------
async function questCompletionCheck(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'quest-completion-check: starting');
    
    // Quest completion check logic would go here
    // This can be implemented when quest completion system is ready
    
    logger.info('SCHEDULED', 'quest-completion-check: done (completion check system not yet implemented)');
  } catch (err) {
    logger.error('SCHEDULED', `quest-completion-check: ${err.message}`);
  }
}

// ------------------- village-tracking-check (Every 2 hours) -------------------
async function villageTrackingCheck(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'village-tracking-check: starting');
    
    // Village tracking check logic would go here
    // This can be implemented when village tracking system is ready
    
    logger.info('SCHEDULED', 'village-tracking-check: done (tracking check system not yet implemented)');
  } catch (err) {
    logger.error('SCHEDULED', `village-tracking-check: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Character Timer Tasks (Polling - every minute) -------------------
// ============================================================================

// ------------------- character-timer-poll (Every 12 hours) -------------------
// Polls all characters for jail release and debuff expiry
async function characterTimerPoll(_client, _data = {}) {
  try {
    const now = new Date();
    
    // Check jail releases
    const toRelease = await Character.find({
      inJail: true,
      jailReleaseTime: { $lte: now }
    });
    
    let releasedCount = 0;
    for (const char of toRelease) {
      try {
        await releaseFromJail(char);
        releasedCount++;
      } catch (err) {
        logger.error('SCHEDULED', `character-timer-poll: Failed to release ${char.name}: ${err.message}`);
      }
    }
    
    // Check debuff expirations
    const charactersWithDebuffs = await Character.find({
      'debuff.active': true,
      'debuff.endDate': { $lte: now }
    });
    
    let clearedDebuffCount = 0;
    for (const char of charactersWithDebuffs) {
      try {
        char.debuff.active = false;
        char.debuff.endDate = null;
        await char.save();
        clearedDebuffCount++;
      } catch (err) {
        logger.error('SCHEDULED', `character-timer-poll: Failed to clear debuff for ${char.name}: ${err.message}`);
      }
    }
    
    if (releasedCount > 0 || clearedDebuffCount > 0) {
      logger.info('SCHEDULED', `character-timer-poll: Released ${releasedCount} from jail, cleared ${clearedDebuffCount} debuffs`);
    }
  } catch (err) {
    logger.error('SCHEDULED', `character-timer-poll: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Expiration Cleanup Tasks -------------------
// ============================================================================

// ------------------- cleanup-boost-expirations (Every hour) -------------------
// Updates boost status and clears character.boostedBy fields (TTL handles document deletion)
async function cleanupBoostExpirations(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'cleanup-boost-expirations: starting');
    
    const now = Date.now();
    
    // Find all active boosts that have expired
    const expiredBoosts = await TempData.find({
      type: 'boosting',
      'data.status': 'accepted',
      'data.boostExpiresAt': { $lt: now }
    });
    
    let updatedCount = 0;
    let clearedCount = 0;
    
    for (const boostData of expiredBoosts) {
      try {
        const data = boostData.data;
        
        // Update status to expired
        if (data.status !== 'expired') {
          data.status = 'expired';
          boostData.data = data;
          await boostData.save();
          updatedCount++;
        }
        
        // Clear character.boostedBy field
        if (data.targetCharacter) {
          const character = await Character.findOne({ name: data.targetCharacter });
          if (character && character.boostedBy) {
            character.boostedBy = null;
            await character.save();
            clearedCount++;
          }
        }
      } catch (err) {
        logger.error('SCHEDULED', `cleanup-boost-expirations: Failed for boost ${boostData._id}: ${err.message}`);
      }
    }
    
    // Also handle pending requests that expired
    const expiredRequests = await TempData.find({
      type: 'boosting',
      'data.status': 'pending',
      'data.expiresAt': { $lt: now }
    });
    
    for (const requestData of expiredRequests) {
      try {
        const data = requestData.data;
        if (data.status !== 'expired') {
          data.status = 'expired';
          requestData.data = data;
          await requestData.save();
          updatedCount++;
        }
      } catch (err) {
        logger.error('SCHEDULED', `cleanup-boost-expirations: Failed for request ${requestData._id}: ${err.message}`);
      }
    }
    
    if (updatedCount > 0 || clearedCount > 0) {
      logger.success('SCHEDULED', `cleanup-boost-expirations: done (updated ${updatedCount} boosts, cleared ${clearedCount} character fields)`);
    }
  } catch (err) {
    logger.error('SCHEDULED', `cleanup-boost-expirations: ${err.message}`);
  }
}

// ------------------- blight-expiration-warnings (Every 6 hours) -------------------
// Sends warnings before blight requests expire (TTL handles document deletion)
async function blightExpirationWarnings(client, _data = {}) {
  if (!client) {
    logger.error('SCHEDULED', 'blight-expiration-warnings: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'blight-expiration-warnings: starting');
    await checkExpiringBlightRequests(client);
    logger.success('SCHEDULED', 'blight-expiration-warnings: done');
  } catch (err) {
    logger.error('SCHEDULED', `blight-expiration-warnings: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Task Registry -------------------
// ============================================================================

// All tasks with their cron expressions (UTC times)
const TASKS = [
  // Weather Tasks
  { name: 'daily-weather', cron: '0 13 * * *', handler: dailyWeather }, // 1pm UTC = 13:00 UTC
  { name: 'weather-fallback-check', cron: '15 13 * * *', handler: weatherFallbackCheck }, // 8:15am EST = 13:15 UTC
  { name: 'weather-reminder', cron: '0 1 * * *', handler: weatherReminder }, // 8pm EST = 01:00 UTC
  
  // Blood Moon Tasks
  { name: 'bloodmoon-start-announcement', cron: '0 1 * * *', handler: bloodmoonStartAnnouncement }, // 8pm EST = 01:00 UTC
  { name: 'bloodmoon-end-announcement', cron: '0 5 * * *', handler: bloodmoonEndAnnouncement }, // 12am EST = 05:00 UTC
  { name: 'bloodmoon-cleanup', cron: '0 6 * * *', handler: bloodmoonCleanup }, // 1am EST = 06:00 UTC
  
  // Blight Tasks
  { name: 'blight-roll-call', cron: '0 1 * * *', handler: blightRollCall }, // 8pm EST = 01:00 UTC
  { name: 'blight-roll-call-check', cron: '59 0 * * *', handler: blightRollCallCheck }, // 7:59pm EST = 00:59 UTC, 1 min before call
  
  // Birthday Tasks (all at 12am EST = 05:00 UTC)
  { name: 'birthday-assign-role', cron: '0 5 * * *', handler: birthdayAssignRole },
  { name: 'birthday-remove-role', cron: '0 5 * * *', handler: birthdayRemoveRole },
  { name: 'birthday-announcements', cron: '0 5 * * *', handler: birthdayAnnouncements },
  
  // Daily Reset Tasks (all at 12am EST = 05:00 UTC)
  { name: 'reset-daily-rolls', cron: '0 5 * * *', handler: resetDailyRolls },
  { name: 'reset-pet-roll-dates', cron: '0 5 * * *', handler: resetPetRollDates },
  { name: 'recover-daily-stamina', cron: '0 13 * * *', handler: recoverDailyStaminaTask }, // 8am EST = 13:00 UTC
  { name: 'generate-daily-quests', cron: '0 5 * * *', handler: generateDailyQuests },
  { name: 'reset-global-steal-protections', cron: '0 5 * * *', handler: resetGlobalStealProtections },
  { name: 'boost-cleanup', cron: '0 5 * * *', handler: boostCleanup },
  
  // Weekly Tasks (Sunday 12am EST = 05:00 UTC)
  { name: 'weekly-pet-rolls-reset', cron: '0 5 * * 0', handler: weeklyPetRollsReset },
  { name: 'weekly-inventory-snapshot', cron: '0 5 * * 0', handler: weeklyInventorySnapshot },
  
  // Monthly Tasks
  { name: 'monthly-vending-stock', cron: '0 5 1 * *', handler: monthlyVendingStock }, // 1st of month 12am EST = 05:00 UTC
  { name: 'monthly-nitro-boost-rewards', cron: '0 5 1 * *', handler: monthlyNitroBoostRewards }, // 1st of month 12am EST = 05:00 UTC
  { name: 'quest-posting-check', cron: '0 5 1 * *', handler: questPostingCheck }, // 1st of month 12am EST = 05:00 UTC
  { name: 'monthly-quest-reward-payout', cron: '59 4 1-4 * *', handler: monthlyQuestRewardPayout }, // Last day of month 11:59pm EST = 04:59 UTC next day (runs on 1st-4th, checks if yesterday was last day)
  
  // Quest/Help Wanted Tasks
  { name: 'help-wanted-board-check', cron: '0 * * * *', handler: helpWantedBoardCheck }, // Every hour
  
  // Raid/Village Tasks
  { name: 'raid-expiration-cleanup', cron: '0 * * * *', handler: raidExpirationCleanup }, // Every hour
  { name: 'village-raid-quota-check', cron: '0 * * * *', handler: villageRaidQuotaCheck }, // Every hour
  { name: 'quest-completion-check', cron: '0 */6 * * *', handler: questCompletionCheck }, // Every 6 hours
  { name: 'village-tracking-check', cron: '0 */2 * * *', handler: villageTrackingCheck }, // Every 2 hours
  
  // Character Timer Tasks
  { name: 'character-timer-poll', cron: '0 */12 * * *', handler: characterTimerPoll }, // Every 12 hours
  
  // Expiration Cleanup Tasks
  { name: 'cleanup-boost-expirations', cron: '0 * * * *', handler: cleanupBoostExpirations }, // Every hour
  { name: 'blight-expiration-warnings', cron: '0 */6 * * *', handler: blightExpirationWarnings } // Every 6 hours
];

/**
 * Register all scheduled tasks with the scheduler. Call before initializeScheduler.
 * @param {object} scheduler - utils/scheduler module (registerTask, etc.)
 */
function registerScheduledTasks(scheduler) {
  for (const { name, cron, handler } of TASKS) {
    scheduler.registerTask(name, cron, handler);
  }
}

module.exports = { 
  registerScheduledTasks, 
  dailyWeather, 
  characterTimerPoll, 
  TASKS 
};
