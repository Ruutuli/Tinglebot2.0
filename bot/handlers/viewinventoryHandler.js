// ------------------- viewinventoryHandler.js -------------------
// This module defines a slash command to display and sync a character's inventory from Google Sheets.
// It fetches character data from the database, synchronizes inventory data, groups and paginates items,
// and handles user interactions for pagination.

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
// Sorted alphabetically for quick lookup.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

const { handleError } = require('@/shared/utils/globalErrorHandler');
// ============================================================================
// Database Services
// ------------------- Importing database service functions -------------------
const { fetchCharacterByNameAndUserId } = require('@/shared/database/db');

// ============================================================================
// Modules
// ------------------- Importing additional modules -------------------
const { syncInventory } = require('./syncHandler');

// ============================================================================
// Utility Functions
// ------------------- Importing utility functions -------------------
const { getCharacterInventoryCollection } = require('@/shared/utils/inventoryUtils');


// ------------------- Constants -------------------
// Number of inventory items to display per page.
const ITEMS_PER_PAGE = 25;


// ------------------- Command Definition -------------------
// Defines the /inventory slash command with autocomplete for character names.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Display and sync your character inventory from Google Sheets.')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)), // Autocomplete for character names

  // ------------------- Main Execution Function -------------------
  // This function fetches the character data, synchronizes the inventory,
  // processes the inventory items (combining duplicates, grouping by type, and sorting),
  // and then displays the inventory with pagination.
  async execute(interaction) {
    try {
      // ------------------- Retrieve Character Data -------------------
      // Extract the character name and user ID from the interaction.
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // Fetch character from the database.
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.reply({ content: `❌ **Character ${characterName} not found or does not belong to you.**`, flags: [4096] });
        return;
      }
      const characterId = character._id;

      // ------------------- Synchronize Inventory -------------------
      // Sync the inventory from Google Sheets to the database.
      await syncInventory(characterId);

      // ------------------- Retrieve Inventory Items -------------------
      // Fetch the updated inventory collection and convert to an array.
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId }).toArray();

      if (!inventoryItems.length) {
        await interaction.reply({ content: `❌ **No inventory items found for character ${characterName}.**`, flags: [4096] });
        return;
      }

      // ------------------- Process Inventory Items with Crafting Status -------------------
      // Keep crafted and non-crafted items separate, filter out zero quantities, then sort items alphabetically.
      const processedItems = inventoryItems
        .filter(item => item.quantity > 0) // Remove items with zero quantity
        .map(item => {
          // Determine if item is crafted
          const obtainMethod = (item.obtain || '').toString().toLowerCase();
          const isCrafted = obtainMethod.includes("crafting") || obtainMethod.includes("crafted");
          
          return {
            name: item.itemName,
            quantity: item.quantity,
            type: item.type,
            isCrafted: isCrafted,
            obtain: item.obtain || 'Unknown',
            craftedAt: item.craftedAt
          };
        })
        .sort((a, b) => {
          // Sort by name first, then by crafting status (non-crafted first)
          const nameCompare = a.name.localeCompare(b.name);
          if (nameCompare !== 0) return nameCompare;
          return a.isCrafted ? 1 : -1;
        });

      // ------------------- Group Items by Type -------------------
      // Group processed items by their type for organized display.
      const itemsByType = processedItems.reduce((acc, item) => {
        if (!acc[item.type]) {
          acc[item.type] = [];
        }
        acc[item.type].push(item);
        return acc;
      }, {});

      // Sort types alphabetically.
      const types = Object.keys(itemsByType).sort((a, b) => a.localeCompare(b));

      // Set initial display type and page.
      let currentType = types[0];
      let currentPage = 1;

      // ------------------- Helper Function: getInventoryPage -------------------
      // Returns a paginated subset of items for the given type and page.
      const getInventoryPage = (type, page) => {
        const items = itemsByType[type];
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return items.slice(startIndex, endIndex);
      };

      // ------------------- Helper Function: generateEmbed -------------------
      // Generates an embed object containing inventory details for the given type and page.
      const generateEmbed = (type, page) => {
        const items = getInventoryPage(type, page);
        const itemDescriptions = items.map(item => {
          const craftingStatus = item.isCrafted ? '🔨' : '📦';
          const craftedDate = item.craftedAt ? ` (${new Date(item.craftedAt).toLocaleDateString()})` : '';
          return `${craftingStatus} **${item.name}**: ${item.quantity}${craftedDate}`;
        });
        
        return {
          title: `${characterName}'s Inventory - ${type}`,
          description: itemDescriptions.join('\n'),
          footer: { 
            text: `Page ${page} of ${Math.ceil(itemsByType[type].length / ITEMS_PER_PAGE)} | 🔨 = Crafted, 📦 = Found/Other` 
          }
        };
      };

      // ------------------- Initial Inventory Display -------------------
      // Reply with the first page of the inventory embed.
      await interaction.reply({ embeds: [generateEmbed(currentType, currentPage)] });

      // ------------------- Create Pagination Buttons -------------------
      // Build an action row with "Previous" and "Next" buttons for pagination.
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`prev|${characterId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`next|${characterId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.followUp({ components: [row] });

      // ------------------- Collector for Button Interactions -------------------
      // Create a collector to handle pagination button clicks.
      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        // Update page number based on button clicked.
        if (i.customId === `next|${characterId}`) {
          currentPage++;
        } else if (i.customId === `prev|${characterId}`) {
          currentPage--;
        }

        // Generate updated embed and update the interaction.
        const embed = generateEmbed(currentType, currentPage);
        await i.update({ embeds: [embed], components: [row] });

        // Update button states based on current page.
        row.components[0].setDisabled(currentPage === 1);
        row.components[1].setDisabled(currentPage === Math.ceil(itemsByType[currentType].length / ITEMS_PER_PAGE));
      });

      // ------------------- Disable Buttons After Timeout -------------------
      // Once the collector ends, disable the pagination buttons.
      collector.on('end', () => {
        row.components.forEach(component => component.setDisabled(true));
        interaction.editReply({ components: [row] });
      });

    } catch (error) {
    handleError(error, 'viewinventoryHandler.js');

      console.error("[viewinventoryHandler.js]: logs Error fetching inventory:", error);
      await interaction.reply({ content: `❌ An error occurred while fetching the inventory.`, flags: [4096] });
    }
  }
};
