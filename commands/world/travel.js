// ============================================================================
// ------------------- Standard Libraries -------------------
// Load environment variables from .env file
// ============================================================================
const dotenv = require('dotenv');
dotenv.config();

// ------------------- Discord.js Components -------------------
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId } = require('../../database/db.js');

// ------------------- Embeds -------------------
// Import functions for creating travel-related embed messages and path emojis
const {
  createInitialTravelEmbed,
  createMonsterEncounterEmbed,
  createSafeTravelDayEmbed,
  createTravelingEmbed,
  pathEmojis,
  villageEmojis,
  DEFAULT_IMAGE_URL
} = require('../../embeds/embeds.js');

// ------------------- Handlers -------------------
const { handleTravelInteraction, createFinalTravelEmbed } = require('../../handlers/travelHandler.js');

// ------------------- Utility Functions -------------------
const { capitalizeFirstLetter, capitalizeWords } = require('../../modules/formattingModule.js');
const { getMonstersByPath, getRandomTravelEncounter } = require('../../modules/rngModule.js');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { hasPerk } = require('../../modules/jobsModule.js');
const { isValidVillage } = require('../../modules/locationsModule.js');
const { checkInventorySync } = require('../../utils/characterUtils');
const { enforceJail } = require('../../utils/jailCheck');
const { retrieveAllByType } = require('../../utils/storage.js');

// ------------------- Database Models -------------------
const Mount = require('../../models/MountModel');

// ------------------- Blood Moon Module -------------------
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');

// ------------------- Weather Module -------------------
const { getCurrentWeather } = require('../../modules/weatherModule.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const COMMAND_NAME = 'travel';
const COMMAND_DESCRIPTION = 'Travel between villages';

// Severe weather conditions that block travel
const SEVERE_WEATHER_CONDITIONS = [
  'Avalanche',
  'Flood',
  'Rock Slide'
];

const {
  PATH_OF_SCARLET_LEAVES_CHANNEL_ID,
  LEAF_DEW_WAY_CHANNEL_ID,
  TRAVEL_DELAY_MS = '3000'
} = process.env;

if (!PATH_OF_SCARLET_LEAVES_CHANNEL_ID || !LEAF_DEW_WAY_CHANNEL_ID) {
  handleError(new Error('Missing required path channel IDs in environment variables.'), 'travel.js');
  throw new Error('Missing required path channel IDs in environment variables.');
}

const PATH_CHANNELS = {
  pathOfScarletLeaves: PATH_OF_SCARLET_LEAVES_CHANNEL_ID,
  leafDewWay:      LEAF_DEW_WAY_CHANNEL_ID
};

const MODE_CHOICES = [
  { name: 'on foot',  value: 'on foot'  },
  { name: 'on mount', value: 'on mount' }
];

const DELAY_MS = Number(TRAVEL_DELAY_MS);

const CommandData = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription(COMMAND_DESCRIPTION)
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
      .addChoices(...MODE_CHOICES));

// ============================================================================
// ------------------- Utilities -------------------
// ============================================================================

