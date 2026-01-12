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
  getCharacterInventoryCollection
} = require('../../../shared/database/db.js');

// ------------------- Project Utilities -------------------
const { handleInteractionError } = require('../../../shared/utils/globalErrorHandler.js');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../../shared/utils/googleSheetsUtils.js');
const { authorizeSheets, appendSheetData, getSheetIdByTitle, getActualInventorySheetName, readSheetData, validateInventorySheet } = require('../../../shared/utils/googleSheetsUtils.js');
const { google } = require('googleapis');
const { typeColors, capitalize } = require('../../modules/formattingModule.js');
const { checkInventorySync } = require('../../../shared/utils/characterUtils.js');

// ------------------- Database Models -------------------
const ItemModel = require('../../../shared/models/ItemModel.js');

// ------------------- Project Embeds -------------------
const { createSyncEmbed, createSetupInstructionsEmbed, formatItemDetails } = require('../../embeds/embeds.js');

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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sync your character\'s inventory from Google Sheets')
        .addStringOption(option =>
          option
            .setName('charactername')
            .setDescription('Character name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test if the inventory setup is correct')
        .addStringOption(option =>
          option
            .setName('charactername')
            .setDescription('Character name')
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
        case 'sync':
          await this.handleSync(interaction);
          break;
        case 'test':
          await this.handleTest(interaction);
          break;
        default:
          await interaction.reply({ 
            embeds: [new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Invalid Command')
              .setDescription('The subcommand you used is not recognized.')
              .addFields(
                { name: '🔍 Available Commands', value: '• `/inventory view` - View your inventory\n• `/inventory sync` - Sync your inventory\n• `/inventory test` - Test your inventory connection' },
                { name: '💡 Suggestion', value: 'Please select one of the available subcommands from the dropdown menu.' }
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
        const { fetchModCharacterByNameAndUserId } = require('../../../shared/database/db');
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

      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();

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

  // ------------------- Sync Handler -------------------
  async handleSync(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      await connectToTinglebot();

      let character = await fetchCharacterByNameAndUserId(characterName, userId);
      
      // If not found as regular character, try as mod character
      if (!character) {
        const { fetchModCharacterByNameAndUserId } = require('../../../shared/database/db');
        character = await fetchModCharacterByNameAndUserId(characterName, userId);
      }
      
      if (!character) {
        throw new Error(`Character with name ${characterName} not found.`);
      }

      const inventoryUrl = character.inventory;

      if (!isValidGoogleSheetsUrl(inventoryUrl)) {
        const setupEmbed = await createSetupInstructionsEmbed(
          character.name, 
          inventoryUrl, 
          'Invalid Google Sheets URL. Please check the URL and try again.'
        );
        await interaction.reply({ embeds: [setupEmbed], flags: [MessageFlags.Ephemeral] });
        return;
      }

      if (character.inventorySynced) {
        await interaction.reply({
          content: `🔄 Inventory for ${character.name} has already been synced and cannot be synced again.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      const syncEmbed = createSyncEmbed(character.name, inventoryUrl);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sync-yes|${character._id}`)
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`sync-no|${character._id}`)
          .setLabel('No')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ 
        embeds: [syncEmbed], 
        components: [row], 
        flags: [MessageFlags.Ephemeral] 
      });

    } catch (error) {
      handleInteractionError(error, 'inventory.js');
      console.error('[inventory.js]: Error in handleSync', error);
      await interaction.reply({ content: '❌ An error occurred while syncing inventory.', flags: [MessageFlags.Ephemeral] });
    }
  },

  // ------------------- Test Handler -------------------
  async handleTest(interaction) {
    try {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      await connectToTinglebot();
      console.log('✅ Connected to Tinglebot database.');

      let character = await fetchCharacterByNameAndUserId(characterName, userId);
      
      // If not found as regular character, try as mod character
      if (!character) {
        const { fetchModCharacterByNameAndUserId } = require('../../../shared/database/db');
        character = await fetchModCharacterByNameAndUserId(characterName, userId);
      }
      
      if (!character) {
        throw new Error(`Character with name "${characterName}" not found.`);
      }
      console.log(`✅ Character "${characterName}" found.`);

      const inventoryUrl = character.inventory;
      const spreadsheetId = extractSpreadsheetId(inventoryUrl);

      if (!spreadsheetId) {
        console.error('❌ Invalid Google Sheets URL detected.');
        await this.sendSetupInstructions(interaction, 'invalid_url', character._id, characterName, inventoryUrl);
        return;
      }
      console.log('✅ Spreadsheet ID extracted successfully.');

      const auth = await authorizeSheets();
      console.log('✅ Authorized Google Sheets API.');

      // Check for duplicate tabs before proceeding
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });
      
      const allSheets = spreadsheetInfo.data.sheets || [];
      const loggedInventoryTabs = allSheets.filter(sheet => 
        sheet.properties.title.trim() === 'loggedInventory'
      );
      
      if (loggedInventoryTabs.length > 1) {
        console.error(`❌ Multiple loggedInventory tabs detected (${loggedInventoryTabs.length})`);
        await interaction.editReply({
          content: `❌ **Error:** You have **${loggedInventoryTabs.length} tabs** named \`loggedInventory\` in your spreadsheet.\n\n**Fix:** Please delete all duplicate tabs and keep ONLY ONE tab named \`loggedInventory\`. The tab you keep should be the one that contains your character's starter gear. The bot will get confused if there are multiple tabs with the same name.\n\nAfter deleting duplicates, run \`/inventory test\` again.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      // Get the actual sheet name (preserving spaces) for use in range queries
      const actualSheetName = await getActualInventorySheetName(auth, spreadsheetId);
      if (!actualSheetName) {
        console.error('❌ "loggedInventory" sheet not found in the spreadsheet.');
        await interaction.editReply({
          content: `❌ **Error:** No tab named \`loggedInventory\` found in your spreadsheet.\n\n**Fix:** Please create a tab named exactly \`loggedInventory\` (case-sensitive, no extra spaces) in your spreadsheet.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
      if (!sheetId) {
        console.error('❌ "loggedInventory" sheet not found in the spreadsheet.');
        await interaction.editReply({
          content: `❌ **Error:** No tab named \`loggedInventory\` found in your spreadsheet.\n\n**Fix:** Please create a tab named exactly \`loggedInventory\` (case-sensitive, no extra spaces) in your spreadsheet.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
      console.log('✅ "loggedInventory" sheet ID retrieved successfully.');

      const expectedHeaders = [
        'Character Name', 'Item Name', 'Qty of Item', 'Category', 'Type',
        'Subtype', 'Obtain', 'Job', 'Perk', 'Location', 'Link', 'Date/Time', 'Confirmed Sync'
      ];

      const sheetData = await readSheetData(auth, spreadsheetId, `${actualSheetName}!A1:M1`);
      if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
        console.error('❌ Missing or incorrect headers in "loggedInventory" sheet.');
        await this.sendSetupInstructions(interaction, 'missing_headers', character._id, characterName, inventoryUrl);
        return;
      }
      console.log('✅ Headers in "loggedInventory" sheet are correct.');

      const validationResult = await validateInventorySheet(inventoryUrl, characterName);
      if (!validationResult.success) {
        console.error('❌ Validation failed after header check.');
        
        // Parse the error message for better formatting
        const errorMessage = validationResult.message || 'Unknown validation error';
        const [problem, fix] = errorMessage.split('||');
        
        // Provide a helpful checklist if validation fails
        let checklistMessage = '\n\n**Quick Checklist:**\n';
        checklistMessage += '✅ Is your tab named exactly `loggedInventory` (case-sensitive)?\n';
        checklistMessage += '✅ Do you have only ONE tab with this name?\n';
        checklistMessage += '✅ Are the headers correct in A1:M1?\n';
        checklistMessage += '✅ Have you added your starter gear to the sheet?\n';
        checklistMessage += '✅ Does your Character Name column match your character name exactly?\n';
        checklistMessage += '✅ Is the spreadsheet shared with the service account?';
        
        await interaction.editReply({
          content: `❌ **Validation Failed**\n\n${errorMessage}${checklistMessage}\n\n**Need help?** Run \`/inventory setup\` to see the full setup instructions.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
      console.log('✅ Inventory sheet contains at least one valid item.');

      await interaction.editReply({
        content: `✅ **Success! Communication test passed!**\n\n🛠️ **Inventory setup for** **${character.name}** **has been successfully tested.**\n\n📄 **See your inventory [here](<${inventoryUrl}>)**.\n\n⚠️ **Important:** This test only checked if the bot can communicate with your sheet. It does NOT sync your items to the database.\n\n✅ **Your sheet is set up correctly and contains your starter gear.**\n\n🔄 **Once you're ready, use the** \`/inventory sync\` **command to actually sync your character's inventory to the database.**\n\n⚠️ **Remember:** You can only sync once without Moderator help, so make sure everything is correct before syncing!`,
        flags: [MessageFlags.Ephemeral]
      });

    } catch (error) {
      handleInteractionError(error, 'inventory.js');
      console.error('[inventory.js]: Error in handleTest', error);

      let errorMessage;
      switch (true) {
        case error.message.includes('Character with name'):
          errorMessage = `❌ **Error:** ${error.message}`;
          break;
        case error.message.includes('invalid_url'):
          errorMessage = '❌ **Error:** The provided URL is not valid. Please check and try again.';
          break;
        case error.message.includes('missing_sheet'):
          errorMessage = '❌ **Error:** The Google Sheets document is missing the required "loggedInventory" tab.\n\n**Fix:** Create a tab named exactly `loggedInventory` (case-sensitive, no extra spaces) in your spreadsheet.';
          break;
        case error.message.includes('missing_headers'):
          errorMessage = '❌ **Error:** The "loggedInventory" sheet is missing the required headers.\n\n**Fix:** Make sure headers in A1:M1 match exactly: Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync';
          break;
        case error.message.includes('multiple') || error.message.includes('duplicate'):
          errorMessage = '❌ **Error:** You have multiple tabs named `loggedInventory` in your spreadsheet.\n\n**Fix:** Delete all duplicate tabs and keep ONLY ONE tab named `loggedInventory`. Keep the tab that contains your character\'s starter gear.';
          break;
        case error.message.includes('No items found') || error.message.includes('no items'):
          errorMessage = '❌ **Error:** No items found for your character in the sheet.\n\n**Fix:** Add your character\'s starter gear to the sheet before testing. Make sure the Character Name column matches your character name exactly.';
          break;
        case error.message.includes('403'):
          errorMessage = '❌ **Error:** Access to the Google Sheets document is forbidden. Please ensure it is shared with the bot\'s service account email.';
          break;
        case error.message.includes('404'):
          errorMessage = '❌ **Error:** The Google Sheets document could not be found. Please check the URL and try again.';
          break;
        default:
          errorMessage = `❌ **Error:** An unexpected error occurred: ${error.message}`;
      }

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: errorMessage,
            flags: [MessageFlags.Ephemeral]
          });
        } else {
          await interaction.editReply({
            content: errorMessage,
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

  // ------------------- Send Setup Instructions -------------------
  async sendSetupInstructions(interaction, errorType, characterId, characterName, googleSheetsUrl, customMessage = null) {
    const errorMessages = {
      invalid_url: 'The provided URL is not valid.',
      missing_sheet: 'The Google Sheets document is missing the required "loggedInventory" tab.',
      missing_headers: 'The "loggedInventory" sheet is missing the required headers.',
      invalid_inventory: 'Your inventory is missing required starter items or is improperly formatted.',
    };

    const errorMessage = customMessage || errorMessages[errorType] || 'An unexpected error occurred. Please check your setup.';
    const embed = await createSetupInstructionsEmbed(characterName, googleSheetsUrl, errorMessage);
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    console.log(`🔄 Setup instructions sent to the user: ${errorMessage}`);
  },
}; 