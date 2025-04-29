// ============================================================================
// ------------------- IMPORTS -------------------
// Load all required libraries, modules, database services, embeds, and handlers.
// ============================================================================

// ------------------- Load environment variables and standard libraries -------------------
require('dotenv').config();

// ------------------- Discord.js components -------------------
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

// ------------------- Global error handling -------------------
const { handleError } = require('../../utils/globalErrorHandler.js');

// ------------------- Database services -------------------
const { fetchCharacterByNameAndUserId } = require('../../database/db.js');

// ------------------- Embeds for travel, encounters, paths -------------------
const { 
  createFinalTravelEmbed, 
  createInitialTravelEmbed, 
  createMonsterEncounterEmbed, 
  createTravelMonsterEncounterEmbed,
  createSafeTravelDayEmbed, 
  createStopInInarikoEmbed, 
  createTravelingEmbed, 
  pathEmojis 
} = require('../../embeds/embeds.js');

// ------------------- Interaction handlers -------------------
const { handleTravelInteraction, handleDoNothing, handleFight, updateTravelLog } = require('../../handlers/travelHandler.js');

// ------------------- Custom modules (formatting, RNG, jobs, locations) -------------------
const { capitalizeFirstLetter } = require('../../modules/formattingModule.js');
const { getMonstersByPath, getRandomTravelEncounter } = require('../../modules/rngModule.js');
const { hasPerk } = require('../../modules/jobsModule.js');
const { isValidVillage } = require('../../modules/locationsModule.js');

// ============================================================================
// ------------------- CONSTANTS -------------------
// Predefined values such as path channel IDs.
// ============================================================================
  
// ------------------- Define path channel IDs for travel -------------------
const PATH_CHANNELS = {
    pathOfScarletLeaves: '1305487405985431583', // Scarlet Leaves path
    leafDewWay: '1305487571228557322'           // Leaf Dew Way path
  };
  
  // ------------------- Validate required channel IDs -------------------
  if (!PATH_CHANNELS.pathOfScarletLeaves || !PATH_CHANNELS.leafDewWay) {
    console.error(`[travel.js]: Error: Channel IDs not properly loaded. Check .env file.`);
    throw new Error("Missing required channel IDs in environment configuration.");
  }
  
// ============================================================================
// ------------------- UTILITY FUNCTIONS -------------------
// General helper functions used across the travel process.
// ============================================================================

async function deferInteraction(interaction) {
    if (interaction.isCommand()) {
      await interaction.deferReply();
    } else if (interaction.isButton()) {
      await interaction.deferUpdate();
    }
  }
  
