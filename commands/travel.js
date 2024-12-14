// ------------------- Import necessary modules -------------------
// ------------------- Import necessary modules -------------------
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');

// Discord.js modules
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

// Database services
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { fetchAllItems, fetchItemsByMonster } = require('../database/itemService');

// Embeds
const { createFinalTravelEmbed, createInitialTravelEmbed, createMonsterEncounterEmbed, createSafeTravelDayEmbed, createStopInInarikoEmbed, createTravelingEmbed, pathEmojis } = require('../embeds/travelEmbeds');

// Handlers
const { handleTravelAutocomplete } = require('../handlers/autocompleteHandler');
const { handleTravelInteraction } = require('../handlers/travelHandler');

// Modules
const { isValidVillage } = require('../modules/locationsModule');
const { attemptFlee, createWeightedItemList, calculateFinalValue, getMonstersByPath, getRandomTravelEncounter } = require('../modules/rngModule');
const { updateCurrentHearts, useStamina, recoverHearts, useHearts } = require('../modules/characterStatsModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { hasPerk } = require('../modules/jobsModule');

// Utils
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');


const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// ------------------- Define path channels -------------------
const PATH_CHANNELS = {
  pathOfScarletLeaves: process.env.PATH_OF_SCARLET_LEAVES_CHANNEL_ID,
  leafDewWay: process.env.LEAF_DEW_WAY_CHANNEL_ID,
};



// Validate that channels are correctly loaded
if (!PATH_CHANNELS.pathOfScarletLeaves || !PATH_CHANNELS.leafDewWay) {
  console.error("❌ Channel IDs not properly loaded from .env file. Please verify your .env configuration.");
  throw new Error("Missing required channel IDs in .env file");
}

// ------------------- Helper function to get channel name -------------------
function getChannelNameById(client, channelId) {
  const channel = client.channels.cache.get(channelId);
  return channel ? channel.name : 'unknown channel';
}

// ------------------- Helper function to calculate travel duration -------------------
function calculateTravelDuration(currentVillage, destination, mode) {
  const travelTimes = {
    'on foot': {
      'rudania-inariko': 2,
      'inariko-vhintl': 2,
      'rudania-vhintl': 4
    },
    'on mount': {
      'rudania-inariko': 1,
      'inariko-vhintl': 1,
      'rudania-vhintl': 2
    }
  };

  const key = `${currentVillage}-${destination}`;
  return travelTimes[mode][key] || travelTimes[mode][`${destination}-${currentVillage}`] || -1;
}

// ------------------- Travel command -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('travel')
    .setDescription('Travel between villages')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('destination')
        .setDescription('The village to travel to')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Mode of travel (on foot or on mount)')
        .setRequired(true)
        .addChoices(
          { name: 'on foot', value: 'on foot' },
          { name: 'on mount', value: 'on mount' })),

  // ------------------- Handle autocomplete options -------------------
  async autocomplete(interaction) {
    await handleTravelAutocomplete(interaction); // Reference the handler
  },

  // ------------------- Execute travel command -------------------
  async execute(interaction) {
    try {
        await interaction.deferReply(); // Defer the interaction to prevent timeout

        // Get the input options
        const characterName = interaction.options.getString('charactername');
        const destination = interaction.options.getString('destination').toLowerCase();
        const mode = interaction.options.getString('mode');
        const userId = interaction.user.id;

        // Fetch the character data
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            await interaction.editReply({ content: `❌ **Character ${characterName}** not found or does not belong to you.` });
            return;
        }

        // Check if the character's inventory has been synced
        if (!character.inventorySynced) {
          return interaction.editReply({
              content: `❌ **You cannot use the travel command because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
              ephemeral: true,
          });
        }


        // Check if the character is KO'd or has no hearts left
        if (character.currentHearts <= 0 || character.ko) {
            await interaction.editReply({ content: `❌ **Character ${characterName}** is KO'd and cannot travel.` });
            return;
        }

        const startingVillage = character.currentVillage.toLowerCase(); // Save the starting village for final message

        // Check if the character is already in the destination village
        if (startingVillage === destination) {
            await interaction.editReply({ content: `❌ **Character ${characterName}** is already in **${capitalizeFirstLetter(destination)}**! They cannot travel to the village they are already in.` });
            return;
        }

        // Validate destination
        if (!isValidVillage(destination)) {
            await interaction.editReply({ content: `❌ Invalid destination: **${capitalizeFirstLetter(destination)}**. Please select a valid village.` });
            return;
        }
        
// Determine the path(s) and total travel duration
const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode);
if (totalTravelDuration === -1) {
    await interaction.editReply({
        content: `❌ Travel path between **${capitalizeFirstLetter(startingVillage)}** and **${capitalizeFirstLetter(destination)}** is not defined.`
    });
    return;
}

// ------------------- Ensure correct travel path/channel -------------------
const currentChannel = interaction.channelId;

// Validate channel for 4-day travel routes
if (totalTravelDuration === 4) {
    if (startingVillage === 'rudania' && destination === 'vhintl') {
        if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
            await interaction.editReply({
                content: `❌ **${character.name}** is trying to travel from **Rudania** to **Vhintl**, but you're on the wrong road! You must start in <#${PATH_CHANNELS.pathOfScarletLeaves}>`
            });
            return;
        }
    } else if (startingVillage === 'vhintl' && destination === 'rudania') {
        if (currentChannel !== PATH_CHANNELS.leafDewWay) {
            await interaction.editReply({
                content: `❌ **${character.name}** is trying to travel from **Vhintl** to **Rudania**, but you're on the wrong road! You must start in <#${PATH_CHANNELS.leafDewWay}>.`
            });
            return;
        }
    }
}

// Validate channel for 2-day travel routes
if ((startingVillage === 'inariko' && destination === 'vhintl') || (startingVillage === 'vhintl' && destination === 'inariko')) {
    if (currentChannel !== PATH_CHANNELS.leafDewWay) {
        await interaction.editReply({
            content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(startingVillage)}** to **${capitalizeFirstLetter(destination)}**, but you're on the wrong road! You must travel on <#${PATH_CHANNELS.leafDewWay}>.`
        });
        return;
    }
}

