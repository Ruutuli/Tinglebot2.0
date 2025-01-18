// ------------------- Import Necessary Modules -------------------
require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const { convertToHyruleanDate, bloodmoonDates } = require('../modules/calendarModule');
const cron = require('node-cron');

// ------------------- Announcement Functions -------------------
async function sendBloodMoonAnnouncement(client, channelId, message) {
  try {
    const currentDate = new Date();
    const realWorldDate = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(currentDate);

    const embed = new EmbedBuilder()
      .setColor('#8B0000')
      .setAuthor({ name: 'Blood Moon Rising', iconURL: 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/d/dc/HWAoC_Blood_Moon_Icon.png/revision/latest/scale-to-width-down/250?cb=20210328041409' })
      .setDescription(
        `**${message}**\n\n**Beware the monsters, as they are drawn to the moon’s red glow.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`
      )
      .setImage('https://oyster.ignimgs.com/mediawiki/apis.ign.com/the-legend-of-zelda-hd/e/e7/The_Legend_of_Zelda._Breath_of_the_Wild_Screen_Shot_3-16-17%2C_1.22_PM.png?width=1280')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`[BloodMoon.js] [sendBloodMoonAnnouncement] Error: ${error.message}`);
  }
}

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
    console.error(`[BloodMoon.js] [sendBloodMoonEndAnnouncement] Error: ${error.message}`);
  }
}

// ------------------- Blood Moon Activation Check -------------------
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isBloodMoonDay() {
  if (!bloodmoonDates || !Array.isArray(bloodmoonDates)) {
    console.error(`[BloodMoon.js] Error: 'bloodmoonDates' is not defined or not an array.`);
    return false;
  }

  const today = normalizeDate(new Date()); // Normalize current date

  return bloodmoonDates.some(({ realDate }) => {
    // Parse the realDate (MM-DD format) and construct a Date object
    const [month, day] = realDate.split('-').map(Number); // Convert "MM-DD" into numeric month and day
    const bloodMoonDate = normalizeDate(new Date(today.getFullYear(), month - 1, day)); // Correctly construct the Blood Moon date

    // Calculate the day before and after
    const dayBefore = new Date(bloodMoonDate);
    dayBefore.setDate(bloodMoonDate.getDate() - 1);

    const dayAfter = new Date(bloodMoonDate);
    dayAfter.setDate(bloodMoonDate.getDate() + 1);

    // Check if today falls within the range
    return today >= dayBefore && today <= dayAfter;
  });
}



// ------------------- Blood Moon Tracker -------------------
async function trackBloodMoon(client, channelId) {
  if (isBloodMoonDay()) {
    console.log('[BloodMoon.js]: 🌕 Blood Moon is ACTIVE.');
    await renameChannels(client);
    await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
  } else {
    console.log('[BloodMoon.js]: 🌑 No Blood Moon today.');
    await revertChannelNames(client);
  }
}

// ------------------- Channel Management -------------------
async function changeChannelName(client, channelId, newName) {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
  } catch (error) {
    console.error(`[BloodMoon.js] [changeChannelName] Error: ${error.message}`);
  }
}

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

async function revertChannelNames(client) {
  const channelMappings = {
    [process.env.RUDANIA_TOWN_HALL]: '🔥》rudania-townhall',
    [process.env.INARIKO_TOWN_HALL]: '💧》inariko-townhall',
    [process.env.VHINTL_TOWN_HALL]: '🌱》vhintl-townhall',
  };

  for (const [channelId, newName] of Object.entries(channelMappings)) {
    await changeChannelName(client, channelId, newName);
    await sendBloodMoonEndAnnouncement(client, channelId);
  }
}


// ------------------- Export Functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  sendBloodMoonEndAnnouncement,
  trackBloodMoon,
  renameChannels,
  revertChannelNames,
  isBloodMoonDay
};
