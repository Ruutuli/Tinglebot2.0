// ------------------- Import necessary modules ------------------- THIS VERSION!!!!!!!!!!!!!!!!!!!!!!!!!!!
require('dotenv').config();

// Discord.js modules
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

// Database services
const { fetchCharacterByNameAndUserId } = require('../database/characterService');

// Embeds
const { createFinalTravelEmbed, createInitialTravelEmbed, createMonsterEncounterEmbed, createSafeTravelDayEmbed, createStopInInarikoEmbed, createTravelingEmbed, pathEmojis } = require('../embeds/travelEmbeds');

// Handlers
const { handleTravelAutocomplete } = require('../handlers/autocompleteHandler');
const { handleTravelInteraction } = require('../handlers/travelHandler');

// Modules
const { isValidVillage } = require('../modules/locationsModule');
const { getMonstersByPath, getRandomTravelEncounter } = require('../modules/rngModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { hasPerk } = require('../modules/jobsModule');

// ------------------- Default Image URL -------------------
const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

// ------------------- Path Channels -------------------
const PATH_CHANNELS = {
    pathOfScarletLeaves: '1305487405985431583', // Scarlet Leaves path
    leafDewWay: '1305487571228557322'          // Leaf Dew Way path
};

// ------------------- Validate Path Channels -------------------
if (!PATH_CHANNELS.pathOfScarletLeaves || !PATH_CHANNELS.leafDewWay) {
    console.error("❌ [travel.js]: Channel IDs not properly loaded. Check .env file.");
    throw new Error("Missing required channel IDs in .env file.");
}

// ------------------- Calculate Travel Duration -------------------
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
        console.log(`[travel.js]: Delivering perk active for ${character.name}, halving travel duration.`);
        return Math.max(1, Math.ceil(baseDuration / 2));
    }

    return baseDuration;
}

// ------------------- Get Current Path -------------------
function getCurrentPath(day, paths, halfTime) {
    if (paths.length === 0) {
        console.error(`[travel.js]: getCurrentPath: Invalid path length ${paths.length}`);
        return null;
    }

    if (paths.length === 1) {
        return paths[0];
    }

    return paths[Math.floor((day - 1) / (halfTime ? 1 : 2))];
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
      await interaction.deferReply();
  
      // Extract options from the interaction
      const characterName = interaction.options.getString('charactername');
      const destination = interaction.options.getString('destination').toLowerCase();
      const mode = interaction.options.getString('mode');
      const userId = interaction.user.id;
  
      // Fetch the character details from the database
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ 
          content: `❌ **Character ${characterName}** not found or does not belong to you.` 
        });
        return;
      }
  
      // Check if the character is debuffed
      if (character.debuff.active) {
        const remainingDays = Math.ceil((character.debuff.endDate - new Date()) / (1000 * 60 * 60 * 24));
        await interaction.editReply({ 
          content: `❌ **${character.name}** is currently recovering and cannot travel for ${remainingDays} more day(s).` 
        });
        return;
      }
  
      // Check if the character's inventory is synced
      if (!character.inventorySynced) {
        await interaction.editReply({
          content: `❌ **You cannot use the travel command because "${character.name}"'s inventory is not set up yet.**\n\n` +
                  `Please use the </testinventorysetup:1306176790095728732> command, then </syncinventory:1306176789894266898> to initialize the inventory.`,
          ephemeral: true,
        });
        return;
      }
  
      // Check if the character is KO'd or has no hearts left
      if (character.currentHearts <= 0 || character.ko) {
        await interaction.editReply({ 
          content: `❌ **Character ${characterName}** is KO'd and cannot travel.` 
        });
        return;
      }
  
      // Get the starting village
      const startingVillage = character.currentVillage.toLowerCase();
  
      // Ensure the character isn't already in the destination village
      if (startingVillage === destination) {
        await interaction.editReply({ 
          content: `❌ **Character ${characterName}** is already in **${capitalizeFirstLetter(destination)}**!` 
        });
        return;
      }
  
      // Validate the destination village
      if (!isValidVillage(destination)) {
        await interaction.editReply({ 
          content: `❌ Invalid destination: **${capitalizeFirstLetter(destination)}**. Please select a valid village.` 
        });
        return;
      }
  
      // Determine the travel duration and paths
      const totalTravelDuration = calculateTravelDuration(startingVillage, destination, mode, character);
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
        content: `❌ **${character.name}** is trying to travel from **Rudania** to **Vhintl**, but you're on the wrong road! You must start in <#${PATH_CHANNELS.pathOfScarletLeaves}>.`,
      });
      return;
    }
  } else if (startingVillage === 'vhintl' && destination === 'rudania') {
    if (currentChannel !== PATH_CHANNELS.leafDewWay) {
      await interaction.editReply({
        content: `❌ **${character.name}** is trying to travel from **Vhintl** to **Rudania**, but you're on the wrong road! You must start in <#${PATH_CHANNELS.leafDewWay}>.`,
      });
      return;
    }
  }
}

