// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByNameAndUserId } = require('../../database/db');
const Mount = require('../../models/MountModel');
const { appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl, safeAppendDataToSheet, } = require('../../utils/googleSheetsUtils');
const User = require('../../models/UserModel');
const { calculateMountPrice } = require('../../modules/mountModule');

// ------------------- Define Stable Command -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('stable')
    .setDescription('Manage your stable for mounts')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character')
            .setRequired(true)
            .setAutocomplete(true)))
            .addSubcommand(subcommand =>
      subcommand
            .setName('browse')
            .setDescription('Browse mounts available for sale in the stable'))
            .addSubcommand(subcommand =>
      subcommand
        .setName('store')
        .setDescription('Store a mount in the stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('mountname')
            .setDescription('The name of the mount to store')
            .setAutocomplete(true)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Sell a mount to the stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('mountname')
            .setDescription('The name of the mount to sell')
            .setAutocomplete(true)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('retrieve')
        .setDescription('Retrieve a mount from the stable')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('mountname')
            .setDescription('The name of the mount to retrieve')
            .setAutocomplete(true)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Purchase a new character for your mount')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character to buy')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('price')
            .setDescription('The price for the new character')
            .setRequired(true))),

  // ------------------- Execute Stable Command -------------------
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      if (subcommand === 'view') {
        const characterName = interaction.options.getString('charactername');
        await handleViewStable(interaction, userId, characterName);
      } else if (subcommand === 'store') {
        const characterName = interaction.options.getString('charactername');
        const mountName = interaction.options.getString('mountname');
        await handleStoreMount(interaction, userId, characterName, mountName);
      } else if (subcommand === 'sell') {
        const characterName = interaction.options.getString('charactername');
        const mountName = interaction.options.getString('mountname');
        await handleSellMount(interaction, userId, characterName, mountName);
      } else if (subcommand === 'retrieve') {
        const characterName = interaction.options.getString('charactername');
        const mountName = interaction.options.getString('mountname');
        await handleRetrieveMount(interaction, userId, characterName, mountName);
      } else if (subcommand === 'browse') {
        await handleBrowseStable(interaction)      
      } else if (subcommand === 'buy') {
        const characterName = interaction.options.getString('charactername');
        const price = interaction.options.getInteger('price');
        await handleBuyCharacter(interaction, userId, characterName, price);
      }
    } catch (error) {
    handleError(error, 'stable.js');

      console.error('[stable.js]: Error executing stable command:', error);
      await interaction.reply({ content: '❌ An error occurred while managing your stable.', ephemeral: true });
    }
  },
};

// ------------------- Handle Viewing Stable -------------------
async function handleViewStable(interaction, userId, characterName) {
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, userId);

    if (!character) {
      await interaction.reply({ 
        content: `❌ Character **${characterName}** not found or does not belong to you.`, 
        ephemeral: true 
      });
      return;
    }

    const mounts = await Mount.find({ owner: character.name, isStored: true });

    const stableEmbed = {
      title: `${character.name}'s Stable`,
      description: mounts.length > 0
        ? mounts.map(mount => `- **${mount.name}** (${mount.species}, Level: ${mount.level})`).join('\n')
        : 'You don’t have any mounts stored in the stable!',
      color: 0x0099ff,
      timestamp: new Date(),
    };

    await interaction.reply({ embeds: [stableEmbed], ephemeral: true });
  } catch (error) {
    handleError(error, 'stable.js');

    console.error('[stable.js]: Error viewing stable:', error);
    await interaction.reply({ 
      content: '❌ Failed to retrieve stable information.', 
      ephemeral: true 
    });
  }
}