// ------------------- Calculate travel duration based on villages, mode, and character perks -------------------
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
  
    if (baseDuration > 0 && hasPerk(character, 'DELIVERING')) {
      return Math.max(1, Math.ceil(baseDuration / 2));
    }
    return baseDuration;
  }
  
  // ------------------- Determine the current path for the day -------------------
  function getCurrentPath(day, paths, halfTime) {
    if (!Array.isArray(paths)) {
      console.error(`[travel.js]: Error: paths is not an array. Received:`, paths);
      return null;
    }
    if (paths.length === 0) {
      console.error(`[travel.js]: Error: Invalid path length 0. Day: ${day}, halfTime: ${halfTime}`);
      return null;
    }
    if (paths.length === 1) {
      return paths[0];
    }
    const index = Math.floor((day - 1) / (halfTime ? 1 : 2));
    if (index >= paths.length) {
      console.warn(`[travel.js]: Warning: Calculated index (${index}) out of bounds for paths array:`, paths);
      return paths[paths.length - 1]; // fallback to last path
    }
    return paths[index];
  }
  
  
  // ------------------- Check if character is KO'd and handle recovery if needed -------------------
  async function checkAndHandleKO(channel, character) {
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
          `**${character.name}** woke up in **${capitalizeFirstLetter(recoveryVillage)}** and needs time to recover.\n\n` +
          `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
          `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}\n\n` +
          `🔔 A debuff has been applied. They will recover in 7 days.`
        )
        .setColor('#FF0000')
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/KORecovery.png')
        .setTimestamp();
  
      await channel.send({ embeds: [koEmbed] });
      return true;
    }
    return false;
  }
  
  // ------------------- Handle stop at Inariko during multi-day travel -------------------
  async function handleStopInariko(channel, character, nextPathKey) {
    const nextChannelId = PATH_CHANNELS[nextPathKey];
    const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
  
    await channel.send({ embeds: [stopEmbed] });
  
    const imageEmbed = new EmbedBuilder()
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png')
      .setDescription('🛑 A serene view accompanies the stop.');
  
    try {
      await channel.send({ embeds: [imageEmbed] });
    } catch (error) {
      handleError(error, 'travel.js');
      console.error(`[travel.js]: Error sending stop image: ${error.message}`);
    }
  
    return nextChannelId;
  }
  
  async function createTravelCollector(message, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko, monster = null) {
    const filter = (i) => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 }); // 1 min timeout
  
    const savedPaths = paths;
    const savedStopInInariko = stopInInariko;
  
    console.log(`[createTravelCollector]: Collector started for ${character.name}, Day ${day}/${totalTravelDuration}`);
  
    collector.on('collect', async (i) => {
      console.log(`[createTravelCollector]: User interaction collected: ${i.customId} on Day ${day}`);
      try {
        const result = await handleTravelInteraction(i, character, day, totalTravelDuration, pathEmoji, currentPath, message, monster, travelLog);
        updateTravelLog(travelLog, result);
  
        console.log(`[createTravelCollector]: Advancing to Day ${day + 1} after interaction.`);
        await processTravelDay(day + 1, interaction, character, savedPaths, totalTravelDuration, travelLog, savedStopInInariko);
      } catch (error) {
        console.error(`[travel.js]: Error during button interaction: ${error.message}`, error);
        handleError(error, 'travel.js');
      }
    });
  
    collector.on('end', async (collected, reason) => {
      console.warn(`[createTravelCollector]: Collector ended with reason: ${reason}. Collected size: ${collected.size}`);
  
      if (reason === 'time' && !collected.size) {
        const channel = interaction.channel;
        try {
          await channel.send(`⏳ **No action was selected for ${character.name}. Default action is being taken automatically.**`);
        } catch (error) {
          console.error(`[travel.js]: Failed to send timeout message: ${error.message}`);
        }
  
        const fakeInteraction = {
          deferUpdate: async () => {},
          isButton: () => true,
          isCommand: () => false,
          user: interaction.user
        };
  
        if (!monster) {
          fakeInteraction.customId = 'do_nothing';
          console.log(`[createTravelCollector]: Simulating 'do_nothing' on Day ${day}`);
        } else {
          fakeInteraction.customId = 'fight';
          console.log(`[createTravelCollector]: Simulating 'fight' on Day ${day}`);
        }
  
        try {
          const result = await handleTravelInteraction(fakeInteraction, character, day, totalTravelDuration, pathEmoji, currentPath, message, monster, travelLog);
          updateTravelLog(travelLog, result);
  
          console.log(`[createTravelCollector]: Advancing to Day ${day + 1} after timeout fallback.`);
          await processTravelDay(day + 1, interaction, character, savedPaths, totalTravelDuration, travelLog, savedStopInInariko);
        } catch (error) {
          console.error(`[travel.js]: Error during timeout fallback handling: ${error.message}`, error);
        }
      }
    });
  }
  

  
// ============================================================================
// ------------------- TRAVEL ENCOUNTER HANDLERS -------------------
// Functions that handle daily encounters during travel.
// ============================================================================

// ------------------- Handle safe travel day (no monster encounter) -------------------
async function handleSafeTravelDay(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko) {
  const travelEmbed = createSafeTravelDayEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);

  const recoverButton = new ButtonBuilder()
  .setCustomId('recover')
  .setLabel('💖 Recover a Heart')
  .setStyle(ButtonStyle.Success);

const gatherButton = new ButtonBuilder()
  .setCustomId('gather')
  .setLabel('🌿 Gather Resources')
  .setStyle(ButtonStyle.Primary);

const doNothingButton = new ButtonBuilder()
  .setCustomId('do_nothing')
  .setLabel('✨ Do Nothing')
  .setStyle(ButtonStyle.Secondary);


  const row = new ActionRowBuilder().addComponents(recoverButton, gatherButton, doNothingButton);

  const message = await channel.send({ embeds: [travelEmbed], components: [row] });

  // Fix: remove `monster` from call; no monster during safe day
  await createTravelCollector(message, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko, null);
}

  // ------------------- Handle monster encounter during travel -------------------
  async function handleMonsterEncounter(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog) {
    const monsters = await getMonstersByPath(currentPath);
  
    if (!monsters.length) {
      console.warn(`[travel.js]: No monsters found for path: ${currentPath}. Defaulting to safe travel.`);
      return await handleSafeTravelDay(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog);
    }
  
    const encounterResult = await getRandomTravelEncounter(monsters);
if (!encounterResult || !encounterResult.monster) {
  console.error(`[travel.js]: getRandomTravelEncounter returned an invalid result:`, encounterResult);
  return await handleSafeTravelDay(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog);
}

const { monster, encounterType } = encounterResult;

if (encounterType === 'safe') {
  return await handleSafeTravelDay(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog);
}

const encounterEmbed = createTravelMonsterEncounterEmbed(
  character,
  monster,
  `You encountered a ${monster.name}! What do you want to do?`,

      character.currentHearts,
      null,
      day,
      totalTravelDuration,
      pathEmoji,
      currentPath
    );
    
  
    const fightButton = new ButtonBuilder()
      .setCustomId('fight')
      .setLabel('Fight')
      .setStyle(ButtonStyle.Danger);
  
    const fleeButton = new ButtonBuilder()
      .setCustomId('flee')
      .setLabel('Flee')
      .setStyle(ButtonStyle.Secondary);
  
    const row = new ActionRowBuilder().addComponents(fightButton, fleeButton);
  
    const message = await channel.send({ embeds: [encounterEmbed], components: [row] });
  
    await createTravelCollector(message, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko, monster);
  }
  
// ============================================================================
// ------------------- TRAVEL FLOW MANAGEMENT -------------------
// Functions to manage the overall day-by-day travel process.
// ============================================================================

// ------------------- Process travel day recursively -------------------
// ------------------- Process travel day recursively -------------------
async function processTravelDay(day, interaction, character, paths, totalTravelDuration, travelLog, stopInInariko) {
  const channel = interaction.channel;

  if (day <= totalTravelDuration) {
    const travelingEmbed = createTravelingEmbed(character);
    await channel.send({ embeds: [travelingEmbed] });
  }

  if (await checkAndHandleKO(channel, character)) {
    return;
  }

  character = await fetchCharacterByNameAndUserId(character.name, character.userId);

  const pathEmoji = pathEmojis[character.currentVillage] || '🏞️';
  const currentPath = getCurrentPath(day, paths, stopInInariko);

  if (!currentPath) {
    console.error(`[travel.js]: Error determining current path for day ${day}.`);
    return;
  }

  if (day > totalTravelDuration) {
    const finalTravelEmbed = createFinalTravelEmbed(character, character.currentVillage, paths, totalTravelDuration, travelLog);
    await channel.send({ embeds: [finalTravelEmbed] });
    return;
  }

  if (stopInInariko && day === Math.ceil(totalTravelDuration / 2)) {
    await handleStopInariko(channel, character, currentPath, travelLog);
    return;
  }

  // Determine whether it's a safe travel day or monster encounter
  const encounterChance = Math.random();
  const isSafeDay = encounterChance < 0.6; // 60% chance safe travel

  if (isSafeDay) {
    await handleSafeTravelDay(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko);
  } else {
    await handleMonsterEncounter(channel, interaction, character, day, totalTravelDuration, pathEmoji, currentPath, travelLog, paths, stopInInariko);
  }
}

  
  // ------------------- Setup initial travel state -------------------
async function setupTravel(interaction, character) {
  const destination = interaction.options.getString('destination');
  const mode = interaction.options.getString('mode');

  if (!isValidVillage(destination)) {
    throw new Error(`Invalid destination selected: ${destination}`);
  }

  // ------------------- Validate channel correctness based on village -------------------
  const currentChannelId = interaction.channelId;
  const validChannelIds = [
    PATH_CHANNELS.pathOfScarletLeaves,
    PATH_CHANNELS.leafDewWay
  ];

  if (!validChannelIds.includes(currentChannelId)) {
    throw new Error(`Travel must be started in the correct path channel.`);
  }

  const startingVillage = character.currentVillage.toLowerCase();
  const travelKey = `${startingVillage}-${destination}`;
  const reverseKey = `${destination}-${startingVillage}`;

  let paths = [];
  let stopInInariko = false;

  if (travelKey === 'rudania-vhintl' || reverseKey === 'vhintl-rudania') {
    paths = ['pathOfScarletLeaves', 'leafDewWay'];
    stopInInariko = true;
  } else if (travelKey === 'rudania-inariko' || reverseKey === 'inariko-rudania') {
    paths = ['pathOfScarletLeaves'];
  } else if (travelKey === 'vhintl-inariko' || reverseKey === 'inariko-vhintl') {
    paths = ['leafDewWay'];
  } else {
    throw new Error('Invalid travel route. No path found.');
  }

  const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode, character);

  if (totalTravelDuration === -1) {
    throw new Error('Invalid travel route. No path found.');
  }

  return { paths, totalTravelDuration, stopInInariko };
}

  
  // ------------------- Validate character and travel parameters -------------------
async function validateCharacter(interaction) {
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;
  
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
  
    if (!character) {
      throw new Error(`Character ${characterName} not found for user.`);
    }
  
    if (character.ko) {
      throw new Error(`Character ${characterName} is KO'd and cannot travel.`);
    }
  
    if (!character.inventory || !character.inventorySynced) {
      throw new Error(`Character ${characterName} must sync their inventory before traveling.`);
    }
  
    if (character.debuff?.active) {
      throw new Error(`Character ${characterName} is recovering from a KO and cannot travel yet.`);
    }
  
    return character;
  }  
  
