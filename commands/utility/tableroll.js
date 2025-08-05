// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { handleError } = require('../../utils/globalErrorHandler');
const { connectToTinglebot, fetchCharacterByNameAndUserId, fetchItemByName } = require('../../database/db');
const TableRoll = require('../../models/TableRollModel');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils');
const { safeAppendDataToSheet, extractSpreadsheetId, isValidGoogleSheetsUrl, authorizeSheets } = require('../../utils/googleSheetsUtils');
const { DEFAULT_IMAGE_URL } = require('../../embeds/embeds');
const { 
  validateTableName, 
  parseCSVData, 
  getRarityColor, 
  getRarityEmoji, 
  getCategoryEmoji 
} = require('../../utils/tableRollUtils');

// ------------------- Exporting the slash command for table rolls -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tableroll')
    .setDescription('🎲 Upload CSV tables and roll on them')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new table roll from a CSV file')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table')
            .setRequired(true)
        )
        .addAttachmentOption(option =>
          option.setName('csvfile')
            .setDescription('CSV file with table data (Weight,Flavor,Item,thumbnail image)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description of the table')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Category for the table')
            .setRequired(false)
            .addChoices(
              { name: 'General', value: 'general' },
              { name: 'Loot', value: 'loot' },
              { name: 'Monster', value: 'monster' },
              { name: 'Treasure', value: 'treasure' },
              { name: 'Crafting', value: 'crafting' },
              { name: 'Event', value: 'event' },
              { name: 'Custom', value: 'custom' }
            )
        )
        .addStringOption(option =>
          option.setName('tags')
            .setDescription('Tags for the table (comma-separated)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('maxrollsperday')
            .setDescription('Maximum rolls per day (0 for unlimited)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(1000)
        )
        .addBooleanOption(option =>
          option.setName('public')
            .setDescription('Make table public (default: true)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll on an existing table')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to roll on')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Name of the character rolling')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available tables')
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View details of a specific table')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to view')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit a table by uploading a new CSV file')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addAttachmentOption(option =>
          option.setName('csvfile')
            .setDescription('New CSV file with table data (Weight,Flavor,Item,thumbnail image)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a table (only creator can delete)')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to delete')
            .setRequired(true)
                )
      ),

  // ------------------- Execute function to handle the tableroll command -------------------
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Connect to database
      await connectToTinglebot();

      switch (subcommand) {
        case 'create':
          await this.handleCreate(interaction);
          break;
        case 'roll':
          await this.handleRoll(interaction);
          break;
        case 'list':
          await this.handleList(interaction);
          break;
        case 'view':
          await this.handleView(interaction);
          break;
        case 'edit':
          await this.handleEdit(interaction);
          break;
        case 'delete':
          await this.handleDelete(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand',
            flags: [MessageFlags.Ephemeral]
          });
      }
    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        options: {
          subcommand: interaction.options.getSubcommand(),
          name: interaction.options.getString('name'),
          description: interaction.options.getString('description'),
          characterName: interaction.options.getString('charactername')
        }
      });
      
      console.error(`[tableroll.js]: Command failed:`, error);
      
      await interaction.reply({
        content: '❌ An error occurred while processing your request. Please try again later.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table creation -------------------
  async handleCreate(interaction) {
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description') || '';
    const category = interaction.options.getString('category') || 'general';
    const tags = interaction.options.getString('tags') || '';
    const maxRollsPerDay = interaction.options.getInteger('maxrollsperday') || 0;
    const isPublic = interaction.options.getBoolean('public') ?? true;
    const attachment = interaction.options.getAttachment('csvfile');

    // Validate attachment
    if (!attachment || !attachment.contentType?.includes('text/csv')) {
      return await interaction.reply({
        content: '❌ Please provide a valid CSV file attachment.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Validate table name
    const nameValidation = validateTableName(name);
    if (!nameValidation.valid) {
      return await interaction.reply({
        content: `❌ ${nameValidation.error}`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Check if table already exists and delete it to overwrite
    const existingTable = await TableRoll.findOne({ name: name });
    if (existingTable) {
      await TableRoll.deleteOne({ _id: existingTable._id });
    }

    await interaction.deferReply();

    try {
      // Download and parse CSV
      const response = await fetch(attachment.url);
      const csvText = await response.text();
      
      // Use consolidated CSV parsing
      const parseResult = parseCSVData(csvText);
      if (!parseResult.success) {
        return await interaction.editReply({
          content: `❌ Failed to parse CSV: ${parseResult.error}`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (parseResult.entries.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid entries found in the CSV file. Please check the format.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Parse tags
      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

      // Create table
      const table = new TableRoll({
        name: name,
        description: description,
        category: category,
        entries: parseResult.entries,
        createdBy: interaction.user.id,
        tags: tagArray,
        isPublic: isPublic,
        maxRollsPerDay: maxRollsPerDay
      });

      await table.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${name}' ${existingTable ? 'Updated' : 'Created'} Successfully`)
        .setDescription(description || 'No description provided')
        .addFields(
          { name: '📊 Entries', value: parseResult.entries.length.toString(), inline: true },
          { name: '🎲 Total Weight', value: table.totalWeight.toString(), inline: true },
          { name: '👤 Created By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📂 Category', value: category, inline: true },
          { name: '🏷️ Tags', value: tagArray.length > 0 ? tagArray.join(', ') : 'None', inline: true },
          { name: '🔒 Public', value: isPublic ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();

      if (maxRollsPerDay > 0) {
        embed.addFields({ name: '📅 Daily Limit', value: maxRollsPerDay.toString(), inline: true });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll create',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: name
      });
      
      await interaction.editReply({
        content: '❌ Failed to create table. Please check your CSV format and try again.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table roll -------------------
  async handleRoll(interaction) {
    const tableName = interaction.options.getString('name');
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;

    try {
      // Fetch character
      if (!characterName) {
        return await interaction.reply({
          content: '❌ You must provide a character name.',
          flags: [MessageFlags.Ephemeral]
        });
      }
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return await interaction.reply({
          content: `❌ Character '${characterName}' not found or does not belong to you.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Fetch the table first
      const table = await TableRoll.findOne({ name: tableName, isActive: true });
      if (!table) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' not found.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if table is public or user is creator
      if (!table.isPublic && table.createdBy !== userId) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' is private and you don't have permission to roll on it.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Roll on the table
      const result = await TableRoll.rollOnTable(tableName);
      const rolledItemName = result.result.item;
      const rolledFlavor = result.result.flavor;
      const rolledThumbnail = result.result.thumbnailImage;
      const rolledRarity = result.result.rarity;
      const totalEntries = table.entries.length;
      
      // Find the rolled index in the table
      const rolledIndex = table.entries.findIndex(e => 
        e.item === rolledItemName && 
        e.flavor === rolledFlavor && 
        e.thumbnailImage === rolledThumbnail
      );

      // Build roll result string
      const rollResultString = `**🎲 d${totalEntries} → ${rolledIndex + 1}**`;

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(getRarityColor(rolledRarity))
        .setTitle(`🎲 Table Roll: ${tableName}`)
        .setDescription(rollResultString)
        .setTimestamp();

      // Set author to character
      if (character.icon) {
        embed.setAuthor({
          name: `${character.name}`,
          iconURL: character.icon,
          url: character.inventory || undefined
        });
      }

      // Add result fields
      if (rolledItemName && rolledItemName.trim()) {
        embed.addFields({
          name: '🎁 Result',
          value: `**${rolledItemName}**`,
          inline: false
        });
      }
      if (rolledFlavor && rolledFlavor.trim()) {
        embed.addFields({
          name: '📝 Flavor',
          value: rolledFlavor,
          inline: false
        });
      }
      
      // Add rarity if not common
      if (rolledRarity && rolledRarity !== 'common') {
        embed.addFields({
          name: '⭐ Rarity',
          value: rolledRarity.charAt(0).toUpperCase() + rolledRarity.slice(1),
          inline: true
        });
      }
      
      // Use rolled thumbnail if available, else default image
      if (rolledThumbnail && rolledThumbnail.trim()) {
        embed.setThumbnail(rolledThumbnail);
      }
      
      // Always show default image (for both items and flavor-only rolls)
      embed.setImage(DEFAULT_IMAGE_URL);

      // Add footer with table info
      embed.setFooter({
        text: `Table: ${tableName} | Roll #${result.rollNumber}`,
      });

      // Add daily roll limit info if applicable
      if (result.dailyRollsRemaining !== null) {
        embed.addFields({
          name: '📅 Daily Rolls Remaining',
          value: result.dailyRollsRemaining.toString(),
          inline: true
        });
      }

      // Add item to database and Google Sheets if it's a valid item
      if (rolledItemName && rolledItemName.trim()) {
        try {
          // Add to database
          await addItemInventoryDatabase(
            character._id,
            rolledItemName,
            1, // Quantity
            interaction,
            'Table Roll'
          );

          // Note: Google Sheets sync is handled by addItemInventoryDatabase
        } catch (error) {
          handleError(error, 'tableroll.js', {
            commandName: '/tableroll roll',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            characterName: character.name,
            tableName: tableName,
            itemName: rolledItemName
          });
          // Continue with the roll display even if database/sheet addition fails
        }
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      await interaction.reply({
        content: `❌ ${error.message}`,
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table listing -------------------
  async handleList(interaction) {
    try {
      const tables = await TableRoll.find({ isActive: true }).sort({ name: 1 });
      
      if (tables.length === 0) {
        return await interaction.reply({
          content: '📋 No tables available.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📋 Available Tables')
        .setDescription(`Use \`/tableroll roll name:tableName\` to roll on a table`);

      const tableList = tables.map(table => {
        const categoryEmoji = getCategoryEmoji(table.category);
        const rollCount = table.rollCount || 0;
        return `**${categoryEmoji} ${table.name}** - ${table.entries.length} entries (${table.totalWeight} weight, ${rollCount} rolls)`;
      }).join('\n');

      embed.addFields({
        name: 'Tables',
        value: tableList,
        inline: false
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll list',
        userTag: interaction.user.tag,
        userId: interaction.user.id
      });
      
      await interaction.reply({
        content: '❌ Failed to list tables.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },



  // ------------------- Handle table view -------------------
  async handleView(interaction) {
    const tableName = interaction.options.getString('name');

    try {
      const table = await TableRoll.findOne({ name: tableName, isActive: true });
      
      if (!table) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' not found.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📋 Table: ${table.name}`)
        .setDescription(table.description || 'No description')
        .addFields(
          { name: '📊 Entries', value: table.entries.length.toString(), inline: true },
          { name: '🎲 Total Weight', value: table.totalWeight.toString(), inline: true },
          { name: '👤 Created By', value: `<@${table.createdBy}>`, inline: true },
          { name: '📂 Category', value: table.category, inline: true },
          { name: '🏷️ Tags', value: table.tags.length > 0 ? table.tags.join(', ') : 'None', inline: true },
          { name: '🔒 Public', value: table.isPublic ? 'Yes' : 'No', inline: true },
          { name: '📅 Created', value: table.createdAt.toLocaleDateString(), inline: true },
          { name: '🔄 Updated', value: table.updatedAt.toLocaleDateString(), inline: true },
          { name: '🎲 Total Rolls', value: (table.rollCount || 0).toString(), inline: true }
        );

      if (table.maxRollsPerDay > 0) {
        embed.addFields({
          name: '📅 Daily Limit',
          value: `${table.dailyRollCount}/${table.maxRollsPerDay}`,
          inline: true
        });
      }

      // Show first few entries as preview
      const previewEntries = table.entries.slice(0, 5).map((entry, index) => {
        const rarityEmoji = getRarityEmoji(entry.rarity);
        return `${index + 1}. **${entry.item || 'Flavor Only'}** (Weight: ${entry.weight}) ${rarityEmoji}`;
      }).join('\n');

      if (previewEntries) {
        embed.addFields({
          name: '📝 Sample Entries',
          value: previewEntries + (table.entries.length > 5 ? '\n...' : ''),
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll view',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.reply({
        content: '❌ Failed to view table.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table editing -------------------
  async handleEdit(interaction) {
    const tableName = interaction.options.getString('name');
    const attachment = interaction.options.getAttachment('csvfile');

    // Validate attachment
    if (!attachment || !attachment.contentType?.includes('text/csv')) {
      return await interaction.reply({
        content: '❌ Please provide a valid CSV file attachment.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    try {
      const table = await TableRoll.findOne({ name: tableName, isActive: true });
      
      if (!table) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' not found.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if user is the creator
      if (table.createdBy !== interaction.user.id) {
        return await interaction.reply({
          content: '❌ You can only edit tables that you created.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      await interaction.deferReply();

      // Download and parse CSV
      const response = await fetch(attachment.url);
      const csvText = await response.text();
      
      // Use consolidated CSV parsing
      const parseResult = parseCSVData(csvText);
      if (!parseResult.success) {
        return await interaction.editReply({
          content: `❌ Failed to parse CSV: ${parseResult.error}`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (parseResult.entries.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid entries found in the CSV file. Please check the format.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Update table with new entries
      table.entries = parseResult.entries;
      table.totalWeight = parseResult.entries.reduce((sum, entry) => sum + (entry.weight || 0), 0);
      table.updatedAt = new Date();

      await table.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${tableName}' Updated Successfully`)
        .setDescription(table.description || 'No description')
        .addFields(
          { name: '📊 New Entries', value: parseResult.entries.length.toString(), inline: true },
          { name: '🎲 New Total Weight', value: table.totalWeight.toString(), inline: true },
          { name: '👤 Updated By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📂 Category', value: table.category, inline: true },
          { name: '🏷️ Tags', value: table.tags.length > 0 ? table.tags.join(', ') : 'None', inline: true },
          { name: '🔒 Public', value: table.isPublic ? 'Yes' : 'No', inline: true },
          { name: '🔄 Updated', value: table.updatedAt.toLocaleDateString(), inline: true },
          { name: '🎲 Total Rolls', value: (table.rollCount || 0).toString(), inline: true }
        );

      if (table.maxRollsPerDay > 0) {
        embed.addFields({
          name: '📅 Daily Limit',
          value: `${table.dailyRollCount}/${table.maxRollsPerDay}`,
          inline: true
        });
      }

      // Show first few entries as preview
      const previewEntries = table.entries.slice(0, 5).map((entry, index) => {
        const rarityEmoji = getRarityEmoji(entry.rarity);
        return `${index + 1}. **${entry.item || 'Flavor Only'}** (Weight: ${entry.weight}) ${rarityEmoji}`;
      }).join('\n');

      if (previewEntries) {
        embed.addFields({
          name: '📝 Sample Entries',
          value: previewEntries + (table.entries.length > 5 ? '\n...' : ''),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll edit',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.editReply({
        content: '❌ Failed to update table. Please check your CSV format and try again.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table deletion -------------------
  async handleDelete(interaction) {
    const tableName = interaction.options.getString('name');

    try {
      const table = await TableRoll.findOne({ name: tableName });
      
      if (!table) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' not found.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if user is the creator
      if (table.createdBy !== interaction.user.id) {
        return await interaction.reply({
          content: '❌ You can only delete tables that you created.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      await TableRoll.deleteOne({ _id: table._id });

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`🗑️ Table '${tableName}' Deleted`)
        .setDescription('The table has been permanently removed.')
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll delete',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.reply({
        content: '❌ Failed to delete table.',
        ephemeral: true
      });
    }
  },


}; 