// ------------------- Handle Storing Mount -------------------
async function handleStoreMount(interaction, userId, characterName, mountName) {
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, userId);

    if (!character) {
      await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
      return;
    }

    const user = await User.findOne({ discordId: userId });
    if (!user || user.tokens < 100) {
      await interaction.reply({ 
        content: '❌ You do not have enough tokens to store this mount. (100 tokens required)', 
        ephemeral: true 
      });
      return;
    }
    user.tokens -= 100;

    if (isValidGoogleSheetsUrl(user.tokenTracker)) {
      const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
      const auth = await authorizeSheets();
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const values = [[
        `Stored Mount: ${mountName}`,       // SUBMISSION
        interactionUrl,                    // LINK
        'Other',                           // CATEGORIES
        'spent',                           // TYPE
        '-100'                             // TOKEN AMOUNT
      ]];
      await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!A:F', values);
    }

    const mountsInStable = await Mount.find({ owner: character.name, isStored: true });

    if (mountsInStable.length >= 3) {
      await interaction.reply({ content: '❌ Your stable is full! You can only store up to 3 mounts.', ephemeral: true });
      return;
    }

    const mount = await Mount.findOne({ owner: character.name, name: mountName });

    if (!mount) {
      await interaction.reply({ content: `❌ Mount **${mountName}** not found.`, ephemeral: true });
      return;
    }

    if (mount.isStored) {
      await interaction.reply({ content: `❌ Mount **${mountName}** is already stored in the stable.`, ephemeral: true });
      return;
    }

    mount.isStored = true;
    mount.storageLocation = character.currentVillage;
    mount.storedAt = new Date();
    mount.removedFromStorageAt = null;
    await mount.save();
    character.mount = false;
    await character.save();
    await user.save();

    await interaction.reply({ content: `✅ Mount **${mountName}** has been stored in the stable.`, ephemeral: true });
  } catch (error) {
    handleError(error, 'stable.js');

    console.error('[stable.js]: Error storing mount:', error);
    await interaction.reply({ content: '❌ Failed to store the mount.', ephemeral: true });
  }
}

// ------------------- Handle Selling Mount -------------------
async function handleSellMount(interaction, userId, characterName, mountName) {
    try {
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
  
      if (!character) {
        await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
        console.warn(`[stable.js]: Character not found for userId ${userId}, characterName: ${characterName}`);
        return;
      }
  
      const mount = await Mount.findOne({ owner: character.name, name: mountName });
  
      if (!mount) {
        await interaction.reply({ content: `❌ Mount **${mountName}** not found.`, ephemeral: true });
        console.warn(`[stable.js]: Mount not found. Owner: ${character.name}, Mount Name: ${mountName}`);
        return;
      }
  
      // Check if the mount is stored
      if (mount.isStored && mount.storageLocation === 'Stable') {
        await interaction.reply({
          content: `❌ Mount **${mountName}** is currently stored in the stable. Remove it from storage before listing it for sale.`,
          ephemeral: true,
        });
        console.warn(`[stable.js]: Mount is stored. Details: { mountId: ${mount._id}, owner: ${mount.owner}, storageLocation: ${mount.storageLocation} }`);
        return;
      }
  
      // Check if the mount is already listed for sale
      const Stable = require('../../models/StableModel'); // Import Stable model
      const stableEntry = await Stable.findOne({ mountId: mount._id, isSold: false });
  
      if (stableEntry) {
        await interaction.reply({
          content: `❌ Mount **${mountName}** is already listed for sale.`,
          ephemeral: true,
        });
        console.warn(`[stable.js]: Mount is already listed for sale. Details: { mountId: ${mount._id}, owner: ${mount.owner}, price: ${stableEntry.price} }`);
        return;
      }
  
      const basePrice = calculateMountPrice(mount);
      const sellPrice = Math.ceil(basePrice * 1.4); // Sell price is 1.4x the base price
  
      console.log(`[stable.js]: Calculating sell price for mount: ${mount.name}`);
      console.log(`[stable.js]: Base Price (Owner Payout): ${basePrice}, Listing Price: ${sellPrice}`);
  
      // Fetch the seller's User entry to use its _id (ObjectId)
      const user = await User.findOne({ discordId: userId });
  
      if (!user) {
        await interaction.reply({ content: `❌ Seller not found.`, ephemeral: true });
        console.warn(`[stable.js]: Seller not found for userId: ${userId}`);
        return;
      }
  
      // Add mount to the StableModel
      await Stable.create({
        mountId: mount._id,
        price: sellPrice,                     // Listing price
        sellerId: user._id,                   // Use the ObjectId from the User model
        originalOwner: character.name,        // Track the original owner
        species: mount.species,
        level: mount.level,
        appearance: mount.appearance,
        name: mount.name,
        stamina: mount.stamina,
        traits: mount.traits,
        region: mount.region,
      });
  
      // Remove the mount from the MountModel
      await Mount.deleteOne({ _id: mount._id });
  
      character.mount = false; // The character no longer has the mount
      await character.save();
  
      // Log the sale listing to Google Sheets
      if (isValidGoogleSheetsUrl(user.tokenTracker)) {
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
        const auth = await authorizeSheets();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const values = [[
          `Listed Mount: ${mount.name}`,    // SUBMISSION
          interactionUrl,                  // LINK
          'Other',                         // CATEGORIES
          'sale',                          // TYPE
          `${sellPrice}`                   // PRICE
        ]];
        await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!A:F', values);
      }
  
      await interaction.reply({
        content: `✅ Mount **${mountName}** has been listed for sale at **${sellPrice} tokens**. You will receive **${basePrice} tokens** upon sale.`,
        ephemeral: true,
      });
    } catch (error) {
    handleError(error, 'stable.js');

      console.error('[stable.js]: Error selling mount:', error);
      await interaction.reply({ content: '❌ Failed to list the mount for sale.', ephemeral: true });
    }
  }  
  
