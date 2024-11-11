// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { syncInventory } = require('./syncHandler');
const { getCharacterInventoryCollection } = require('../utils/inventoryUtils');

// ------------------- Constants -------------------
const ITEMS_PER_PAGE = 25;

// ------------------- Command definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Display and sync your character inventory from Google Sheets.')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)), // Autocomplete for character names

  // ------------------- Main function to display and sync inventory -------------------
  async execute(interaction) {
    try {
      // Get character name and user ID from interaction
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // Fetch character from database
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.reply({ content: `❌ **Character ${characterName} not found or does not belong to you.**`, ephemeral: true });
        return;
      }

      const characterId = character._id;

      // Sync the inventory from Google Sheets to MongoDB
      await syncInventory(characterId);

      // Fetch the updated inventory
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId }).toArray();

      if (!inventoryItems.length) {
        await interaction.reply({ content: `❌ **No inventory items found for character ${characterName}.**`, ephemeral: true });
        return;
      }

      // ------------------- Combine and alphabetize inventory items -------------------
      const combinedItems = inventoryItems.reduce((acc, item) => {
        const existingItem = acc.find(i => i.name === item.name);
        if (existingItem) {
          existingItem.quantity += item.quantity;
        } else {
          acc.push({ name: item.name, quantity: item.quantity, type: item.type });
        }
        return acc;
      }, []).sort((a, b) => a.name.localeCompare(b.name));

      // ------------------- Group items by type -------------------
      const itemsByType = combinedItems.reduce((acc, item) => {
        if (!acc[item.type]) {
          acc[item.type] = [];
        }
        acc[item.type].push(item);
        return acc;
      }, {});

      // Sort types alphabetically
      const types = Object.keys(itemsByType).sort((a, b) => a.localeCompare(b));

      let currentType = types[0];
      let currentPage = 1;

      // ------------------- Function to get inventory page -------------------
      const getInventoryPage = (type, page) => {
        const items = itemsByType[type];
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return items.slice(startIndex, endIndex);
      };

      // ------------------- Function to generate inventory embed -------------------
      const generateEmbed = (type, page) => {
        const items = getInventoryPage(type, page);
        return {
          title: `${characterName}'s Inventory - ${type}`,
          description: items.map(item => `${item.name}: ${item.quantity}`).join('\n'),
          footer: { text: `Page ${page} of ${Math.ceil(itemsByType[type].length / ITEMS_PER_PAGE)}` }
        };
      };

      // ------------------- Initial inventory display -------------------
      await interaction.reply({ embeds: [generateEmbed(currentType, currentPage)] });

      // ------------------- Create action row for pagination buttons -------------------
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

      // ------------------- Collector to handle button interactions -------------------
      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        if (i.customId === `next|${characterId}`) {
          currentPage++;
        } else if (i.customId === `prev|${characterId}`) {
          currentPage--;
        }

        const embed = generateEmbed(currentType, currentPage);

        await i.update({ embeds: [embed], components: [row] });

        // Update button states
        row.components[0].setDisabled(currentPage === 1);
        row.components[1].setDisabled(currentPage === Math.ceil(itemsByType[currentType].length / ITEMS_PER_PAGE));
      });

      // Disable buttons after interaction time expires
      collector.on('end', () => {
        row.components.forEach(component => component.setDisabled(true));
        interaction.editReply({ components: [row] });
      });

    } catch (error) {
      console.error("Error fetching inventory:", error);
      await interaction.reply({ content: `❌ An error occurred while fetching the inventory.`, ephemeral: true });
    }
  }
};
