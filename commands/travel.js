// ------------------- Import necessary modules -------------------
require('dotenv').config();
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { isValidVillage } = require('../modules/locationsModule');
const {
  updateCurrentHearts,
  useStamina,
  recoverHearts,
  useHearts
} = require('../modules/characterStatsModule');
const { fetchAllItems, fetchItemsByMonster } = require('../database/itemService');
const {
  createWeightedItemList,
  calculateFinalValue,
  getMonstersByPath,
  getRandomTravelEncounter
} = require('../modules/rngModule');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const {
  authorizeSheets,
  appendSheetData
} = require('../utils/googleSheetsUtils');
const {
  extractSpreadsheetId,
  isValidGoogleSheetsUrl
} = require('../utils/validation');
const {
  createMonsterEncounterEmbed,
  createInitialTravelEmbed,
  createTravelingEmbed,
  createSafeTravelDayEmbed,
  createFinalTravelEmbed,
  createStopInInarikoEmbed,
  pathEmojis
} = require('../embeds/travelEmbeds');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { v4: uuidv4 } = require('uuid');
const { handleTravelInteraction } = require('../handlers/travelHandler');
const { handleTravelAutocomplete } = require('../handlers/autocompleteHandler');

const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// ------------------- Define path channels -------------------
const PATH_CHANNELS = {
  pathOfScarletLeaves: process.env.PATH_OF_SCARLET_LEAVES_CHANNEL_ID,
  leafDewWay: process.env.LEAF_DEW_WAY_CHANNEL_ID,
};

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
        
        // ------------------- Ensure correct travel path/channel -------------------
        const currentChannel = interaction.channelId;

        // If traveling between Inariko and Vhintl, ensure it's done in "leaf-dew-way"
        if ((startingVillage === 'inariko' && destination === 'vhintl') || (startingVillage === 'vhintl' && destination === 'inariko')) {
            if (currentChannel !== PATH_CHANNELS.leafDewWay) {
                await interaction.editReply({ content: `❌ **You're trying to travel on the wrong road!** You must travel on 🥬 <#${PATH_CHANNELS.leafDewWay}>.` });
                return;
            }
        }

        // If traveling between Rudania and Inariko, ensure it's done in "path-of-scarlet-leaves"
        if ((startingVillage === 'inariko' && destination === 'rudania') || (startingVillage === 'rudania' && destination === 'inariko')) {
            if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
                await interaction.editReply({ content: `❌ **You're trying to travel on the wrong road!** You must travel on 🍂 <#${PATH_CHANNELS.pathOfScarletLeaves}>.` });
                return;
            }
        }

        // Determine the path(s) and total travel duration
        const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode);
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
        } else {
            await interaction.editReply({ content: `❌ Travel path between **${capitalizeFirstLetter(startingVillage)}** and **${capitalizeFirstLetter(destination)}** is not defined.` });
            return;
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
    
    // ------------------- Add a check for the correct road/channel based on travel route -------------------
    let finalChannelId;
    const currentPath = paths[Math.floor((day - 1) / 2)]; // Assign currentPath here before using it

    if ((destination === 'inariko' && startingVillage === 'rudania') || (destination === 'rudania' && startingVillage === 'inariko')) {
      // Always post in "path-of-scarlet-leaves" for Rudania-Inariko travel
      finalChannelId = PATH_CHANNELS.pathOfScarletLeaves;
    } else if ((destination === 'inariko' && startingVillage === 'vhintl') || (destination === 'vhintl' && startingVillage === 'inariko')) {
      // Always post in "leaf-dew-way" for Inariko-Vhintl travel
      finalChannelId = PATH_CHANNELS.leafDewWay;
    } else if (currentPath === 'pathOfScarletLeaves' && ((startingVillage === 'inariko' && destination === 'vhintl') || (startingVillage === 'vhintl' && destination === 'inariko'))) {
      // Check if the user is attempting to post in the wrong channel
      await interaction.followUp({ content: `❌ **You're trying to travel on the wrong road!** You must travel on 🥬 **leaf-dew-way**.` });
      return;
    } else {
      // Default path based on destination
      finalChannelId = destination === 'vhintl' || destination === 'inariko' ? PATH_CHANNELS.leafDewWay : PATH_CHANNELS.pathOfScarletLeaves;
    }

    const finalChannel = await interaction.client.channels.fetch(finalChannelId);
    const finalEmbed = createFinalTravelEmbed(character, destination, paths, totalTravelDuration, travelLog);
    await finalChannel.send({ embeds: [finalEmbed] });

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

 const encounterType = Math.random() < 0.5 ? 'No Encounter' : getRandomTravelEncounter();

 let dailyLogEntry = `**__Day ${day}:__**\n`;

 if (encounterType !== 'No Encounter') {
   const monsters = await getMonstersByPath(currentPath);

   if (monsters.length > 0) {
     const tier = parseInt(encounterType.split(' ')[1], 10);
     const filteredMonsters = monsters.filter(monster => monster.tier <= tier);
     const monster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];

     dailyLogEntry += `> ⚔️ Encountered a ${monster.name}!\n`;

     const fightResultEmbed = createMonsterEncounterEmbed(character, monster, `You encountered a ${monster.name}! What will you do?`, character.currentHearts, null, day, totalTravelDuration, pathEmoji, currentPath);

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
           .setDisabled(character.currentStamina === 0)
       );

     const encounterMessage = await channel.send({ embeds: [fightResultEmbed], components: [buttons] });

     const filter = (i) => i.user.id === interaction.user.id;
     const collector = encounterMessage.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

     collector.on('collect', async (i) => {
       const decision = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
       dailyLogEntry += `> ${decision}\n`;

       // Stop travel if KO'd
       if (decision.includes('KO')) {
         travelLog.push(dailyLogEntry);
         await channel.send({ embeds: [createFinalTravelEmbed(character, startingVillage, paths, day - 1, travelLog)] });
         return;
       }

       collector.stop();
     });

     collector.on('end', async (collected, reason) => {
       if (reason === 'time') {
         const decision = await handleTravelInteraction({ customId: 'fight' }, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
         dailyLogEntry += `> ${decision}\n`;
       }
       travelLog.push(dailyLogEntry);

       if (day === 2 && stopInInariko) {
         // Post stop in Inariko embed
         const nextChannelId = PATH_CHANNELS[paths[1]];
         const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
         await channel.send({ embeds: [stopEmbed] });
         travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);

         // Wait before processing Day 3
         await new Promise(resolve => setTimeout(resolve, 3000));
       }

       await processTravelDay(day + 1); // Process the next day automatically
     });

     return;
    }
  } else {
    const safeTravelEmbed = createSafeTravelDayEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);
    const safeTravelMessage = await channel.send({ embeds: [safeTravelEmbed] });

    lastSafeDayMessage = safeTravelMessage;

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('recover')
          .setLabel('💖 Recover a Heart')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(character.currentStamina === 0),
        new ButtonBuilder()
          .setCustomId('gather')
          .setLabel('🌿 Gather')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(character.currentStamina === 0),
        new ButtonBuilder()
          .setCustomId('do_nothing')
          .setLabel('✨ Do Nothing')
          .setStyle(ButtonStyle.Secondary)
      );

    await safeTravelMessage.edit({ components: [buttons] });

    const filter = (i) => i.user.id === interaction.user.id;
    const collector = safeTravelMessage.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

    collector.on('collect', async (i) => {
      const decision = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, safeTravelMessage, null, travelLog);
      dailyLogEntry += `> ${decision}\n`;
      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        const decision = await handleTravelInteraction({ customId: 'do_nothing' }, character, day, totalTravelDuration, pathEmoji, currentPath, safeTravelMessage, null, travelLog);
        dailyLogEntry += `> ${decision}\n`;
      }
      travelLog.push(dailyLogEntry);

      if (day === 2 && stopInInariko) {
        // Post stop in Inariko embed
        const nextChannelId = PATH_CHANNELS[paths[1]];
        const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
        await channel.send({ embeds: [stopEmbed] });
        travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);

        // Wait before processing Day 3
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      await processTravelDay(day + 1); // Process the next day automatically
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
