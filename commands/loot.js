// ------------------- Import Section -------------------

// Standard Libraries
// (No standard libraries imported here)

// Third-Party Libraries
const { SlashCommandBuilder } = require('discord.js'); // Used to create slash commands for Discord bots
const { v4: uuidv4 } = require('uuid'); // Generates unique identifiers

// Database Services
const {
  fetchCharacterByNameAndUserId,
  fetchCharactersByUserId,
} = require('../database/characterService');
const { fetchItemsByMonster } = require('../database/itemService');
const { getMonstersAboveTier } = require('../database/monsterService');

// Utilities
const {
  authorizeSheets,
  appendSheetData,
} = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { isBloodMoonActive } = require('../scripts/bloodmoon');

// Modules - Job, Location, Damage, and Formatting Logic
const { getJobPerk, isValidJob } = require('../modules/jobsModule');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { capitalizeWords } = require('../modules/formattingModule');

// Modules - RNG Logic
const {
  createWeightedItemList,
  getMonsterEncounterFromList,
  getMonstersByCriteria,
  calculateFinalValue,
  getRandomBloodMoonEncounter,
} = require('../modules/rngModule');

// Event Handlers
const { triggerRaid } = require('../handlers/raidHandler');

// Flavor Text and Messages
const {
  generateFinalOutcomeMessage,
  generateAttackAndDefenseBuffMessage,
  generateVictoryMessage,
  generateDamageMessage,
  generateDefenseBuffMessage,
  generateDefenseBuffMessageReduced,
  generateDefenseBuffMessageKOPrevented,
  getNoItemsFoundMessage,
  getFailedToDefeatMessage,
  getNoEncounterMessage,
  generateAttackBuffMessage,
} = require('../modules/flavorTextModule');

// Embeds
const {
  createMonsterEncounterEmbed,
  createNoEncounterEmbed,
  createKOEmbed,
} = require('../embeds/mechanicEmbeds');

// Models
const { monsterMapping } = require('../models/MonsterModel');

// Character Stats
const {
  updateCurrentHearts,
  handleKO,
  useHearts,
} = require('../modules/characterStatsModule');

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

      const character = await fetchCharacterByNameAndUserId(characterName, userId); // Fetch character data from the database
      if (!character) {
        // Reply if the character is not found or does not belong to the user
        await interaction.editReply({
          content: `❌ **Character "${characterName}" not found or doesn't belong to you!**`,
        });
        return;
      }

      // Check if the character's inventory has been synced
