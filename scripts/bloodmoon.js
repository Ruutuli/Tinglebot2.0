// ------------------- Import Necessary Modules -------------------
require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const { getBloodMoonCycleDay, convertToHyruleanDate } = require('../modules/calendarModule');
const { adjustEncounterProbabilities } = require('../modules/rngModule');
const cron = require('node-cron');

// ------------------- Constants -------------------
const BLOOD_MOON_CYCLE = 26;
const BLOOD_MOON_PERIOD_DAYS = [25, 26, 27];
const bloodMoonImageUrl = 'https://oyster.ignimgs.com/mediawiki/apis.ign.com/the-legend-of-zelda-hd/e/e7/The_Legend_of_Zelda._Breath_of_the_Wild_Screen_Shot_3-16-17%2C_1.22_PM.png?width=1280';
const authorIconUrl = 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/d/dc/HWAoC_Blood_Moon_Icon.png/revision/latest/scale-to-width-down/250?cb=20210328041409';

// ------------------- Global Variables -------------------
let currentDayInCycle = 1;

// ------------------- Utility Functions -------------------
function logError(context, error) {
  console.error(`[BloodMoon.js] [${context}] Error: ${error.message}`);
}

function logCycleDay(day) {
  console.log(`[Blood Moon Tracker] Current Day in Cycle: ${day}`);
}

function calculateCurrentDayInCycle() {
  try {
    const hyruleanDate = convertToHyruleanDate(new Date());
    return getBloodMoonCycleDay(hyruleanDate);
  } catch (error) {
    logError('calculateCurrentDayInCycle', error);
    return 1; // Default to day 1 in case of an error
  }
}

// ------------------- Announcement Functions -------------------
async function sendBloodMoonAnnouncement(client, channelId, message) {
  try {
    const realWorldDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(new Date());

    const embed = new EmbedBuilder()
      .setColor('#8B0000')
      .setAuthor({ name: 'Blood Moon Rising', iconURL: authorIconUrl })
      .setDescription(`**${message}**\n\n**Beware the monsters, as they are drawn to the moon’s red glow.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`)
      .setImage(bloodMoonImageUrl)
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logError('sendBloodMoonAnnouncement', error);
  }
}

async function sendBloodMoonEndAnnouncement(client, channelId) {
  try {
    const realWorldDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hyruleanDate = convertToHyruleanDate(new Date());

    const embed = new EmbedBuilder()
      .setColor('#FFFACD')
      .setAuthor({ name: 'Blood Moon Fades', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616456.png' })
      .setDescription(`**The Blood Moon has ended... for now.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`)
      .setImage('https://drive.google.com/uc?export=view&id=1aRe4OR_QbHnlrC-OFCVyvCzkAGRxgDbN')
      .setTimestamp();

    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logError('sendBloodMoonEndAnnouncement', error);
  }
}

// ------------------- Cycle Tracking -------------------
function trackBloodMoonCycle(client, channelId) {
  currentDayInCycle = calculateCurrentDayInCycle();
  logCycleDay(currentDayInCycle);

  if (BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle)) {
    console.log(`[Blood Moon Tracker] Blood Moon is ACTIVE on Day ${currentDayInCycle}.`);
    triggerBloodMoonPeriod(client, channelId);
  } else {
    console.log(`[Blood Moon Tracker] Blood Moon is NOT active. Day ${currentDayInCycle} in cycle.`);
  }

  if (currentDayInCycle === BLOOD_MOON_CYCLE) {
    revertChannelNames(client);
  }
}

function triggerBloodMoonPeriod(client, channelId) {
  const messages = {
    25: 'Blood Moon approaches... Prepare yourself!',
    26: 'The Blood Moon is now upon us! Tread carefully...',
    27: 'The Blood Moon is waning. It will soon leave Hyrule.',
  };

  const message = messages[currentDayInCycle];
  if (message) {
    sendBloodMoonAnnouncement(client, channelId, message);
    if (currentDayInCycle === 25) renameChannels(client);
  }
}

function isBloodMoonActive() {
  try {
    const currentDay = calculateCurrentDayInCycle(); // Dynamically calculate the current day in the cycle
    return BLOOD_MOON_PERIOD_DAYS.includes(currentDay);
  } catch (error) {
    logError('isBloodMoonActive', error);
    return false; // Default to inactive in case of an error
  }
}

// ------------------- Channel Management -------------------
async function changeChannelName(client, channelId, newName) {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
  } catch (error) {
    logError('changeChannelName', error);
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

// ------------------- Cron Job -------------------
function scheduleBloodMoonTracking(client) {
  const channels = [
    process.env.RUDANIA_TOWN_HALL,
    process.env.INARIKO_TOWN_HALL,
    process.env.VHINTL_TOWN_HALL,
  ];

  cron.schedule(
    '0 0 * * *',
    () => {
      channels.forEach(channelId => trackBloodMoonCycle(client, channelId));
    },
    { timezone: 'America/New_York' }
  );
}

// ------------------- Export Functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  sendBloodMoonEndAnnouncement,
  trackBloodMoonCycle,
  scheduleBloodMoonTracking,
  renameChannels,
  revertChannelNames,
  calculateCurrentDayInCycle,
  isBloodMoonActive
};
