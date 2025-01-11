// ------------------- Import Section -------------------

// Standard Libraries
// (No standard libraries imported here)

// Third-Party Libraries
const { SlashCommandBuilder } = require('discord.js'); // Used to create slash commands for Discord bots
const { v4: uuidv4 } = require('uuid'); // Generates unique identifiers
require('dotenv').config();


// Database Services
const {  fetchCharacterByNameAndUserId, fetchCharactersByUserId, updateCharacterById} = require('../database/characterService');
const { fetchItemsByMonster, fetchItemByName } = require('../database/itemService');
const { getMonstersAboveTier } = require('../database/monsterService');

// Utilities
const {  authorizeSheets,  appendSheetData,} = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { isBloodMoonActive } = require('../scripts/bloodmoon');

// Modules - Job, Location, Damage, and Formatting Logic
const { getJobPerk, isValidJob } = require('../modules/jobsModule');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { capitalizeWords } = require('../modules/formattingModule');
const { activateJobVoucher,validateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher } = require('../modules/jobVoucherModule'); // Importing jobVoucherModule

// Modules - RNG Logic
const {  createWeightedItemList,  getMonsterEncounterFromList,  getMonstersByCriteria,  calculateFinalValue,  getRandomBloodMoonEncounter,} = require('../modules/rngModule');

// Event Handlers
const { triggerRaid } = require('../handlers/raidHandler');

// Flavor Text and Messages
const {
  generateFinalOutcomeMessage,  generateAttackAndDefenseBuffMessage,  generateVictoryMessage,  generateDamageMessage,
  generateDefenseBuffMessage,  generateDefenseBuffMessageReduced,  generateDefenseBuffMessageKOPrevented,
  getNoItemsFoundMessage,  getFailedToDefeatMessage,  getNoEncounterMessage,  generateAttackBuffMessage,} = require('../modules/flavorTextModule');

// Embeds
const {
  createMonsterEncounterEmbed,  createNoEncounterEmbed,  createKOEmbed,} = require('../embeds/mechanicEmbeds');

// Models
const { monsterMapping } = require('../models/MonsterModel');
const Character = require('../models/CharacterModel');

// Character Stats
const {
  updateCurrentHearts,  handleKO,  useHearts,} = require('../modules/characterStatsModule');



const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};


// ------------------- Command Definition -------------------

// Define the `loot` slash command, allowing users to loot items based on their character's job and location
module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot') // Command name
    .setDescription('Loot items based on your character\'s job and location') // Description of the command
    .addStringOption(option => 
      option
        .setName('charactername') 
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)
    ),
    
    
  // ------------------- Main Execution Logic -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // ------------------- Step 1: Validate Character -------------------
      const characterName = interaction.options.getString('charactername'); // Fetch the character name from user input
      const userId = interaction.user.id; // Get the ID of the interacting user

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({
          content: `❌ **Character "${characterName}" not found or doesn't belong to you!**`,
        });
        return;
      }
      
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
            content: `❌ **${character.name} is currently debuffed and cannot loot. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
            ephemeral: true,
        });
        return;
      }

      // ------------------- Step 2: Validate Interaction Channel -------------------
      const currentVillage = capitalizeWords(character.currentVillage); // Capitalize village name for consistency
      const allowedChannel = villageChannels[currentVillage]; // Get the allowed channel from environment variables

      if (!allowedChannel || interaction.channelId !== allowedChannel) {
        const channelMention = `<#${allowedChannel}>`;
        await interaction.editReply({
          content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n${characterName} is currently in ${currentVillage}! This command must be used in ${channelMention}.`,
        });
        return;
      }

// ------------------- Step 3: Check Hearts and Job Validity -------------------
if (character.currentHearts === 0) {
  const embed = createKOEmbed(character); // Create embed for KO status
  await interaction.editReply({ embeds: [embed] });
  return;
}

// Determine job based on jobVoucher or default job
// Determine job based on jobVoucher or default job
let job = character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;
console.log(`[Loot Command]: Determined job for ${character.name} is "${job}"`);

// Validate job
if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
    console.log(`[Loot Command]: Invalid or unsupported job detected for ${character.name}. Job: "${job}"`);
    await interaction.editReply({
        content: `❌ **Oh no! ${character.name} can't loot as an invalid or unsupported job (${job || "None"}).**\n✨ **Why not try a Job Voucher to explore exciting new roles?**`,
        ephemeral: true,
    });
    return;
}

// Validate job voucher (without consuming it)
if (character.jobVoucher) {
    console.log(`[Loot Command]: Job voucher detected for ${character.name}. Validating voucher.`);
    const voucherValidation = await validateJobVoucher(character, job);
    if (!voucherValidation.success) {
        if (character.jobVoucherJob === null) {
            console.log(`[Loot Command]: Job voucher is unrestricted. Proceeding with job: "${job}".`);
        } else {
            await interaction.editReply({
                content: voucherValidation.message,
                ephemeral: true,
            });
            return;
        }
    }
}


