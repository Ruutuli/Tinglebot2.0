// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { fetchCharacterById, getCharacterInventoryCollection } = require('../database/characterService');
const { connectToInventories } = require('../database/connection');
const { handleAutocomplete } = require('../handlers/autocompleteHandler');
const { typeColors } = require('../modules/formattingModule');
const ItemModel = require('../models/ItemModel');
const { formatItemDetails } = require('../embeds/embedUtils');

// ------------------- Constants -------------------
const ITEMS_PER_PAGE = 25;
const DEFAULT_EMOJI = '🔹';
const MAX_DESCRIPTION_LENGTH = 4096;

module.exports = {
  // ------------------- Slash command definition -------------------
  data: new SlashCommandBuilder()
    .setName('viewinventory')
    .setDescription('View the inventory of a character.')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Execute command to view character inventory -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const characterId = interaction.options.getString('charactername');
      const character = await fetchCharacterById(characterId);

      // Handle case when character is not found
      if (!character) {
        await interaction.editReply({ content: `❌ **Character with ID \`${characterId}\` not found.**` });
        return;
      }

      // Check if the character's inventory has been synced
if (!character.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot view the inventory because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}


      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();

      // Handle case when no inventory items are found
      if (!inventoryItems.length) {
        await interaction.editReply({ content: `❌ **No inventory items found for character \`${character.name}\`.**` });
        return;
      }

      // Fetch item details with correct emojis
      const itemDetails = await Promise.all(inventoryItems.map(async item => {
        const itemDetail = await ItemModel.findOne({ itemName: item.itemName });
        return {
          ...item,
          emoji: itemDetail ? itemDetail.emoji || DEFAULT_EMOJI : DEFAULT_EMOJI
        };
      }));

      const combinedItems = itemDetails.reduce((acc, item) => {
        const existingItem = acc.find(i => i.itemName === item.itemName);
        if (existingItem) {
          existingItem.quantity += item.quantity;
        } else {
          acc.push({ itemName: item.itemName, quantity: item.quantity, type: item.type, emoji: item.emoji });
        }
        return acc;
      }, []).sort((a, b) => a.itemName.localeCompare(b.itemName));

      const itemsByType = combinedItems.reduce((acc, item) => {
        const types = item.type.split(', ').map(type => type.trim());
        types.forEach(type => {
          if (!acc[type]) {
            acc[type] = [];
          }
          acc[type].push(item);
        });
        return acc;
      }, {});

      itemsByType['All'] = combinedItems; // Include "All" category

      const types = Object.keys(itemsByType).sort((a, b) => a.localeCompare(b));
      let currentType = 'All';
      let currentPage = 0;

      // Function to generate inventory embed
      const generateEmbed = (type, page) => {
        const items = itemsByType[type];
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const itemsToDisplay = items.slice(start, end);

        let description = itemsToDisplay.map(item => formatItemDetails(item.itemName, item.quantity, item.emoji)).join('\n');
        if (description.length > MAX_DESCRIPTION_LENGTH) {
          description = description.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
        }
        if (!description) description = 'No items to display.';

        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

        return new EmbedBuilder()
          .setColor(typeColors[type] || '#0099ff')
          .setAuthor({
            name: `${character.name}: Inventory`,
            iconURL: character.icon,
            url: `https://example.com/inventory/${characterId}`
          })
          .setDescription(description)
          .setFooter({ text: `${type} ▴ Page ${page + 1} of ${totalPages}` });
      };

      // Generate type dropdown
      const generateTypeDropdown = () => new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('type-select')
          .setPlaceholder('Select a Category')
          .addOptions(types.map(type => ({
            label: type,
            value: type
          })))
      );

      // Generate pagination buttons
      const paginationRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`prev|${characterId}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`next|${characterId}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === Math.ceil(itemsByType[currentType].length / ITEMS_PER_PAGE) - 1)
      );

      // Initial reply with embed and buttons
      const message = await interaction.editReply({
        embeds: [generateEmbed(currentType, currentPage)],
        components: [generateTypeDropdown(), paginationRow()],
      });

      // Create collector for interaction handling
      const collector = message.createMessageComponentCollector({ time: 600000 }); // 10 minutes

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: '❌ **You cannot use these buttons.**', ephemeral: true });
          return;
        }

        if (i.customId.startsWith('type-select')) {
          currentType = i.values[0];
          currentPage = 0;
        } else if (i.customId.startsWith('prev|')) {
          currentPage--;
        } else if (i.customId.startsWith('next|')) {
          currentPage++;
        }

        await i.update({
          embeds: [generateEmbed(currentType, currentPage)],
          components: [generateTypeDropdown(), paginationRow()],
        });
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (error) {
          console.error('Error editing reply on collector end:', error);
        }
      });

    } catch (error) {
      console.error('Error executing command:', error);
      await interaction.editReply({ content: '❌ **An error occurred while processing the command.**' });
    }
  },

  // ------------------- Autocomplete handler -------------------
  async autocomplete(interaction) {
    await handleAutocomplete(interaction);
  }
};
