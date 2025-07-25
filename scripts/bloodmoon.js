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
    console.error(`[bloodmoon.js]: ❌ Error checking announcement status for ${channelId}:`, error);
    return false;
  }
}

// Helper function to mark announcement as sent
async function markAnnouncementAsSent(channelId, type = 'start') {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.markAnnouncementAsSent(channelId, type, today);
  } catch (error) {
    console.error(`[bloodmoon.js]: ❌ Error marking announcement as sent for ${channelId}:`, error);
    return false;
  }
}

// Helper function to check if end announcement was already sent today
async function hasEndAnnouncementBeenSent(channelId) {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.hasAnnouncementBeenSent(channelId, 'end', today);
  } catch (error) {
    console.error(`[bloodmoon.js]: ❌ Error checking end announcement status for ${channelId}:`, error);
    return false;
  }
}

// Helper function to mark end announcement as sent
async function markEndAnnouncementAsSent(channelId) {
  try {
    const today = getTodayDateString();
    return await BloodMoonTracking.markAnnouncementAsSent(channelId, 'end', today);
  } catch (error) {
    console.error(`[bloodmoon.js]: ❌ Error marking end announcement as sent for ${channelId}:`, error);
    return false;
  }
}

// Helper function to clean up old tracking data
async function cleanupOldTrackingData() {
  try {
    const deletedCount = await BloodMoonTracking.cleanupOldData();
    if (deletedCount > 0) {
      console.log(`[bloodmoon.js]: 🧹 Cleaned up ${deletedCount} old tracking records`);
    }
    return deletedCount;
  } catch (error) {
    console.error('[bloodmoon.js]: ❌ Error cleaning up old tracking data:', error);
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
    
    // Find which Blood Moon period we're in and determine the correct date to show
    let bloodMoonDate = null;
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
        bloodMoonDate = currentBloodMoonDate;
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
    console.log(`[bloodmoon.js]: 🌕 Blood Moon start announcement sent to channel ${channelId}`);
    
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    console.error(`[bloodmoon.js]: ❌ Error sending Blood Moon start announcement to channel ${channelId}: ${error.message}`);
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
    console.log(`[bloodmoon.js]: 🌙 Blood Moon end announcement sent to channel ${channelId}`);
    
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    console.error(`[bloodmoon.js]: ❌ Error sending Blood Moon end announcement to channel ${channelId}: ${error.message}`);
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
    console.error(`[bloodmoon.js]: ❌ Error: 'bloodmoonDates' is not defined or not an array.`);
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
// For example: July 13 at 8 PM EST until July 15 at 8 AM EST.
function isBloodMoonDay() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    console.error(`[bloodmoon.js]: ❌ Error: 'bloodmoonDates' is not defined or not an array.`);
    return false;
  }

  const now = new Date();
  const today = normalizeDate(now);
  
  // Proper EST time calculation
  const estHour = parseInt(now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  }));
  
  // Find the Blood Moon period we're in
  let bloodMoonStartDate = null;
  let bloodMoonEndDate = null;
  
  for (const { realDate } of bloodmoonDates) {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    const dayAfter = new Date(bloodMoonDate);
    dayAfter.setDate(bloodMoonDate.getDate() + 1);
    const isInRange = today >= dayBefore && today <= dayAfter;
    
    if (isInRange) {
      // Blood Moon starts at 8 PM EST on the day before
      bloodMoonStartDate = new Date(dayBefore);
      bloodMoonStartDate.setHours(20, 0, 0, 0); // 8 PM EST
      
      // Blood Moon ends at 8 AM EST on the day after
      bloodMoonEndDate = new Date(dayAfter);
      bloodMoonEndDate.setHours(8, 0, 0, 0); // 8 AM EST
      
      break;
    }
  }
  
  // If we're not in a Blood Moon period, return false
  if (!bloodMoonStartDate || !bloodMoonEndDate) {
    return false;
  }
  
  // Check if current time is within the Blood Moon activation period
  const currentTime = new Date();
  const currentEST = new Date(currentTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  // Convert start and end dates to EST for comparison
  const startEST = new Date(bloodMoonStartDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const endEST = new Date(bloodMoonEndDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const isActive = currentEST >= startEST && currentEST < endEST;
  
  return isActive;
}


// ============================================================================
// Blood Moon Tracker
// ------------------- trackBloodMoon -------------------
// Checks Blood Moon status and updates channel names and announcements accordingly.
async function trackBloodMoon(client, channelId) {
  if (isBloodMoonDay()) {
    console.log('[bloodmoon.js]: 🌕 Blood Moon Active');
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
        console.error(`[bloodmoon.js]: ❌ Missing permissions for channel ${channelId}`);
      } else if (error.code === 10003) {
        console.error(`[bloodmoon.js]: ❌ Channel ${channelId} not found`);
      } else {
        console.error(`[bloodmoon.js]: ❌ Error accessing channel ${channelId}: ${error.message}`);
      }
      return null;
    });

    if (!channel) {
      return; // Exit if channel couldn't be fetched
    }

    // Check if we have permission to manage the channel
    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has('ManageChannels')) {
      console.error(`[bloodmoon.js]: ❌ Bot lacks 'Manage Channels' permission for channel ${channel.name}`);
      return;
    }

    // Attempt to change the channel name
    await channel.setName(newName);
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    console.error(`[bloodmoon.js]: ❌ Failed to change channel name: ${error.message}`);
  }
}

