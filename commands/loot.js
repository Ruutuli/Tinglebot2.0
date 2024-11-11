// loot.js

const { SlashCommandBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService');
const { getJobPerk, isValidJob } = require('../modules/jobsModule');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { v4: uuidv4 } = require('uuid');
const { capitalizeWords } = require('../modules/formattingModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { fetchItemsByMonster } = require('../database/itemService');
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
const { createMonsterEncounterEmbed, createNoEncounterEmbed, createKOEmbed } = require('../embeds/mechanicEmbeds');
const { createWeightedItemList, getMonsterEncounterFromList, getMonstersByCriteria, calculateFinalValue } = require('../modules/rngModule');
const { updateCurrentHearts, handleKO, useHearts } = require('../modules/characterStatsModule');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { monsterMapping } = require('../models/MonsterModel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Loot items based on your character\'s job and location')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ content: `❌ Character **${characterName}** not found or does not belong to you.` });
        return;
      }

      if (character.currentHearts === 0) {
        const embed = createKOEmbed(character);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const job = character.job;
      if (!isValidJob(job)) {
        await interaction.editReply({ content: `❌ Invalid job **${job}** for looting.` });
        return;
      }

      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('LOOTING')) {
        await interaction.editReply({ content: `❌ ${character.name} cannot loot because they are a **${job}** and do not have the LOOTING perk.` });
        return;
      }

      const currentVillage = capitalizeWords(character.currentVillage);
      const region = getVillageRegionByName(currentVillage);
      if (!region) {
        await interaction.editReply({ content: `❌ No region found for the village **${currentVillage}**.` });
        return;
      }

      const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
      if (monstersByCriteria.length === 0) {
        await interaction.editReply({ content: `❌ No monsters found for village **${currentVillage}** and job **${job}**.` });
        return;
      }

      const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
      const availableMonstersCount = encounterResult.monsters.length;

      if (encounterResult.encounter === 'No Encounter') {
        const embed = createNoEncounterEmbed(character);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (availableMonstersCount === 0) {
        await interaction.editReply({ content: `❌ No suitable monsters found for the encounter based on village **${currentVillage}** and job **${job}**.` });
        return;
      }

      const encounteredMonster = encounterResult.monsters[Math.floor(Math.random() * availableMonstersCount)];
      const items = await fetchItemsByMonster(encounteredMonster.name);

      // Calculate the final value (FV) using the new function
      const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

      const weightedItems = createWeightedItemList(items, adjustedRandomValue);

      const outcome = await getEncounterOutcome(character, encounteredMonster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

      let heartsRemaining = character.currentHearts;
      if (outcome.hearts) {
        await useHearts(character._id, outcome.hearts);
        heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
        if (outcome.result === 'KO') {
          await handleKO(character._id);
        }
      }

      await updateCurrentHearts(character._id, heartsRemaining);

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

      if (outcome.canLoot && weightedItems.length > 0 && !outcome.hearts) {
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const lootedItem = weightedItems[randomIndex];

        // Special logic for Chuchus
        if (encounteredMonster.name.includes("Chuchu")) {
          const jellyType = encounteredMonster.name.includes("Ice") ? 'White Chuchu Jelly'
            : encounteredMonster.name.includes("Fire") ? 'Red Chuchu Jelly'
            : encounteredMonster.name.includes("Electric") ? 'Yellow Chuchu Jelly'
            : 'Chuchu Jelly';
          const quantity = encounteredMonster.name.includes("Large") ? 3
            : encounteredMonster.name.includes("Medium") ? 2
            : 1;  // Set the quantity based on Chuchu type
          lootedItem.itemName = jellyType;
          lootedItem.quantity = quantity;
        } else {
          lootedItem.quantity = 1;  // Default quantity for non-Chuchu items
        }

        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
          const embed = createMonsterEncounterEmbed(character, encounteredMonster, outcomeMessage, heartsRemaining, lootedItem);
          await interaction.editReply({ content: `❌ Invalid or missing Google Sheets URL for character ${characterName}.`, embeds: [embed] });
          return;
        }

        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

        const values = [[
          character.name,                    // Character Name
          lootedItem.itemName,               // Item Name
          lootedItem.quantity.toString(),    // Qty of Item
          lootedItem.category.join(', '),    // Category
          lootedItem.type.join(', '),        // Type
          lootedItem.subtype.join(', '),     // Subtype
          'Looted',                          // Obtain
          character.job,                     // Job
          '',                                // Perk
          character.currentVillage,          // Location
          interactionUrl,                    // Link
          formattedDateTime,                 // Date/Time
          uniqueSyncId                       // Synced?
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
      await interaction.editReply({ content: `❌ An error occurred during the loot command execution. Please try again later.` });
    }
  },

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
          value: character.name
        }));

        const filteredChoices = choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);

        await interaction.respond(filteredChoices);
      }
    } catch (error) {
      // Handle error
    }
  }
};
