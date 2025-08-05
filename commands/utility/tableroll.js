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
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Filter by category')
            .setRequired(false)
            .addChoices(
              { name: 'All Categories', value: 'all' },
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
          option.setName('sort')
            .setDescription('Sort order')
            .setRequired(false)
            .addChoices(
              { name: 'Name (A-Z)', value: 'name' },
              { name: 'Most Popular', value: 'popular' },
              { name: 'Recently Created', value: 'recent' },
              { name: 'Recently Rolled', value: 'lastrolled' }
            )
        )
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of tables to show (max 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search tables by name or description')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Search term')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Filter by category')
            .setRequired(false)
            .addChoices(
              { name: 'All Categories', value: 'all' },
              { name: 'General', value: 'general' },
              { name: 'Loot', value: 'loot' },
              { name: 'Monster', value: 'monster' },
              { name: 'Treasure', value: 'treasure' },
              { name: 'Crafting', value: 'crafting' },
              { name: 'Event', value: 'event' },
              { name: 'Custom', value: 'custom' }
            )
        )
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of results to show (max 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
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
        .setDescription('Edit a table (only creator can edit)')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to edit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('New description')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('category')
            .setDescription('New category')
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
            .setDescription('New tags (comma-separated)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('maxrollsperday')
            .setDescription('New maximum rolls per day (0 for unlimited)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(1000)
        )
        .addBooleanOption(option =>
          option.setName('public')
            .setDescription('Make table public or private')
            .setRequired(false)
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('duplicate')
        .setDescription('Duplicate an existing table')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to duplicate')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('newname')
            .setDescription('Name for the new table')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View table statistics')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the table to view stats for')
            .setRequired(false)
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
        case 'search':
          await this.handleSearch(interaction);
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
        case 'duplicate':
          await this.handleDuplicate(interaction);
          break;
        case 'stats':
          await this.handleStats(interaction);
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
      const category = interaction.options.getString('category');
      const sort = interaction.options.getString('sort') || 'name';
      const limit = interaction.options.getInteger('limit') || 10;

      let query = { isActive: true };
      
      if (category && category !== 'all') {
        query.category = category;
      }

      let sortOptions = {};
      switch (sort) {
        case 'popular':
          sortOptions = { rollCount: -1, lastRolled: -1 };
          break;
        case 'recent':
          sortOptions = { createdAt: -1 };
          break;
        case 'lastrolled':
          sortOptions = { lastRolled: -1 };
          break;
        default:
          sortOptions = { name: 1 };
      }

      const tables = await TableRoll.find(query).sort(sortOptions).limit(limit);
      
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

      if (category && category !== 'all') {
        embed.addFields({
          name: 'Filter',
          value: `Category: ${category}`,
          inline: true
        });
      }

      embed.addFields({
        name: 'Sort',
        value: sort,
        inline: true
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

  // ------------------- Handle table search -------------------
  async handleSearch(interaction) {
    try {
      const query = interaction.options.getString('query');
      const category = interaction.options.getString('category');
      const limit = interaction.options.getInteger('limit') || 5;

      let searchOptions = {};
      
      if (category && category !== 'all') {
        searchOptions.category = category;
      }

      const tables = await TableRoll.searchTables(query, { ...searchOptions, limit });
      
      if (tables.length === 0) {
        return await interaction.reply({
          content: `🔍 No tables found matching "${query}".`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🔍 Search Results for "${query}"`)
        .setDescription(`Found ${tables.length} table(s)`);

      const tableList = tables.map(table => {
        const categoryEmoji = getCategoryEmoji(table.category);
        const rollCount = table.rollCount || 0;
        return `**${categoryEmoji} ${table.name}** - ${table.entries.length} entries (${rollCount} rolls)`;
      }).join('\n');

      embed.addFields({
        name: 'Results',
        value: tableList,
        inline: false
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll search',
        userTag: interaction.user.tag,
        userId: interaction.user.id
      });
      
      await interaction.reply({
        content: '❌ Failed to search tables.',
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
    const description = interaction.options.getString('description');
    const category = interaction.options.getString('category');
    const tags = interaction.options.getString('tags');
    const maxRollsPerDay = interaction.options.getInteger('maxrollsperday');
    const isPublic = interaction.options.getBoolean('public');

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
          content: '❌ You can only edit tables that you created.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Update fields
      const updates = {};
      if (description !== null) updates.description = description;
      if (category !== null) updates.category = category;
      if (maxRollsPerDay !== null) updates.maxRollsPerDay = maxRollsPerDay;
      if (isPublic !== null) updates.isPublic = isPublic;
      if (tags !== null) {
        updates.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }

      Object.assign(table, updates);
      await table.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${tableName}' Updated`)
        .setDescription('The table has been successfully updated.')
        .addFields(
          { name: '📝 Description', value: table.description || 'No description', inline: true },
          { name: '📂 Category', value: table.category, inline: true },
          { name: '🏷️ Tags', value: table.tags.length > 0 ? table.tags.join(', ') : 'None', inline: true },
          { name: '🔒 Public', value: table.isPublic ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();

      if (table.maxRollsPerDay > 0) {
        embed.addFields({
          name: '📅 Daily Limit',
          value: table.maxRollsPerDay.toString(),
          inline: true
        });
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll edit',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.reply({
        content: '❌ Failed to edit table.',
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

  // ------------------- Handle table duplication -------------------
  async handleDuplicate(interaction) {
    const tableName = interaction.options.getString('name');
    const newName = interaction.options.getString('newname');

    try {
      const table = await TableRoll.findOne({ name: tableName, isActive: true });
      
      if (!table) {
        return await interaction.reply({
          content: `❌ Table '${tableName}' not found.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if new name already exists
      const existingTable = await TableRoll.findOne({ name: newName });
      if (existingTable) {
        return await interaction.reply({
          content: `❌ A table with the name '${newName}' already exists.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Create duplicate
      const duplicate = await table.duplicate(newName, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${tableName}' Duplicated`)
        .setDescription(`Successfully created '${newName}' as a copy of '${tableName}'`)
        .addFields(
          { name: '📊 Entries', value: duplicate.entries.length.toString(), inline: true },
          { name: '🎲 Total Weight', value: duplicate.totalWeight.toString(), inline: true },
          { name: '👤 Created By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll duplicate',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.reply({
        content: '❌ Failed to duplicate table.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  },

  // ------------------- Handle table statistics -------------------
  async handleStats(interaction) {
    const tableName = interaction.options.getString('name');

    try {
      if (tableName) {
        // Show stats for specific table
        const table = await TableRoll.findOne({ name: tableName });
        
        if (!table) {
          return await interaction.reply({
            content: `❌ Table '${tableName}' not found.`,
            flags: [MessageFlags.Ephemeral]
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📊 Statistics for '${table.name}'`)
          .addFields(
            { name: '🎲 Total Rolls', value: (table.rollCount || 0).toString(), inline: true },
            { name: '📅 Daily Rolls', value: (table.dailyRollCount || 0).toString(), inline: true },
            { name: '📊 Entries', value: table.entries.length.toString(), inline: true },
            { name: '🎯 Total Weight', value: table.totalWeight.toString(), inline: true },
            { name: '📅 Created', value: table.createdAt.toLocaleDateString(), inline: true },
            { name: '🔄 Last Updated', value: table.updatedAt.toLocaleDateString(), inline: true }
          );

        if (table.lastRolled) {
          embed.addFields({
            name: '🎲 Last Rolled',
            value: table.lastRolled.toLocaleDateString(),
            inline: true
          });
        }

        await interaction.reply({ embeds: [embed] });
      } else {
        // Show global stats
        const [totalTables, totalRolls, popularTables, recentTables] = await Promise.all([
          TableRoll.countDocuments({ isActive: true }),
          TableRoll.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: '$rollCount' } } }
          ]),
          TableRoll.getPopularTables(5),
          TableRoll.getRecentTables(5)
        ]);

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📊 Table Roll Statistics')
          .addFields(
            { name: '📋 Total Tables', value: totalTables.toString(), inline: true },
            { name: '🎲 Total Rolls', value: (totalRolls[0]?.total || 0).toString(), inline: true }
          );

        if (popularTables.length > 0) {
          const popularList = popularTables.map((table, index) => 
            `${index + 1}. **${table.name}** - ${table.rollCount || 0} rolls`
          ).join('\n');
          
          embed.addFields({
            name: '🏆 Most Popular Tables',
            value: popularList,
            inline: false
          });
        }

        if (recentTables.length > 0) {
          const recentList = recentTables.map((table, index) => 
            `${index + 1}. **${table.name}** - ${table.entries.length} entries`
          ).join('\n');
          
          embed.addFields({
            name: '🆕 Recently Created Tables',
            value: recentList,
            inline: false
          });
        }

        await interaction.reply({ embeds: [embed] });
      }

    } catch (error) {
      handleError(error, 'tableroll.js', {
        commandName: 'tableroll stats',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        tableName: tableName
      });
      
      await interaction.reply({
        content: '❌ Failed to get statistics.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
}; 