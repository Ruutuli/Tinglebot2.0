// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
    executeVending,
    viewVendingStock,
    handleViewShop,
    handleSyncVending,
    handleVendingSetup,
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
        )
        // ------------------- Subcommand: Stock -------------------
        .addSubcommand(subcommand =>
          subcommand
              .setName('barter')
              .setDescription('Handle a barter transaction.')
              .addStringOption(option =>
                  option
                      .setName('vendorname')
                      .setDescription('Name of the vendor.')
                      .setRequired(true)
              )
              .addStringOption(option =>
                  option
                      .setName('item')
                      .setDescription('Item name for barter.')
                      .setRequired(true)
              )
              .addIntegerOption(option =>
                  option
                      .setName('price')
                      .setDescription('Price agreed for barter.')
                      .setRequired(true)
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

        // ------------------- Subcommand: Sync -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync items from the vending shop to the database.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The name of the character whose shop to sync.')
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
        } else if (subcommand === 'sync') {
            await handleSyncVending(interaction);
        } else {
            await executeVending(interaction);
        }
    },
};