// ------------------- renameChannels -------------------
// Renames channels to indicate Blood Moon activation.
async function renameChannels(client) {
  console.log(`[bloodmoon.js]: 🔴 Starting Blood Moon channel renaming`);
  
  const channelMappings = getBloodMoonChannelMappings();
  for (const [channelId, newName] of Object.entries(channelMappings)) {
    try {
      await changeChannelName(client, channelId, newName);
      console.log(`[bloodmoon.js]: ✅ Renamed channel ${channelId} for Blood Moon`);
    } catch (error) {
      console.error(`[bloodmoon.js]: ❌ Failed to rename channel ${channelId}: ${error.message}`);
    }
  }
  
  console.log(`[bloodmoon.js]: ✅ Blood Moon channel renaming completed`);
}

// ------------------- revertChannelNames -------------------
// Reverts channel names to their default state and sends end-of-event announcements.
async function revertChannelNames(client) {
  console.log(`[bloodmoon.js]: 🔄 Starting channel name reversion`);
  
  // First check if Blood Moon is currently active
  const isBloodMoonActive = isBloodMoonDay();
  
  if (isBloodMoonActive) {
    console.log(`[bloodmoon.js]: 🌕 Blood Moon is active - skipping channel reversion`);
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
      console.error(`[bloodmoon.js]: ❌ Failed to revert channel ${channelId}: ${error.message}`);
    }
  }

  // Only send end announcements at 8 PM if we're transitioning out of a Blood Moon period
  if (is8PM && wasBloodMoonPeriodYesterday) {
    console.log(`[bloodmoon.js]: 🌙 Sending end announcements to ${successfulChannels.size} channels`);
    for (const channelId of successfulChannels) {
      try {
        await sendBloodMoonEndAnnouncement(client, channelId);
      } catch (error) {
        console.error(`[bloodmoon.js]: ❌ Failed to send end announcement to channel ${channelId}: ${error.message}`);
      }
    }
  }
  
  console.log(`[bloodmoon.js]: ✅ Channel reversion completed`);
}

// ============================================================================
// Blood Moon Trigger and Status Functions
// ------------------- triggerBloodMoonNow -------------------
// Immediately triggers the Blood Moon event by sending announcements and renaming channels.
async function triggerBloodMoonNow(client, channelId) {
  try {
    console.log(`[bloodmoon.js]: 🌕 Triggering Blood Moon manually`);
    await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
    await renameChannels(client);
    console.log(`[bloodmoon.js]: ✅ Blood Moon triggered successfully`);
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    console.error(`[bloodmoon.js]: ❌ Blood Moon trigger failed: ${error.message}`);
  }
}

// ------------------- isBloodMoonActive -------------------
// Returns whether the Blood Moon is currently active.
function isBloodMoonActive() {
  try {
    return isBloodMoonDay();
  } catch (error) {
    handleError(error, 'bloodmoon.js');
    console.error(`[bloodmoon.js]: ❌ Blood Moon status check failed: ${error.message}`);
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
