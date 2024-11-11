// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { executeVending, viewVendingStock } = require('../handlers/vendingHandler');

// ------------------- Define the vending command with various subcommands -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('vending')
    .setDescription('Manage vending operations.')
    
    // Collect monthly vending points
    .addSubcommand(subcommand =>
      subcommand
        .setName('collect_points')
        .setDescription('Collect your monthly vending points.')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of your character')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )

    // Restock the vending shop
    .addSubcommand(subcommand =>
      subcommand
        .setName('restock')
        .setDescription('Restock your shop with available items.')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of your character')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )

    // Handle a barter transaction
    .addSubcommand(subcommand =>
      subcommand
        .setName('barter')
        .setDescription('Handle a barter transaction.')
        .addStringOption(option =>
          option.setName('vendorname')
            .setDescription('Name of the vendor')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('item')
            .setDescription('Item name for barter')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('price')
            .setDescription('Price agreed for barter')
            .setRequired(true)
        )
    )

    // View the current vending stock list
    .addSubcommand(subcommand =>
      subcommand
        .setName('viewstock')
        .setDescription('View the current vending stock list.')
    ),

  // ------------------- Execute the appropriate command based on user input -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'viewstock') {
      await viewVendingStock(interaction);
    } else {
      await executeVending(interaction);
    }
  },
};

