// ------------------- Import necessary modules -------------------
require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const { convertToHyruleanDate } = require('../modules/calendarModule');
const { getRandomEncounter, adjustEncounterProbabilities } = require('../modules/rngModule');
const cron = require('node-cron');

// ------------------- Define constants for images -------------------
const bloodMoonImageUrl = 'https://oyster.ignimgs.com/mediawiki/apis.ign.com/the-legend-of-zelda-hd/e/e7/The_Legend_of_Zelda._Breath_of_the_Wild_Screen_Shot_3-16-17%2C_1.22_PM.png?width=1280';
const authorIconUrl = 'https://static.wikia.nocookie.net/zelda_gamepedia_en/images/d/dc/HWAoC_Blood_Moon_Icon.png/revision/latest/scale-to-width-down/250?cb=20210328041409';

// ------------------- Constants for Blood Moon Tracking -------------------
const BLOOD_MOON_CYCLE = 26;
const BLOOD_MOON_PERIOD_DAYS = [25, 26, 27];
let currentDayInCycle = 1;

// ------------------- Utility Functions -------------------
// Logs current day in the cycle with context
function logCycleDay(day) {
  console.log(`[Blood Moon Tracker] Current Day in Cycle: ${day}`);
}

// Handles error logging with file context
function logError(context, error) {
  console.error(`[BloodMoon.js] [${context}] Error: ${error.message}`);
}

// ------------------- Function to send the Blood Moon announcement -------------------
async function sendBloodMoonAnnouncement(client, channelId, message) {
  const realWorldDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const hyruleanDate = convertToHyruleanDate(new Date());

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setAuthor({ name: 'Blood Moon Rising', iconURL: authorIconUrl })
    .setDescription(`**${message}**\n\n**Beware the monsters, as they are drawn to the moon’s red glow.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`)
    .setImage(bloodMoonImageUrl)
    .setTimestamp();

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logError('sendBloodMoonAnnouncement', error);
  }
}

// ------------------- Function to Send Blood Moon End Announcement -------------------
async function sendBloodMoonEndAnnouncement(client, channelId) {
  const realWorldDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hyruleanDate = convertToHyruleanDate(new Date());

  const embed = new EmbedBuilder()
    .setColor('#FFFACD') // Light yellow color (Lemon Chiffon)
    .setAuthor({ name: 'Blood Moon Fades', iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616456.png' }) // Moon icon
    .setDescription(
      `**The Blood Moon has ended... for now.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`
    )
    .setImage('https://drive.google.com/uc?export=view&id=1aRe4OR_QbHnlrC-OFCVyvCzkAGRxgDbN') // Main image
    .setTimestamp();

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logError('sendBloodMoonEndAnnouncement', error);
  }
}

// ------------------- Function to Track the Blood Moon Cycle -------------------
function trackBloodMoonCycle(client, channelId) {
  currentDayInCycle = (currentDayInCycle % BLOOD_MOON_CYCLE) + 1;
  logCycleDay(currentDayInCycle);

  if (BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle)) {
    console.log(`[Blood Moon Tracker] Blood Moon is ACTIVE on Day ${currentDayInCycle}.`);
    triggerBloodMoonPeriod(client, channelId);
  } else {
    console.log(`[Blood Moon Tracker] Blood Moon is NOT active. Day ${currentDayInCycle} in cycle.`);
  }

  if (currentDayInCycle === 28) {
    revertChannelNames(client);
  }
}

// ------------------- Function to Trigger Blood Moon Period -------------------
function triggerBloodMoonPeriod(client, channelId) {
  const messages = {
    25: 'Blood Moon approaches... Prepare yourself!',
    26: 'The Blood Moon is now upon us! Tread carefully...',
    27: 'The Blood Moon is waning. It will soon leave Hyrule.'
  };

  const message = messages[currentDayInCycle];
  if (message) {
    sendBloodMoonAnnouncement(client, channelId, message);
    if (currentDayInCycle === 25) renameChannels(client);
  }
}

// ------------------- Cron Job to Track Blood Moon Daily -------------------
cron.schedule(
  '0 0 * * *',
  () => {
    const channels = [
      process.env.RUDANIA_TOWN_HALL,
      process.env.INARIKO_TOWN_HALL,
      process.env.VHINTL_TOWN_HALL,
    ];

    channels.forEach((channelId) => trackBloodMoonCycle(client, channelId));
  },
  { timezone: 'America/New_York' }
);

// ------------------- Channel Rename Functions -------------------
async function changeChannelName(client, channelId, newName) {
  try {
    console.log(`Attempting to rename channel: ${channelId} to ${newName}`);
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
    console.log(`Channel renamed successfully: ${channel.name}`);
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

// ------------------- Function to Check Blood Moon Active -------------------
function isBloodMoonActive() {
  const isActive = BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle);
  return isActive;
}

// ------------------- Export Functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  trackBloodMoonCycle,
  adjustEncounterForBloodMoon: adjustEncounterProbabilities,
  renameChannels,
  revertChannelNames,
  sendBloodMoonEndAnnouncement,
  isBloodMoonActive,
  currentDayInCycle,
};
