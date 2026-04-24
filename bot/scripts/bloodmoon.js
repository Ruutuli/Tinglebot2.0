// ------------------- bloodmoon.js -------------------
// This module manages Blood Moon events for the Discord bot. It sends announcements,
// tracks Blood Moon activation, and handles channel renaming during Blood Moon periods.
// The module also provides functions to check Blood Moon activation status and to trigger
// Blood Moon events immediately.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing third-party modules -------------------
const dotenv = require('dotenv');
const path = require('path');
const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
// Try environment-specific file first, then fall back to root .env
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');
const moment = require('moment-timezone');
const SCHEDULE_TZ_EASTERN = 'America/New_York';
// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// Local Modules
// ------------------- Importing custom modules -------------------
const { convertToHyruleanDate, bloodmoonDates, isBloodmoon } = require('../modules/calendarModule');
const BloodMoonTracking = require('@/models/BloodMoonTrackingModel');
const { getWeatherWithoutGeneration } = require('@/services/weatherService');
const { specials } = require('../data/weatherData');

/** Blight Rain town-hall prefix (same as weatherData `specials` emoji). */
const BLIGHT_RAIN_TOWNHALL_PREFIX = '\uD83E\uDE78'; // 🩸
const BLIGHT_RAIN_LABEL = 'Blight Rain';

const TOWNHALL_VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const TOWNHALL_CHANNEL_ENV = {
  Rudania: 'RUDANIA_TOWNHALL',
  Inariko: 'INARIKO_TOWNHALL',
  Vhintl: 'VHINTL_TOWNHALL',
};

// ============================================================================
// Blood Moon Tracking State
// ------------------- Global state to prevent duplicate announcements -------------------

// Helper function to get today's date string for tracking
function getTodayDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper function to check if announcement was already sent today
async function hasAnnouncementBeenSent(channelId, type = 'start') {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.hasAnnouncementBeenSent(channelId, type, today);
  } catch (error) {
    logger.error('BLOODMOON', `Error checking announcement status for ${channelId}`, error);
    return false;
  }
}

// Helper function to mark announcement as sent
async function markAnnouncementAsSent(channelId, type = 'start') {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.markAnnouncementAsSent(channelId, type, today);
  } catch (error) {
    logger.error('BLOODMOON', `Error marking announcement as sent for ${channelId}`, error);
    return false;
  }
}

// Helper function to check if end announcement was already sent today
async function hasEndAnnouncementBeenSent(channelId) {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.hasAnnouncementBeenSent(channelId, 'end', today);
  } catch (error) {
    logger.error('BLOODMOON', `Error checking end announcement status for ${channelId}`, error);
    return false;
  }
}

// Helper function to mark end announcement as sent
async function markEndAnnouncementAsSent(channelId) {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.markAnnouncementAsSent(channelId, 'end', today);
  } catch (error) {
    logger.error('BLOODMOON', `Error marking end announcement as sent for ${channelId}`, error);
    return false;
  }
}

// Helper function to clean up old tracking data
async function cleanupOldTrackingData() {
  try {
    const deletedCount = await BloodMoonTracking.cleanupOldData();
    if (deletedCount > 0) {
      logger.info('CLEANUP', `Cleaned up ${deletedCount} old tracking records`);
    }
    return deletedCount;
  } catch (error) {
    logger.error('BLOODMOON', 'Error cleaning up old tracking data', error);
    return 0;
  }
}

