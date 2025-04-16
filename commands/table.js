const { SlashCommandBuilder } = require('@discordjs/builders');
const { handleError } = require('../utils/globalErrorHandler');
const { fetchTableFromDatabase, loadTable, rollItem, createRollEmbed } = require('../utils/sheetTableUtils');
const { EmbedBuilder } = require('discord.js'); // Updated import

module.exports = {
    data: new SlashCommandBuilder()
        .setName('table')
        .setDescription('Manage item tables')
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Loads a table from Google Sheets into the database')
                .addStringOption(option =>
                    option.setName('tablename')
                        .setDescription('The name of the sheet tab')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('roll')
                .setDescription('Rolls an item from a loaded table stored in the database')
                .addStringOption(option =>
                    option.setName('tablename')
                        .setDescription('The name of the table to roll from')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tableName = interaction.options.getString('tablename');
        
        if (subcommand === 'load') {
            await interaction.deferReply();
            const success = await loadTable(tableName);
            if (success) {
                await interaction.editReply(`✅ **Successfully loaded table: ${tableName} into the database**`);
            } else {
                await interaction.editReply(`❌ **Failed to load table: ${tableName}**`);
            }
        } else if (subcommand === 'roll') {
            await interaction.deferReply();
            const tableData = await fetchTableFromDatabase(tableName);
            
            if (!tableData) {
                await interaction.editReply(`❌ **No data found for table: ${tableName}**`);
                return;
            }
            
            const result = await rollItem(tableName);
            if (!result) {
                await interaction.editReply(`❌ **Failed to roll from table: ${tableName}**`);
                return;
            }

            const embed = new EmbedBuilder() // Updated to use EmbedBuilder
                .setColor('#0099ff')
                .setTitle(`🎲 Roll Result from ${tableName}`)
                .addFields(
                    { name: 'Item', value: result.item || 'Unknown', inline: true },
                    { name: 'Flavor Text', value: result.flavorText || 'No description', inline: false }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