// ------------------- Handle Retrieving Mount -------------------
async function handleRetrieveMount(interaction, userId, characterName, mountName) {
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, userId);

    if (!character) {
      await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
      return;
    }

    const user = await User.findOne({ discordId: userId });
    if (!user || user.tokens < 100) {
      await interaction.reply({ 
        content: '❌ You do not have enough tokens to retrieve this mount. (100 tokens required)', 
        ephemeral: true 
      });
      return;
    }
    user.tokens -= 100;

    if (isValidGoogleSheetsUrl(user.tokenTracker)) {
      const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
      const auth = await authorizeSheets();
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const values = [[
        `Retrieved Mount: ${mountName}`,    // SUBMISSION
        interactionUrl,                    // LINK
        'Other',                           // CATEGORIES
        'spent',                           // TYPE
        '-100'                             // TOKEN AMOUNT
      ]];
      await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!A:F', values);
    }

    const mount = await Mount.findOne({ owner: character.name, name: mountName, isStored: true });

    if (!mount) {
      await interaction.reply({ content: `❌ Mount **${mountName}** is not stored in the stable.`, ephemeral: true });
      return;
    }

    mount.isStored = false;
    mount.storageLocation = null;
    mount.removedFromStorageAt = new Date();
    await mount.save();

    character.mount = true;
    await character.save();
    await user.save();

    await interaction.reply({ content: `✅ Mount **${mountName}** has been retrieved from the stable.`, ephemeral: true });
  } catch (error) {
    handleError(error, 'stable.js');

    console.error('[stable.js]: Error retrieving mount:', error);
    await interaction.reply({ content: '❌ Failed to retrieve the mount.', ephemeral: true });
  }
}

