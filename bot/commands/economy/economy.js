const {
 SlashCommandBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 EmbedBuilder,
 MessageFlags,
} = require("discord.js");
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { trackDatabaseError, isDatabaseError } = require('@/utils/globalErrorHandler.js');
const { handleTokenError } = require('@/utils/tokenUtils.js');
const { enforceJail } = require('@/utils/jailCheck');
const logger = require('@/utils/logger');
const { v4: uuidv4 } = require("uuid");
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
 fetchAllCharactersExceptUser,
 fetchModCharacterByNameAndUserId,
 fetchAllModCharacters,
 getCharacterInventoryCollection,
 getCharacterInventoryCollectionWithModSupport,
 getOrCreateToken,
 updateTokenBalance,
 fetchItemByName
} = require('@/database/db.js');
const {
 addItemInventoryDatabase,
 removeItemInventoryDatabase,
 syncToInventoryDatabase,
 escapeRegExp,
 logItemAcquisitionToDatabase,
 logItemRemovalToDatabase,
} = require('@/utils/inventoryUtils.js');
// Google Sheets functionality removed
const { checkInventorySync } = require('@/utils/characterUtils.js');
const ItemModel = require('@/models/ItemModel.js');
const ShopStock = require('@/models/VillageShopsModel');
const User = require('@/models/UserModel');
const CharacterModel = require('@/models/CharacterModel.js');
const {
 createGiftEmbed,
 createTradeEmbed,
 createTransferEmbed,
 updateBoostRequestEmbed,
 createEquippedItemErrorEmbed
} = require("../../embeds/embeds.js");
const { hasPerk } = require("../../modules/jobsModule");
const TempData = require('@/models/TempDataModel');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { applyPriestTokensBoost, applyFortuneTellerTokensBoost } = require("../../modules/boostingModule");
const { applyTokenBoost, getCharacterBoostStatus } = require("../../modules/boostIntegration");
const {
 retrieveBoostingRequestFromTempDataByCharacter,
 saveBoostingRequestToTempData,
 updateBoostAppliedMessage,
 clearBoostAfterUse
} = require("../jobs/boosting");
const DEFAULT_EMOJI = "🔹";

/** Economy commands are only allowed in this channel. */
const ECONOMY_CHANNEL_ID = "651614266046152705";

/** Gift subcommand is also allowed in village town halls (where both characters are present). */
const GIFT_ALLOWED_CHANNEL_IDS = [
  ECONOMY_CHANNEL_ID,
  process.env.RUDANIA_TOWNHALL,
  process.env.INARIKO_TOWNHALL,
  process.env.VHINTL_TOWNHALL
].filter(Boolean);

async function getItemEmoji(itemName) {
  try {
    let item;
    if (itemName.includes('+')) {
      item = await ItemModel.findOne({ 
        itemName: itemName
      }).select("emoji").exec();
    } else {
      item = await ItemModel.findOne({ 
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, "i") }
      }).select("emoji").exec();
    }
    const emoji = item && item.emoji ? item.emoji : DEFAULT_EMOJI;
    return emoji;
  } catch (error) {
    return DEFAULT_EMOJI;
  }
}

function removeCircularReferences(obj, seen = new WeakSet()) {
 if (obj && typeof obj === "object") {
  if (seen.has(obj)) return;
  seen.add(obj);
  for (const key in obj) {
   if (Object.prototype.hasOwnProperty.call(obj, key)) {
    obj[key] = removeCircularReferences(obj[key], seen);
   }
  }
 }
 return obj;
}

function capitalizeWords(str) {
 return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isSpiritOrb(itemName) {
  return itemName.toLowerCase() === 'spirit orb';
}

module.exports = {
 data: new SlashCommandBuilder()
  .setName("economy")
  .setDescription("Economy commands for gifts, shops, trades, and transfers")
  .addSubcommand((subcommand) =>
   subcommand
    .setName("gift")
    .setDescription("Gift items from your character to another character")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("The character gifting the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("The character receiving the gifts")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itema")
      .setDescription("First item to be gifted")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantitya")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemb")
      .setDescription("Second item to be gifted")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityb")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("itemc")
      .setDescription("Third item to be gifted")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityc")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-view")
    .setDescription("View items available in the shop")
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemname")
      .setDescription("The name of the item to buy")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity")
      .setDescription("The quantity to buy")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-sell")
    .setDescription("Sell an item to the shop")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemname")
      .setDescription("The name of the item to sell")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity")
      .setDescription("The quantity to sell")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("trade")
    .setDescription("Trade items between two characters")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("Character name you are trading with")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("item1")
      .setDescription("First item to trade")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity1")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("item2")
      .setDescription("Second item to trade")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity2")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("item3")
      .setDescription("Third item to trade")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity3")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("tradeid")
      .setDescription("Trade ID for completing a trade")
      .setRequired(false)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("transfer")
    .setDescription("Transfer items between your characters")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("The character transferring the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("The character receiving the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itema")
      .setDescription("First item to be transferred")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantitya")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemb")
      .setDescription("Second item to be transferred")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityb")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("itemc")
      .setDescription("Third item to be transferred")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityc")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
  ),

 async execute(interaction) {
  try {
   const subcommand = interaction.options.getSubcommand();
   const isGift = subcommand === "gift";
   const allowedChannels = isGift ? GIFT_ALLOWED_CHANNEL_IDS : [ECONOMY_CHANNEL_ID];
   if (!allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
     content: isGift
      ? `The gift command can only be used in <#${ECONOMY_CHANNEL_ID}> or in a village town hall where both characters are located.`
      : `Economy commands can only be used in <#${ECONOMY_CHANNEL_ID}>. Please go there to use gift, shop, trade, or transfer.`,
     flags: MessageFlags.Ephemeral
    });
    return;
   }
   switch (subcommand) {
    case "gift":
     await handleGift(interaction);
     break;
    case "shop-view":
     await handleShopView(interaction);
     break;
    case "shop-buy":
     await handleShopBuy(interaction);
     break;
    case "shop-sell":
     await handleShopSell(interaction);
     break;
    case "trade":
     await handleTrade(interaction);
     break;
    case "transfer":
     await handleTransfer(interaction);
     break;
    default:
     await interaction.reply("Unknown subcommand");
   }
  } catch (error) {
   await handleInteractionError(error, interaction, {
     source: 'economy.js',
     subcommand: interaction.options?.getSubcommand()
   });
  }
 },
};

