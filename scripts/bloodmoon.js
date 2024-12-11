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
// currentDayInCycle = 25; // Manually set for testing
console.log(`Current Day in Cycle: ${currentDayInCycle}`);

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
    console.error('Error sending Blood Moon announcement:', error);
  }
}

// ------------------- Function to Send Blood Moon End Announcement -------------------
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
    .setAuthor({
      name: 'Blood Moon Fades',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/616/616456.png', // Moon icon
    })
    .setDescription(
      `**The Blood Moon has ended... for now.**\n\n🌕 **Real-World Date:** ${realWorldDate}\n🌕 **Hyrulean Date:** ${hyruleanDate}`
    )
    .setImage('https://drive.google.com/uc?export=view&id=1aRe4OR_QbHnlrC-OFCVyvCzkAGRxgDbN') // Main image
    .setTimestamp();

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending Blood Moon end announcement:', error);
  }
}


// ------------------- Function to Track the Blood Moon Cycle -------------------
function trackBloodMoonCycle(client, channelId) {
  currentDayInCycle = (currentDayInCycle % BLOOD_MOON_CYCLE) + 1;

  // Log the current day in the cycle
  console.log(`[Blood Moon Tracker] Current Day in Cycle: ${currentDayInCycle}`);

  // Check if the Blood Moon is active and log its status
  if (BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle)) {
    console.log(`[Blood Moon Tracker] Blood Moon is ACTIVE on Day ${currentDayInCycle}.`);
    triggerBloodMoonPeriod(client, channelId);
  } else {
    console.log(`[Blood Moon Tracker] Blood Moon is NOT active. Day ${currentDayInCycle} in cycle.`);
  }

  // Reset channel names after the cycle ends (example day 28 or other condition)
  if (currentDayInCycle === 28) {
    revertChannelNames(client);
  }
}

// ------------------- Function to Trigger Blood Moon Period -------------------
function triggerBloodMoonPeriod(client, channelId) {
  if (currentDayInCycle === 25) {
    sendBloodMoonAnnouncement(client, channelId, 'Blood Moon approaches... Prepare yourself!');
    renameChannels(client); // Only rename channels on day 25
  } else if (currentDayInCycle === 26) {
    sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is now upon us! Tread carefully...');
  } else if (currentDayInCycle === 27) {
    sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is waning. It will soon leave Hyrule.');
  }
}

// ------------------- Function to Adjust Encounter Danger During Blood Moon -------------------
function adjustEncounterForBloodMoon(encounter) {
  if (BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle)) {
    encounter = adjustEncounterProbabilities(encounter);
  }
  return encounter;
}

// ------------------- Cron Job to Track Blood Moon Daily -------------------
cron.schedule('0 0 * * *', () => {
  const rudaniaChannelId = process.env.RUDANIA_TOWN_HALL;
  const inarikoChannelId = process.env.INARIKO_TOWN_HALL;
  const vhintlChannelId = process.env.VHINTL_TOWN_HALL;

  // Track Blood Moon cycle for each town hall channel
  trackBloodMoonCycle(client, rudaniaChannelId);
  trackBloodMoonCycle(client, inarikoChannelId);
  trackBloodMoonCycle(client, vhintlChannelId);
}, {
  timezone: 'America/New_York',
});


// ------------------- Channel Rename Functions -------------------
async function changeChannelName(client, channelId, newName) {
  try {
    console.log(`Attempting to rename channel: ${channelId} to ${newName}`);
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
    console.log(`Channel renamed successfully: ${channel.name}`);
  } catch (error) {
    console.error(`Failed to rename channel (ID: ${channelId}) to ${newName}: ${error.message}`);
  }
}

async function renameChannels(client) {
  const rudaniaChannelId = process.env.RUDANIA_TOWN_HALL;
  const inarikoChannelId = process.env.INARIKO_TOWN_HALL;
  const vhintlChannelId = process.env.VHINTL_TOWN_HALL;

  console.log('Starting channel renaming for Blood Moon...');
  await Promise.all([
    changeChannelName(client, rudaniaChannelId, '🔴🔥》rudania-townhall'),
    changeChannelName(client, inarikoChannelId, '🔴💧》inariko-townhall'),
    changeChannelName(client, vhintlChannelId, '🔴🌱》vhintl-townhall')
  ]);
  console.log('Channel renaming completed.');
}

async function revertChannelNames(client) {
  const rudaniaChannelId = process.env.RUDANIA_TOWN_HALL;
  const inarikoChannelId = process.env.INARIKO_TOWN_HALL;
  const vhintlChannelId = process.env.VHINTL_TOWN_HALL;

  await changeChannelName(client, rudaniaChannelId, '🔥》rudania-townhall');
  await changeChannelName(client, inarikoChannelId, '💧》inariko-townhall');
  await changeChannelName(client, vhintlChannelId, '🌱》vhintl-townhall');

  // Announce the end of the Blood Moon
  await sendBloodMoonEndAnnouncement(client, rudaniaChannelId);
  await sendBloodMoonEndAnnouncement(client, inarikoChannelId);
  await sendBloodMoonEndAnnouncement(client, vhintlChannelId);
}


// ------------------- Function to Check Blood Moon Active -------------------
function isBloodMoonActive() {
  const isActive = BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle);
  console.log(`[Blood Moon Status] Current Day: ${currentDayInCycle}, Active: ${isActive}`);
  return isActive;
}

// ------------------- Export Functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  trackBloodMoonCycle,
  adjustEncounterForBloodMoon,
  renameChannels,
  revertChannelNames,
  sendBloodMoonEndAnnouncement,
  isBloodMoonActive,
  currentDayInCycle
};
