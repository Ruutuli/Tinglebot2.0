// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { handleShopsAutocomplete } = require('../handlers/autocompleteHandler');

// Utilities and Services
const { getOrCreateToken,updateTokenBalance } = require('../database/tokenService');
const { fetchItemByName } = require('../database/itemService'); 
const { fetchCharacterByName, getCharacterInventoryCollection } = require('../database/characterService');
const { appendSheetData, extractSpreadsheetId, authorizeSheets } = require('../utils/googleSheetsUtils');
const { hasPerk } = require('../modules/jobsModule');

// Models
const ShopStock = require('../models/ShopsModel');
const ItemModel = require('../models/ItemModel')
const User = require('../models/UserModel');


module.exports = {
  // ------------------- Define the shops command -------------------
  data: new SlashCommandBuilder()
    .setName('shops')
    .setDescription('Manage shop interactions.')

    // Subcommand to view shop inventory
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View items available in the shop.')
    )

    // Subcommand to buy items from the shop
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Buy an item from the shop.')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of your character.')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('itemname')
              .setDescription('The name of the item to buy.')
              .setRequired(true)
              .setAutocomplete(true)
          )
        .addIntegerOption(option =>
          option.setName('quantity')
            .setDescription('The quantity to buy.')
            .setRequired(true)
        )
    )

    // Subcommand to sell items to the shop
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Sell an item to the shop.')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of your character.')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('itemname')
            .setDescription('The name of the item to sell.')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option.setName('quantity')
            .setDescription('The quantity to sell.')
            .setRequired(true)
        )
    ),

  // ------------------- Execute the shops command -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      await handleShopView(interaction);
    } else if (subcommand === 'buy') {
      await handleShopBuy(interaction);
    } else if (subcommand === 'sell') {
      await handleShopSell(interaction);
    }
  },

// ------------------- Autocomplete handler for shops -------------------
async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const commandName = interaction.commandName;
  
    if (commandName === 'shops' && focusedOption.name === 'charactername') {
      // Use the correct handler for charactername autocomplete
      await handleCharacterBasedCommandsAutocomplete(interaction, focusedOption, commandName);
    } else if (commandName === 'shops' && focusedOption.name === 'itemname') {
      // Use the dedicated handler for itemname autocomplete in shops
      await handleShopsAutocomplete(interaction, focusedOption);
    }
  },
  
  
};  