if ((startingVillage === 'inariko' && destination === 'rudania') || (startingVillage === 'rudania' && destination === 'inariko')) {
    if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
        await interaction.editReply({
            content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(startingVillage)}** to **${capitalizeFirstLetter(destination)}**, but you're on the wrong road! You must travel on <#${PATH_CHANNELS.pathOfScarletLeaves}>`
        });
        return;
    }
}

// Set up paths
let paths = [];
let stopInInariko = false;

if (totalTravelDuration === 4) {
    if (startingVillage === 'rudania') {
        paths = ['pathOfScarletLeaves', 'leafDewWay'];
    } else {
        paths = ['leafDewWay', 'pathOfScarletLeaves'];
    }
    stopInInariko = true;
} else if (totalTravelDuration === 2) {
    paths = [startingVillage === 'rudania' || destination === 'rudania' ? 'pathOfScarletLeaves' : 'leafDewWay'];
}

// Initial travel announcement
const initialEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration);
await interaction.followUp({ embeds: [initialEmbed] });

let travelLog = [];
let travelingMessages = [];
let lastSafeDayMessage = null;

// ------------------- Helper function to process each travel day -------------------
const processTravelDay = async (day) => {
  if (day > totalTravelDuration) {
      // Arrival announcement
      character.currentVillage = destination;
      await character.save();

      // Add a check for the correct road/channel based on travel route
      let finalChannelId;
      const currentPath = paths[Math.floor((day - 1) / 2)]; // Assign currentPath here before using it

      if ((destination === 'inariko' && startingVillage === 'rudania') || (destination === 'rudania' && startingVillage === 'inariko')) {
          finalChannelId = PATH_CHANNELS.pathOfScarletLeaves;
      } else if ((destination === 'inariko' && startingVillage === 'vhintl') || (destination === 'vhintl' && startingVillage === 'inariko')) {
          finalChannelId = PATH_CHANNELS.leafDewWay;
      } else {
          finalChannelId = destination === 'vhintl' || destination === 'inariko'
              ? PATH_CHANNELS.leafDewWay
              : PATH_CHANNELS.pathOfScarletLeaves;
      }

      const finalChannel = await interaction.client.channels.fetch(finalChannelId);
      const finalEmbed = createFinalTravelEmbed(character, destination, paths, totalTravelDuration, travelLog);

      // Attach a default image to the embed
      const imageEmbed = new EmbedBuilder()
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png') // Replace with a default image URL
          .setDescription('You arrived safely.');

      try {
          // Send the arrival embeds
          await finalChannel.send({ embeds: [finalEmbed] });
          await finalChannel.send({ embeds: [imageEmbed] });
      } catch (error) {
          console.error('❌ Error sending the arrival embed:', error);
          await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
      }

      // Delete only the traveling messages
      for (const msg of travelingMessages) {
          await msg.delete();
      }

      return;
  }

 // Post "Character is traveling..."
 const currentPath = paths[Math.floor((day - 1) / 2)]; // Use currentPath after assigning it
 const pathEmoji = pathEmojis[currentPath];
 const channelId = PATH_CHANNELS[currentPath];
 const channel = await interaction.client.channels.fetch(channelId);

 const travelingEmbed = createTravelingEmbed(character);
 const travelingMessage = await channel.send({ embeds: [travelingEmbed] });
 travelingMessages.push(travelingMessage);
 await new Promise(resolve => setTimeout(resolve, 3000));

// ------------------- Determine Encounter Type -------------------
const encounterType = Math.random() < 0.5 ? 'No Encounter' : getRandomTravelEncounter();

// ------------------- Initialize Daily Log Entry -------------------
let dailyLogEntry = `**__Day ${day}:__**\n`;

// ------------------- Handle Encounter -------------------
if (encounterType !== 'No Encounter') {
    // Fetch all monsters available for the current path
    const monsters = await getMonstersByPath(currentPath);

    if (monsters.length > 0) {
        // ------------------- Filter Monsters by Tier -------------------
        const tier = parseInt(encounterType.split(' ')[1], 10); // Extract the tier from encounter type
        const filteredMonsters = monsters.filter(monster => monster.tier <= tier); // Only include monsters of the same or lower tier
        const monster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)]; // Select a random monster

        dailyLogEntry += `> ⚔️ Encountered a ${monster.name}!\n`;

        // ------------------- Create Encounter Embed -------------------
        const fightResultEmbed = createMonsterEncounterEmbed(
            character,
            monster,
            `You encountered a ${monster.name}! What do you want to do? Fleeing costs 1 stamina!`,
            character.currentHearts,
            null,
            day,
            totalTravelDuration,
            pathEmoji,
            currentPath
        );

        // ------------------- Create Buttons for Encounter Options -------------------
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('fight')
                    .setLabel('⚔️ Fight')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('flee')
                    .setLabel('💨 Flee')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(character.currentStamina === 0) // Disable if stamina is 0
            );

        // ------------------- Send Encounter Message -------------------
        const encounterMessage = await channel.send({ embeds: [fightResultEmbed], components: [buttons] });

        // ------------------- Create a Collector to Handle User Interaction -------------------
        const filter = (i) => i.user.id === interaction.user.id; // Only allow the interaction user
        const collector = encounterMessage.createMessageComponentCollector({ filter, time: 300000 }); // Timeout after 5 minutes

        // ------------------- Handle User Interaction -------------------
        collector.on('collect', async (i) => {
            const decision = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
            dailyLogEntry += `> ${decision}\n`;

            // Stop travel if the character is KO'd
            if (decision.includes('KO')) {
                travelLog.push(dailyLogEntry);
                await channel.send({ embeds: [createFinalTravelEmbed(character, startingVillage, paths, day - 1, travelLog)] });
                return;
            }

            collector.stop();
        });

        // ------------------- Handle Collector Timeout -------------------
        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const decision = await handleTravelInteraction({ customId: 'fight' }, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
                dailyLogEntry += `> ${decision}\n`;
            }

            // Log the day and proceed to the next day
            travelLog.push(dailyLogEntry);

            if (day === 2 && stopInInariko) {
                const nextChannelId = PATH_CHANNELS[paths[1]];
                const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
                await channel.send({ embeds: [stopEmbed] });
                travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);
            
                // Attach a custom image for the stop
                const imageEmbed = new EmbedBuilder()
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png') // Replace with the desired image URL
                    .setDescription('A serene view accompanies the stop.');
            
                try {
                    await channel.send({ embeds: [imageEmbed] });
                } catch (error) {
                    console.error('❌ Error sending the stop image embed:', error);
                }
            
                // Wait briefly before processing the next day
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            

            await processTravelDay(day + 1); // Process the next day
        });

        return; // Exit after handling the encounter
    }
} else {
    // ------------------- Handle No Encounter -------------------
    const safeTravelEmbed = createSafeTravelDayEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);
    const safeTravelMessage = await channel.send({ embeds: [safeTravelEmbed] });

    lastSafeDayMessage = safeTravelMessage;

    // ------------------- Create Buttons for Safe Travel Actions -------------------
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('recover')
                .setLabel('💖 Recover a Heart')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(character.currentStamina === 0), // Disable if no stamina
            new ButtonBuilder()
                .setCustomId('gather')
                .setLabel('🌿 Gather')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(character.currentStamina === 0), // Disable if no stamina
            new ButtonBuilder()
                .setCustomId('do_nothing')
                .setLabel('✨ Do Nothing')
                .setStyle(ButtonStyle.Secondary)
        );

    // ------------------- Send Safe Travel Message -------------------
    await safeTravelMessage.edit({
        embeds: [safeTravelEmbed], // Use the safe travel embed
        components: [buttons],    // Attach the buttons
    });

    // ------------------- Create Collector for Safe Travel Actions -------------------
    const filter = (i) => i.user.id === interaction.user.id; // Only allow the interaction user
    const collector = safeTravelMessage.createMessageComponentCollector({ filter, time: 300000 }); // Timeout after 5 minutes


