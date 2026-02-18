// ============================================================================
// ------------------- Imports -------------------
// Organizes all required modules in proper group order for clarity and maintainability.
// ============================================================================

// ------------------- Standard Libraries -------------------
const dotenv = require('dotenv');
const path = require('path');
const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', '..', `.env.${env}`);
// Try environment-specific file first, then fall back to root .env
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

// ------------------- Discord.js Components -------------------
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} = require('discord.js');

// ------------------- Database Services -------------------
const logger = require('@/utils/logger');
const {
  fetchCharacterByNameAndUserId,
  fetchCharactersByUserId,
  updateCharacterById,
  updateModCharacterById
} = require('@/database/db.js');

// ------------------- Database Models -------------------
// const Mount = require('@/models/MountModel');
const User = require('@/models/UserModel.js');
const Character = require('@/models/CharacterModel.js');

// ------------------- Blight Handler -------------------
const { finalizeBlightApplication } = require('../../handlers/blightHandler');

// ------------------- Embeds -------------------
const {
  createInitialTravelEmbed,
  createMonsterEncounterEmbed,
  createSafeTravelDayEmbed,
  createTravelingEmbed,
  createWeatherTravelRestrictionEmbed,
  pathEmojis
} = require('../../embeds/embeds.js');

// ------------------- Handlers -------------------
const {
  createFinalTravelEmbed,
  handleTravelInteraction,
  assignVillageVisitingRole
} = require('../../handlers/travelHandler.js');

// ------------------- Utility Functions -------------------
const { capitalizeFirstLetter, capitalizeWords } = require('../../modules/formattingModule.js');
const { getMonstersByPath, getRandomTravelEncounter } = require('../../modules/rngModule.js');
const { hasPerk } = require('../../modules/jobsModule.js');
const { isValidVillage, getAllVillages } = require('../../modules/locationsModule.js');
const { checkInventorySync } = require('@/utils/characterUtils');
const { enforceJail } = require('@/utils/jailCheck');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { retrieveAllByType } = require('@/utils/storage.js');
const TempData = require('@/models/TempDataModel');
const { getWeatherWithoutGeneration } = require('@/services/weatherService');
const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
const { applyTravelWeatherBoost } = require('../../modules/boostIntegration');
const { generateBoostFlavorText } = require('../../modules/flavorTextModule');
const { retrieveBoostingRequestFromTempDataByCharacter, saveBoostingRequestToTempData, updateBoostAppliedMessage } = require('../jobs/boosting');
const { updateBoostRequestEmbed } = require('../../embeds/embeds.js');
const { checkVillageStatus } = require('../../modules/villageModule');

// ------------------- External API Integrations -------------------
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const COMMAND_NAME = 'travel';
const COMMAND_DESCRIPTION = 'Travel between villages';

// Village visiting role IDs
const VILLAGE_VISITING_ROLES = {
  'Rudania': '1379850030856405185',
  'Inariko': '1379850102486863924', 
  'Vhintl': '1379850161794056303'
};

// Severe weather conditions that block travel
const SEVERE_WEATHER_CONDITIONS = [
  'Avalanche',
  'Flood',
  'Rock Slide'
];

const {
  PATH_OF_SCARLET_LEAVES_CHANNEL_ID: PATH_OF_SCARLET_LEAVES,
  LEAF_DEW_WAY_CHANNEL_ID: LEAF_DEW_WAY,
  TRAVEL_DELAY_MS = '3000'
} = process.env;

if (!PATH_OF_SCARLET_LEAVES || !LEAF_DEW_WAY) {
  handleInteractionError(new Error('Missing required path channel IDs in environment variables.'), 'travel.js');
  throw new Error('Missing required path channel IDs in environment variables.');
}

const PATH_CHANNELS = {
  pathOfScarletLeaves: PATH_OF_SCARLET_LEAVES,
  leafDewWay: LEAF_DEW_WAY
};

// Allow travel actions to be initiated from this testing channel as an override
const TEST_TRAVEL_CHANNEL_ID = '1391812848099004578';

const MODE_CHOICES = [
  { name: 'on foot',  value: 'on foot'  }
  // { name: 'on mount', value: 'on mount' } // Temporarily disabled
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
  // Safety check: ensure character object is valid
  if (!character || typeof character !== 'object') {
    logger.error('CHARACTER', 'Invalid character object passed to calculateTravelDuration');
    return -1;
  }

  const travelTimes = {
    'on foot': {
      'inariko-rudania': 2,
      'inariko-vhintl': 2,
      'rudania-inariko': 2,
      'vhintl-inariko': 2
    },
    'on mount': {
      'inariko-rudania': 1,
      'inariko-vhintl': 1,
      'rudania-inariko': 1,
      'vhintl-inariko': 1
    }
  };

  const key = `${currentVillage}-${destination}`;
  const reverseKey = `${destination}-${currentVillage}`;
  let baseDuration = travelTimes[mode][key] || travelTimes[mode][reverseKey] || -1;

  // Apply DELIVERING perk
  if (baseDuration > 0 && character.job && hasPerk(character, 'DELIVERING')) {
    baseDuration = Math.max(1, Math.ceil(baseDuration / 2));
  }

  // Apply elixir speed buff
  if (baseDuration > 0) {
    const buffEffects = getActiveBuffEffects(character);
    if (buffEffects && buffEffects.speedBoost > 0) {
      // Hasty Elixir cuts travel time in half (minimum 1 day)
      const originalDuration = baseDuration;
      baseDuration = Math.max(1, Math.ceil(baseDuration / 2));
      const speedReduction = originalDuration - baseDuration;
              console.log(`[travel.js]: 🧪 Hasty Elixir: ${originalDuration} → ${baseDuration} days`);
    }
  }

  return baseDuration;
}