if (!character.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot use the loot command because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}


      // ------------------- Step 2: Check Hearts and Job Validity -------------------
      if (character.currentHearts === 0) {
        const embed = createKOEmbed(character); // Create embed for KO status
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const job = character.job; // Retrieve character's job
      if (!isValidJob(job)) {
        // Reply if the job is invalid
        await interaction.editReply({
          content: `❌ **Invalid job "${job}" for looting.**`,
        });
        return;
      }

      const jobPerk = getJobPerk(job); // Retrieve job-specific perks
      if (!jobPerk || !jobPerk.perks.includes('LOOTING')) {
        // Reply if the job lacks the required LOOTING perk
        await interaction.editReply({
          content: `❌ **"${character.name}" cannot loot as they lack the LOOTING perk.**`,
        });
        return;
      }

      // ------------------- Step 3: Determine Region and Encounter -------------------
      const currentVillage = capitalizeWords(character.currentVillage); // Capitalize village name for consistency
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
          console.log(`[DEBUG] Encounter Type Rolled: ${encounterType}`);
          
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
      return; // Exit if no monster was found
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

    } catch (error) {
      console.error(`[LOOT] Error during command execution: ${error}`);
      await interaction.editReply({
        content: `❌ **An error occurred during the loot command execution.**`,
      });
    }
  },

  // ------------------- Autocomplete Logic -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true); // Identify the currently focused option
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
        const characters = await fetchCharactersByUserId(userId); // Fetch user characters
        const lootingCharacters = filterLootingEligibleCharacters(characters);

        // Create and filter autocomplete choices
        const choices = lootingCharacters.map(character => ({
          name: character.name,
          value: character.name,
        }));
        const filteredChoices = choices
          .filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25); // Limit to 25 choices

        await interaction.respond(filteredChoices); // Respond with choices
      }
    } catch (error) {
      console.error(`[LOOT] Autocomplete Error: ${error}`);
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
async function handleNormalEncounter(interaction, currentVillage, job, character, bloodMoonActive)  {
  console.log(`[LOOT] Blood Moon is inactive: Normal encounter.`);
  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);

  if (monstersByCriteria.length === 0) {
    console.log(`[LOOT] No monsters found for village "${currentVillage}" and job "${job}".`);
    await interaction.editReply({
      content: `❌ **No monsters found for village "${currentVillage}" and job "${job}".**`,
    });
    return null;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  if (encounterResult.encounter === 'No Encounter') {
    console.log(`[LOOT] No encounter generated for character "${character.name}" in "${currentVillage}".`);
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Pass Blood Moon status
    await interaction.editReply({ embeds: [embed] });
    return null;
}

  if (encounterResult.monsters.length === 0) {
    console.log(`[LOOT] No suitable monsters found for encounter in "${currentVillage}".`);
    await interaction.editReply({
      content: `❌ **No suitable monsters found in "${currentVillage}".**`,
    });
    return null;
  }

  const encounteredMonster = encounterResult.monsters[
    Math.floor(Math.random() * encounterResult.monsters.length)
  ];
  console.log(`[LOOT] Normal Encounter: Monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier || 'Unknown'})`);
  
  if (encounteredMonster.tier > 4) {
    console.log(`[LOOT] Initiating raid for monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
    await triggerRaid(character, encounteredMonster, interaction, null, bloodMoonActive); // Pass null for threadId, to let triggerRaid handle thread creation
    return;
}
 else {
    console.log(`[LOOT] Processing looting logic for Tier ${encounteredMonster.tier}`);
    await processLootingLogic(interaction, character, encounteredMonster, bloodMoonActive) ;
  }
  
  return encounteredMonster;
  
}

// ------------------- Looting Logic -------------------
async function processLootingLogic(interaction, character, encounteredMonster, bloodMoonActive) {
  try {
    const items = await fetchItemsByMonster(encounteredMonster.name); // Fetch items dropped by the encountered monster

    // Step 1: Calculate Encounter Outcome
    const {
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
    } = calculateFinalValue(character);
    const weightedItems = createWeightedItemList(items, adjustedRandomValue); // Generate a weighted list of potential loot
    const outcome = await getEncounterOutcome(
      character,
      encounteredMonster,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess
    );

    // Step 2: Update Hearts and Handle KO
    let heartsRemaining = character.currentHearts;
    if (outcome.hearts) {
      await useHearts(character._id, outcome.hearts); // Deduct hearts
      heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
      if (outcome.result === 'KO') {
        await handleKO(character._id); // Handle KO logic
      }
    }
    await updateCurrentHearts(character._id, heartsRemaining); // Update character hearts

    // Step 3: Generate Outcome Message
    const outcomeMessage = generateOutcomeMessage(outcome); // Refactored to a separate helper function

    // Step 4: Loot Item Logic
    if (outcome.canLoot && weightedItems.length > 0 && !outcome.hearts) {
      const lootedItem = generateLootedItem(encounteredMonster, weightedItems); // Refactored to a helper function

      const inventoryLink = character.inventory || character.inventoryLink;
      if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
        const embed = createMonsterEncounterEmbed(
          character,
          encounteredMonster,
          outcomeMessage,
          heartsRemaining,
          lootedItem,
          bloodMoonActive // Pass Blood Moon status
      );
        await interaction.editReply({
          content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
          embeds: [embed],
        });
        return;
      }

      const spreadsheetId = extractSpreadsheetId(inventoryLink); // Extract ID from the Google Sheets link
      const auth = await authorizeSheets(); // Authorize access to Google Sheets
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4(); // Generate a unique ID for logging
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
      ); // Add item to the inventory database

      await appendSheetData(auth, spreadsheetId, range, values); // Append loot details to Google Sheets

const embed = createMonsterEncounterEmbed(
    character,
    encounteredMonster,
    outcomeMessage,
    heartsRemaining,
    lootedItem,
    bloodMoonActive // Pass Blood Moon status
);
      await interaction.editReply({ embeds: [embed] }); // Reply with the loot details
    } else {
      const embed = createMonsterEncounterEmbed(
        character,
        encounteredMonster,
        outcomeMessage,
        heartsRemaining,
        null,
        bloodMoonActive 
      );
      await interaction.editReply({ embeds: [embed] }); // Reply if no loot was obtained
    }
  } catch (error) {
    console.error(`[LOOT] Error during loot processing: ${error}`);
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