// ------------------- Handle User Interaction -------------------
collector.on('collect', async (i) => {
  const decision = await handleTravelInteraction(
      i,
      character,
      day,
      totalTravelDuration,
      pathEmoji,
      currentPath,
      safeTravelMessage,
      null, // No monster for safe travel
      travelLog
  );

  // Append the decision to the daily log entry
  dailyLogEntry += `> ${decision}\n`;

  // Update the safe travel message
  const updatedEmbed = new EmbedBuilder(safeTravelMessage.embeds[0].toJSON())
      .setDescription(`🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`);

  await safeTravelMessage.edit({
      embeds: [updatedEmbed],
      components: [] // Remove buttons after the action
  });

  collector.stop(); // Stop the collector after the user takes an action
});


    // ------------------- Handle Collector Timeout -------------------
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const decision = await handleTravelInteraction(
                { customId: 'do_nothing' },
                character,
                day,
                totalTravelDuration,
                pathEmoji,
                currentPath,
                safeTravelMessage,
                null,
                travelLog
            );
            dailyLogEntry += `> ${decision}\n`;
        }

        // Log the day and proceed to the next day
        travelLog.push(dailyLogEntry);

        if (day === 2 && stopInInariko) {
            const nextChannelId = PATH_CHANNELS[paths[1]];
            const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
            await channel.send({ embeds: [stopEmbed] });
            travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);
        
            // Attach a custom image for the stop
            const imageEmbed = new EmbedBuilder()
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png') // Replace with the desired image URL
                .setDescription('A serene view accompanies the stop.');
        
            try {
                await channel.send({ embeds: [imageEmbed] });
            } catch (error) {
                console.error('❌ Error sending the stop image embed:', error);
            }
        
            // Wait briefly before processing the next day
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        

        await processTravelDay(day + 1); // Process the next day
      });
    
    }
  };

      await processTravelDay(1); // Start processing travel from day 1      
    } catch (error) {
      console.error(`❌ Error during travel command execution: ${error.message}`, error);
      await interaction.followUp({ content: `❌ **Error during travel command execution:** ${error.message}` });
    }
  }
};