// Validate job perks
const jobPerk = getJobPerk(job);
console.log(`[Loot Command]: Retrieved job perks for ${job}:`, jobPerk);

if (!jobPerk || !jobPerk.perks.includes('LOOTING')) {
  console.log(`[Loot Command]: ${character.name} lacks looting skills for job: "${job}"`);
  await interaction.editReply({
      content: `❌ **Hmm, ${character.name} can’t loot as a ${job} because they lack the necessary looting skills.**`,
      ephemeral: true,
  });
  return;
}

// Handle job voucher activation after validation
if (character.jobVoucher) {
  console.log(`[Loot Command]: Activating job voucher for ${character.name}.`);
  const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
  if (!itemSuccess) {
      await interaction.editReply({
          content: itemError,
          ephemeral: true,
      });
      return;
  }

  const activationResult = await activateJobVoucher(character, job, jobVoucherItem, 1, interaction);
  if (!activationResult.success) {
      await interaction.editReply({
          content: activationResult.message,
          ephemeral: true,
      });
      return;
  }

  await interaction.followUp({
      content: activationResult.message,
      ephemeral: true,
  });
}

      // ------------------- Step 4: Determine Region and Encounter -------------------
      const region = getVillageRegionByName(currentVillage); // Get the region based on village
      if (!region) {
        // Reply if no region is found for the village
        console.log(`[LOOT] No region found for village: ${currentVillage}`);
        await interaction.editReply({
          content: `❌ **No region found for village "${currentVillage}".**`,
        });
        return;
      }

    
      // ------------------- Step 4: Blood Moon Encounter Handling -------------------
      const bloodMoonActive = isBloodMoonActive(); // Determine Blood Moon status
      console.log(`[Blood Moon Status] Current Day: ${new Date().getDate()}, Active: ${bloodMoonActive}`);      
      let encounteredMonster;

      if (bloodMoonActive) {
        try {
          // Handle Blood Moon-specific encounter logic
          const encounterType = getRandomBloodMoonEncounter();
          
          // Normalize the encounter type
          const normalizedEncounterType = encounterType.trim().toLowerCase();
          
          // Handle "no encounter" cases
          if (normalizedEncounterType === 'noencounter' || normalizedEncounterType === 'no encounter') {
            console.log(`[LOOT] No encounter generated for this roll.`);
            const embed = createNoEncounterEmbed(character, bloodMoonActive); // Pass Blood Moon status
            await interaction.followUp({ embeds: [embed] });
            return;
          }
          
          // Process other encounter types (tiers)
          const tier = parseInt(normalizedEncounterType.replace('tier', ''), 10);
          if (isNaN(tier)) {
            console.error(`[LOOT] Invalid encounter type "${encounterType}" detected.`);
            await interaction.followUp(`🌕 **Blood Moon is active, but no valid monsters could be determined.**`);
            return;
          }
          
      
          // Fetch and filter monsters matching the criteria
          const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
          const filteredMonsters = monstersByCriteria.filter(monster => monster.tier === tier);

          // Proceed if a monster is found; else attempt reroll logic
          if (filteredMonsters.length > 0) {
            encounteredMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
            console.log(
              `[LOOT] Blood Moon Encounter: Monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`
            );

            if (encounteredMonster.tier > 4) {
              console.log(`[LOOT] Initiating raid for monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
              await triggerRaid(character, encounteredMonster, interaction, null, bloodMoonActive); // Pass null for threadId, to let triggerRaid handle thread creation
              return;
          }
          
          } else {
            await handleBloodMoonRerolls(
              interaction,
              monstersByCriteria,
              tier,
              character,
              job,
              currentVillage,
              bloodMoonActive
          );
            return; // Stop if reroll is needed and executed
          }
        } catch (error) {
          console.error(`[LOOT] Error during Blood Moon encounter logic: ${error}`);
          await interaction.followUp(
            `🌕 **Blood Moon is active, but an error occurred while determining an encounter.**`
          );
          return;
        }
      } else {
 // ------------------- Normal Encounter Logic -------------------
 encounteredMonster = await handleNormalEncounter(
  interaction,
  currentVillage,
  job,
  character,
  bloodMoonActive
);

if (!encounteredMonster) {
  console.log(`[LOOT] No valid monster encountered during normal looting.`);
  
  // Send a "No Encounter" embed to the user
  const embed = createNoEncounterEmbed(character, bloodMoonActive); // Blood Moon is inactive here
  await interaction.editReply({ embeds: [embed] });
  return; // Stop execution after "No Encounter"
}

// ------------------- Handle Looting for All Tiers -------------------
if (encounteredMonster.tier > 4) {
  console.log(`[LOOT] Monster "${encounteredMonster.name}" qualifies for a raid.`);
  await triggerRaid(character, encounteredMonster, interaction, null, bloodMoonActive); // Pass null for threadId
  return;
}
      }
      // ------------------- Step 5: Looting Logic -------------------
      await processLootingLogic(interaction, character, encounteredMonster, bloodMoonActive) ;

      // ------------------- Deactivate Job Voucher -------------------
if (character.jobVoucher) {
  const deactivationResult = await deactivateJobVoucher(character._id);
  if (!deactivationResult.success) {
      console.error(`[Loot Command]: Failed to deactivate job voucher for ${character.name}`);
  } else {
      console.log(`[Loot Command]: Job voucher deactivated for ${character.name}`);
  }
}

    } catch (error) {
      console.error(`[LOOT] Error during command execution: ${error}`);
      await interaction.editReply({
        content: `❌ **An error occurred during the loot command execution.**`,
      });
    }
  },
};


  // ------------------- Blood Moon Rerolls Logic -------------------
  async function handleBloodMoonRerolls(interaction, monstersByCriteria, tier, character, job, currentVillage, bloodMoonActive) {
  console.log(`[LOOT] Blood Moon Encounter: No suitable monsters found for tier ${tier}.`);
  console.log(`[LOOT] Details: Character "${character.name}", Job "${job}", Available Monsters: ${
    monstersByCriteria.map(m => `${m.name} (Tier ${m.tier})`).join(', ') || 'None'
  }`);

  let rerollCount = 0;
  const maxRerolls = 5; // Limit the number of rerolls to prevent infinite loops

  while (rerollCount < maxRerolls) {
    const rerollTier = Math.floor(Math.random() * 10) + 1; // Randomly choose a tier (1-10)
    const rerolledMonsters = monstersByCriteria.filter(monster => monster.tier === rerollTier);

    if (rerolledMonsters.length > 0) {
      const encounteredMonster = rerolledMonsters[Math.floor(Math.random() * rerolledMonsters.length)];
      console.log(`[LOOT] Reroll Successful: Monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
    
      if (encounteredMonster.tier > 4) {
        console.log(`[LOOT] Initiating raid for monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
        await triggerRaid(character, encounteredMonster, interaction, null, bloodMoonActive); // Let triggerRaid handle thread creation
        return;
    }else {
        console.log(`[LOOT] Processing looting logic for Tier ${encounteredMonster.tier}`);
        await processLootingLogic(interaction, character, encounteredMonster, bloodMoonActive) ;
        return; // End reroll processing after looting
      }
    }

    rerollCount++;
    console.log(`[LOOT] Reroll ${rerollCount}/${maxRerolls} failed. No monsters found for tier ${rerollTier}.`);
  }

  // If rerolls are exhausted and no monster is found
  console.log(`[LOOT] Reroll Exhausted: No suitable monster could be found after ${maxRerolls} attempts.`);
  await interaction.followUp(`🌕 **Blood Moon is active: No suitable monster could be found after multiple attempts.**`);
  return null;
}

// ------------------- Normal Encounter Logic -------------------
async function handleNormalEncounter(interaction, currentVillage, job, character, bloodMoonActive) {

  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  if (monstersByCriteria.length === 0) {
    return null; // No monsters available
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  if (encounterResult.encounter === 'No Encounter') {
    return null; // No encounter happened
  }

  const encounteredMonster = encounterResult.monsters[
    Math.floor(Math.random() * encounterResult.monsters.length)
  ];
  
  // Return the final encountered monster
  return encounteredMonster;
}

// ------------------- Looting Logic -------------------
async function processLootingLogic(interaction, character, encounteredMonster, bloodMoonActive) {
  try {
    console.log(`-----------------`);
    console.log(`[LOOT.JS DEBUG] Starting looting logic for ${character.name}. Current Hearts: ${character.currentHearts}`);

    const items = await fetchItemsByMonster(encounteredMonster.name);

    // Step 1: Calculate Encounter Outcome
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

    console.log(`[LOOT.JS DEBUG] Damage Value: ${damageValue}, Adjusted Random Value: ${adjustedRandomValue}`);

    const weightedItems = createWeightedItemList(items, adjustedRandomValue);
    const outcome = await getEncounterOutcome(
      character,
      encounteredMonster,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess
    );

    console.log(`[LOOT.JS DEBUG] Outcome for ${character.name}:`, outcome);

    // Step 2: Handle KO Logic (if not already handled in getEncounterOutcome)
    const updatedCharacter = await Character.findById(character._id);
    if (!updatedCharacter) {
      throw new Error(`[LOOT.JS DEBUG] Unable to find updated character with ID ${character._id}`);
    }

    console.log(`[LOOT.JS DEBUG] Updated Hearts for ${character.name}: ${updatedCharacter.currentHearts}`);

    if (updatedCharacter.currentHearts === 0 && !updatedCharacter.ko) {
      console.log(`[LOOT.JS DEBUG] Triggering KO for ${character.name}`);
      await handleKO(updatedCharacter._id);
    }

    console.log(`[LOOT.JS DEBUG] Final Hearts for ${character.name}: ${updatedCharacter.currentHearts}`);

    // Step 3: Generate Outcome Message
    const outcomeMessage = generateOutcomeMessage(outcome);

    // Step 4: Loot Item Logic
    if (outcome.canLoot && weightedItems.length > 0) {
      const lootedItem = generateLootedItem(encounteredMonster, weightedItems);

      const inventoryLink = character.inventory || character.inventoryLink;
      if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
        const embed = createMonsterEncounterEmbed(
          character,
          encounteredMonster,
          outcomeMessage,
          updatedCharacter.currentHearts,
          lootedItem,
          bloodMoonActive
        );
        await interaction.editReply({
          content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
          embeds: [embed],
        });
        return;
      }

      const spreadsheetId = extractSpreadsheetId(inventoryLink);
      const auth = await authorizeSheets();
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4();
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

      const values = [
        [
          character.name,
          lootedItem.itemName,
          lootedItem.quantity.toString(),
          lootedItem.category.join(', '),
          lootedItem.type.join(', '),
          lootedItem.subtype.join(', '),
          'Looted',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uniqueSyncId,
        ],
      ];

      await addItemInventoryDatabase(
        character._id,
        lootedItem.itemName,
        lootedItem.quantity,
        lootedItem.category.join(', '),
        lootedItem.type.join(', '),
        interaction
      );

      await appendSheetData(auth, spreadsheetId, range, values);

      const embed = createMonsterEncounterEmbed(
        character,
        encounteredMonster,
        outcomeMessage,
        updatedCharacter.currentHearts,
        lootedItem,
        bloodMoonActive
      );
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = createMonsterEncounterEmbed(
        character,
        encounteredMonster,
        outcomeMessage,
        updatedCharacter.currentHearts,
        null,
        bloodMoonActive
      );
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error(`[LOOT] Error during loot processing: ${error.message}`);
    await interaction.editReply({
      content: `❌ **An error occurred while processing the loot.**`,
    });
  }
}



// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome) {
  if (outcome.hearts) {
    return outcome.result === 'KO'
      ? generateDamageMessage('KO')
      : generateDamageMessage(outcome.hearts);
  } else if (outcome.defenseSuccess) {
    return generateDefenseBuffMessage(
      outcome.defenseSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  } else if (outcome.attackSuccess) {
    return generateAttackBuffMessage(
      outcome.attackSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  } else if (outcome.result === 'Win!/Loot') {
    return generateVictoryMessage(
      outcome.adjustedRandomValue,
      outcome.defenseSuccess,
      outcome.attackSuccess
    );
  }
  return generateFinalOutcomeMessage(
    outcome.damageValue,
    outcome.defenseSuccess,
    outcome.attackSuccess,
    outcome.adjustedRandomValue,
    outcome.damageValue
  );
}

// ------------------- Helper Function: Generate Looted Item -------------------
function generateLootedItem(encounteredMonster, weightedItems) {
  const randomIndex = Math.floor(Math.random() * weightedItems.length);
  const lootedItem = weightedItems[randomIndex];

  if (encounteredMonster.name.includes('Chuchu')) {
    const jellyType = encounteredMonster.name.includes('Ice')
      ? 'White Chuchu Jelly'
      : encounteredMonster.name.includes('Fire')
      ? 'Red Chuchu Jelly'
      : encounteredMonster.name.includes('Electric')
      ? 'Yellow Chuchu Jelly'
      : 'Chuchu Jelly';
    const quantity = encounteredMonster.name.includes('Large')
      ? 3
      : encounteredMonster.name.includes('Medium')
      ? 2
      : 1;
    lootedItem.itemName = jellyType;
    lootedItem.quantity = quantity;
  } else {
    lootedItem.quantity = 1; // Default quantity for non-Chuchu items
  }

  return lootedItem;
}

// ------------------- Helper Function: Filter Looting Eligible Characters -------------------
function filterLootingEligibleCharacters(characters) {
  return characters.filter(character => {
    const jobPerk = getJobPerk(character.job);
    return jobPerk && jobPerk.perks.includes('LOOTING');
  });
}