// ============================================================================
// Announcement Functions
// ------------------- sendBloodMoonAnnouncement -------------------
// Sends a Blood Moon announcement embed message to a specified Discord channel.
async function sendBloodMoonAnnouncement(client, channelId, message) {
  try {
    // Check if announcement was already sent today
    if (await hasAnnouncementBeenSent(channelId, 'start')) {
      return;
    }

    // Day-before check uses Eastern calendar date (handles EST/EDT)
    const m = moment.tz(SCHEDULE_TZ_EASTERN);
    const today = m.clone().startOf('day');
    const todayDate = new Date(m.year(), m.month(), m.date());

    logger.info('BLOODMOON', `Checking announcement for channel ${channelId} - Eastern date: ${todayDate.toDateString()} (${m.format('YYYY-MM-DD')})`);
    
    // SAFETY CHECK: Only send announcements if today is specifically the DAY BEFORE a Blood Moon
    // (not during the actual Blood Moon period)
    let isDayBeforeBloodMoon = false;
    let bloodMoonDate = null;
    
    for (const { realDate } of bloodmoonDates) {
      const [month, day] = realDate.split('-').map(Number);
      const currentBloodMoonDate = moment.tz([m.year(), month - 1, day], SCHEDULE_TZ_EASTERN).startOf('day');
      const normalizedDayBefore = currentBloodMoonDate.clone().subtract(1, 'day');

      logger.info('BLOODMOON', `Comparing: Today ${today.format('YYYY-MM-DD')} vs Day Before ${normalizedDayBefore.format('YYYY-MM-DD')} for Blood Moon ${realDate}`);

      if (today.isSame(normalizedDayBefore, 'day')) {
        isDayBeforeBloodMoon = true;
        bloodMoonDate = new Date(m.year(), month - 1, day);
        logger.info('BLOODMOON', `Match found! Today is the day before Blood Moon ${realDate}`);
        break;
      }
    }
    
    // If not the day before a Blood Moon, don't send the announcement
    if (!isDayBeforeBloodMoon) {
      logger.info('BLOODMOON', `Not the day before a Blood Moon - skipping announcement for channel ${channelId}`);
      return;
    }
    
    // Find which Blood Moon period we're in and determine the correct date to show
    let foundBloodMoonPeriod = false;
    
    for (const { realDate } of bloodmoonDates) {
      const [month, day] = realDate.split('-').map(Number);
      const currentBloodMoonDate = moment.tz([m.year(), month - 1, day], SCHEDULE_TZ_EASTERN).startOf('day');
      const dayBefore = currentBloodMoonDate.clone().subtract(1, 'day');
      const dayAfter = currentBloodMoonDate.clone().add(1, 'day');

      if (today.isSameOrAfter(dayBefore, 'day') && today.isSameOrBefore(dayAfter, 'day')) {
        foundBloodMoonPeriod = true;
        if (!bloodMoonDate) {
          bloodMoonDate = new Date(m.year(), month - 1, day);
        }
        break;
      }
    }

    const announcementDate = todayDate;
    const realWorldDate = announcementDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(announcementDate);
    
    // Create date range information for clarity
    let dateRangeInfo = '';
    if (bloodMoonDate) {
      const bloodMoonRealDate = bloodMoonDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const bloodMoonHyruleanDate = convertToHyruleanDate(bloodMoonDate);
      dateRangeInfo = `\n\n📅 **Blood Moon Period:** ${bloodMoonRealDate} (${bloodMoonHyruleanDate})`;
    }

    const embed = new EmbedBuilder()
      .setColor('#8B0000')
      .setAuthor({ name: 'Blood Moon Rising', iconURL: 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/d/dc/HWAoC_Blood_Moon_Icon.png/revision/latest/scale-to-width-down/250?cb=20210328041409' })
      .setDescription(
        `**${message}**\n\n**Beware the monsters, as they are drawn to the moon's red glow.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}${dateRangeInfo}`
      )
      .setImage('https://oyster.ignimgs.com/mediawiki/apis.ign.com/the-legend-of-zelda-hd/e/e7/The_Legend_of_Zelda._Breath_of_the_Wild_Screen_Shot_3-16-17%2C_1.22_PM.png?width=1280')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
    
    // Mark announcement as sent
    await markAnnouncementAsSent(channelId, 'start');
    logger.success('BLOODMOON', `Blood Moon start announcement sent to channel ${channelId}`);
    
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Error sending Blood Moon start announcement to channel ${channelId}: ${error.message}`, error);
  }
}

// ------------------- sendBloodMoonEndAnnouncement -------------------
// Sends an embed message announcing the end of the Blood Moon event.
// Only runs at 8am Eastern on the day AFTER the blood moon date (scheduled task).
async function sendBloodMoonEndAnnouncement(client, channelId) {
  try {
    // Check if end announcement was already sent today
    if (await hasEndAnnouncementBeenSent(channelId)) {
      return;
    }

    const m = moment.tz(SCHEDULE_TZ_EASTERN);
    const todayEst = m.clone().startOf('day');

    let bloodMoonDate = null;

    for (const { realDate } of bloodmoonDates) {
      const [month, day] = realDate.split('-').map(Number);
      const currentBloodMoonDate = moment.tz([m.year(), month - 1, day], SCHEDULE_TZ_EASTERN).startOf('day');
      const dayAfter = currentBloodMoonDate.clone().add(1, 'day');

      if (todayEst.isSame(dayAfter, 'day')) {
        bloodMoonDate = new Date(m.year(), month - 1, day);
        logger.info('BLOODMOON', `Today (Eastern) is day after Blood Moon ${realDate} - sending end announcement`);
        break;
      }
    }

    if (!bloodMoonDate) {
      logger.info('BLOODMOON', 'Today (Eastern) is not the day after a Blood Moon - skipping end announcement');
      return;
    }

    const announcementDate = new Date(m.year(), m.month(), m.date());
    const realWorldDate = announcementDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(announcementDate);
    
    // Create date range information for clarity
    let dateRangeInfo = '';
    if (bloodMoonDate) {
      const bloodMoonRealDate = bloodMoonDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const bloodMoonHyruleanDate = convertToHyruleanDate(bloodMoonDate);
      dateRangeInfo = `\n\n📅 **Blood Moon Period:** ${bloodMoonRealDate} (${bloodMoonHyruleanDate})`;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFFACD')
      .setAuthor({ name: 'Blood Moon Fades', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616456.png' })
      .setDescription(
        `**The Blood Moon has ended... for now.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}${dateRangeInfo}`
      )
      .setImage('https://drive.google.com/uc?export=view&id=1aRe4OR_QbHnlrC-OFCVyvCzkAGRxgDbN')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
    
    // Mark end announcement as sent
    await markEndAnnouncementAsSent(channelId);
    logger.success('BLOODMOON', `Blood Moon end announcement sent to channel ${channelId}`);
    
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Error sending Blood Moon end announcement to channel ${channelId}: ${error.message}`, error);
  }
}


