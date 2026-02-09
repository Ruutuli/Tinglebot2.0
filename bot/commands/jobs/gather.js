// ============================================================================
// ------------------- Gather Command Module -------------------
// ============================================================================
// This module handles the gathering of items based on the character's job and location.

// ============================================================================
// ------------------- Discord.js Components -------------------
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ------------------- Database Services -------------------
// ============================================================================
const { fetchCharacterByNameAndUserId, fetchAllItems, fetchItemsByMonster, fetchAllMonsters, fetchItemByName } = require('@/database/db.js');
const { Village } = require('@/models/VillageModel');

// ============================================================================
// ------------------- Modules -------------------
// ============================================================================
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule.js');
const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
const { getEncounterOutcome } = require('../../modules/encounterModule.js');
const { getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule.js');
const { getVillageRegionByName } = require('../../modules/locationsModule.js');
const { useHearts, handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
const { capitalizeWords } = require('../../modules/formattingModule.js');
const logger = require('@/utils/logger.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule.js');
const { applyGatheringBoost } = require('../../modules/boostIntegration');
const { clearBoostAfterUse } = require('./boosting');

// ============================================================================
// ------------------- Utilities -------------------
// ============================================================================
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { checkInventorySync } = require('@/utils/characterUtils');
const { enforceJail } = require('@/utils/jailCheck');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
// Google Sheets functionality removed

// ============================================================================
// ------------------- Services -------------------
// ============================================================================
const { getWeatherWithoutGeneration } = require('@/services/weatherService');

// ============================================================================
// ------------------- Embeds -------------------
// ============================================================================
const { createGatherEmbed, createMonsterEncounterEmbed, createKOEmbed } = require('../../embeds/embeds.js');

// ============================================================================
// ------------------- Models -------------------
// ============================================================================
const User = require('@/models/UserModel.js');

// ============================================================================
// ------------------- Blight Handler -------------------
// ============================================================================
const { finalizeBlightApplication } = require('../../handlers/blightHandler');

// ============================================================================
// ------------------- Scripts -------------------
// ============================================================================
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');

// ============================================================================
// ------------------- Village Channels -------------------
// ============================================================================
// Define the allowed channels for each village.
const villageChannels = {
  Inariko: process.env.INARIKO_TOWNHALL,
  Rudania: process.env.RUDANIA_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL,
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Daily Roll Functions ------------------
// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity, userId) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  // Special case for test characters
  if (character.name === 'Tingle test' || character.name === 'Tingle' || character.name === 'John') {
    return true;
  }

  const now = new Date();
  // Compute the most recent 13:00 UTC (8am EST) rollover
  const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));
  if (now < rollover) {
    // If before today's 13:00 UTC, use yesterday's 13:00 UTC
    rollover.setUTCDate(rollover.getUTCDate() - 1);
  }

  // Check both gather and loot activities since they share the same daily limit
  const lastGatherRoll = character.dailyRoll?.get('gather');
  const lastLootRoll = character.dailyRoll?.get('loot');
  
  if (!lastGatherRoll && !lastLootRoll) {
    return true;
  }

  const lastGatherDate = lastGatherRoll ? new Date(lastGatherRoll) : null;
  const lastLootDate = lastLootRoll ? new Date(lastLootRoll) : null;
  
  // If either activity was used today, deny the action
  if (lastGatherDate && lastGatherDate >= rollover) {
    return false;
  }
  if (lastLootDate && lastLootDate >= rollover) {
    return false;
  }

  return true;
}

