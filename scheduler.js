require('dotenv').config();
const cron = require('node-cron');
const { handleError } = require('./utils/globalErrorHandler');
const { EmbedBuilder } = require('discord.js');
const { recoverDailyStamina } = require('./modules/characterStatsModule');
const { generateVendingStockList, getCurrentVendingStockList, resetPetRollsForAllCharacters } = require('./database/db');
const { checkMissedRolls, postBlightRollCall } = require('./handlers/blightHandler');
const {sendBloodMoonAnnouncement, isBloodMoonDay, renameChannels, revertChannelNames} = require('./scripts/bloodmoon');
const { cleanupExpiredVendingRequests, cleanupExpiredHealingRequests } = require('./utils/storage');
const { authorizeSheets, clearSheetFormatting, writeSheetData } = require('./utils/googleSheetsUtils');
const { convertToHyruleanDate } = require('./modules/calendarModule');
const Character = require('./models/CharacterModel');
const weatherHandler = require('./handlers/weatherHandler');

// ------------------- Jail Release Check -------------------
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[scheduler]⏰ Checking for characters eligible for jail release...');
    const now = new Date();
    const charactersToRelease = await Character.find({ inJail: true, jailReleaseTime: { $lte: now } });
    if (charactersToRelease.length > 0) {
      // Fetch the announcement channel using its ID.
      const announcementChannelId = '1354451878053937215';
      const announcementChannel = await client.channels.fetch(announcementChannelId);
      
      for (const character of charactersToRelease) {
        // Reset jail status.
        character.inJail = false;
        character.failedStealAttempts = 0;
        character.jailReleaseTime = null;
        await character.save();
        console.log(`[scheduler]✅ Released character ${character.name} from jail.`);
        
        // Build the release announcement embed.
        const releaseEmbed = new EmbedBuilder()
          .setColor('#88cc88')
          .setTitle('🏛️ Town Hall Proclamation')
          .setDescription(`The town hall doors creak open and a voice rings out:\n\n> **${character.name}** has served their time and is hereby released from jail.\n\nMay you walk the path of virtue henceforth.`)
          .setThumbnail(character.icon)
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setTimestamp()
          .setFooter({ text: 'Town Hall Records • Reformed & Released' });
        
        // Send the announcement in the designated channel.
        if (announcementChannel) {
          await announcementChannel.send({
            content: `<@${character.userId}>, your character **${character.name}** has been released from jail.`,
            embeds: [releaseEmbed]
          });
        }
        
        // DM the user to notify them.
        try {
          const user = await client.users.fetch(character.userId);
          if (user) {
            await user.send(`🏛️ **Town Hall Notice**\n\nYour character **${character.name}** has been released from jail. Remember, a fresh start awaits you!`);
          }          
        } catch (dmError) {
    handleError(dmError, 'scheduler.js');

          console.error(`[scheduler]❌ Error sending DM for character ${character.name}:`, dmError.message);
        }
      }
    } else {
      console.log('[scheduler] No characters to release from jail at this time.');
    }
  } catch (error) {
    handleError(error, 'scheduler.js');

    console.error('[scheduler]❌ Error during jail release check:', error.message);
  }
}, { timezone: 'America/New_York' });


  // ------------------- Daily Stamina Recovery -------------------
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[scheduler]⏰ Running daily stamina recovery job...');
      await recoverDailyStamina();
      console.log('[scheduler]✅ Daily stamina recovery completed.');
    } catch (error) {
    handleError(error, 'scheduler.js');

      console.error('❌ [Scheduler.js] Error during stamina recovery:', error);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Monthly Vending Stock Generation -------------------
cron.schedule('0 0 1 * *', async () => {
  try {
    console.log('[scheduler]📦 Generating monthly vending stock...');
    await generateVendingStockList();
    console.log('[scheduler]✅ Monthly vending stock generated.');
  } catch (error) {
    handleError(error, 'scheduler.js');

    console.error('[scheduler]❌ Error during monthly vending stock generation:', error.message);
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
      handleError(error, 'scheduler.js');
  }
}, { timezone: 'America/New_York' });

  // ------------------- Daily Blight Roll Call, Missed Rolls, and Death Check -------------------
cron.schedule('0 20 * * *', async () => { 
  try {
    console.log('[scheduler]⏰ Running Blight Roll Call, Missed Rolls Check, and Death Check...');

    // Step 1: Post Blight Roll Call once
    try {
      await postBlightRollCall(client);
      console.log('[scheduler]✅ Blight roll call posted.');
    } catch (error) {
    handleError(error, 'scheduler.js');

      console.error('[scheduler]❌ Failed to post Blight roll call:', error.message);
    }

    // Step 2: Run Missed Rolls Check
    await checkMissedRolls(client);
    console.log('[scheduler]✅ Missed roll check completed.');

    // Step 3: Run Death Check (Retain Notify Logic)
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
      character.deathDeadline = null;
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
    handleError(error, 'scheduler.js');

        console.error(`[scheduler]❌ Failed to notify user about ${character.name}'s death:`, error.message);
      }
    }

    console.log('[scheduler]✅ Blight death check completed.');

  } catch (error) {
    handleError(error, 'scheduler.js');

    console.error('❌ [Scheduler.js] Error during blight roll call sequence:', error);
  }
}, { timezone: 'America/New_York' });

   // ------------------- Daily Blood Moon Tracking and Announcement -------------------
   cron.schedule(
    '24 12 * * *', // Run daily at midnight
    async () => {
      const channels = [
        process.env.RUDANIA_TOWN_HALL,
        process.env.INARIKO_TOWN_HALL,
        process.env.VHINTL_TOWN_HALL,
      ];

      for (const channelId of channels) {
        try {
          if (isBloodMoonDay()) {
            console.log('[scheduler] 🌕 Blood Moon is ACTIVE.');
            await renameChannels(client);
            await sendBloodMoonAnnouncement(client, channelId, 'The Blood Moon is upon us! Beware!');
          } else {
            console.log('[scheduler] 🌑 No Blood Moon today.');
            await revertChannelNames(client);
          }
        } catch (error) {
    handleError(error, 'scheduler.js');

          console.error(`[scheduler] ❌ Error during Blood Moon tracking for channel ${channelId}:`, error.message);
        }
      }
    },
    { timezone: 'America/New_York' }
  );

  console.log('[scheduler] 🌕 Blood Moon scheduling tasks initialized.');

  // ------------------- Daily Birthday Announcements -------------------
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🎂 Checking for birthdays...');
      await executeBirthdayAnnouncements(client);
      console.log('🎉 Birthday announcements completed.');
    } catch (error) {
    handleError(error, 'scheduler.js');

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
    handleError(error, 'scheduler.js');

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
    handleError(error, 'scheduler.js');

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
    handleError(error, 'scheduler.js');

      console.error('❌ [scheduler.js] Error during daily cleanup of healing requests:', error.message);
    }
  }, { timezone: 'America/New_York' });

  // ------------------- Daily Debuff Expiry Check with DM Notifications -------------------
  cron.schedule('0 0 * * *', async () => {
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
    handleError(dmError, 'scheduler.js');

          console.error(`❌ [scheduler] Failed to DM user:`, dmError);
        }
      }

      console.log('[scheduler]✅ Completed debuff expiry check.');
    } catch (error) {
    handleError(error, 'scheduler.js');

      console.error('❌ [scheduler] Error during debuff expiry check:', error);
    }
  }, { timezone: 'America/New_York' });

  // ============================================================================
  // ---- Scheduled Weather Posting ----
  // Handles daily weather updates in townhall channels at 8am
  // ============================================================================

  const TOWNHALL_CHANNELS = {
    Rudania: 'rudania-townhall',
    Inariko: 'inariko-townhall',
    Vhintl: 'vhintl-townhall'
  };

  // ---- Function: formatWeatherMessage ----
  // Creates a formatted Discord message for weather updates
  function formatWeatherMessage(village, weather) {
    const { temperature, wind, precipitation, special } = weather;
    let message = `## 🌤️ Daily Weather Report for ${village}\n\n`;
    message += `**Temperature:** ${temperature.emoji} ${temperature.label}\n`;
    message += `**Wind:** ${wind.emoji} ${wind.label}\n`;
    message += `**Conditions:** ${precipitation.emoji} ${precipitation.label}\n`;
    if (special) {
      message += `**Special:** ${special.emoji} ${special.label}\n`;
    }
    return message;
  }

  // ---- Function: postWeatherUpdate ----
  // Posts weather updates to all townhall channels
  async function postWeatherUpdate(client) {
    try {
      console.log('[scheduler.js]: Starting daily weather update...');
      const villages = Object.keys(TOWNHALL_CHANNELS);
      const currentSeason = getCurrentSeason();
      for (const village of villages) {
        try {
          const weather = weatherHandler.simulateWeightedWeather(village, currentSeason);
          const channelName = TOWNHALL_CHANNELS[village];
          const channel = client.channels.cache.find(ch => ch.name === channelName);
          if (!channel) {
            console.error(`[scheduler.js]: Could not find channel: ${channelName}`);
            continue;
          }
          const message = formatWeatherMessage(village, weather);
          await channel.send(message);
          console.log(`[scheduler.js]: Posted weather update for ${village}`);
        } catch (error) {
          console.error(`[scheduler.js]: Error posting weather for ${village}:`, error);
        }
      }
      console.log('[scheduler.js]: Completed daily weather update');
    } catch (error) {
      console.error('[scheduler.js]: Error in weather update process:', error);
    }
  }

  // ---- Function: setupWeatherScheduler ----
  // Sets up the daily weather posting schedule
  function setupWeatherScheduler(client) {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(8, 0, 0, 0);
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    const timeUntilNext = nextRun - now;
    setTimeout(() => {
      postWeatherUpdate(client);
      setInterval(() => {
        postWeatherUpdate(client);
      }, 24 * 60 * 60 * 1000);
    }, timeUntilNext);
    console.log(`[scheduler.js]: Weather scheduler initialized. Next update in ${timeUntilNext / 1000 / 60} minutes`);
  }

  // ---- Function: getCurrentSeason ----
  // Determines the current season based on date
  function getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Autumn';
    return 'Winter';
  }

  // ------------------- Birthday Announcement Logic -------------------
  // Function to check and announce birthdays
  async function executeBirthdayAnnouncements(client) {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = estNow.toISOString().slice(5, 10);

    console.log(`[Birthday] Today's date: ${today}`);

    // Parse GUILD_IDS from the .env file
    const guildIds = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',') : [];

    // Map of guild IDs to their birthday announcement channels
    const guildChannelMap = {
      '1305484048063529002': '1326997448085995530', // Roots Of The Wild
      '603960955839447050': 'AnotherChannelIDHere', // Replace with the appropriate channel ID
    };

    const birthdayMessages = [
      "🔥🌍 May Din's fiery blessing fill your birthday with the **Power** to overcome any challenge that comes your way! 🔴",
      "💧❄️ On this nameday, may Nayru's profound **Wisdom** guide you towards new heights of wisdom and understanding! 🔵",
      "🌿⚡ As you celebrate another year, may Farore's steadfast **Courage** inspire you to embrace every opportunity with bravery and grace! 🟢",
    ];

    // Function to convert the real-world date to "January 10"
    const formatRealWorldDate = (date) => {
      return date.toLocaleString("en-US", { month: "long", day: "numeric" });
    };

    const realWorldDate = formatRealWorldDate(estNow);
    const hyruleanDate = convertToHyruleanDate(estNow);

    for (const guildId of guildIds) {
      const birthdayChannelId = guildChannelMap[guildId];
      if (!birthdayChannelId) {
        console.log(`[Birthday] No birthday channel configured for guild ID ${guildId}.`);
        continue;
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`[Birthday] Guild with ID ${guildId} not found.`);
        continue;
      }

      const announcementChannel = guild.channels.cache.get(birthdayChannelId);
      if (!announcementChannel) {
        console.log(`[Birthday] Announcement channel not found for guild ${guild.name}.`);
        continue;
      }

      // Fetch characters with birthdays today
      const characters = await Character.find({ birthday: today });
      console.log(`[Birthday] Found ${characters.length} characters with birthdays today in guild ${guild.name}.`);

      for (const character of characters) {
        try {
          const user = await client.users.fetch(character.userId);
          const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];

          const embed = new EmbedBuilder()
            .setColor('#FF709B')
            .setTitle(`🎉🎂🎈 Happy Birthday, ${character.name}! 🎈🎂🎉`)
            .setDescription(randomMessage)
            .addFields(
              { name: "Real-World Date", value: realWorldDate, inline: true },
              { name: "Hyrulean Date", value: hyruleanDate, inline: true }
            )
            .setThumbnail(character.icon)
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/bday.png') // Added image
            .setFooter({ text: `🎉 ${character.name} belongs to ${user.username}! 🎉` })
            .setTimestamp();

          await announcementChannel.send({ embeds: [embed] });
          console.log(`[Birthday] Announced ${character.name}'s birthday in ${guild.name}.`);
        } catch (error) {
    handleError(error, 'scheduler.js');

          console.error(`[Birthday] Failed to announce for character ${character.name}:`, error.message);
        }
      }
    }
  }

module.exports = {
  setupWeatherScheduler,
  postWeatherUpdate,
  // ...add any other exports as needed
};