// ------------------- Wrong-Road Guard -------------------
// Validates that user is on the correct Discord channel for the selected route.
async function validateCorrectTravelChannel(interaction, character, startingVillage, destination, totalTravelDuration) {
  // Safety check: ensure character object is valid
  if (!character || typeof character !== 'object') {
    console.error('[travel.js]: ❌ Invalid character object passed to validateCorrectTravelChannel');
    return false;
  }

  const currentChannel = interaction.channelId;
  const isTestingChannelOrThread = currentChannel === TEST_TRAVEL_CHANNEL_ID || interaction.channel?.parentId === TEST_TRAVEL_CHANNEL_ID;

  // Bypass channel path validation in the designated testing channel and any threads in it
  if (isTestingChannelOrThread) {
    return true;
  }

  if (totalTravelDuration === 2 && character.job && !hasPerk(character, 'DELIVERING')) {
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
      const userTag = interaction.user.tag;

      // ------------------- Fetch Character from Database -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        console.log(`[travel.js]: ❌ Character not found for ${userTag}`);
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Handle characters without jobs (legacy data issue)
      if (!character.job || typeof character.job !== 'string') {
        console.warn(`[travel.js]: ⚠️ Character ${character.name} has no job, setting default job to 'Villager'`);
        character.job = 'Villager';
        
        // Update the character in the database
        try {
          if (character.isModCharacter) {
            const ModCharacter = require('@/models/ModCharacterModel.js');
            await ModCharacter.findByIdAndUpdate(character._id, { job: 'Villager' });
          } else {
            await Character.findByIdAndUpdate(character._id, { job: 'Villager' });
          }
          console.log(`[travel.js]: ✅ ${character.name} job set to 'Villager'`);
        } catch (updateError) {
          console.error(`[travel.js]: ❌ Failed to update character job:`, updateError);
          // Continue with the default job for this session
        }
      }

      // Log character loaded
      console.log(`[travel.js]: 📋 Character loaded: ${character.name} (${character.job}) in ${character.currentVillage}`);

      // Note: Starting village blight rain check moved to after successful travel completion
      // This prevents characters from being blighted if they don't actually arrive at their destination
      
      const startingVillage = character.currentVillage.toLowerCase();
      
      // ------------------- Check if Starting Village is Damaged -------------------
      // Mod characters are exempt from this restriction
      const isModCharacter = character.isModCharacter || (character.constructor && character.constructor.modelName === 'ModCharacter');
      if (!isModCharacter && startingVillage) {
        const villageStatus = await checkVillageStatus(startingVillage);
        if (villageStatus === 'damaged') {
          const capitalizedStartingVillage = capitalizeFirstLetter(startingVillage);
          const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Village Repair Required')
            .setDescription(`**${character.name}** cannot travel because **${capitalizedStartingVillage}** is damaged and needs repair.`)
            .addFields(
              { name: 'What to do', value: 'Please help repair the village first by contributing tokens using </village donate>.', inline: false }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: 'Repair the village to unlock travel' })
            .setTimestamp();
          return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
      }

      // ------------------- Check if Destination Village is Damaged -------------------
      // Block travel TO a damaged village (same exemption for mod characters)
      if (!isModCharacter && destination) {
        const destinationStatus = await checkVillageStatus(destination);
        if (destinationStatus === 'damaged') {
          const capitalizedDestination = capitalizeFirstLetter(destination);
          const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Destination Village Damaged')
            .setDescription(`**${character.name}** cannot travel to **${capitalizedDestination}** because the village is damaged and needs repair.`)
            .addFields(
              { name: 'What to do', value: 'Travel is blocked until the village is repaired. Others can help by contributing tokens using </village donate> in that village.', inline: false }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: 'Repair the village to unlock travel' })
            .setTimestamp();
          return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
      }

      // Check starting village for blight rain (moved to after travel completion)
      const startingWeather = await getWeatherWithoutGeneration(startingVillage);
      if (false && startingWeather?.special?.label === 'Blight Rain') {
        // Mod characters are immune to blight infection
        if (character.isModCharacter) {
          const immuneMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
          await interaction.editReply({ content: immuneMsg, ephemeral: false });
        } else if (character.blighted) {
          const alreadyMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
          await interaction.editReply({ content: alreadyMsg, ephemeral: false });
        } else {
          // Check for resistance buffs
          const buffEffects = getActiveBuffEffects(character);
          let infectionChance = 0.75; // Base 75% chance
          
          // Apply resistance buffs
          if (buffEffects && buffEffects.blightResistance > 0) {
            infectionChance -= (buffEffects.blightResistance * 0.1); // Each level reduces by 10%
            console.log(`[travel.js]: 🧪 Blight resistance: ${infectionChance} chance`);
          }
          if (buffEffects && buffEffects.fireResistance > 0) {
            infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
            console.log(`[travel.js]: 🧪 Fire resistance: ${infectionChance - (buffEffects.fireResistance * 0.05)} chance`);
          }
          
          // Consume elixirs after applying their effects
          if (shouldConsumeElixir(character, 'travel', { blightRain: true })) {
            consumeElixirBuff(character);
            // Update character in database
            const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
            await updateFunction(character._id, { buff: character.buff });
          } else if (character.buff?.active) {
            // Log when elixir is not used due to conditions not met
            console.log(`[travel.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
          }
          
          // Ensure chance stays within reasonable bounds
          infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
          
          if (Math.random() < infectionChance) {
            // Create fancy blight infection embed
            const blightEmbed = new EmbedBuilder()
              .setColor('#AD1457')
              .setTitle('<:blight_eye:805576955725611058> Blight Infection!')
              .setDescription(`◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈`)
              .addFields(
                {
                  name: '🏥 Healing Available',
                  value: 'You can be healed by **Oracles, Sages & Dragons**',
                  inline: true
                },
                {
                  name: '📋 Blight Information',
                  value: '[Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)',
                  inline: true
                },
                {
                  name: '⚠️ STAGE 1',
                  value: 'Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.',
                  inline: false
                },
                {
                  name: '🎲 Daily Rolling',
                  value: '**Starting tomorrow, you\'ll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today\'s blight roll if you were just infected.*',
                  inline: false
                }
              )
              .setThumbnail(character.icon)
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: 'Blight Infection System', iconURL: 'https://storage.googleapis.com/tinglebot/blight-icon.png' })
              .setTimestamp();

            await interaction.editReply({ embeds: [blightEmbed], ephemeral: false });
            
            // Use shared finalize helper - each step has its own try/catch for resilience
            await finalizeBlightApplication(
              character,
              interaction.user.id,
              {
                client: interaction.client,
                guild: interaction.guild,
                source: `Blight Rain in ${capitalizeFirstLetter(startingVillage)}`,
                alreadySaved: false
              }
            );
            
            // Add to character's travel log
            character.travelLog = character.travelLog || [];
            character.travelLog.push(`<:blight_eye:805576955725611058> **${character.name}** was infected with blight in **${capitalizeFirstLetter(startingVillage)}**!`);
          } else {
            let safeMsg = "<:blight_eye:805576955725611058> **Blight Rain!**\n\n";
            
            if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
              safeMsg += `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
              safeMsg += "The protective effects of your elixir kept you safe from the blight.";
              
              // Consume chilly or fireproof elixirs after use
              if (shouldConsumeElixir(character, 'travel', { blightRain: true })) {
                consumeElixirBuff(character);
                // Update character in database
                const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
                await updateFunction(character._id, { buff: character.buff });
                safeMsg += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
              } else if (character.buff?.active) {
                // Log when elixir is not used due to conditions not being met
                console.log(`[travel.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
              }
            } else {
              safeMsg += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
              safeMsg += "You feel lucky... but be careful out there.";
            }
            
            await interaction.editReply({ content: safeMsg, ephemeral: false });
          }
        }
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
            `The request will expire in ${timeLeft} days. Please complete the healing request before traveling.`
        });
        return;
      }

      // ------------------- Check Severe Weather -------------------
      let boostFlavorText = null;
      const severeWeather = await checkSevereWeather(startingVillage);
      if (severeWeather.blocked) {
        // Check for Fortune Teller Traveling boost override
        const weatherOverride = await applyTravelWeatherBoost(character.name, true);
        if (weatherOverride === false) {
          logger.info('BOOST', `⚡ Fortune Teller boost applied: Foresight Detour allows ${character.name} to travel from ${startingVillage} despite ${severeWeather.condition}.`);
          boostFlavorText = generateBoostFlavorText('Fortune Teller', 'Traveling');
        } else {
          const weatherEmbed = createWeatherTravelRestrictionEmbed(
            character,
            severeWeather.condition,
            severeWeather.emoji,
            startingVillage,
            false
          );
          return interaction.editReply({
            embeds: [weatherEmbed]
          });
        }
      }

      // Check destination weather as well
      const destinationSevereWeather = await checkSevereWeather(destination);
      if (destinationSevereWeather.blocked) {
        // Check for Fortune Teller Traveling boost override (arrival side)
        const weatherOverrideDest = await applyTravelWeatherBoost(character.name, true);
        if (weatherOverrideDest === false) {
          logger.info('BOOST', `⚡ Fortune Teller boost applied: Foresight Detour allows ${character.name} to arrive at ${destination} despite ${destinationSevereWeather.condition}.`);
          boostFlavorText = boostFlavorText || generateBoostFlavorText('Fortune Teller', 'Traveling');
        } else {
          const weatherEmbed = createWeatherTravelRestrictionEmbed(
            character,
            destinationSevereWeather.condition,
            destinationSevereWeather.emoji,
            destination,
            true
          );
          return interaction.editReply({
            embeds: [weatherEmbed]
          });
        }
      }

      // ------------------- Mount Travel Logic -------------------
      // let mount = null;
      // if (mode === 'on mount') {
      //   console.log(`[travel.js]: 🔍 Checking mount for character ${character.name} (${character._id})`);
      //   mount = await Mount.findOne({ characterId: character._id, status: 'active' });
      //   console.log(`[travel.js]: 🐴 Mount found: ${mount ? 'Yes' : 'No'}`);
      //   if (!mount) {
      //     console.log(`[travel.js]: ❌ No mount found for ${character.name}, blocking travel`);
      //     return interaction.editReply({
      //       content: `❌ **${character.name}** does not have a registered mount. You must register a mount before traveling on mount.`
      //     });
      //   }
      //   console.log(`[travel.js]: ✅ Mount validation passed for ${character.name}`);
      //   // Recover mount stamina if a day has passed since lastMountTravel
      //   const now = new Date();
      //   if (mount.lastMountTravel) {
      //     const last = new Date(mount.lastMountTravel);
      //     const msInDay = 24 * 60 * 60 * 1000;
      //     const daysPassed = Math.floor((now - last) / msInDay);
      //     if (daysPassed > 0) {
      //       const maxStamina = mount.stamina;
      //       mount.currentStamina = Math.min(maxStamina, (mount.currentStamina || maxStamina) + daysPassed);
      //       await mount.save();
      //     }
      //     // Enforce 1 day cooldown
      //     if ((now - last) < msInDay) {
      //       return interaction.editReply({
      //         content: `❌ **${mount.name}** must rest for 1 day before traveling again. Please wait before using your mount for travel.`
      //       });
      //     }
      //   } else {
      //     // If never traveled, initialize currentStamina
      //     if (mount.currentStamina == null) {
      //       mount.currentStamina = mount.stamina;
      //       await mount.save();
      //     }
      //   }
      // }

      // ------------------- Check for Debuff -------------------
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const now = new Date();
        
        // Check if debuff has actually expired
        if (debuffEndDate <= now) {
          // Debuff has expired, clear it
          character.debuff.active = false;
          character.debuff.endDate = null;
          await character.save();
        } else {
          // Debuff is still active
          const remainingDays = Math.ceil((debuffEndDate - now) / (1000 * 60 * 60 * 24));
          return interaction.editReply({
            content: `❌ **${character.name}** is recovering and cannot travel for ${remainingDays} more day(s).`
          });
        }
      }

      // ------------------- Check Inventory Sync -------------------
      // (no longer required, but kept for compatibility)
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

      // ------------------- Consume Hasty Elixir if Travel Time was Reduced -------------------
      // Check if the Hasty Elixir was used to reduce travel time
      const originalDuration = calculateTravelDuration(startingVillage, destination, mode, { ...character, buff: { active: false } });
      if (totalTravelDuration < originalDuration) {
        try {
          if (shouldConsumeElixir(character, 'travel')) {
            const consumedElixirType = character.buff.type;
            console.log(`[travel.js]: 🧪 ${consumedElixirType} elixir consumed for ${character.name} during travel`);
            console.log(`[travel.js]: 🧪 Travel time reduced: ${originalDuration} → ${totalTravelDuration} days`);
      
            
            if (consumedElixirType === 'hasty') {
              console.log(`[travel.js]: 🏃 Hasty Elixir helped ${character.name} travel faster!`);
            }
            
            consumeElixirBuff(character);
            
            // Update character in database to persist the consumed elixir
            if (character.isModCharacter) {
              const ModCharacter = require('@/models/ModCharacterModel.js');
              await ModCharacter.findByIdAndUpdate(character._id, { buff: character.buff });
            } else {
              await Character.findByIdAndUpdate(character._id, { buff: character.buff });
            }
          } else if (character.buff?.active) {
            // Log when elixir is not used due to conditions not being met
            console.log(`[travel.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
          }
        } catch (elixirError) {
          console.error(`[travel.js]: ⚠️ Warning - Elixir consumption failed:`, elixirError);
          // Don't fail the travel if elixir consumption fails
        }
      }

      // if (mode === 'on mount') {
      //   if (!mount) {
      //     return interaction.editReply({
      //       content: `❌ **${character.name}** does not have a registered mount. You must register a mount before traveling on mount.`
      //     });
      //   }
      //   if (mount.currentStamina < totalTravelDuration) {
      //     return interaction.editReply({
      //       content: `❌ **${mount.name}** does not have enough stamina to complete this journey. Required: ${totalTravelDuration}, Available: ${mount.currentStamina}`
      //     });
      //   }
      // }

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

      // ------------------- Update Mount After All Validations Pass -------------------
      // if (mode === 'on mount') {
      //   // Deduct mount stamina and update lastMountTravel
      //   mount.currentStamina -= totalTravelDuration;
      //   mount.lastMountTravel = new Date();
      //   await mount.save();
      // }

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
      const initialEmbed = createInitialTravelEmbed(character, startingVillage, destination, paths, totalTravelDuration, null, mode, boostFlavorText);
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
        mount: null,
        mode,
        startingWeather,
        scholarTravelGuideActive: false,
        scholarTravelGuideTriggered: false
      });
      
    } catch (error) {
      handleInteractionError(error, 'travel.js (execute)', {
        commandName: 'travel',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: interaction.options.getString('charactername'),
        options: {
          destination: interaction.options.getString('destination'),
          mode: interaction.options.getString('mode'),
          channelId: interaction.channelId,
          guildId: interaction.guildId
        }
      });
      console.error(`[travel.js]: ❌ Error during travel command execution:`, {
        error: error.message,
        stack: error.stack,
        user: {
          tag: interaction.user.tag,
          id: interaction.user.id
        },
        command: {
          characterName: interaction.options.getString('charactername'),
          destination: interaction.options.getString('destination'),
          mode: interaction.options.getString('mode')
        },
        context: {
          channelId: interaction.channelId,
          guildId: interaction.guildId
        }
      });
      // Safely send error response - use editReply if we deferred, reply if not, and ignore if interaction expired
      try {
        const errorContent = `❌ **Error during travel command execution:** ${error.message}`;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorContent, flags: [MessageFlags.Ephemeral] });
        } else if (interaction.isRepliable()) {
          await interaction.reply({ content: errorContent, flags: [MessageFlags.Ephemeral] });
        }
      } catch (replyError) {
        // Interaction may have expired (Unknown interaction) - don't rethrow
        console.error(`[travel.js]: Could not send error response to user:`, replyError?.message || replyError);
      }
    }
  }
};

