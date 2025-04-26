// ============================================================================
// Imports
// ============================================================================

// ------------------- Standard Libraries -------------------
// None

// ------------------- Discord.js Components -------------------
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

// ------------------- Project Utilities -------------------
const { fetchCharacterById, getCharacterInventoryCollection } = require('../../database/db.js');
const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { typeColors } = require('../../modules/formattingModule.js');

// ------------------- Database Models -------------------
const ItemModel = require('../../models/ItemModel.js');

// ------------------- Project Embeds -------------------
const { formatItemDetails } = require('../../embeds/embeds.js');

// ============================================================================
// Constants
// ============================================================================
const ITEMS_PER_PAGE = 25;
const DEFAULT_EMOJI = '🔹';
const MAX_DESCRIPTION_LENGTH = 4096;

// ============================================================================
// Command Definition
// ============================================================================
module.exports = {
  // ------------------- Slash Command Data -------------------
  data: new SlashCommandBuilder()
    .setName('viewinventory')
    .setDescription('View the inventory of a character.')
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ------------------- Execute Command -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const characterId = interaction.options.getString('charactername');
      if (!characterId) {
        await interaction.editReply({ content: '❌ **Character ID is required.**' });
        return;
      }

      const character = await fetchCharacterById(characterId);
      if (!character) {
        await interaction.editReply({ content: `❌ **Character with ID \`${characterId}\` not found.**` });
        return;
      }

      if (!character.inventorySynced) {
        await interaction.editReply({
          content: `❌ **Cannot view inventory because inventory for **${character.name}** is not set up yet. Use </testinventorysetup:1306176790095728732> then </syncinventory:1306176789894266898> to initialize.**`
        });
        return;
      }

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();

      if (!inventoryItems.length) {
        await interaction.editReply({ content: `❌ **No inventory items found for \`${character.name}\`.**` });
        return;
      }

      // ------------------- Fetch and Combine Items -------------------
      const itemDetails = await Promise.all(
        inventoryItems.map(async item => {
          const detail = await ItemModel.findOne({ itemName: item.itemName });
          return {
            ...item,
            emoji: (detail && detail.emoji) || DEFAULT_EMOJI
          };
        })
      );

      const combinedItems = itemDetails
        .reduce((acc, item) => {
          const existing = acc.find(i => i.itemName === item.itemName);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            acc.push({
              itemName: item.itemName,
              quantity: item.quantity,
              type: item.type,
              emoji: item.emoji
            });
          }
          return acc;
        }, [])
        .sort((a, b) => a.itemName.localeCompare(b.itemName));

      // ------------------- Group Items by Type -------------------
      const itemsByType = combinedItems.reduce((acc, item) => {
        let types = item.type.split(',').map(t => t.trim());
        if (item.itemName.toLowerCase() === 'job voucher') types = ['Job Voucher'];
        types.forEach(type => {
          acc[type] = acc[type] || [];
          acc[type].push(item);
        });
        return acc;
      }, {});
      itemsByType['All'] = combinedItems;

      const types = Object.keys(itemsByType).sort((a, b) => a.localeCompare(b));
      let currentType = 'All';
      let currentPage = 0;

      // ------------------- Helper: Generate Inventory Embed -------------------
      const generateEmbed = (type, page) => {
        const items = itemsByType[type] || [];
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const slice = items.slice(start, end);

        let description = slice
          .map(item => formatItemDetails(item.itemName, item.quantity, item.emoji))
          .join('\n');
        if (description.length > MAX_DESCRIPTION_LENGTH) {
          description = `${description.substring(0, MAX_DESCRIPTION_LENGTH - 3)}...`;
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

      // ------------------- Helper: Generate Type Dropdown -------------------
      const generateTypeDropdown = () => {
        const options = types.slice(0, 25).map(type => ({ label: type, value: type }));
        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('type-select')
            .setPlaceholder('Select a Category')
            .addOptions(options)
        );
      };

      // ------------------- Helper: Generate Pagination Buttons -------------------
      const generatePagination = () => {
        const totalPages = Math.ceil((itemsByType[currentType] || []).length / ITEMS_PER_PAGE);
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`prev|${characterId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId(`next|${characterId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages - 1)
        );
      };

      // ------------------- Initial Reply -------------------
      const message = await interaction.editReply({
        embeds: [generateEmbed(currentType, currentPage)],
        components: [generateTypeDropdown(), generatePagination()]
      });

      // ------------------- Interaction Collector -------------------
      const collector = message.createMessageComponentCollector({ time: 600000 });
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: '❌ **You cannot use these controls.**', ephemeral: true });
          return;
        }
        if (i.customId === 'type-select') {
          currentType = i.values[0];
          currentPage = 0;
        } else if (i.customId.startsWith('prev|')) {
          currentPage--;
        } else if (i.customId.startsWith('next|')) {
          currentPage++;
        }
        await i.update({
          embeds: [generateEmbed(currentType, currentPage)],
          components: [generateTypeDropdown(), generatePagination()]
        });
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (err) {
          handleError(err, __filename);
          console.error('[viewinventory.js]: Error clearing components on collector end', err);
        }
      });

    } catch (error) {
      handleError(error, __filename);
      console.error('[viewinventory.js]: Error executing command', error);
      await interaction.editReply({ content: '❌ **An error occurred while processing the command.**' });
    }
  },

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    try {
      await handleAutocomplete(interaction);
    } catch (error) {
      handleError(error, __filename);
      console.error('[viewinventory.js]: Autocomplete error', error);
    }
  }
};
