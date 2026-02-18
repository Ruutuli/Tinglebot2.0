// ============================================================================
// ------------------- Scheduled Tasks -------------------
// Purpose: All Agenda-scheduled task handlers in one place
// Add new tasks here as async (client, data) => {} and register below
// Used by: index.js (via registerScheduledTasks), utils/scheduler.js
// ============================================================================

const path = require('path');
const fs = require('fs');
const logger = require('@/utils/logger');
const {
  getCurrentWeather,
  generateWeatherEmbed,
  markWeatherAsPosted,
  markWeatherAsPmPosted,
  getWeatherWithoutGeneration,
  calculateWeatherDamage,
} = require('@/services/weatherService');
const { damageVillage } = require('@/modules/villageModule');
const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const User = require('@/models/UserModel');
const Pet = require('@/models/PetModel');
const Quest = require('@/models/QuestModel');
const Village = require('@/models/VillageModel');
const Raid = require('@/models/RaidModel');
const HelpWantedQuest = require('@/models/HelpWantedQuestModel');
const TempData = require('@/models/TempDataModel');
const TokenTransaction = require('@/models/TokenTransactionModel');
const { releaseFromJail } = require('@/utils/jailCheck');
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('@/modules/characterStatsModule');
const { processMonthlyQuestRewards, processQuestCompletion } = require('@/modules/questRewardModule');
const { checkRaidExpiration, RAID_EXPIRATION_JOB_NAME, RAID_TURN_SKIP_JOB_NAME, scheduleRaidTurnSkip, applyPartySizeScalingToRaid } = require('@/modules/raidModule');
const { checkVillageRaidQuotas } = require('@/scripts/randomMonsterEncounters');
const {
  postBlightRollCall,
  checkMissedRolls,
  checkExpiringBlightRequests
} = require('@/handlers/blightHandler');
const {
  sendBloodMoonAnnouncement,
  sendBloodMoonEndAnnouncement,
  cleanupOldTrackingData,
  renameChannels,
  revertChannelNames
} = require('@/scripts/bloodmoon');
const { generateDailyQuests: runHelpWantedGeneration } = require('@/modules/helpWantedModule');
const { updateSubmissionData } = require('@/utils/storage');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
const { fetchAllCharacters, getCharacterInventoryCollection, connectToInventoriesNative, markRelicDeteriorated } = require('@/database/db');
const RelicModel = require('@/models/RelicModel');

const APPROVAL_CHANNEL_ID = '1381479893090566144';
const COMMUNITY_BOARD_CHANNEL_ID = process.env.COMMUNITY_BOARD_CHANNEL_ID || '651614266046152705';
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '606128760655183882';
const VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const VILLAGE_CHANNELS = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL
};

// ------------------- Helper: hasScheduledTimePassed -------------------
// Checks if the scheduled post time (cron format: "minute hour * * *") has passed
// Returns true if current UTC time >= scheduled time for today
function hasScheduledTimePassed(scheduledPostTime) {
  if (!scheduledPostTime) {
    return false; // Can't determine if time passed without a schedule
  }
  
  try {
    // Parse cron format: "minute hour * * *"
    const parts = scheduledPostTime.split(' ');
    if (parts.length < 2) {
      logger.warn('SCHEDULED', `Invalid cron format: ${scheduledPostTime}`);
      return false;
    }
    
    const scheduledMinute = parseInt(parts[0], 10);
    const scheduledHour = parseInt(parts[1], 10);
    
    if (isNaN(scheduledMinute) || isNaN(scheduledHour)) {
      logger.warn('SCHEDULED', `Invalid cron time values: ${scheduledPostTime}`);
      return false;
    }
    
    // Get current UTC time
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    // Compare: current time >= scheduled time
    if (currentHour > scheduledHour) {
      return true; // Current hour is past scheduled hour
    } else if (currentHour === scheduledHour && currentMinute >= scheduledMinute) {
      return true; // Same hour, current minute >= scheduled minute
    }
    
    return false; // Scheduled time hasn't passed yet
  } catch (error) {
    logger.error('SCHEDULED', `Error checking scheduled time: ${error.message}`);
    return false; // On error, don't post (safer)
  }
}

// ============================================================================
// ------------------- Weather Tasks -------------------
// ============================================================================

// Build a readable damage cause string from weather and damage breakdown
function buildWeatherDamageCause(weather, damageBreakdown) {
  if (!weather || !damageBreakdown || damageBreakdown.total === 0) return 'Weather';
  const parts = [];
  if (damageBreakdown.special > 0 && weather.special?.label) {
    parts.push(weather.special.label);
  }
  if (damageBreakdown.precipitation > 0 && weather.precipitation?.label) {
    parts.push(weather.precipitation.label);
  }
  if (damageBreakdown.wind > 0 && weather.wind?.label) {
    const windLabel = weather.wind.label;
    const match = windLabel?.match(/\/\/\s*(.+)$/);
    parts.push(match ? match[1].trim() : windLabel);
  }
  return parts.length > 0 ? `Weather: **${parts.join(', ')}**` : 'Weather';
}

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
      
      // Apply weather damage if not already applied for this weather period
      if (!weather.weatherDamageApplied) {
        try {
          const damageBreakdown = calculateWeatherDamage(weather);
          const damageAmount = damageBreakdown.total;
          
          if (damageAmount > 0) {
            const weatherCause = buildWeatherDamageCause(weather, damageBreakdown);
            await damageVillage(village, damageAmount, weatherCause);
            logger.success('SCHEDULED', `Weather damage: ${village} took ${damageAmount} HP damage (Wind: ${damageBreakdown.wind}, Precipitation: ${damageBreakdown.precipitation}, Special: ${damageBreakdown.special})`);
          } else {
            logger.info('SCHEDULED', `Weather damage: ${village} - no damage conditions met`);
          }
          damageApplied = true;
        } catch (damageErr) {
          // Log error but don't fail weather posting if damage application fails
          logger.error('SCHEDULED', `Weather damage application failed for ${village}: ${damageErr.message}`);
        }
      }
      
      // Mark weather as posted and damage as applied (if applicable) in one update
      const Weather = require('@/models/WeatherModel');
      const updateData = { 
        postedToDiscord: true, 
        postedAt: new Date() 
      };
      // Mark damage as applied if we processed it (even if no damage occurred or error happened)
      if (!weather.weatherDamageApplied) {
        updateData.weatherDamageApplied = true;
      }
      await Weather.findByIdAndUpdate(weather._id, { $set: updateData });
      
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

      // Apply weather damage if not already applied (same logic as daily-weather)
      // When fallback posts weather, damage must also be applied or villages get no "damaged" message
      if (!weather.weatherDamageApplied) {
        try {
          const damageBreakdown = calculateWeatherDamage(weather);
          const damageAmount = damageBreakdown.total;
          if (damageAmount > 0) {
            const weatherCause = buildWeatherDamageCause(weather, damageBreakdown);
            await damageVillage(village, damageAmount, weatherCause);
            logger.success('SCHEDULED', `weather-fallback-check: Applied weather damage to ${village}: ${damageAmount} HP (Wind: ${damageBreakdown.wind}, Precipitation: ${damageBreakdown.precipitation}, Special: ${damageBreakdown.special})`);
          } else {
            logger.info('SCHEDULED', `weather-fallback-check: ${village} - no damage conditions met`);
          }
          const Weather = require('@/models/WeatherModel');
          await Weather.findByIdAndUpdate(weather._id, { $set: { weatherDamageApplied: true } });
        } catch (damageErr) {
          logger.error('SCHEDULED', `weather-fallback-check: Weather damage application failed for ${village}: ${damageErr.message}`);
        }
      }

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
    
    await renameChannels(client);
    
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

