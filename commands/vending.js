// ------------------- Discord.js Components -------------------
// Used to build and structure slash commands.
const { SlashCommandBuilder } = require('@discordjs/builders');


const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Modules -------------------
// Custom handlers for vending operations sorted alphabetically.
const { executeVending, handleEditShop, handleFulfill, handlePouchUpgrade, handleVendingSetup, handleVendingSync, handleViewShop, viewVendingStock } = require('../handlers/vendingHandler');


// ------------------- Slash Command Definition and Execution -------------------
// This module defines the "vending" command with various subcommands to manage vending operations.
// Each subcommand routes to its corresponding handler function.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('vending')
        .setDescription('Manage vending operations. 💼')

        // ------------------- Subcommand: Collect Points -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('collect_points')
                .setDescription('💰 Collect your monthly vending points.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // ------------------- Subcommand: Restock -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('restock')
                .setDescription('📦 Restock your shop with available items.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('Enter the name of the item.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('stockqty')
                        .setDescription('Enter the quantity of stock to add.')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('tokenprice')
                        .setDescription('Enter the price in tokens (optional).')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('artprice')
                        .setDescription('Enter the price in art currency (optional).')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('otherprice')
                        .setDescription('Enter the price in other currency (optional).')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('tradesopen')
                        .setDescription('Is this item open for trades?')
                        .setRequired(false)
                )
        )

        // ------------------- Subcommand: Sync -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('🔄 Sync old stock from the shop spreadsheet to the vending inventory.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // ------------------- Subcommand: Barter -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('barter')
                .setDescription('🤝 Handle a barter transaction between your character and a vendor.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of your character initiating the barter.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('vendorcharacter')
                        .setDescription('Enter the vendor character involved in the barter.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('Enter the name of the item to barter for.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('quantity')
                        .setDescription('Enter the quantity to barter.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('paymentmethod')
                        .setDescription('Select the payment method: art, token, other, or trade.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Art', value: 'art' },
                            { name: 'Token', value: 'token' },
                            { name: 'Other', value: 'other' },
                            { name: 'Trade', value: 'trade' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('notes')
                        .setDescription('Optional notes about the barter transaction.')
                        .setRequired(false)
                )
        )

        // ------------------- Subcommand: Edit Shop -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('editshop')
                .setDescription('✏️ Edit the details of items in your vending shop.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('Enter the name of the item to edit (use "Shop Image" to set shop image).')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('shopimagefile')
                        .setDescription('Upload the shop image file (if item is "Shop Image").')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('tokenprice')
                        .setDescription('Enter the new price in tokens (optional).')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('artprice')
                        .setDescription('Enter the new price in art currency (optional).')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('otherprice')
                        .setDescription('Enter the new price in other currency (optional).')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('tradesopen')
                        .setDescription('Are trades open for this item?')
                        .setRequired(false)
                )
        )

        // ------------------- Subcommand: Fulfill -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('fulfill')
                .setDescription('✅ Fulfill a barter request.')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Enter the fulfillment ID of the barter request.')
                        .setRequired(true)
                )
        )

        // ------------------- Subcommand: Pouch -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('pouch')
                .setDescription('📈 Upgrade your vending character\'s pouch size.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of the vending character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('pouchtype')
                        .setDescription('Select the pouch type to upgrade to.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Bronze (15 slots)', value: 'bronze' },
                            { name: 'Silver (30 slots)', value: 'silver' },
                            { name: 'Gold (50 slots)', value: 'gold' }
                        )
                )
        )

        // ------------------- Subcommand: Setup -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('🛠️ Set up a character for vending.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of the character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('shoplink')
                        .setDescription('Enter the Google Sheets link to the vending shop.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('pouch')
                        .setDescription('Does the character have a pouch?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'None', value: 'none' },
                            { name: 'Bronze', value: 'bronze' },
                            { name: 'Silver', value: 'silver' },
                            { name: 'Gold', value: 'gold' }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('points')
                        .setDescription('Enter the number of points the character has.')
                        .setRequired(true)
                )
        )

        // ------------------- Subcommand: View Shop -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('viewshop')
                .setDescription('👀 View a character’s shop details.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Enter the name of the character to view.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // ------------------- Subcommand: View Stock -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('viewstock')
                .setDescription('📋 View the current vending stock list.')
        ),

    // ------------------- Command Execution -------------------
    // Routes the user's subcommand to its corresponding handler function.
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        console.log(`[vending.js:logs] Executing subcommand: ${subcommand}`);

        try {
            if (subcommand === 'viewstock') {
                await viewVendingStock(interaction);
            } else if (subcommand === 'viewshop') {
                await handleViewShop(interaction, interaction.user.id);
            } else if (subcommand === 'setup') {
                await handleVendingSetup(interaction);
            } else if (subcommand === 'editshop') {
                await handleEditShop(interaction);
            } else if (subcommand === 'fulfill') {
                await handleFulfill(interaction);
            } else if (subcommand === 'pouch') {
                await handlePouchUpgrade(interaction);
            } else if (subcommand === 'sync') {
                await handleVendingSync(interaction);
            } else {
                await executeVending(interaction);
            }
        } catch (error) {
    handleError(error, 'vending.js');

            console.error(`[vending.js:error] Error executing subcommand "${subcommand}": ${error}`);
            await interaction.reply({ content: '❌ **An error occurred while processing your vending command.**', ephemeral: true });
        }
    },
};
