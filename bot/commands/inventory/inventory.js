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
  StringSelectMenuBuilder,
  MessageFlags
} = require('discord.js');

// ------------------- Database Services -------------------
const {
  connectToTinglebot,
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  fetchCharactersByUserId,
  fetchModCharacterByNameAndUserId,
  getCharacterInventoryCollection
} = require('@/database/db.js');

// ------------------- Project Utilities -------------------
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
// Google Sheets functionality removed
const { typeColors, capitalize } = require('../../modules/formattingModule.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { removeNegativeQuantityEntries } = require('@/utils/inventoryUtils.js');

// ------------------- Database Models -------------------
const ItemModel = require('@/models/ItemModel.js');

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
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manage your character\'s inventory')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your character\'s inventory')
        .addStringOption(option =>
          option
            .setName('charactername')
            .setDescription('The name of the character')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // ============================================================================
  // Command Execution
  // ============================================================================
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'view':
          await this.handleView(interaction);
          break;
        default:
          await interaction.reply({ 
            embeds: [new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Invalid Command')
              .setDescription('The subcommand you used is not recognized.')
              .addFields(
                { name: '🔍 Available Commands', value: '• `/inventory view` - View your inventory' },
                { name: '💡 Suggestion', value: 'Please use `/inventory view` to view your character\'s inventory.' }
              )
              .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
              .setFooter({ text: 'Command Validation' })
              .setTimestamp()],
            flags: [MessageFlags.Ephemeral]
          });
      }
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'inventory.js',
        subcommand: interaction.options?.getSubcommand()
      });
    }
  },

  // ============================================================================
  // Subcommand Handlers
  // ============================================================================

  // ------------------- View Handler -------------------
  async handleView(interaction) {
    try {
      // Check if interaction is still valid before deferring
      if (!interaction.isRepliable()) {
        console.log('[inventory.js]: Interaction is no longer repliable');
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const fullCharacterName = interaction.options.getString('charactername');
      const characterName = fullCharacterName?.split(' | ')[0]?.trim();
      
      if (!characterName) {
        await interaction.editReply({ 
          embeds: [new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Missing Character Name')
            .setDescription('You must provide a character name to view their inventory.')
            .addFields(
              { name: '🔍 Required Format', value: '• Use the character name exactly as it appears in the game\n• Example: `/inventory view character:Link`' },
              { name: '💡 Suggestion', value: 'Please try the command again with a valid character name.' }
            )
            .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
            .setFooter({ text: 'Command Validation' })
            .setTimestamp()],
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      await connectToTinglebot();
      let character = await fetchCharacterByName(characterName);
      
      // If not found as regular character, try as mod character
      if (!character) {
        const { fetchModCharacterByNameAndUserId } = require('@/database/db');
        character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
      }
      
      if (!character) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Character Not Found')
            .setDescription(`The character "${characterName}" does not exist in the database.`)
            .addFields(
              { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
              { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
            )
            .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
            .setFooter({ text: 'Character Validation' })
            .setTimestamp()],
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          content: error.message,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      // Include both regular and mod character _ids so items added under either (e.g. raid loot) show
      const regularChar = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      const modChar = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
      const characterIds = [regularChar?._id, modChar?._id].filter(Boolean);

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      await removeNegativeQuantityEntries(inventoryCollection);
      const inventoryItems = await inventoryCollection.find(
        characterIds.length > 0
          ? { characterId: { $in: characterIds } }
          : { characterId: character._id }
      ).toArray();

      if (!inventoryItems.length) {
        await interaction.editReply({ content: `❌ No inventory items found for \`${character.name}\`.` });
        return;
      }

      // Fetch and combine items
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
        .filter(item => item.quantity > 0) // Remove items with zero quantity
        .sort((a, b) => a.itemName.localeCompare(b.itemName));

      // Group items by type
      const itemsByType = combinedItems.reduce((acc, item) => {
        let types = Array.isArray(item.type) ? item.type : [item.type || 'Unknown'];
        if (item.itemName.toLowerCase() === 'job voucher') types = ['Job Voucher'];
        types.forEach(type => {
          acc[type] = acc[type] || [];
          acc[type].push(item);
        });
        return acc;
      }, {});
      itemsByType['All'] = combinedItems;

      // Add Recipe filter for cooked food items
      const recipeItems = combinedItems.filter(item => {
        const categories = Array.isArray(item.category) ? item.category : [item.category || 'Unknown'];
        return categories.includes('Recipe');
      });
      
      if (recipeItems.length > 0) {
        itemsByType['Recipe'] = recipeItems;
      }

      const types = Object.keys(itemsByType).sort((a, b) => a.localeCompare(b));
      let currentType = 'All';
      let currentPage = 0;

      // Generate initial embed and components
      const message = await interaction.editReply({
        embeds: [this.generateEmbed(character, currentType, currentPage, itemsByType)],
        components: [
          this.generateTypeDropdown(types),
          this.generatePagination(currentPage, itemsByType[currentType].length)
        ]
      });

      // Set up collector for interactions
      const collector = message.createMessageComponentCollector({ 
        time: 300000,
        filter: i => i.user.id === interaction.user.id
      });

      collector.on('collect', async i => {
        try {
          if (!i.isRepliable()) {
            console.log('[inventory.js]: Component interaction is no longer repliable');
            collector.stop();
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
            embeds: [this.generateEmbed(character, currentType, currentPage, itemsByType)],
            components: [
              this.generateTypeDropdown(types),
              this.generatePagination(currentPage, itemsByType[currentType].length)
            ]
          });
        } catch (error) {
          console.error('[inventory.js]: ❌ Error updating interaction', error);
          
          if (error.code === 10062) { // Unknown interaction error
            console.log('[inventory.js]: 🔄 Interaction expired, stopping collector');
            collector.stop();
            return;
          }
          
          // Handle other errors with proper context
          await handleInteractionError(error, i, {
            source: 'inventory.js',
            commandName: 'inventory view',
            characterName: character.name,
            subcommand: 'view'
          });
        }
      });

      collector.on('end', async () => {
        try {
          if (interaction.isRepliable()) {
            await interaction.editReply({ components: [] }).catch(() => {});
          }
        } catch (err) {
          console.error('[inventory.js]: ❌ Error clearing components on collector end', err);
        }
      });

    } catch (error) {
      handleInteractionError(error, 'inventory.js');
      console.error('[inventory.js]: Error in handleView', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ An error occurred while viewing the inventory.',
            flags: [MessageFlags.Ephemeral]
          });
        } else {
          await interaction.editReply({ 
            content: '❌ An error occurred while viewing the inventory.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      } catch (replyError) {
        console.error('[inventory.js]: Error sending error message:', replyError);
      }
    }
  },

  // ============================================================================
  // Helper Functions
  // ============================================================================

  // ------------------- Generate Embed -------------------
  generateEmbed(character, type, page, itemsByType) {
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
        iconURL: character.icon
      })
      .setDescription(description)
      .setFooter({ text: `${type} ▴ Page ${page + 1} of ${totalPages}` });
  },

  // ------------------- Generate Type Dropdown -------------------
  generateTypeDropdown(types) {
    // Sort types to prioritize "Recipe" at the top, then "All", then alphabetically
    const sortedTypes = types.sort((a, b) => {
      if (a === 'Recipe') return -1;
      if (b === 'Recipe') return 1;
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return a.localeCompare(b);
    });
    
    const options = sortedTypes.slice(0, 25).map(type => ({ label: type, value: type }));
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('type-select')
        .setPlaceholder('Select a Category')
        .addOptions(options)
    );
  },

  // ------------------- Generate Pagination -------------------
  generatePagination(currentPage, totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`prev|${currentPage}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`next|${currentPage}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1)
    );
  },
}; 