async function handleGift(interaction) {
 await interaction.deferReply();
 const fromCharacterName = interaction.options.getString("fromcharacter");
 const toCharacterName = interaction.options.getString("tocharacter");
 const items = [
  {
   name: interaction.options.getString("itema"),
   quantity: interaction.options.getInteger("quantitya"),
  },
  {
   name: interaction.options.getString("itemb"),
   quantity: interaction.options.getInteger("quantityb"),
  },
  {
   name: interaction.options.getString("itemc"),
   quantity: interaction.options.getInteger("quantityc"),
  },
 ].filter((item) => item.name && item.quantity);

 // ------------------- Clean Item Names from Copy-Paste -------------------
// Remove quantity information from item names if users copy-paste autocomplete text
const cleanedItems = items.map(item => ({
  name: item.name.replace(/\s*\(Qty:\s*\d+\)/i, '').trim(),
  quantity: item.quantity
}));

// ------------------- Validate Gift Quantities -------------------
for (const { quantity } of cleanedItems) {
  if (quantity <= 0) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Invalid Quantity',
        description: 'You must gift a **positive quantity** of items. Negative numbers are not allowed.',
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Quantity Validation'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}

// ------------------- NEW: Prevent gifting Spirit Orbs -------------------
for (const { name } of cleanedItems) {
  if (isSpiritOrb(name)) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Spirit Orb Protection',
        description: 'Spirit Orbs cannot be gifted. They are sacred items that can only be used by their original owner.',
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Item Protection'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}

 const userId = interaction.user.id;

 try {
  // Try to fetch regular character first
  let fromCharacter = await fetchCharacterByNameAndUserId(
    fromCharacterName,
    userId
  );
  
  // If not found, try to fetch mod character
  if (!fromCharacter) {
    fromCharacter = await fetchModCharacterByNameAndUserId(
      fromCharacterName,
      userId
    );
  }
  
  if (!fromCharacter) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Character Not Found')
        .setDescription(`The character "${fromCharacterName}" does not exist in the database.`)
        .addFields(
          { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
          { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
        .setFooter({ text: 'Character Validation' })
        .setTimestamp()],
      ephemeral: true
    });
    return;
  }
  
  // ------------------- Check if character is in jail -------------------
  if (await enforceJail(interaction, fromCharacter)) {
    return;
  }

  // ------------------- Equipped items (for quantity-aware gift check) -------------------
  // We allow gifting extra copies; only block if trying to gift more than (total - 1 equipped)
  const equippedItems = [
    fromCharacter.gearArmor?.head?.name,
    fromCharacter.gearArmor?.chest?.name,
    fromCharacter.gearArmor?.legs?.name,
    fromCharacter.gearWeapon?.name,
    fromCharacter.gearShield?.name,
  ].filter(Boolean);
  const equippedItemNamesLower = new Set(
    equippedItems.map((n) => String(n).trim().toLowerCase())
  );

  const allCharacters = await fetchAllCharactersExceptUser(userId);
  const allModCharacters = await fetchAllModCharacters();
  
  // Combine regular characters and all mod characters
  const allPossibleRecipients = [...allCharacters, ...allModCharacters];
  
  if (allPossibleRecipients.length === 0) {
    logger.warn('DATABASE', 'No characters found in fetchAllCharactersExceptUser or fetchAllModCharacters. Possible DB connection issue.');
  }
  // Extract actual name from input (before '|'), trim, and compare case-insensitively
  const toCharacterActualName = toCharacterName.split('|')[0].trim().toLowerCase();
  const toCharacter = allPossibleRecipients.find((c) => c.name.trim().toLowerCase() === toCharacterActualName);
  if (!toCharacter) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Recipient Not Found',
      description: `Character \`${toCharacterName}\` not found or belongs to you.`,
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true
   });
   return;
  }

  // Determine if the recipient is a mod character
  const isModCharacter = toCharacter.isModCharacter === true;

  // ------------------- Check Inventory Sync for Both Characters -------------------
  try {
    await checkInventorySync(fromCharacter);
    await checkInventorySync(toCharacter);
  } catch (error) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Inventory Not Synced',
        description: error.message,
        fields: [
          {
            name: 'How to Fix',
            value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
          }
        ],
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Inventory Sync Required'
        }
      }],
      ephemeral: true
    });
    return;
  }

  // Determine the user ID to mention based on character type
  const mentionUserId = isModCharacter ? "668281042414600212" : toCharacter.userId;

  if (
   fromCharacter.currentVillage.trim().toLowerCase() !==
   toCharacter.currentVillage.trim().toLowerCase()
  ) {
   const fromVillageCapitalized = capitalizeWords(
    fromCharacter.currentVillage.trim()
   );
   const toVillageCapitalized = capitalizeWords(
    toCharacter.currentVillage.trim()
   );

   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Different Villages',
      description: `\`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for gifting.`,
      fields: [
        {
          name: 'How to Fix',
          value: `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
        }
      ],
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Village Check'
      }
    }],
    ephemeral: true
   });
   return;
  }

  // ------------------- Check if command is used in the correct townhall channel -------------------
  const testingChannelId = '1391812848099004578';
  const isTestingChannel = interaction.channelId === testingChannelId;
  
  const villageChannelMap = {
    'Rudania': process.env.RUDANIA_TOWNHALL,
    'Inariko': process.env.INARIKO_TOWNHALL,
    'Vhintl': process.env.VHINTL_TOWNHALL
  };
  
  const characterVillage = capitalizeWords(fromCharacter.currentVillage.trim());
  const allowedChannel = villageChannelMap[characterVillage];
  
  if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
    const channelMention = allowedChannel ? `<#${allowedChannel}>` : 'the village town hall';
    const villageCapitalized = capitalizeWords(fromCharacter.currentVillage.trim());
    
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Wrong Townhall Channel',
        description: `You cannot gift in this channel. Both characters are in **${villageCapitalized}**, so you must use the gift command in ${channelMention}.`,
        fields: [
          {
            name: 'How to Fix',
            value: `Please use the </economy gift:> command in ${channelMention} where both characters are located.`
          }
        ],
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Channel Validation'
        }
      }],
      ephemeral: true
    });
    return;
  }

  const fromInventoryCollection = await getCharacterInventoryCollectionWithModSupport(
   fromCharacter
  );
  let allItemsAvailable = true;
  const unavailableItems = [];

  // Aggregate quantities for duplicate items (case-insensitive)
  const aggregatedItems = [];
  const itemMap = new Map();
  for (const { name, quantity } of cleanedItems) {
    const key = name.trim().toLowerCase();
    if (!itemMap.has(key)) {
      itemMap.set(key, { name, quantity });
    } else {
      itemMap.get(key).quantity += quantity;
    }
  }
  for (const entry of itemMap.values()) {
    aggregatedItems.push(entry);
  }

  for (const item of aggregatedItems) {
   const { name, quantity } = item;
   // Extract the base item name by removing any quantity in parentheses
   const baseItemName = name.replace(/\s*\(Qty:\s*\d+\)\s*$/, '').trim();

   // Find the canonical item name from the database first
   // Handle items with + in their names by using exact match instead of regex
   let itemDetails;
   if (baseItemName.includes('+')) {
     itemDetails = await ItemModel.findOne({
       itemName: baseItemName
     }).exec();
   } else {
     itemDetails = await ItemModel.findOne({
       itemName: { $regex: new RegExp(`^${escapeRegExp(baseItemName)}$`, "i") }
     }).exec();
   }

   if (!itemDetails) {
     unavailableItems.push(`${baseItemName} - Not Found`);
     allItemsAvailable = false;
     continue;
   }

   // Use the canonical item name from the database
   const canonicalName = itemDetails.itemName;
   
   // Store the canonical name in the aggregated item for use during removal
   item.canonicalName = canonicalName;

   // Handle items with + in their names by using exact match instead of regex
   // Use find().toArray() to get all matching entries and aggregate quantities
   let fromInventoryEntries;
   if (canonicalName.includes('+')) {
     fromInventoryEntries = await fromInventoryCollection
      .find({ itemName: canonicalName })
      .toArray();
   } else {
     fromInventoryEntries = await fromInventoryCollection
      .find({ itemName: { $regex: new RegExp(`^${escapeRegExp(canonicalName)}$`, "i") } })
      .toArray();
   }
   const totalQuantity = fromInventoryEntries.reduce(
    (sum, entry) => sum + (entry.quantity || 0),
    0
   );
   const isEquipped = equippedItemNamesLower.has(canonicalName.trim().toLowerCase());
   const availableToGift = totalQuantity - (isEquipped ? 1 : 0);
   if (quantity > availableToGift) {
     unavailableItems.push(
       `${canonicalName} - Available:${availableToGift}${isEquipped ? ' (1 equipped)' : ''}`
     );
     allItemsAvailable = false;
   }
  }

  if (!allItemsAvailable) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Insufficient Items',
      description: `\`${fromCharacterName}\` does not have enough of the following items to gift:`,
      fields: [
        ...unavailableItems.map(item => ({
          name: item,
          value: 'Insufficient quantity',
          inline: true
        })),
        {
          name: '💡 Tip',
          value: 'If you copied the item name from autocomplete, make sure to only use the item name (without the quantity in parentheses).',
          inline: false
        }
      ],
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Inventory Check'
      }
    }],
    ephemeral: true
   });
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Missing Inventory Link',
      description: 'Missing inventory link for character inventory.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Inventory Link Required'
      }
    }],
    ephemeral: true
   });
   return;
  }

  const formattedItems = [];

  for (const { name, quantity, canonicalName } of aggregatedItems) {
   // Remove from source inventory first
   // Use canonicalName if available (from availability check), otherwise fall back to name
   const itemNameToRemove = canonicalName || name;
   const removeResult = await removeItemInventoryDatabase(
    fromCharacter._id,
    itemNameToRemove,
    quantity,
    interaction,
    'Gift to ' + toCharacter.name
   );

   if (!removeResult) {
     await interaction.editReply({
       content: `❌ Failed to remove ${itemNameToRemove} from your inventory. Please try again.`,
       ephemeral: true
     });
     return;
   }

   // Add to target inventory
   // Use canonicalName if available (from availability check), otherwise fall back to name
   const itemNameToAdd = canonicalName || name;
   const addResult = await addItemInventoryDatabase(
    toCharacter._id, 
    itemNameToAdd, 
    quantity, 
    interaction, 
    'Gift from ' + fromCharacter.name
   );

   if (!addResult) {
     // If adding to target fails, try to restore the item to source
     await addItemInventoryDatabase(
      fromCharacter._id,
      itemNameToAdd,
      quantity,
      interaction,
      'Restored after failed gift'
     );
     await interaction.editReply({
       content: `❌ Failed to add ${itemNameToAdd} to recipient's inventory. The item has been restored to your inventory.`,
       ephemeral: true
     });
     return;
   }

   // Item removals and additions are now automatically logged to Google Sheets by removeItemInventoryDatabase and addItemInventoryDatabase functions

   // Get item details for emoji
   try {
     const itemDetails = await fetchItemByName(itemNameToAdd);
     const itemIcon = itemDetails?.emoji || "🎁";
     formattedItems.push({ itemName: itemNameToAdd, quantity, itemIcon });
   } catch (error) {
     logger.error('ECONOMY', `Failed to fetch item details for ${itemNameToAdd}: ${error.message}`);
     formattedItems.push({ itemName: itemNameToAdd, quantity, itemIcon: "🎁" });
   }
  }

  const fromCharacterIcon = fromCharacter.icon || "🧙";
  const toCharacterIcon = toCharacter.icon || "🧙";
  const giftEmbed = createGiftEmbed(
   fromCharacter,
   toCharacter,
   formattedItems,
   fromInventoryLink,
   toInventoryLink,
   fromCharacterIcon,
   toCharacterIcon
  );

  await interaction.channel.send({
    content: `🎁 <@${mentionUserId}>, you received a gift!`,
    allowedMentions: { users: [mentionUserId] },
    embeds: [giftEmbed],
  });
  await interaction.deleteReply();
  
  
 } catch (error) {
  handleInteractionError(error, interaction, { source: "gift.js" });
  logger.error('ECONOMY', 'Error during gift execution');
  await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Gift Error',
      description: 'An error occurred while trying to gift the items.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Error Handling'
      }
    }],
    ephemeral: true
  });
 }
}

async function handleShopView(interaction) {
 try {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  
  // Check if user has any jailed characters
  const jailedCharacters = await CharacterModel.find({ 
    userId: interaction.user.id, 
    inJail: true 
  }).select('name inJail jailReleaseTime').lean();
  
  if (jailedCharacters.length > 0) {
    const jailEmbed = {
      title: '⛔ Jailed Characters Detected',
      description: 'You have characters currently serving time in jail. While you can view the shop, you cannot buy or sell items until they are released.',
      color: 0xFFA500,
      fields: jailedCharacters.map(char => ({
        name: char.name,
        value: new Date(char.jailReleaseTime).toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
        inline: true
      })),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'You will be automatically released when your time is up.'
      }
    };
    
    await interaction.editReply({ embeds: [jailEmbed] });
    return;
  }
  
  // Add error handling for database connection
  let items;
  try {
    items = await ShopStock.find().sort({ itemName: 1 }).lean();
  } catch (dbError) {
    logger.error('DATABASE', 'Database connection error');
    return interaction.editReply({ 
      content: "❌ Unable to connect to the shop database. Please try again later.",
      flags: [MessageFlags.Ephemeral]
    });
  }

  if (!items || items.length === 0) {
   return interaction.editReply({ 
     content: "❌ The shop is currently empty. Please try again later.",
     flags: [MessageFlags.Ephemeral]
   });
  }

  const ITEMS_PER_PAGE = 10;
  const pages = Math.ceil(items.length / ITEMS_PER_PAGE);
  let currentPage = 0;

  const generateEmbed = async (page, interaction) => {
   const start = page * ITEMS_PER_PAGE;
   const end = start + ITEMS_PER_PAGE;
   
   // Create context for database operations
   const context = {
     commandName: interaction.commandName,
     userTag: interaction.user?.tag,
     userId: interaction.user?.id,
     operation: 'shop_view_generate_embed'
   };
   
   // Check if we have a database connection issue
   try {
    const itemsList = await Promise.all(
     items.slice(start, end).map(async (item) => {
      let itemDetails;
      try {
       itemDetails = await fetchItemByName(item.itemName, context);
      } catch (error) {
       logger.error('ECONOMY', `Error fetching item details for ${item.itemName}`);
       // Use fallback values if item details can't be fetched
       itemDetails = {
         buyPrice: "N/A",
         sellPrice: "N/A",
         emoji: "🛒"
       };
       
      // If it's a database connection error, log it specifically
      if (error.message.includes('Database connection failed')) {
        logger.error('DATABASE', `Database connection issue detected for ${item.itemName}`);
      }
      }
      const buyPrice = itemDetails?.buyPrice || "N/A";
      const sellPrice = itemDetails?.sellPrice || "N/A";
      const emoji = itemDetails?.emoji || "🛒";
      return `__ ${emoji} **${item.itemName}**__ - Stock: ${item.stock}\n> 🪙 Buy Price: ${buyPrice} \n> 🪙 Sell Price: ${sellPrice}`;
     })
    );
    
    return new EmbedBuilder()
     .setTitle("🛒 Shop Inventory")
     .setDescription(itemsList.join("\n\n"))
     .setColor("#A48D68")
     .setImage(
      "https://storage.googleapis.com/tinglebot/Graphics/border.png"
     )
     .setFooter({ text: `Page ${page + 1} of ${pages}` });
   } catch (error) {
    // If there's a database connection error, return an error embed
    if (error.message && error.message.includes('Database connection failed')) {
     throw new Error('Database connection failed - unable to access items database');
    }
    throw error;
   }
  };

  // Pre-generate all embeds to avoid async operations during button clicks
  let embeds;
  try {
    embeds = await Promise.all(
      Array.from({ length: pages }, (_, i) => generateEmbed(i, interaction))
    );
  } catch (error) {
    logger.error('ECONOMY', 'Error generating embeds');
    
    // Check if it's a database connection error
    if (error.message && error.message.includes('Database connection failed')) {
      return interaction.editReply({ 
        content: `**HEY! <@${interaction.user.id}>!** 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\n**Error:** Database connection failed - the bot cannot access the items database right now.`,
        flags: [MessageFlags.Ephemeral]
      });
    }
    
    return interaction.editReply({ 
      content: `**HEY! <@${interaction.user.id}>!** 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\n**Error:** ${error.message || 'Unknown error occurred'}`,
      flags: [MessageFlags.Ephemeral]
    });
  }

  const generateButtons = (page) => {
   return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
     .setCustomId(`shop-prev-${page}`)
     .setLabel("⬅️Previous")
     .setStyle(ButtonStyle.Primary)
     .setDisabled(page === 0),
    new ButtonBuilder()
     .setCustomId(`shop-next-${page}`)
     .setLabel("Next➡️")
     .setStyle(ButtonStyle.Primary)
     .setDisabled(page === pages - 1)
   );
  };

  const message = await interaction.editReply({
   embeds: [embeds[currentPage]],
   components: [generateButtons(currentPage)],
  });

  const collector = message.createMessageComponentCollector({ 
    time: 300000, // 5 minutes
    filter: i => i.user.id === interaction.user.id 
  });

  collector.on("collect", async (i) => {
   try {
     // Immediately defer the update to prevent timeout
     await i.deferUpdate();

     if (i.customId.startsWith('shop-prev-')) {
       currentPage = Math.max(0, currentPage - 1);
     } else if (i.customId.startsWith('shop-next-')) {
       currentPage = Math.min(pages - 1, currentPage + 1);
     }

     // Use the pre-generated embed
     await i.editReply({
      embeds: [embeds[currentPage]],
      components: [generateButtons(currentPage)],
     }).catch(error => {
       if (error.code === 10062) {
         logger.warn('INTERACTION', 'Interaction expired or already responded to');
         collector.stop();
       } else {
         throw error;
       }
     });
   } catch (error) {
     logger.error('INTERACTION', 'Error handling button interaction');
     try {
       await i.followUp({
         content: "❌ An error occurred while processing your request.",
         ephemeral: true
       }).catch(() => {}); // Ignore if this fails too
     } catch (replyError) {
       logger.error('INTERACTION', 'Error sending error message');
     }
   }
  });

  collector.on("end", async () => {
   try {
     const lastMessage = await interaction.fetchReply().catch(() => null);
     if (lastMessage) {
       await lastMessage.edit({ components: [] }).catch(() => {});
     }
   } catch (error) {
     logger.error('INTERACTION', 'Error clearing buttons');
   }
  });
 } catch (error) {
  logger.error('ECONOMY', 'Error viewing shop items');
  try {
    await interaction.editReply(
     "❌ An error occurred while viewing the shop inventory."
    ).catch(() => {}); // Ignore if this fails too
  } catch (replyError) {
    logger.error('ECONOMY', 'Error sending error message');
  }
 }
}