// ------------------- Handle viewing shop items -------------------
async function handleShopView(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true }); // Make the reply ephemeral
      const items = await ShopStock.find().sort({ itemName: 1 }).lean(); // Sort items alphabetically by itemName
      if (!items || items.length === 0) {
        return interaction.editReply('❌ The shop is currently empty.');
      }
  
      const ITEMS_PER_PAGE = 10;
      const pages = Math.ceil(items.length / ITEMS_PER_PAGE);
      let currentPage = 0;
  
      const generateEmbed = async (page) => {
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const itemsList = await Promise.all(
          items.slice(start, end).map(async (item) => {
            const itemDetails = await fetchItemByName(item.itemName);
            const buyPrice = itemDetails?.buyPrice || 'N/A';
            const sellPrice = itemDetails?.sellPrice || 'N/A';
            const emoji = itemDetails?.emoji || '🛒';
            return `__ ${emoji} **${item.itemName}**__ - Qty: ${item.quantity}\n> 🪙 Buy Price: ${buyPrice} \n> 🪙 Sell Price: ${sellPrice}`;
          })
        );
  
        return new EmbedBuilder()
          .setTitle('🛒 Shop Inventory')
          .setDescription(itemsList.join('\n\n'))
          .setColor('#A48D68')
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: `Page ${page + 1} of ${pages}` });
      };
  
      const generateButtons = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next➡️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === pages - 1)
        );
      };
  
      const message = await interaction.editReply({
        embeds: [await generateEmbed(currentPage)],
        components: [generateButtons(currentPage)]
      });
  
      const collector = message.createMessageComponentCollector({ time: 60000 });
  
      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '❌ You cannot interact with this.', ephemeral: true });
        }
  
        if (i.customId === 'prev') currentPage--;
        if (i.customId === 'next') currentPage++;
  
        await i.update({
          embeds: [await generateEmbed(currentPage)],
          components: [generateButtons(currentPage)]
        });
      });
  
      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (error) {
          console.error('[shops]: Error clearing buttons:', error);
        }
      });
    } catch (error) {
      console.error('[shops]: Error viewing shop items:', error);
      interaction.editReply('❌ An error occurred while viewing the shop inventory.');
    }
  }

  // ------------------- Handle Shop Buy items -------------------
  async function handleShopBuy(interaction) {
    try {
      await interaction.deferReply();
  
      // Fetch user's token data early
      const user = await getOrCreateToken(interaction.user.id);
      if (!user.tokensSynced) {
        return interaction.editReply('❌ Your tokens are not synced. Please sync your tokens to use this command.');
      }
  
      const characterName = interaction.options.getString('charactername');
      const itemName = interaction.options.getString('itemname');
      const quantity = interaction.options.getInteger('quantity');
  
      console.log(`[shops]: Initiating purchase for character: ${characterName}, item: ${itemName}, quantity: ${quantity}`);
  
      const character = await fetchCharacterByName(characterName);
      if (!character) {
        return interaction.editReply('❌ Character not found.');
      }
  
      const shopItem = await ShopStock.findOne({ itemName }).lean();
      if (!shopItem) {
        return interaction.editReply('❌ Item not found in the shop.');
      }
  
      const shopQuantity = parseInt(shopItem.quantity, 10); // Convert to number
      if (isNaN(shopQuantity)) {
        return interaction.editReply('❌ Shop item quantity is invalid.');
      }
  
      if (shopQuantity < quantity) {
        return interaction.editReply('❌ Not enough stock available.');
      }
  
      const itemDetails = await ItemModel.findOne({ itemName }).select('buyPrice image category type subtype').lean();
      if (!itemDetails) {
        return interaction.editReply('❌ Unable to retrieve item details.');
      }
  
      const totalPrice = itemDetails.buyPrice * quantity;
  
      // Fetch user's current token balance
      const currentTokens = user.tokens;
  
      // Check if user has enough tokens
      if (currentTokens < totalPrice) {
        return interaction.editReply(`❌ You do not have enough tokens. Current Balance: 🪙 ${currentTokens}. Required: 🪙 ${totalPrice}.`);
      }
  
      const inventoryCollection = await getCharacterInventoryCollection(characterName);
      await inventoryCollection.updateOne(
        { itemName },
        { $inc: { quantity: quantity } },
        { upsert: true }
      );
  
// Ensure `quantity` field is numeric before using $inc
await ShopStock.updateOne(
    { itemName },
    {
      $set: { quantity: parseInt(shopQuantity, 10) - quantity } // Ensure numeric operation
    }
  );
  
  
      const inventoryLink = character.inventory || 'https://example.com/inventory/default';
      const tokenTrackerLink = user.tokenTracker || 'https://example.com/tokens/default';
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
  
      // Log to Token Tracker
      if (user.tokenTracker) {
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
        const auth = await authorizeSheets();
        const tokenRow = [
          `${characterName} - ${itemName} x${quantity} - Shop Purchase`,
          interactionUrl,
          'purchase',
          'spent',
          `-${totalPrice}`
        ];
        await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', [tokenRow]);
      }
  
      // Log to Inventory Tracker
      if (character.inventory) {
        const spreadsheetId = extractSpreadsheetId(character.inventory);
        const auth = await authorizeSheets();
        const inventoryRow = [
          character.name,
          itemName,
          quantity.toString(),
          itemDetails.category.join(', '),
          itemDetails.type.join(', '),
          itemDetails.subtype?.join(', ') || '',
          'Purchase from shop',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
        await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', [inventoryRow]);
      }
  
      // Deduct tokens
      await updateTokenBalance(interaction.user.id, -totalPrice);
  
      // Create an embed for the purchase confirmation
      const purchaseEmbed = new EmbedBuilder()
      .setTitle('✅ Purchase Successful!')
      .setDescription(`**${characterName}** successfully bought **${itemName} x ${quantity}** for 🪙 ${totalPrice} tokens`)
      .setThumbnail(itemDetails.image || 'https://via.placeholder.com/150')
      .setAuthor({ name: characterName, iconURL: character.icon || '' }) // Add character icon here
      .setColor('#A48D68')
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .addFields(
        { name: '📦 Inventory Link', value: `[View Inventory](${inventoryLink})`, inline: true },
        { name: '🪙 Token Tracker', value: `[View Tracker](${tokenTrackerLink})`, inline: true }
      )
      .setFooter({ text: `The village bazaars thank you for your purchase!` });
    
  
      interaction.editReply({ embeds: [purchaseEmbed] });
    } catch (error) {
      console.error('[shops]: Error buying item:', error);
      interaction.editReply('❌ An error occurred while trying to buy the item.');
    }
  }
  

  // ------------------- Handle Selling items -------------------
  async function handleShopSell(interaction) {
    try {
      await interaction.deferReply();
  
      const characterName = interaction.options.getString('charactername');
      const itemName = interaction.options.getString('itemname');
      const quantity = interaction.options.getInteger('quantity');
  
      console.log(`[shops]: Initiating sale process for character: ${characterName}, item: ${itemName}, quantity: ${quantity}`);
  
      const character = await fetchCharacterByName(characterName);
      if (!character) {
        console.error(`[shops]: Character not found: ${characterName}`);
        return interaction.editReply('❌ Character not found.');
      }
  
      const inventoryCollection = await getCharacterInventoryCollection(characterName);
      const inventoryItem = await inventoryCollection.findOne({ itemName });
  
      if (!inventoryItem || parseInt(inventoryItem.quantity, 10) < quantity) {
        console.error(`[shops]: Insufficient inventory for item: ${itemName}. Available: ${inventoryItem?.quantity || 0}`);
        return interaction.editReply('❌ Not enough of the item in your inventory to sell.');
      }
  
      console.log(`[shops]: Inventory item found. Quantity available: ${inventoryItem.quantity}`);
  
      // Check if the item was crafted
      const isCrafted = inventoryItem.obtain.includes('Crafting');
      console.log(`[shops]: Item crafted: ${isCrafted}`);
  
      if (!isCrafted) {
        console.warn(`[shops]: Item not crafted: ${itemName}. Obtain method: ${inventoryItem.obtain}`);
        console.log(`[shops]: Proceeding to sell item at the standard sell price.`);
      }
      
  
      // Fetch item details
      const itemDetails = await ItemModel.findOne({ itemName }).select('buyPrice sellPrice category type image craftingJobs').lean();
      if (!itemDetails) {
        console.error(`[shops]: Item details not found in database: ${itemName}`);
        return interaction.editReply('❌ Item details not found.');
      }
  
      console.log(`[shops]: Item details found. Buy price: ${itemDetails.buyPrice}, Sell price: ${itemDetails.sellPrice}, Category: ${itemDetails.category}, Crafting jobs: ${itemDetails.craftingJobs}`);
  
// Normalize both character job and crafting jobs to lowercase for case-insensitive matching
const normalizedCharacterJob = character.job.toLowerCase();
const normalizedCraftingJobs = itemDetails.craftingJobs.map(job => job.toLowerCase());

// Validate if the character's job matches any crafting job
const characterMeetsRequirements = hasPerk(character, 'CRAFTING') && 
    normalizedCraftingJobs.includes(normalizedCharacterJob);

console.log(`[shops]: Character job: ${character.job}, Crafting jobs (normalized): ${normalizedCraftingJobs}`);
console.log(`[shops]: Meets crafting requirements: ${characterMeetsRequirements}`);

  
      const sellPrice = isCrafted && characterMeetsRequirements
        ? itemDetails.buyPrice // Sell at buy price for crafted items
        : itemDetails.sellPrice || 0;
  
      if (sellPrice <= 0) {
        console.warn(`[shops]: Invalid sell price for item: ${itemName}. Character job: ${character.job}, Item category: ${itemDetails.category}`);
        return interaction.editReply('❌ This item cannot be sold to the shop.');
      }
  
      console.log(`[shops]: Valid sell price determined: ${sellPrice}`);
  
      // Deduct from character's inventory
      await inventoryCollection.updateOne(
        { itemName },
        { $inc: { quantity: -quantity } }
      );
  
      console.log(`[shops]: Deducted ${quantity}x ${itemName} from inventory.`);
  
      // Add to shop's stock
      await ShopStock.updateOne(
        { itemName },
        { $inc: { quantity: quantity } },
        { upsert: true }
      );
  
      console.log(`[shops]: Added ${quantity}x ${itemName} to shop stock.`);
  
      const totalPrice = sellPrice * quantity;
  
      // Update user's token balance
      await updateTokenBalance(interaction.user.id, totalPrice);
  
      console.log(`[shops]: Updated user's token balance by ${totalPrice}.`);
  
      // Fetch user's token tracker details
      const user = await User.findOne({ discordId: interaction.user.id });
      if (user?.tokenTracker) {
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
        const auth = await authorizeSheets();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const tokenRow = [
          `${characterName} - Sold ${itemName} x${quantity}`,
          interactionUrl,
          'sale',
          'earned',
          `+${totalPrice}`
        ];
        await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', [tokenRow]);
        console.log(`[shops]: Logged sale in token tracker.`);
      }
  
      // Log the sale in the inventory tracker
      if (character.inventory) {
        const spreadsheetId = extractSpreadsheetId(character.inventory);
        const auth = await authorizeSheets();
        const formattedDateTime = new Date().toISOString();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const inventoryRow = [
          character.name,
          itemName,
          `-${quantity}`,
          itemDetails.category,
          itemDetails.type,
          '',
          'Sold to shop',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
        await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:M', [inventoryRow]);
        console.log(`[shops]: Logged sale in inventory tracker.`);
      }
  
      // Create an embed for the sale confirmation
      const saleEmbed = new EmbedBuilder()
      .setTitle('✅ Sale Successful!')
      .setDescription(`**${characterName}** successfully sold **${itemName} x ${quantity}** for 🪙 ${totalPrice} tokens`)
      .setThumbnail(itemDetails.image || 'https://via.placeholder.com/150')
      .setAuthor({ name: characterName, iconURL: character.icon || '' }) // Add character icon here
      .setColor('#A48D68')
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .addFields(
        { name: '📦 Inventory Link', value: `[View Inventory](${character.inventory || 'https://example.com/inventory'})`, inline: true },
        { name: '🪙 Token Tracker', value: `[View Tracker](${user?.tokenTracker || 'https://example.com/tokens'})`, inline: true }
      );    
  
      interaction.editReply({ embeds: [saleEmbed] });
    } catch (error) {
      console.error('[shops]: Error selling item:', error);
      interaction.editReply('❌ An error occurred while trying to sell the item.');
    }
  }
  