// Update the daily roll timestamp for an activity
async function updateDailyRoll(character, activity) {
  try {
    if (!character.dailyRoll) {
      character.dailyRoll = new Map();
    }
    const now = new Date().toISOString();
    character.dailyRoll.set(activity, now);
    character.markModified('dailyRoll'); // Required for Mongoose to track Map changes
    await character.save();
  } catch (error) {
    logger.error('GATHER', `Failed to update daily roll for ${character.name}: ${error.message}`, error);
    throw error;
  }
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================
// Define the slash command for gathering.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gather')
    .setDescription('Gather items based on your character\'s job and location')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ============================================================================
  // ------------------- Command Execution Logic -------------------
  // ============================================================================
  async execute(interaction) {
    // Initialize variables at the top of the function
    let job;
    let region;
    let currentVillage;
    let hasResponded = false;

    // ------------------- Capture User Info Early ------------------
    // Capture user information before any operations that might fail
    const userInfo = {
      userId: interaction.user?.id || 'unknown',
      userTag: interaction.user?.tag || 'unknown',
      characterName: interaction.options?.getString('charactername') || 'unknown'
    };

    // ------------------- Helper Function: Safe Reply ------------------
    // Helper function to safely respond to interaction
    const safeReply = async (content, options = {}) => {
      try {
        // Check if interaction is still valid
        if (!interaction.isRepliable()) {
          logger.warn('GATHER', 'Interaction not repliable');
          return;
        }
        
        if (hasResponded || interaction.replied || interaction.deferred) {
          await interaction.editReply(content);
        } else {
          await interaction.reply(content);
          hasResponded = true;
        }
      } catch (error) {
        if (error.code === 10062) {
          // Interaction has expired, try followUp instead
          try {
            await interaction.followUp(content);
          } catch (followUpError) {
            logger.error('GATHER', 'Failed to send followUp message');
          }
        } else {
          throw error;
        }
      }
    };

    try {
      // Check if interaction is still valid before proceeding
      if (!interaction.isRepliable()) {
        logger.warn('GATHER', 'Interaction not repliable');
        return;
      }
      
      // Defer the reply immediately to prevent interaction timeout
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      let character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      
      // If not found as regular character, try as mod character
      if (!character) {
        const { fetchModCharacterByNameAndUserId } = require('@/database/db');
        character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
      }
      
      if (!character) {
        await safeReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check inventory sync before proceeding (no longer required, but kept for compatibility)
      await checkInventorySync(character);

      // Initialize job variable
      job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;

      // Check for KO status
      if (character.currentHearts === 0) {
        const embed = createKOEmbed(character);
        await safeReply({ embeds: [embed] });
        return;
      }

      // Check for blight stage 4 effect (no gathering)
      if (character.blightEffects?.noGathering) {
        await safeReply({
          content: `❌ **${character.name}** cannot gather items due to advanced blight stage.`,
          flags: 64
        });
        return;
      }

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // Check if the character is KOed.
      if (character.ko) {
        const embed = createKOEmbed(
          character,
          `> ${character.name} is currently KOed and cannot gather.\n> 💤 Let them rest and recover before gathering again.`
        );
        await safeReply({ embeds: [embed] });
        return;
      }

      // Check if the character is debuffed.
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
          const { createGatherDebuffEmbed } = require('../../embeds/embeds.js');
          const debuffEmbed = createGatherDebuffEmbed(character);
          
          await safeReply({
            embeds: [debuffEmbed],
            flags: 64,
          });
          return;
        }
      }

      // ------------------- Step 3: Validate Job ------------------
      if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
        await safeReply({
          content: getJobVoucherErrorMessage('MISSING_SKILLS', {
            characterName: character.name,
            jobName: job || "None"
          }).message,
          flags: 64,
        });
        return;
      }

      // Check for gathering perk.
      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        await safeReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `${character.name} can't gather as a ${capitalizeWords(job)} because they lack the necessary gathering skills.`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Job Skill Check'
            }
          }],
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 2: Validate Interaction Channel ------------------
      currentVillage = capitalizeWords(character.currentVillage);
      let allowedChannel = villageChannels[currentVillage];

      // If using a job voucher for a village-exclusive job, override to required village
      if (character.jobVoucher && character.jobVoucherJob) {
        const voucherPerk = getJobPerk(character.jobVoucherJob);
        if (voucherPerk && voucherPerk.village) {
          const requiredVillage = capitalizeWords(voucherPerk.village);
          currentVillage = requiredVillage;
          allowedChannel = villageChannels[requiredVillage];
        }
      }

      // Allow testing in specific channel
      const testingChannelId = '1391812848099004578';
      const isTestingChannel = interaction.channelId === testingChannelId;

      // Check if character is physically in the correct village (skip for testing channel)
      const channelVillage = Object.entries(villageChannels).find(([_, id]) => id === interaction.channelId)?.[0];
      if (channelVillage && character.currentVillage.toLowerCase() !== channelVillage.toLowerCase() && !isTestingChannel) {
        await safeReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} looks around confused...*\n\n**Wrong Village Location**\nYou must be physically present in ${channelVillage} to gather here.\n\n🗺️ **Current Location:** ${capitalizeWords(character.currentVillage)}`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Location Check'
            }
          }],
          flags: 64
        });
        return;
      }

      if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
        const channelMention = `<#${allowedChannel}>`;
        await safeReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(character.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Channel Restriction'
            }
          }],
          flags: 64,
        });
        return;
      }

      // ------------------- Blight Rain Infection Check ------------------
      const weatherData = await getWeatherWithoutGeneration(character.currentVillage);
      
      // Store blight rain message to add to gather response
      let blightRainMessage = null;
      
      if (weatherData?.special?.label === 'Blight Rain') {
        // Mod characters and Hibiki are immune to blight infection
        const HIBIKI_USER_ID = "668281042414600212";
        if (character.isModCharacter || character.userId === HIBIKI_USER_ID) {
          if (character.isModCharacter) {
            blightRainMessage = 
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
          } else {
            blightRainMessage = 
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** was definitely in the blight rain, but somehow avoided being infected... Was it luck? Or something else? ◈`;
          }
        } else if (character.blighted) {
          blightRainMessage = 
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
        } else {
          // Check for resistance buffs
          const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
          const buffEffects = getActiveBuffEffects(character);
          let infectionChance = 0.75; // Base 75% chance
          
          // Apply resistance buffs
          if (buffEffects && buffEffects.blightResistance > 0) {
            infectionChance -= (buffEffects.blightResistance * 0.3); // Each level reduces by 30%
          }
          if (buffEffects && buffEffects.fireResistance > 0) {
            infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
          }
          
          // Consume elixirs after applying their effects
          if (shouldConsumeElixir(character, 'gather', { blightRain: true })) {
            consumeElixirBuff(character);
            // Update character in database
            const { updateCharacterById, updateModCharacterById } = require('@/database/db.js');
            const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
            await updateFunction(character._id, { buff: character.buff });
          }
          
          // Ensure chance stays within reasonable bounds
          infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
          
          const infectionRoll = Math.random();
          
          if (infectionRoll < infectionChance) {
            blightRainMessage = 
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
              "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
              "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
              "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
              "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
            // Use shared finalize helper - each step has its own try/catch for resilience
            await finalizeBlightApplication(
              character,
              interaction.user.id,
              {
                client: interaction.client,
                guild: interaction.guild,
                source: 'Blight Rain during gathering',
                alreadySaved: false
              }
            );
          } else {
            blightRainMessage = "<:blight_eye:805576955725611058> **Blight Rain!**\n\n";
            
            if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
              blightRainMessage += `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
              blightRainMessage += "The protective effects of your elixir kept you safe from the blight.";
              
              // Consume chilly or fireproof elixirs after use
              if (shouldConsumeElixir(character, 'gather', { blightRain: true })) {
                consumeElixirBuff(character);
                // Update character in database
                const { updateCharacterById, updateModCharacterById } = require('@/database/db.js');
                const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
                await updateFunction(character._id, { buff: character.buff });
                blightRainMessage += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
              }
            } else {
              blightRainMessage += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
              blightRainMessage += "You feel lucky... but be careful out there.";
            }
            
          }
        }
      }

      // ------------------- Lightning Storm Strike Check ------------------
      let lightningStrikeMessage = null;
      if (weatherData?.special?.label === 'Lightning Storm') {
        const lightningStrikeChance = 0.015; // 1.5% chance
        if (Math.random() < lightningStrikeChance) {
          // Character struck by lightning - 1 heart damage
          const { useHearts } = require('../../modules/characterStatsModule');
          await useHearts(character._id, 1, { source: 'lightning_strike' });
          lightningStrikeMessage = `⚡ **LIGHTNING STRIKE!** ⚡\n\nA bolt of lightning strikes ${character.name} directly! The force is overwhelming... (-1 ❤️)`;
        }
      }

      // ------------------- Daily Roll Check ------------------
      // Check for job voucher and daily roll AFTER job validation
      if (character.jobVoucher || character.isModCharacter) {
        // Job voucher is active or mod character - no need for daily roll check
      } else {
        // Check if gather has been used today
        const canGather = canUseDailyRoll(character, 'gather', interaction.user.id);
        
        if (!canGather) {
          const nextRollover = new Date();
          nextRollover.setUTCHours(13, 0, 0, 0); // 8AM EST = 13:00 UTC
          if (nextRollover < new Date()) {
            nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
          }
          const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
          
          await safeReply({
            embeds: [{
              color: 0x008B8B, // Dark cyan color
              description: `*${character.name} seems exhausted from their earlier gathering...*\n\n**Daily gathering limit reached.**\nThe next opportunity to gather will be available at <t:${unixTimestamp}:F>.\n\n*Tip: A job voucher would allow you to gather again today.*`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Daily Activity Limit'
              }
            }],
            flags: 64,
          });
          return;
        }
      }

      // ------------------- Step 5: Validate Region ------------------
      region = getVillageRegionByName(currentVillage);
      if (!region) {
        await safeReply({
          content: `❌ **No valid region found for the village ${currentVillage}.**\n📍 **Please check the character's current location and try again.**`,
        });
        return;
      }

      // ------------------- Fetch Village Level ------------------
      // Fetch village level for gathering bonuses (default to 1 if village not found)
      let villageLevel = 1;
      try {
        const village = await Village.findOne({ name: { $regex: `^${currentVillage}$`, $options: 'i' } });
        if (village && village.level) {
          villageLevel = village.level;
          logger.info('GATHER', `🏘️ Village level for ${currentVillage}: ${villageLevel} (affects rarity weights and quantity bonuses)`);
        } else {
          logger.warn('GATHER', `Village ${currentVillage} not found, defaulting to level 1 (no bonuses)`);
        }
      } catch (error) {
        logger.error('GATHER', `Error fetching village level for ${currentVillage}:`, error);
        // Default to level 1 on error
      }

      // ------------------- Helper Functions ------------------
      // Helper function to generate outcome messages
      function generateOutcomeMessage(outcome) {
        // Handle damage outcomes (including KO)
        if (outcome.hearts && outcome.hearts > 0) {
          return outcome.result === "KO"
            ? generateDamageMessage("KO")
            : generateDamageMessage(outcome.hearts);
        }
        
        // Handle defense success (blocked attack)
        if (outcome.defenseSuccess) {
          return generateDefenseBuffMessage(
            outcome.defenseSuccess,
            outcome.adjustedRandomValue,
            outcome.damageValue
          );
        }
        
        // Handle attack success (critical hit)
        if (outcome.attackSuccess) {
          return generateAttackBuffMessage(
            outcome.attackSuccess,
            outcome.adjustedRandomValue,
            outcome.damageValue
          );
        }
        
        // Handle victory outcomes
        if (outcome.result === "Win!/Loot" || outcome.result === "Win!/Loot (1HKO)") {
          return generateVictoryMessage(
            outcome.adjustedRandomValue,
            outcome.defenseSuccess,
            outcome.attackSuccess
          );
        }
        
        // Handle other specific result types
        if (outcome.result && typeof outcome.result === 'string') {
          // If the result contains damage information, try to extract it
          if (outcome.result.includes('HEART(S)')) {
            const heartMatch = outcome.result.match(/(\d+)\s*HEART\(S\)/);
            if (heartMatch) {
              const heartCount = parseInt(heartMatch[1]);
              return generateDamageMessage(heartCount);
            }
          }
          
          // If the result is a mod character victory message, return it directly
          if (outcome.result.includes('divine power') || outcome.result.includes('legendary prowess') || 
              outcome.result.includes('ancient') || outcome.result.includes('divine authority')) {
            return outcome.result;
          }
        }
        
        // Fallback: generate a generic outcome message
        return generateFinalOutcomeMessage(
          outcome.damageValue || 0,
          outcome.defenseSuccess || false,
          outcome.attackSuccess || false,
          outcome.adjustedRandomValue || 0,
          outcome.damageValue || 0
        );
      }

      // Helper function to generate looted items
      async function generateLootedItem(encounteredMonster, weightedItems) {
        // Use weighted random selection for loot
        const totalWeight = weightedItems.reduce((sum, item) => sum + (item.weight || 1), 0);
        const randomWeight = Math.random() * totalWeight;
        let currentWeight = 0;
        let selectedItem = null;
        
        for (const item of weightedItems) {
          currentWeight += item.weight || 1;
          if (randomWeight <= currentWeight) {
            selectedItem = item;
            break;
          }
        }
        
        // Fallback to uniform selection if weighted selection fails
        if (!selectedItem) {
          const randomIndex = Math.floor(Math.random() * weightedItems.length);
          selectedItem = weightedItems[randomIndex];
        }
        
        const lootedItem = { ...selectedItem };
        if (encounteredMonster.name.includes('Chuchu')) {
          const jellyType = determineJellyType(encounteredMonster.name);
          const quantity = determineJellyQuantity(encounteredMonster.name);
          lootedItem.itemName = jellyType;
          lootedItem.quantity = quantity;
          
          // Fetch the correct emoji from the database for the jelly type
          try {
            const ItemModel = require('@/models/ItemModel');
            const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select('emoji');
            if (jellyItem && jellyItem.emoji) {
              lootedItem.emoji = jellyItem.emoji;
            }
          } catch (error) {
            logger.error('GATHER', `Error fetching emoji for ${jellyType}`);
            // Keep the original emoji if there's an error
          }
        } else {
          lootedItem.quantity = 1;
        }
        return lootedItem;
      }

      // Helper function to determine jelly type
      function determineJellyType(monsterName) {
        if (monsterName.includes('Ice')) return 'White Chuchu Jelly';
        if (monsterName.includes('Fire')) return 'Red Chuchu Jelly';
        if (monsterName.includes('Electric')) return 'Yellow Chuchu Jelly';
        return 'Chuchu Jelly';
      }

      // Helper function to determine jelly quantity
      function determineJellyQuantity(monsterName) {
        if (monsterName.includes('Large')) return 3;
        if (monsterName.includes('Medium')) return 2;
        return 1;
      }

      // ------------------- Encounter Determination ------------------
      const randomChance = Math.random();
      const bloodMoonActive = isBloodMoonActive();

      // If Blood Moon is active and chance triggers a monster encounter (25% chance)
      if (bloodMoonActive && randomChance < 0.25) {
        // Check if character has blight stage 3 or higher (monsters don't attack them)
        if (character.blighted && character.blightStage >= 3) {
          // Continue with gathering instead of monster encounter
        } else {
          const allMonsters = await fetchAllMonsters();
          const monstersByRegion = allMonsters.filter(
            monster => monster[region.toLowerCase()] && monster.tier >= 1 && monster.tier <= 4
          );
          if (monstersByRegion.length > 0) {
            const encounteredMonster = monstersByRegion[Math.floor(Math.random() * monstersByRegion.length)];
            // Consume daily roll only when we actually start an encounter
            try {
              await updateDailyRoll(character, 'gather');
            } catch (error) {
              logger.error('GATHER', 'Failed to update daily roll (encounter path)');
              await safeReply({
                content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
                flags: 64,
              });
              return;
            }
          const diceRoll = Math.floor(Math.random() * 100) + 1;
          const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
          const outcome = await getEncounterOutcome(
            character,
            encounteredMonster,
            damageValue,
            adjustedRandomValue,
            attackSuccess,
            defenseSuccess
          );
          // Hearts are already applied inside getEncounterOutcome; fetch fresh value
          const refreshedCharacter = await fetchCharacterByNameAndUserId(character.name, interaction.user.id);
          const heartsRemaining = Math.max(
            0,
            refreshedCharacter?.currentHearts ?? (character.currentHearts - (outcome.hearts || 0))
          );
          let outcomeMessage = generateOutcomeMessage(outcome);
          // Ensure we can forward an Entertainer bonus item into the encounter embed
          let entertainerBonusForEmbed = null;

          // ------------------- Apply Entertainer Bonus During Monster Encounter ------------------
          // If boosted by an Entertainer, still grant the gathering bonus item even on encounter
          try {
            if (character.boostedBy) {
              const { fetchCharacterByName } = require('@/database/db');
              const boosterCharacter = await fetchCharacterByName(character.boostedBy);
              const isEntertainerBoost = boosterCharacter &&
                (boosterCharacter.job === 'Entertainer' || boosterCharacter.job?.toLowerCase() === 'entertainer');

              if (isEntertainerBoost) {
                const itemsForBonus = await fetchAllItems();
                const jobNormalized = normalizeJobName(job);
                const regionKeyForBonus = region.toLowerCase();

                // ItemModel: gathering (Boolean), allJobs ([String]), region keys (e.g. eldin, faron, lanayru)
                const availableForBonus = itemsForBonus.filter(item => {
                  if (item.gathering !== true) return false;
                  const isJobMatch = item.allJobs?.some(j => normalizeJobName(j) === jobNormalized) || false;
                  const isRegionMatch = item[regionKeyForBonus] === true;
                  return isJobMatch && isRegionMatch;
                });

                const entertainerItems = await applyGatheringBoost(character.name, availableForBonus);
                // Entertainer boosts augment (not replace) the filtered pool—fallback to the
                // original selection if no dedicated bonus items are configured.
                let entertainerBonusPool = Array.isArray(entertainerItems) && entertainerItems.length > 0
                  ? entertainerItems
                  : availableForBonus;

                // Defensive filter: Remove weapons from bonus pool
                entertainerBonusPool = entertainerBonusPool.filter((item) => {
                  if (item.categoryGear === 'Weapon') return false;
                  if (Array.isArray(item.category) && item.category.includes('Weapon')) return false;
                  return true;
                });

                if (entertainerBonusPool.length > 0) {
                  const bonusIndex = Math.floor(Math.random() * entertainerBonusPool.length);
                  const bonusItem = entertainerBonusPool[bonusIndex];

                  await addItemInventoryDatabase(
                    character._id,
                    bonusItem.itemName,
                    1,
                    interaction,
                    'Gathering (Entertainer Bonus)'
                  );

                  // Store bonus item to show in the encounter embed (gather-style presentation)
                  entertainerBonusForEmbed = bonusItem;

                  // Clear used boost to match normal gathering behavior
                  await clearBoostAfterUse(character, {
                    client: interaction.client,
                    context: 'gathering (encounter bonus)'
                  });
                }
              }
            }
          } catch (bonusError) {
            // Non-fatal: log but do not interrupt the encounter flow
            handleInteractionError(bonusError, 'gather.js', {
              commandName: '/gather',
              operation: 'applyEntertainerBonusDuringEncounter',
              userId: interaction.user.id,
              characterName: character.name
            });
          }

          if (outcome.canLoot && !outcome.hearts) {
            const items = await fetchItemsByMonster(encounteredMonster.name);
            const weightedItems = createWeightedItemList(items, adjustedRandomValue);
            if (weightedItems.length > 0) {
              const lootedItem = await generateLootedItem(encounteredMonster, weightedItems);
              await addItemInventoryDatabase(
                character._id,
                lootedItem.itemName,
                lootedItem.quantity,
                interaction,
                "Looted"
              );
              // Note: Google Sheets sync is handled by addItemInventoryDatabase

              const embed = await createMonsterEncounterEmbed(
                character,
                encounteredMonster,
                outcomeMessage,
                heartsRemaining,
                lootedItem, // lootItem - FIX: Pass the actual looted item instead of null
                bloodMoonActive,
                null, // adjustedRandomValue
                null, // currentMonster
                null, // totalMonsters
                entertainerBonusForEmbed || null, // entertainerBonusItem
                'Gathering', // boostCategoryOverride
                null // elixirBuffInfo - not implemented for gather yet
              );
              await safeReply({ embeds: [embed] });
              return;
            }
          }
          const embed = await createMonsterEncounterEmbed(
            character,
            encounteredMonster,
            outcomeMessage,
            heartsRemaining,
            null,
            bloodMoonActive,
            null,
            null,
            null,
            null,
            'Gathering'
          );
          await safeReply({ embeds: [embed] });
          return;
        } else {
          await safeReply({
            content: `⚠️ **No monsters found in the ${region} region during the Blood Moon.**`,
          });
          return;
        }
        } // Close the else block for blight stage 3 check
      } else {

        
        // ------------------- Normal Gathering Logic ------------------
        const items = await fetchAllItems();
        
        // ------------------- Apply Scholar Boost (Cross-Region Gathering) ------------------
        // Check if character is boosted and handle Scholar boost for cross-region gathering
        let gatheringRegion = region;
        let boosterCharacter = null;
        let scholarTargetVillage = null;
        
        if (character.boostedBy) {
          const { fetchCharacterByName } = require('@/database/db');
          boosterCharacter = await fetchCharacterByName(character.boostedBy);
          
                     // Handle Scholar boost (cross-region gathering) before filtering items
           if (boosterCharacter && boosterCharacter.job?.toLowerCase() === 'scholar') {
             // Get the boost data to find the target village
             const { retrieveBoostingRequestFromTempDataByCharacter } = require('./boosting');
             const boostData = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
             
             logger.info('BOOST', `Scholar boost detected for ${character.name}`);
             
             if (boostData && boostData.targetVillage) {
               scholarTargetVillage = boostData.targetVillage;
               gatheringRegion = scholarTargetVillage;
               logger.info('BOOST', `Target village: ${scholarTargetVillage}`);
               
               // Fetch target village level for bonuses (use target village level instead of current village)
               try {
                 const targetVillage = await Village.findOne({ name: { $regex: `^${scholarTargetVillage}$`, $options: 'i' } });
                 if (targetVillage && targetVillage.level) {
                   villageLevel = targetVillage.level;
                   logger.info('GATHER', `🏘️ Scholar boost: Using target village level ${villageLevel} for ${scholarTargetVillage} (affects rarity weights and quantity bonuses)`);
                 }
               } catch (error) {
                 logger.error('GATHER', `Error fetching target village level for Scholar boost:`, error);
               }
             } else {
               logger.warn('BOOST', 'No targetVillage in boostData');
             }
           }
        }
        
        // Convert village name to region for proper item filtering (only once)
        let regionKey = gatheringRegion.toLowerCase();
        const { getVillageRegionByName } = require('../../modules/locationsModule');
        const villageRegion = getVillageRegionByName(gatheringRegion);
        if (villageRegion) {
          regionKey = villageRegion.toLowerCase();

        }
        
        // ItemModel: gathering (Boolean), allJobs ([String]), region keys (e.g. eldin, faron, lanayru)
        const availableItems = items.filter(item => {
          if (item.gathering !== true) return false;
          const normalizedInputJob = normalizeJobName(job);
          const isJobMatch = item.allJobs?.some(j =>
            normalizeJobName(j) === normalizedInputJob
          ) || false;
          const isRegionMatch = item[regionKey] === true;
          return isJobMatch && isRegionMatch;
        });
        
        // Debug logging for Scholar boost
        if (scholarTargetVillage) {
          logger.info('GATHER', `Scholar boost: ${scholarTargetVillage} (${availableItems.length} items)`);
        }
        
        if (availableItems.length === 0) {
          await safeReply({
            content: `⚠️ **No items available to gather in this location with the given job.**`,
          });
          return;
        }

        // ------------------- Apply Other Boosting Effects ------------------
        // Check if character is boosted and apply gathering boosts to the available items
        let boostedAvailableItems = availableItems;
        let bonusItem = null;
        let isEntertainerBoost = false;
        
        if (character.boostedBy && boosterCharacter) {
          // Entertainer: main item stays from normal table; bonus item is from entertainer pool (see below).
          if (boosterCharacter.job === 'Entertainer') {
            isEntertainerBoost = true;
            // Do not replace main pool—Entertainer grants a bonus themed item in addition to normal gather.
          } else if (boosterCharacter.job !== 'Scholar') {
            // Normal boost application for all other jobs (including Priest) - apply to available items
            // Skip Scholar since we already handled the region change above
            boostedAvailableItems = await applyGatheringBoost(character.name, availableItems);
          }
        }

        // ------------------- Defensive Filter: Prevent Weapons from Gather Pool ------------------
        // Safety check: ensure boostedAvailableItems is an array
        if (!Array.isArray(boostedAvailableItems)) {
          boostedAvailableItems = availableItems; // Fallback to original items
        }
        
        // Filter out weapons from the gather pool as a safety measure
        // Weapons should only be obtained through looting, not gathering
        const beforeWeaponFilter = boostedAvailableItems.length;
        boostedAvailableItems = boostedAvailableItems.filter((item) => {
          // Exclude items marked as weapons
          if (item.categoryGear === 'Weapon') {
            return false;
          }
          // Also check category array for weapon classification
          if (Array.isArray(item.category) && item.category.includes('Weapon')) {
            return false;
          }
          return true;
        });
        
        if (beforeWeaponFilter > boostedAvailableItems.length) {
          logger.warn('GATHER', `Filtered out ${beforeWeaponFilter - boostedAvailableItems.length} weapon(s) from gather pool (defensive filter)`);
        }
        
        let weightedItems;
        logger.info('BOOST', `Boost check: boostedBy="${character.boostedBy}", booster=${boosterCharacter?.name || 'null'}`);
        
        if (character.boostedBy && boosterCharacter && boosterCharacter.job?.toLowerCase() === 'fortune teller') {
          // Fortune Teller boost already creates properly weighted items - use them directly
          logger.info('BOOST', `Fortune Teller boost: ${boostedAvailableItems.length} items`);
          weightedItems = boostedAvailableItems;
        } else {
          // Normal weighting for other boosts or no boost
          // Pass villageLevel for rarity weight multipliers
          logger.info('GATHER', `Creating weighted list: ${boostedAvailableItems.length} items (village level: ${villageLevel})`);
          if (villageLevel >= 2) {
            const rarityBonus = villageLevel === 2 
              ? 'Level 2: +10-15% weight for rarity 3-5'
              : 'Level 3: +20-30% weight for rarity 3-7';
            logger.info('GATHER', `🏘️ Village level ${villageLevel} rarity bonus: ${rarityBonus}`);
          } else {
            logger.info('GATHER', `🏘️ Village level 1: No rarity bonuses (standard weights)`);
          }
          weightedItems = createWeightedItemList(boostedAvailableItems, undefined, job, villageLevel);
        }
        
        // Guard: Check if weightedItems is empty (can happen if all items filtered out or have zero weight)
        if (!weightedItems || weightedItems.length === 0) {
          logger.warn('GATHER', `No valid items available after weighting - availableItems: ${boostedAvailableItems.length}, weightedItems: 0`);
          await safeReply({
            content: `⚠️ **No items available to gather here with the current boost and job combination.** Your daily gather roll was not used.`,
          });
          return;
        }

        // Consume daily roll only when we have items to gather (not when we hit the no-items guard above)
        if (!character.jobVoucher && !character.isModCharacter) {
          try {
            await updateDailyRoll(character, 'gather');
          } catch (error) {
            logger.error('GATHER', 'Failed to update daily roll');
            await safeReply({
              content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
              flags: 64,
            });
            return;
          }
        }
        
        // Calculate total weight for selection
        // For Fortune Teller boost, each item represents its weight (no individual weight property)
        // For normal boosts, use the weight property
        const totalWeightForLogging = character.boostedBy && boosterCharacter && boosterCharacter.job?.toLowerCase() === 'fortune teller' 
          ? weightedItems.length  // Fortune Teller: each item in the array represents its weight
          : weightedItems.reduce((sum, item) => sum + (item.weight || 1), 0); // Normal: sum of weight properties
        
        logger.info('GATHER', `Item Selection - Total items: ${weightedItems.length}, Total weight: ${totalWeightForLogging}`);
        
        // Log weight distribution by rarity for debugging
        const rarityWeights = {};
        weightedItems.forEach(item => {
          const rarity = item.itemRarity || 1;
          if (!rarityWeights[rarity]) {
            rarityWeights[rarity] = { count: 0, totalWeight: 0 };
          }
          rarityWeights[rarity].count++;
          // For Fortune Teller boost, each item represents 1 unit of weight
          // For normal boosts, use the item's weight property
          const itemWeight = character.boostedBy && boosterCharacter && boosterCharacter.job?.toLowerCase() === 'fortune teller' 
            ? 1  // Fortune Teller: each item = 1 weight unit
            : (item.weight || 1); // Normal: use weight property
          rarityWeights[rarity].totalWeight += itemWeight;
        });
        
        logger.info('GATHER', `Weight distribution by rarity: ${Object.keys(rarityWeights)
          .sort((a, b) => b - a)
          .map(r => {
            const probability = ((rarityWeights[r].totalWeight / totalWeightForLogging) * 100).toFixed(1);
            return `Rarity ${r}: ${rarityWeights[r].count} items, ${rarityWeights[r].totalWeight} weight (${probability}% chance)`;
          })
          .join(', ')}`);
        
        // Use weighted random selection for all cases
        let randomItem;
        
        // Calculate total weight for weighted selection
        const totalWeightForSelection = weightedItems.reduce((sum, item) => sum + (item.weight || 1), 0);
        
        // Use weighted random selection
        const randomWeight = Math.random() * totalWeightForSelection;
        let currentWeight = 0;
        
        for (const item of weightedItems) {
          currentWeight += item.weight || 1;
          if (randomWeight <= currentWeight) {
            randomItem = item;
            break;
          }
        }
        
        // Fallback to uniform selection if weighted selection fails
        if (!randomItem) {
          const randomIndex = Math.floor(Math.random() * weightedItems.length);
          randomItem = weightedItems[randomIndex];
        }
        
        // Defensive check: Ensure randomItem is defined before using it
        if (!randomItem) {
          logger.error('GATHER', `Failed to select random item - weightedItems.length: ${weightedItems.length}`);
          await safeReply({
            content: `❌ **Error: Unable to select an item to gather. Please try again.**`,
          });
          return;
        }
        
        const isFortuneTellerBoost = character.boostedBy && boosterCharacter && boosterCharacter.job?.toLowerCase() === 'fortune teller';
        logger.info('GATHER', `${isFortuneTellerBoost ? 'Fortune Teller' : 'Normal'} Weighted Selection - Name: "${randomItem.itemName}", Rarity: ${randomItem.itemRarity}, Weight: ${randomItem.weight || 1}`);
        
        // Log Scholar boost item source confirmation
        if (scholarTargetVillage) {
          const itemVillages = [];
          if (randomItem.inariko || randomItem.Inariko) itemVillages.push('Inariko');
          if (randomItem.rudania || randomItem.Rudania) itemVillages.push('Rudania');
          if (randomItem.vhintl || randomItem.Vhintl) itemVillages.push('Vhintl');
          logger.info('GATHER', `Item "${randomItem.itemName}" from ${scholarTargetVillage} - Available in: [${itemVillages.join(', ')}]`);
        }
        
        // ------------------- Apply Village Level Quantity Bonuses ------------------
        let quantity = 1;
        let villageBonusInfo = null; // Track bonus info for embed display
        
        if (villageLevel >= 2) {
          if (villageLevel === 2) {
            // Level 2: 30-50% chance for +1 item
            const bonusChance = Math.random();
            const threshold = 0.30 + (Math.random() * 0.20); // Random between 0.30 and 0.50
            logger.info('GATHER', `🏘️ Village Level 2 quantity bonus check: ${(bonusChance * 100).toFixed(1)}% rolled vs ${(threshold * 100).toFixed(1)}% threshold`);
            if (bonusChance < threshold) {
              quantity = 2;
              villageBonusInfo = { level: 2, bonus: 1 };
              logger.info('GATHER', `🏘️ Village Level 2 quantity bonus APPLIED: +1 item (total: ${quantity})`);
            } else {
              logger.info('GATHER', `🏘️ Village Level 2 quantity bonus NOT applied (roll too high)`);
            }
          } else if (villageLevel === 3) {
            // Level 3: 40-60% chance for bonus, then 50/50 for +1 or +2
            const bonusChance = Math.random();
            const threshold = 0.40 + (Math.random() * 0.20); // Random between 0.40 and 0.60
            logger.info('GATHER', `🏘️ Village Level 3 quantity bonus check: ${(bonusChance * 100).toFixed(1)}% rolled vs ${(threshold * 100).toFixed(1)}% threshold`);
            if (bonusChance < threshold) {
              // Determine bonus amount: 50% chance for +1, 50% chance for +2
              const bonusAmount = Math.random() < 0.5 ? 1 : 2;
              quantity = 1 + bonusAmount;
              villageBonusInfo = { level: 3, bonus: bonusAmount };
              logger.info('GATHER', `🏘️ Village Level 3 quantity bonus APPLIED: +${bonusAmount} items (total: ${quantity})`);
            } else {
              logger.info('GATHER', `🏘️ Village Level 3 quantity bonus NOT applied (roll too high)`);
            }
          }
        } else {
          logger.info('GATHER', `🏘️ Village Level 1: No quantity bonuses (base quantity: ${quantity})`);
        }
        
        // Handle Entertainer bonus item
        if (isEntertainerBoost) {
          const entertainerItems = await applyGatheringBoost(character.name, availableItems);
          // Preserve the filtered list if no Entertainer-specific items are available.
          let entertainerBonusPool = Array.isArray(entertainerItems) && entertainerItems.length > 0
            ? entertainerItems
            : availableItems;

          // Defensive filter: Remove weapons from bonus pool
          entertainerBonusPool = entertainerBonusPool.filter((item) => {
            if (item.categoryGear === 'Weapon') return false;
            if (Array.isArray(item.category) && item.category.includes('Weapon')) return false;
            return true;
          });

          if (entertainerBonusPool.length > 0) {
            // Select a random entertainer item as bonus
            const bonusIndex = Math.floor(Math.random() * entertainerBonusPool.length);
            bonusItem = entertainerBonusPool[bonusIndex];

          }
        }
        

        
        await addItemInventoryDatabase(
          character._id,
          randomItem.itemName,
          quantity,
          interaction,
          "Gathering"
        );
        
        // Add bonus item if Entertainer boost is active
        if (bonusItem && isEntertainerBoost) {
          await addItemInventoryDatabase(
            character._id,
            bonusItem.itemName,
            1,
            interaction,
            `Gathering (Entertainer Bonus)`
          );
          
        }
        
        // Note: Google Sheets sync is handled by addItemInventoryDatabase

        // Check if this is a divine item gathered with Priest boost
        let isDivineItemWithPriestBoost = false;
        if (character.boostedBy && boosterCharacter && boosterCharacter.job === 'Priest') {
          // Check if the gathered item is a divine item - check the in-memory flag first
          if (randomItem.divineItems === true || randomItem.priestBoostItem === true) {
            isDivineItemWithPriestBoost = true;
          } else {
            // Fall back to database lookup to confirm divine status
            const fetchedItem = await fetchItemByName(randomItem.itemName, { source: 'gather_priest_check' });
            if (fetchedItem?.divineItems === true) {
              isDivineItemWithPriestBoost = true;
            }
          }
        }

        // Create embed with cross-region gathering info if applicable
        // Debug info removed to reduce log bloat
        
        const embed = await createGatherEmbed(character, randomItem, bonusItem, isDivineItemWithPriestBoost, boosterCharacter, scholarTargetVillage, villageBonusInfo, quantity);
        
        // Include blight rain and lightning strike messages if present
        const messages = [];
        if (blightRainMessage) messages.push(blightRainMessage);
        if (lightningStrikeMessage) messages.push(lightningStrikeMessage);
        const content = messages.length > 0 ? messages.join('\n\n') : undefined;
        await safeReply({ content, embeds: [embed] });
        
        // ------------------- Clear Boost After Use ------------------
        await clearBoostAfterUse(character, {
          client: interaction.client,
          context: 'gathering'
        });
        
        // ------------------- Update Last Gather Timestamp ------------------
        character.lastGatheredAt = new Date().toISOString();
        await character.save();

      }

      // ------------------- Deactivate Job Voucher ------------------
      if (character.jobVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id, { afterUse: true });
        if (!deactivationResult.success) {
          // Failed to deactivate job voucher
        }
      }

    } catch (error) {
      // Handle interaction expiration specifically
      if (error.code === 10062) {
        logger.warn('INTERACTION', 'Interaction expired during gathering process');
        return; // Can't respond to expired interaction
      }
      
      // Log errors
      handleInteractionError(error, 'gather.js', {
        commandName: '/gather',
        userTag: userInfo.userTag,
        userId: userInfo.userId,
        characterName: userInfo.characterName,
        options: {
          job: job,
          region: region,
          currentVillage: currentVillage,
          bloodMoonActive: isBloodMoonActive()
        }
      });

      console.error(`[gather.js]: Error during gathering process: ${error.message}`, {
        stack: error.stack,
        interactionData: {
          userId: userInfo.userId,
          characterName: userInfo.characterName,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });

      // Check if interaction is still valid before trying to respond
      if (!interaction.isRepliable()) {
        console.error('[gather.js]: Cannot reply to interaction - interaction is not repliable');
        return;
      }
      
      // Provide more specific error messages based on the error type
      let errorMessage;
      if (error.message.includes('MongoDB')) {
        errorMessage = '❌ **Database connection error.** Please try again in a few moments.';
      } else if (error.message.includes('Google Sheets')) {
        errorMessage = '❌ **Inventory sync error.** Your items were gathered but may not appear in your inventory sheet immediately.';
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Connect Timeout')) {
        errorMessage = '❌ **Connection timeout.** Please try again in a few moments.';
      } else if (error.message.includes('Permission denied')) {
        errorMessage = '❌ **Permission denied.** Please make sure your inventory sheet is shared with the bot.';
      } else if (error.message.includes('Invalid Google Sheets URL')) {
        errorMessage = '❌ **Invalid inventory sheet URL.** Please check your character\'s inventory sheet link.';
      } else {
        errorMessage = `❌ **Error during gathering:** ${error.message}`;
      }

      if (errorMessage) {
        try {
          await safeReply({
            content: errorMessage,
            flags: 64
          });
        } catch (replyError) {
          if (replyError.code === 10062) {
            console.error('[gather.js]: Failed to send error message - interaction expired');
          } else {
            console.error('[gather.js]: Failed to send error message:', replyError);
          }
        }
      }
    }
  },
};