// ------------------- bloodmoon-end-announcement (8am EST = 13:00 UTC, day after blood moon) -------------------
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

// ------------------- bloodmoon-channel-revert (8am EST = 13:00 UTC) -------------------
async function bloodmoonChannelRevert(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'bloodmoon-channel-revert: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'bloodmoon-channel-revert: starting');
    await revertChannelNames(client);
    logger.success('SCHEDULED', 'bloodmoon-channel-revert: done');
  } catch (err) {
    logger.error('SCHEDULED', `bloodmoon-channel-revert: ${err.message}`);
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

// Helper: get today's month (1-12) and day (1-31) in Eastern time (EST = UTC-5) for consistent "midnight Eastern" semantics
function getTodayMonthDayEastern() {
  const now = new Date();
  const estOffset = 5 * 60 * 60 * 1000; // EST is UTC-5
  const estNow = new Date(now.getTime() - estOffset);
  return {
    month: estNow.getUTCMonth() + 1,
    day: estNow.getUTCDate()
  };
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
    
    // Use Eastern date so "today" is the calendar day at midnight Eastern
    const { month, day } = getTodayMonthDayEastern();
    
    // Find all users with birthdays today
    const birthdayUsers = await User.find({
      'birthday.month': month,
      'birthday.day': day
    });
    
    // Find all characters with birthdays today — match "MM-DD", "M-D", and optional surrounding whitespace
    const todayBirthdayStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const birthdayRegex = new RegExp(`^\\s*0?${month}-0?${day}\\s*$`);
    const characterBirthdayFilter = {
      $and: [
        { birthday: { $exists: true, $ne: '' } },
        { birthday: { $regex: birthdayRegex } }
      ]
    };
    const [birthdayCharactersRegular, birthdayCharactersMod] = await Promise.all([
      Character.find(characterBirthdayFilter),
      ModCharacter.find(characterBirthdayFilter)
    ]);
    const birthdayCharacters = [...birthdayCharactersRegular, ...birthdayCharactersMod];
    
    logger.info('SCHEDULED', `birthday-announcements: date (Eastern) ${todayBirthdayStr}, found ${birthdayUsers.length} user(s), ${birthdayCharacters.length} character(s)`);
    
    if (birthdayUsers.length === 0 && birthdayCharacters.length === 0) {
      logger.info('SCHEDULED', 'birthday-announcements: No birthdays today — skipping post');
      return;
    }
    
    // Build announcement content
    let description = '**@everyone**\n\n';
    
    // User birthdays (with rewards)
    if (birthdayUsers.length > 0) {
      const userMentions = birthdayUsers.map(user => `<@${user.discordId}>`).join(' ');
      description += `🎂 **User Birthdays:**\n${userMentions}\n\n🎁 **It's your birthday!** Use \`/birthday claim\` to get your rewards!\n\n**Choose one:**\n• 💰 1500 tokens\n• 🛍️ 75% shop discount\n\n`;
    }
    
    // Character birthdays: single source for embed copy, blessing, random gift (cakes or 1% Spirit Orb)
    const characterBirthdayConfig = {
      cakes: ['Carrot Cake', 'Fruit Cake', 'Monster Cake', 'Nut Cake'],
      blessings: [
        "May Din's flame warm your path and her strength guard you through another year.",
        "May Nayru's light guide your steps and her wisdom grace every choice you make.",
        "May Farore's wind carry you onward and her courage steady your heart."
      ],
      line: (blessing) => `🎂 **Happy birthday!** *${blessing}* Here's a cake! 🎂`
    };
    const characterGiftLines = [];
    if (birthdayCharacters.length > 0) {
      const blessing = characterBirthdayConfig.blessings[Math.floor(Math.random() * characterBirthdayConfig.blessings.length)];
      for (const char of birthdayCharacters) {
        const isSpiritOrb = Math.random() < 0.01;
        const itemName = isSpiritOrb ? 'Spirit Orb' : characterBirthdayConfig.cakes[Math.floor(Math.random() * characterBirthdayConfig.cakes.length)];
        try {
          await addItemInventoryDatabase(char._id, itemName, 1, null, 'Character Birthday');
          characterGiftLines.push(`**${char.name}** received **${itemName}**`);
        } catch (err) {
          logger.error('SCHEDULED', `birthday-announcements: Failed to add ${itemName} to ${char.name}: ${err.message}`);
          characterGiftLines.push(`**${char.name}** — gift could not be delivered`);
        }
      }
      const characterNames = birthdayCharacters.map(c => `**${c.name}**`).join(', ');
      description += `🎭 **Character Birthdays:**\n${characterNames}\n\n`;
      description += characterBirthdayConfig.line(blessing) + '\n\n';
      description += characterGiftLines.join('\n');
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle('🎂 Happy Birthday! 🎉')
      .setDescription(description.trim())
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setTimestamp();
    if (birthdayCharacters.length > 0 && birthdayCharacters[0].icon) {
      embed.setThumbnail(birthdayCharacters[0].icon);
    }
    
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
    
    // Clear expired boosts so "boosted yesterday" does not still apply on the new roll day
    const { updatedCount: boostUpdated, clearedCount: boostCleared } = await clearExpiredAcceptedBoosts();
    if (boostUpdated > 0 || boostCleared > 0) {
      logger.info('SCHEDULED', `reset-daily-rolls: cleared ${boostUpdated} expired boosts, ${boostCleared} character.boostedBy`);
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
async function generateDailyQuests(client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'generate-daily-quests: starting');
    await runHelpWantedGeneration();
    // Run board check immediately after generation so midnight-scheduled quests get posted.
    // Without this, a race condition at 05:00 UTC can cause help-wanted-board-check to run
    // before generation finishes, missing the new quests until the next hourly run.
    if (client?.channels) {
      await helpWantedBoardCheck(client, {});
    }
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

    const characters = await fetchAllCharacters();
    if (!characters || characters.length === 0) {
      logger.info('SCHEDULED', 'weekly-inventory-snapshot: no characters found, skipping');
      return;
    }

    const db = await connectToInventoriesNative();
    const snapshotsColl = db.collection('inventory_snapshots');
    const snapshotAt = new Date();
    let saved = 0;
    let skipped = 0;
    let failed = 0;

    for (const character of characters) {
      try {
        const collection = await getCharacterInventoryCollection(character.name);
        const items = await collection.find({}).toArray();
        // Optional: strip _id from item copies so snapshot docs are self-contained and no ID clashes
        const itemsCopy = items.map(({ _id, ...item }) => ({ ...item }));

        await snapshotsColl.insertOne({
          characterId: character._id,
          characterName: character.name,
          snapshotAt,
          items: itemsCopy,
          itemCount: itemsCopy.length
        });
        saved++;
      } catch (err) {
        // Collection might not exist yet for new characters, or name might be invalid
        if (err.message && (err.message.includes('not found') || err.message.includes('collection'))) {
          skipped++;
        } else {
          failed++;
          logger.warn('SCHEDULED', `weekly-inventory-snapshot: failed for ${character.name}: ${err.message}`);
        }
      }
    }

    logger.success('SCHEDULED', `weekly-inventory-snapshot: done (saved=${saved}, skipped=${skipped}, failed=${failed})`);
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
        
        // Calculate tokens (1 boost = 1000 tokens)
        const boostCount = 1; // Each member with premiumSince has 1 boost
        const tokens = boostCount * 1000;
        const balanceBefore = user.tokens || 0;
        const balanceAfter = balanceBefore + tokens;
        
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
        user.tokens = balanceAfter;
        
        await user.save();
        rewardedCount++;
        
        // Log to TokenTransactionModel for tracking/analytics
        try {
          await TokenTransaction.createTransaction({
            userId,
            amount: tokens,
            type: 'earned',
            category: 'nitro_boost',
            description: `Monthly Nitro Boost reward (${currentMonth})`,
            link: '',
            balanceBefore,
            balanceAfter
          });
        } catch (logErr) {
          logger.error('SCHEDULED', `monthly-nitro-boost-rewards: Failed to log transaction for ${userId}: ${logErr.message}`);
        }
        
        logger.info('SCHEDULED', `monthly-nitro-boost-rewards: Rewarded ${userId} with ${tokens} tokens`);
      } catch (err) {
        logger.error('SCHEDULED', `monthly-nitro-boost-rewards: Failed for user ${userId}: ${err.message}`);
      }
    }
    
    // Post announcement to community board channel
    const communityBoardChannel = await client.channels.fetch(COMMUNITY_BOARD_CHANNEL_ID).catch(() => null);
    if (communityBoardChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('💜 Monthly Nitro Boost Rewards')
        .setDescription(
          rewardedCount > 0
            ? `Thank you to our **${rewardedCount}** server booster${rewardedCount !== 1 ? 's' : ''}! Each has received **1000 tokens** for boosting this month.`
            : 'No new boost rewards were distributed this month. Thank you to everyone who boosts the server!'
        )
        .setTimestamp();
      await communityBoardChannel.send({ embeds: [embed] }).catch(err => {
        logger.error('SCHEDULED', `monthly-nitro-boost-rewards: Failed to post to community board: ${err.message}`);
      });
    } else {
      logger.warn('SCHEDULED', 'monthly-nitro-boost-rewards: Community board channel not found, announcement not posted');
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
    
    const { updateQuestEmbed, postQuestToDiscord, verifyQuestMessageExists, isQuestExpired } = require('@/modules/helpWantedModule');
    
    // Get today's date string (YYYY-MM-DD format in UTC)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Only check quests from today (active quests that might need updates)
    // Yesterday's quests are already expired and won't change
    // Check quests that claim to be posted (have messageId/channelId or postedToDiscord flag)
    const postedQuests = await HelpWantedQuest.find({
      date: today,
      $or: [
        { postedToDiscord: true },
        { messageId: { $exists: true, $ne: null } },
        { channelId: { $exists: true, $ne: null } }
      ]
    });
    
    let updatedCount = 0;
    let skippedCount = 0;
    let repostedCount = 0;
    let errorCount = 0;
    
    // Update each quest's embed only if it's been completed (status changed)
    // Also verify messages actually exist and repost if missing
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
          
          // Verify the message actually exists in Discord
          const messageExists = await verifyQuestMessageExists(client, freshQuest);
          if (!messageExists) {
            // Message doesn't exist - clear IDs and postedToDiscord flag, then repost
            logger.warn('SCHEDULED', `help-wanted-board-check: message ${freshQuest.messageId} not found for quest ${freshQuest.questId}, reposting`);
            freshQuest.messageId = null;
            freshQuest.channelId = null;
            freshQuest.postedToDiscord = false;
            await freshQuest.save();
            
            // Repost the quest
            const message = await postQuestToDiscord(client, freshQuest);
            if (message) {
              repostedCount++;
              logger.info('SCHEDULED', `help-wanted-board-check: reposted quest ${freshQuest.questId} for ${freshQuest.village}`);
            } else {
              errorCount++;
              logger.error('SCHEDULED', `help-wanted-board-check: failed to repost quest ${freshQuest.questId}`);
            }
            continue;
          }
          
          // Only update if quest has been completed (status changed)
          // We don't need to update available quests every hour - only when something changes
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
    
    // Find unposted quests that should be posted (from today, not postedToDiscord or missing messageId/channelId)
    const unpostedQuests = await HelpWantedQuest.find({
      date: today,
      $or: [
        { postedToDiscord: false },
        { messageId: { $exists: false } },
        { messageId: null },
        { channelId: { $exists: false } },
        { channelId: null }
      ]
    });
    
    let postedCount = 0;
    let skippedTimeCount = 0;
    
    if (unpostedQuests && unpostedQuests.length > 0) {
      logger.info('SCHEDULED', `help-wanted-board-check: found ${unpostedQuests.length} unposted quest(s) to check`);
      
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
          
          // Check if scheduled time has passed - only post if time has passed
          if (!hasScheduledTimePassed(freshQuest.scheduledPostTime)) {
            skippedTimeCount++;
            logger.debug('SCHEDULED', `help-wanted-board-check: skipping quest ${freshQuest.questId} - scheduled time ${freshQuest.scheduledPostTime} has not passed yet`);
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
    if (repostedCount > 0) summary.push(`reposted ${repostedCount} quest(s) (message missing)`);
    if (skippedTimeCount > 0) summary.push(`skipped ${skippedTimeCount} quest(s) (time not reached)`);
    if (postedCount > 0) summary.push(`posted ${postedCount} quest(s)`);
    if (errorCount > 0) summary.push(`${errorCount} error(s)`);
    
    const summaryText = summary.length > 0 ? summary.join(', ') : 'no changes';
    logger.success('SCHEDULED', `help-wanted-board-check: done (${summaryText})`);
  } catch (err) {
    logger.error('SCHEDULED', `help-wanted-board-check: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Startup Tasks -------------------
// ============================================================================

// ------------------- postUnpostedQuestsOnStartup -------------------
// Posts any unposted quests from today when the bot starts up
async function postUnpostedQuestsOnStartup(client) {
  try {
    logger.info('STARTUP', 'postUnpostedQuestsOnStartup: starting');
    
    if (!client?.channels) {
      logger.error('STARTUP', 'postUnpostedQuestsOnStartup: Discord client not available');
      return;
    }
    
    const { postQuestToDiscord, verifyQuestMessageExists } = require('@/modules/helpWantedModule');
    
    // Get today's and yesterday's date strings (YYYY-MM-DD format in UTC)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Check how many quests exist for today and yesterday
    const allRecentQuests = await HelpWantedQuest.find({ 
      date: { $in: [today, yesterdayStr] }
    });
    logger.info('STARTUP', `postUnpostedQuestsOnStartup: found ${allRecentQuests.length} quest(s) total for today (${today}) and yesterday (${yesterdayStr})`);
    
    if (allRecentQuests.length === 0) {
      logger.info('STARTUP', 'postUnpostedQuestsOnStartup: no quests generated for today or yesterday yet');
      return;
    }
    
    // First, check quests that claim to be posted but might have missing messages (from today and yesterday)
    const postedQuests = await HelpWantedQuest.find({
      date: { $in: [today, yesterdayStr] },
      $or: [
        { postedToDiscord: true },
        { messageId: { $exists: true, $ne: null } },
        { channelId: { $exists: true, $ne: null } }
      ]
    });
    
    let repostedCount = 0;
    let verifiedCount = 0;
    
    // Verify posted quests actually have valid messages and repost if missing
    if (postedQuests && postedQuests.length > 0) {
      logger.info('STARTUP', `postUnpostedQuestsOnStartup: verifying ${postedQuests.length} posted quest(s) from today`);
      
      for (const quest of postedQuests) {
        try {
          // Refresh from database
          const freshQuest = await HelpWantedQuest.findById(quest._id);
          if (!freshQuest) {
            logger.warn('STARTUP', `postUnpostedQuestsOnStartup: quest ${quest.questId} not found in database`);
            continue;
          }
          
          const messageExists = await verifyQuestMessageExists(client, freshQuest);
          if (!messageExists) {
            // Message doesn't exist - clear IDs and repost immediately
            logger.warn('STARTUP', `postUnpostedQuestsOnStartup: message ${freshQuest.messageId} not found for quest ${freshQuest.questId}, reposting`);
            freshQuest.messageId = null;
            freshQuest.channelId = null;
            freshQuest.postedToDiscord = false;
            await freshQuest.save();
            
            // Skip if quest is already completed
            if (freshQuest.completed) {
              logger.debug('STARTUP', `postUnpostedQuestsOnStartup: skipping completed quest ${freshQuest.questId}`);
              continue;
            }
            
            // Repost immediately
            const message = await postQuestToDiscord(client, freshQuest);
            if (message) {
              repostedCount++;
              logger.info('STARTUP', `postUnpostedQuestsOnStartup: reposted quest ${freshQuest.questId} for ${freshQuest.village}`);
            } else {
              logger.error('STARTUP', `postUnpostedQuestsOnStartup: failed to repost quest ${freshQuest.questId}`);
            }
          } else {
            verifiedCount++;
          }
        } catch (err) {
          logger.error('STARTUP', `postUnpostedQuestsOnStartup: error verifying quest ${quest.questId}: ${err.message}`);
        }
      }
    }
    
    // Find unposted quests from today and yesterday (ones that were never posted)
    // Only post yesterday's quests if they haven't expired yet (check scheduledPostTime)
    const currentHour = now.getUTCHours();
    const unpostedQuests = await HelpWantedQuest.find({
      date: { $in: [today, yesterdayStr] },
      $or: [
        { postedToDiscord: false },
        { messageId: { $exists: false } },
        { messageId: null },
        { channelId: { $exists: false } },
        { channelId: null }
      ]
    });
    
    // Filter out quests that haven't reached their scheduled time yet, and yesterday's quests that have expired
    // Quests expire at midnight EST (05:00 UTC) on the day after they were posted
    // So a quest from yesterday (2026-01-27) expires at 05:00 UTC today (2026-01-28)
    const validUnpostedQuests = unpostedQuests.filter(quest => {
      // First check: scheduled time must have passed
      if (!hasScheduledTimePassed(quest.scheduledPostTime)) {
        logger.debug('STARTUP', `postUnpostedQuestsOnStartup: skipping quest ${quest.questId} - scheduled time ${quest.scheduledPostTime} has not passed yet`);
        return false;
      }
      
      if (quest.date === today) {
        // Today's quests are valid to post if scheduled time has passed
        return true;
      }
      
      // For yesterday's quests, check if we're past midnight EST (05:00 UTC today)
      // If current time is before 05:00 UTC today, the quest hasn't expired yet
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();
      const midnightEST = 5; // Midnight EST = 05:00 UTC
      
      if (currentHour < midnightEST || (currentHour === midnightEST && currentMinute === 0)) {
        // Before midnight EST today, so yesterday's quests are still valid
        return true;
      }
      
      // Past midnight EST, so yesterday's quests have expired
      logger.debug('STARTUP', `postUnpostedQuestsOnStartup: skipping expired quest ${quest.questId} from ${quest.date}`);
      return false;
    });
    
    let postedCount = 0;
    let errorCount = 0;
    let skippedExpiredCount = 0;
    
    if (validUnpostedQuests && validUnpostedQuests.length > 0) {
      if (validUnpostedQuests.length < unpostedQuests.length) {
        skippedExpiredCount = unpostedQuests.length - validUnpostedQuests.length;
        logger.info('STARTUP', `postUnpostedQuestsOnStartup: found ${unpostedQuests.length} unposted quest(s), ${skippedExpiredCount} expired, ${validUnpostedQuests.length} valid to post`);
      } else {
        logger.info('STARTUP', `postUnpostedQuestsOnStartup: found ${validUnpostedQuests.length} unposted quest(s) to post`);
      }
      
      for (const quest of validUnpostedQuests) {
        try {
          // Refresh quest from database
          const freshQuest = await HelpWantedQuest.findById(quest._id);
          if (!freshQuest) {
            logger.warn('STARTUP', `postUnpostedQuestsOnStartup: quest ${quest.questId} not found in database`);
            continue;
          }
          
          // Skip if quest is already completed (shouldn't happen, but safety check)
          if (freshQuest.completed) {
            logger.debug('STARTUP', `postUnpostedQuestsOnStartup: skipping completed quest ${freshQuest.questId}`);
            continue;
          }
          
          // Post the quest to Discord
          const message = await postQuestToDiscord(client, freshQuest);
          if (message) {
            postedCount++;
            logger.info('STARTUP', `postUnpostedQuestsOnStartup: posted quest ${freshQuest.questId} for ${freshQuest.village}`);
          } else {
            errorCount++;
            logger.error('STARTUP', `postUnpostedQuestsOnStartup: failed to post quest ${freshQuest.questId}`);
          }
        } catch (err) {
          errorCount++;
          logger.error('STARTUP', `postUnpostedQuestsOnStartup: failed to post quest ${quest.questId}: ${err.message}`);
          // Continue with other quests even if one fails
        }
      }
    }
    
    const summary = [];
    if (verifiedCount > 0) summary.push(`verified ${verifiedCount} quest(s) are posted`);
    if (repostedCount > 0) summary.push(`reposted ${repostedCount} quest(s) (message missing)`);
    if (postedCount > 0) summary.push(`posted ${postedCount} new quest(s)`);
    if (skippedExpiredCount > 0) summary.push(`skipped ${skippedExpiredCount} expired quest(s)`);
    if (errorCount > 0) summary.push(`${errorCount} error(s)`);
    
    if (summary.length > 0) {
      logger.success('STARTUP', `postUnpostedQuestsOnStartup: done (${summary.join(', ')})`);
    } else {
      logger.info('STARTUP', 'postUnpostedQuestsOnStartup: done (no quests to post)');
    }
  } catch (err) {
    logger.error('STARTUP', `postUnpostedQuestsOnStartup: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Raid/Village Tasks -------------------
// ============================================================================
// Raid expiration is enforced in two ways (raid duration varies by tier, e.g. 10–20 mins):
// 1. One-time Agenda job (raid-expiration): scheduled per raid at expiresAt; runs when time is over.
// 2. Cleanup (raid-expiration-cleanup): every 5 min, finds raids where expiresAt has passed and expires them.
//    Covers restarts and missed jobs. Uses Raid.findExpiredRaids() so we only process raids past their time.

// ------------------- raid-expiration (One-time job: runs when this raid's time is over) -------------------
async function raidExpiration(client, data = {}) {
  try {
    const { raidId } = data;
    if (!raidId) {
      logger.error('SCHEDULED', `${RAID_EXPIRATION_JOB_NAME}: Missing raidId in job data`);
      return;
    }

    logger.info('SCHEDULED', `${RAID_EXPIRATION_JOB_NAME}: Processing expiration for raid ${raidId}`);
    await checkRaidExpiration(raidId, client);
  } catch (err) {
    logger.error('SCHEDULED', `${RAID_EXPIRATION_JOB_NAME}: ${err.message}`);
  }
}

// ------------------- raid-turn-skip (One-time job: 1 minute passed without roll; skip current turn, maybe remove) -------------------
// Only skips when at least 60 seconds have elapsed since scheduledAt (same process clock). Ignores Agenda nextRunAt
// so we never skip early even if Agenda runs the job too soon or server clock is wrong.
async function raidTurnSkip(client, data = {}) {
  try {
    const { raidId, characterId, scheduledAt } = data;
    if (!raidId || !characterId) {
      logger.error('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Missing raidId or characterId`);
      return;
    }
    const now = Date.now();
    const MIN_ELAPSED_MS = 60000; // Do not skip until 60 full seconds (1 minute) have passed since schedule
    const scheduledAtMs = typeof scheduledAt === 'number' ? scheduledAt : 0;
    if (scheduledAtMs <= 0) {
      logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} — job has no scheduledAt (stale or pre-fix), rescheduling fresh 1m`);
      await scheduleRaidTurnSkip(raidId);
      return;
    }
    const elapsedMs = now - scheduledAtMs;
    if (elapsedMs < MIN_ELAPSED_MS) {
      logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} — only ${Math.round(elapsedMs / 1000)}s elapsed (need ${MIN_ELAPSED_MS / 1000}s), rescheduling; skip deferred`);
      await scheduleRaidTurnSkip(raidId);
      return;
    }
    const raid = await Raid.findOne({ raidId, status: 'active' });
    if (!raid || !raid.participants || raid.participants.length === 0) {
      logger.debug('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} not active or no participants`);
      return;
    }
    // If turn already advanced (e.g. they rolled and cancel ran late), just schedule skip for actual current and exit
    const currentTurnParticipant = raid.getCurrentTurnParticipant();
    if (!currentTurnParticipant || currentTurnParticipant.characterId.toString() !== characterId) {
      logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} — turn already advanced, scheduling skip for current player`);
      await scheduleRaidTurnSkip(raidId);
      return;
    }
    const idx = raid.participants.findIndex(p => p.characterId && p.characterId.toString() === characterId);
    if (idx === -1) {
      logger.debug('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Participant ${characterId} not in raid ${raidId} (already removed?)`);
      return;
    }
    const participantName = raid.participants[idx].name;
    const result = await raid.incrementParticipantSkipCountAndMaybeRemove(idx);
    const skipCount = result.participant.skipCount || 1;
    if (!result.removed) {
      await raid.advanceTurn();
    }
    await scheduleRaidTurnSkip(raidId);
    const raidAfter = await Raid.findOne({ raidId, status: 'active' });
    if (result.removed && raidAfter && raidAfter.participants && raidAfter.participants.length > 0) {
      try {
        await applyPartySizeScalingToRaid(raidAfter);
      } catch (scaleErr) {
        logger.warn('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Rescale HP on skip-remove failed: ${scaleErr.message}`);
      }
    }
    const nextParticipant = raidAfter ? raidAfter.getCurrentTurnParticipant() : null;
    const isExpeditionRaid = !!raidAfter?.expeditionId;
    let nextTurnLine = '';
    if (nextParticipant) {
      const nextChar = await Character.findById(nextParticipant.characterId);
      const nextIsKO = nextChar?.ko ?? false;
      const koMsg = isExpeditionRaid
        ? `\n\n💀 **KO'd — it's your turn (**${nextParticipant.name}**).**\n\nPlease use a fairy with </item:1463789335626125378>. To escape, the party retreats together with \`/explore retreat\`.\n\n**New characters can join the raid now** (added at the end of turn order).`
        : `\n\n💀 **KO'd — it's your turn (**${nextParticipant.name}**).**\n\nPlease use a fairy with </item:1463789335626125378>.\nLeave the raid with </raid:1470659276287774734> (raidid, charactername, action: Leave raid).\n\nYou have 1 minute.\n\n**New characters can join the raid now** (added at the end of turn order).`;
      nextTurnLine = nextIsKO ? koMsg : `\n\nIt's your turn (**${nextParticipant.name}**) — you have 1 minute to roll. Use </raid:1470659276287774734> to take your turn.`;
    } else {
      nextTurnLine = '\n\nNext up: No one else in the turn order (raid may be empty or everyone else is KO\'d).';
    }
    const skipLine = result.removed
      ? `**${participantName}** was skipped twice and has been **removed** from the raid.`
      : `**${participantName}** was skipped (${skipCount}/2).`;
    const embedDescription = skipLine + nextTurnLine;
    const content = nextParticipant ? `<@${nextParticipant.userId}>` : null;
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('⏭️ Raid turn skipped')
      .setDescription(embedDescription)
      .setFooter({ text: 'Raid System' })
      .setTimestamp();
    const payload = { embeds: [embed] };
    if (content) payload.content = content;
    const threadId = raidAfter?.threadId;
    const channelId = raidAfter?.channelId;
    let sent = false;
    if (client?.channels) {
      if (threadId) {
        try {
          const thread = await client.channels.fetch(threadId).catch(() => null);
          if (thread) {
            await thread.send(payload);
            sent = true;
          } else {
            logger.warn('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Thread ${threadId} not found for raid ${raidId} (archived or invalid)`);
          }
        } catch (e) {
          logger.warn('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Could not send to thread ${threadId}: ${e.message}`);
        }
      } else {
        logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} has no threadId, skip message not sent`);
      }
      if (!sent && channelId) {
        try {
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            await channel.send(payload);
            sent = true;
            logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Sent skip message to raid channel (thread unavailable) for ${raidId}`);
          }
        } catch (e) {
          logger.warn('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Could not send to channel ${channelId}: ${e.message}`);
        }
      }
    }
    if (!sent) {
      logger.warn('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} — skip message was not sent (no threadId/channelId or send failed)`);
    }
    logger.info('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: Raid ${raidId} — ${participantName} skipped (${skipCount}/2)${result.removed ? ', removed' : ''}`);
  } catch (err) {
    logger.error('SCHEDULED', `${RAID_TURN_SKIP_JOB_NAME}: ${err.message}`);
  }
}

// ------------------- raid-expiration-cleanup (Every 5 minutes: expire raids whose time has passed) -------------------
async function raidExpirationCleanup(client, _data = {}) {
  try {
    logger.debug('SCHEDULED', 'raid-expiration-cleanup: starting');

    // Only raids where expiresAt <= now (time is over); duration varies by tier (10–20 mins)
    const expiredRaids = await Raid.findExpiredRaids();
    let processedCount = 0;
    let failedCount = 0;

    for (const raid of expiredRaids) {
      try {
        await checkRaidExpiration(raid.raidId, client);
        processedCount++;
      } catch (err) {
        failedCount++;
        logger.error('SCHEDULED', `raid-expiration-cleanup: Failed for raid ${raid.raidId}: ${err.message}`);
      }
    }

    if (expiredRaids.length > 0) {
      logger.info('SCHEDULED', `raid-expiration-cleanup: processed ${processedCount} expired raid(s), ${failedCount} failed`);
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
    const activeQuests = await Quest.find({ status: 'active' });
    let checked = 0;
    let processed = 0;
    for (const quest of activeQuests) {
      try {
        checked++;
        if (!quest.checkTimeExpiration()) continue;
        const result = await quest.checkAutoCompletion(true);
        if (result.completed && result.needsRewardProcessing) {
          await processQuestCompletion(quest.questID);
          await quest.markCompletionProcessed();
          processed++;
        }
      } catch (questErr) {
        logger.error('SCHEDULED', `quest-completion-check: quest ${quest.questID || quest._id}: ${questErr.message}`);
      }
    }
    logger.info('SCHEDULED', `quest-completion-check: done (checked ${checked}, processed ${processed})`);
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

// ------------------- clearExpiredAcceptedBoosts (shared helper) -------------------
// Clears expired accepted boosts (TempData status -> expired, character.boostedBy -> null).
// Used by resetDailyRolls (at daily roll reset) and cleanupBoostExpirations (hourly).
async function clearExpiredAcceptedBoosts() {
  const now = Date.now();
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
      if (data.status !== 'expired') {
        data.status = 'expired';
        boostData.data = data;
        await boostData.save();
        updatedCount++;
      }
      if (data.targetCharacter) {
        const character = await Character.findOne({ name: data.targetCharacter });
        if (character && character.boostedBy) {
          character.boostedBy = null;
          await character.save();
          clearedCount++;
        }
      }
    } catch (err) {
      logger.error('SCHEDULED', `clearExpiredAcceptedBoosts: Failed for boost ${boostData._id}: ${err.message}`);
    }
  }
  return { updatedCount, clearedCount };
}

// ------------------- cleanup-boost-expirations (Every hour) -------------------
// Updates boost status and clears character.boostedBy fields (TTL handles document deletion)
async function cleanupBoostExpirations(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'cleanup-boost-expirations: starting');
    const { updatedCount: acceptedUpdated, clearedCount } = await clearExpiredAcceptedBoosts();
    let updatedCount = acceptedUpdated;
    const now = Date.now();
    
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

// ------------------- submission-mod-reminder (Every hour) -------------------
// @s the mod role in the approval channel if an art/writing submission hasn't been approved within 12 hours
async function submissionModReminder(client, _data = {}) {
  if (!client?.channels) {
    logger.error('SCHEDULED', 'submission-mod-reminder: Discord client not available');
    return;
  }
  try {
    logger.info('SCHEDULED', 'submission-mod-reminder: starting');

    if (!MOD_ROLE_ID) {
      logger.warn('SCHEDULED', 'submission-mod-reminder: MOD_ROLE_ID not configured, skipping');
      return;
    }

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel?.isTextBased()) {
      logger.warn('SCHEDULED', 'submission-mod-reminder: Approval channel not found or not text-based');
      return;
    }

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const pendingSubmissions = await TempData.findAllByType('submission');

    const toRemind = pendingSubmissions.filter((doc) => {
      const d = doc.data || {};
      if (!d.pendingNotificationMessageId) return false;
      if (d.modReminderSentAt) return false;
      const updatedAt = d.updatedAt ? new Date(d.updatedAt) : null;
      if (!updatedAt || updatedAt > twelveHoursAgo) return false;
      return true;
    });

    let remindedCount = 0;
    for (const doc of toRemind) {
      const submissionId = doc.key;
      const data = doc.data || {};
      const notificationMessageId = data.pendingNotificationMessageId;

      try {
        const notificationMessage = await approvalChannel.messages.fetch(notificationMessageId).catch(() => null);
        if (!notificationMessage) {
          logger.warn('SCHEDULED', `submission-mod-reminder: Notification message not found for submission ${submissionId}`);
          continue;
        }

        await notificationMessage.reply({
          content: `<@&${MOD_ROLE_ID}> This submission has been pending for 12+ hours and needs approval.`,
        });

        await updateSubmissionData(submissionId, { modReminderSentAt: new Date() });
        remindedCount++;
        logger.info('SCHEDULED', `submission-mod-reminder: Sent mod reminder for submission ${submissionId}`);
      } catch (err) {
        logger.error('SCHEDULED', `submission-mod-reminder: Failed for submission ${submissionId}: ${err.message}`);
      }
    }

    logger.success('SCHEDULED', `submission-mod-reminder: done (reminded mods for ${remindedCount} submission(s))`);
  } catch (err) {
    logger.error('SCHEDULED', `submission-mod-reminder: ${err.message}`);
  }
}

// ============================================================================
// ------------------- Relic Deadline Tasks -------------------
// ============================================================================

// Deteriorate unappraised relics past 7 days from discovery
async function relicAppraisalDeadline(client, _data = {}) {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const relics = await RelicModel.find({
      appraised: false,
      deteriorated: false,
      discoveredDate: { $lt: cutoff },
    }).lean();
    for (const r of relics) {
      try {
        await markRelicDeteriorated(r._id);
        logger.info('SCHEDULED', `relic-appraisal-deadline: Deteriorated relic ${r.relicId || r._id} (discovered ${r.discoveredDate})`);
      } catch (e) {
        logger.error('SCHEDULED', `relic-appraisal-deadline: Failed for ${r._id}: ${e?.message || e}`);
      }
    }
    if (relics.length > 0) {
      logger.success('SCHEDULED', `relic-appraisal-deadline: Deteriorated ${relics.length} relic(s)`);
    }
  } catch (err) {
    logger.error('SCHEDULED', `relic-appraisal-deadline: ${err.message}`);
  }
}

// Mark appraised relics as lost if art not submitted within 2 months
async function relicArtDeadline(client, _data = {}) {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 2 months
    const relics = await RelicModel.find({
      appraised: true,
      artSubmitted: false,
      archived: false,
      deteriorated: false,
      appraisalDate: { $lt: cutoff },
    }).lean();
    for (const r of relics) {
      try {
        await RelicModel.findByIdAndUpdate(r._id, { deteriorated: true });
        logger.info('SCHEDULED', `relic-art-deadline: Marked relic ${r.relicId || r._id} as lost (art deadline passed)`);
      } catch (e) {
        logger.error('SCHEDULED', `relic-art-deadline: Failed for ${r._id}: ${e?.message || e}`);
      }
    }
    if (relics.length > 0) {
      logger.success('SCHEDULED', `relic-art-deadline: Marked ${relics.length} relic(s) as lost`);
    }
  } catch (err) {
    logger.error('SCHEDULED', `relic-art-deadline: ${err.message}`);
  }
}

// Send map coordinates DM for approved map appraisal requests (e.g. NPC approved on dashboard)
async function mapAppraisalSendCoordinatesDm(client, _data = {}) {
  try {
    const MapAppraisalRequest = require('@/models/MapAppraisalRequestModel.js');
    const OldMapFound = require('@/models/OldMapFoundModel.js');
    const { getOldMapByNumber, OLD_MAP_ICON_URL, OLD_MAPS_LINK, MAP_EMBED_BORDER_URL } = require('@/data/oldMaps.js');
    const { sendDiscordDM } = require('@/utils/notificationService.js');

    const requests = await MapAppraisalRequest.find({
      status: 'approved',
      coordinatesDmSentAt: null,
    }).lean();
    for (const req of requests) {
      try {
        const mapDoc = await OldMapFound.findById(req.oldMapFoundId).lean();
        if (!mapDoc) continue;
        const mapInfo = getOldMapByNumber(mapDoc.mapNumber);
        const coordinates = mapInfo ? mapInfo.coordinates : '—';
        const mapLabel = `Map #${mapDoc.mapNumber}`;
        let desc = `Your old map has been deciphered.\n\n**${mapLabel}**\n**Coordinates:** ${coordinates}`;
        if (mapInfo && mapInfo.leadsTo) desc += `\n**Leads to:** ${mapInfo.leadsTo}`;
        const dmEmbed = {
          title: '🗺️ Map appraised — your coordinates',
          description: desc,
          color: 0x2ecc71,
          thumbnail: { url: OLD_MAP_ICON_URL },
          image: { url: MAP_EMBED_BORDER_URL },
          footer: { text: 'Roots of the Wild • Old Maps' },
          url: OLD_MAPS_LINK,
        };
        const sent = await sendDiscordDM(req.mapOwnerUserId, dmEmbed);
        await MapAppraisalRequest.updateOne(
          { _id: req._id },
          { $set: { coordinatesDmSentAt: sent ? new Date() : null, updatedAt: new Date() } }
        );
        if (sent) logger.info('SCHEDULED', `map-appraisal-dm: Sent coordinates to ${req.mapOwnerUserId} for request ${req._id}`);
      } catch (e) {
        logger.error('SCHEDULED', `map-appraisal-dm: Failed request ${req._id}: ${e?.message || e}`);
      }
    }
  } catch (err) {
    logger.error('SCHEDULED', `map-appraisal-dm: ${err.message}`);
  }
}

// ------------------- maze-images-cleanup (Daily: delete maze PNGs older than 1 week) -------------------
const MAZE_IMAGES_DIR = path.join(__dirname, '..', 'scripts', 'example-mazes');
const MAZE_IMAGES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

async function mazeImagesCleanup(_client, _data = {}) {
  try {
    logger.info('SCHEDULED', 'maze-images-cleanup: starting');
    if (!fs.existsSync(MAZE_IMAGES_DIR)) {
      logger.debug('SCHEDULED', 'maze-images-cleanup: directory does not exist, skip');
      return;
    }
    const now = Date.now();
    const entries = fs.readdirSync(MAZE_IMAGES_DIR, { withFileTypes: true });
    let deleted = 0;
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!/\.(png|jpg|jpeg|webp)$/i.test(ent.name)) continue;
      const fullPath = path.join(MAZE_IMAGES_DIR, ent.name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > MAZE_IMAGES_MAX_AGE_MS) {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch (e) {
        logger.warn('SCHEDULED', `maze-images-cleanup: failed to process ${ent.name}: ${e?.message || e}`);
      }
    }
    if (deleted > 0) logger.info('SCHEDULED', `maze-images-cleanup: deleted ${deleted} file(s) older than 1 week`);
    logger.success('SCHEDULED', 'maze-images-cleanup: done');
  } catch (err) {
    logger.error('SCHEDULED', `maze-images-cleanup: ${err?.message || err}`);
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
  { name: 'bloodmoon-end-announcement', cron: '0 13 * * *', handler: bloodmoonEndAnnouncement }, // 8am EST = 13:00 UTC (day after blood moon)
  { name: 'bloodmoon-channel-revert', cron: '0 13 * * *', handler: bloodmoonChannelRevert }, // 8am EST = 13:00 UTC
  { name: 'bloodmoon-cleanup', cron: '0 6 * * *', handler: bloodmoonCleanup }, // 1am EST = 06:00 UTC
  
  // Blight Tasks
  { name: 'blight-roll-call', cron: '0 1 * * *', handler: blightRollCall }, // 8pm EST = 01:00 UTC
  { name: 'blight-roll-call-check', cron: '59 0 * * *', handler: blightRollCallCheck }, // 7:59pm EST = 00:59 UTC, 1 min before call
  
  // Birthday Tasks (all at 12am EST = 05:00 UTC)
  { name: 'birthday-assign-role', cron: '0 5 * * *', handler: birthdayAssignRole },
  { name: 'birthday-remove-role', cron: '0 5 * * *', handler: birthdayRemoveRole },
  { name: 'birthday-announcements', cron: '0 5 * * *', handler: birthdayAnnouncements },
  
  // Daily Reset Tasks (gather/loot daily roll at 8am EST = 13:00 UTC; others at 12am EST = 05:00 UTC)
  { name: 'reset-daily-rolls', cron: '0 13 * * *', handler: resetDailyRolls }, // 8am EST
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
  { name: RAID_EXPIRATION_JOB_NAME, cron: null, handler: raidExpiration }, // One-time job (scheduled per raid)
  { name: RAID_TURN_SKIP_JOB_NAME, cron: null, handler: raidTurnSkip }, // One-time job (1 minute per turn)
  { name: 'raid-expiration-cleanup', cron: '*/5 * * * *', handler: raidExpirationCleanup }, // Every 5 minutes
  { name: 'village-raid-quota-check', cron: '0 * * * *', handler: villageRaidQuotaCheck }, // Every hour
  { name: 'quest-completion-check', cron: '0 */6 * * *', handler: questCompletionCheck }, // Every 6 hours
  { name: 'village-tracking-check', cron: '0 */2 * * *', handler: villageTrackingCheck }, // Every 2 hours
  
  // Character Timer Tasks
  { name: 'character-timer-poll', cron: '0 */12 * * *', handler: characterTimerPoll }, // Every 12 hours
  
  // Expiration Cleanup Tasks
  { name: 'cleanup-boost-expirations', cron: '0 * * * *', handler: cleanupBoostExpirations }, // Every hour
  { name: 'blight-expiration-warnings', cron: '0 */6 * * *', handler: blightExpirationWarnings }, // Every 6 hours
  { name: 'submission-mod-reminder', cron: '0 * * * *', handler: submissionModReminder }, // Every hour - @mods if art/writing pending 12+ hours

  // Relic Deadline Tasks
  { name: 'relic-appraisal-deadline', cron: '0 6 * * *', handler: relicAppraisalDeadline }, // Daily 6am UTC: deteriorate unappraised relics past 7 days
  { name: 'relic-art-deadline', cron: '0 6 * * *', handler: relicArtDeadline }, // Daily 6am UTC: mark relics lost if art not submitted within 2 months

  // Maze images: delete PNGs older than 1 week (bot/scripts/example-mazes/)
  { name: 'maze-images-cleanup', cron: '0 6 * * *', handler: mazeImagesCleanup }, // Daily 6am UTC

  // Map Appraisal: send coordinates DM for approved requests (e.g. NPC on dashboard)
  { name: 'map-appraisal-send-coordinates-dm', cron: '*/10 * * * *', handler: mapAppraisalSendCoordinatesDm } // Every 10 minutes
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
  postUnpostedQuestsOnStartup,
  TASKS 
};
