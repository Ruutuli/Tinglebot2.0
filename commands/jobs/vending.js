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
  .setDescription('Manage vending and barter system')

  // ------------------- /vending collect_points -------------------
  .addSubcommand(sub =>
    sub.setName('collect_points')
      .setDescription('🎯 Award vending points to a character')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Name of the character')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )

  // ------------------- /vending restock -------------------
  .addSubcommand(sub =>
    sub.setName('restock')
      .setDescription('📦 Add a new item to your vending shop')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('slot')
          .setDescription('Manually assign a slot (e.g., Slot 3)')
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Name of the item to restock')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('stockqty')
          .setDescription('Quantity to add to stock')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName('tokenprice')
          .setDescription('Token price (optional)')
      )
      .addStringOption(opt =>
        opt.setName('artprice')
          .setDescription('Art price (optional)')
      )
      .addStringOption(opt =>
        opt.setName('otherprice')
          .setDescription('Other price (optional)')
      )
      .addBooleanOption(opt =>
        opt.setName('tradesopen')
          .setDescription('Is this item open for trades?')
      )
  )

  // ------------------- /vending barter -------------------
  .addSubcommand(sub =>
    sub.setName('barter')
      .setDescription('🔄 Submit a barter request')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('vendorcharacter')
          .setDescription('Name of the character/shop you\'re bartering with')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Item you want to barter for')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('quantity')
          .setDescription('Quantity to request')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('paymentmethod')
          .setDescription('What you are offering in return')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('notes')
          .setDescription('Optional notes for the vendor')
      )
  )

  // ------------------- /vending fulfill -------------------
  .addSubcommand(sub =>
    sub.setName('fulfill')
      .setDescription('✅ Fulfill a pending barter request')
      .addStringOption(opt =>
        opt.setName('fulfillmentid')
          .setDescription('The unique Fulfillment ID')
          .setRequired(true)
      )
  )

  // ------------------- /vending editshop -------------------
  .addSubcommand(sub =>
    sub.setName('editshop')
      .setDescription('🛠️ Edit an existing item or upload a shop image')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Your character\'s name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('slot')
          .setDescription('Update item slot (e.g., Slot 2)')
      )
      .addStringOption(opt =>
        opt.setName('itemname')
          .setDescription('Item name or type "shop image" to upload banner')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addAttachmentOption(opt =>
        opt.setName('shopimagefile')
          .setDescription('Upload shop banner image (used if itemname is "shop image")')
      )
      .addIntegerOption(opt =>
        opt.setName('tokenprice')
          .setDescription('New token price')
      )
      .addStringOption(opt =>
        opt.setName('artprice')
          .setDescription('New art price')
      )
      .addStringOption(opt =>
        opt.setName('otherprice')
          .setDescription('New other price')
      )
      .addBooleanOption(opt =>
        opt.setName('tradesopen')
          .setDescription('Update if trades are open')
      )
  )

  // ------------------- /vending sync -------------------
  .addSubcommand(sub =>
    sub.setName('sync')
      .setDescription('🔁 Sync inventory from Google Sheets (Old Stock only)')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Character to sync')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )

  // ------------------- /vending pouch -------------------
  .addSubcommand(sub =>
    sub.setName('pouch')
      .setDescription('🎒 Upgrade your pouch size')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Character upgrading pouch')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('pouchtype')
          .setDescription('Choose a new pouch tier')
          .setRequired(true)
          .addChoices(
            { name: 'None', value: 'none' },
            { name: 'Bronze', value: 'bronze' },
            { name: 'Silver', value: 'silver' },
            { name: 'Gold', value: 'gold' }
          )
      )
  )

  // ------------------- /vending setup -------------------
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('🧾 Set up a character to become a vendor')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Name of the vendor character')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('shoplink')
          .setDescription('Google Sheets URL to your shop')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('pouch')
          .setDescription('Starting pouch tier')
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
          .setDescription('Initial vending point total')
          .setRequired(true)
      )
  )

  // ------------------- /vending viewshop -------------------
  .addSubcommand(sub =>
    sub.setName('viewshop')
      .setDescription('🛒 View a character’s active vending shop')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Shop owner to view')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )

  // ------------------- /vending shoplink -------------------
  .addSubcommand(sub =>
    sub.setName('shoplink')
      .setDescription('🔗 Link or update your character’s vending sheet')
      .addStringOption(opt =>
        opt.setName('charactername')
          .setDescription('Character to assign the sheet to')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt.setName('link')
          .setDescription('Google Sheets URL')
          .setRequired(true)
      )
  )

  // ------------------- /vending viewstock -------------------
  .addSubcommand(sub =>
    sub.setName('viewstock')
      .setDescription('📊 View current month’s vending stock by village')
  );

 // ============================================================================
// ------------------- Dispatcher Function -------------------
// Routes interaction to the correct handler based on subcommand.
// ============================================================================
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
  
    switch (subcommand) {
      case 'restock':
        return await handleRestock(interaction);
  
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
  