async function handleShopBuy(interaction) {
  try {
    await interaction.deferReply();

    const user = await getOrCreateToken(interaction.user.id);

    const characterName = interaction.options.getString("charactername");
    const itemName = interaction.options.getString("itemname");
    const quantity = interaction.options.getInteger("quantity");

    // ------------------- Validate Buy Quantity -------------------
    if (quantity <= 0) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Quantity',
          description: 'You must buy a **positive quantity** of items. Negative numbers are not allowed.',
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Quantity Validation'
          }
        }],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    logger.info('ECONOMY', `Initiating purchase for ${characterName}: ${itemName} x${quantity}`);

    // ------------------- Character Ownership Validation -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    if (!character) {
      logger.error('CHARACTER', `Character ${characterName} not found or does not belong to user ${interaction.user.id}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Character Not Found',
          description: 'Character not found or does not belong to you.',
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Character Validation'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Check if character is in jail -------------------
    if (await enforceJail(interaction, character)) {
      return;
    }

    // ------------------- Check Inventory Sync -------------------
    // (no longer required, but kept for compatibility)
    await checkInventorySync(character);

    // ------------------- Validate Shop Item -------------------
    let shopItem;
    if (itemName.includes('+')) {
      shopItem = await ShopStock.findOne({ 
        itemName: itemName
      }).lean();
    } else {
      shopItem = await ShopStock.findOne({ 
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      }).lean();
    }
    
    if (!shopItem) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Not Available',
          description: `Item "${itemName}" is not available in the shop.`,
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    const shopQuantity = parseInt(shopItem.stock, 10);
    if (isNaN(shopQuantity)) {
      logger.error('ECONOMY', `Invalid stock quantity for item ${itemName}: ${shopItem.stock}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Stock',
          description: 'Shop item quantity is invalid. Please try again later.',
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    if (shopQuantity < quantity) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Insufficient Stock',
          description: `Not enough stock available. Only ${shopQuantity} ${itemName} remaining in the shop.`,
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Validate Item Details -------------------
    let itemDetails;
    if (itemName.includes('+')) {
      itemDetails = await ItemModel.findOne({ 
        itemName: itemName
      })
       .select("buyPrice sellPrice category type image craftingJobs itemRarity")
       .lean();
    } else {
      itemDetails = await ItemModel.findOne({ 
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      })
       .select("buyPrice sellPrice category type image craftingJobs itemRarity")
       .lean();
    }
    if (!itemDetails) {
     logger.error('ECONOMY', `Item details not found in database: ${itemName}`);
     
           // Try a partial search to see if there are similar items
      const similarItems = await ItemModel.find({ 
        itemName: { $regex: new RegExp(escapeRegExp(itemName), 'i') }
      }).select("itemName buyPrice sellPrice").limit(5).lean();
     
     if (similarItems.length > 0) {
       logger.debug('ECONOMY', `Similar items found: ${similarItems.map(item => item.itemName).join(', ')}`);
     }
     
     return interaction.editReply("❌ Item details not found.");
    }

    logger.info('ECONOMY', `Item details - Buy: ${itemDetails.buyPrice}, Sell: ${itemDetails.sellPrice}, Category: ${itemDetails.category}`);

    if (!itemDetails.buyPrice || itemDetails.buyPrice <= 0) {
      logger.error('ECONOMY', `Invalid buy price for item ${itemName}: ${itemDetails.buyPrice}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Not For Sale',
          description: 'This item cannot be purchased from the shop.',
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Item Validation'
          }
        }],
        ephemeral: true
      });
    }

    // Check for birthday discount
    const hasBirthdayDiscount = user.hasBirthdayDiscount();
    const discountPercentage = hasBirthdayDiscount ? user.getBirthdayDiscountAmount() : 0;
    const originalPrice = itemDetails.buyPrice * quantity;
    const discountMultiplier = hasBirthdayDiscount ? (100 - discountPercentage) / 100 : 1;
    let totalPrice = Math.floor(originalPrice * discountMultiplier);
    const savedAmount = originalPrice - totalPrice;
    const boostFlavorNotes = [];
    const boostFooterNotes = [];
    let boostFooterIcon = null;
    
    // ============================================================================
    // ------------------- Apply Token Boost for Buying -------------------
    // ============================================================================
    const beforeBoost = totalPrice;
    totalPrice = await applyTokenBoost(characterName, totalPrice, true);
    
    if (totalPrice !== beforeBoost) {
      // Boost was applied - get booster info for flavor text
      const boostStatus = await getCharacterBoostStatus(characterName);
      if (boostStatus && boostStatus.category === 'Tokens') {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterChar = await fetchCharacterByName(boostStatus.boosterName);
        
        if (boosterChar && boostStatus.boosterJob === 'Priest') {
          const discountGained = beforeBoost - totalPrice;
          boostFooterIcon = boosterChar.icon || null;
          boostFlavorNotes.push(`⛪ **Blessed Economy:** ${boosterChar.name}'s blessing saved 🪙 ${discountGained}.`);
          boostFooterNotes.push('Blessed Economy active');
          logger.info('BOOST', `Priest boost - Blessed Economy (10% buying discount: ${beforeBoost} → ${totalPrice})`);
        }
      }
    }
    
    const currentTokens = user.tokens;

    if (currentTokens < totalPrice) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Insufficient Tokens',
          description: `You do not have enough tokens to make this purchase.`,
          fields: [
            {
              name: 'Current Balance',
              value: `🪙 ${currentTokens}`,
              inline: true
            },
            {
              name: 'Required Amount',
              value: `🪙 ${totalPrice}`,
              inline: true
            },
            {
              name: 'Missing Amount',
              value: `🪙 ${totalPrice - currentTokens}`,
              inline: true
            }
          ],
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Token Balance Check'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Process Purchase -------------------
    if (hasBirthdayDiscount) {
      logger.info('ECONOMY', `${interaction.user.tag} purchase with ${discountPercentage}% birthday discount: ${originalPrice} → ${totalPrice} (saved ${savedAmount})`);
    }
    logger.info('ECONOMY', `${interaction.user.tag} tokens: ${currentTokens} - ${totalPrice} = ${currentTokens - totalPrice}`);

    // Update inventory
    await addItemInventoryDatabase(
      character._id,
      itemName,
      quantity,
      interaction,
      'Purchase from shop'
    );
    logger.success('ECONOMY', `Updated inventory for ${character.name}: ${itemName} +${quantity}`);

    // Update shop stock
    if (itemName.includes('+')) {
      await ShopStock.updateOne(
        { itemName: itemName },
        { $set: { stock: shopQuantity - quantity } }
      );
    } else {
      await ShopStock.updateOne(
        { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } },
        { $set: { stock: shopQuantity - quantity } }
      );
    }

    // Delete item if stock reaches 0
    if (shopQuantity - quantity <= 0) {
      if (itemName.includes('+')) {
        await ShopStock.deleteOne({ 
          itemName: itemName
        });
      } else {
        await ShopStock.deleteOne({ 
          itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } 
        });
      }
    }

    // ------------------- Log Transaction -------------------
    const inventoryLink = character.inventory || (character.name
      ? `https://tinglebot.xyz/characters/inventories/${String(character.name)
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "")}`
      : "https://tinglebot.xyz/characters/inventories");
    const tokensDashboardLink = "https://tinglebot.xyz/profile?tab=tokens";
    const formattedDateTime = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

    // Log to token tracker
    if (user.tokenTracker) {
      const purchaseDescription = hasBirthdayDiscount 
        ? `${characterName} - ${itemName} x${quantity} - Shop Purchase (🎂 ${discountPercentage}% Birthday Discount - Saved ${savedAmount} tokens)`
        : `${characterName} - ${itemName} x${quantity} - Shop Purchase`;
      const tokenRow = [
        purchaseDescription,
        interactionUrl,
        "purchase",
        "spent",
        `-${totalPrice}`,
      ];
      await safeAppendDataToSheet(user.tokenTracker, character, "loggedTracker!B7:F", [tokenRow], undefined, { skipValidation: true });
    }

    // Note: Google Sheets logging is handled automatically by addItemInventoryDatabase()

    // Update token balance
    const purchaseDescriptionForLog = hasBirthdayDiscount 
      ? `${characterName} - ${itemName} x${quantity} - Shop Purchase (🎂 ${discountPercentage}% Birthday Discount - Saved ${savedAmount} tokens)`
      : `${characterName} - ${itemName} x${quantity} - Shop Purchase`;
    await updateTokenBalance(interaction.user.id, -totalPrice, {
      category: 'purchase',
      description: purchaseDescriptionForLog,
      link: interactionUrl
    });

    // ------------------- Send Success Message -------------------
    const purchaseEmbed = new EmbedBuilder()
      .setTitle("✅ Purchase Successful!")
      .setDescription(
        `**${characterName}** successfully bought **${itemName} x ${quantity}** for 🪙 ${totalPrice} tokens`
      )
      .setThumbnail(itemDetails.image || "https://via.placeholder.com/150")
      .setAuthor({ name: characterName, iconURL: character.icon || "" })
      .setColor("#A48D68")
      .setImage(
        "https://storage.googleapis.com/tinglebot/Graphics/border.png"
      )
      .addFields(
        {
          name: "📦 Inventory Link",
          value: `[View Inventory](${inventoryLink})`,
          inline: true,
        },
        {
          name: "🪙 Tokens",
          value: `[View Tokens](${tokensDashboardLink})`,
          inline: true,
        }
      );

    // NOTE: Boost-aware embed — include flavor/footer updates whenever boosts adjust results.
    if (boostFlavorNotes.length > 0) {
      purchaseEmbed.addFields({
        name: "🎭 Boost Effects",
        value: boostFlavorNotes.join('\n'),
        inline: false
      });
      purchaseEmbed.setFooter({
        text: boostFooterNotes.join(' • '),
        iconURL: boostFooterIcon || undefined
      });
    } else {
      purchaseEmbed.setFooter({ text: `The village bazaars thank you for your purchase!` });
    }

    // Add birthday discount field if applicable
    if (hasBirthdayDiscount) {
      purchaseEmbed.addFields({
        name: "🎂 Birthday Discount Applied!",
        value: `**${discountPercentage}% OFF** - You saved 🪙 ${savedAmount} tokens!\nOriginal Price: ~~🪙 ${originalPrice}~~ → Final Price: 🪙 ${totalPrice}`,
        inline: false
      });
      const existingFooter = purchaseEmbed.data.footer?.text || '';
      const existingFooterIcon = purchaseEmbed.data.footer?.icon_url || undefined;
      const birthdayFooter = `Happy Birthday! The village celebrates with you! 🎉`;
      const combinedFooter = existingFooter
        ? `${birthdayFooter} • ${existingFooter}`
        : birthdayFooter;
      purchaseEmbed.setFooter({ text: combinedFooter, iconURL: existingFooterIcon });
    }

    await interaction.editReply({ embeds: [purchaseEmbed] });

    if (totalPrice !== beforeBoost) {
      await clearBoostAfterUse(character, {
        client: interaction?.client,
        context: 'economy buy'
      });
    }
  } catch (error) {
    handleInteractionError(error, interaction, {
      commandName: interaction.commandName,
      userTag: interaction.user?.tag,
      userId: interaction.user?.id,
      operation: 'shop_buy'
    });
    logger.error('ECONOMY', 'Error buying item');
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Purchase Error',
        description: 'An error occurred while trying to buy the item. Please try again later.',
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Error Handling'
        }
      }],
      ephemeral: true
    });
  }
}

