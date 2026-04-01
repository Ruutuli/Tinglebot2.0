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

    // Attempt to change the channel name
    await channel.setName(newName);
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    logger.error('BLOODMOON', `Failed to change channel name: ${error.message}`, error);
  }
}

// ------------------- renameChannels -------------------
// Renames channels to indicate Blood Moon activation.
// Only renames when it is actually a Blood Moon period (8pm EST day-before through 8am EST day-after).
async function renameChannels(client) {
  if (!isBloodMoonDay()) {
    logger.info('BLOODMOON', 'Not a Blood Moon period - skipping channel renaming');
    return;
  }
  logger.info('BLOODMOON', 'Starting Blood Moon channel renaming');
  
  const channelMappings = getBloodMoonChannelMappings();
  for (const [channelId, newName] of Object.entries(channelMappings)) {
    try {
      await changeChannelName(client, channelId, newName);
      logger.success('BLOODMOON', `Renamed channel ${channelId} for Blood Moon`);
    } catch (error) {
      logger.error('BLOODMOON', `Failed to rename channel ${channelId}: ${error.message}`, error);
    }
  }
  
  logger.success('BLOODMOON', 'Blood Moon channel renaming completed');
}

// ------------------- revertChannelNames -------------------
// Reverts channel names to their default state and sends end-of-event announcements.
async function revertChannelNames(client) {
  
  // First check if Blood Moon is currently active
  const isBloodMoonActive = isBloodMoonDay();
  
  if (isBloodMoonActive) {
    logger.info('BLOODMOON', 'Blood Moon is active - skipping channel reversion');
    return;
  }
  
  const channelMappings = getChannelMappings();

  // Track successful channel changes
  const successfulChannels = new Set();

  for (const [channelId, newName] of Object.entries(channelMappings)) {
    try {
      await changeChannelName(client, channelId, newName);
      successfulChannels.add(channelId);
    } catch (error) {
      logger.error('BLOODMOON', `Failed to revert channel ${channelId}: ${error.message}`, error);
    }
  }

  // End announcement is sent only by the scheduled task at 8am EST on the day after blood moon (see sendBloodMoonEndAnnouncement)
  if (successfulChannels.size > 0) {
    logger.info('BLOODMOON', `Reverted ${successfulChannels.size} channel names`);
  }
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
  isBloodMoonDay,
  isBloodMoonPeriod,
  triggerBloodMoonNow,
  isBloodMoonActive,
  cleanupOldTrackingData,
  // Debug functions
  getTrackingStatus: async () => await BloodMoonTracking.getTrackingStatus()
};