// ============================================================================
// ------------------- Private Helpers -------------------
// ============================================================================

// ------------------- KO Handling -------------------
// Checks if character is KO'd; if so, applies debuff, moves them to recovery village,
// updates database, sends recovery embed, and returns true to abort further travel.
async function checkAndHandleKO(character, channel, startingVillage) {
  if (character.currentHearts <= 0 || character.ko) {
    character.ko = true;

    // Character should always wake up in their starting village when KO'd during travel
    const recoveryVillage = startingVillage;

    character.currentVillage = recoveryVillage;
    character.currentStamina = 0;
    // Calculate debuff end date: midnight EST on the 7th day after KO = 05:00 UTC
    const now = new Date();
    // EST is UTC-5, so midnight EST = 05:00 UTC
    // Get current UTC date, add 7 days, set to 05:00 UTC (midnight EST)
    const debuffEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 5, 0, 0, 0));
    
    character.debuff = {
      active: true,
      endDate: debuffEndDate
    };

    await character.save();

    const koEmbed = new EmbedBuilder()
      .setTitle(`💀 **${character.name} is KO'd!**`)
      .setDescription(
        `**${character.name}** woke up in **${capitalizeFirstLetter(recoveryVillage)}** and needs time to recover from their ordeal.\n\n` +
        `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}\n\n` +
        `🔔 **${character.name}** is out of commission and a debuff has been applied. They will recover in 6 days.`
      )
      .setColor('#FF0000')
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/KORecovery.png')
      .setTimestamp();

    await channel.send({ embeds: [koEmbed] });
    // Log KO travel attempt
    character.travelLog = character.travelLog || [];
    character.travelLog.push({
      from: startingVillage,
      to: character.currentVillage,
      date: new Date(),
      success: false
    });
    await character.save();
    return true;
  }
  return false;
}