async function handleShopSell(interaction) {
 try {
  await interaction.deferReply();

  const characterName = interaction.options.getString("charactername");
  const itemNameRaw = interaction.options.getString("itemname");
  const quantity = interaction.options.getInteger("quantity");

  // ------------------- Clean Item Name from Copy-Paste -------------------
  // Remove quantity information and crafting icons from item names if users copy-paste autocomplete text
  const itemName = itemNameRaw
    .replace(/^[🔨📦🔮]\s*/g, '') // Remove crafting icons and fortune teller boost indicator
    .replace(/\s*\(Qty:\s*\d+\)/i, '') // Remove quantity info
    .replace(/\s*-\s*Qty:\s*\d+/i, '') // Remove quantity info with dash format
    .replace(/\s*-\s*Sell:\s*[\d,]+/i, '') // Remove sell price info
    .trim()
    .replace(/\s+/g, ' '); // Collapse multiple spaces so DB matches work

  // Normalize item name for comparison (trim + collapse spaces) so DB "Ancient Battle Axe" matches
  const normalizeItemNameForCompare = (name) =>
    (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

  const user = await User.findOne({ discordId: interaction.user.id });
  if (!user) {
    const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
    return interaction.editReply({
      content: fullMessage,
      ephemeral: true,
    });
  }

  // ------------------- Validate Sell Quantity -------------------
if (quantity <= 0) {
  await interaction.editReply({
    content: `❌ You must sell a **positive quantity** of items. Negative numbers are not allowed.`,
    ephemeral: true,
  });
  return;
}


  logger.info('ECONOMY', `Starting sale: ${characterName} selling ${itemName} x${quantity}`);

  let character = await fetchCharacterByName(characterName);
  if (!character) {
    character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
  }
  if (!character) {
   logger.error('CHARACTER', `Character not found: ${characterName}`);
   return interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Character Not Found',
      description: 'Character not found.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true
   });
  }

  // Add ownership check
  if (character.userId !== interaction.user.id) {
    logger.error('SECURITY', `User ${interaction.user.id} attempted to sell items for character ${characterName} which belongs to ${character.userId}`);
    return interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Not Your Character',
        description: 'You can only sell items for characters that belong to you.',
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Character Ownership'
        }
      }],
      ephemeral: true
    });
  }

  // ------------------- Check if character is in jail -------------------
  if (await enforceJail(interaction, character)) {
    return;
  }

  // ------------------- Check Inventory Sync -------------------
  // (no longer required, but kept for compatibility)
  await checkInventorySync(character);

  const inventoryCollection = await getCharacterInventoryCollectionWithModSupport(
   character
  );
  
  // Get all inventory items to aggregate quantities from multiple stacks
  const inventoryItems = await inventoryCollection.find().toArray();
  const itemNameNorm = normalizeItemNameForCompare(itemName);

  // Sum up all quantities of the same item (case-insensitive, normalized trim/collapse spaces)
  const totalQuantity = inventoryItems
    .filter(invItem => normalizeItemNameForCompare(invItem.itemName) === itemNameNorm)
    .reduce((sum, invItem) => sum + (invItem.quantity || 0), 0);
  
  // Find the first item entry for display purposes and crafting status
  const inventoryItem = inventoryItems.find(invItem =>
    normalizeItemNameForCompare(invItem.itemName) === itemNameNorm
  );

  // Get equipped items to check if we're trying to sell more than available non-equipped items
  const equippedItems = [
    character.gearArmor?.head?.name,
    character.gearArmor?.chest?.name,
    character.gearArmor?.legs?.name,
    character.gearWeapon?.name,
    character.gearShield?.name,
  ].filter(Boolean);
  
  // Check if the item is equipped (normalized comparison so DB name matches)
  const isEquipped = equippedItems.some(
    (eq) => normalizeItemNameForCompare(eq) === itemNameNorm
  );
  
  if (isEquipped) {
    const errorEmbed = createEquippedItemErrorEmbed(itemName);
    await interaction.editReply({
      embeds: [errorEmbed],
      ephemeral: true,
    });
    return;
  }

  if (!inventoryItem || totalQuantity < quantity) {
   logger.error('INVENTORY', `Insufficient inventory for item: ${itemName}. Available: ${totalQuantity}`);
   return interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Insufficient Inventory',
      description: `You don't have enough \`${itemName}\` in your inventory to sell.`,
      fields: [
        {
          name: 'Requested',
          value: `${quantity}`,
          inline: true
        },
        {
          name: 'Available',
          value: `${totalQuantity}`,
          inline: true
        },
        {
          name: 'Shortage',
          value: `${quantity - totalQuantity}`,
          inline: true
        }
      ],
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Inventory Validation'
      }
    }],
    ephemeral: true
   });
  }

  logger.debug('INVENTORY', `Inventory validated: ${itemName} x${totalQuantity} available`);

  // Safely handle obtain field - ensure it's a string
  const obtainMethod = (inventoryItem.obtain || '').toString().toLowerCase();
  const isCrafted = obtainMethod.includes("crafting") || obtainMethod.includes("crafted");

  let itemDetails;
  if (itemName.includes('+')) {
    itemDetails = await ItemModel.findOne({ itemName: itemName })
     .select("buyPrice sellPrice category type image craftingJobs itemRarity")
     .lean();
  } else {
    itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } })
     .select("buyPrice sellPrice category type image craftingJobs itemRarity")
     .lean();
  }
  
  if (!itemDetails) {
   logger.error('ECONOMY', `Item not found in database: ${itemName}`);
   return interaction.editReply("❌ Item details not found.");
  }

  logger.debug('ECONOMY', `Item found: ${itemName} (Buy: ${itemDetails.buyPrice}, Sell: ${itemDetails.sellPrice})`);

  // Determine the effective job for crafting (consider job vouchers)
  const effectiveJob = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
  const normalizedCharacterJob = effectiveJob.toLowerCase();
  const normalizedCraftingJobs = itemDetails.craftingJobs.map((job) =>
   job.toLowerCase()
  );

  // Check if character has crafting perk with their effective job
  const characterMeetsRequirements =
   hasPerk({ ...character, job: effectiveJob }, "CRAFTING") &&
   normalizedCraftingJobs.includes(normalizedCharacterJob);

  const bonusApplied = isCrafted && characterMeetsRequirements;
  logger.debug('ECONOMY', `Crafting evaluation - Crafted: ${isCrafted}, Bonus Applied: ${bonusApplied}`);

  const sellPrice =
   isCrafted && characterMeetsRequirements
    ? itemDetails.buyPrice
    : itemDetails.sellPrice || 0;

  if (sellPrice <= 0) {
   logger.error('ECONOMY', `Invalid sell price for ${itemName}`);
   return interaction.editReply("❌ This item cannot be sold to the shop.");
  }

  // Remove item from inventory using the proper function that handles Google Sheets logging
  await removeItemInventoryDatabase(
    character._id,
    itemName,
    quantity,
    interaction,
    'Sold to shop'
  );
  
  // Update shop stock with correct item data
  if (itemName.includes('+')) {
    await ShopStock.updateOne(
     { itemName: itemName },
     { 
       $inc: { stock: quantity },
       $set: {
         itemName: itemName, // Ensure correct case
         buyPrice: itemDetails.buyPrice,
         sellPrice: itemDetails.sellPrice,
         category: itemDetails.category,
         type: itemDetails.type,
         image: itemDetails.image || 'No Image',
         itemRarity: itemDetails.itemRarity || 1
       }
     },
     { upsert: true }
    );
  } else {
    await ShopStock.updateOne(
     { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } },
     { 
       $inc: { stock: quantity },
       $set: {
         itemName: itemName, // Ensure correct case
         buyPrice: itemDetails.buyPrice,
         sellPrice: itemDetails.sellPrice,
         category: itemDetails.category,
         type: itemDetails.type,
         image: itemDetails.image || 'No Image',
         itemRarity: itemDetails.itemRarity || 1
       }
     },
     { upsert: true }
    );
  }

  // ============================================================================
  // ------------------- Check for Fortune Teller Boost Tag on Items -------------------
  // Items crafted with Fortune Teller boost are tagged and sell for 20% more
  // We need to check which items will actually be sold (prioritize boosted items)
  // ============================================================================
  const allMatchingItems = inventoryItems
    .filter(invItem => normalizeItemNameForCompare(invItem.itemName) === itemNameNorm)
    .sort((a, b) => {
      // Prioritize boosted items (they should be sold first to maximize value)
      if (a.fortuneTellerBoost && !b.fortuneTellerBoost) return -1;
      if (!a.fortuneTellerBoost && b.fortuneTellerBoost) return 1;
      return 0;
    });
  
  let remainingToSell = quantity;
  let boostedQuantity = 0;
  
  // Calculate how many boosted items are being sold
  for (const item of allMatchingItems) {
    if (remainingToSell <= 0) break;
    
    if (item.fortuneTellerBoost === true) {
      const itemsFromThisEntry = Math.min(item.quantity || 0, remainingToSell);
      boostedQuantity += itemsFromThisEntry;
      remainingToSell -= itemsFromThisEntry;
    } else {
      // Regular items - we don't need to track these separately, just reduce remaining
      remainingToSell -= Math.min(item.quantity || 0, remainingToSell);
    }
  }
  
  const regularQuantity = quantity - boostedQuantity;
  const boostedPrice = boostedQuantity > 0 ? Math.floor(sellPrice * boostedQuantity * 1.2) : 0;
  const regularPrice = regularQuantity > 0 ? sellPrice * regularQuantity : 0;
  
  let totalPrice = boostedPrice + regularPrice;
  
  if (boostedQuantity > 0) {
    logger.info('BOOST', `Fortune Teller crafted items detected: ${boostedQuantity} items selling for 20% bonus (${regularQuantity} regular items)`);
    logger.info('BOOST', `Price breakdown: ${boostedQuantity} boosted @ ${Math.floor(sellPrice * 1.2)} = ${boostedPrice}, ${regularQuantity} regular @ ${sellPrice} = ${regularPrice}, Total: ${totalPrice}`);
  } else {
    totalPrice = sellPrice * quantity;
  }
  
  // ============================================================================
  // ------------------- Apply Token Boosts for Selling -------------------
  // ============================================================================
  const boostFlavorNotes = [];
  const boostFooterNotes = [];
  let boostFooterIcon = null;

  const preBoostPrice = totalPrice;
  totalPrice = await applyTokenBoost(characterName, totalPrice, false);
  
  if (totalPrice !== preBoostPrice) {
    // Boost was applied - get booster info for flavor text
    const boostStatus = await getCharacterBoostStatus(characterName);
    if (boostStatus && boostStatus.category === 'Tokens') {
      const { fetchCharacterByName } = require('@/database/db');
      const boosterChar = await fetchCharacterByName(boostStatus.boosterName);
      
      if (boosterChar) {
        boostFooterIcon = boosterChar.icon || null;
        const boostDelta = totalPrice - preBoostPrice;
        
        // Generate flavor text based on booster job
        if (boostStatus.boosterJob === 'Fortune Teller') {
          logger.info('BOOST', `Fortune Teller boost - Fortunate Exchange (+10% tokens: ${preBoostPrice} → ${totalPrice})`);
          boostFlavorNotes.push(`🔮 **Fortunate Exchange:** ${boosterChar.name}'s foresight added 🪙 ${boostDelta}.`);
          boostFooterNotes.push('Fortunate Exchange active');
        } else if (boostStatus.boosterJob === 'Priest') {
          logger.info('BOOST', `Priest boost - Blessed Economy (+10% tokens: ${preBoostPrice} → ${totalPrice})`);
          boostFlavorNotes.push(`⛪ **Blessed Economy:** ${boosterChar.name}'s blessing earned an extra 🪙 ${boostDelta}.`);
          boostFooterNotes.push('Blessed Economy active');
        }
      }
    }
  }

  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
  await updateTokenBalance(interaction.user.id, totalPrice, {
    category: 'sale',
    description: `${characterName} - Sold ${itemName} x${quantity}`,
    link: interactionUrl
  });

  logger.debug('ECONOMY', `Token update for ${interaction.user.tag}: ${user.tokens} + ${totalPrice} = ${user.tokens + totalPrice}`);

  // Log to token tracker
  let tokenTrackerLogged = false;
  if (user.tokenTracker) {
   const tokenRow = [
    `${characterName} - Sold ${itemName} x${quantity}`,
    interactionUrl,
    "sale",
    "earned",
    `+${totalPrice}`,
   ];
   await safeAppendDataToSheet(user.tokenTracker, user, "loggedTracker!B7:F", [tokenRow], undefined, { skipValidation: true });
   tokenTrackerLogged = true;
  }

  // Note: Google Sheets logging for inventory is handled automatically by removeItemInventoryDatabase()
  const inventoryLogged = true;

  // Log sheet updates
  const updates = [];
  if (tokenTrackerLogged) updates.push('token tracker');
  if (inventoryLogged) updates.push('inventory tracker');
  if (updates.length > 0) {
    logger.debug('ECONOMY', `Updated sheets: ${updates.join(', ')}`);
  }

  const priceType = bonusApplied ? "Crafter's Bonus" : "Standard";
  logger.success('ECONOMY', `Sale completed - ${characterName} sold ${itemName} x${quantity} for ${totalPrice} tokens (${priceType})`);
  
  // Build description with Fortune Teller boost flavor text if applicable
  let description = `**${characterName}** sold **${itemName} x${quantity}** for 🪙 **${totalPrice}** tokens`;
  
  // Calculate boosted price per item if applicable
  const boostedPricePerItem = boostedQuantity > 0 ? Math.floor(sellPrice * 1.2) : null;
  
  // Add Fortune Teller boost flavor text if boosted items were sold
  if (boostedQuantity > 0) {
    const fortuneTellerBoostText = `\n\n🔮 **Fortune Teller's Foresight:** These items were crafted with Fortune Teller's blessing and sold for 20% more! (🪙 ${sellPrice} → 🪙 ${boostedPricePerItem} per item)`;
    description += fortuneTellerBoostText;
  }
  
  // Build Price Details field
  let priceDetailsValue = '';
  if (boostedQuantity > 0 && boostedQuantity === quantity) {
    // All items sold were Fortune Teller boosted
    if (bonusApplied) {
      priceDetailsValue = `Base Price: 🪙 ${itemDetails.sellPrice} per item\nCrafter's Bonus Price: 🪙 ${sellPrice} per item\n🔮 Fortune Teller Boosted Price: 🪙 ${boostedPricePerItem} per item`;
    } else {
      priceDetailsValue = `Standard Price: 🪙 ${sellPrice} per item\n🔮 Fortune Teller Boosted Price: 🪙 ${boostedPricePerItem} per item`;
    }
  } else if (boostedQuantity > 0 && boostedQuantity < quantity) {
    // Mixed: some boosted, some regular
    if (bonusApplied) {
      priceDetailsValue = `Base Price: 🪙 ${itemDetails.sellPrice} per item\nCrafter's Bonus Price: 🪙 ${sellPrice} per item\n🔮 Fortune Teller Boosted (${boostedQuantity}x): 🪙 ${boostedPricePerItem} per item\nRegular (${regularQuantity}x): 🪙 ${sellPrice} per item`;
    } else {
      priceDetailsValue = `Standard Price: 🪙 ${sellPrice} per item\n🔮 Fortune Teller Boosted (${boostedQuantity}x): 🪙 ${boostedPricePerItem} per item\nRegular (${regularQuantity}x): 🪙 ${sellPrice} per item`;
    }
  } else {
    // No boosted items
    priceDetailsValue = bonusApplied 
      ? `Base Price: 🪙 ${itemDetails.sellPrice} per item\nCrafter's Bonus Price: 🪙 ${sellPrice} per item`
      : `Standard Price: 🪙 ${sellPrice} per item`;
  }
  
  // NOTE: Boost-aware embed — include flavor/footer updates whenever boosts adjust results.
  const saleEmbed = new EmbedBuilder()
   .setTitle("✅ Sale Successful!")
   .setDescription(description)
   .setThumbnail(itemDetails.image || "https://via.placeholder.com/150")
   .setAuthor({ name: characterName, iconURL: character.icon || "" })
   .setColor("#A48D68")
   .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
   .addFields(
    {
     name: "💰 Price Details",
     value: priceDetailsValue,
     inline: false,
    },
    {
     name: "📦 Quick Links",
     value: `[Inventory](${character.inventory || "https://tinglebot.xyz/characters/inventories"}) • [Tokens](https://tinglebot.xyz/profile?tab=tokens)`,
     inline: false,
    }
   );

  if (boostFlavorNotes.length > 0) {
   saleEmbed.addFields({
    name: "🎭 Boost Effects",
    value: boostFlavorNotes.join('\n'),
    inline: false
   });
   saleEmbed.setFooter({
    text: boostFooterNotes.join(' • '),
    iconURL: boostFooterIcon || undefined
   });
  }

  interaction.editReply({ embeds: [saleEmbed] });

  if (totalPrice !== preBoostPrice) {
   await clearBoostAfterUse(character, {
     client: interaction?.client,
     context: 'economy sell'
   });
  }
 } catch (error) {
  handleInteractionError(error, interaction, {
    commandName: interaction.commandName,
    userTag: interaction.user?.tag,
    userId: interaction.user?.id,
    operation: 'shop_sell',
    options: {
      characterName: interaction.options.getString("charactername"),
      itemName: interaction.options.getString("itemname"),
      quantity: interaction.options.getInteger("quantity")
    }
  });
  
  logger.error('ECONOMY', `Sale error - ${error.message}`);
  
  const isTokenError = error.message && (
    error.message.includes('Invalid URL') ||
    error.message.includes('permission') ||
    error.message.includes('404') ||
    error.message.includes('headers') ||
    error.message.includes('No \'earned\' entries found') ||
    error.message.includes('Invalid sheet format')
  );
  
  if (isTokenError) {
    const { fullMessage } = handleTokenError(error, interaction);
    await interaction.editReply({
      content: fullMessage,
      ephemeral: true,
    });
  } else {
    await interaction.editReply({
      content: `❌ **An error occurred while processing your sale request.**\n\nThis appears to be a system error. Please try again in a moment, or contact a moderator if the problem persists.\n\n**Error Details:** ${error.message || 'Unknown error'}`,
      ephemeral: true,
    });
  }
 }
}


