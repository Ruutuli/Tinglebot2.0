// ------------------- Import necessary modules -------------------
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

// ------------------- Function to Track the Blood Moon Cycle -------------------
function trackBloodMoonCycle(client, channelId) {
  currentDayInCycle = (currentDayInCycle % BLOOD_MOON_CYCLE) + 1;
  if (BLOOD_MOON_PERIOD_DAYS.includes(currentDayInCycle)) {
    triggerBloodMoonPeriod(client, channelId);
  }

  if (currentDayInCycle === 28) {
    revertChannelNames(client);
  }
}

// ------------------- Function to Trigger Blood Moon Period -------------------
function triggerBloodMoonPeriod(client, channelId) {
  if (currentDayInCycle === 25) {
    sendBloodMoonAnnouncement(client, channelId, 'Blood Moon approaches... Prepare yourself!');
    renameChannels(client);
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
  trackBloodMoonCycle(client, '1286562327218622475');
}, {
  timezone: 'America/New_York'
});

// ------------------- Channel Rename Functions -------------------
async function changeChannelName(client, channelId, newName) {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.setName(newName);
  } catch (error) {
    console.error(`Failed to rename channel: ${error.message}`);
  }
}

async function renameChannels(client) {
  const channelId = '1286562327218622475';
  await changeChannelName(client, channelId, '🔴🔥》rudania-townhall');
}

async function revertChannelNames(client) {
  const channelId = '1286562327218622475';
  await changeChannelName(client, channelId, '🔥》rudania-townhall');
}

// ------------------- Export Functions -------------------
module.exports = {
  sendBloodMoonAnnouncement,
  trackBloodMoonCycle,
  adjustEncounterForBloodMoon,
  renameChannels,
  revertChannelNames
};
