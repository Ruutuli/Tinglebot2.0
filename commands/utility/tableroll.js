// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll on an existing table')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to roll on')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Name of the character rolling')
            .setRequired(false)
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
    const attachment = interaction.options.getAttachment('csvfile');

    // Validate attachment
    if (!attachment || !attachment.contentType?.includes('text/csv')) {
      return await interaction.reply({
        content: '❌ Please provide a valid CSV file attachment.',
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
      
      const entries = [];
      const lines = csvText.split('\n');
      
      // Skip header line and process data
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line (simple comma-separated, handle quoted values)
        const values = this.parseCSVLine(line);
        if (values.length >= 3) {
          const weight = parseFloat(values[0]) || 1;
          const flavor = values[1] || '';
          const item = values[2] || '';
          const thumbnailImage = values[3] || '';
          
          entries.push({
            weight: weight,
            flavor: flavor,
            item: item,
            thumbnailImage: thumbnailImage
          });
        }
      }

      if (entries.length === 0) {
        return await interaction.editReply({
          content: '❌ No valid entries found in the CSV file. Please check the format.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Create table
      const table = new TableRoll({
        name: name,
        description: description,
        entries: entries,
        createdBy: interaction.user.id
      });

      await table.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${name}' ${existingTable ? 'Updated' : 'Created'} Successfully`)
        .setDescription(description || 'No description provided')
        .addFields(
          { name: '📊 Entries', value: entries.length.toString(), inline: true },
          { name: '🎲 Total Weight', value: table.totalWeight.toString(), inline: true },
          { name: '👤 Created By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

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

      // Roll on the table
      const result = await TableRoll.rollOnTable(tableName);
      const rolledItemName = result.result.item;
      const rolledFlavor = result.result.flavor;
      const rolledThumbnail = result.result.thumbnailImage;
      const totalEntries = table.entries.length;
      // Find the rolled index in the table
      const rolledIndex = table.entries.findIndex(e => e.item === rolledItemName && e.flavor === rolledFlavor && e.thumbnailImage === rolledThumbnail);

      // Build roll result string
      const rollResultString = `**🎲 d${totalEntries} → ${rolledIndex + 1}**`;

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x00b894)
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
      // Use rolled thumbnail if available, else default image
      if (rolledThumbnail && rolledThumbnail.trim()) {
        embed.setThumbnail(rolledThumbnail);
      }
      
      // Always show default image (for both items and flavor-only rolls)
      embed.setImage(DEFAULT_IMAGE_URL);

      // Add footer with table name
      embed.setFooter({
        text: `Table: ${tableName}`,
      });

      // Add item to database and Google Sheets if it's a valid item
      if (rolledItemName && rolledItemName.trim()) {
        try {
          // Add to database
          await addItemInventoryDatabase(
            character._id,
            rolledItemName,
            1, // Quantity
            'Table Roll', // Category
            'Table Roll', // Type
            interaction
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
        .setDescription('Use `/tableroll roll name:tableName` to roll on a table');

      const tableList = tables.map(table => 
        `**${table.name}** - ${table.entries.length} entries (${table.totalWeight} total weight)`
      ).join('\n');

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
          { name: '📅 Created', value: table.createdAt.toLocaleDateString(), inline: true },
          { name: '🔄 Updated', value: table.updatedAt.toLocaleDateString(), inline: true }
        );

      // Show first few entries as preview
      const previewEntries = table.entries.slice(0, 5).map((entry, index) => 
        `${index + 1}. **${entry.item}** (Weight: ${entry.weight})`
      ).join('\n');

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

  // ------------------- Helper method to parse CSV line -------------------
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }
}; 