async function handleTransfer(interaction) {
 await interaction.deferReply();

 const fromCharacterName = interaction.options.getString("fromcharacter");
 const toCharacterName = interaction.options.getString("tocharacter");
 const items = [
  {
   name: interaction.options.getString("itema"),
   quantity: interaction.options.getInteger("quantitya"),
  },
  {
   name: interaction.options.getString("itemb"),
   quantity: interaction.options.getInteger("quantityb"),
  },
  {
   name: interaction.options.getString("itemc"),
   quantity: interaction.options.getInteger("quantityc"),
  },
 ].filter((item) => item.name && item.quantity);

 // ------------------- Clean Item Names from Copy-Paste -------------------
// Remove quantity information from item names if users copy-paste autocomplete text
const cleanedItems = items.map(item => ({
  name: item.name.replace(/\s*\(Qty:\s*\d+\)/i, '').trim(),
  quantity: item.quantity
}));

 // ------------------- Validate Transfer Quantities -------------------
for (const { quantity } of cleanedItems) {
  if (quantity <= 0) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Invalid Quantity',
        description: 'You must transfer a **positive quantity** of items. Negative numbers are not allowed.',
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Quantity Validation'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}


 const userId = interaction.user.id;

 try {
  // Try to fetch regular characters first
  let fromCharacter = await fetchCharacterByNameAndUserId(
   fromCharacterName,
   userId
  );
  let toCharacter = await fetchCharacterByNameAndUserId(
   toCharacterName,
   userId
  );

  // If not found, try to fetch mod characters
  if (!fromCharacter) {
    fromCharacter = await fetchModCharacterByNameAndUserId(
      fromCharacterName,
      userId
    );
  }
  if (!toCharacter) {
    toCharacter = await fetchModCharacterByNameAndUserId(
      toCharacterName,
      userId
    );
  }

  if (!fromCharacter || !toCharacter) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Character Not Found',
      description: 'Either the source or destination character does not exist or does not belong to you.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  // ------------------- Check if character is in jail -------------------
  if (await enforceJail(interaction, fromCharacter)) {
    return;
  }

  // ------------------- NEW: Prevent using equipped items -------------------
const equippedItems = [
  fromCharacter.gearArmor?.head?.name,
  fromCharacter.gearArmor?.chest?.name,
  fromCharacter.gearArmor?.legs?.name,
  fromCharacter.gearWeapon?.name,
  fromCharacter.gearShield?.name,
].filter(Boolean);

for (const { name } of cleanedItems) {
  if (equippedItems.includes(name)) {
    // ------------------- Check if character has enough items to unequip first -------------------
    const fromInventoryCollection = await getCharacterInventoryCollectionWithModSupport(fromCharacter);
    
    // Find the canonical item name from the database
    const baseItemName = name.replace(/\s*\(Qty:\s*\d+\)\s*$/, '').trim();
    let itemDetails;
    if (baseItemName.includes('+')) {
      itemDetails = await ItemModel.findOne({
        itemName: baseItemName
      }).exec();
    } else {
      itemDetails = await ItemModel.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(baseItemName)}$`, "i") }
      }).exec();
    }
    
    let totalQuantity = 0;
    if (itemDetails) {
      const canonicalName = itemDetails.itemName;
      let fromInventoryEntries;
      if (canonicalName.includes('+')) {
        fromInventoryEntries = await fromInventoryCollection
          .find({ itemName: canonicalName })
          .toArray();
      } else {
        fromInventoryEntries = await fromInventoryCollection
          .find({ itemName: { $regex: new RegExp(`^${escapeRegExp(canonicalName)}$`, "i") } })
          .toArray();
      }
      totalQuantity = fromInventoryEntries.reduce(
        (sum, entry) => sum + entry.quantity,
        0
      );
    }
    
    logger.debug('INVENTORY', `Character ${fromCharacter.name} tried to transfer equipped item "${name}". Total quantity in inventory: ${totalQuantity}`);
    
    // Only block transfer if they have exactly 1 (unequipping would leave them with 0)
    if (totalQuantity <= 1) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Equipped',
          description: `You cannot transfer \`${name}\` because it is currently equipped and you only have 1. Please unequip it first using the </gear:1372262090450141196> command.`,
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Equipment Check'
          }
        }],
        ephemeral: true,
      });
      return;
    }
    // If they have 2 or more, allow the transfer to continue (they can unequip and still have items left)
  }
  }


  // ------------------- Check Inventory Sync for Both Characters -------------------
  // (no longer required, but kept for compatibility)
  await checkInventorySync(fromCharacter);
  await checkInventorySync(toCharacter);

  let allItemsAvailable = true;
  const unavailableItems = [];
  const fromInventoryCollection = await getCharacterInventoryCollectionWithModSupport(
   fromCharacter
  );

  // Starting item availability check

  // Aggregate quantities for duplicate items (case-insensitive)
  const aggregatedItems = [];
  const itemMap = new Map();
  for (const { name, quantity } of cleanedItems) {
    const key = name.trim().toLowerCase();
    if (!itemMap.has(key)) {
      itemMap.set(key, { name, quantity });
    } else {
      itemMap.get(key).quantity += quantity;
    }
  }
  for (const entry of itemMap.values()) {
    aggregatedItems.push(entry);
  }

  for (const { name, quantity } of aggregatedItems) {
   // Checking item availability

   // Extract the base item name by removing any quantity in parentheses
   const baseItemName = name.replace(/\s*\(Qty:\s*\d+\)\s*$/, '').trim();

   // Find the canonical item name from the database first
   // Handle items with + in their names by using exact match instead of regex
   let itemDetails;
   if (baseItemName.includes('+')) {
     itemDetails = await ItemModel.findOne({
       itemName: baseItemName
     }).exec();
   } else {
     itemDetails = await ItemModel.findOne({
       itemName: { $regex: new RegExp(`^${escapeRegExp(baseItemName)}$`, "i") }
     }).exec();
   }

   if (!itemDetails) {
     unavailableItems.push(`${baseItemName} - Not Found`);
     allItemsAvailable = false;
     continue;
   }

   // Use the canonical item name from the database
   const canonicalName = itemDetails.itemName;

   // Handle items with + in their names by using exact match instead of regex
   let fromInventoryEntries;
   if (canonicalName.includes('+')) {
     fromInventoryEntries = await fromInventoryCollection
      .find({ itemName: canonicalName })
      .toArray();
   } else {
     fromInventoryEntries = await fromInventoryCollection
      .find({ itemName: { $regex: new RegExp(`^${escapeRegExp(canonicalName)}$`, "i") } })
      .toArray();
   }
   const totalQuantity = fromInventoryEntries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
   );
   if (totalQuantity < quantity) {
     unavailableItems.push(`${canonicalName} - QTY:${totalQuantity}`);
     allItemsAvailable = false;
   }
  }

  if (!allItemsAvailable) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Insufficient Items',
      description: `\`${fromCharacterName}\` does not have enough of the following items to transfer:`,
      fields: unavailableItems.map(item => ({
        name: item,
        value: 'Insufficient quantity',
        inline: true
      })),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Inventory Check'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Missing Inventory Link',
      description: 'Missing inventory link for character inventory.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Inventory Link Required'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  const uniqueSyncId = uuidv4();

  const formattedItems = [];

  for (const { name, quantity } of aggregatedItems) {
    // Find the canonical item name from the database
    // Handle items with + in their names by using exact match instead of regex
    let itemDetails;
    if (name.includes('+')) {
      itemDetails = await ItemModel.findOne({
        itemName: name
      }).exec();
    } else {
      itemDetails = await ItemModel.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(name)}$`, "i") }
      }).exec();
    }

    if (!itemDetails) {
      continue;
    }

    // Use the canonical item name from the database
    const canonicalName = itemDetails.itemName;
    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Add to target first so we never remove from sender without recipient having the item
    const addData = {
      characterId: toCharacter._id,
      itemName: canonicalName,
      quantity: quantity,
      category,
      type,
      subtype,
      obtain: `Transfer from ${fromCharacterName}`,
      date: new Date(),
      synced: uniqueSyncId
    };
    await syncToInventoryDatabase(toCharacter, addData);

    // Remove from source (fromCharacter); on failure, roll back by removing from recipient
    const removeData = {
      characterId: fromCharacter._id,
      itemName: canonicalName,
      quantity: -quantity,
      category,
      type,
      subtype,
      obtain: `Transfer to ${toCharacterName}`,
      date: new Date(),
      synced: uniqueSyncId
    };
    try {
      await syncToInventoryDatabase(fromCharacter, removeData);
    } catch (removeError) {
      const rollbackData = {
        characterId: toCharacter._id,
        itemName: canonicalName,
        quantity: -quantity,
        category,
        type,
        subtype,
        obtain: `Rollback: transfer remove failed`,
        date: new Date(),
        synced: uniqueSyncId
      };
      try {
        await syncToInventoryDatabase(toCharacter, rollbackData);
        logger.warn('ECONOMY', `Transfer remove failed for ${canonicalName}, rolled back add to ${toCharacterName}`);
      } catch (rollbackErr) {
        logger.error('ECONOMY', `Transfer remove failed and rollback failed for ${canonicalName}: ${rollbackErr.message}`);
      }
      throw removeError;
    }

    const itemIcon = itemDetails?.emoji || "🎁";
    formattedItems.push({ itemName: canonicalName, quantity, itemIcon });
  }

  const fromCharacterIcon = fromCharacter.icon || "🧙";
  const toCharacterIcon = toCharacter.icon || "🧙";
  const transferEmbed = createTransferEmbed(
    fromCharacter,
    toCharacter,
    formattedItems,
    fromInventoryLink,
    toInventoryLink,
    fromCharacterIcon,
    toCharacterIcon
  );

  await interaction.editReply({
    allowedMentions: { users: [toCharacter.userId] },
    embeds: [transferEmbed],
  });
 } catch (error) {
  handleInteractionError(error, interaction, { source: "transfer.js" });
  logger.error('ECONOMY', 'Error during transfer execution');
  await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Transfer Error',
      description: 'An error occurred while trying to transfer the items.',
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Error Handling'
      }
    }],
    ephemeral: true
  });
 }
}

// ============================================================================
// ------------------- Trade Interaction Handler -------------------
// Handles parsing of interaction options, item validation, and character verification.
// ============================================================================

// ------------------- Trade Session Management -------------------
// Handles creation, updates, and execution of trade sessions
async function createTradeSession(initiator, target, items) {
  logger.info('ECONOMY', `Creating trade session with items: ${items.map(item => `${item.name} x${item.quantity}`).join(', ')}`);
  const tradeId = generateUniqueId('T');
  const formattedInitiatorItems = await Promise.all(items.map(async item => {

    const emoji = await getItemEmoji(item.name);
    const formattedItem = {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji,
    };
    return formattedItem;
  }));

  const tradeData = {
    initiator: {
      userId: initiator.userId,
      characterName: initiator.name,
      items: formattedInitiatorItems,
    },
    target: {
      userId: target.userId,
      characterName: target.name,
      items: [],
    },
    status: 'pending',
    createdAt: new Date(),
    initiatorConfirmed: false,
    targetConfirmed: false,
    messageId: null,
    channelId: null,
    confirmMessageId: null,
    confirmChannelId: null,
  };

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await TempData.create({ key: tradeId, type: 'trade', data: tradeData, expiresAt });
  return tradeId;
}

// ------------------- Trade Session Update -------------------
async function updateTradeSession(tradeId, targetItems) {
  const formattedTargetItems = await Promise.all(targetItems.map(async item => {
    const emoji = await getItemEmoji(item.name);
    return {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji,
    };
  }));

  await TempData.findOneAndUpdate(
    { key: tradeId, type: 'trade' },
    { $set: { 'data.target.items': formattedTargetItems } },
  );
  return (await TempData.findByTypeAndKey('trade', tradeId)).data;
}

// ------------------- Trade Confirmation -------------------
async function confirmTrade(tradeId, userId) {
  const trade = await TempData.findByTypeAndKey('trade', tradeId);
  if (!trade) {
    throw new Error('Trade not found');
  }

  const tradeData = trade.data;
  if (tradeData.initiator.userId === userId) {
    tradeData.initiatorConfirmed = true;
  } else if (tradeData.target.userId === userId) {
    tradeData.targetConfirmed = true;
  }

  trade.data = tradeData;
  trade.markModified('data');
  await trade.save();
  return tradeData;
}

// ------------------- Trade Execution -------------------
async function executeTrade(tradeData) {
  const { initiator, target } = tradeData;
  const initiatorChar = await fetchCharacterByNameAndUserId(initiator.characterName, initiator.userId);
  const targetChar = await fetchCharacterByNameAndUserId(target.characterName, target.userId);

  if (!initiatorChar || !targetChar) {
    throw new Error('Character not found for trade execution');
  }

  // Check if either character is in jail
  if (initiatorChar.inJail || targetChar.inJail) {
    throw new Error('Cannot execute trade: One or more characters are currently in jail');
  }

  const uniqueSyncId = uuidv4();

  // Process items for both parties
  await Promise.all([
    processTradeItems(initiatorChar, targetChar, initiator.items, uniqueSyncId),
    processTradeItems(targetChar, initiatorChar, target.items, uniqueSyncId)
  ]);

  return true;
}

// ------------------- Trade Item Processing -------------------
async function processTradeItems(fromChar, toChar, items, uniqueSyncId) {
  for (const item of items) {
    // Handle items with + in their names by using exact match instead of regex
    let itemDetails;
    if (item.name.includes('+')) {
      itemDetails = await ItemModel.findOne({
        itemName: item.name
      }).exec();
    } else {
      itemDetails = await ItemModel.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(item.name)}$`, "i") }
      }).exec();
    }

    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Remove from sender
    const removeData = {
      characterId: fromChar._id,
      itemName: item.name,
      quantity: -item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade to ${toChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: fromChar.name
    };
    await syncToInventoryDatabase(fromChar, removeData);

    // Log removal to InventoryLog database collection
    try {
      await logItemRemovalToDatabase(fromChar, itemDetails || { itemName: item.name }, {
        quantity: item.quantity,
        obtain: 'Traded',
        location: fromChar.currentVillage || fromChar.homeVillage || 'Unknown',
        link: '' // No interaction link available in trade execution
      });
    } catch (logError) {
      // Don't fail the trade if logging fails
      console.error(`[economy.js] ⚠️ Failed to log item removal to InventoryLog:`, logError.message);
    }

    // Add to receiver
    const addData = {
      characterId: toChar._id,
      itemName: item.name,
      quantity: item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade from ${fromChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: toChar.name
    };
    await syncToInventoryDatabase(toChar, addData);

    // Log addition to InventoryLog database collection
    try {
      await logItemAcquisitionToDatabase(toChar, itemDetails || { itemName: item.name }, {
        quantity: item.quantity,
        obtain: 'Trade',
        location: toChar.currentVillage || toChar.homeVillage || 'Unknown',
        link: '' // No interaction link available in trade execution
      });
    } catch (logError) {
      // Don't fail the trade if logging fails
      console.error(`[economy.js] ⚠️ Failed to log item acquisition to InventoryLog:`, logError.message);
    }
  }
}