// ============================================================================
// ------------------- DISCORD COMMAND: TRAVEL -------------------
// Main /travel command handler: validates, processes, and manages full travel journeys.
// ============================================================================

module.exports = {
    data: new SlashCommandBuilder()
      .setName('travel')
      .setDescription('Travel between villages.')
      .addStringOption(option =>
        option.setName('charactername')
          .setDescription('Your character\'s name.')
          .setRequired(true)
          .setAutocomplete(true))
      .addStringOption(option =>
        option.setName('destination')
          .setDescription('Destination village.')
          .setRequired(true)
          .addChoices(
            { name: 'Inariko', value: 'inariko' },
            { name: 'Rudania', value: 'rudania' },
            { name: 'Vhintl', value: 'vhintl' }
          ))
      .addStringOption(option =>
        option.setName('mode')
          .setDescription('How you will travel.')
          .setRequired(true)
          .addChoices(
            { name: 'On Foot', value: 'on foot' },
            { name: 'On Mount', value: 'on mount' }
          )),

  
    // ------------------- Execute Travel Command -------------------
    async execute(interaction) {
      try {
        await deferInteraction(interaction);
  
        const character = await validateCharacter(interaction);
        const { paths, totalTravelDuration, stopInInariko } = await setupTravel(interaction, character);
  
        const travelLog = [];

      // Send initial Travel Announcement
      const startingVillage = character.currentVillage.toLowerCase();
      const destination = interaction.options.getString('destination').toLowerCase();
      const travelAnnouncementEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration);
      await interaction.followUp({ embeds: [travelAnnouncementEmbed] });


      await processTravelDay(1, interaction, character, paths, totalTravelDuration, travelLog, stopInInariko);

  
      } catch (error) {
        handleError(error, 'travel.js');
        console.error(`[travel.js][Execute]: ${error.message}`, error);
      }
    }
  };
  
