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



// ============================================================================
// Announcement Functions
// ------------------- sendBloodMoonAnnouncement -------------------
// Sends a Blood Moon announcement embed message to a specified Discord channel.
async function sendBloodMoonAnnouncement(client, channelId, message) {
  try {
    const currentDate = new Date();
    const realWorldDate = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(currentDate);

    const embed = new EmbedBuilder()
      .setColor('#8B0000')
      .setAuthor({ name: 'Blood Moon Rising', iconURL: 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/d/dc/HWAoC_Blood_Moon_Icon.png/revision/latest/scale-to-width-down/250?cb=20210328041409' })
      .setDescription(
        `**${message}**\n\n**Beware the monsters, as they are drawn to the moon's red glow.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`
      )
      .setImage('https://oyster.ignimgs.com/mediawiki/apis.ign.com/the-legend-of-zelda-hd/e/e7/The_Legend_of_Zelda._Breath_of_the_Wild_Screen_Shot_3-16-17%2C_1.22_PM.png?width=1280')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'bloodmoon.js');

    console.error(`[bloodmoon.js]: logs [sendBloodMoonAnnouncement] Error: ${error.message}`);
  }
}

// ------------------- sendBloodMoonEndAnnouncement -------------------
// Sends an embed message announcing the end of the Blood Moon event.
async function sendBloodMoonEndAnnouncement(client, channelId) {
  try {
    const currentDate = new Date();
    const realWorldDate = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(currentDate);

    const embed = new EmbedBuilder()
      .setColor('#FFFACD')
      .setAuthor({ name: 'Blood Moon Fades', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616456.png' })
      .setDescription(
        `**The Blood Moon has ended... for now.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`
      )
      .setImage('https://drive.google.com/uc?export=view&id=1aRe4OR_QbHnlrC-OFCVyvCzkAGRxgDbN')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'bloodmoon.js');

    console.error(`[bloodmoon.js]: logs [sendBloodMoonEndAnnouncement] Error: ${error.message}`);
  }
}


// ============================================================================
// Blood Moon Activation Check
// ------------------- normalizeDate -------------------
// Normalizes a Date object by stripping away time components.
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ------------------- isBloodMoonDay -------------------
// Checks if today falls within a Blood Moon period based on predefined dates and time.
function isBloodMoonDay() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    console.error(`[bloodmoon.js]: ❌ Error: 'bloodmoonDates' is not defined or not an array.`);
    return false;
  }

  const now = new Date();
  const today = normalizeDate(now);
  
  // Check if it's a Blood Moon date
  const isBloodMoonDate = bloodmoonDates.some(({ realDate }) => {
    const [month, day] = realDate.split('-').map(Number);
    const bloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day));
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);
    const dayAfter = new Date(bloodMoonDate);
    dayAfter.setDate(bloodMoonDate.getDate() + 1);
    return today >= dayBefore && today <= dayAfter;
  });

  // If it's not a Blood Moon date, return false
  if (!isBloodMoonDate) {
    return false;
  }

  // Check if it's 8 PM EST (20:00)
  const estHour = now.getUTCHours() - 4; // Convert UTC to EST
  const isBloodMoonHour = estHour === 20;
  
  return isBloodMoonHour;
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
        // Only log environment variables when there's an error
        console.error('[bloodmoon.js]: 🔍 Environment variables:', {
          NODE_ENV: process.env.NODE_ENV,
          RUDANIA_TOWNHALL: process.env.RUDANIA_TOWNHALL,
          INARIKO_TOWNHALL: process.env.INARIKO_TOWNHALL,
          VHINTL_TOWNHALL: process.env.VHINTL_TOWNHALL
        });
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
  const channelMappings = getBloodMoonChannelMappings();
  for (const [channelId, newName] of Object.entries(channelMappings)) {
    await changeChannelName(client, channelId, newName);
  }
}

// ------------------- revertChannelNames -------------------
// Reverts channel names to their default state and sends end-of-event announcements.
async function revertChannelNames(client) {
  const channelMappings = getChannelMappings();

  // Determine if Yesterday Was a Blood Moon
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const wasBloodMoonYesterday = isBloodmoon(yesterday);

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

  // Only send announcements to channels we successfully modified
  if (wasBloodMoonYesterday) {
    for (const channelId of successfulChannels) {
      try {
        await sendBloodMoonEndAnnouncement(client, channelId);
      } catch (error) {
        console.error(`[bloodmoon.js]: ❌ Failed to send end announcement to channel ${channelId}: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// Blood Moon Trigger and Status Functions
// ------------------- triggerBloodMoonNow -------------------
// Immediately triggers the Blood Moon event by sending announcements and renaming channels.
async function triggerBloodMoonNow(client, channelId) {
  try {
    console.log(`[bloodmoon.js]: 🌕 Triggering Blood Moon`);
    await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
    await renameChannels(client);
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
  triggerBloodMoonNow,
  isBloodMoonActive
};
