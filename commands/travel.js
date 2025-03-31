// ------------------- Standard Libraries -------------------
// Load environment variables from .env file
require('dotenv').config();


// ------------------- Discord.js Components -------------------
// Import Discord.js classes for building commands, embeds, buttons, etc.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');


// ------------------- Database Services -------------------
// Import database service functions for character retrieval
const { fetchCharacterByNameAndUserId } = require('../database/characterService');


// ------------------- Embeds -------------------
// Import functions for creating travel-related embed messages and path emojis
const { 
  createFinalTravelEmbed, 
  createInitialTravelEmbed, 
  createMonsterEncounterEmbed, 
  createSafeTravelDayEmbed, 
  createStopInInarikoEmbed, 
  createTravelingEmbed, 
  pathEmojis 
} = require('../embeds/travelEmbeds');


// ------------------- Handlers -------------------
// Import handlers for autocomplete and interaction logic in travel commands
const { handleTravelAutocomplete } = require('../handlers/autocompleteHandler');
const { handleTravelInteraction } = require('../handlers/travelHandler');


// ------------------- Modules -------------------
// Import custom modules (alphabetized by exported variable)
// Formatting utilities
const { capitalizeFirstLetter } = require('../modules/formattingModule');
// Random number generation utilities for travel encounters
const { getMonstersByPath, getRandomTravelEncounter } = require('../modules/rngModule');
// Job-related functions
const { hasPerk } = require('../modules/jobsModule');
// Location validation utilities
const { isValidVillage } = require('../modules/locationsModule');


// ------------------- Constants -------------------
// Default image URL used in travel embeds (if needed)
const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// Predefined path channel IDs for different travel routes
const PATH_CHANNELS = {
  pathOfScarletLeaves: '1305487405985431583', // Scarlet Leaves path
  leafDewWay: '1305487571228557322'           // Leaf Dew Way path
};

// Validate required channel IDs are loaded
if (!PATH_CHANNELS.pathOfScarletLeaves || !PATH_CHANNELS.leafDewWay) {
  console.error(`[travel.js]: Error: Channel IDs not properly loaded. Check .env file.`);
  throw new Error("Missing required channel IDs in .env file.");
}


// ------------------- Helper Functions -------------------

// Calculate travel duration based on starting village, destination, travel mode, and character perks.
function calculateTravelDuration(currentVillage, destination, mode, character) {
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
  const reverseKey = `${destination}-${currentVillage}`;
  const baseDuration = travelTimes[mode][key] || travelTimes[mode][reverseKey] || -1;

  // If the character has the DELIVERING perk, halve the duration (minimum 1 day)
  if (baseDuration > 0 && hasPerk(character, 'DELIVERING')) {
    return Math.max(1, Math.ceil(baseDuration / 2));
  }
  return baseDuration;
}

// Determine the current travel path for the day based on the available paths and whether the DELIVERING perk is active.
function getCurrentPath(day, paths, halfTime) {
  if (paths.length === 0) {
    console.error(`[travel.js]: Error: Invalid path length ${paths.length}`);
    return null;
  }
  if (paths.length === 1) {
    return paths[0];
  }
  return paths[Math.floor((day - 1) / (halfTime ? 1 : 2))];
}


