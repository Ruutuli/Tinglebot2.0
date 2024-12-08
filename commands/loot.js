// ------------------- Import Section -------------------

// Third-Party Libraries
const { SlashCommandBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// Database Services
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService');
const { fetchItemsByMonster } = require('../database/itemService');
const { getMonstersAboveTier } = require('../database/monsterService');

// Utilities
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { isBloodMoonActive } = require('../scripts/bloodmoon');

// Modules
const { getJobPerk, isValidJob } = require('../modules/jobsModule');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { capitalizeWords } = require('../modules/formattingModule');
const { createWeightedItemList, getMonsterEncounterFromList, getMonstersByCriteria, calculateFinalValue, getRandomBloodMoonEncounter  } = require('../modules/rngModule');
const { triggerRaid } = require('../handlers/raidHandler')

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
  generateAttackBuffMessage
} = require('../modules/flavorTextModule');

// Embeds
const {
  createMonsterEncounterEmbed,
  createNoEncounterEmbed,
  createKOEmbed
} = require('../embeds/mechanicEmbeds');

// Models
const { monsterMapping } = require('../models/MonsterModel');

// Character Stats
const { updateCurrentHearts, handleKO, useHearts } = require('../modules/characterStatsModule');

// ------------------- Command Definition -------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Loot items based on your character\'s job and location')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Main Execution Logic -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Step 1: Validate Character
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ content: `❌ **Character "${characterName}" not found or doesn't belong to you!**` });
        return;
      }

      // Step 2: Check Hearts and Job Validity
      if (character.currentHearts === 0) {
        const embed = createKOEmbed(character);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const job = character.job;
      if (!isValidJob(job)) {
        await interaction.editReply({ content: `❌ **Invalid job "${job}" for looting.**` });
        return;
      }

      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('LOOTING')) {
        await interaction.editReply({ content: `❌ **"${character.name}" cannot loot as they lack the LOOTING perk.**` });
        return;
      }

// Step 3: Determine Region and Encounter
const currentVillage = capitalizeWords(character.currentVillage);
const region = getVillageRegionByName(currentVillage);
if (!region) {
  console.log(`[LOOT] No region found for village: ${currentVillage}`);
  await interaction.editReply({ content: `❌ **No region found for village "${currentVillage}".**` });
  return;
}

// Check if Blood Moon is active
const bloodMoonActive = isBloodMoonActive();
let encounteredMonster;

