// ------------------- bloodmoon.js -------------------
// This module manages Blood Moon events for the Discord bot. It sends announcements,
// tracks Blood Moon activation, and handles channel renaming during Blood Moon periods.
// The module also provides functions to check Blood Moon activation status and to trigger
// Blood Moon events immediately.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing third-party modules -------------------
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');
// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// Local Modules
// ------------------- Importing custom modules -------------------
const { convertToHyruleanDate, bloodmoonDates, isBloodmoon } = require('../modules/calendarModule');
const BloodMoonTracking = require('../models/BloodMoonTrackingModel');

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

    // Determine the correct date for the Blood Moon announcement
    const now = new Date();
    const today = normalizeDate(now);
    
    // SAFETY CHECK: Only send announcements if today is specifically the DAY BEFORE a Blood Moon
    // (not during the actual Blood Moon period)
    let isDayBeforeBloodMoon = false;
    let bloodMoonDate = null;
    
    for (const { realDate } of bloodmoonDates) {
      const [month, day] = realDate.split('-').map(Number);
      const currentBloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
      const dayBefore = new Date(currentBloodMoonDate);
      dayBefore.setDate(currentBloodMoonDate.getDate() - 1);
      
      if (today.getTime() === dayBefore.getTime()) {
        isDayBeforeBloodMoon = true;
        bloodMoonDate = currentBloodMoonDate;
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
      const currentBloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
      const dayBefore = new Date(currentBloodMoonDate);
      dayBefore.setDate(currentBloodMoonDate.getDate() - 1);
      const dayAfter = new Date(currentBloodMoonDate);
      dayAfter.setDate(currentBloodMoonDate.getDate() + 1);
      
      if (today >= dayBefore && today <= dayAfter) {
        // We're in a Blood Moon period
        foundBloodMoonPeriod = true;
        if (!bloodMoonDate) {
          bloodMoonDate = currentBloodMoonDate;
        }
        break;
      }
    }
    
    // Use current date for the announcement (when the announcement is posted)
    const announcementDate = today;
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
async function sendBloodMoonEndAnnouncement(client, channelId) {
  try {
    // Check if end announcement was already sent today
    if (await hasEndAnnouncementBeenSent(channelId)) {
      return;
    }

    // Determine the correct date for the Blood Moon end announcement
    const now = new Date();
    const today = normalizeDate(now);
    
    // Find which Blood Moon period we're transitioning from and determine the correct date to show
    let bloodMoonDate = null;
    let foundBloodMoonPeriod = false;
    
    for (const { realDate } of bloodmoonDates) {
      const [month, day] = realDate.split('-').map(Number);
      const currentBloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
      const dayBefore = new Date(currentBloodMoonDate);
      dayBefore.setDate(currentBloodMoonDate.getDate() - 1);
      const dayAfter = new Date(currentBloodMoonDate);
      dayAfter.setDate(currentBloodMoonDate.getDate() + 1);
      
      // Check if yesterday was within this Blood Moon period
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      
      if (yesterday >= dayBefore && yesterday <= dayAfter) {
        // Yesterday was in a Blood Moon period, so we're transitioning out
        foundBloodMoonPeriod = true;
        bloodMoonDate = currentBloodMoonDate;
        break;
      }
    }
    
    // Additional safety check: Only send if we actually found a Blood Moon period that ended
    if (!foundBloodMoonPeriod) {
      logger.info('BLOODMOON', 'No Blood Moon period found for yesterday - skipping end announcement');
      return;
    }
    
    // Use current date for the announcement (when the announcement is posted)
    const announcementDate = today;
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

  const now = new Date();
  const today = normalizeDate(now);
  
  // Check if it's within the Blood Moon period (day before, blood moon date, day after)
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    const dayAfter = new Date(bloodMoonDate);
    dayAfter.setDate(bloodMoonDate.getDate() + 1);
    const isInRange = today >= dayBefore && today <= dayAfter;
    
    if (isInRange) {
      return true;
    }
  }

  return false;
}

// ------------------- isBloodMoonDay -------------------
// Checks if Blood Moon is currently active.
// Blood Moon starts at 8 PM EST on the day BEFORE the blood moon date and ends at 8 AM EST the day AFTER.
// For example: September 3 at 8 PM EST until September 5 at 8 AM EST.
function isBloodMoonDay() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    logger.error('BLOODMOON', "'bloodmoonDates' is not defined or not an array");
    return false;
  }

  // Get current time in EST
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const estDate = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
  const estHour = estTime.getHours();
  
  // Find the Blood Moon period we're in
  let bloodMoonDate = null;
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const currentYearBloodMoonDate = new Date(estDate.getFullYear(), month - 1, day);
    const dayBefore = new Date(currentYearBloodMoonDate);
    dayBefore.setDate(currentYearBloodMoonDate.getDate() - 1);
    const dayAfter = new Date(currentYearBloodMoonDate);
    dayAfter.setDate(currentYearBloodMoonDate.getDate() + 1);
    
    // Check if current EST date is within the 3-day blood moon window
    if (estDate >= dayBefore && estDate <= dayAfter) {
      bloodMoonDate = currentYearBloodMoonDate;
      break;
    }
  }
  
  // If we're not in a Blood Moon period, return false
  if (!bloodMoonDate) {
    logger.info('BLOODMOON', 'Not in Blood Moon period');
    return false;
  }
  
  // Calculate the start and end dates for this blood moon
  const dayBefore = new Date(bloodMoonDate);
  dayBefore.setDate(bloodMoonDate.getDate() - 1);
  const dayAfter = new Date(bloodMoonDate);
  dayAfter.setDate(bloodMoonDate.getDate() + 1);
  
  logger.info('BLOODMOON', `Current EST: ${estDate.toDateString()} ${estHour}:00, Start: ${dayBefore.toDateString()}, End: ${dayAfter.toDateString()}`);
  
  // Check if we're in the Blood Moon period and at the right time
  let isActive = false;
  
  if (estDate.getTime() === dayBefore.getTime()) {
    // We're on the day before the Blood Moon date - check if it's 8 PM or later
    isActive = estHour >= 20;
    logger.info('BLOODMOON', `Day before Blood Moon - Hour: ${estHour}, Active: ${isActive}`);
  } else if (estDate.getTime() === bloodMoonDate.getTime()) {
    // We're on the actual Blood Moon date - always active
    isActive = true;
    logger.info('BLOODMOON', `Blood Moon day - Always active: ${isActive}`);
  } else if (estDate.getTime() === dayAfter.getTime()) {
    // We're on the day after the Blood Moon date - check if it's before 8 AM
    isActive = estHour < 8;
    logger.info('BLOODMOON', `Day after Blood Moon - Hour: ${estHour}, Active: ${isActive}`);
  } else {
    logger.info('BLOODMOON', 'Not in Blood Moon period');
  }
  
  return isActive;
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
async function renameChannels(client) {
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
  logger.info('BLOODMOON', 'Starting channel name reversion');
  
  // First check if Blood Moon is currently active
  const isBloodMoonActive = isBloodMoonDay();
  
  if (isBloodMoonActive) {
    logger.info('BLOODMOON', 'Blood Moon is active - skipping channel reversion');
    return;
  }
  
  const channelMappings = getChannelMappings();

  // Check if we're at 8 PM EST and transitioning out of a Blood Moon period
  const now = new Date();
  
  // Proper EST time calculation
  const estHour = parseInt(now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  }));
  const is8PM = estHour === 20;
  
  // Check if yesterday was within any Blood Moon period
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const wasBloodMoonPeriodYesterday = bloodmoonDates.some(({ realDate }) => {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = normalizeDate(new Date(yesterday.getFullYear(), month - 1, day));
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    const dayAfter = new Date(bloodMoonDate);
    dayAfter.setDate(bloodMoonDate.getDate() + 1);
    return yesterday >= dayBefore && yesterday <= dayAfter;
  });

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

  // Only send end announcements at 8 PM if we're transitioning out of a Blood Moon period
  if (is8PM && wasBloodMoonPeriodYesterday) {
    logger.info('BLOODMOON', `Sending end announcements to ${successfulChannels.size} channels`);
    for (const channelId of successfulChannels) {
      try {
        await sendBloodMoonEndAnnouncement(client, channelId);
      } catch (error) {
        logger.error('BLOODMOON', `Failed to send end announcement to channel ${channelId}: ${error.message}`, error);
      }
    }
  }
  
  logger.success('BLOODMOON', 'Channel reversion completed');
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
