// ------------------- Scheduler -------------------
// Manages all scheduled tasks such as daily stamina recovery, blight roll checks, Blood Moon announcements, and birthday announcements

// ------------------- Imports -------------------
require('dotenv').config();
// Standard libraries and third-party modules
const cron = require('node-cron');

// Discord.js and database imports
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('./modules/characterStatsModule'); // Manages daily stamina recovery
const { generateVendingStockList } = require('./database/vendingService'); // Handles monthly vending stock list generation
const { checkMissedRolls, postBlightRollCall } = require('./handlers/blightHandler'); // Checks for missed blight rolls and posts roll calls
const { sendBloodMoonAnnouncement } = require('./scripts/bloodmoon'); // Handles Blood Moon announcements
const Settings = require('./models/SettingsModel');
const Character = require('./models/CharacterModel');
const { resetPetRollsForAllCharacters } = require('./database/characterService');
const { createScheduledQuest } = require('./database/questService'); // Make sure this path is correct
const { fetchQuestsFromSheet } = require('./scripts/questAnnouncements');

// ------------------- Scheduler Initialization -------------------
// Function to set up all scheduled tasks
module.exports = (client) => {
  console.log('📅 Scheduler initialized');

  // ------------------- Daily Stamina Recovery -------------------
  // Scheduled to run at 8 AM EST every day to restore stamina for all characters
  cron.schedule(
    '0 8 * * *', // 8:00 AM EST daily
    async () => {
      try {
        console.log('⏰ Running daily stamina recovery job...');
        await recoverDailyStamina();
        console.log('✅ Daily stamina recovery completed.');
      } catch (error) {
        console.error('❌ Error during stamina recovery:', error);
      }
    },
    {
      timezone: 'America/New_York', // Set to Eastern Standard Time
    }
  );

  // ------------------- Monthly Vending Stock Generation -------------------
  // Scheduled to run on the 1st of every month at midnight
  cron.schedule(
    '0 0 1 * *', // 12:00 AM on the first day of each month
    async () => {
      try {
        console.log('🛍️ Generating monthly vending stock list...');
        await generateVendingStockList();
        console.log('✅ Vending stock list generated successfully.');
      } catch (error) {
        console.error('❌ Error generating vending stock list:', error);
      }
    },
    {
      timezone: 'America/New_York', // Set to Eastern Standard Time
    }
  );

  // // ------------------- Daily Blight Roll Call -------------------
  // // Scheduled to run at 8:05 PM EST daily to post roll call reminders and check for missed rolls
  // cron.schedule(
  //   '15 20 * * *', // 8:15 PM EST for testing
  //   async () => {
  //     try {
  //       console.log('⏰ Sending daily blight roll call...');
  //       await postBlightRollCall(client); // Pass client object
  //       await checkMissedRolls(client); // Pass client object
  //       console.log('✅ Blight roll call and missed roll checks completed.');
  //     } catch (error) {
  //       console.error('❌ Error during blight roll call:', error);
  //     }
  //   },
  //   {
  //     timezone: 'America/New_York', // Set to Eastern Standard Time
  //   }
  // );

  // ------------------- Monthly Blood Moon Announcement -------------------
  // Scheduled to run on the 13th of every Hyrulean month at 8 PM EST
  cron.schedule(
    '0 20 13 * *', // 8:00 PM on the 13th of each month
    async () => {
      try {
        console.log('🌕 Posting Blood Moon announcement...');
        await sendBloodMoonAnnouncement(client, process.env.BLOODMOON_ANNOUNCMENTS_CHANNEL_ID); // Use environment variable for channel ID
        console.log('✅ Blood Moon announcement posted successfully.');
      } catch (error) {
        console.error('❌ Error during Blood Moon announcement:', error);
      }
    },
    {
      timezone: 'America/New_York', // Set to Eastern Standard Time
    }
  );

  // ------------------- Daily Birthday Announcements -------------------
  // Scheduled to run at midnight EST every day to post birthday announcements
  cron.schedule(
    '0 0 * * *', // Midnight EST daily
    async () => {
      try {
        console.log('🎂 Checking for birthdays...');
        await executeBirthdayAnnouncements(client); // Call birthday announcements logic
        console.log('🎉 Birthday announcements completed.');
      } catch (error) {
        console.error('❌ Error during birthday announcements:', error);
      }
    },
    {
      timezone: 'America/New_York', // Set to Eastern Standard Time
    }
  );

  console.log('📅 All scheduled tasks are set up.');
};

// ------------------- Birthday Announcement Logic -------------------
// Function to check and announce birthdays
async function executeBirthdayAnnouncements(client) {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = estNow.toISOString().slice(5, 10); // Get MM-DD format

  // Fetch settings from MongoDB
  const settings = await Settings.find({});
  const birthdayMessages = [
    "🔥🌍 May Din's fiery blessing fill your birthday with the Power to overcome any challenge that comes your way! 🔴",
    "💧❄️ On this nameday, may Nayru's profound Wisdom guide you towards new heights of wisdom and understanding! 🔵",
    "🌿⚡ As you celebrate another year, may Farore's steadfast Courage inspire you to embrace every opportunity with bravery and grace! 🟢"
  ];

  // Iterate over all guild settings
  for (const setting of settings) {
    const guild = client.guilds.cache.get(setting.guildId);
    if (!guild) continue;

    const announcementChannel = guild.channels.cache.get(setting.birthdayChannel);
    if (!announcementChannel) continue;

    // Fetch characters with today's birthday
    const characters = await Character.find({ birthday: today });

    for (const character of characters) {
      // Fetch the user's details
      const user = await client.users.fetch(character.userId);

      // Select a random birthday message
      const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

      // Create an embed message for the birthday announcement
      const embed = new EmbedBuilder()
        .setColor('#F88379') // Soft birthday pink
        .setTitle(`🎉🎂🎈 Happy Birthday, ${character.name}! 🎈🎂🎉`)
        .setDescription(randomMessage)
        .setThumbnail(character.icon)
        .setFooter({ text: `🎉 ${character.name} belongs to ${user.username}! 🎉` })
        .setTimestamp()
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'); // Added image

      // Send the embed message to the announcement channel
      await announcementChannel.send({ embeds: [embed] });
    }
  }
}

// ------------------- Weekly Pet Rolls Reset -------------------
// Scheduled to run every Sunday at midnight EST
cron.schedule(
  '0 0 * * 0', // Midnight on Sundays
  async () => {
    try {
      console.log('🔄 Resetting pet rolls for the week...');
      await resetPetRollsForAllCharacters(); // Add a function to reset rolls
      console.log('✅ Pet rolls reset successfully.');
    } catch (error) {
      console.error('❌ Error during pet rolls reset:', error);
    }
  },
  {
    timezone: 'America/New_York', // Set to Eastern Standard Time
  }
);


//  // Test Schedule - Every 2 Minutes
//   cron.schedule(
//     '*/2 * * * *', // Every 2 minutes
//     async () => {
//       console.log('🗓️ Checking for new quests in Google Sheets...');
//       await fetchQuestsFromSheet(client);
//     },
//     {
//       timezone: 'America/New_York',
//     }
//   );