if (bloodMoonActive) {
  try {
    // Determine encounter type using Blood Moon probabilities
    const encounterType = getRandomBloodMoonEncounter();

    if (encounterType === 'No Encounter') {
      console.log(`[LOOT] Blood Moon active: No encounter this time.`);
      await interaction.followUp(`🌕 **Blood Moon is active: No monsters encountered this time.**`);
      return;
    }

    // Fetch monsters of the encountered tier
    const tier = parseInt(encounterType.replace('tier', ''), 10);
    if (isNaN(tier)) {
      console.error(`[LOOT] Invalid encounter type "${encounterType}" detected.`);
      await interaction.followUp(`🌕 **Blood Moon is active, but no valid monsters could be determined.**`);
      return;
    }

    const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
    const filteredMonsters = monstersByCriteria.filter(monster => monster.tier === tier);

    if (filteredMonsters.length > 0) {
      encounteredMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
      console.log(`[LOOT] Blood Moon Encounter: Monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);

      // Check if it qualifies for a raid
      if (encounteredMonster.tier > 4) {
        console.log(`[LOOT] Initiating raid for monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
        await triggerRaid(character, encounteredMonster, interaction);
        return; // Stop further processing since raid has started
      }
    } else {
      console.log(`[LOOT] Blood Moon Encounter: No suitable monsters found for tier ${tier}.`);
      await interaction.followUp(`🌕 **Blood Moon is active: A monster was expected, but none could be found for this tier.**`);
      return;
    }
  } catch (err) {
    console.error(`[LOOT] Error during Blood Moon encounter logic: ${err}`);
    await interaction.followUp(`🌕 **Blood Moon is active, but an error occurred while determining an encounter.**`);
    return;
  }

} else {
  // Normal encounter logic
  console.log(`[LOOT] Blood Moon is inactive: Normal encounter.`);
  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  if (monstersByCriteria.length === 0) {
    console.log(`[LOOT] No monsters found for village "${currentVillage}" and job "${job}".`);
    await interaction.editReply({ content: `❌ **No monsters found for village "${currentVillage}" and job "${job}".**` });
    return;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  const availableMonstersCount = encounterResult.monsters.length;

  if (encounterResult.encounter === 'No Encounter') {
    console.log(`[LOOT] No encounter generated for character "${character.name}" in "${currentVillage}".`);
    const embed = createNoEncounterEmbed(character);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (availableMonstersCount === 0) {
    console.log(`[LOOT] No suitable monsters found for encounter in "${currentVillage}".`);
    await interaction.editReply({ content: `❌ **No suitable monsters found in "${currentVillage}".**` });
    return;
  }

  encounteredMonster = encounterResult.monsters[Math.floor(Math.random() * availableMonstersCount)];
  console.log(`[LOOT] Normal Encounter: Monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier || 'Unknown'})`);

  if (encounteredMonster.tier > 4) {
    console.log(`[LOOT] Initiating raid for monster "${encounteredMonster.name}" (Tier ${encounteredMonster.tier})`);
    await triggerRaid(character, encounteredMonster, interaction);
    return; // Stop further processing since raid has started
  }
}

      const items = await fetchItemsByMonster(encounteredMonster.name);

      // Step 5: Calculate Encounter Outcome
      const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
      const weightedItems = createWeightedItemList(items, adjustedRandomValue);

      const outcome = await getEncounterOutcome(character, encounteredMonster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

      // Step 6: Handle Hearts and Update Stats
      let heartsRemaining = character.currentHearts;
      if (outcome.hearts) {
        await useHearts(character._id, outcome.hearts);
        heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
        if (outcome.result === 'KO') {
          await handleKO(character._id);
        }
      }

      await updateCurrentHearts(character._id, heartsRemaining);

      // Step 7: Generate Outcome Message
      let outcomeMessage;
      if (outcome.hearts) {
        if (outcome.result === 'KO') {
          outcomeMessage = generateDamageMessage('KO');
        } else {
          outcomeMessage = generateDamageMessage(outcome.hearts);
        }
      } else if (outcome.defenseSuccess) {
        outcomeMessage = generateDefenseBuffMessage(outcome.defenseSuccess, outcome.adjustedRandomValue, outcome.damageValue);
      } else if (outcome.attackSuccess) {
        outcomeMessage = generateAttackBuffMessage(outcome.attackSuccess, outcome.adjustedRandomValue, outcome.damageValue);
      } else if (outcome.result === 'Win!/Loot') {
        outcomeMessage = generateVictoryMessage(outcome.adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess);
      } else {
        outcomeMessage = generateFinalOutcomeMessage(outcome.damageValue, outcome.defenseSuccess, outcome.attackSuccess, outcome.adjustedRandomValue, outcome.damageValue);
      }

      // Step 8: Looting Logic
      if (outcome.canLoot && weightedItems.length > 0 && !outcome.hearts) {
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const lootedItem = weightedItems[randomIndex];

        // ------------------- Chuchu-Specific Logic -------------------
        if (encounteredMonster.name.includes("Chuchu")) {
          const jellyType = encounteredMonster.name.includes("Ice") ? 'White Chuchu Jelly'
            : encounteredMonster.name.includes("Fire") ? 'Red Chuchu Jelly'
            : encounteredMonster.name.includes("Electric") ? 'Yellow Chuchu Jelly'
            : 'Chuchu Jelly';
          const quantity = encounteredMonster.name.includes("Large") ? 3
            : encounteredMonster.name.includes("Medium") ? 2
            : 1; // Default to 1 for normal Chuchus
          lootedItem.itemName = jellyType;
          lootedItem.quantity = quantity;
        } else {
          lootedItem.quantity = 1; // Default quantity for other items
        }

        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
          const embed = createMonsterEncounterEmbed(character, encounteredMonster, outcomeMessage, heartsRemaining, lootedItem);
          await interaction.editReply({ content: `❌ **Invalid Google Sheets URL for "${characterName}".**`, embeds: [embed] });
          return;
        }

        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

        const values = [[
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
        ]];

        await addItemInventoryDatabase(character._id, lootedItem.itemName, lootedItem.quantity, lootedItem.category.join(', '), lootedItem.type.join(', '), interaction);
        await appendSheetData(auth, spreadsheetId, range, values);

        const embed = createMonsterEncounterEmbed(character, encounteredMonster, outcomeMessage, heartsRemaining, lootedItem);
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = createMonsterEncounterEmbed(character, encounteredMonster, outcomeMessage, heartsRemaining, null);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      await interaction.editReply({ content: `❌ **An error occurred during the loot command execution.**` });
    }
  },

  // ------------------- Autocomplete Logic -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
        const characters = await fetchCharactersByUserId(userId);
        const lootingCharacters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          return jobPerk && jobPerk.perks.includes('LOOTING');
        });

        const choices = lootingCharacters.map(character => ({
          name: character.name,
          value: character.name,
        }));

        const filteredChoices = choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);

        await interaction.respond(filteredChoices);
      }
    } catch (error) {
      // Handle errors gracefully here
    }
  },
};