// ============================================================================
// ------------------- Process Travel Day -------------------
// ============================================================================
// Handles a single day of travel with encounters, safe days, and user interactions.
// 
// IMPORTANT: Interaction timeout handling
// - Discord interactions expire after 15 minutes
// - Multi-day travel can exceed this limit
// - Collectors are set to 2 minutes (120000ms) to prevent long-running interactions
// - If interactions expire, the system gracefully falls back to "do nothing" actions
// - Error handling ensures travel continues even if interactions fail
// ============================================================================

async function processTravelDay(day, context) {
  try {
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
      mode,
      startingWeather
    } = context;

    // ------------------- Reset Travel Gathering Flag ------------------
    // Reset the travel gathering flag for each new travel day
    // This allows gathering once per travel day, not per real day
    character.travelGathered = false;

    context.boleroOfFireUsedToday = false;
    context.entertainerBoleroActive = false;
    context.entertainerBoleroTriggered = false;


    // ------------------- Mount Travel: Skip Encounters & Gathering -------------------
    // if (mode === 'on mount') {
    //   if (day > totalTravelDuration) {
    //     character.currentVillage = destination;
    //     await character.save();
    //     const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || currentChannel;
    //     const finalChannel = await interaction.client.channels.fetch(finalChannelId);
        
    //     // First embed with mount info
    //     const mountEmbed = new EmbedBuilder()
    //       .setTitle(`✅ Mount Travel Complete!`)
    //       .setDescription(`**${character.name}** has arrived at **${capitalizeFirstLetter(destination)}** by mount!

    // 🥕 **${mount.name}**'s stamina remaining: ${mount.currentStamina}`)
    //       .setColor('#AA926A')
    //       .setTimestamp();
        
    //     // Second embed with arrival image
    //     const imageEmbed = new EmbedBuilder()
    //       .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png')
    //       .setDescription(`🎉 **${character.name}** has arrived safely at **${capitalizeFirstLetter(destination)}**!`);

    //     // Send both embeds in sequence
    //     await finalChannel.send({ embeds: [mountEmbed] });
    //     await finalChannel.send({ embeds: [imageEmbed] });

    //     for (const msg of travelingMessages) {
    //       await msg.delete();
    //     }
    //     return;
    //   }
    //   // Send a simple embed for each travel day
    //   const currentPath = paths[0];
    //   const channelId = PATH_CHANNELS[currentPath];
    //   const channel = savedChannel || await interaction.client.channels.fetch(channelId);
    //   const pathEmoji = pathEmojis[currentPath];
    //   const travelDayEmbed = new EmbedBuilder()
    //     .setTitle(`🐴 Traveling by Mount: Day ${day}`)
    //     .setDescription(`**${character.name}** is traveling safely by mount (${mount.name}) to **${capitalizeFirstLetter(destination)}**.

    // ${pathEmoji || ''} No monsters or gathering today!`)
    //     .setColor('#AA926A')
    //     .setTimestamp();
    //   const travelMsg = await channel.send({ embeds: [travelDayEmbed] });
    //   travelingMessages.push(travelMsg);
    //   await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    //   await processTravelDay(day + 1, { ...context, channel });
    //   return;
    // }

    // ------------------- Check if Journey is Complete -------------------
    if (day > totalTravelDuration) {
      character.currentVillage = destination;
      await character.save();
      const finalChannelId = PATH_CHANNELS[paths[paths.length - 1]] || currentChannel;
      const finalChannel = await interaction.client.channels.fetch(finalChannelId);
    
      // Check destination for blight rain after arrival
      const destinationWeather = await getWeatherWithoutGeneration(destination);
      if (destinationWeather?.special?.label === 'Blight Rain') {
        // Mod characters and Hibiki are immune to blight infection
        const HIBIKI_USER_ID = "668281042414600212";
        if (character.isModCharacter || character.userId === HIBIKI_USER_ID) {
          let immuneMsg;
          if (character.isModCharacter) {
            immuneMsg =
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** arrived in ${capitalizeFirstLetter(destination)} during blight rain, but as a ${character.modTitle} of ${character.modType} they are immune to blight infection! ◈`;
          } else {
            immuneMsg =
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** arrived in ${capitalizeFirstLetter(destination)} during blight rain, and was definitely exposed to it, but somehow avoided being infected... Was it luck? Or something else? ◈`;
          }
          await finalChannel.send({ content: immuneMsg });
        } else if (character.blighted) {
          const alreadyMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
          await finalChannel.send({ content: alreadyMsg });
        } else if (Math.random() < 0.75) {
          // Create fancy blight infection embed
          const blightEmbed = new EmbedBuilder()
            .setColor('#AD1457')
            .setTitle('<:blight_eye:805576955725611058> Blight Infection!')
            .setDescription(`◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈`)
            .addFields(
              {
                name: '🏥 Healing Available',
                value: 'You can be healed by **Oracles, Sages & Dragons**',
                inline: true
              },
              {
                name: '📋 Blight Information',
                value: '[Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)',
                inline: true
              },
              {
                name: '⚠️ STAGE 1',
                value: 'Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.',
                inline: false
              },
              {
                name: '🎲 Daily Rolling',
                value: '**Starting tomorrow, you\'ll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today\'s blight roll if you were just infected.*',
                inline: false
              }
            )
            .setThumbnail(character.icon)
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: 'Blight Infection System', iconURL: 'https://storage.googleapis.com/tinglebot/blight-icon.png' })
            .setTimestamp();

          await finalChannel.send({ embeds: [blightEmbed], ephemeral: false });
          
          // Use shared finalize helper - each step has its own try/catch for resilience
          await finalizeBlightApplication(
            character,
            interaction.user.id,
            {
              client: interaction.client,
              guild: interaction.guild,
              source: `Blight Rain in ${capitalizeFirstLetter(destination)}`,
              alreadySaved: false
            }
          );
          
          // Add to travel log
          context.travelLog.push(`<:blight_eye:805576955725611058> **${character.name}** was infected with blight in **${capitalizeFirstLetter(destination)}**!`);
        } else {
          const safeMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n` +
            "You feel lucky... but be careful out there.";
          await finalChannel.send({ content: safeMsg });
        }
      }

      // Check destination for lightning storm after arrival
      if (destinationWeather?.special?.label === 'Lightning Storm') {
        const lightningStrikeChance = 0.015; // 1.5% chance
        if (Math.random() < lightningStrikeChance) {
          // Character struck by lightning - 1 heart damage
          const { useHearts } = require('../../modules/characterStatsModule');
          await useHearts(character._id, 1, { source: 'lightning_strike' });
          const lightningMsg = `⚡ **LIGHTNING STRIKE!** ⚡\n\nA bolt of lightning strikes ${character.name} directly as they arrive in ${capitalizeFirstLetter(destination)}! The force is overwhelming... (-1 ❤️)`;
          await finalChannel.send({ content: lightningMsg });
        }
      }
      
      // Check starting village for blight rain AFTER successful travel completion
      // This ensures characters are only blighted from starting village if they actually complete the journey
      if (startingWeather?.special?.label === 'Blight Rain') {
        // Mod characters and Hibiki are immune to blight infection
        const HIBIKI_USER_ID = "668281042414600212";
        if (character.isModCharacter || character.userId === HIBIKI_USER_ID) {
          if (character.isModCharacter) {
            const immuneMsg =
              "<:blight_eye:805576955725611058> **Blight Rain at Departure!**\n\n" +
              `◈ Your character **${character.name}** departed from ${capitalizeFirstLetter(startingVillage)} during blight rain, but as a ${character.modTitle} of ${character.modType} they are immune to blight infection! ◈`;
            await finalChannel.send({ content: immuneMsg });
          } else {
            const immuneMsg =
              "<:blight_eye:805576955725611058> **Blight Rain at Departure!**\n\n" +
              `◈ Your character **${character.name}** departed from ${capitalizeFirstLetter(startingVillage)} during blight rain, and was definitely exposed to it, but somehow avoided being infected... Was it luck? Or something else? ◈`;
            await finalChannel.send({ content: immuneMsg });
          }
        } else if (character.blighted) {
          const alreadyMsg =
            "<:blight_eye:805576955725611058> **Blight Rain at Departure!**\n\n" +
            `◈ Your character **${character.name}** departed from ${capitalizeFirstLetter(startingVillage)} during blight rain, but they're already blighted... guess it doesn't matter! ◈`;
          await finalChannel.send({ content: alreadyMsg });
        } else {
          // Check for resistance buffs
          const buffEffects = getActiveBuffEffects(character);
          let infectionChance = 0.75; // Base 75% chance
          
          // Apply resistance buffs
          if (buffEffects && buffEffects.blightResistance > 0) {
            infectionChance -= (buffEffects.blightResistance * 0.1); // Each level reduces by 10%
            console.log(`[travel.js]: 🧪 Starting village blight resistance: ${infectionChance} chance`);
          }
          if (buffEffects && buffEffects.fireResistance > 0) {
            infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
            console.log(`[travel.js]: 🧪 Starting village fire resistance: ${infectionChance - (buffEffects.fireResistance * 0.05)} chance`);
          }
          
          // Consume elixirs after applying their effects
          if (shouldConsumeElixir(character, 'travel', { blightRain: true })) {
            consumeElixirBuff(character);
            // Update character in database
            const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
            await updateFunction(character._id, { buff: character.buff });
          } else if (character.buff?.active) {
            // Log when elixir is not used due to conditions not being met
            console.log(`[travel.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
          }
          
          // Ensure chance stays within reasonable bounds
          infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
          
          if (Math.random() < infectionChance) {
            // Create fancy blight infection embed
            const blightEmbed = new EmbedBuilder()
              .setColor('#AD1457')
              .setTitle('<:blight_eye:805576955725611058> Blight Infection!')
              .setDescription(`◈ Oh no... your character **${character.name}** was exposed to blight rain when departing from **${capitalizeFirstLetter(startingVillage)}** and has been **blighted**! ◈`)
              .addFields(
                {
                  name: '🏥 Healing Available',
                  value: 'You can be healed by **Oracles, Sages & Dragons**',
                  inline: true
                },
                {
                  name: '📋 Blight Information',
                  value: '[Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)',
                  inline: true
                },
                {
                  name: '⚠️ STAGE 1',
                  value: 'Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.',
                  inline: false
                },
                {
                  name: '🎲 Daily Rolling',
                  value: '**Starting tomorrow, you\'ll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today\'s blight roll if you were just infected.*',
                  inline: false
                }
              )
              .setThumbnail(character.icon)
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: 'Blight Infection System', iconURL: 'https://storage.googleapis.com/tinglebot/blight-icon.png' })
              .setTimestamp();

            await finalChannel.send({ embeds: [blightEmbed], ephemeral: false });
            
            // Use shared finalize helper - each step has its own try/catch for resilience
            await finalizeBlightApplication(
              character,
              interaction.user.id,
              {
                client: interaction.client,
                guild: interaction.guild,
                source: `Blight Rain when departing from ${capitalizeFirstLetter(startingVillage)}`,
                alreadySaved: false
              }
            );
            
            // Add to travel log
            context.travelLog.push(`<:blight_eye:805576955725611058> **${character.name}** was infected with blight when departing from **${capitalizeFirstLetter(startingVillage)}**!`);
          } else {
            let safeMsg = "<:blight_eye:805576955725611058> **Blight Rain at Departure!**\n\n";
            
            if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
              safeMsg += `◈ Your character **${character.name}** departed from ${capitalizeFirstLetter(startingVillage)} during blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
              safeMsg += "The protective effects of your elixir kept you safe from the blight.";
              
              // Consume chilly or fireproof elixirs after use
              if (shouldConsumeElixir(character, 'travel', { blightRain: true })) {
                consumeElixirBuff(character);
                // Update character in database
                const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
                await updateFunction(character._id, { buff: character.buff });
                safeMsg += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
              } else if (character.buff?.active) {
                // Log when elixir is not used due to conditions not being met
                console.log(`[travel.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
              }
            } else {
              safeMsg += `◈ Your character **${character.name}** departed from ${capitalizeFirstLetter(startingVillage)} during blight rain but managed to avoid infection this time! ◈\n`;
              safeMsg += "You feel lucky... but be careful out there.";
            }
            
            await finalChannel.send({ content: safeMsg });
          }
        }
      }

      // Check starting village for lightning storm AFTER successful travel completion
      if (startingWeather?.special?.label === 'Lightning Storm') {
        const lightningStrikeChance = 0.015; // 1.5% chance
        if (Math.random() < lightningStrikeChance) {
          // Character struck by lightning - 1 heart damage
          const { useHearts } = require('../../modules/characterStatsModule');
          await useHearts(character._id, 1, { source: 'lightning_strike' });
          const lightningMsg = `⚡ **LIGHTNING STRIKE!** ⚡\n\nA bolt of lightning strikes ${character.name} directly as they depart from ${capitalizeFirstLetter(startingVillage)}! The force is overwhelming... (-1 ❤️)`;
          await finalChannel.send({ content: lightningMsg });
        }
      }
    
      // Filter out "fight: win & loot" logs from final summary
      if (context.scholarTravelGuideActive && !context.scholarTravelGuideTriggered) {
        context.travelLog.push('📚 **Travel Guide** was watching the roads, but there wasn\'t enough time to gather anything on this journey.');
      }
      if (context.entertainerBoleroActive && !context.entertainerBoleroTriggered) {
        context.travelLog.push('🎵 **Bolero of Fire** crackled in the air, warding off trouble before it could find you.');
      }
      const filteredLog = context.travelLog.filter(entry => !entry.startsWith('fight: win & loot'));
      const finalEmbed = createFinalTravelEmbed(character, destination, paths, totalTravelDuration, filteredLog);

      const imageEmbed = new EmbedBuilder()
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/travel.png')
        .setDescription(`🎉 **${character.name} has arrived safely at ${capitalizeFirstLetter(destination)}!**`);
      try {
        await finalChannel.send({ embeds: [finalEmbed] });
        await finalChannel.send({ embeds: [imageEmbed] });
        
        // Assign village visiting role after successful arrival
        await assignVillageVisitingRole(interaction, destination, character);
        // Log travel completion
        character.travelLog = character.travelLog || [];
        character.travelLog.push({
          from: startingVillage,
          to: destination,
          date: new Date(),
          success: true
        });
        await character.save();

        // ------------------- Clear Boost After Travel -------------------
        if (character.boostedBy) {
          const { clearBoostAfterUse } = require('../jobs/boosting');
          await clearBoostAfterUse(character, {
            client: interaction?.client,
            context: 'travel'
          });
        }
      } catch (error) {
        handleInteractionError(error, 'travel.js');
        await finalChannel.send({ content: '⚠️ Unable to display the arrival embed.' });
      }
      // Clean up any remaining traveling messages
      for (const msg of travelingMessages) {
        try {
          if (msg && !msg.deleted && typeof msg.delete === 'function') {
            await msg.delete().catch(() => {
              // Message may have already been deleted, ignore
            });
          }
        } catch (error) {
          // Ignore deletion errors
        }
      }
      return;
    }

    // ------------------- Wrong-Road Validation -------------------
    // Skip wrong-road checks in the designated testing channel and any threads in it
    const isTestingChannelOrThread = currentChannel === TEST_TRAVEL_CHANNEL_ID || interaction.channel?.parentId === TEST_TRAVEL_CHANNEL_ID;
    if (!isTestingChannelOrThread && totalTravelDuration === 2 && character.job && !hasPerk(character, 'DELIVERING')) {
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
      // Check if character has blight stage 3 or higher (monsters don't attack them)
      if (character.blighted && character.blightStage >= 3) {
        // Skip monster encounter for blight stage 3+ characters
        dailyLogEntry += `🧿 No monsters encountered due to blight stage ${character.blightStage}.\n`;
        
        // Delete traveling message immediately after skipping encounter
        try {
          if (travelingMessage && typeof travelingMessage.delete === 'function') {
            await travelingMessage.delete().catch(err => {
              console.warn(`[travel.js]: ⚠️ Could not delete traveling message: ${err.message}`);
            });
          }
        } catch (error) {
          console.warn(`[travel.js]: ⚠️ Error deleting traveling message after blight skip: ${error.message}`);
        }
        
        // Continue to next day
        if (await checkAndHandleKO(character, channel, startingVillage)) return;
        context.travelLog.push(dailyLogEntry);
        await processTravelDay(day + 1, { ...context, channel });
        return;
      } else {
        // ------------------- Monster Encounter -------------------
        const monsters = await getMonstersByPath(currentPath);
        if (monsters.length) {
          const tier = parseInt(getRandomTravelEncounter().split(' ')[1], 10);
          const options = monsters.filter(m => m.tier <= tier);
          const monster = options[Math.floor(Math.random() * options.length)];
          dailyLogEntry += `⚔️ Encountered a ${monster.name}!\n`;

        // Before creating the encounter embed, check if Blood Moon is active
        const isBloodMoon = isBloodMoonActive();
        const encounterEmbed = await createMonsterEncounterEmbed(
          character,
          monster,
          `You encountered a ${monster.name}!\nWhat do you want to do? Fleeing costs 1 🟩 stamina!`,
          character.currentHearts,
          null,
          false, // isBloodMoon
          randomRoll, // adjustedRandomValue
          null, // currentMonster
          null, // totalMonsters
          null, // entertainerBonusItem
          null, // boostCategoryOverride
          null // elixirBuffInfo - not implemented for travel yet
        );
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fight').setLabel('⚔️ Fight').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('flee').setLabel('💨 Flee').setStyle(ButtonStyle.Secondary).setDisabled(character.currentStamina === 0)
        );
        const encounterMessage = await channel.send({ embeds: [encounterEmbed], components: [buttons] });

        // Persist encounter state for failsafe (e.g. bot restart) so Fight/Flee can be resolved
        const encounterKey = `${channel.id}_${encounterMessage.id}`;
        try {
          await TempData.create({
            type: 'travelEncounter',
            key: encounterKey,
            data: {
              userId: interaction.user.id,
              characterId: character._id.toString(),
              monsterName: monster.name,
              currentPath,
              startingVillage,
              pathEmoji,
              travelLog: context.travelLog || []
            },
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
          });
        } catch (saveErr) {
          console.warn(`[travel.js]: ⚠️ Could not save travel encounter state for failsafe: ${saveErr.message}`);
        }
        
        // Delete traveling message immediately after encounter is posted
        try {
          if (travelingMessage && typeof travelingMessage.delete === 'function') {
            await travelingMessage.delete().catch(err => {
              console.warn(`[travel.js]: ⚠️ Could not delete traveling message: ${err.message}`);
            });
          }
        } catch (error) {
          console.warn(`[travel.js]: ⚠️ Error deleting traveling message after encounter: ${error.message}`);
        }
        
        let encounterInteractionProcessed = false; // Flag to prevent multiple interactions
        const collector = encounterMessage.createMessageComponentCollector({ 
          filter: async (i) => {
            if (i.user.id !== interaction.user.id) {
              i.reply({ content: '❌ Only the traveler can interact with these buttons.', ephemeral: true }).catch(() => {});
              return false;
            }
            if (encounterInteractionProcessed) {
              i.reply({ content: '❌ You have already made a choice for this encounter.', ephemeral: true }).catch(() => {});
              return false;
            }
            // Claim this interaction so recovery handler (componentHandler) won't also handle it
            try {
              await TempData.findOneAndDelete({ type: 'travelEncounter', key: `${i.channelId}_${i.message?.id}` });
            } catch (_) { /* ignore */ }
            return true;
          },
          time: 120000 // Reduced from 300000 (5 min) to 120000 (2 min)
        });

        collector.on('collect', async i => {
          if (encounterInteractionProcessed) {
            return; // Prevent multiple interactions
          }
          encounterInteractionProcessed = true; // Mark interaction as processed
          
          // Immediately disable buttons to prevent additional clicks
          const disabledButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('fight').setLabel('⚔️ Fight').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('flee').setLabel('💨 Flee').setStyle(ButtonStyle.Secondary).setDisabled(true)
          );
          await encounterMessage.edit({ components: [disabledButtons] }).catch(console.error);
          
          try {
            // In case recovery path or duplicate event already responded, don't throw
            try {
              await i.deferUpdate();
            } catch (deferErr) {
              const alreadyReplied = deferErr.code === 'InteractionAlreadyReplied' || deferErr.name === 'InteractionAlreadyReplied';
              if (alreadyReplied || deferErr.code === 10062 || deferErr.code === 10008) return;
              throw deferErr;
            }
            const decision = await handleTravelInteraction(
              i,
              character,
              pathEmoji,
              currentPath,
              encounterMessage,
              monster,
              context.travelLog,
              startingVillage,
              undefined,
              context
            );
            // Only append the decision to the daily log if it's not a damage message
            if (!decision.includes('heart')) {
              dailyLogEntry += `${decision}\n`;
            } else {
              // Add damage message to the current day's log
              dailyLogEntry += `${decision}\n`;
            }
            collector.stop();
          } catch (error) {
            console.error(`[travel.js]: ❌ Error handling monster encounter interaction:`, error);
            dailyLogEntry += `❌ An error occurred during the encounter.\n`;
            collector.stop();
          }
        });
        
        collector.on('end', async (collected, reason) => {
          try {
            if (reason === 'time') {
              console.log(`[travel.js]: ⏰ Monster encounter timeout on day ${day}`);
              const decision = await handleTravelInteraction(
                { customId: 'do_nothing' },
                character,
                pathEmoji,
                currentPath,
                encounterMessage,
                monster,
                context.travelLog,
              startingVillage,
              undefined,
              context
              );
          
              dailyLogEntry += decision.split('\n').map(line => `${line}`).join('\n') + '\n';
            }
            if (await checkAndHandleKO(character, channel, startingVillage)) return;
            context.travelLog.push(dailyLogEntry);
            await processTravelDay(day + 1, { ...context, channel });
          } catch (error) {
            console.error(`[travel.js]: ❌ Error in monster encounter collector end:`, error);
            // Continue with travel even if there's an error
            if (await checkAndHandleKO(character, channel, startingVillage)) return;
            context.travelLog.push(dailyLogEntry);
            await processTravelDay(day + 1, { ...context, channel });
          }
        });
        } else {
          // No monsters available for this path
          dailyLogEntry += `⚠️ No monsters found on this path.\n`;
          
          // Delete traveling message
          try {
            if (travelingMessage && typeof travelingMessage.delete === 'function') {
              await travelingMessage.delete().catch(err => {
                console.warn(`[travel.js]: ⚠️ Could not delete traveling message: ${err.message}`);
              });
            }
          } catch (error) {
            console.warn(`[travel.js]: ⚠️ Error deleting traveling message after empty monsters: ${error.message}`);
          }
          
          // Continue to next day
          if (await checkAndHandleKO(character, channel, startingVillage)) return;
          context.travelLog.push(dailyLogEntry);
          await processTravelDay(day + 1, { ...context, channel });
        } // Close the else block for blight stage 3 check
      }
    } else {
      // ------------------- Safe Day of Travel -------------------
      // Check for chest discovery (20% chance)
      const chestFound = Math.random() < 0.2;
      context.chestFound = chestFound;
      
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
      
      // Update embed description if chest was found
      if (chestFound) {
        const currentDescription = safeEmbed.data.description || '';
        // Add chest option to the description
        const updatedDescription = currentDescription.replace(
          '- 💤 Do nothing (move onto the next day)',
          '- 💤 Do nothing (move onto the next day)\n- 🎁 Open a chest! (costs 1 🟩 stamina)'
        );
        safeEmbed.setDescription(updatedDescription);
      }
      
      const safeMessage = await channel.send({ embeds: [safeEmbed] });
      
      // Delete traveling message immediately after safe day embed is posted
      try {
        if (travelingMessage && typeof travelingMessage.delete === 'function') {
          await travelingMessage.delete().catch(err => {
            console.warn(`[travel.js]: ⚠️ Could not delete traveling message: ${err.message}`);
          });
        }
      } catch (error) {
        console.warn(`[travel.js]: ⚠️ Error deleting traveling message after safe day: ${error.message}`);
      }
      
      // Build buttons array
      const buttonComponents = [
        new ButtonBuilder().setCustomId('recover').setLabel('💖 Recover a Heart').setStyle(ButtonStyle.Primary).setDisabled(character.currentHearts >= character.maxHearts || character.currentStamina === 0),
        new ButtonBuilder().setCustomId('gather').setLabel('🌿 Gather').setStyle(ButtonStyle.Success).setDisabled(character.currentStamina === 0),
        new ButtonBuilder().setCustomId('do_nothing').setLabel('✨ Do Nothing').setStyle(ButtonStyle.Secondary)
      ];
      
      // Add "Open Chest!" button if chest was found
      if (chestFound) {
        buttonComponents.push(
          new ButtonBuilder().setCustomId('open_chest').setLabel('🎁 Open Chest!').setStyle(ButtonStyle.Primary).setDisabled(character.currentStamina === 0)
        );
      }
      
      const buttons = new ActionRowBuilder().addComponents(buttonComponents);
      await safeMessage.edit({ embeds: [safeEmbed], components: [buttons] });

      let interactionProcessed = false; // Flag to prevent multiple interactions
      const collector = safeMessage.createMessageComponentCollector({ 
        filter: i => {
          if (i.user.id !== interaction.user.id) {
            i.reply({ content: '❌ Only the traveler can interact with these buttons.', ephemeral: true });
            return false;
          }
          if (interactionProcessed) {
            i.reply({ content: '❌ You have already made a choice for this day.', ephemeral: true });
            return false;
          }
          return true;
        }, 
        time: 120000 // Reduced from 300000 (5 min) to 120000 (2 min)
      });
      collector.on('collect', async i => {
        if (interactionProcessed) {
          return; // Prevent multiple interactions
        }
        interactionProcessed = true; // Mark interaction as processed
        
        // Immediately disable buttons to prevent additional clicks
        const disabledButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('recover').setLabel('💖 Recover a Heart').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId('gather').setLabel('🌿 Gather').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('do_nothing').setLabel('✨ Do Nothing').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await safeMessage.edit({ components: [disabledButtons] }).catch(console.error);
        
        try {
          const decision = await handleTravelInteraction(
            i,
            character,
            pathEmoji,
            currentPath,
            safeMessage,
            null,
            context.travelLog,
            startingVillage,
            i.customId === 'do_nothing' ? doNothingFlavor : undefined,
            context
          );    
          dailyLogEntry += `${decision}\n`;
          const updated = new EmbedBuilder(safeMessage.embeds[0].toJSON()).setDescription(
            `🌸 It's a safe day of travel. What do you want to do next?\n> ${decision}\n\n` +
            `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
            `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
          );
          await safeMessage.edit({ embeds: [updated], components: [] });
          collector.stop();
        } catch (error) {
          console.error(`[travel.js]: ❌ Error handling safe day interaction:`, error);
          dailyLogEntry += `❌ An error occurred during the safe day.\n`;
          collector.stop();
        }
      });

      collector.on('end', async (collected, reason) => {
        try {
          if (reason === 'time') {
            console.log(`[travel.js]: ⏰ Safe day timeout on day ${day}`);
            const decision = await handleTravelInteraction(
              { customId: 'do_nothing' },
              character,
              pathEmoji,
              currentPath,
              safeMessage,
              null,
              context.travelLog,
              startingVillage,
              doNothingFlavor,
              context
            );
            dailyLogEntry += `${decision}\n`;
          }
        
          if (await checkAndHandleKO(character, channel, startingVillage)) return;
        
          context.travelLog.push(dailyLogEntry);

          await processTravelDay(day + 1, { ...context, channel });
        } catch (error) {
          console.error(`[travel.js]: ❌ Error in safe day collector end:`, error);
          // Continue with travel even if there's an error
          if (await checkAndHandleKO(character, channel, startingVillage)) return;
          context.travelLog.push(dailyLogEntry);
          await processTravelDay(day + 1, { ...context, channel });
        }
      });
    }
  } catch (error) {
    handleInteractionError(error, 'travel.js (processTravelDay)', {
      commandName: 'travel',
      userTag: context.interaction?.user?.tag,
      userId: context.interaction?.user?.id,
      characterName: context.character?.name,
      options: {
        day,
        startingVillage: context.startingVillage,
        destination: context.destination,
        mode: context.mode,
        currentPath: context.paths?.[0],
        totalDays: context.totalTravelDuration
      }
    });
    console.error(`[travel.js]: ❌ Error in processTravelDay:`, {
      error: error.message,
      stack: error.stack,
      context: {
        day,
        characterName: context.character?.name,
        userTag: context.interaction?.user?.tag,
        userId: context.interaction?.user?.id,
        startingVillage: context.startingVillage,
        destination: context.destination,
        mode: context.mode,
        currentPath: context.paths?.[0]
      }
    });
    throw error; // Re-throw to be caught by the execute function
  }
} 

// ------------------- Check Severe Weather -------------------
// Checks if the current weather conditions are too severe for travel
async function checkSevereWeather(village) {
  try {
    const weather = await getWeatherWithoutGeneration(village);
    if (!weather) {
      return false;
    }

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
    handleInteractionError(error, 'travel.js (checkSevereWeather)', {
      commandName: 'travel',
      options: {
        village,
        weather: weather?.special?.label
      }
    });
    return { blocked: false };
  }
} 