// Validate channel for 2-day travel routes with Delivering perk
if (totalTravelDuration === 2 && hasPerk(character, 'DELIVERING')) {
  if (
    (startingVillage === 'vhintl' && destination === 'rudania') ||
    (startingVillage === 'rudania' && destination === 'vhintl')
  ) {
    if (
      currentChannel !== PATH_CHANNELS.leafDewWay &&
      currentChannel !== PATH_CHANNELS.pathOfScarletLeaves
    ) {
      await interaction.editReply({
        content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(
          startingVillage
        )}** to **${capitalizeFirstLetter(
          destination
        )}**, but you're on the wrong road! Start in either <#${PATH_CHANNELS.pathOfScarletLeaves}> (Day 1) or <#${PATH_CHANNELS.leafDewWay}> (Day 2).`,
      });
      return;
    }
  }
}

// Validate channel for standard 2-day travel routes
if (totalTravelDuration === 2 && !hasPerk(character, 'DELIVERING')) {
  if (
    (startingVillage === 'inariko' && destination === 'vhintl') ||
    (startingVillage === 'vhintl' && destination === 'inariko')
  ) {
    if (currentChannel !== PATH_CHANNELS.leafDewWay) {
      await interaction.editReply({
        content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(
          startingVillage
        )}** to **${capitalizeFirstLetter(
          destination
        )}**, but you're on the wrong road! You must travel on <#${PATH_CHANNELS.leafDewWay}>.`,
      });
      return;
    }
  }

  if (
    (startingVillage === 'inariko' && destination === 'rudania') ||
    (startingVillage === 'rudania' && destination === 'inariko')
  ) {
    if (currentChannel !== PATH_CHANNELS.pathOfScarletLeaves) {
      await interaction.editReply({
        content: `❌ **${character.name}** is trying to travel from **${capitalizeFirstLetter(
          startingVillage
        )}** to **${capitalizeFirstLetter(
          destination
        )}**, but you're on the wrong road! You must travel on <#${PATH_CHANNELS.pathOfScarletLeaves}>.`,
      });
      return;
    }
  }
}

// ------------------- Set up paths -------------------
let paths = [];
let stopInInariko = false;

// Handle 4-day travel routes
if (totalTravelDuration === 4) {
  if (startingVillage === 'rudania') {
    paths = ['pathOfScarletLeaves', 'leafDewWay'];
  } else if (startingVillage === 'vhintl') {
    paths = ['leafDewWay', 'pathOfScarletLeaves'];
  } else {
    console.error(`[travel.js]: Invalid route for 4-day duration between ${startingVillage} and ${destination}.`);
    throw new Error(`Invalid route for 4-day duration between ${startingVillage} and ${destination}.`);
  }
  stopInInariko = true; // Multi-day travel requires a stop
}

// Handle 2-day travel routes
else if (totalTravelDuration === 2) {
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
  } else if (
    hasPerk(character, 'DELIVERING') &&
    ((startingVillage === 'vhintl' && destination === 'rudania') ||
      (startingVillage === 'rudania' && destination === 'vhintl'))
  ) {
    // Handle special 2-day travel routes with the Delivering perk
    paths =
      startingVillage === 'rudania'
        ? ['pathOfScarletLeaves', 'leafDewWay']
        : ['leafDewWay', 'pathOfScarletLeaves'];
    stopInInariko = true;
  } else {
    console.error(`[travel.js]: Invalid route for 2-day duration between ${startingVillage} and ${destination}.`);
    throw new Error(`Invalid route for 2-day duration between ${startingVillage} and ${destination}.`);
  }
}

// Handle 1-day travel routes
else if (totalTravelDuration === 1) {
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
  } else {
    console.error(`[travel.js]: Invalid route for 1-day duration between ${startingVillage} and ${destination}.`);
    throw new Error(`Invalid route for 1-day duration between ${startingVillage} and ${destination}.`);
  }
}

// Handle undefined or invalid travel durations
else {
  console.error(`[travel.js]: No valid paths for total travel duration: ${totalTravelDuration}.`);
  throw new Error(`No valid paths for total travel duration: ${totalTravelDuration}.`);
}

