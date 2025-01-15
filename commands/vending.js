// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
    executeVending,
    viewVendingStock,
    handleViewShop,
    handleVendingSetup,
    handleEditShop,
    handleFulfill,
    handlePouchUpgrade,
    handleVendingSync 
} = require('../handlers/vendingHandler');

// ------------------- Define the vending command with various subcommands -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('vending')
        .setDescription('Manage vending operations.')

        // ------------------- Subcommand: Collect Points -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('collect_points')
                .setDescription('Collect your monthly vending points.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )

        // ------------------- Subcommand: Restock -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('restock')
                .setDescription('Restock your shop with available items.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('The name of the item.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('stockqty')
                        .setDescription('The quantity of stock to add.')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('tokenprice')
                        .setDescription('The price in tokens.')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('artprice')
                        .setDescription('The price in art currency.')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('otherprice')
                        .setDescription('The price in other currency.')
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
                .setDescription('Sync old stock from the shop spreadsheet to the vending inventory.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('The name of the character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        // ------------------- Subcommand: Barter -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('barter')
                .setDescription('Handle a barter transaction between your character and a vendor.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('Your character initiating the barter.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('vendorcharacter')
                        .setDescription('The vendor character involved in the barter.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('The name of the item to barter for.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('quantity')
                        .setDescription('The quantity to barter.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('paymentmethod')
                        .setDescription('The payment method: art, token, or other.')
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
                .setDescription('Edit the details of items in your vending shop.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of your character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('itemname')
                        .setDescription('The name of the item to edit (use "Shop Image" to set shop image).')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('shopimagefile')
                        .setDescription('Upload the shop image file (if item is "Shop Image").')
                        .setRequired(false) // Make it optional for non-shop image updates
                )
                .addIntegerOption(option =>
                    option
                        .setName('tokenprice')
                        .setDescription('The new price in tokens.')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('artprice')
                        .setDescription('The new price in art currency.')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('otherprice')
                        .setDescription('The new price in other currency.')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('tradesopen')
                        .setDescription('Whether trades are open for this item.')
                        .setRequired(false)
                )
        )        
        
        // ------------------- Subcommand: Fulfill -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('fulfill')
                .setDescription('Fulfill a barter request.')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('The fulfillment ID of the barter request.')
                        .setRequired(true)
                )
        )
         // ------------------- Subcommand: Pouch -------------------
         .addSubcommand(subcommand =>
            subcommand
                .setName('pouch')
                .setDescription('Upgrade your vending character\'s pouch size.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of the vending character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('pouchtype')
                        .setDescription('The pouch type to upgrade to.')
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
                .setDescription('Set up a character for vending.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of the character.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('shoplink')
                        .setDescription('The Google Sheets link to the vending shop.')
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
                        .setDescription('How many points does the character have?')
                        .setRequired(true)
                )
        )

        // ------------------- Subcommand: View Shop -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('viewshop')
                .setDescription('View a character’s shop details.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of the character to view.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )        
        // ------------------- Subcommand: View Stock -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('viewstock')
                .setDescription('View the current vending stock list.')
        ),

    // ------------------- Execute the appropriate command based on user input -------------------
async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Route to the appropriate handler based on subcommand
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
        await handleVendingSync(interaction); // Added sync handler
    } else {
        await executeVending(interaction);
    }
},
};
