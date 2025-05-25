// ------------------- bloodmoon.js -------------------
// This module manages Blood Moon events for the Discord bot. It sends announcements,
// tracks Blood Moon activation, and handles channel renaming during Blood Moon periods.
// The module also provides functions to check Blood Moon activation status and to trigger
// Blood Moon events immediately.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing third-party modules -------------------
require('dotenv').config();

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
    console.log(`[bloodmoon.js]: 🌑 Not a Blood Moon date`);
    return false;
  }

  // Check if it's 8 PM EST (20:00)
  const estHour = now.getUTCHours() - 4; // Convert UTC to EST
  const isBloodMoonHour = estHour === 20;
  
  console.log(`[bloodmoon.js]: ${isBloodMoonHour ? '🌕' : '🌑'} Blood Moon hour check: ${estHour}:00 EST`);
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
    console.log('[bloodmoon.js]: 🌑 Blood Moon Inactive');
    await revertChannelNames(client);
  }
}


// ============================================================================
// Channel Management Functions
// ------------------- changeChannelName -------------------
// Changes the name of a Discord channel.
async function changeChannelName(client, channelId, newName) {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
  } catch (error) {
    handleError(error, 'bloodmoon.js');

    console.error(`[bloodmoon.js]: logs [changeChannelName] Error: ${error.message}`);
  }
}

// ------------------- renameChannels -------------------
// Renames channels to indicate Blood Moon activation.
async function renameChannels(client) {
  const channelMappings = {
    [process.env.RUDANIA_TOWN_HALL]: '🔴🔥》rudania-townhall',
    [process.env.INARIKO_TOWN_HALL]: '🔴💧》inariko-townhall',
    [process.env.VHINTL_TOWN_HALL]: '🔴🌱》vhintl-townhall',
  };

  for (const [channelId, newName] of Object.entries(channelMappings)) {
    await changeChannelName(client, channelId, newName);
  }
}

// ------------------- revertChannelNames -------------------
// Reverts channel names to their default state and sends end-of-event announcements.
async function revertChannelNames(client) {
  const channelMappings = {
    [process.env.RUDANIA_TOWN_HALL]: '🔥》rudania-townhall',
    [process.env.INARIKO_TOWN_HALL]: '💧》inariko-townhall',
    [process.env.VHINTL_TOWN_HALL]: '🌱》vhintl-townhall',
  };

  // Determine if Yesterday Was a Blood Moon
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const wasBloodMoonYesterday = isBloodmoon(yesterday);  // Using your existing isBloodmoon function

  for (const [channelId, newName] of Object.entries(channelMappings)) {
    await changeChannelName(client, channelId, newName);

    if (wasBloodMoonYesterday) {
      await sendBloodMoonEndAnnouncement(client, channelId);  // Only send if true
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
    const active = isBloodMoonDay();
    console.log(`[bloodmoon.js]: 🌙 Blood Moon status: ${active ? 'Active' : 'Inactive'}`);
    return active;
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