// ------------------- Trade Message Management -------------------
async function updateTradeMessage(message, tradeData, fromCharacter, toCharacter) {
  const tradeEmbed = await createTradeEmbed(
    fromCharacter,
    toCharacter,
    tradeData.initiator.items,
    tradeData.target.items,
    message.url
  );
  tradeEmbed.setColor("#FFD700");

  if (tradeData.initiatorConfirmed && tradeData.targetConfirmed) {
    tradeEmbed.setDescription(`✅ Trade completed successfully!`);
    await message.edit({ content: null, embeds: [tradeEmbed], components: [] });
  } else {
    const statusDescription = 
      `🔃 Trade Status:\n` +
      `${tradeData.initiatorConfirmed ? '✅' : '⏳'} ${tradeData.initiator.characterName} confirmed\n` +
      `${tradeData.targetConfirmed ? '✅' : '⏳'} ${tradeData.target.characterName} confirmed\n\n` +
      `<@${tradeData.initiator.userId}>, please react with ✅ to confirm the trade!`;

    tradeEmbed.setDescription(statusDescription);
    await message.edit({ embeds: [tradeEmbed] });
  }
}

// ------------------- Trade Validation -------------------
async function validateTradeItems(character, items) {
  const characterInventoryCollection = await getCharacterInventoryCollectionWithModSupport(character);
  const unavailableItems = [];
  for (const item of items) {
    // Handle items with + in their names by using exact match instead of regex
    let itemInventory;
    if (item.name.includes('+')) {
      itemInventory = await characterInventoryCollection.findOne({
        itemName: item.name
      });
    } else {
      itemInventory = await characterInventoryCollection.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(item.name)}$`, "i") }
      });
    }
    if (!itemInventory || itemInventory.quantity < item.quantity) {
      unavailableItems.push({
        name: item.name,
        requested: item.quantity,
        available: itemInventory ? itemInventory.quantity : 0
      });
    }
  }
  if (unavailableItems.length > 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Insufficient Items")
      .setDescription(`\`${character.name}\` doesn't have enough of the following items to trade:`)
      .setColor("#FF0000")
      .addFields(
        unavailableItems.map(item => ({
          name: item.name,
          value: `Requested: ${item.requested}\nAvailable: ${item.available}`,
          inline: true
        }))
      )
      .setFooter({ text: "Please check your inventory and try again." });
    
    throw { embed: errorEmbed };
  }
}