// ============================================================================
// Blood Moon Activation Check
// ------------------- normalizeDate -------------------
// Normalizes a Date object by stripping away time components.
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ------------------- isBloodMoonPeriod -------------------
// Checks if today falls within a Blood Moon period (day before, blood moon date, day after).
// This is independent of the time - it just checks if we're in the 3-day window.
function isBloodMoonPeriod() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    logger.error('BLOODMOON', "'bloodmoonDates' is not defined or not an array");
    return false;
  }

  const today = moment.tz(SCHEDULE_TZ_EASTERN).startOf('day');
  const year = today.year();

  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = moment.tz([year, month - 1, day], SCHEDULE_TZ_EASTERN).startOf('day');
    const dayBefore = bloodMoonDate.clone().subtract(1, 'day');
    const dayAfter = bloodMoonDate.clone().add(1, 'day');
    if (today.isSameOrAfter(dayBefore, 'day') && today.isSameOrBefore(dayAfter, 'day')) {
      return true;
    }
  }

  return false;
}

// ------------------- isBloodMoonDay -------------------
// Checks if Blood Moon is currently active.
// Blood Moon starts at 8 PM Eastern on the day BEFORE the blood moon date and ends at 8 AM Eastern the day AFTER.
// For example: September 3 at 8 PM Eastern until September 5 at 8 AM Eastern.
function isBloodMoonDay() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    logger.error('BLOODMOON', "'bloodmoonDates' is not defined or not an array");
    return false;
  }

  const m = moment.tz(SCHEDULE_TZ_EASTERN);
  const estHour = m.hour();
  const today = m.clone().startOf('day');
  const year = m.year();

  let bloodMoonMoment = null;

  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bm = moment.tz([year, month - 1, day], SCHEDULE_TZ_EASTERN).startOf('day');
    const dayBefore = bm.clone().subtract(1, 'day');
    const dayAfter = bm.clone().add(1, 'day');

    if (today.isSame(dayBefore, 'day') || today.isSame(bm, 'day') || today.isSame(dayAfter, 'day')) {
      bloodMoonMoment = bm;
      break;
    }
  }

  if (!bloodMoonMoment) {
    return false;
  }

  const bm = bloodMoonMoment.clone();
  const dayBefore = bm.clone().subtract(1, 'day');
  const dayAfter = bm.clone().add(1, 'day');

  if (today.isSame(dayBefore, 'day')) {
    return estHour >= 20;
  }
  if (today.isSame(bm, 'day')) {
    return true;
  }
  if (today.isSame(dayAfter, 'day')) {
    return estHour < 8;
  }
  return false;
}


