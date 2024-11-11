// ------------------- Import necessary modules -------------------
// Discord.js EmbedBuilder for creating rich embeds
const { EmbedBuilder } = require('discord.js');

// Module imports for random number generation and inventory management
const { createWeightedItemList, calculateFinalValue } = require('../modules/rngModule');
const { fetchItemsByMonster } = require('../database/itemService');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId } = require('../utils/validation');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');

// Additional utilities and services
const { v4: uuidv4 } = require('uuid');
const { fetchCharacterByName } = require('../database/characterService');
const { storeBattleProgress, deleteBattleProgressById } = require('../modules/combatModule');

// Monster data for reference
const { monsterMapping } = require('../models/MonsterModel');

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
      const { adjustedRandomValue } = calculateFinalValue(character);  // Calculate adjusted roll value
      const weightedItems = createWeightedItemList(items, adjustedRandomValue);  // Create weighted list of loot items

      if (weightedItems.length > 0) {
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const lootedItem = weightedItems[randomIndex];  // Select random loot item

        // Add loot to the character's inventory
        const quantity = lootedItem.quantity ? lootedItem.quantity.toString() : '1';
        const category = lootedItem.category ? lootedItem.category.join(', ') : 'Unknown';
        const type = lootedItem.type ? lootedItem.type.join(', ') : 'Unknown';

        await addItemInventoryDatabase(character._id, lootedItem.itemName, quantity, category, type, interaction);

        // Update Google Sheets with the new inventory
        const inventoryLink = character.inventory || character.inventoryLink;
        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const values = [[
          character.name, lootedItem.itemName, quantity, category, type,
          lootedItem.subtype ? lootedItem.subtype.join(', ') : 'N/A', 'Looted', character.job, '',
          character.currentVillage, interactionUrl, formattedDateTime, uuidv4()
        ]];

        await appendSheetData(auth, spreadsheetId, range, values);  // Append data to the Google Sheet

        // Create a link to the character's inventory for the loot message
        const inventoryLinkFormatted = `[${character.name}](<${inventoryLink}>)`;
        lootMessage += `\n${inventoryLinkFormatted} looted ${lootedItem.emoji || ''} **${lootedItem.itemName}**!`;

      } else {
        lootMessage += `\n${character.name} did not find any loot.`;  // Message if no loot was found
      }
    }
  } catch (error) {
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
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setThumbnail(monsterImage)
    .setFooter({ text: `Battle ID: ${battleId}` });

  try {
    await interaction.followUp({ embeds: [lootEmbed] });
  } catch (error) {
    console.error('Error sending loot embed:', error);  // Error handling if sending embed fails
  }

  // ------------------- Delete the battle progress from the file -------------------
  try {
    await deleteBattleProgressById(battleId);  // Delete battle progress after loot is processed
  } catch (error) {
    console.error('Error deleting battle progress:', error);  // Error handling for deletion
  }
}

// ------------------- Export Loot Processing Function -------------------
module.exports = { processLoot };
