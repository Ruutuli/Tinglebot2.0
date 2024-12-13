// ------------------- Scheduler -------------------
// Manages all scheduled tasks such as daily stamina recovery, blight roll checks, Blood Moon announcements, and birthday announcements

// ------------------- Imports -------------------
// Load environment variables
require('dotenv').config();

// Standard libraries and third-party modules
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// Local modules for core functionality
const { recoverDailyStamina } = require('./modules/characterStatsModule'); 
const { generateVendingStockList } = require('./database/vendingService'); 
const { checkMissedRolls, postBlightRollCall } = require('./handlers/blightHandler'); 
const { sendBloodMoonAnnouncement } = require('./scripts/bloodmoon'); 
const { resetPetRollsForAllCharacters } = require('./database/characterService');
const { createScheduledQuest } = require('./database/questService'); 
const { fetchQuestsFromSheet } = require('./scripts/questAnnouncements');

// Models and utilities
const Settings = require('./models/SettingsModel');
const Character = require('./models/CharacterModel');
const { cleanupExpiredHealingRequests } = require('./utils/storage'); 

// ------------------- Scheduler Initialization -------------------
// Function to set up all scheduled tasks
module.exports = (client) => {
  console.log('[scheduler]📅 Scheduler initialized');

  // ------------------- Daily Stamina Recovery -------------------
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[scheduler]⏰ Running daily stamina recovery job...');
      await recoverDailyStamina();
      console.log('[scheduler]✅ Daily stamina recovery completed.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during stamina recovery:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Monthly Vending Stock Generation -------------------
  cron.schedule('0 0 1 * *', async () => {
    try {
      console.log('[scheduler]🛍️ Generating monthly vending stock list...');
      await generateVendingStockList();
      console.log('[scheduler]✅ Vending stock list generated successfully.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error generating vending stock list:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Blight Roll Call -------------------
  cron.schedule('0 20 * * *', async () => {
    try {
      console.log('v⏰ Sending daily blight roll call...');
      await postBlightRollCall(client);
      await checkMissedRolls(client);
      console.log('[scheduler]✅ Blight roll call and missed roll checks completed.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during blight roll call:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Monthly Blood Moon Announcement -------------------
  cron.schedule('0 20 13 * *', async () => {
    try {
      console.log('🌕 Posting Blood Moon announcement...');
      const channels = [
        process.env.RUDANIA_TOWN_HALL,
        process.env.INARIKO_TOWN_HALL,
        process.env.VHINTL_TOWN_HALL,
      ];
      for (const channelId of channels) {
        await sendBloodMoonAnnouncement(client, channelId);
      }
      console.log('✅ Blood Moon announcement posted successfully.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during Blood Moon announcement:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Birthday Announcements -------------------
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🎂 Checking for birthdays...');
      await executeBirthdayAnnouncements(client);
      console.log('🎉 Birthday announcements completed.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during birthday announcements:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Weekly Pet Rolls Reset -------------------
  cron.schedule('0 0 * * 0', async () => {
    try {
      console.log('🔄 Resetting pet rolls for the week...');
      await resetPetRollsForAllCharacters();
      console.log('✅ Pet rolls reset successfully.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during pet rolls reset:', error);
    }
  }, { timezone: 'America/New_York' });

 // ------------------- Daily Cleanup of Expired Healing Requests -------------------
 cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[scheduler]🧹 Running daily cleanup of expired healing requests...');
    cleanupExpiredHealingRequests(); // Add this function in `storage.js` as shown below
    console.log('[scheduler]✅ Expired healing requests cleaned up successfully.');
  } catch (error) {
    console.error('❌ [scheduler.js] Error during daily cleanup of healing requests:', error.message);
  }
}, { timezone: 'America/New_York' });
};

// ------------------- Birthday Announcement Logic -------------------
// Function to check and announce birthdays
async function executeBirthdayAnnouncements(client) {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = estNow.toISOString().slice(5, 10);

  const settings = await Settings.find({});
  const birthdayMessages = [
    "🔥🌍 May Din's fiery blessing fill your birthday with the Power to overcome any challenge that comes your way! 🔴",
    "💧❄️ On this nameday, may Nayru's profound Wisdom guide you towards new heights of wisdom and understanding! 🔵",
    "🌿⚡ As you celebrate another year, may Farore's steadfast Courage inspire you to embrace every opportunity with bravery and grace! 🟢"
  ];

  for (const setting of settings) {
    const guild = client.guilds.cache.get(setting.guildId);
    if (!guild) continue;

    const announcementChannel = guild.channels.cache.get(setting.birthdayChannel);
    if (!announcementChannel) continue;

    const characters = await Character.find({ birthday: today });

    for (const character of characters) {
      const user = await client.users.fetch(character.userId);
      const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

      const embed = new EmbedBuilder()
        .setColor('#F88379')
        .setTitle(`🎉🎂🎈 Happy Birthday, ${character.name}! 🎈🎂🎉`)
        .setDescription(randomMessage)
        .setThumbnail(character.icon)
        .setFooter({ text: `🎉 ${character.name} belongs to ${user.username}! 🎉` })
        .setTimestamp()
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

      await announcementChannel.send({ embeds: [embed] });
    }
  }
}
