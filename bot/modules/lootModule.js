// ------------------- Import necessary modules -------------------
// Discord.js EmbedBuilder for creating rich embeds
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('@app/shared/utils/globalErrorHandler');
// Module imports for random number generation and inventory management
const { createWeightedItemList, calculateFinalValue } = require('../modules/rngModule');
const { fetchItemsByMonster, fetchCharacterByName } = require('@app/shared/database/db');
const { addItemInventoryDatabase } = require('@app/shared/utils/inventoryUtils');
const { extractSpreadsheetId } = require('@app/shared/utils/googleSheetsUtils');
const { authorizeSheets, appendSheetData,  safeAppendDataToSheet, } = require('@app/shared/utils/googleSheetsUtils');

// Additional utilities and services
const { v4: uuidv4 } = require('uuid');

// Monster data for reference
const { monsterMapping } = require('@app/shared/models/MonsterModel');

// ------------------- Fetch all characters in the battle -------------------
// Retrieves character data for all characters involved in the battle
const fetchAllBattleCharacters = async (charactersArray) => {
  let characters = [];
  for (const charName of charactersArray) {
    const character = await fetchCharacterByName(charName);  // Fetch character by name
    if (character) {
      characters.push(character);
    } else {
      console.error(`Character ${charName} not found`);  // Log error if character isn't found
    }
  }
  return characters;
};

// ------------------- Loot Handling Function -------------------
// Processes loot for all characters in the battle and updates their inventory
async function processLoot(battleProgress, currentMonster, interaction, battleId) {
  let lootMessage = '';  // Initialize loot message to track loot results

  try {
    const items = await fetchItemsByMonster(currentMonster.name);  // Fetch loot items for the monster

    // Fetch all characters from the battle
    const characters = await fetchAllBattleCharacters(battleProgress.characters);

    // Process loot for each character
    for (const character of characters) {
      // Check for blight stage 4 effect (no gathering)
      if (character.blightEffects?.noGathering) {
        lootMessage += `\n${character.name} cannot gather items due to advanced blight stage.`;
        continue;
      }

      const diceRoll = Math.floor(Math.random() * 100) + 1;
      const { adjustedRandomValue } = calculateFinalValue(character, diceRoll);  // Calculate adjusted roll value
      const weightedItems = createWeightedItemList(items, adjustedRandomValue);  // Create weighted list of loot items

      if (weightedItems.length > 0) {
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const lootedItem = weightedItems[randomIndex];  // Select random loot item

        // Add loot to the character's inventory
        const quantity = lootedItem.quantity ? lootedItem.quantity.toString() : '1';
        const category = lootedItem.category ? lootedItem.category.join(', ') : 'Unknown';
        const type = lootedItem.type ? lootedItem.type.join(', ') : 'Unknown';

        await addItemInventoryDatabase(character._id, lootedItem.itemName, quantity, interaction, "Looted");

        // Note: Google Sheets sync is handled by addItemInventoryDatabase

        // Create a link to the character's inventory for the loot message
        const inventoryLinkFormatted = `[${character.name}](<${inventoryLink}>)`;
        lootMessage += `\n${inventoryLinkFormatted} looted ${lootedItem.emoji || ''} **${lootedItem.itemName}**!`;

      } else {
        lootMessage += `\n${character.name} did not find any loot.`;  // Message if no loot was found
      }
    }
  } catch (error) {
    handleError(error, 'lootModule.js');

    console.error('Error processing loot:', error);
    lootMessage += `⚠️ **Error processing loot:** ${error.message}`;  // Error handling
  }

  // ------------------- Create and send loot embed -------------------
  const monsterData = monsterMapping[currentMonster.nameMapping] || {};  // Fetch monster data
  const monsterImage = monsterData.image || currentMonster.image;

  const lootEmbed = new EmbedBuilder()
    .setTitle(`🎉 **${currentMonster.name} Defeated!**`)
    .setDescription(`Loot has been rolled for all characters!`)
    .addFields({ name: '__Loot Results__', value: lootMessage })
    .setColor('#FFD700')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setThumbnail(monsterImage)
    .setFooter({ text: `Battle ID: ${battleId}` });

  try {
    await interaction.followUp({ embeds: [lootEmbed] });
  } catch (error) {
    handleError(error, 'lootModule.js');

    console.error('Error sending loot embed:', error);  // Error handling if sending embed fails
  }

  // ------------------- Cleanup completed -------------------
  console.log(`[lootModule.js]: ✅ Loot processing completed for battle ${battleId}`);
}

// ------------------- Export Loot Processing Function -------------------
module.exports = { processLoot };
