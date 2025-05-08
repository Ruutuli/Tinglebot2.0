// ============================================================================
// ------------------- Vending Slash Command Router -------------------
// Registers all /vending subcommands and dispatches to handlers.
// ============================================================================

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('discord.js');

// ------------------- Command Handlers -------------------
const {
    executeVending,
    handleCollectPoints,
    handleRestock,
    handleBarter,
    handleFulfill,
    handleEditShop,
    handleVendingSync,
    handlePouchUpgrade,
    handleVendingSetup,
    handleViewShop,
    handleShopLink,
    viewVendingStock
  } = require('../../handlers/vendingHandler');
  
// ============================================================================
// ------------------- Slash Command Definition -------------------
// Main command: /vending
// ============================================================================
const command = new SlashCommandBuilder()
  .setName('vending')
  .setDescription('🎪 Manage your vending shop and trades')

  // ------------------- Shop Setup & Management -------------------
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('🎪 Set up your vending shop')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('shoplink')
          .setDescription('Google Sheets URL for your shop inventory')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('pouchtype')
          .setDescription('Your shop pouch type')
          .setRequired(true)
          .addChoices(
            { name: 'None', value: 'none' },
            { name: 'Bronze', value: 'bronze' },
            { name: 'Silver', value: 'silver' },
            { name: 'Gold', value: 'gold' }
          )
      )
      .addIntegerOption(opt =>
        opt.setName('points')
          .setDescription('Your current vending points (if any)')
      )
      .addStringOption(opt =>
        opt.setName('shopimage')
          .setDescription('URL for your shop banner image (optional)')
      )
  )

  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('📦 Add items to your shop')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Name of the item to add')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('quantity')
          .setDescription('How many to add')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName('tokenprice')
          .setDescription('Price in tokens (optional)')
      )
      .addStringOption(opt =>
        opt.setName('artprice')
          .setDescription('Price in art (optional)')
      )
      .addStringOption(opt =>
        opt.setName('otherprice')
          .setDescription('Other price details (optional)')
      )
  )

  .addSubcommand(sub =>
    sub.setName('edit')
      .setDescription('✏️ Edit your shop items or settings')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('action')
          .setDescription('What would you like to edit?')
          .setRequired(true)
          .addChoices(
            { name: '📝 Edit Item', value: 'item' },
            { name: '🖼️ Update Shop Banner', value: 'banner' }
          )
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Item to edit (required for item editing)')
          .setAutocomplete(true)
      )
      .addAttachmentOption(opt =>
        opt.setName('shopimagefile')
          .setDescription('Upload new shop banner image (required for banner update)')
      )
      .addIntegerOption(opt =>
        opt.setName('tokenprice')
          .setDescription('New token price (for item editing)')
      )
      .addStringOption(opt =>
        opt.setName('artprice')
          .setDescription('New art price (for item editing)')
      )
      .addStringOption(opt =>
        opt.setName('otherprice')
          .setDescription('New other price (for item editing)')
      )
  )

  // ------------------- Viewing & Browsing -------------------
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('👀 View a shop\'s inventory')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Shop owner to view')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )

  .addSubcommand(sub =>
    sub.setName('stock')
      .setDescription('📊 View current month\'s vending stock by village')
  )

  // ------------------- Trading System -------------------
  .addSubcommand(sub =>
    sub.setName('buy')
      .setDescription('🛍️ Buy items from a shop')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('vendorcharacter')
          .setDescription('Shop you\'re buying from')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Item you want to buy')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('quantity')
          .setDescription('How many to buy')
          .setRequired(true)
      )
  )

  .addSubcommand(sub =>
    sub.setName('trade')
      .setDescription('🔄 Propose a trade for an item')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('vendorcharacter')
          .setDescription('Shop you\'re trading with')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Item you want to trade for')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('quantity')
          .setDescription('Quantity to request')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('offer')
          .setDescription('What you are offering in return')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('notes')
          .setDescription('Additional notes for the vendor')
      )
  )

  .addSubcommand(sub =>
    sub.setName('accept')
      .setDescription('✅ Accept a pending trade request')
      .addStringOption(opt =>
        opt.setName('fulfillmentid')
          .setDescription('The trade request ID')
          .setRequired(true)
      )
  );

// ============================================================================
// ------------------- Dispatcher Function -------------------
// Routes interaction to the correct handler based on subcommand.
// ============================================================================
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
  
    switch (subcommand) {
      case 'barter':
        return await handleBarter(interaction);
  
      case 'fulfill':
        return await handleFulfill(interaction);
  
      case 'editshop':
        return await handleEditShop(interaction);
  
      case 'sync':
        return await handleVendingSync(interaction);
  
      case 'pouch':
        return await handlePouchUpgrade(interaction);
  
      case 'setup':
        return await handleVendingSetup(interaction);
  
      case 'viewshop':
        return await handleViewShop(interaction);

      case 'viewstock':
        return await viewVendingStock(interaction);

      case 'shoplink':
        return await handleShopLink(interaction);
  
      case 'collect_points':
        return await executeVending(interaction);

      case 'add':
        return await handleRestock(interaction);
  
      default:
        return interaction.reply({
          content: '❌ Unknown vending subcommand.',
          ephemeral: true
        });
    }
  }
  
  // ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    data: command,
    execute
  };
  