// Log the determined paths
console.log(`[travel.js]: Paths determined: ${paths.join(', ')} for travel from ${startingVillage} to ${destination}.`);

// ------------------- Initial travel announcement -------------------
const initialEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration);
await interaction.followUp({ embeds: [initialEmbed] });

// Initialize travel log and state variables
let travelLog = [];
let travelingMessages = [];
let lastSafeDayMessage = null;

// ------------------- Helper function to process each travel day -------------------
const processTravelDay = async (day) => {
    const adjustedDuration = totalTravelDuration;
  
    console.log(`[travel.js]: Delivering perk active: ${hasPerk(character, 'DELIVERING')}`);
    console.log(`[travel.js]: Processing Day ${day}. Total Adjusted Duration: ${adjustedDuration}`);
    console.log(`[travel.js]: StopInInariko: ${stopInInariko}`);
  
    // Check if the journey is complete
    if (day > adjustedDuration) {
      console.log(`[travel.js]: Journey complete on Day ${day}.`);
  
      // Update the character's current village and save changes
      character.currentVillage = destination;
      await character.save();
  
      console.log(`[travel.js]: Character ${character.name} has completed their journey to ${destination}.`);
  
      // Determine the final channel ID based on destination and paths
      let finalChannelId = PATH_CHANNELS[paths[paths.length - 1]];
      if (!finalChannelId) {
        console.error(`[travel.js]: Final channel ID for destination "${destination}" is undefined.`);
        throw new Error(`Final channel ID for destination "${destination}" is undefined.`);
      }
  
      // Special cases for channel assignment
      if ((destination === 'inariko' && startingVillage === 'rudania') || (destination === 'rudania' && startingVillage === 'inariko')) {
        finalChannelId = PATH_CHANNELS.pathOfScarletLeaves;
      } else if ((destination === 'inariko' && startingVillage === 'vhintl') || (destination === 'vhintl' && startingVillage === 'inariko')) {
        finalChannelId = PATH_CHANNELS.leafDewWay;
      } else {
        finalChannelId = destination === 'vhintl' || destination === 'inariko'
          ? PATH_CHANNELS.leafDewWay
          : PATH_CHANNELS.pathOfScarletLeaves;
      }
  
      // Fetch the final channel
      const finalChannel = await interaction.client.channels.fetch(finalChannelId);
  
      // Create and send the final travel embeds
      const finalEmbed = createFinalTravelEmbed(character, destination, paths, adjustedDuration, travelLog);
      const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png') // Replace with a valid image URL
        .setDescription(`🎉 **${character.name} has arrived safely at ${capitalizeFirstLetter(destination)}!**`);
  
      try {
        await finalChannel.send({ embeds: [finalEmbed] });
        await finalChannel.send({ embeds: [imageEmbed] });
      } catch (error) {
        console.error(`[travel.js]: Error sending the arrival embed: ${error.message}`, error);
        await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
      }
  
      // Clean up all travel messages
      for (const msg of travelingMessages) {
        await msg.delete();
      }
  
      return; // End processing as the journey is complete
    }
  
  // ------------------- Determine the current path for the day -------------------
  const currentPath = getCurrentPath(day, paths, hasPerk(character, 'DELIVERING'));
  if (!currentPath) {
    console.error(`[travel.js]: Current path is undefined for day ${day}. Paths: ${paths}`);
    throw new Error(`Current path is undefined for day ${day}. Paths: ${paths.join(', ')}`);
  }
  console.log(`[travel.js]: Current path for Day ${day}: ${currentPath}.`);
  
  // Retrieve the channel ID for the current path
  const channelId = PATH_CHANNELS[currentPath];
  if (!channelId) {
    console.error(`[travel.js]: Channel ID for path "${currentPath}" is undefined.`);
    throw new Error(`Channel ID for path "${currentPath}" is undefined.`);
  }
  
  // Retrieve the emoji for the current path
  const pathEmoji = pathEmojis[currentPath];
  if (!pathEmoji) {
    console.error(`[travel.js]: pathEmoji for "${currentPath}" is undefined.`);
    throw new Error(`pathEmoji for "${currentPath}" is undefined.`);
  }
  
  console.log(`[travel.js]: Using pathEmoji "${pathEmoji}" for path "${currentPath}".`);
  
  // Fetch the channel and post a traveling message
  const channel = await interaction.client.channels.fetch(channelId);
  const travelingEmbed = createTravelingEmbed(character);
  const travelingMessage = await channel.send({ embeds: [travelingEmbed] });
  travelingMessages.push(travelingMessage);
  
  console.log(`[travel.js]: Posted traveling message in ${currentPath} for Day ${day}.`);
  
  // Wait briefly before proceeding to simulate travel progression
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
      const tier = parseInt(encounterType.split(' ')[1], 10); // Extract the tier from the encounter type
      const filteredMonsters = monsters.filter(monster => monster.tier <= tier); // Filter monsters of the same or lower tier
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
            .setDisabled(character.currentStamina === 0) // Disable if the character has no stamina
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
 
// KO Check at the end of the day
if (character.currentHearts <= 0 || character.ko) {
    character.ko = true; // Ensure KO flag is set

    // Determine the recovery village
    const recoveryVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl') 
        ? 'inariko' 
        : character.currentVillage;

    // Update the character's location, stamina, and add debuff
    character.currentVillage = recoveryVillage;
    character.currentStamina = 0; // Deplete stamina
    character.debuff = {
        active: true,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };

    await character.save(); // Save the updated character state

    // Create the KO embed directly
    const koEmbed = new EmbedBuilder()
        .setTitle(`💀 **${character.name} is KO'd!**`)
        .setDescription(
            `**${character.name}** woke up in **${capitalizeFirstLetter(recoveryVillage)}** and needs time to recover from their ordeal.\n\n` +
            `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
            `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}\n\n` +
            `🔔 **${character.name}** is out of commission and a debuff has been applied. They will recover in 7 days.`
        )
        .setColor('#FF0000')
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/KORecovery.png') // Example image URL
        .setTimestamp();

    // Send the embed message
    await interaction.channel.send({ embeds: [koEmbed] });

    return; // Stop further processing for the day
}

// ------------------- Stop at Inariko for multi-day travel -------------------
if (day === 1 && stopInInariko && hasPerk(character, 'DELIVERING')) {
    console.log(`[travel.js]: Stopping at Inariko on Day ${day}.`);

    const nextChannelId = PATH_CHANNELS[paths[1]]; // Transition to the second path for Day 2
    const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);

    const channel = await interaction.client.channels.fetch(PATH_CHANNELS[paths[0]]);
    console.log(`[travel.js]: Fetching channel for current path "${paths[0]}" to post stop message.`);
    await channel.send({ embeds: [stopEmbed] });

    travelLog.push(`> 🛑 Stopped in Inariko. Please move to <#${nextChannelId}> to continue your journey.\n`);

    const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png')
        .setDescription('🛑 A serene view accompanies the stop.');

    try {
        await channel.send({ embeds: [imageEmbed] });
    } catch (error) {
        console.error(`[travel.js]: Error sending stop-in-Inariko image embed: ${error.message}`);
    }

    console.log(`[travel.js]: Stop message posted for Day ${day}. Moving to Day 2.`);
    await processTravelDay(day + 1); // Explicitly call Day 2 processing
    return; // Prevent further processing for Day 1
}

// ------------------- Final Day Logic -------------------
if (day === adjustedDuration && hasPerk(character, 'DELIVERING')) {
    console.log(`[travel.js]: Final Day ${day} reached. Preparing to post Day 2/2 travel message.`);

    // Explicitly fetch and post Day 2/2 travel message
    const currentPath = paths[1] || paths[0]; // Use the second path or fallback to the first
    const pathEmoji = pathEmojis[currentPath];
    const dayTravelEmbed = createTravelingEmbed(character, day, totalTravelDuration, pathEmoji, currentPath);

    const channelId = PATH_CHANNELS[currentPath];
    const channel = await interaction.client.channels.fetch(channelId);

    if (!channel) {
        console.error(`[travel.js]: Failed to fetch channel for path "${currentPath}".`);
        throw new Error(`Channel not found for path "${currentPath}".`);
    }

    console.log(`[travel.js]: Posting Day 2/2 travel message in channel "${currentPath}".`);
    await channel.send({ embeds: [dayTravelEmbed] });

    // Process interactions for Day 2
    console.log(`[travel.js]: Processing interactions for Day ${day}/${adjustedDuration} on path "${currentPath}".`);

    // Log Day 2/2
    travelLog.push(`> **Day ${day}:** Traveled on ${currentPath}.\n`);

    // Finalize the journey
    console.log(`[travel.js]: Finalizing journey for ${character.name} on Day ${day}.`);
    character.currentVillage = destination;
    await character.save();

    const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || channelId;
    const finalChannel = await interaction.client.channels.fetch(finalChannelId);

    const finalEmbed = createFinalTravelEmbed(character, destination, paths, adjustedDuration, travelLog);
    const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png')
        .setDescription(`🎉 **${character.name} has arrived safely at ${capitalizeFirstLetter(destination)}!**`);

    try {
        console.log(`[travel.js]: Posting final journey embeds in channel "${finalChannelId}".`);
        await finalChannel.send({ embeds: [finalEmbed] });
        await finalChannel.send({ embeds: [imageEmbed] });
    } catch (error) {
        console.error(`[travel.js]: Error sending arrival embeds: ${error.message}`);
        await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
    }

    console.log(`[travel.js]: Journey complete for ${character.name}.`);
    return; // End processing
}

// ------------------- Log the day and proceed to the next day -------------------
travelLog.push(`> **Day ${day}:** Traveled on ${currentPath}.\n`);

if (day === 2 && stopInInariko) {
    const nextChannelId = PATH_CHANNELS[paths[1]]; // Use the second path for Day 2
    if (!nextChannelId) {
        console.error(`[travel.js]: Next channel ID for path "${paths[1]}" is undefined.`);
        throw new Error(`Next channel ID for path "${paths[1]}" is undefined.`);
    }
            
    const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
    await channel.send({ embeds: [stopEmbed] });
    travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);
            
    // Attach a custom image for the stop
    const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png') // Replace with a valid image URL
        .setDescription('🛑 A serene view accompanies the stop.');

    try {
        await channel.send({ embeds: [imageEmbed] });
    } catch (error) {
        console.error(`❌ Error sending the stop image embed: ${error.message}`);
    }

    // Wait briefly before processing the next day
    await new Promise(resolve => setTimeout(resolve, 3000));
}

