// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { connectToTinglebot, fetchCharacterByNameAndUserId, fetchItemByName } = require('@/database/db');
const TableRoll = require('@/models/TableRollModel');
const Quest = require('@/models/QuestModel');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
// Google Sheets functionality removed
const { DEFAULT_IMAGE_URL } = require('../../embeds/embeds.js');
const { 
  validateTableName, 
  parseCSVData
} = require('@/utils/tableRollUtils');

// Roll frequency choices for slash options (value = maxRollsPerDay, 0 = unlimited)
const ROLL_LIMIT_CHOICES = [
  { name: 'As much as wanted', value: '0' },
  { name: '1x per day', value: '1' },
  { name: '2x per day', value: '2' },
  { name: '3x per day', value: '3' },
  { name: '5x per day', value: '5' },
  { name: '10x per day', value: '10' }
];

function formatRollFrequency(maxRollsPerDay) {
  if (!maxRollsPerDay || maxRollsPerDay <= 0) return 'As much as wanted';
  return `${maxRollsPerDay}x per day`;
}

// ------------------- Helper function to get item emoji from database -------------------
async function getItemEmoji(itemName) {
  try {
    const Item = require('@/models/ItemModel');
    const item = await Item.findOne({ itemName: itemName });
    if (item && item.emoji) {
      return item.emoji;
    }
  } catch (error) {
    console.error(`Error fetching item emoji for ${itemName}:`, error);
  }
  
  // Fallback to default emoji if not found in database
  return '📦';
}

// ------------------- Helper function to get item image from database -------------------
async function getItemImage(itemName) {
  try {
    const Item = require('@/models/ItemModel');
    const item = await Item.findOne({ itemName: itemName });
    if (item && item.image && item.image !== 'No Image') {
      return item.image;
    }
  } catch (error) {
    console.error(`Error fetching item image for ${itemName}:`, error);
  }
  
  // Fallback to default image if not found in database
  return null;
}