// ------------------- Handle Buying a Mount -------------------
async function handleBuyCharacter(interaction, userId, characterName, mountName) {
    try {
      const Stable = require('../../models/StableModel'); // Import Stable model
      const stableEntry = await Stable.findOne({ name: mountName, isSold: false });
  
      if (!stableEntry) {
        await interaction.reply({ content: `❌ Mount **${mountName}** is not available for purchase.`, ephemeral: true });
        return;
      }
  
      const user = await User.findOne({ discordId: userId });
  
      if (!user) {
        await interaction.reply({ content: `❌ User not found.`, ephemeral: true });
        return;
      }
  
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
  
      if (!character) {
        await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
        return;
      }
  
      if (user.tokens < stableEntry.price) {
        await interaction.reply({ 
          content: `❌ You do not have enough tokens to purchase this mount. Required: **${stableEntry.price} tokens**.`,
          ephemeral: true 
        });
        return;
      }
  
      user.tokens -= stableEntry.price;
      await user.save();
  
      // Log token deduction to Google Sheets
      if (isValidGoogleSheetsUrl(user.tokenTracker)) {
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
        const auth = await authorizeSheets();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const values = [[
          `Purchased Mount: ${mountName}`,  // SUBMISSION
          interactionUrl,                  // LINK
          'Other',                         // CATEGORIES
          'spent',                         // TYPE
          `-${stableEntry.price}`          // TOKEN AMOUNT
        ]];
        await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!A:F', values);
      }
  
      // Remove mount from the database
      const mount = await Mount.findById(stableEntry.mountId);
      if (!mount) {
        await interaction.reply({ content: `❌ Mount data for **${mountName}** could not be found.`, ephemeral: true });
        return;
      }
  
      // Delete the mount from the MountModel
      await Mount.deleteOne({ _id: mount._id });
  
      // Mark the stable entry as sold
      stableEntry.isSold = true;
      stableEntry.buyerId = userId;
      stableEntry.soldAt = new Date();
      await stableEntry.save();
  
      // Add the mount to the buyer's MountModel
      await Mount.create({
        discordId: user.discordId,
        characterId: character._id,
        species: stableEntry.species,
        level: stableEntry.level,
        name: stableEntry.name,
        stamina: stableEntry.stamina,
        owner: character.name,
        traits: stableEntry.traits,
        region: stableEntry.region,
      });
  
      character.mount = true; // The character now owns the mount
      await character.save();
  
      await interaction.reply({ 
        content: `✅ Successfully purchased the mount **${mountName}** for **${stableEntry.price} tokens**.`,
        ephemeral: true 
      });
    } catch (error) {
    handleError(error, 'stable.js');

      console.error('[stable.js]: Error buying mount:', error);
      await interaction.reply({ 
        content: '❌ Failed to purchase the mount.', 
        ephemeral: true 
      });
    }
  }

// ------------------- Handle Browsing Stable -------------------
async function handleBrowseStable(interaction) {
    try {
      const { mountEmojis } = require('../../modules/mountModule'); // Import mount emojis
      const Stable = require('../../models/StableModel'); // Import Stable model
      const availableMounts = await Stable.find({ isSold: false });
  
      if (availableMounts.length === 0) {
        await interaction.reply({ 
          content: '📜 There are currently no mounts available for sale in the stable.', 
          ephemeral: true 
        });
        return;
      }
  
      const stableEmbed = {
        title: '🏠 Stable - Mounts for Sale',
        description: availableMounts.map(mount => 
          `# **${mountEmojis[mount.species] || ''} __${mount.name}__**\n` +
          `  🐾 **Species**: ${mount.species}\n` +
          `  🏅 **Level**: ${mount.level}\n` +
          `  💰 **Price**: ${mount.price} tokens\n` +
          `  🥕 **Stamina**: ${mount.stamina}\n` +
          `  🏘️ **Village**: ${mount.region}\n` +
          `  👤 **Original Owner**: ${mount.originalOwner || 'Unknown'}\n` +
          `  ✨ **Traits**:\n${mount.traits.length > 0 ? mount.traits.map(trait => `>  ${trait}`).join('\n') : '> None'}`
        ).join('\n\n'),
        color: 0x0099ff,
        timestamp: new Date(),
        footer: {
          text: 'Browse the stable to find your perfect mount!',
        },
      };
  
      await interaction.reply({ embeds: [stableEmbed] });
    } catch (error) {
    handleError(error, 'stable.js');

      console.error('[stable.js]: Error browsing stable:', error);
      await interaction.reply({ 
        content: '❌ Failed to retrieve the list of mounts for sale.', 
        ephemeral: true 
      });
    }
  }
  
  
  
  
  
  
  