// ------------------- Module Export: Travel Command -------------------
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
          { name: 'on mount', value: 'on mount' }
        )
    ),

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    await handleTravelAutocomplete(interaction);
  },

  // ------------------- Execute Travel Command -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // ------------------- Extract Options from Interaction -------------------
      const characterName = interaction.options.getString('charactername');
      const destination = interaction.options.getString('destination').toLowerCase();
      const mode = interaction.options.getString('mode');
      const userId = interaction.user.id;

      // ------------------- Fetch Character from Database -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ 
          content: `❌ **Character "${characterName}"** not found or does not belong to you.` 
        });
        return;
      }

      // ------------------- Check if Character is Debuffed -------------------
      if (character.debuff.active) {
        const remainingDays = Math.ceil((character.debuff.endDate - new Date()) / (1000 * 60 * 60 * 24));
        await interaction.editReply({ 
          content: `❌ **${character.name}** is currently recovering and cannot travel for ${remainingDays} more day(s).` 
        });
        return;
      }

      // ------------------- Check Inventory Sync -------------------
      if (!character.inventorySynced) {
        await interaction.editReply({
          content: `❌ **You cannot use the travel command because "${character.name}"'s inventory is not set up yet.**\n\n` +
                   `Please use the \`/testinventorysetup\` command, then \`/syncinventory\` to initialize the inventory.`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Check if Character is KO'd -------------------
      if (character.currentHearts <= 0 || character.ko) {
        await interaction.editReply({ 
          content: `❌ **Character "${characterName}"** is KO'd and cannot travel.` 
        });
        return;
      }

      // ------------------- Validate Travel Parameters -------------------
      const startingVillage = character.currentVillage.toLowerCase();
      if (startingVillage === destination) {
        await interaction.editReply({ 
          content: `❌ **Character "${characterName}"** is already in **${capitalizeFirstLetter(destination)}**!` 
        });
        return;
      }
      if (!isValidVillage(destination)) {
        await interaction.editReply({ 
          content: `❌ Invalid destination: **${capitalizeFirstLetter(destination)}**. Please select a valid village.` 
        });
        return;
      }

      // ------------------- Determine Travel Duration -------------------
      const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode, character);
      if (totalTravelDuration === -1) {
        await interaction.editReply({
          content: `❌ Travel path between **${capitalizeFirstLetter(startingVillage)}** and **${capitalizeFirstLetter(destination)}** is not defined.`
        });
        return;
      }

      // ------------------- Validate Correct Travel Channel -------------------
      const currentChannel = interaction.channelId;
      if (totalTravelDuration === 4) {
        if (startingVillage === 'rudania' && destination === 'vhintl') {
          if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
            await interaction.editReply({
              content: `❌ **${character.name}** is trying to travel from **Rudania** to **Vhintl**, but you're on the wrong road! Please start in <#${PATH_CHANNELS.pathOfScarletLeaves}>.`
            });
            return;
          }
        } else if (startingVillage === 'vhintl' && destination === 'rudania') {
          if (currentChannel !== PATH_CHANNELS.leafDewWay) {
            await interaction.editReply({
              content: `❌ **${character.name}** is trying to travel from **Vhintl** to **Rudania**, but you're on the wrong road! Please start in <#${PATH_CHANNELS.leafDewWay}>.`
            });
            return;
          }
        }
      }
      if (totalTravelDuration === 2 && hasPerk(character, 'DELIVERING')) {
        if ((startingVillage === 'vhintl' && destination === 'rudania') ||
            (startingVillage === 'rudania' && destination === 'vhintl')) {
          if (currentChannel !== PATH_CHANNELS.leafDewWay &&
              currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
            await interaction.editReply({
              content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(startingVillage)}** to **${capitalizeFirstLetter(destination)}**, but you're on the wrong road! Please start in either <#${PATH_CHANNELS.pathOfScarletLeaves}> (Day 1) or <#${PATH_CHANNELS.leafDewWay}> (Day 2).`
            });
            return;
          }
        }
      }
      if (totalTravelDuration === 2 && !hasPerk(character, 'DELIVERING')) {
        if ((startingVillage === 'inariko' && destination === 'vhintl') ||
            (startingVillage === 'vhintl' && destination === 'inariko')) {
          if (currentChannel !== PATH_CHANNELS.leafDewWay) {
            await interaction.editReply({
              content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(startingVillage)}** to **${capitalizeFirstLetter(destination)}**, but you're on the wrong road! Please travel on <#${PATH_CHANNELS.leafDewWay}>.`
            });
            return;
          }
        }
        if ((startingVillage === 'inariko' && destination === 'rudania') ||
            (startingVillage === 'rudania' && destination === 'inariko')) {
          if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
            await interaction.editReply({
              content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(startingVillage)}** to **${capitalizeFirstLetter(destination)}**, but you're on the wrong road! Please travel on <#${PATH_CHANNELS.pathOfScarletLeaves}>.`
            });
            return;
          }
        }
      }

      // ------------------- Determine Travel Paths and Stop Conditions -------------------
      let paths = [];
      let stopInInariko = false;
      if (totalTravelDuration === 4) {
        if (startingVillage === 'rudania') {
          paths = ['pathOfScarletLeaves', 'leafDewWay'];
        } else if (startingVillage === 'vhintl') {
          paths = ['leafDewWay', 'pathOfScarletLeaves'];
        } else {
          console.error(`[travel.js]: Error: Invalid route for 4-day duration between ${startingVillage} and ${destination}.`);
          throw new Error(`Invalid route for 4-day duration between ${startingVillage} and ${destination}.`);
        }
        stopInInariko = true;
      } else if (totalTravelDuration === 2) {
        if ((startingVillage === 'rudania' && destination === 'inariko') ||
            (startingVillage === 'inariko' && destination === 'rudania')) {
          paths = ['pathOfScarletLeaves'];
        } else if ((startingVillage === 'vhintl' && destination === 'inariko') ||
                   (startingVillage === 'inariko' && destination === 'vhintl')) {
          paths = ['leafDewWay'];
        } else if (hasPerk(character, 'DELIVERING') &&
                   ((startingVillage === 'vhintl' && destination === 'rudania') ||
                    (startingVillage === 'rudania' && destination === 'vhintl'))) {
          paths = startingVillage === 'rudania'
            ? ['pathOfScarletLeaves', 'leafDewWay']
            : ['leafDewWay', 'pathOfScarletLeaves'];
          stopInInariko = true;
        } else {
          console.error(`[travel.js]: Error: Invalid route for 2-day duration between ${startingVillage} and ${destination}.`);
          throw new Error(`Invalid route for 2-day duration between ${startingVillage} and ${destination}.`);
        }
      } else if (totalTravelDuration === 1) {
        if ((startingVillage === 'rudania' && destination === 'inariko') ||
            (startingVillage === 'inariko' && destination === 'rudania')) {
          paths = ['pathOfScarletLeaves'];
        } else if ((startingVillage === 'vhintl' && destination === 'inariko') ||
                   (startingVillage === 'inariko' && destination === 'vhintl')) {
          paths = ['leafDewWay'];
        } else {
          console.error(`[travel.js]: Error: Invalid route for 1-day duration between ${startingVillage} and ${destination}.`);
          throw new Error(`Invalid route for 1-day duration between ${startingVillage} and ${destination}.`);
        }
      } else {
        console.error(`[travel.js]: Error: No valid paths for total travel duration: ${totalTravelDuration}.`);
        throw new Error(`No valid paths for total travel duration: ${totalTravelDuration}.`);
      }

      // ------------------- Send Initial Travel Announcement -------------------
      const initialEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration);
      await interaction.followUp({ embeds: [initialEmbed] });

      // ------------------- Initialize Travel Log and State Variables -------------------
      let travelLog = [];
      let travelingMessages = [];
      let lastSafeDayMessage = null;

      // ------------------- Helper Function: Check and Handle KO -------------------
      async function checkAndHandleKO(channel) {
        if (character.currentHearts <= 0 || character.ko) {
          character.ko = true;
          const recoveryVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl')
            ? 'inariko'
            : character.currentVillage;
          character.currentVillage = recoveryVillage;
          character.currentStamina = 0;
          character.debuff = {
            active: true,
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          };
          await character.save();
          const koEmbed = new EmbedBuilder()
            .setTitle(`💀 **${character.name} is KO'd!**`)
            .setDescription(
              `**${character.name}** woke up in **${capitalizeFirstLetter(recoveryVillage)}** and needs time to recover from their ordeal.\n\n` +
              `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
              `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}\n\n` +
              `🔔 **${character.name}** is out of commission and a debuff has been applied. They will recover in 7 days.`
            )
            .setColor('#FF0000')
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/KORecovery.png')
            .setTimestamp();
          await channel.send({ embeds: [koEmbed] });
          return true;
        }
        return false;
      }

      // ------------------- Helper Function: Handle Stop at Inariko -------------------
      // Sends a stop message and image embed, then returns the next channel ID.
      async function handleStopInariko(channel, nextPathKey) {
        const nextChannelId = PATH_CHANNELS[nextPathKey];
        const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
        await channel.send({ embeds: [stopEmbed] });
        travelLog.push(`> 🛑 Stopped in Inariko. Please move to <#${nextChannelId}> to continue your journey.\n`);
        const imageEmbed = new EmbedBuilder()
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png')
          .setDescription('🛑 A serene view accompanies the stop.');
        try {
          await channel.send({ embeds: [imageEmbed] });
        } catch (error) {
          console.error(`[travel.js]: Error sending stop-in-Inariko image embed: ${error.message}`, error);
        }
        return nextChannelId;
      }

      // ------------------- Recursive Function: Process Each Travel Day -------------------
      async function processTravelDay(day) {
        // ------------------- Check if Journey is Complete -------------------
        if (day > totalTravelDuration) {
          // Finalize journey: update character location and send arrival embeds
          character.currentVillage = destination;
          await character.save();
          const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || currentChannel;
          const finalChannel = await interaction.client.channels.fetch(finalChannelId);
          const finalEmbed = createFinalTravelEmbed(character, destination, paths, totalTravelDuration, travelLog);
          const imageEmbed = new EmbedBuilder()
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png')
            .setDescription(`🎉 **${character.name} has arrived safely at ${capitalizeFirstLetter(destination)}!**`);
          try {
            await finalChannel.send({ embeds: [finalEmbed] });
            await finalChannel.send({ embeds: [imageEmbed] });
          } catch (error) {
            console.error(`[travel.js]: Error sending arrival embeds: ${error.message}`, error);
            await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
          }
          // Clean up travel messages
          for (const msg of travelingMessages) {
            await msg.delete();
          }
          return;
        }

        // ------------------- Determine Current Path for the Day -------------------
        const currentPath = getCurrentPath(day, paths, hasPerk(character, 'DELIVERING'));
        if (!currentPath) {
          console.error(`[travel.js]: Error: Current path is undefined for day ${day}.`);
          throw new Error(`Current path is undefined for day ${day}.`);
        }
        const channelId = PATH_CHANNELS[currentPath];
        if (!channelId) {
          console.error(`[travel.js]: Error: Channel ID for path "${currentPath}" is undefined.`);
          throw new Error(`Channel ID for path "${currentPath}" is undefined.`);
        }
        const channel = await interaction.client.channels.fetch(channelId);
        const pathEmoji = pathEmojis[currentPath];
        if (!pathEmoji) {
          console.error(`[travel.js]: Error: Emoji for path "${currentPath}" is undefined.`);
          throw new Error(`Emoji for path "${currentPath}" is undefined.`);
        }

        // ------------------- Post Traveling Message -------------------
        const travelingEmbed = createTravelingEmbed(character);
        const travelingMessage = await channel.send({ embeds: [travelingEmbed] });
        travelingMessages.push(travelingMessage);

        // Simulate travel progression delay
        await new Promise(resolve => setTimeout(resolve, 3000));

        // ------------------- Determine Encounter Type -------------------
        const encounterType = Math.random() < 0.5 ? 'No Encounter' : getRandomTravelEncounter();
        let dailyLogEntry = `**Day ${day}:**\n`;

        if (encounterType !== 'No Encounter') {
          // ------------------- Handle Monster Encounter -------------------
          const monsters = await getMonstersByPath(currentPath);
          if (monsters.length > 0) {
            const tier = parseInt(encounterType.split(' ')[1], 10);
            const filteredMonsters = monsters.filter(monster => monster.tier <= tier);
            const monster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
            dailyLogEntry += `> ⚔️ Encountered a ${monster.name}!\n`;

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

            const buttons = new ActionRowBuilder().addComponents(
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
            const collector = encounterMessage.createMessageComponentCollector({ filter, time: 300000 });

            collector.on('collect', async (i) => {
              const decision = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
              dailyLogEntry += `> ${decision}\n`;
              if (decision.includes('KO')) {
                travelLog.push(dailyLogEntry);
                await channel.send({ embeds: [createFinalTravelEmbed(character, startingVillage, paths, day - 1, travelLog)] });
                collector.stop();
                return;
              }
              collector.stop();
            });

            collector.on('end', async (collected, reason) => {
              if (reason === 'time') {
                const decision = await handleTravelInteraction({ customId: 'fight' }, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog);
                dailyLogEntry += `> ${decision}\n`;
              }
              if (await checkAndHandleKO(channel)) return;
              if (day === 1 && stopInInariko && hasPerk(character, 'DELIVERING')) {
                await handleStopInariko(channel, paths[1]);
                await processTravelDay(day + 1);
                return;
              }
              travelLog.push(dailyLogEntry);
              if (day === 2 && stopInInariko) {
                await handleStopInariko(channel, paths[1]);
                travelLog.push(`\n\n🛑 Stopped in Inariko for rest and supplies.\n\n`);
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
              await processTravelDay(day + 1);
            });
            return;
          }
        } else {
          // ------------------- Handle Safe Travel (No Encounter) -------------------
          const safeTravelEmbed = createSafeTravelDayEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);
          const safeTravelMessage = await channel.send({ embeds: [safeTravelEmbed] });
          lastSafeDayMessage = safeTravelMessage;

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('recover')
              .setLabel('💖 Recover a Heart')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(character.currentHearts >= character.maxHearts || character.currentStamina === 0),
            new ButtonBuilder()
              .setCustomId('gather')
              .setLabel('🌿 Gather')
              .setStyle(ButtonStyle.Success)
              .setDisabled(character.currentStamina === 0),
            new ButtonBuilder()
              .setCustomId('do_nothing')
              .setLabel('✨ Do Nothing')
              .setStyle(ButtonStyle.Secondary)
          );

          await safeTravelMessage.edit({
            embeds: [safeTravelEmbed],
            components: [buttons]
          });

          const filter = (i) => i.user.id === interaction.user.id;
          const collector = safeTravelMessage.createMessageComponentCollector({ filter, time: 300000 });

          collector.on('collect', async (i) => {
            const decision = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, safeTravelMessage, null, travelLog);
            dailyLogEntry += `> ${decision}\n`;
            const updatedEmbed = new EmbedBuilder(safeTravelMessage.embeds[0].toJSON()).setDescription(
              `🌸 It's a safe day of travel. What do you want to do next?\n> ${decision}\n\n` +
              `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
              `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
            );
            await safeTravelMessage.edit({
              embeds: [updatedEmbed],
              components: [] // Remove buttons after action
            });
            collector.stop();
          });

          collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
              const decision = await handleTravelInteraction({ customId: 'do_nothing' }, character, day, totalTravelDuration, pathEmoji, currentPath, safeTravelMessage, null, travelLog);
              dailyLogEntry += `> ${decision}\n`;
            }
            if (await checkAndHandleKO(channel)) return;
            travelLog.push(dailyLogEntry);
            let halfway = hasPerk(character, 'DELIVERING') ? 1 : 2;
            if (day === halfway && stopInInariko) {
              await handleStopInariko(channel, paths[1]);
              travelLog.push(`\n\n🛑 Stopped in Inariko for rest and supplies.\n\n`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            await processTravelDay(day + 1);
          });
        }
      }

      // ------------------- Start Travel Processing from Day 1 -------------------
      await processTravelDay(1);
    } catch (error) {
      console.error(`[travel.js]: Error during travel command execution: ${error.message}`, error);
      await interaction.followUp({ content: `❌ **Error during travel command execution:** ${error.message}` });
    }
  }
};