console.log(`[travel.js]: Moving to Day ${day + 1}.`);
await processTravelDay(day + 1);
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
            .setDisabled(character.currentHearts >= character.maxHearts || character.currentStamina === 0), // Disable if full hearts or no stamina
        new ButtonBuilder()
            .setCustomId('gather')
            .setLabel('🌿 Gather')
            .setStyle(ButtonStyle.Success)
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
        .setDescription(
            `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
            `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
            `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
        );

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

// KO Check at the end of the day
if (character.currentHearts <= 0 || character.ko) {
    character.ko = true; // Ensure KO flag is set

    // Determine the recovery village
    const recoveryVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl') 
        ? 'inariko' 
        : character.currentVillage;

    // Update the character's location, stamina, and add debuff
    character.currentVillage = recoveryVillage;
    character.currentStamina = 0; // Deplete stamina
    character.debuff = {
        active: true,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };

    await character.save(); // Save the updated character state

    // Create the KO embed directly
    const koEmbed = new EmbedBuilder()
        .setTitle(`💀 **${character.name} is KO'd!**`)
        .setDescription(
            `**${character.name}** woke up in **${capitalizeFirstLetter(recoveryVillage)}** and needs time to recover from their ordeal.\n\n` +
            `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
            `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}\n\n` +
            `🔔 **${character.name}** is out of commission and a debuff has been applied. They will recover in 7 days.`
        )
        .setColor('#FF0000')
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/KORecovery.png') // Example image URL
        .setTimestamp();

    // Send the embed message
    await interaction.channel.send({ embeds: [koEmbed] });

    return; // Stop further processing for the day
}

// Log the day and proceed to the next day
travelLog.push(dailyLogEntry);

let halfway = hasPerk(character, 'DELIVERING') ? 1 : 2;
if (day === halfway && stopInInariko) {
    const nextChannelId = PATH_CHANNELS[paths[1]];
    const stopEmbed = createStopInInarikoEmbed(character, nextChannelId);
    await channel.send({ embeds: [stopEmbed] });
    travelLog.push(`> 🛑 Stopped in Inariko for rest and supplies.\n`);
        
    // Attach a custom image for the stop
    const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/stopatlanayru.png') // Replace with the desired image URL
        .setDescription('🛑 A serene view accompanies the stop.');
        
        try {
            await channel.send({ embeds: [imageEmbed] });
        } catch (error) {
            console.error('❌ Error sending the stop image embed:', error);
        }
    
        // Wait briefly before processing the next day
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
        
    console.log(`[travel.js]: Transitioning to Day 2.`);
    await processTravelDay(day + 1); // Process the next day
    });
    
    }
  };

// Start processing travel from day 1
await processTravelDay(1);    
} catch (error) {
    console.error(`❌ Error during travel command execution: ${error.message}`, error);
    await interaction.followUp({ content: `❌ **Error during travel command execution:** ${error.message}` });
}
  }
};


 