// ------------------- Helper function to find active interactive quests for user -------------------
async function findActiveInteractiveQuests(userId) {
  try {
    const quests = await Quest.find({
      status: 'active',
      questType: 'Interactive',
      [`participants.${userId}`]: { $exists: true }
    });
    
    return quests.filter(quest => {
      const participant = quest.participants.get(userId);
      return participant && participant.progress === 'active' && quest.tableRollName;
    });
  } catch (error) {
    console.error(`Error finding active interactive quests for user ${userId}:`, error);
    return [];
  }
}

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
          option.setName('rolllimit')
            .setDescription('How often this table can be rolled (default: as much as wanted)')
            .setRequired(false)
            .addChoices(...ROLL_LIMIT_CHOICES)
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
            .setAutocomplete(true)
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
        .addStringOption(option =>
          option.setName('rolllimit')
            .setDescription('How often this table can be rolled (optional; leave blank to keep current)')
            .setRequired(false)
            .addChoices(...ROLL_LIMIT_CHOICES)
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
            .setAutocomplete(true)
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
      handleInteractionError(error, 'tableroll.js', {
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

    const rollLimitValue = interaction.options.getString('rolllimit');
    const maxRollsPerDay = rollLimitValue != null ? parseInt(rollLimitValue, 10) : 0;

               // Create table
        const table = new TableRoll({
          name: name,
          entries: parseResult.entries,
          createdBy: interaction.user.id,
          maxRollsPerDay: isNaN(maxRollsPerDay) ? 0 : Math.max(0, maxRollsPerDay)
        });

      await table.save();

      // Show sample entries (first 5)
      const sampleEntries = parseResult.entries.slice(0, 5).map((entry, index) => {
        const displayText = entry.item || entry.flavor || 'Empty Entry';
        const weight = entry.weight;
        // Truncate long flavor text for display
        const truncatedText = displayText.length > 60 ? displayText.substring(0, 57) + '...' : displayText;
        return `**${index + 1}.** ${truncatedText} (Weight: ${weight})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${name}' ${existingTable ? 'Updated' : 'Created'} Successfully`)
        .setImage(DEFAULT_IMAGE_URL)
        .setDescription(`**📊 ${parseResult.entries.length} entries** | **🎲 ${table.totalWeight} total weight**`)
        .addFields(
          { name: '👤 Created By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🔄 Roll limit', value: formatRollFrequency(table.maxRollsPerDay), inline: true }
        )
        .setTimestamp();

      // Add sample entries if available
      if (sampleEntries) {
        embed.addFields({
          name: `📝 Sample Entries${parseResult.entries.length > 5 ? ' (showing first 5)' : ''}`,
          value: sampleEntries,
          inline: false
        });
      }



      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      handleInteractionError(error, 'tableroll.js', {
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

      

      // Defer reply to extend timeout for database operations
      await interaction.deferReply();

      // Roll on the table
      const result = await TableRoll.rollOnTable(tableName);
      const rolledItemName = result.result.item;
      const rolledFlavor = result.result.flavor;
      const rolledThumbnail = result.result.thumbnailImage;
      const rolledRarity = result.result.rarity;
      const totalEntries = table.entries.length;
      
      // Check for active interactive quests and process table roll
      const activeInteractiveQuests = await findActiveInteractiveQuests(userId);
      let questIntegrationResults = [];
      
      console.log(`[tableroll.js] Found ${activeInteractiveQuests.length} active interactive quests for user ${userId}`);
      
      for (const quest of activeInteractiveQuests) {
        // Check if this quest uses the same table roll
        if (quest.tableRollName === tableName) {
          console.log(`[tableroll.js] Processing table roll for quest ${quest.questID} (${quest.title})`);
          try {
            // Use the new completion method that handles quest completion
            const questResult = await quest.completeFromTableRoll(userId, result.result);
            questIntegrationResults.push({
              quest: quest,
              result: questResult
            });
            console.log(`[tableroll.js] ✅ Quest integration successful for quest ${quest.questID}:`, questResult);
            
            // If quest was completed, check for auto-completion and rewards
            if (questResult.questCompleted) {
              try {
                const autoCompletionResult = await quest.checkAutoCompletion();
                if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
                  console.log(`[tableroll.js] 🎉 Quest ${quest.questID} completed: ${autoCompletionResult.reason}`);
                  
                  // Import and use quest reward module
                  const questRewardModule = require('../../modules/questRewardModule');
                  await questRewardModule.processQuestCompletion(quest.questID);
                  
                  // Mark completion as processed
                  await quest.markCompletionProcessed();
                }
              } catch (rewardError) {
                console.error(`[tableroll.js] ❌ Error processing quest rewards:`, rewardError);
              }
            }
          } catch (error) {
            console.error(`[tableroll.js] ❌ Quest integration failed for quest ${quest.questID}:`, error);
            questIntegrationResults.push({
              quest: quest,
              result: { success: false, error: error.message }
            });
          }
        } else {
          console.log(`[tableroll.js] Quest ${quest.questID} uses table '${quest.tableRollName}', skipping (current table: '${tableName}')`);
        }
      }
      
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
         .setColor(0x0099FF)
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

             // Add result fields with emojis
       if (rolledItemName && rolledItemName.trim()) {
         const itemEmoji = await getItemEmoji(rolledItemName);
         embed.addFields({
           name: '__🎁 Result__',
           value: `> ${itemEmoji} **${rolledItemName}**`,
           inline: false
         });
       }
       // Flavor text is required
       if (!rolledFlavor || !rolledFlavor.trim()) {
         embed.addFields({
           name: '__⚠️ Warning__',
           value: `> No flavor text found for this roll. Please check your table configuration.`,
           inline: false
         });
       } else {
         embed.addFields({
           name: '__📝 Flavor__',
           value: `> ${rolledFlavor}`,
           inline: false
         });
       }
       
       // Use item image from database as thumbnail if available
       if (rolledItemName && rolledItemName.trim()) {
         const itemImage = await getItemImage(rolledItemName);
         if (itemImage) {
           embed.setThumbnail(itemImage);
         } else if (rolledThumbnail && rolledThumbnail.trim()) {
           // Fallback to rolled thumbnail if no database image
           embed.setThumbnail(rolledThumbnail);
         }
       } else if (rolledThumbnail && rolledThumbnail.trim()) {
         // For flavor-only rolls, use rolled thumbnail if available
         embed.setThumbnail(rolledThumbnail);
       }
       
       // Always show the default image
       embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

             // Add footer with table info
       embed.setFooter({
         text: `Table: ${tableName}`,
       });

             // Add item to database and Google Sheets if it's a valid item
       let inventoryAdded = false;
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
           inventoryAdded = true;
           // Note: Google Sheets sync is handled by addItemInventoryDatabase
         } catch (error) {
           handleInteractionError(error, 'tableroll.js', {
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

       // Add inventory confirmation to embed
       if (inventoryAdded && rolledItemName && rolledItemName.trim()) {
         embed.addFields({
           name: '__✅ Inventory Updated__',
           value: `> **${rolledItemName}** has been added to ${character.name}'s inventory!`,
           inline: false
         });
       }
       
       // Add quest integration feedback to embed
       if (questIntegrationResults.length > 0) {
         const questFields = [];
         
         for (const questResult of questIntegrationResults) {
           const { quest, result } = questResult;
           const participant = quest.participants.get(userId);
           
           if (result.success) {
             const questProgressText = `**${quest.title}** (ID: \`${quest.questID}\`)\n` +
               `> 🎯 Progress: ${result.totalSuccessfulRolls}/${result.requiredRolls} successful rolls\n` +
               `> ${result.isSuccess ? '✅' : '❌'} This roll was ${result.isSuccess ? 'successful' : 'unsuccessful'}\n` +
               `> ${result.questCompleted ? '🏆 Quest completed!' : '⏳ Quest in progress...'}`;
             
             questFields.push({
               name: '__🎮 Quest Progress__',
               value: questProgressText,
               inline: false
             });
           } else {
             questFields.push({
               name: '__⚠️ Quest Integration Warning__',
               value: `> **${quest.title}**: ${result.error || result.reason || 'Unknown error'}`,
               inline: false
             });
           }
         }
         
         // Add all quest fields to the embed
         questFields.forEach(field => embed.addFields(field));
       } else if (activeInteractiveQuests.length > 0) {
         // User has active interactive quests but none use this table
         const questNames = activeInteractiveQuests.map(q => `**${q.title}** (uses \`${q.tableRollName}\`)`).join('\n');
         embed.addFields({
           name: '__ℹ️ Quest Information__',
           value: `> You have active interactive quests, but none use the **${tableName}** table:\n> ${questNames}`,
           inline: false
         });
       }

       // Add daily roll limit info if applicable
       if (result.dailyRollsRemaining !== null) {
         embed.addFields({
           name: '📅 Daily Rolls Remaining',
           value: result.dailyRollsRemaining.toString(),
           inline: true
         });
       }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      // Check if we already deferred the reply
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ ${error.message}`,
          flags: [MessageFlags.Ephemeral]
        });
      } else {
        await interaction.reply({
          content: `❌ ${error.message}`,
          flags: [MessageFlags.Ephemeral]
        });
      }
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
        .setTitle('🎲 Available Tables')
        .setDescription(`Use \`/tableroll roll name:tableName\` to roll on a table`)
        .setImage(DEFAULT_IMAGE_URL)
        .setFooter({ text: `Found ${tables.length} active table${tables.length !== 1 ? 's' : ''}` })
        .setTimestamp();

      // Simplified table list with entries, weight, and roll limit
      const tableList = tables.map(table => {
        const entryCount = table.entries.length;
        const totalWeight = table.totalWeight;
        const rollLimit = formatRollFrequency(table.maxRollsPerDay);
        return `**${table.name}**\n└ 📊 ${entryCount} entries | 🎲 ${totalWeight} weight | 🔄 ${rollLimit}`;
      }).join('\n\n');

      embed.addFields({
        name: `📋 Tables (${tables.length})`,
        value: tableList || 'No tables available',
        inline: false
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleInteractionError(error, 'tableroll.js', {
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

    // Check if user has administrator permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return await interaction.reply({
        content: '❌ This command requires administrator permissions.',
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

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📋 Table: ${table.name}`)
        .setImage(DEFAULT_IMAGE_URL)
        .setDescription(`**📊 ${table.entries.length} entries** | **🎲 ${table.totalWeight} total weight**`)
        .addFields(
          { name: '👤 Created By', value: `<@${table.createdBy}>`, inline: true },
          { name: '🔄 Roll limit', value: formatRollFrequency(table.maxRollsPerDay), inline: true },
          { name: '📅 Created', value: table.createdAt.toLocaleDateString(), inline: true },
          { name: '🔄 Updated', value: table.updatedAt.toLocaleDateString(), inline: true }
        );

      if (table.maxRollsPerDay > 0) {
        embed.addFields({
          name: '📅 Used today',
          value: `${table.dailyRollCount}/${table.maxRollsPerDay}`,
          inline: true
        });
      }

      // Show all entries in a cleaner format
      const allEntries = table.entries.map((entry, index) => {
        const displayText = entry.item || entry.flavor || 'Empty Entry';
        const weight = entry.weight;
        // Truncate long flavor text for display
        const truncatedText = displayText.length > 80 ? displayText.substring(0, 77) + '...' : displayText;
        return `**${index + 1}.** ${truncatedText} (Weight: ${weight})`;
      }).join('\n');

      embed.addFields({
        name: `📝 Entries`,
        value: allEntries,
        inline: false
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      handleInteractionError(error, 'tableroll.js', {
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

      const rollLimitValue = interaction.options.getString('rolllimit');
      if (rollLimitValue != null) {
        const maxRollsPerDay = parseInt(rollLimitValue, 10);
        table.maxRollsPerDay = isNaN(maxRollsPerDay) ? 0 : Math.max(0, maxRollsPerDay);
      }

      await table.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`✅ Table '${tableName}' Updated Successfully`)
        .addFields(
          { name: '📊 New Entries', value: parseResult.entries.length.toString(), inline: true },
          { name: '🎲 New Total Weight', value: table.totalWeight.toString(), inline: true },
          { name: '👤 Updated By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🔄 Updated', value: table.updatedAt.toLocaleDateString(), inline: true },
          { name: '🔄 Roll limit', value: formatRollFrequency(table.maxRollsPerDay), inline: true }
        );

      if (table.maxRollsPerDay > 0) {
        embed.addFields({
          name: '📅 Daily limit today',
          value: `${table.dailyRollCount}/${table.maxRollsPerDay}`,
          inline: true
        });
      }

      // Show first few entries as preview
      const previewEntries = table.entries.slice(0, 5).map((entry, index) => {
        const displayText = entry.item || entry.flavor || 'Empty Entry';
        // Truncate long flavor text for display
        const truncatedText = displayText.length > 60 ? displayText.substring(0, 57) + '...' : displayText;
        return `${index + 1}. **${truncatedText}** (Weight: ${entry.weight})`;
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
      handleInteractionError(error, 'tableroll.js', {
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
      handleInteractionError(error, 'tableroll.js', {
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