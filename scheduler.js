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
const { cleanupExpiredVendingRequests } = require('./utils/storage');

// Models and utilities
const Settings = require('./models/SettingsModel');
const Character = require('./models/CharacterModel');
const { cleanupExpiredHealingRequests } = require('./utils/storage'); 
const { authorizeSheets, appendSheetData, getSheetIdByTitle } = require('./utils/googleSheetsUtils');
const { getCurrentVendingStockList } = require('./database/vendingService');


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

// ------------------- Monthly Push to Google Sheets -------------------
cron.schedule('0 2 1 * *', async () => {
  try {
      console.log('[scheduler]📊 Starting monthly vending stock push to Google Sheets...');
      
      // Authenticate with Google Sheets
      const auth = await authorizeSheets();

      // Spreadsheet ID and tab details
      const spreadsheetId = '163UPIMTyHLLCei598sP5Ezonpgl2W-DaSxn8JBSRRSw';
      const tabName = 'monthlyVending';

      // Clear only columns A:D
      const clearRange = `${tabName}!A1:D1000`;
      await clearSheetFormatting(auth, spreadsheetId, clearRange);
      console.log(`[scheduler]🧹 Cleared columns A:D in tab "${tabName}".`);

      // Fetch the current month's vending stock
      const stockList = await getCurrentVendingStockList();
      if (!stockList) {
          console.error('[scheduler]❌ No vending stock data available for the current month.');
          return;
      }

      // Determine the current month and year
      const now = new Date();
      const monthYear = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;

      // Write the header "Vending for Month Year" in A1
      const headerTitle = `Vending for ${monthYear}`;
      await writeSheetData(auth, spreadsheetId, `${tabName}!A1`, [[headerTitle]]);
      console.log(`[scheduler]📝 Header written: "${headerTitle}"`);

      // Write column headers in A2:D2
      const columnHeaders = ['Village Name', 'Item Name', 'Points Cost', 'Vending Type'];
      await writeSheetData(auth, spreadsheetId, `${tabName}!A2:D2`, [columnHeaders]);
      console.log(`[scheduler]📝 Column headers written: ${columnHeaders.join(', ')}`);

      // Format data for Google Sheets
      const formattedVillageData = [];
      for (const [village, items] of Object.entries(stockList.stockList)) {
          for (const item of items) {
              formattedVillageData.push([
                  village,                       // Village name
                  item.itemName,                 // Item name
                  item.points,                   // Points cost
                  item.vendingType,              // Vending type (Shopkeeper/Merchant)
              ]);
          }
      }

      // Log the number of village entries
      console.log(`[scheduler]🛒 Preparing to push ${formattedVillageData.length} village entries to Google Sheets...`);

      // Write village stock data starting in A3
      const villageDataRange = `${tabName}!A3:D`;
      await writeSheetData(auth, spreadsheetId, villageDataRange, formattedVillageData);

      // Handle limited items
      const limitedItems = stockList.limitedItems || [];
      if (limitedItems.length > 0) {
          // Calculate starting row for limited items
          const limitedItemsStartRow = formattedVillageData.length + 3; // Adjust for spacing
          const headersRange = `${tabName}!B${limitedItemsStartRow}:C${limitedItemsStartRow}`;
          const dataRange = `${tabName}!B${limitedItemsStartRow + 1}:C`;

          // Write headers for limited items
          const limitedItemsHeaders = ['Item Name', 'Points Cost'];
          await writeSheetData(auth, spreadsheetId, headersRange, [limitedItemsHeaders]);

          // Write limited items data
          const formattedLimitedItems = limitedItems.map(item => [
              item.itemName,
              item.points,
          ]);
          await writeSheetData(auth, spreadsheetId, dataRange, formattedLimitedItems);

          console.log(`[scheduler]✅ Successfully appended ${limitedItems.length} limited items to Google Sheets.`);
      } else {
          console.log('[scheduler]ℹ️ No limited items to append.');
      }

      console.log('[scheduler]✅ Successfully updated Google Sheets with vending stock and limited items.');
  } catch (error) {
      // Log failure with details
      console.error('[scheduler]❌ Error updating Google Sheets:', error.message);
      console.error(error.stack);
  }
}, { timezone: 'America/New_York' });

  // ------------------- Daily Blight Roll Call -------------------
  cron.schedule('00 20 * * *', async () => {
    try {
      console.log('v⏰ Sending daily blight roll call...');
      await postBlightRollCall(client);
      await checkMissedRolls(client);
      console.log('[scheduler]✅ Blight roll call and missed roll checks completed.');
    } catch (error) {
      console.error('❌ [Scheduler.js] Error during blight roll call:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Blight Death Check -------------------
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[scheduler]☠ Checking for characters who have died due to blight...');

    const now = new Date();
    const doomedCharacters = await Character.find({ 
      blightStage: 5, 
      deathDeadline: { $lte: now }
    });

    for (const character of doomedCharacters) {
      // Mark the character as dead
      character.blighted = false;
      character.blightStage = 0;
      character.deathDeadline = null; // Clear the deadline
      character.status = 'dead'; // Example field to mark death
      await character.save();

      console.log(`[scheduler]☠ Character ${character.name} has died due to blight.`);

      // Notify the user
      try {
        const user = await client.users.fetch(character.userId);
        if (user) {
          await user.send(`☠ **Your character ${character.name} has succumbed to the blight and has died.**`);
          console.log(`[scheduler]✅ User ${user.username} notified about ${character.name}'s death.`);
        }
      } catch (error) {
        console.error(`[scheduler]❌ Failed to notify user about ${character.name}'s death:`, error.message);
      }
    }

    console.log('[scheduler]✅ Blight death check completed.');
  } catch (error) {
    console.error('[scheduler]❌ Error during blight death check:', error.message);
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

  // ------------------- Daily Cleanup of Expired Vending Requests -------------------
  cron.schedule('0 0 * * *', async () => {
    try {
        console.log('[scheduler]🧹 Running daily cleanup of expired vending requests...');
        cleanupExpiredVendingRequests();
        console.log('[scheduler]✅ Expired vending requests cleaned up successfully.');
    } catch (error) {
        console.error('[scheduler]❌ Error during daily cleanup of vending requests:', error.message);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Cleanup of Expired Healing Requests -------------------
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[scheduler]🧹 Running daily cleanup of expired healing requests...');
      cleanupExpiredHealingRequests();
      console.log('[scheduler]✅ Expired healing requests cleaned up successfully.');
    } catch (error) {
      console.error('❌ [scheduler.js] Error during daily cleanup of healing requests:', error.message);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Debuff Expiry Check with DM Notifications -------------------
  cron.schedule('13 0 * * *', async () => {
    try {
      console.log('[scheduler]⏰ Checking for expired debuffs...');

      const now = new Date();
      const charactersWithActiveDebuffs = await Character.find({
        'debuff.active': true,
        'debuff.endDate': { $lte: now }
      });

      for (const character of charactersWithActiveDebuffs) {
        character.debuff.active = false; // Deactivate the debuff
        character.debuff.endDate = null; // Clear the end date
        await character.save(); // Save the updated character state

        console.log(`[scheduler]✅ Debuff removed for character: ${character.name}`);

        // Notify the user via DM
        try {
          const user = await client.users.fetch(character.userId);
          if (user) {
            await user.send(`💖 Your character **${character.name}**'s week-long debuff has ended! You can now heal them with items or a Healer.`);
            console.log(`[scheduler]✅ Notified user ${user.username} about debuff removal for ${character.name}.`);
          }
        } catch (dmError) {
          console.error(`❌ [scheduler] Failed to DM user:`, dmError);
        }
      }

      console.log('[scheduler]✅ Completed debuff expiry check.');
    } catch (error) {
      console.error('❌ [scheduler] Error during debuff expiry check:', error);
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