// ============================================================================
// Blood Moon Tracker
// ------------------- trackBloodMoon -------------------
// Checks Blood Moon status and updates channel names and announcements accordingly.
async function trackBloodMoon(client, channelId) {
  if (isBloodMoonDay()) {
    logger.info('BLOODMOON', 'Blood Moon Active');
    await renameChannels(client);
    await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
  } else {
    await revertChannelNames(client);
  }
}


// ============================================================================
// Channel Management Functions
// ------------------- getChannelMappings -------------------
// Returns the appropriate channel mappings based on the current environment
function getChannelMappings() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return {
      [process.env.RUDANIA_TOWNHALL]: '🔥》rudania-townhall',
      [process.env.INARIKO_TOWNHALL]: '💧》inariko-townhall',
      [process.env.VHINTL_TOWNHALL]: '🌱》vhintl-townhall',
    };
  } else {
    return {
      [process.env.RUDANIA_TOWNHALL]: '🔥》rudania-townhall',
      [process.env.INARIKO_TOWNHALL]: '💧》inariko-townhall',
      [process.env.VHINTL_TOWNHALL]: '🌱》vhintl-townhall',
    };
  }
}

// ------------------- getBloodMoonChannelMappings -------------------
// Returns the blood moon channel mappings based on the current environment
function getBloodMoonChannelMappings() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return {
      [process.env.RUDANIA_TOWNHALL]: '🔴🔥》rudania-townhall',
      [process.env.INARIKO_TOWNHALL]: '🔴💧》inariko-townhall',
      [process.env.VHINTL_TOWNHALL]: '🔴🌱》vhintl-townhall',
    };
  } else {
    return {
      [process.env.RUDANIA_TOWNHALL]: '🔴🔥》rudania-townhall',
      [process.env.INARIKO_TOWNHALL]: '🔴💧》inariko-townhall',
      [process.env.VHINTL_TOWNHALL]: '🔴🌱》vhintl-townhall',
    };
  }
}

// ------------------- firstGrapheme -------------------
// First visual emoji/character only (town-hall names must not stack multiple emoji).
function firstGrapheme(s) {
  if (!s) return '';
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of seg.segment(s)) {
      return segment;
    }
  } catch {
    // ignore
  }
  return s;
}

// ------------------- getSpecialTownHallPrefix -------------------
// One emoji prepended to town-hall names when the village has a known special weather (see weatherData specials).
function getSpecialTownHallPrefix(specialLabel) {
  if (!specialLabel || typeof specialLabel !== 'string') {
    return '';
  }
  const trimmed = specialLabel.trim();
  const entry = specials.find((s) => s.label.toLowerCase() === trimmed.toLowerCase());
  if (!entry) {
    return '';
  }
  if (entry.label === BLIGHT_RAIN_LABEL) {
    return BLIGHT_RAIN_TOWNHALL_PREFIX;
  }
  return firstGrapheme(entry.emoji || '');
}