// ------------------- Function: handleTrade -------------------
// Main handler for initiating or completing a trade session.
async function handleTrade(interaction) {
  const characterName = interaction.options.getString("fromcharacter");
  const item1 = interaction.options.getString("item1");
  const quantity1 = interaction.options.getInteger("quantity1");
  const item2 = interaction.options.getString("item2");
  const quantity2 = interaction.options.getInteger("quantity2") || 0;
  const item3 = interaction.options.getString("item3");
  const quantity3 = interaction.options.getInteger("quantity3") || 0;
  const tradingWithName = interaction.options.getString("tocharacter");
  const tradeId = interaction.options.getString("tradeid");
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    // ------------------- Clean Item Names from Copy-Paste -------------------
    // Remove emoji prefixes and quantity information from item names if users copy-paste autocomplete text
    // Handles formats like: "📦 Fairy - Qty: 1", "Fairy (Qty: 1)", "Job Voucher - Qty: 2"
    const cleanItemName = (name) => {
      if (!name) return name;
      return name
        // Remove emoji prefixes (📦, 🔨, 🔮, etc.) - common emojis used in autocomplete
        .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '')
        // Remove quantity in parentheses format: "(Qty: 1)" or "(Qty:1)"
        .replace(/\s*\(Qty:\s*\d+\s*\)/gi, '')
        // Remove quantity in dash format: " - Qty: 1" or "- Qty:1"
        .replace(/\s*-\s*Qty:\s*\d+\s*$/i, '')
        .trim();
    };

    const cleanedItemArrayRaw = [
      { name: cleanItemName(item1), quantity: quantity1 },
      { name: cleanItemName(item2), quantity: quantity2 },
      { name: cleanItemName(item3), quantity: quantity3 },
    ].filter((item) => item.name);

    // ------------------- Validate Item Existence -------------------
    const itemNamesToCheck = cleanedItemArrayRaw.map(item => item.name);
    const missingItems = [];
    for (const name of itemNamesToCheck) {
      // Handle items with + in their names by using exact match instead of regex
      let exists;
      if (name.includes('+')) {
        exists = await ItemModel.findOne({ itemName: name }).lean();
      } else {
        exists = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(name)}$`, "i") } }).lean();
      }
      if (!exists) missingItems.push(name);
    }
    if (missingItems.length > 0) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Items',
          description: 'The following item(s) do not exist:',
          fields: missingItems.map(name => ({
            name: name,
            value: 'Item not found in database',
            inline: true
          })),
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Item Validation'
          }
        }],
        ephemeral: true,
      });
      return;
    }

    // ------------------- Validate Trade Quantities -------------------
    for (const { quantity } of cleanedItemArrayRaw) {
      if (quantity <= 0) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Invalid Quantity',
            description: 'You must trade a **positive quantity** of items. Negative numbers are not allowed.',
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Quantity Validation'
            }
          }],
          ephemeral: true,
        });
        return;
      }
    }

    // ---- Aggregate duplicate items (case-insensitive) ----
    const itemMap = new Map();
    for (const { name, quantity } of cleanedItemArrayRaw) {
      const key = name.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name, quantity });
      } else {
        itemMap.get(key).quantity += quantity;
      }
    }
    const itemArray = Array.from(itemMap.values());

    // ------------------- NEW: Prevent trading Spirit Orbs -------------------
    for (const { name } of itemArray) {
      if (isSpiritOrb(name)) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Spirit Orb Protection',
            description: 'Spirit Orbs cannot be traded. They are sacred items that can only be used by their original owner.',
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Item Protection'
            }
          }],
          ephemeral: true,
        });
        return;
      }
    }

    // ------------------- Validate Characters -------------------
    // Try to fetch regular character first
    let fromCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
    
    // If not found, try to fetch mod character
    if (!fromCharacter) {
      fromCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    
    if (!fromCharacter) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Character Not Found')
          .setDescription(`The character "${characterName}" does not exist in the database.`)
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
            { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    // Try to fetch regular character first
    let toCharacter = await fetchCharacterByName(tradingWithName);
    
    // If not found, try to fetch mod character
    if (!toCharacter) {
      const allModCharacters = await fetchAllModCharacters();
      toCharacter = allModCharacters.find(c => c.name.toLowerCase() === tradingWithName.toLowerCase());
    }
    
    if (!toCharacter || toCharacter.userId === userId) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Recipient Not Found')
          .setDescription(`The character "${tradingWithName}" does not exist or belongs to you.`)
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character belongs to you' },
            { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    // ------------------- Check if character is in jail -------------------
    if (await enforceJail(interaction, fromCharacter)) {
      return;
    }

    // ------------------- NEW: Check if characters are in the same village -------------------
    if (fromCharacter.currentVillage.trim().toLowerCase() !== toCharacter.currentVillage.trim().toLowerCase()) {
      const fromVillageCapitalized = capitalizeWords(fromCharacter.currentVillage.trim());
      const toVillageCapitalized = capitalizeWords(toCharacter.currentVillage.trim());
      
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Different Villages',
          description: `\`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for trading.`,
          fields: [
            {
              name: 'How to Fix',
              value: `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
            }
          ],
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Village Check'
          }
        }],
        ephemeral: true
      });
      return;
    }

    // ------------------- Check Inventory Sync -------------------
    // (no longer required, but kept for compatibility)
    await checkInventorySync(fromCharacter);
    await checkInventorySync(toCharacter);

    if (tradeId) {
      // ------------------- Handle Trade Completion -------------------
      try {
        const trade = await TempData.findByTypeAndKey('trade', tradeId);
        if (!trade) {
          logger.error('ECONOMY', `Trade ${tradeId} not found`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Invalid Trade',
              description: 'Invalid or expired trade ID.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Trade Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Check if trade has expired
        if (new Date() > trade.expiresAt) {
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Trade Expired',
              description: 'This trade has expired. Please initiate a new trade.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Trade Timeout'
              }
            }],
            ephemeral: true,
          });
          await TempData.deleteOne({ _id: trade._id });
          return;
        }

        const tradeData = trade.data;
        logger.info('ECONOMY', `Processing trade ${tradeId} for user ${userId}`);

        // Verify user is part of the trade
        if (tradeData.initiator.userId !== userId && tradeData.target.userId !== userId) {
          logger.error('SECURITY', `User ${userId} not part of trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Not Part of Trade',
              description: 'You are not part of this trade.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Trade Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Check if character is in jail before allowing trade completion
        let currentCharacter;
        if (tradeData.initiator.userId === userId) {
          currentCharacter = await fetchCharacterByNameAndUserId(tradeData.initiator.characterName, userId);
        } else {
          currentCharacter = await fetchCharacterByNameAndUserId(tradeData.target.characterName, userId);
        }
        
        if (currentCharacter && await enforceJail(interaction, currentCharacter)) {
          return;
        }

        // NEW: Verify character name matches the user's character in the trade
        if (
          (tradeData.initiator.userId === userId && tradeData.initiator.characterName !== characterName) ||
          (tradeData.target.userId === userId && tradeData.target.characterName !== characterName)
        ) {
          logger.error('SECURITY', `Character name mismatch for user ${userId} in trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Character Mismatch',
              description: 'The character you provided does not match your character in this trade.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Character Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Check if user has already confirmed
        if ((tradeData.initiator.userId === userId && tradeData.initiatorConfirmed) || 
            (tradeData.target.userId === userId && tradeData.targetConfirmed)) {
          logger.error('ECONOMY', `User ${userId} already confirmed trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Already Confirmed',
              description: 'You have already confirmed this trade.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Trade Status'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Update trade with target's items if target is confirming
        if (tradeData.target.userId === userId) {
          await updateTradeSession(tradeId, itemArray);
        }

        // Confirm trade for this user
        const updatedTradeData = await confirmTrade(tradeId, userId);
        logger.success('ECONOMY', `Trade confirmed by user ${userId}`);

        // If both users have confirmed, execute the trade
        if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
          logger.info('ECONOMY', `Executing trade ${tradeId}`);
          
          // Check if either character is in jail before executing trade
          const initiatorChar = await fetchCharacterByNameAndUserId(updatedTradeData.initiator.characterName, updatedTradeData.initiator.userId);
          const targetChar = await fetchCharacterByNameAndUserId(updatedTradeData.target.characterName, updatedTradeData.target.userId);
          
          if (initiatorChar && await enforceJail(interaction, initiatorChar)) {
            return;
          }
          if (targetChar && await enforceJail(interaction, targetChar)) {
            return;
          }
          
          // Execute trade
          await executeTrade(updatedTradeData);
          
          // Clean up confirmation message if it exists
          if (updatedTradeData.confirmMessageId && updatedTradeData.confirmChannelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.confirmChannelId);
              const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
              await confirmMsg.delete();
            } catch (error) {
              logger.error('ECONOMY', 'Error deleting trade confirm message');
            }
          }

          await TempData.deleteOne({ _id: trade._id });
          
          // Update original trade message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
            } catch (error) {
              logger.error('ECONOMY', 'Error updating final trade message');
            }
          }
          
          await interaction.editReply({
            content: `✅ Trade completed successfully.`,
            ephemeral: true,
          });
        } else {
          // Only send confirmation message if one doesn't already exist
          if (!updatedTradeData.confirmMessageId) {
            const tradeConfirmMessage = await interaction.channel.send({
              content: `**Trade confirmed!** <@${updatedTradeData.initiator.userId}>, please react to the trade post with ✅ to finalize the trade.\n\nTrade ID: \`${tradeId}\`\nYou can also use the </economy trade:1372378304623149152> command with this ID to complete the trade.`
            });
            
            // Update trade data with confirmation message
            await TempData.findOneAndUpdate(
              { key: tradeId, type: 'trade' },
              { 
                $set: { 
                  'data.confirmMessageId': tradeConfirmMessage.id,
                  'data.confirmChannelId': interaction.channelId 
                } 
              }
            );
          }

          // Update trade status message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
            } catch (error) {
              logger.error('ECONOMY', 'Error updating trade status message');
            }
          }
          
          await interaction.deleteReply();
        }
      } catch (error) {
        logger.error('ECONOMY', 'Error handling trade completion');
        await interaction.editReply({
          content: `❌ An error occurred while processing the trade.`,
          ephemeral: true,
        });
      }
    } else {
      // ------------------- Handle Trade Initiation -------------------
      try {
        // Check if character is in jail before allowing trade initiation
        if (await enforceJail(interaction, fromCharacter)) {
          return;
        }

        // Validate items and quantities
        await validateTradeItems(fromCharacter, itemArray);

        // Create trade session
        const tradeId = await createTradeSession(fromCharacter, toCharacter, itemArray);

        // Get formatted items with emojis
        const formattedItems = await Promise.all(itemArray.map(async item => {
          const emoji = await getItemEmoji(item.name);
          return {
            name: item.name,
            quantity: item.quantity,
            emoji: emoji,
          };
        }));

        // Create and send initial trade message
        const tradeEmbed = await createTradeEmbed(
          fromCharacter,
          toCharacter,
          formattedItems,
          [],
          interaction.url
        );
        tradeEmbed.setColor("#FFD700");

        const tradeMessage = await interaction.editReply({
          content: `🔃 <@${toCharacter.userId}>, use the </economy trade:1372378304623149152> command with this trade ID to complete your part of the trade:\n\n\`\`\`${tradeId}\`\`\``,
          embeds: [tradeEmbed],
        });

        // Update trade session with message info
        await TempData.findOneAndUpdate(
          { key: tradeId, type: 'trade' },
          { $set: { 'data.messageId': tradeMessage.id, 'data.channelId': interaction.channelId } }
        );

        // Set up reaction collector
        try {
          await tradeMessage.react('✅');
          
          // Get initial trade data
          const initialTrade = await TempData.findByTypeAndKey('trade', tradeId);
          if (!initialTrade) {
            logger.error('ECONOMY', `Trade ${tradeId} not found during reaction setup`);
            return;
          }
          
          const filter = (reaction, user) => {
            return reaction.emoji.name === '✅' &&
              [fromCharacter.userId, toCharacter.userId].includes(user.id);
          };

          const collector = tradeMessage.createReactionCollector({ filter, time: 24 * 60 * 60 * 1000 }); // 24 hours
          collector.on('collect', async (reaction, user) => {
            try {
              const latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
              if (!latestTrade) {
                logger.error('ECONOMY', `Trade ${tradeId} not found during reaction`);
                return;
              }

              const tradeData = latestTrade.data;
              
              // Check if user has already confirmed
              if ((fromCharacter.userId === user.id && tradeData.initiatorConfirmed) || 
                  (toCharacter.userId === user.id && tradeData.targetConfirmed)) {
                logger.warn('ECONOMY', `User ${user.id} already confirmed trade ${tradeId}`);
                return;
              }

              const updatedTradeData = await confirmTrade(tradeId, user.id);
              logger.success('ECONOMY', `${user.tag} confirmed trade ${tradeId}`);

              // Update trade message
              await updateTradeMessage(tradeMessage, updatedTradeData, fromCharacter, toCharacter);

              // If both confirmed, complete trade
              if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
                collector.stop('both_confirmed');
                
                // Check if either character is in jail before executing trade
                const initiatorChar = await fetchCharacterByNameAndUserId(updatedTradeData.initiator.characterName, updatedTradeData.initiator.userId);
                const targetChar = await fetchCharacterByNameAndUserId(updatedTradeData.target.characterName, updatedTradeData.target.userId);
                
                if (initiatorChar && await enforceJail(interaction, initiatorChar)) {
                  return;
                }
                if (targetChar && await enforceJail(interaction, targetChar)) {
                  return;
                }
                
                await executeTrade(updatedTradeData);
                await TempData.deleteOne({ _id: latestTrade._id });
                
                const finalEmbed = await createTradeEmbed(
                  fromCharacter,
                  toCharacter,
                  updatedTradeData.initiator.items,
                  updatedTradeData.target.items,
                  tradeMessage.url
                );
                finalEmbed.setColor("#FFD700");
                finalEmbed.setDescription(`✅ Trade completed successfully!`);
                await tradeMessage.edit({ content: null, embeds: [finalEmbed], components: [] });

                // Clean up confirmation message if it exists
                if (updatedTradeData.confirmMessageId && updatedTradeData.confirmChannelId) {
                  try {
                    const channel = await interaction.client.channels.fetch(updatedTradeData.confirmChannelId);
                    const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
                    await confirmMsg.delete();
                  } catch (error) {
                    logger.error('ECONOMY', 'Error deleting trade confirm message');
                  }
                }
              }
            } catch (error) {
              logger.error('ECONOMY', 'Error processing reaction');
            }
          });
        } catch (err) {
          logger.error('ECONOMY', `Error setting up reaction collector: ${err.message}`);
        }
      } catch (error) {
        // Only log a simple message for insufficient items
        if (error.embed) {
          logger.warn('ECONOMY', `Trade validation failed for ${characterName}`);
        } else {
          logger.error('ECONOMY', 'Error initiating trade');
        }
        
        // If error has an embed, use it, otherwise create a generic error embed
        if (error.embed) {
          await interaction.editReply({ embeds: [error.embed] });
        } else {
          await interaction.editReply({
            content: `**HEY! <@${interaction.user.id}>!** 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\n**Error:** ${error.message || 'Unknown error occurred'}`,
            ephemeral: true
          });
        }
        return;
      }
    }
  } catch (error) {
    handleInteractionError(error, interaction, {
      commandName: interaction.commandName,
      userTag: interaction.user?.tag,
      userId: interaction.user?.id,
      operation: 'trade'
    });
    // Only log a simple message for insufficient items
    if (error.embed) {
      logger.warn('ECONOMY', `Trade validation failed for ${characterName}`);
    } else {
      logger.error('ECONOMY', 'Error executing trade command');
    }
    
    // Create a generic error message with user mention
    await interaction.editReply({
      content: `**HEY! <@${interaction.user.id}>!** 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\n**Error:** ${error.message || 'Unknown error occurred'}`,
      ephemeral: true
    });
  }
}