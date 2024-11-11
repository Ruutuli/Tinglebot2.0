// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('discord.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { connectToTinglebot } = require('../database/connection');
const { syncVendingInventory } = require('../utils/vendingUtils');

// ------------------- Discord command to sync vending inventory with Google Sheets -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('syncvending')
        .setDescription('Sync vending inventory with Google Sheets')
        .addStringOption(option =>
            option.setName('sheeturl')
                .setDescription('The URL of the Google Sheet to sync with')
                .setRequired(true)
        ),

    // ------------------- Execute function for syncing vending inventory -------------------
    async execute(interaction) {
        try {
            const sheetUrl = interaction.options.getString('sheeturl');

            // ------------------- Validate the provided Google Sheets URL -------------------
            if (!isValidGoogleSheetsUrl(sheetUrl)) {
                return interaction.reply({
                    content: '❌ The provided URL is not a valid Google Sheets URL. Please provide a valid URL.',
                    ephemeral: true,
                });
            }

            const spreadsheetId = extractSpreadsheetId(sheetUrl);

            // ------------------- Connect to the database -------------------
            await connectToTinglebot();

            const range = 'vendingShop!A2:H'; // Define the range in the Google Sheets for vending data
            const vendingInventoryData = await syncVendingInventory(spreadsheetId, range);

            // ------------------- Handle empty or missing inventory data -------------------
            if (!vendingInventoryData || vendingInventoryData.length === 0) {
                return interaction.reply({
                    content: '⚠️ No vending inventory data found. Please ensure the sheet contains headers and data.',
                    ephemeral: true,
                });
            }

            // ------------------- Add vending inventory data to the database -------------------
            await addVendingInventoryToDatabase(vendingInventoryData);

            // ------------------- Reply with success message -------------------
            await interaction.reply({
                content: `✅ Vending inventory successfully synced from Google Sheets.`,
                ephemeral: true,
            });

        } catch (error) {
            // ------------------- Handle errors that occur during syncing -------------------
            console.error('Error syncing vending inventory:', error);
            await interaction.reply({
                content: `❌ An error occurred while syncing vending inventory: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