// ------------------- Travel Duration Calculator -------------------
// Determines number of travel days based on starting point, destination,
// mode of travel, and character perks.
function calculateTravelDuration(currentVillage, destination, mode, character) {
  const travelTimes = {
    'on foot': {
      'rudania-inariko': 2,
      'inariko-vhintl': 2
    },
    'on mount': {
      'rudania-inariko': 1,
      'inariko-vhintl': 1
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

// ------------------- Wrong-Road Guard -------------------
// Validates that user is on the correct Discord channel for the selected route.
async function validateCorrectTravelChannel(interaction, character, startingVillage, destination, totalTravelDuration) {
  const currentChannel = interaction.channelId;

  if (totalTravelDuration === 2 && !hasPerk(character, 'DELIVERING')) {
    if (
      (startingVillage === 'inariko' && destination === 'vhintl' && currentChannel !== PATH_CHANNELS.leafDewWay) ||
      (startingVillage === 'inariko' && destination === 'rudania' && currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) ||
      (startingVillage === 'vhintl' && destination === 'inariko' && currentChannel !== PATH_CHANNELS.leafDewWay) ||
      (startingVillage === 'rudania' && destination === 'inariko' && currentChannel !== PATH_CHANNELS.pathOfScarletLeaves)
    ) {
      const correct = destination === 'vhintl' ? PATH_CHANNELS.leafDewWay : PATH_CHANNELS.pathOfScarletLeaves;
      await interaction.editReply({
        content: `❌ You must use <#${correct}> for this route.`
      });
      return false;
    }
  }

  return true;
}

// ============================================================================
// ------------------- Setup & Initialization -------------------
// ============================================================================

// ------------------- Module Export: Travel Command -------------------
module.exports = {
  data: CommandData,

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
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // Check for active blight healing request
      const activeBlightRequests = await retrieveAllByType('blight');
      const characterBlightRequest = activeBlightRequests.find(req => 
        req.characterName === characterName && 
        req.status === 'pending' &&
        new Date(req.expiresAt) > new Date()
      );

      if (characterBlightRequest) {
        const timeLeft = Math.ceil((new Date(characterBlightRequest.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        await interaction.editReply({
          content: `❌ **${characterName}** cannot travel while they have an active blight healing request from **${characterBlightRequest.healerName}**.\n\n` +
            `The request will expire in ${timeLeft} days. Please complete or cancel the healing request before traveling.`
        });
        return;
      }

      // ------------------- Check Severe Weather -------------------
      const startingVillage = character.currentVillage.toLowerCase();
      const severeWeather = await checkSevereWeather(startingVillage);
      if (severeWeather.blocked) {
        return interaction.editReply({
          content: `❌ **${character.name}** cannot travel due to severe weather conditions: ${severeWeather.emoji} **${severeWeather.condition}** in **${capitalizeFirstLetter(startingVillage)}**.\nPlease wait for the weather to improve.`
        });
      }

      // Check destination weather as well
      const destinationWeather = await checkSevereWeather(destination);
      if (destinationWeather.blocked) {
        return interaction.editReply({
          content: `❌ **${character.name}** cannot travel to **${capitalizeFirstLetter(destination)}** due to severe weather conditions: ${destinationWeather.emoji} **${destinationWeather.condition}**.\nPlease wait for the weather to improve.`
        });
      }

      // ------------------- Mount Travel Logic -------------------
      let mount = null;
      if (mode === 'on mount') {
        mount = await Mount.findOne({ characterId: character._id });
        if (!mount) {
          return interaction.editReply({
            content: `❌ **${character.name}** does not have a registered mount. You must register a mount before traveling on mount.`
          });
        }
        // Recover mount stamina if a day has passed since lastMountTravel
        const now = new Date();
        if (mount.lastMountTravel) {
          const last = new Date(mount.lastMountTravel);
          const msInDay = 24 * 60 * 60 * 1000;
          const daysPassed = Math.floor((now - last) / msInDay);
          if (daysPassed > 0) {
            const maxStamina = mount.level === 'Basic' ? 2 : mount.level === 'Mid' ? 4 : mount.level === 'High' ? 6 : mount.stamina;
            mount.currentStamina = Math.min(maxStamina, (mount.currentStamina || maxStamina) + daysPassed);
            await mount.save();
          }
          // Enforce 1 day cooldown
          if ((now - last) < msInDay) {
            return interaction.editReply({
              content: `❌ **${mount.name}** must rest for 1 day before traveling again. Please wait before using your mount for travel.`
            });
          }
        } else {
          // If never traveled, initialize currentStamina
          if (mount.currentStamina == null) {
            const maxStamina = mount.level === 'Basic' ? 2 : mount.level === 'Mid' ? 4 : mount.level === 'High' ? 6 : mount.stamina;
            mount.currentStamina = maxStamina;
            await mount.save();
          }
        }
      }

      // ------------------- Check for Debuff -------------------
      if (character.debuff?.active) {
        const remainingDays = Math.ceil((new Date(character.debuff.endDate) - new Date()) / (1000 * 60 * 60 * 24));
        return interaction.editReply({
          content: `❌ **${character.name}** is recovering and cannot travel for ${remainingDays} more day(s).`
        });
      }

      // ------------------- Check Inventory Sync -------------------
      await checkInventorySync(character);

      // ------------------- Check if KO'd -------------------
      if (character.currentHearts <= 0 || character.ko) {
        return interaction.editReply({
          content: `❌ **${character.name}** is KO'd and cannot travel.`
        });
      }

      // ------------------- Validate Destination -------------------
      if (startingVillage === destination) {
        return interaction.editReply({
          content: `❌ **${character.name}** is already in **${capitalizeFirstLetter(destination)}**.`
        });
      }
      if (!isValidVillage(destination)) {
        return interaction.editReply({
          content: `❌ Invalid destination: **${capitalizeFirstLetter(destination)}**.`
        });
      }

      // ------------------- Calculate Travel Duration -------------------
      const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode, character);

      if (mode === 'on mount') {
        if (!mount) {
          return interaction.editReply({
            content: `❌ **${character.name}** does not have a registered mount. You must register a mount before traveling on mount.`
          });
        }
        if (mount.currentStamina < totalTravelDuration) {
          return interaction.editReply({
            content: `❌ **${mount.name}** does not have enough stamina to complete this journey. Required: ${totalTravelDuration}, Available: ${mount.currentStamina}`
          });
        }
        // Deduct mount stamina and update lastMountTravel
        mount.currentStamina -= totalTravelDuration;
        mount.lastMountTravel = new Date();
        await mount.save();
      }

      if (
        (startingVillage === 'rudania' && destination === 'vhintl') ||
        (startingVillage === 'vhintl' && destination === 'rudania')
      ) {
        const requiredPath = startingVillage === 'rudania'
          ? `<#${PATH_CHANNELS.pathOfScarletLeaves}>`
          : `<#${PATH_CHANNELS.leafDewWay}>`;

        return interaction.editReply({
          content: `❌ You cannot travel directly between **Rudania** and **Vhintl**.\n` +
                   `You must first travel to **Inariko**, starting with the correct path: ${requiredPath}.`
        });
      }

      if (totalTravelDuration === -1) {
        return interaction.editReply({
          content: `❌ Travel path between **${capitalizeFirstLetter(startingVillage)}** and **${capitalizeFirstLetter(destination)}** is not valid.`
        });
      }
      // ------------------- Validate Correct Channel -------------------
      const isChannelValid = await validateCorrectTravelChannel(
        interaction,
        character,
        startingVillage,
        destination,
        totalTravelDuration
      );
      if (!isChannelValid) return;

      // ------------------- Determine Paths & Stops -------------------
      let paths = [];

      if (totalTravelDuration === 2) {
        if (
          (startingVillage === 'rudania' && destination === 'inariko') ||
          (startingVillage === 'inariko' && destination === 'rudania')
        ) {
          paths = ['pathOfScarletLeaves'];
        } else if (
          (startingVillage === 'vhintl' && destination === 'inariko') ||
          (startingVillage === 'inariko' && destination === 'vhintl')
        ) {
          paths = ['leafDewWay'];
        } 
      } else if (totalTravelDuration === 1) {
        paths = startingVillage === 'rudania' || destination === 'rudania'
          ? ['pathOfScarletLeaves']
          : ['leafDewWay'];
      }

      // ------------------- Send Initial Travel Embed -------------------
      const initialEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration, mount, mode);
      await interaction.followUp({ embeds: [initialEmbed] });

      // ------------------- Start Travel Processing -------------------
      await processTravelDay(1, {
        character,
        startingVillage,
        destination,
        paths,
        totalTravelDuration,
        interaction,
        travelingMessages: [],
        currentChannel: interaction.channelId,
        travelLog: [],
        mount,
        mode
      });
      
    } catch (error) {
      handleError(error, 'travel.js (execute)');
      console.error(`[travel.js]: Error during execution: ${error.message}`, error);
      await interaction.followUp({
        content: `❌ **Error during travel command execution:** ${error.message}`,
        ephemeral: true
        });
      }
    },

    // ------------------- Autocomplete Handler -------------------
    // Routes autocomplete to the central handler in autocompleteHandler.js
    async autocomplete(interaction) {
      const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
      await handleAutocomplete(interaction);
    }
}

// ============================================================================
// ------------------- Private Helpers -------------------
// ============================================================================

// ------------------- KO Handling -------------------
// Checks if character is KO'd; if so, applies debuff, moves them to recovery village,
// updates database, sends recovery embed, and returns true to abort further travel.
async function checkAndHandleKO(character, channel, startingVillage) {
  if (character.currentHearts <= 0 || character.ko) {
    character.ko = true;

    const recoveryVillage = ['rudania', 'vhintl'].includes(startingVillage)
    ? 'inariko'
    : startingVillage;  

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

// ------------------- Process Travel Day -------------------
// Recursively processes each day of travel: checks completion, validates path,
// posts travel messages, handles safe days or monster encounters, collects actions,
// logs outcomes, stops in Inariko if needed, and recurses to the next day.
async function processTravelDay(day, context) {
  const {
    character,
    startingVillage,
    destination,
    paths,
    totalTravelDuration,
    interaction,
    travelingMessages,
    currentChannel,
    travelLog,
    channel: savedChannel,
    mount,
    mode
  } = context;

  // ------------------- Mount Travel: Skip Encounters & Gathering -------------------
  if (mode === 'on mount') {
    if (day > totalTravelDuration) {
      character.currentVillage = destination;
      await character.save();
      const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || currentChannel;
      const finalChannel = await interaction.client.channels.fetch(finalChannelId);
      const finalEmbed = new EmbedBuilder()
        .setTitle(`🚀 Mount Travel Complete!`)
        .setDescription(`✅ **${character.name}** has arrived at **${capitalizeFirstLetter(destination)}** by mount!

🥕 **${mount.name}**'s stamina remaining: ${mount.currentStamina}`)
        .setColor('#AA926A')
        .setTimestamp();
      await finalChannel.send({ embeds: [finalEmbed] });
      for (const msg of travelingMessages) {
        await msg.delete();
      }
      return;
    }
    // Send a simple embed for each travel day
    const currentPath = paths[0];
    const channelId = PATH_CHANNELS[currentPath];
    const channel = savedChannel || await interaction.client.channels.fetch(channelId);
    const pathEmoji = pathEmojis[currentPath];
    const travelDayEmbed = new EmbedBuilder()
      .setTitle(`🐴 Traveling by Mount: Day ${day}`)
      .setDescription(`**${character.name}** is traveling safely by mount (${mount.name}) to **${capitalizeFirstLetter(destination)}**.

${pathEmoji || ''} No monsters or gathering today!`)
      .setColor('#AA926A')
      .setTimestamp();
    const travelMsg = await channel.send({ embeds: [travelDayEmbed] });
    travelingMessages.push(travelMsg);
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    await processTravelDay(day + 1, { ...context, channel });
    return;
  }

  // ------------------- Check if Journey is Complete -------------------
  if (day > totalTravelDuration) {
    character.currentVillage = destination;
    await character.save();
    const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || currentChannel;
    const finalChannel = await interaction.client.channels.fetch(finalChannelId);
  
    // ------------------- Assign Village Role -------------------
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const allRoles = await interaction.guild.roles.fetch();
    const roleName = `${capitalizeFirstLetter(destination)} Visiting`;
    const villageRole = allRoles.find(role => role.name === roleName);
  
    if (villageRole) {
      // Remove other "* Visiting" roles first
      const visitingRoles = member.roles.cache.filter(r => /Visiting$/.test(r.name) && r.id !== villageRole.id);
      for (const [roleId] of visitingRoles) {
        await member.roles.remove(roleId).catch(error => handleError(error, 'travel.js'));
      }
  
      // Add destination visiting role
      if (!member.roles.cache.has(villageRole.id)) {
        await member.roles.add(villageRole).catch(error => handleError(error, 'travel.js'));
      }
    }
  
    // Filter out "fight: win & loot" logs from final summary
    const filteredLog = travelLog.filter(entry => !entry.startsWith('fight: win & loot'));
    const finalEmbed = createFinalTravelEmbed(character, destination, paths, totalTravelDuration, filteredLog);

    const imageEmbed = new EmbedBuilder()
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png')
      .setDescription(`🎉 **${character.name} has arrived safely at ${capitalizeFirstLetter(destination)}!**`);
    try {
      await finalChannel.send({ embeds: [finalEmbed] });
      await finalChannel.send({ embeds: [imageEmbed] });
    } catch (error) {
      handleError(error, 'travel.js');
      await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
    }
    for (const msg of travelingMessages) {
      await msg.delete();
    }
    return;
  }

  // ------------------- Wrong-Road Validation -------------------
  if (totalTravelDuration === 2 && !hasPerk(character, 'DELIVERING')) {
    if (
      (startingVillage === 'inariko' && destination === 'vhintl' && currentChannel !== PATH_CHANNELS.leafDewWay) ||
      (startingVillage === 'inariko' && destination === 'rudania' && currentChannel !== PATH_CHANNELS.pathOfScarletLeaves)
    ) {
      const correct = (destination === 'vhintl') ? PATH_CHANNELS.leafDewWay : PATH_CHANNELS.pathOfScarletLeaves;
      await interaction.editReply({ content: `❌ Wrong road! Please travel on <#${correct}>.` });
      return;
    }
  }

  // ------------------- Determine Current Path -------------------
  const currentPath = paths[0];
  if (!currentPath) {
    throw new Error(`Current path is undefined for day ${day}.`);
  }
  const channelId = PATH_CHANNELS[currentPath];
  if (!channelId) {
    throw new Error(`Channel ID for path "${currentPath}" is undefined.`);
  }
  const channel = savedChannel || await interaction.client.channels.fetch(channelId);
  const pathEmoji = pathEmojis[currentPath];
  if (!pathEmoji) {
    throw new Error(`Emoji for path "${currentPath}" is undefined.`);
  }

  // ------------------- Post Traveling Message -------------------
  const travelingEmbed = createTravelingEmbed(character);
  const travelingMessage = await channel.send({ embeds: [travelingEmbed] });
  travelingMessages.push(travelingMessage);

  // ------------------- Simulate Travel Delay -------------------
  await new Promise(resolve => setTimeout(resolve, DELAY_MS));

  // ------------------- Determine Encounter Type -------------------
  const randomRoll = Math.random();
  const hasNoMonsters = character.blightEffects?.noMonsters === true;
  const isSafe = hasNoMonsters ? true : randomRoll < 0.5;
  
  let dailyLogEntry = `**Day ${day}:**\n`;

  if (!isSafe) {
    // ------------------- Monster Encounter -------------------
    const monsters = await getMonstersByPath(currentPath);
    if (monsters.length) {
      const tier = parseInt(getRandomTravelEncounter().split(' ')[1], 10);
      const options = monsters.filter(m => m.tier <= tier);
      const monster = options[Math.floor(Math.random() * options.length)];
      dailyLogEntry += `⚔️ Encountered a ${monster.name}!\n`;

      // Before creating the encounter embed, check if Blood Moon is active
      const isBloodMoon = isBloodMoonActive();
      const encounterEmbed = createMonsterEncounterEmbed(
        character,
        monster,
        `You encountered a ${monster.name}! What do you want to do? Fleeing costs 1 🟩 stamina!`,
        character.currentHearts,
        null,
        isBloodMoon
      );
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fight').setLabel('⚔️ Fight').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('flee').setLabel('💨 Flee').setStyle(ButtonStyle.Secondary).setDisabled(character.currentStamina === 0)
      );
      const encounterMessage = await channel.send({ embeds: [encounterEmbed], components: [buttons] });
      const collector = encounterMessage.createMessageComponentCollector({ 
        filter: i => {
          if (i.user.id !== interaction.user.id) {
            i.reply({ content: '❌ Only the traveler can interact with these buttons.', ephemeral: true });
            return false;
          }
          return true;
        }, 
        time: 300000 
      });

      collector.on('collect', async i => {
        const decision = await handleTravelInteraction(
          i,
          character,
          pathEmoji,
          currentPath,
          encounterMessage,
          monster,
          travelLog
        );
        // Append both the loot line and the damage message to the daily log
        if (decision.includes('Looted')) {
          dailyLogEntry += `${decision}\n`;
        } else if (decision.includes('heart')) {
          dailyLogEntry += `${decision}\n`;
        }
        collector.stop();
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const decision = await handleTravelInteraction(
            { customId: 'do_nothing' },
            character,
            pathEmoji,
            currentPath,
            encounterMessage,
            monster,
            travelLog
          );
      
          dailyLogEntry += decision.split('\n').map(line => `${line}`).join('\n') + '\n';
        }
        if (await checkAndHandleKO(character, channel, startingVillage)) return;
        travelLog.push(dailyLogEntry);
        await processTravelDay(day + 1, { ...context, channel });
      });
    }
  } else {
    // ------------------- Safe Day of Travel -------------------
    // Generate Do Nothing flavor ONCE for this day
    const doNothingFlavorTexts = [
      `${character.name} lay under a blanket of stars. 🌌`,
      `${character.name} built a small campfire and enjoyed the crackling warmth. 🔥`,
      `${character.name} stumbled upon ancient ruins and marveled at their carvings. 🏛️`,
      `${character.name} heard a nearby stream and drifted to sleep. 💧`,
      `${character.name} found a quiet grove where fireflies danced. ✨`,
      `${character.name} roasted foraged mushrooms and thought of home. 🍄`,
      `${character.name} wrapped themselves in their cloak against the chill. 🧥`,
      `${character.name} caught a glimpse of a shooting star and made a wish. 🌠`,
      `${character.name} discovered a meadow of moonlit wildflowers. 🌺`,
      `${character.name} gazed at constellations and felt at peace. 🌟`
    ];
    const doNothingFlavor = doNothingFlavorTexts[Math.floor(Math.random() * doNothingFlavorTexts.length)];
    const safeEmbed = createSafeTravelDayEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);
    const safeMessage = await channel.send({ embeds: [safeEmbed] });
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('recover').setLabel('💖 Recover a Heart').setStyle(ButtonStyle.Primary).setDisabled(character.currentHearts >= character.maxHearts || character.
      currentStamina === 0),
      new ButtonBuilder().setCustomId('gather').setLabel('🌿 Gather').setStyle(ButtonStyle.Success).setDisabled(character.currentStamina === 0),
      new ButtonBuilder().setCustomId('do_nothing').setLabel('✨ Do Nothing').setStyle(ButtonStyle.Secondary)
    );
    await safeMessage.edit({ embeds: [safeEmbed], components: [buttons] });

    const collector = safeMessage.createMessageComponentCollector({ 
      filter: i => {
        if (i.user.id !== interaction.user.id) {
          i.reply({ content: '❌ Only the traveler can interact with these buttons.', ephemeral: true });
          return false;
        }
        return true;
      }, 
      time: 300000 
    });
    collector.on('collect', async i => {
      const decision = await handleTravelInteraction(
        i,
        character,
        pathEmoji,
        currentPath,
        safeMessage,
        null,
        travelLog,
        undefined,
        i.customId === 'do_nothing' ? doNothingFlavor : undefined
      );    
      dailyLogEntry += `${decision}\n`;
      const updated = new EmbedBuilder(safeMessage.embeds[0].toJSON()).setDescription(
        `🌸 It's a safe day of travel. What do you want to do next?\n> ${decision}\n\n` +
        `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
      );
      await safeMessage.edit({ embeds: [updated], components: [] });
      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        const decision = await handleTravelInteraction(
          { customId: 'do_nothing' },
          character,
          pathEmoji,
          currentPath,
          safeMessage,
          null,
          travelLog,
          undefined,
          doNothingFlavor
        );
        dailyLogEntry += `${decision}\n`;
      }
    
      if (await checkAndHandleKO(character, channel)) return;
    
      travelLog.push(dailyLogEntry);

      await processTravelDay(day + 1, { ...context, channel });
    });    
  }
} 

// ------------------- Check Severe Weather -------------------
// Checks if the current weather conditions are too severe for travel
async function checkSevereWeather(village) {
  try {
    const weather = await getCurrentWeather(village);
    if (!weather) return false;

    // Check special conditions
    if (weather.special?.label && SEVERE_WEATHER_CONDITIONS.includes(weather.special.label)) {
      return {
        blocked: true,
        condition: weather.special.label,
        emoji: weather.special.emoji
      };
    }

    return { blocked: false };
  } catch (error) {
    handleError(error, 'travel.js (checkSevereWeather)');
    return { blocked: false };
  }
} 