// ------------------- getDesiredTownHallName -------------------
// Picks default vs. Blood Moon name, then prepends a special-weather hint when applicable.
function getDesiredTownHallName(channelId, specialLabel) {
  const defaultNames = getChannelMappings();
  const bloodNames = getBloodMoonChannelMappings();
  const base = isBloodMoonDay() ? bloodNames[channelId] : defaultNames[channelId];
  if (!base) {
    return null;
  }
  const prefix = getSpecialTownHallPrefix(specialLabel);
  return prefix ? `${prefix}${base}` : base;
}

// ------------------- syncTownHallChannelNames -------------------
// Updates all village town-hall channel names to match Blood Moon, active special weather, or normal branding.
async function syncTownHallChannelNames(client) {
  if (!client?.channels) {
    return;
  }
  for (const village of TOWNHALL_VILLAGES) {
    const envKey = TOWNHALL_CHANNEL_ENV[village];
    const channelId = process.env[envKey];
    if (!channelId) {
      continue;
    }
    let specialLabel = null;
    try {
      const w = await getWeatherWithoutGeneration(village);
      specialLabel = w?.special?.label || null;
    } catch (error) {
      handleError(error, 'bloodmoon.js');
      logger.error('BLOODMOON', `Could not read weather for ${village} when syncing town-hall name: ${error.message}`, error);
    }
    const newName = getDesiredTownHallName(channelId, specialLabel);
    if (newName) {
      await changeChannelName(client, channelId, newName);
    }
  }
}

// ------------------- changeChannelName -------------------
// Changes the name of a Discord channel.
async function changeChannelName(client, channelId, newName) {
  try {
    // First check if the channel exists and we have access
    const channel = await client.channels.fetch(channelId).catch(error => {
      if (error.code === 50001) {
        logger.error('BLOODMOON', `Missing permissions for channel ${channelId}`);
      } else if (error.code === 10003) {
        logger.error('BLOODMOON', `Channel ${channelId} not found`);
      } else {
        logger.error('BLOODMOON', `Error accessing channel ${channelId}: ${error.message}`, error);
      }
      return null;
    });

    if (!channel) {
      return; // Exit if channel couldn't be fetched
    }

    // Check if we have permission to manage the channel
    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has('ManageChannels')) {
      logger.error('BLOODMOON', `Bot lacks 'Manage Channels' permission for channel ${channel.name}`);
      return;
    }

    if (channel.name === newName) {
      return;
    }

    // Attempt to change the channel name
    await channel.setName(newName);
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Failed to change channel name: ${error.message}`, error);
  }
}

// ------------------- renameChannels -------------------
// Public hook used by manual Blood Moon triggers: applies full town-hall naming (Blood Moon + special weather where relevant).
async function renameChannels(client) {
  await syncTownHallChannelNames(client);
}

// ------------------- revertChannelNames -------------------
// Reverts to non–Blood-Moon state where applicable; also reflects active special weather in channel names.
async function revertChannelNames(client) {
  await syncTownHallChannelNames(client);
}

// ============================================================================
// Blood Moon Trigger and Status Functions
// ------------------- triggerBloodMoonNow -------------------
// Immediately triggers the Blood Moon event by sending announcements and renaming channels.
async function triggerBloodMoonNow(client, channelId) {
  try {
    logger.info('BLOODMOON', 'Triggering Blood Moon manually');
    await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
    await renameChannels(client);
    logger.success('BLOODMOON', 'Blood Moon triggered successfully');
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Blood Moon trigger failed: ${error.message}`, error);
  }
}

// ------------------- isBloodMoonActive -------------------
// Returns whether the Blood Moon is currently active.
function isBloodMoonActive() {
  try {
    return isBloodMoonDay();
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Blood Moon status check failed: ${error.message}`, error);
    return false;
  }
}


// ============================================================================
// Module Exports
// ------------------- Exporting functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  sendBloodMoonEndAnnouncement,
  trackBloodMoon,
  renameChannels,
  revertChannelNames,
  syncTownHallChannelNames,
  isBloodMoonDay,
  isBloodMoonPeriod,
  triggerBloodMoonNow,
  isBloodMoonActive,
  cleanupOldTrackingData,
  // Debug functions
  getTrackingStatus: async () => await BloodMoonTracking.getTrackingStatus()
};
