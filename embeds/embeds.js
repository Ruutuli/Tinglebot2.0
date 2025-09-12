// ============================================================================
// IMPORTS
// ============================================================================

// ------------------- Discord.js Imports ------------------
const { EmbedBuilder } = require("discord.js");

// ------------------- Utility Module Imports ------------------
const { handleError } = require("../utils/globalErrorHandler");
const { getLastDebugValues } = require("../modules/buffModule");
const { capitalize, capitalizeFirstLetter, capitalizeWords, getRandomColor } = require("../modules/formattingModule");
const { getVillageColorByName, getVillageEmojiByName } = require("../modules/locationsModule");
const { getMountEmoji, getMountThumbnail } = require("../modules/mountModule");
const { getNoEncounterMessage, generateCraftingFlavorText, generateGatherFlavorText, typeActionMap, generateBoostFlavorText, generateDivineItemFlavorText, generateTeacherGatheringFlavorText, generateBlightRollBoostFlavorText } = require("../modules/flavorTextModule");
const { convertCmToFeetInches, isValidImageUrl } = require("../utils/validation");
const { validateInventorySheet } = require("../utils/googleSheetsUtils");
const { getCharacterBoostStatus } = require('../modules/boostIntegration');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Database Model Imports ------------------
const Character = require("../models/CharacterModel");
const ItemModel = require("../models/ItemModel");
const { monsterMapping } = require("../models/MonsterModel");

// ============================================================================
// CONSTANTS
// ============================================================================

// ------------------- Default Values ------------------
const DEFAULT_EMOJI = "🔹";
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const DEFAULT_THUMBNAIL_URL = "https://via.placeholder.com/100x100";

// ------------------- Region Color Mapping ------------------
const regionColors = {
 eldin: "#FF0000",
 lanayru: "#0000FF",
 faron: "#008000",
 central_hyrule: "#00FFFF",
 gerudo: "#FFA500",
 hebra: "#800080",
};

// ------------------- Region Image Mapping ------------------
const regionImages = {
 eldin: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
 lanayru: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
 faron: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 central_hyrule: "https://storage.googleapis.com/tinglebot/Graphics/Central-Hyrule-Region.png",
 gerudo: "https://storage.googleapis.com/tinglebot/Graphics/Gerudo-Region.png",
 hebra: "https://storage.googleapis.com/tinglebot/Graphics/Hebra-Region.png",
};

// ------------------- Travel Path Images ------------------
const PATH_IMAGES = {
 pathOfScarletLeaves: "https://storage.googleapis.com/tinglebot/psl.png",
 leafDewWay: "https://storage.googleapis.com/tinglebot/ldw.png",
};

// ------------------- Village Emoji Mapping ------------------
const villageEmojis = {
 rudania: "<:rudania:899492917452890142>",
 inariko: "<:inariko:899493009073274920>",
 vhintl: "<:vhintl:899492879205007450>",
};

// ------------------- Travel Path Emoji Mapping ------------------
const pathEmojis = {
 pathOfScarletLeaves: "🍂",
 leafDewWay: "🥬",
};

// ------------------- Job Action Verbs ------------------
const jobActions = {
 Artist: "created",
 Craftsman: "crafted",
 Weaver: "stitched",
 Blacksmith: "forged",
 "Mask Maker": "made",
 Witch: "brewed",
 Cook: "cooked",
 Researcher: "invented",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// ------------------- Text Formatting Utilities ------------------
// ------------------- Function: getArticleForItem ------------------
// Determines the appropriate article (a/an) for an item name based on first letter
function getArticleForItem(itemName) {
 const vowels = ["A", "E", "I", "O", "U"];
 return vowels.includes(itemName.charAt(0).toUpperCase()) ? "an" : "a";
}

// ------------------- Function: formatItemDetails ------------------
// Formats item details with consistent spacing, emoji, and quantity display
function formatItemDetails(itemName, quantity = 1, emoji = DEFAULT_EMOJI) {
 const truncatedName = itemName.length > 20 ? itemName.substring(0, 17) + "..." : itemName;
 const itemNamePadded = truncatedName.padEnd(20, " ");
 const quantityPadded = quantity.toString().padStart(3, " ");
 return `${emoji} \`${itemNamePadded}\` ⨯ \`${quantityPadded}\``;
}

// ------------------- Function: getCommonEmbedSettings ------------------
// Retrieves common embed settings (color, author, image) for a character
const getCommonEmbedSettings = (character) => {
 const villageColor = getVillageColorByName(capitalizeFirstLetter(character.homeVillage));
 return {
  color: villageColor,
  author: {
   name: `${character.name} 🔗`,
   iconURL: character.icon,
   url: character.inventory,
  },
  image: { url: DEFAULT_IMAGE_URL },
 };
};

// ------------------- Function: aggregateItems ------------------
// Aggregates items by name and sums their quantities
const aggregateItems = (items) => {
 return items.reduce((acc, item) => {
  acc[item.name] = (acc[item.name] || 0) + item.quantity;
  return acc;
 }, {});
};

// ------------------- Function: formatMaterialsList ------------------
// Formats a list of materials for display in embeds
const formatMaterialsList = (materials) => {
 return materials
  .map((material) => `${material.name} x${material.quantity}`)
  .join(", ");
};

// ------------------- Embed Styling Utilities ------------------
// ------------------- Function: setDefaultImage ------------------
// Sets the default image on an embed
const setDefaultImage = (embed) => {
 return embed.setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: setThumbnailWithFallback ------------------
// Sets a thumbnail with fallback to default if image URL is invalid
const setThumbnailWithFallback = (embed, imageUrl, fallbackUrl = DEFAULT_THUMBNAIL_URL) => {
 const url = isValidImageUrl(imageUrl) ? imageUrl : fallbackUrl;
 return embed.setThumbnail(url);
};

// ------------------- Boost System Utilities ------------------
// ------------------- Function: getBoostInfo ------------------
// Retrieves boost information for a character in a specific category
const getBoostInfo = async (character, category) => {
 if (!character.boostedBy) return null;
 
  const boostStatus = await getCharacterBoostStatus(character.name);
 
 if (boostStatus && boostStatus.category === category) {
   return {
     boosterJob: boostStatus.boosterJob,
     boosterName: boostStatus.boosterName,
      boostName: boostStatus.boostName,
      category: boostStatus.category,
     boostFlavorText: generateBoostFlavorText(boostStatus.boosterJob, category)
   };
 }
 
 return null;
};

// ------------------- Function: addBoostFlavorText ------------------
// Adds boost flavor text to a description if boost information is available
const addBoostFlavorText = (description, boostInfo) => {
 if (!boostInfo?.boostFlavorText) return description;
 return `${description}\n\n⚡ **Boost Effect:** ${boostInfo.boostFlavorText}`;
};

// ------------------- Function: buildFooterText ------------------
// Builds consistent footer text including boost and job voucher information
const buildFooterText = (baseText, character, boostInfo = null) => {
 let footerText = baseText;
 
 if (character.jobVoucher && character.jobVoucherJob) {
   footerText += ` | 🎫 Job Voucher in use: ${character.jobVoucherJob}`;
 }
 
 if (character.boostedBy) {
    if (boostInfo?.boosterJob && boostInfo?.boosterName) {
      if (boostInfo?.boostName && boostInfo?.category) {
        footerText += ` | Boost by: ${boostInfo.boosterJob} ${boostInfo.boosterName} - ${boostInfo.boostName} for ${boostInfo.category}`;
      } else {
        footerText += ` | Boost by: ${boostInfo.boosterJob} ${boostInfo.boosterName}`;
      }
    } else {
      footerText += ` | Boost by: ${character.boostedBy}`;
    }
 }
 
 return footerText;
};

// ------------------- Location and Village Utilities ------------------
// ------------------- Function: getVillageImage ------------------
// Retrieves the image for a character's current village
const getVillageImage = (character) => {
 const villageImages = {
  Inariko: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
  Rudania: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
  Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 };
 
 return villageImages[capitalizeWords(character.currentVillage)] || DEFAULT_IMAGE_URL;
};

// ------------------- Function: getLocationPrefix ------------------
// Generates a location-based prefix for character actions (visiting vs home village)
const getLocationPrefix = (character) => {
 const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
 
 if (isVisiting) {
   return `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`;
 }
 
 return `${capitalizeWords(character.currentVillage)} ${capitalizeWords(character.job)}`;
};

// ============================================================================
// EMBED CREATION FUNCTIONS
// ============================================================================

// ------------------- Character Status Embeds ------------------
// ------------------- Function: createDebuffEmbed -------------------
// Creates an embed for when a character is debuffed and cannot use items
const createDebuffEmbed = (character) => {
  // Calculate the debuff expiration date and time
  let debuffExpirationText = '**Midnight EST**';
  
  if (character.debuff?.endDate) {
    const debuffEndDate = new Date(character.debuff.endDate);
    const utcTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    debuffExpirationText = `<t:${utcTimestamp}:D> (<t:${utcTimestamp}:R>)`;
  }

  return new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('⚠️ Debuff Active ⚠️')
    .setDescription(`**${character.name}** is currently debuffed and cannot use items to heal.`)
    .addFields({
      name: '🕒 Debuff Resets',
      value: debuffExpirationText,
      inline: false
    })
    .setThumbnail(character.icon)
    .setFooter({ text: 'Debuff System' })
    .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: createGatherDebuffEmbed -------------------
// Creates an embed for when a character is debuffed and cannot gather
const createGatherDebuffEmbed = (character) => {
  // Calculate the debuff expiration date and time
  let debuffExpirationText = '**Midnight EST**';
  
  if (character.debuff?.endDate) {
    const debuffEndDate = new Date(character.debuff.endDate);
    const utcTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    debuffExpirationText = `<t:${utcTimestamp}:D> (<t:${utcTimestamp}:R>)`;
  }

  return new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('⚠️ Debuff Active ⚠️')
    .setDescription(`**${character.name}** is currently debuffed and cannot gather.`)
    .addFields({
      name: '🕒 Debuff Expires',
      value: debuffExpirationText,
      inline: false
    })
    .setThumbnail(character.icon)
    .setFooter({ text: 'Debuff System' })
    .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: createCharacterEmbed -------------------
// Creates a detailed character information embed with all character stats and details
const createCharacterEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);
 const homeVillageEmoji = getVillageEmojiByName(character.homeVillage) || "";
 const currentVillageEmoji = getVillageEmojiByName(character.currentVillage) || "";
 const heightInFeetInches = character.height ? convertCmToFeetInches(character.height) : "N/A";

 return new EmbedBuilder()
  .setTitle(`${character.name} | ${capitalize(character.race)} | ${capitalizeFirstLetter(character.currentVillage)} | ${capitalizeFirstLetter(character.job)}`)
  .addFields(
   { name: "👤 __Name__", value: `> ${character.name}`, inline: true },
   { name: "❤️ __Hearts__", value: `> ${character.currentHearts}/${character.maxHearts}`, inline: true },
   { name: "🟩 __Stamina__", value: `> ${character.currentStamina}/${character.maxStamina}`, inline: true },
   { name: "🔹 __Pronouns__", value: `> ${character.pronouns}`, inline: true },
   { name: "🔹 __Age__", value: `> ${character.age || "N/A"}`, inline: true },
   { name: "🔹 __Height__", value: `> ${character.height ? `${character.height} cm (${heightInFeetInches})` : "N/A"}`, inline: true },
   { name: "🔹 __Race__", value: `> ${capitalize(character.race)}`, inline: true },
   { name: `🔹 __Home Village__`, value: `> ${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}`, inline: true },
   { name: `🔹 __Current Village__`, value: `> ${currentVillageEmoji} ${capitalizeFirstLetter(character.currentVillage)}`, inline: true },
   { name: "🔹 __Job__", value: `> ${capitalizeFirstLetter(character.job)}`, inline: true },
   { name: "🎫 __Active Job Voucher__", value: character.jobVoucher && character.jobVoucherJob ? `> ${capitalizeWords(character.jobVoucherJob)}` : `> N/A`, inline: true },
   { name: "🔹 __Blighted__", value: `> ${character.blighted ? `Yes (Stage ${character.blightStage})` : "No"}`, inline: true },
   { name: "🔹 __Spirit Orbs__", value: `> ${character.spiritOrbs}`, inline: true },
   { name: "💥 __KO Status__", value: `> ${character.ko ? "True" : "False"}`, inline: true },
   { name: "📦 __Inventory__", value: `> [Google Sheets](${character.inventory})`, inline: false },
   { name: "🔗 __Application Link__", value: `> [Link](${character.appLink})`, inline: false }
  )
  .setDescription("📋 Character profile created successfully.")
  .setColor(settings.color)
  .setThumbnail(character.icon)
  .setFooter({ text: "Character details" })
  .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: createSimpleCharacterEmbed -------------------
// Creates a simplified character embed with basic information only
const createSimpleCharacterEmbed = (character, description) => {
 const settings = getCommonEmbedSettings(character);

 return new EmbedBuilder()
  .addFields(
   { name: "👤 __Name__", value: character.name, inline: true },
   { name: "🔹 __Pronouns__", value: character.pronouns, inline: true },
   { name: "\u200B", value: "\u200B", inline: true },
   { name: "❤️ __Hearts__", value: `${character.currentHearts}/${character.maxHearts}`, inline: true },
   { name: "🟩 __Stamina__", value: `${character.currentStamina}/${character.maxStamina}`, inline: true }
  )
  .setColor(settings.color)
  .setThumbnail(character.icon)
  .setDescription(description)
  .setTimestamp()
  .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: createCharacterGearEmbed -------------------
// Creates an embed displaying character equipment and gear stats
const createCharacterGearEmbed = (character, gearMap, type, unequippedMessage = "") => {
 const settings = getCommonEmbedSettings(character);
 const gearEmojis = {
  head: "🪖",
  chest: "👕",
  legs: "👖",
  weapon: "🗡️",
  shield: "🛡️",
 };

 let totalDefense = 0;
 if (character.gearArmor) {
  totalDefense += character.gearArmor.head?.stats?.get("modifierHearts") || 0;
  totalDefense += character.gearArmor.chest?.stats?.get("modifierHearts") || 0;
  totalDefense += character.gearArmor.legs?.stats?.get("modifierHearts") || 0;
 }
 totalDefense += character.gearShield?.stats?.get("modifierHearts") || 0;

 let totalAttack = character.gearWeapon?.stats?.get("modifierHearts") || 0;

 return new EmbedBuilder()
  .setColor(settings.color || "#0099ff")
  .setTitle(`${character.name}'s Equipment - 🗡️ ATK +${totalAttack} | 🛡️ DEF +${totalDefense}`)
  .addFields(
   { name: `__${gearEmojis.head} Head__`, value: gearMap.head || "> N/A", inline: true },
   { name: `__${gearEmojis.chest} Chest__`, value: gearMap.chest || "> N/A", inline: true },
   { name: `__${gearEmojis.legs} Legs__`, value: gearMap.legs || "> N/A", inline: true },
   { name: `__${gearEmojis.weapon} Weapon__`, value: gearMap.weapon || "> N/A", inline: true },
   { name: "\u200B", value: "\u200B", inline: true },
   { name: `__${gearEmojis.shield} Shield__`, value: gearMap.shield || "> N/A", inline: true }
  )
  .setFooter({
   text: unequippedMessage ? `${unequippedMessage}\nGear type: ${type}` : `Gear type: ${type}`,
  })
  .setTimestamp()
  .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function: createVendorEmbed -------------------
// Creates an embed displaying vendor shop information and stats
const createVendorEmbed = (character) => {
 if (!character.vendorType) return null;

 const monthName = character.lastCollectedMonth
  ? new Date(0, character.lastCollectedMonth - 1).toLocaleString("default", { month: "long" })
  : "N/A";

 return new EmbedBuilder()
  .setTitle(`${character.name}'s Shop`)
  .addFields(
   { name: "🛒 __Vendor Type__", value: `> ${capitalizeFirstLetter(character.vendorType)}`, inline: false },
   { name: "💰 __Shop Pouch__", value: `> ${character.shopPouch || "N/A"}`, inline: false },
   { name: "🏆 __Vending Points__", value: `> ${character.vendingPoints || 0}`, inline: false },
   { name: "📅 __Last Collection Month__", value: `> ${monthName}`, inline: false }
  )
  .setColor("#FFD700")
  .setThumbnail(character.icon)
  .setImage(DEFAULT_IMAGE_URL)
  .setFooter({ text: "Vendor details" });
};

// ------------------- Function: createVendingSetupInstructionsEmbed -------------------
// Creates setup instructions embed for vending shop configuration
function createVendingSetupInstructionsEmbed(character = null) {
  if (character) {
    // Success state with character info
    return new EmbedBuilder()
      .setTitle('🎪 Vending Shop Setup Complete!')
      .setDescription(`Your vending shop has been set up successfully!`)
      .addFields(
        { name: '👤 Character', value: character.name },
        { name: '🔗 Shop Link', value: `[View Sheet](${character.shopLink})` },
        { name: '🎒 Pouch Type', value: capitalizeFirstLetter(character.shopPouch) },
        { name: '🪙 Vending Points', value: `${character.vendingPoints || 0}` },
        { name: '⚠️ Important: Old Stock Only', value: 'Column L must contain "Old Stock" for each item. Only add your initial old stock to the sheet - do not edit it after setup.' }
      )
      .setColor('#00ff00')
      .setTimestamp()
      .setFooter({ text: 'Note: The shop sheet should not be edited after initial setup' });
  }

  // Initial setup instructions
  return new EmbedBuilder()
    .setTitle('🎪 Vending Shop Setup Instructions')
    .setDescription('Follow these steps to set up your vending shop:')
    .addFields(
      { name: '1️⃣ Create Your Shop Sheet', value: 'Create a Google Sheet with a tab named "vendingShop". The sheet must have these columns:\nA: Character Name\nB: Slot\nC: Item Name\nD: Stock Qty\nE: Cost Each\nF: Points Spent\nG: Bought From\nH: Token Price\nI: Art Price\nJ: Other Price\nK: Trades Open\nL: Date (must contain "Old Stock")' },
      { name: '2️⃣ Add Your Old Stock', value: 'Add your initial old stock items to the sheet. For each item:\n• Fill in all required columns\n• Set column L to "Old Stock"\n• Do not edit the sheet after setup' },
      { name: '3️⃣ Sync Your Shop', value: 'Click the "Sync Shop Now" button below to sync your inventory. This will:\n• Import your old stock\n• Set up your vending database\n• Initialize your shop' },
      { name: '4️⃣ Manage Your Shop', value: 'After setup, use these commands:\n• `/vending restock` - Add new items\n• `/vending edit` - Update prices\n• `/vending sync` - Sync changes' },
      { name: '⚠️ Important: Old Stock Only', value: '• Column L must contain "Old Stock" for each item\n• Only add your initial old stock to the sheet\n• Do not edit the sheet after setup\n• All future changes must be made through bot commands' }
    )
    .setColor('#00ff00')
    .setTimestamp()
    .setFooter({ text: 'Note: The shop sheet should not be edited after initial setup' });
}
// ------------------- Function: createExplorationItemEmbed -------------------
// Creates an embed for when a character finds an item during exploration
const createExplorationItemEmbed = (
 party,
 character,
 item,
 expeditionId,
 location,
 totalHearts,
 totalStamina,
 itemsCarried
) => {
 const embed = new EmbedBuilder()
  .setTitle(`🗺️ **Expedition: ${character.name} Found an Item!**`)
  .setDescription(
   `✨ **${character.name || "Adventurer"}** discovered ${item.emoji || ""} **${
    item.itemName
   }** during exploration!\n\n`
  )
  .setColor(regionColors[party.region] || "#00ff99")
  .setThumbnail(item.image || "https://via.placeholder.com/100x100")
  .setImage(regionImages[party.region] || "https://via.placeholder.com/100x100") // Dynamically set region-specific image
  .addFields(
   { name: "🆔 **__Expedition ID__**", value: expeditionId, inline: true },
   {
    name: "📍 **__Current Location__**",
    value: location || "Unknown Location",
    inline: true,
   },
   { name: "❤️ **__Party Hearts__**", value: `${totalHearts}`, inline: false },
   {
    name: "🟩 **__Party Stamina__**",
    value: `${totalStamina}`,
    inline: false,
   },
   {
    name: "🔹 **__Items Carried__**",
    value: itemsCarried || "None",
    inline: false,
   }
  );
 return embed;
};

// ------------------- Function: createExplorationMonsterEmbed -------------------
// Creates an embed for when a character encounters a monster during exploration
const createExplorationMonsterEmbed = (
 party,
 character,
 monster,
 expeditionId,
 location,
 totalHearts,
 totalStamina,
 itemsCarried
) => {
 const monsterImage =
  monster.image ||
  monsterMapping[monster.nameMapping]?.image ||
  "https://via.placeholder.com/100x100";

 const embed = new EmbedBuilder()
  .setTitle(`🗺️ **Expedition: ${character.name} Encountered a Monster!**`)
  .setDescription(
   `**${character.name || "Adventurer"}** encountered ${
    monster.emoji || ""
   } **${monster.name || "Unknown Monster"}** during exploration!`
  )
  .setColor(regionColors[party.region] || "#00ff99")
  .setThumbnail(monsterImage) // Set monster image dynamically
  .setImage(regionImages[party.region] || "https://via.placeholder.com/100x100") // Region-specific image
  .addFields(
   {
    name: "🆔 **__Expedition ID__**",
    value: expeditionId || "Unknown",
    inline: true,
   },
   {
    name: "📍 **__Current Location__**",
    value: location || "Unknown Location",
    inline: true,
   },
   { name: "❤️ **__Party Hearts__**", value: `${totalHearts}`, inline: false },
   {
    name: "🟩 **__Party Stamina__**",
    value: `${totalStamina}`,
    inline: false,
   },
   {
    name: "🔹 **__Items Carried__**",
    value: itemsCarried || "None",
    inline: false,
   }
  );
 return embed;
};

// ------------------- Function: createSetupInstructionsEmbed -------------------
// Creates setup instructions embed for Google Sheets inventory configuration
const createSetupInstructionsEmbed = async (characterName, googleSheetsUrl) => {
  const validationResult = await validateInventorySheet(googleSheetsUrl, characterName); // <-- Pass characterName here too

  const fields = [
    {
      name: "1️⃣ Open Your Inventory Link",
      value: `[📄 Inventory Link](${googleSheetsUrl})\n\n> ---`,
    },
    {
      name: "2️⃣ Create a New Tab",
      value: `> 🔖 Create a new tab named exactly:\n> \`\`\`text\n> loggedInventory\n> \`\`\`\n> *(case-sensitive, no extra spaces)*\n\n> ---`,
    },
    {
      name: "3️⃣ Set Up Headers",
      value: `> ✏️ Ensure headers from **A1 to M1** match exactly:\n> \`\`\`text\n> Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync\n> \`\`\`\n\n> ---`,
    },
    {
      name: "4️⃣ Share the Sheet",
      value: `> 📧 Share with **Editor Access** to:\n> \`\`\`text\n> tinglebot@rotw-tinglebot.iam.gserviceaccount.com\n> \`\`\`\n\n> ---`,
    },
    {
      name: "5️⃣ Test Your Inventory",
      value: `> ✅ Use the command:\n> \u0060\u0060\u0060text\n> /inventory test charactername:${characterName}\n> \u0060\u0060\u0060\n\n> ---`,
    },
  ];

  if (validationResult.success) {
    fields.push({
      name: "✅ Validation Success",
      value: "🎉 Your inventory sheet is set up correctly and ready for syncing!",
    });
  } else {
    const [problem, fix] = validationResult.message.split('||');

    fields.push(
      {
        name: "❌ Validation Error",
        value: `> ⚠️ **Problem Detected:**\n> \n> ${problem?.trim() || 'Unknown Problem'}\n> \n\n> ---`,
      },
      {
        name: "🛠️ How to Fix:",
        value: fix ? `> ${fix.trim()}` : '> Please review the setup instructions carefully and correct any issues.',
      }
    );
  }

  return new EmbedBuilder()
    .setTitle(`📋 Setup Instructions for ${characterName}`)
    .setDescription(`📋 Please follow these steps carefully to set up your Google Sheets inventory.`)
    .addFields(fields)
    .setColor(validationResult.success ? getRandomColor() : 'Red')
    .setTimestamp()
    .setImage(DEFAULT_IMAGE_URL);
};


// ------------------- Function: createSyncEmbed -------------------
// Creates an embed with sync instructions for inventory synchronization
const createSyncEmbed = (characterName, googleSheetsUrl) => {
  const syncEmbed = new EmbedBuilder()
    .setTitle(`🔄 Sync Inventory for ${characterName}`)
    .setDescription(
      "You're almost done! Follow these final steps to sync your inventory to the database.\n\n" +
      "⚡ **Remember:** You can only sync once without Moderator help!"
    )
    .setColor(getRandomColor())
    .setTimestamp()
    .setFooter({
      text: "This process may take a few minutes if you have a lot of items!",
    })
    .setImage(DEFAULT_IMAGE_URL);

  const fields = [
    {
      name: "📄 Step 1: Open Your Inventory Sheet",
      value: `Open your personal Google Sheet:\n[📄 Inventory Link](${googleSheetsUrl})\n\nMake sure your tab is named exactly \`loggedInventory\`.`,
    },
    {
      name: "🧹 Step 2: Final Inventory Check",
      value:
        "Double-check that each item is listed properly:\n" +
        "- Character Name\n" +
        "- Item Name\n" +
        "- Quantity\n\n" +
        "✅ Only include real items your character owns.\n✅ No fake items, placeholders, or notes.",
    },
    {
      name: "📝 Step 3: Example Format",
      value:
        "Your items should look like this in your sheet:\n" +
        "\n" +
        "Tingle | Palm Fruit | 47\n" +
        "\n" +
        "Each row = one item your character actually has.",
    },
    {
      name: "⚠️ Step 4: Important Rules",
      value:
        "- 🛠️ Syncing can **only be performed ONCE** without Moderator help.\n" +
        "- 🚫 After syncing, you **cannot edit your sheet** freely.\n" +
        "- 📋 Double-check everything **before confirming**!",
    },
    {
      name: "🔍 Step 5: Exact Formatting Matters",
      value:
        "Items must match exactly how they appear in official lists.\n" +
        "Use [this sheet](https://docs.google.com/spreadsheets/d/1MZ1DUoqim7LAFs0qm0TTjcln7lroe3ZN0Co2pINc4TY/edit?gid=2070188402#gid=2070188402) for correct item names if you're unsure.",
    },
    {
      name: "✅ Confirm the Sync",
      value:
        "Once ready:\n" +
        "- Click **Yes** to sync.\n" +
        "- Click **No** to cancel and fix your sheet first." 
    },
  ];

  fields.forEach((field) => {
    syncEmbed.addFields({ name: field.name, value: field.value });

  });

  return syncEmbed;
};

// ------------------- Function: editSyncMessage -------------------
// Edits an existing sync message with completion results and statistics
const editSyncMessage = async (
 interaction,
 characterName,
 totalSyncedItemsCount,
 skippedLinesDetails,
 timestamp,
 characterInventoryLink
) => {
 try {
  const validatedLink =
   characterInventoryLink && characterInventoryLink.startsWith("http")
    ? characterInventoryLink
    : "https://docs.google.com/spreadsheets"; // Default fallback URL

  let skippedLinesMessage = "";
  if (skippedLinesDetails.length > 0) {
   skippedLinesMessage =
    "**Skipped Lines:**\n" +
    skippedLinesDetails.map((detail) => `- ${detail.reason}`).join("\n") +
    "\n\n⚠️ Please double-check the spelling or formatting of these items in your sheet. Please let a mod know if any lines were skipped!";
  }

  // ------------------- Subsection Title ------------------- 
  const finalMessage =
   `✅ **Sync completed for ${characterName}!**\n\n` +
   `**${totalSyncedItemsCount} lines synced**\n` +
   `${
    skippedLinesDetails.length > 0
     ? `${skippedLinesDetails.length} skipped`
     : "No lines skipped."
   }\n\n` +
   `${skippedLinesMessage}\n\n` +
   `> [View Inventory](${validatedLink})\n\n` +
   `*Synced on ${timestamp}.*`;

  await interaction.editReply({
   content: finalMessage,
   embeds: [],
   components: [],
  });
 } catch (error) {
  handleError(error, "instructionsEmbeds.js");
  console.error(`Error editing sync completion message: ${error.message}`);
  throw error;
 }
};

// ------------------- Function: editSyncErrorMessage -------------------
// Edits an existing sync message with error information
const editSyncErrorMessage = async (interaction, errorMessage) => {
 try {
  await interaction.editReply({
   content: errorMessage,
   embeds: [],
   components: [],
  });
 } catch (error) {
  handleError(error, "instructionsEmbeds.js");
  console.error(`Error editing sync error message: ${error.message}`);
  throw error;
 }
};

// ------------------- Function: createTokenTrackerSetupEmbed -------------------
// Creates setup instructions embed for token tracker Google Sheets configuration
const createTokenTrackerSetupEmbed = (
 username,
 googleSheetsUrl,
 errorMessage = ""
) => {
 const fields = [
  {
   name: "1. Open the Example Template",
   value: `[📄 Token Tracker Example Template](https://docs.google.com/spreadsheets/d/1zAEqKbAMEdV0oGz7lNAhHaAPt_eIseMMSnyIXr-hovc/edit?usp=sharing)`,
  },
  {
   name: "2. Make a Copy of the Template",
   value:
    "🔖 Go to **File > Make a Copy** in the menu to create your own sheet.",
  },
  {
   name: '3. Create a New Tab Named "loggedTracker"',
   value:
    "📂 Ensure you have a tab named exactly `loggedTracker` in your Google Sheet.",
  },
  {
   name: "4. Add Headers to Your Tracker",
   value: `Ensure these headers are present in the in these cells of the **loggedTracker** tab B7:F7:
            \`\`\`SUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT
            \`\`\``,
  },
  {
   name: "5. Share Your Google Sheet",
   value:
    "📧 Share the sheet with this email address with **edit permissions**:\n`tinglebot@rotw-tinglebot.iam.gserviceaccount.com`",
  },
 ];

 if (errorMessage) {
  fields.push({
   name: "Error",
   value: `❌ **${errorMessage}**`,
  });
 } else {
  fields.push({
   name: "Success",
   value: "🎉 Your token tracker setup appears to be correct! 🎉",
  });
 }

 return new EmbedBuilder()
  .setTitle(`📋 Setup Instructions for ${username}`)
  .setDescription(
   `Follow these steps to set up your Google Sheets token tracker:
        
        **Ensure your Google Sheets URL follows this format:**
        \`\`\`
        https://docs.google.com/spreadsheets/d/1AbcDefGhijk/edit
        \`\`\`
        Make sure all steps are completed before testing.`
  )
  .addFields(fields)
  .setColor(getRandomColor())
  .setTimestamp()
  .setFooter({ text: "Need help? Contact a mod for assistance!" });
};

// ------------------- Function: createCraftingEmbed -------------------
// Creates an embed for crafting activities with materials used and boost support
const createCraftingEmbed = async (item, character, flavorText, materialsUsed, quantity, staminaCost, remainingStamina) => {
 const action = jobActions[character.job] || "crafted";
 const itemQuantityText = ` x${quantity}`;
 const locationPrefix = getLocationPrefix(character);
 const embedTitle = `${locationPrefix}: ${character.name} ${action} ${item.itemName}${itemQuantityText}`;

 const jobForFlavorText = character.jobVoucher ? character.jobVoucherJob : character.job;
 const craftingFlavorText = generateCraftingFlavorText(typeof jobForFlavorText === 'string' ? jobForFlavorText.trim() : '');

 // Get boost information
 const boostInfo = await getBoostInfo(character, 'Crafting');
 const combinedFlavorText = flavorText?.trim()
  ? `${craftingFlavorText}\n\n${addBoostFlavorText('', boostInfo)}\n\n🌟 **Custom Flavor Text:** ${flavorText.trim()}`
  : addBoostFlavorText(craftingFlavorText, boostInfo);

 const DEFAULT_EMOJI = ":small_blue_diamond:";
 let craftingMaterialText = "No materials used or invalid data format.";
 
 if (Array.isArray(materialsUsed) && materialsUsed.length > 0) {
  const formattedMaterials = await Promise.all(
   materialsUsed.map(async (material) => {
    const materialItem = await ItemModel.findOne({ itemName: material.itemName }).select("emoji");
    const emoji = materialItem?.emoji || DEFAULT_EMOJI;
    return formatItemDetails(material.itemName, material.quantity, emoji);
   })
  );

  craftingMaterialText = formattedMaterials.join("\n");
  if (craftingMaterialText.length > 1024) {
   const splitMaterials = [];
   let chunk = "";

   formattedMaterials.forEach((line) => {
    if ((chunk + line + "\n").length > 1024) {
     splitMaterials.push(chunk.trim());
     chunk = "";
    }
    chunk += line + "\n";
   });
   if (chunk) splitMaterials.push(chunk.trim());
   craftingMaterialText = splitMaterials;
  }
 }

 const latestCharacter = await Character.findById(character._id);
 const updatedStamina = latestCharacter ? latestCharacter.currentStamina : remainingStamina;

 const embed = new EmbedBuilder()
  .setColor("#AA926A")
  .setTitle(embedTitle)
  .setDescription(combinedFlavorText)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: character.icon || DEFAULT_IMAGE_URL,
   url: character.inventory || "",
  })
  .addFields(
   ...(Array.isArray(craftingMaterialText)
    ? craftingMaterialText.map((chunk, index) => ({
       name: `📜 **__Materials Used__** (Part ${index + 1})`,
       value: chunk,
       inline: false,
      }))
    : [{ name: "📜 **__Materials Used__**", value: craftingMaterialText, inline: false }]),
   { name: "⚡ **__Stamina Cost__**", value: `> ${staminaCost}`, inline: true },
   { name: "💚 **__Remaining Stamina__**", value: `> ${updatedStamina}`, inline: true }
  )
  .setThumbnail(item.image || 'https://via.placeholder.com/150')
  .setImage(DEFAULT_IMAGE_URL)
  .setFooter({ 
    text: character.jobVoucher ? `🎫 Job Voucher activated for ${character.name} to perform the job ${jobForFlavorText}` : 
         buildFooterText('✨ Successfully crafted!', character, boostInfo)
  });

 return embed;
};

// ------------------- Function: createWritingSubmissionEmbed -------------------
// Creates an embed for writing submission approvals with token calculations
const createWritingSubmissionEmbed = (submissionData) => {
 // Build fields array dynamically - only include non-N/A fields
 const fields = [];

 // Always include these core fields
 if (submissionData.submissionId && submissionData.submissionId !== 'N/A') {
   fields.push({ name: "Submission ID", value: `\`${submissionData.submissionId}\``, inline: false });
 }
 
 fields.push({ name: "Member", value: `<@${submissionData.userId}>`, inline: true });
 fields.push({ name: "Word Count", value: `${submissionData.wordCount}`, inline: true });
 
 // Add blight ID if provided
 if (submissionData.blightId && submissionData.blightId !== 'N/A') {
   fields.push({ name: "🩸 Blight Healing ID", value: `\`${submissionData.blightId}\``, inline: true });
 }
 
 // Add collab field if present
 if (submissionData.collab && submissionData.collab !== 'N/A') {
   // Format collab display - if it's a Discord mention, show it as a mention, otherwise show as is
   const collabDisplay = submissionData.collab.startsWith('<@') && submissionData.collab.endsWith('>') ? submissionData.collab : `@${submissionData.collab}`;
   fields.push({ name: "Collaboration", value: `Collaborating with ${collabDisplay}`, inline: true });
 }
 
   // Calculate token display based on collaboration
  let tokenDisplay = `${submissionData.finalTokenAmount} Tokens`;
  if (submissionData.collab && submissionData.collab !== 'N/A') {
    const splitTokens = Math.floor(submissionData.finalTokenAmount / 2);
    tokenDisplay = `${submissionData.finalTokenAmount} Tokens (${splitTokens} each)`;
  }
  
  fields.push({
    name: "Token Total",
    value: tokenDisplay,
    inline: true,
  });
 fields.push({
   name: "Submission Link",
   value: `[View Submission](${submissionData.link})`,
   inline: true,
 });
 fields.push({
   name: "Token Tracker Link",
   value: submissionData.tokenTracker
    ? `[Token Tracker](${submissionData.tokenTracker})`
    : "N/A",
   inline: true,
 });
 fields.push({ name: "Description", value: submissionData.description, inline: false });

 return new EmbedBuilder()
  .setColor("#AA926A")
  .setTitle(`📚 ${submissionData.title}`)
  .setAuthor({
   name: `Submitted by: ${submissionData.username}`,
   iconURL: submissionData.userAvatar || "https://via.placeholder.com/128",
  })
  .addFields(fields)
  .setImage(DEFAULT_IMAGE_URL)
  .setTimestamp()
  .setFooter({ text: "⏳ Please wait for a mod to approve your submission!" });
};

// ------------------- Function: createArtSubmissionEmbed -------------------
// Creates an embed for art submission approvals with detailed token breakdown
const createArtSubmissionEmbed = (submissionData) => {
  const {
    submissionId,
    title,
    fileName,
    userId,
    username,
    userAvatar,
    fileUrl,
    questEvent,
    questBonus,
    finalTokenAmount,
    tokenCalculation,
    baseSelections,
    typeMultiplierSelections,
    productMultiplierValue,
    addOnsApplied,
    specialWorksApplied,
    collab,
    updatedAt
  } = submissionData;

  // Art title fallback
  const artTitle = title || fileName || 'Untitled Art';

  // Member field (proper mention)
  const memberField = userId ? `<@${userId}>` : username ? `@${username}` : 'N/A';

  // Token tracker link from submission data
  const tokenTrackerLink = submissionData.tokenTracker
    ? `[Token Tracker](${submissionData.tokenTracker})`
    : 'N/A';

  // Quest/Event and Bonus
  const questEventField = questEvent || 'N/A';
  const questBonusField = questBonus || 'N/A';

  // Token calculation breakdown (no duplicate lines)
  let breakdown = '';
  if (tokenCalculation && typeof tokenCalculation === 'object') {
    // Use the breakdown object structure from calculateTokens
    const { baseTotal, typeMultiplierTotal, productMultiplier, addOnTotal, specialWorksTotal, regularTotal, finalTotal } = tokenCalculation;
    
    // Compose breakdown lines
    if (baseSelections && baseSelections.length) {
      breakdown += `${capitalizeFirst(baseSelections[0])} (${baseTotal} × ${characterCount || 1}) = ${baseTotal}\n`;
    }
    if (typeMultiplierTotal && typeMultiplierTotal !== 1) {
      breakdown += `× Type Multiplier (${typeMultiplierTotal})\n`;
    }
    if (productMultiplier && productMultiplier !== 1) {
      breakdown += `× Product Multiplier (${productMultiplier})\n`;
    }
    if (addOnTotal && addOnTotal > 0) {
      breakdown += `+ Add-ons: ${addOnTotal}\n`;
    }
    if (specialWorksTotal && specialWorksTotal > 0) {
      breakdown += `+ Special Works: ${specialWorksTotal}\n`;
    }
    breakdown += '\n-----------------------\n';
    breakdown += `= ${finalTotal || finalTokenAmount} Tokens`;
  } else if (typeof tokenCalculation === 'string') {
    breakdown = tokenCalculation;
  } else {
    breakdown = 'N/A';
  }

  // Build fields array dynamically - only include non-N/A fields
  const fields = [];

  // Always include these core fields
  if (submissionId && submissionId !== 'N/A') {
    fields.push({ name: 'Submission ID', value: `\`${submissionId}\``, inline: false });
  }
  
  fields.push({ name: 'Art Title', value: artTitle, inline: false });
  fields.push({ name: 'Member', value: memberField, inline: true });
  fields.push({ name: 'Token Tracker Link', value: tokenTrackerLink, inline: true });
  
  // Add blight ID if provided
  if (submissionData.blightId && submissionData.blightId !== 'N/A') {
    fields.push({ name: '🩸 Blight Healing ID', value: `\`${submissionData.blightId}\``, inline: true });
  }
  
  // Only add quest/event fields if they're not N/A
  if (questEvent && questEvent !== 'N/A') {
    fields.push({ name: 'Quest/Event', value: questEvent, inline: true });
  }
  
  if (questBonus && questBonus !== 'N/A') {
    fields.push({ name: 'Quest/Event Bonus', value: questBonus, inline: true });
  }
  
  // Add collab field if present
  if (collab && collab !== 'N/A') {
    // Format collab display - if it's a Discord mention, show it as a mention, otherwise show as is
    const collabDisplay = collab.startsWith('<@') && collab.endsWith('>') ? collab : `@${collab}`;
    fields.push({ name: 'Collaboration', value: `Collaborating with ${collabDisplay}`, inline: true });
  }
  
  fields.push({ name: 'Token Total', value: `${finalTokenAmount || 0} Tokens`, inline: true });
  fields.push({ name: 'Token Calculation', value: `\n${breakdown}\n`, inline: false });

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: `Submitted by: ${username || 'Unknown User'}`, iconURL: userAvatar || undefined })
    .setTitle(`🎨 ${artTitle}`)
    .addFields(fields)
    .setFooter({ text: '⏳ Please wait for a mod to approve your submission!', iconURL: undefined })
    .setTimestamp(updatedAt || new Date());

  if (fileUrl) {
    embed.setImage(fileUrl);
  }

  return embed;
}
// ------------------- Function: capitalizeFirst -------------------
// Helper function to capitalize the first letter of a string
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}



// ------------------- Function: createGatherEmbed -------------------
// Creates an embed for gathering activities with boost support and flavor text
const createGatherEmbed = async (character, randomItem, bonusItem = null, isDivineItemWithPriestBoost = false, boosterCharacter = null, scholarTargetVillage = null) => {
 const settings = getCommonEmbedSettings(character);
 const action = typeActionMap[randomItem.type[0]]?.action || "found";
 const article = getArticleForItem(randomItem.itemName);

 // Check if this is a Teacher boost for practical wisdom
 const isTeacherBoost = character.boostedBy && boosterCharacter && 
   (boosterCharacter.job === 'Teacher' || boosterCharacter.job?.toLowerCase() === 'teacher');
 
 // Check if this is a Scholar boost for cross-region gathering
 const isScholarBoost = character.boostedBy && boosterCharacter && 
   (boosterCharacter.job === 'Scholar' || boosterCharacter.job?.toLowerCase() === 'scholar');
 const targetRegion = scholarTargetVillage;
 
 // Use divine flavor text if this is a divine item gathered with Priest boost
 let flavorText;
 if (isDivineItemWithPriestBoost) {
    flavorText = generateDivineItemFlavorText();
 } else {
   if (isTeacherBoost) {
      flavorText = generateTeacherGatheringFlavorText();
   } else {
     flavorText = generateGatherFlavorText(randomItem.type[0], isScholarBoost, targetRegion);
   }
 }

  // Get boost information for non-special cases, including Entertainer bonus item name
  let boostInfo = !isDivineItemWithPriestBoost && !isTeacherBoost ? await getBoostInfo(character, 'Gathering') : null;
  if (boostInfo && boostInfo.boosterJob === 'Entertainer' && bonusItem?.itemName) {
    // Regenerate the boost flavor text to include the bonus item name
    boostInfo = {
      ...boostInfo,
      boostFlavorText: generateBoostFlavorText('Entertainer', 'Gathering', { bonusItemName: bonusItem.itemName })
    };
  }
  let description = addBoostFlavorText(flavorText, boostInfo);
 
 // Add bonus item information if present
 if (bonusItem) {
   const bonusArticle = getArticleForItem(bonusItem.itemName);
   const bonusEmoji = bonusItem.emoji || "🎁";
   
    // Only Entertainer boost provides bonus items
    const isEntertainerBoost = boosterCharacter && (boosterCharacter.job === 'Entertainer' || boosterCharacter.job?.toLowerCase() === 'entertainer');
   
   if (isEntertainerBoost) {
     description += `\n\n🎭 **Entertainer's Gift:** ${character.name} also found ${bonusArticle} ${bonusEmoji}${bonusItem.itemName}!`;
   }
 }
 
 // Add Scholar cross-region information if needed
 if (character.boostedBy && character.boostedBy.toLowerCase().includes('scholar')) {
   if (scholarTargetVillage) {
     description += `\n\n📚 **Scholar's Insight:** ${character.name} used their knowledge to gather from ${scholarTargetVillage} while staying in ${character.currentVillage}!`;
   } else {
     description += `\n\n📚 **Scholar's Insight:** ${character.name} used their knowledge to gather from afar!`;
   }
 }

 const locationPrefix = getLocationPrefix(character);
 const embedColor = getVillageColorByName(character.currentVillage) || settings.color || "#000000";
 const villageImage = getVillageImage(character);
 const thumbnailUrl = isValidImageUrl(randomItem.image) ? randomItem.image : DEFAULT_IMAGE_URL;

 const embed = new EmbedBuilder()
  .setTitle(`${locationPrefix}: ${character.name} ${action} ${article} ${randomItem.itemName}!`)
  .setDescription(description)
  .setColor(embedColor)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: character.icon || DEFAULT_IMAGE_URL,
   url: character.inventory || "",
  })
  .setThumbnail(thumbnailUrl)
  .setImage(villageImage);

 // Fetch item rarity from database
 let itemRarity = 1; // Default to common
 try {
   const itemFromDb = await ItemModel.findOne({ itemName: randomItem.itemName }).select('itemRarity');
   if (itemFromDb && itemFromDb.itemRarity) {
     itemRarity = itemFromDb.itemRarity;
   }
 } catch (error) {
   console.error(`[embeds.js]: Error fetching item rarity for ${randomItem.itemName}:`, error);
 }

 // Build footer text
 let footerText = '';
 if (character.jobVoucher && character.jobVoucherJob) {
   footerText = `🎫 Job Voucher in use: ${character.jobVoucherJob}`;
  } else if (character.boostedBy) {
    footerText = buildFooterText('', character, boostInfo);
    if (footerText && !footerText.startsWith('⚡')) {
      footerText = `⚡ ${footerText}`;
    }
 }
 
 // Add rarity to footer
 if (footerText) {
   footerText += ` | Rarity: ${itemRarity}`;
 } else {
   footerText = `Rarity: ${itemRarity}`;
 }
 
  if (footerText) {
    embed.setFooter({ text: footerText });
  }

 return embed;
};

// ------------------- Item Transfer and Trade Embeds ------------------
// ------------------- Function: createTransferEmbed -------------------
// Creates an embed for item transfers between characters
const createTransferEmbed = (
 fromCharacter,
 toCharacter,
 items,
 fromInventoryLink,
 toInventoryLink,
 fromCharacterIcon,
 toCharacterIcon
) => {
 const fromSettings = getCommonEmbedSettings(fromCharacter);
 const formattedItems = items
  .map(({ itemName, quantity, itemIcon }) =>
   `${formatItemDetails(String(itemName), quantity, itemIcon)}`
  )
  .join("\n");

 const embed = new EmbedBuilder()
  .setColor(fromSettings.color)
  .setAuthor({
   name: `${fromCharacter.name} 🔗`,
   iconURL: fromSettings.author.iconURL,
   url: fromSettings.author.url,
  })
  .setTitle("✬ Item Transfer ✬")
  .setDescription(`**${fromCharacter.name}** ➡️ **[${toCharacter.name}](${toInventoryLink})🔗**`)
  .addFields({ name: "__Items__", value: formattedItems, inline: false })
  .setFooter({ 
   text: toCharacter.name, 
   iconURL: toCharacterIcon && /^https?:\/\//.test(toCharacterIcon) ? toCharacterIcon : undefined 
  });

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createGiftEmbed -------------------
// Creates an embed for item gifts between characters
const createGiftEmbed = (
 fromCharacter,
 toCharacter,
 items,
 fromInventoryLink,
 toInventoryLink,
 fromCharacterIcon,
 toCharacterIcon
) => {
 const fromSettings = getCommonEmbedSettings(fromCharacter);
 const formattedItems = items
  .map(({ itemName, quantity, itemIcon }) =>
   `${formatItemDetails(itemName, quantity, itemIcon)}`
  )
  .join("\n");

 const embed = new EmbedBuilder()
  .setColor(fromSettings.color)
  .setAuthor({
   name: `${fromCharacter.name} 🔗`,
   iconURL: fromSettings.author.iconURL,
   url: fromSettings.author.url,
  })
  .setTitle("✬ Gift ✬")
  .setDescription(`**${fromCharacter.name}** ➡️ **[${toCharacter.name}](${toInventoryLink})🔗**`)
  .addFields({ name: "__Items__", value: formattedItems, inline: false })
  .setFooter({ 
   text: toCharacter.name, 
   iconURL: toCharacterIcon && /^https?:\/\//.test(toCharacterIcon) ? toCharacterIcon : undefined 
  });

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createTradeEmbed -------------------
// Creates an embed for item trades between characters
const createTradeEmbed = async (
 fromCharacter,
 toCharacter,
 fromItems,
 toItems,
 messageUrl
) => {
 const settingsFrom = getCommonEmbedSettings(fromCharacter);
 
 const formatTradeItems = (items) => {
  return items.length > 0
   ? items.map((item) => {
      const emoji = item.emoji || DEFAULT_EMOJI;
      return `${emoji} **${item.name}** x ${item.quantity}`;
     }).join("\n")
   : "No items offered";
 };

 const fromItemsDescription = formatTradeItems(fromItems);
 const toItemsDescription = formatTradeItems(toItems);

 const embed = new EmbedBuilder()
  .setColor(settingsFrom.color)
  .setTitle("✬ Trade ✬")
  .setAuthor({
   name: `${fromCharacter.name} 🔗`,
   iconURL: fromCharacter.icon || settingsFrom.author.iconURL,
   url: fromCharacter.inventory || settingsFrom.author.url,
  })
  .addFields(
   {
    name: `__${fromCharacter.name} offers__`,
    value: fromItemsDescription,
    inline: true,
   },
   {
    name: `__${toCharacter.name} offers__`,
    value: toItemsDescription,
    inline: true,
   }
  )
  .setFooter({ 
   text: toCharacter.name, 
   iconURL: toCharacter.icon && /^https?:\/\//.test(toCharacter.icon) ? toCharacter.icon : undefined 
  });

 setDefaultImage(embed);
 return embed;
};

// ------------------- Combat and Monster Encounter Embeds ------------------
// ------------------- Function: createMonsterEncounterEmbed -------------------
// Creates a monster encounter embed with boost support
const createMonsterEncounterEmbed = async (
 character,
 monster,
 outcomeMessage,
 heartsRemaining,
 lootItem,
 isBloodMoon = false,
 actualRoll = null,
 currentMonster = null,
 totalMonsters = null,
 entertainerBonusItem = null,
 boostCategoryOverride = null,
 elixirBuffInfo = null,
 originalRoll = null
) => {
 const settings = getCommonEmbedSettings(character) || {};
 const nameMapping = monster.nameMapping || monster.name;
 const monsterDetails = monsterMapping[nameMapping.replace(/\s+/g, "")] || {
  name: monster.name,
  image: "https://via.placeholder.com/100x100",
 };

 const koMessage = heartsRemaining === 0
  ? "\n> 💥 **KO! You have been defeated and can't continue!**"
  : "";

 // Get boost information (allow override when encounter happens during other activities like Gathering)
 const boostCategory = boostCategoryOverride || 'Looting';
 const boostInfo = await getBoostInfo(character, boostCategory);

 // Add progress indicator if provided
 const progressField = currentMonster && totalMonsters ? {
  name: "⚔️ __Battle Progress__",
  value: `> Fighting monster **${currentMonster}/${totalMonsters}**`,
  inline: true,
 } : null;

 // Add boost flavor text to outcome if available
 let outcomeWithBoost = outcomeMessage || 'No outcome specified.';
 outcomeWithBoost = addBoostFlavorText(outcomeWithBoost, boostInfo);

 // Add elixir buff information if available
 if (elixirBuffInfo && elixirBuffInfo.helped) {
   let elixirHelpText = '';
   if (elixirBuffInfo.damageReduced > 0) {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Took ${elixirBuffInfo.damageReduced} less damage because of elixir buff!`;
   } else if (elixirBuffInfo.encounterType === 'fire' && elixirBuffInfo.elixirType === 'fireproof') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Fire resistance protected against fire monster!`;
   } else if (elixirBuffInfo.encounterType === 'electric' && elixirBuffInfo.elixirType === 'electro') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Electric resistance protected against electric monster!`;
   } else if (elixirBuffInfo.encounterType === 'ice' && elixirBuffInfo.elixirType === 'spicy') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Cold resistance protected against ice monster!`;
   } else if (elixirBuffInfo.elixirType === 'mighty') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Attack boost improved combat performance!`;
   } else if (elixirBuffInfo.elixirType === 'tough') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Defense boost improved combat performance!`;
   } else if (elixirBuffInfo.elixirType === 'sneaky') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Stealth boost improved encounter success!`;
   } else if (elixirBuffInfo.elixirType === 'hasty') {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Speed boost improved encounter performance!`;
   } else {
     elixirHelpText += `\n\n🧪 **${elixirBuffInfo.elixirName} helped!** Elixir buff improved encounter performance!`;
   }
   outcomeWithBoost += elixirHelpText;
 }

 // Add blight boost information if available
 if (originalRoll && actualRoll && character.blighted && character.blightStage && actualRoll > originalRoll) {
   try {
     const blightBoostText = generateBlightRollBoostFlavorText(character.blightStage, originalRoll, actualRoll);
     outcomeWithBoost += `\n\n${blightBoostText}`;
   } catch (error) {
     console.error(`[embeds.js]: Error generating blight boost text:`, error);
     // Fallback blight boost message
     const improvement = actualRoll - originalRoll;
     const multiplier = (actualRoll / originalRoll).toFixed(1);
     outcomeWithBoost += `\n\n💀 **Blight Boost Applied:** Your roll was enhanced from ${originalRoll} to ${actualRoll} (${multiplier}x multiplier). The corruption within you amplified your combat abilities, making you ${improvement} points stronger than normal.`;
   }
 }

 // Append Entertainer's Gift (for Gathering boost) if provided
 if (entertainerBonusItem && entertainerBonusItem.itemName) {
  const bonusArticle = getArticleForItem(entertainerBonusItem.itemName);
  const bonusEmoji = entertainerBonusItem.emoji || '🎁';
  outcomeWithBoost += `\n\n🎭 **Entertainer's Gift:** ${character.name} also found ${bonusArticle} ${bonusEmoji}${entertainerBonusItem.itemName}!`;
 }

 const embed = new EmbedBuilder()
  .setColor(isBloodMoon ? "#FF4500" : settings.color || "#000000")
  .setTitle(`${character.name} encountered a ${monsterDetails.name || monster.name}!`)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL || "https://via.placeholder.com/100x100",
   url: settings.author?.url || "",
  })
  .addFields(
   {
    name: "__❤️ Hearts__",
    value: `> ${heartsRemaining !== undefined ? heartsRemaining : "Unknown"}/${
     character.maxHearts !== undefined ? character.maxHearts : "Unknown"
    }`,
    inline: true,
   },
   {
    name: "__🟩 Stamina__",
    value: `> ${character.currentStamina}/${character.maxStamina}`,
    inline: true,
   }
  );

 // Add progress field if available
 if (progressField) {
  embed.addFields(progressField);
 }

 embed.addFields({
  name: "🔹 __Outcome__",
  value: `> ${outcomeWithBoost}${koMessage}`,
  inline: false,
 });

 // Build footer text
 let footerText = `Tier: ${monster.tier}`;
 if (isBloodMoon) {
   footerText += " 🔴 Blood Moon Encounter";
 }
 footerText = buildFooterText(footerText, character, boostInfo);

 // Add item rarity to footer if there's loot
 if (lootItem) {
   let itemRarity = 1; // Default to common
   try {
     const itemFromDb = await ItemModel.findOne({ itemName: lootItem.itemName }).select('itemRarity');
     if (itemFromDb && itemFromDb.itemRarity) {
       itemRarity = itemFromDb.itemRarity;
     }
   } catch (error) {
     console.error(`[embeds.js]: Error fetching item rarity for ${lootItem.itemName}:`, error);
   }
   
   if (footerText) {
     footerText += ` | Rarity: ${itemRarity}`;
   } else {
     footerText = `Rarity: ${itemRarity}`;
   }
 }

 embed.setFooter({
  text: footerText,
  iconURL: settings.author?.iconURL || "https://via.placeholder.com/100x100",
 });

 if (lootItem) {
  embed.addFields({
   name: "💥 __Loot__",
   value: `${formatItemDetails(
    lootItem.itemName,
    lootItem.quantity,
    lootItem.emoji
   )}`,
   inline: false,
  });
 }

 // Set thumbnail and image
 setThumbnailWithFallback(embed, monsterDetails.image);
 setDefaultImage(embed);

 return embed;
};

// ------------------- Function: createNoEncounterEmbed -------------------
// Creates an embed for when no monsters are encountered
const createNoEncounterEmbed = (character, isBloodMoon = false) => {
 const settings = getCommonEmbedSettings(character);
 const noEncounterMessage = getNoEncounterMessage(character.currentVillage);
 const locationPrefix = getLocationPrefix(character);
 const villageImage = getVillageImage(character);

 const embedColor = isBloodMoon
  ? "#FF4500"
  : character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase()
  ? getVillageColorByName(character.currentVillage) || "#000000"
  : settings.color || "#000000";

 const embed = new EmbedBuilder()
  .setColor(embedColor)
  .setTitle(`${locationPrefix}: ${character.name} encountered no monsters.`)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL,
   url: settings.author?.url,
  })
  .addFields({
   name: "🔹 __Outcome__",
   value: `> ${noEncounterMessage}`,
   inline: false,
  })
  .setFooter({
   text: isBloodMoon
    ? "🔴 The Blood Moon rises... but nothing stirs in the shadows."
    : character.jobVoucher && character.jobVoucherJob 
    ? `🎫 No monsters encountered, job voucher for ${character.jobVoucherJob} remains active!`
    : "A quiet day in the village.",
  });

 if (isValidImageUrl(villageImage)) {
  embed.setImage(villageImage);
 } else {
  setDefaultImage(embed);
 }

 return embed;
};

// ------------------- Function: createBlightRaidParticipationEmbed -------------------
// Creates an embed for characters who cannot participate in raids due to blight
const createBlightRaidParticipationEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);
 const locationPrefix = getLocationPrefix(character);

 const embed = new EmbedBuilder()
  .setColor("#FF0000")
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL,
   url: settings.author?.url,
  })
  .setTitle(`❌ ${locationPrefix}: ${character.name} Cannot Join Raid!`)
  .setDescription(
   `> **${character.name} cannot participate in raids!**\n\n` +
   `<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot participate in raids until you are healed.`
  )
  .addFields({
   name: "🔮 __Healing Options__",
   value: `> • Seek help from **Oracles, Sages & Dragons**\n` +
          `> • Only these special characters can heal blight corruption\n` +
          `> **Current Blight Stage:** ${character.blightStage}`,
   inline: false,
  })
  .setTimestamp()
  .setFooter({
   text: "Blight corruption prevents raid participation",
   iconURL: settings.footer?.iconURL,
  });

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createBlightStage3NoEncounterEmbed -------------------
// Creates a unique embed for when blight stage 3 characters encounter no monsters
const createBlightStage3NoEncounterEmbed = (character, isBloodMoon = false) => {
 const settings = getCommonEmbedSettings(character);
 const locationPrefix = getLocationPrefix(character);
 const villageImage = getVillageImage(character);

 const embedColor = isBloodMoon
  ? "#FF4500"
  : character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase()
  ? getVillageColorByName(character.currentVillage) || "#000000"
  : settings.color || "#000000";

 const embed = new EmbedBuilder()
  .setColor(embedColor)
  .setTitle(`${locationPrefix}: ${character.name} encountered no monsters.`)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL,
   url: settings.author?.url,
  })
  .addFields({
   name: "🧿 __Blight Effect__",
   value: `> Due to the advanced blight corruption within ${character.name}, the monsters seem to be avoiding them. The corruption has made them appear too dangerous or unpredictable for even the wildest creatures to approach.`,
   inline: false,
  })
  .setFooter({
   text: isBloodMoon
    ? "🔴 The Blood Moon rises... but even the corrupted creatures keep their distance."
    : character.jobVoucher && character.jobVoucherJob 
    ? `🎫 No monsters encountered due to blight stage 3, job voucher for ${character.jobVoucherJob} remains active!`
    : "The blight has made you too fearsome for monsters to approach.",
  });

 if (isValidImageUrl(villageImage)) {
  embed.setImage(villageImage);
 } else {
  setDefaultImage(embed);
 }

 return embed;
};

// ------------------- Function: createKOEmbed -------------------
// Creates an embed for when a character is knocked out
const createKOEmbed = (character, customDescription = null) => {
 const settings = getCommonEmbedSettings(character);
 const locationPrefix = getLocationPrefix(character);

  const embed = new EmbedBuilder()
  .setColor("#FF0000")
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL,
   url: settings.author?.url,
  })
  .setTitle(`💥 ${locationPrefix}: ${character.name} is KO'd!`)
   .setDescription(
    customDescription ||
    (
      `> KO status can only be healed by fairies or Healers.\n` +
      `> Use </item:1379838613067530385> or </heal:1390420428840894557> to heal your character.`
    )
   )
  .setImage("https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png");

 return embed;
};

// ------------------- Function: createWrongVillageEmbed -------------------
// Creates an embed for when a character is in the wrong village for a quest
function createWrongVillageEmbed(character, questVillage, isEscort = false, destination = null) {
  const villageEmoji = getVillageEmojiByName(character.currentVillage);
  const questVillageEmoji = getVillageEmojiByName(questVillage);
  const homeVillageEmoji = getVillageEmojiByName(character.homeVillage);
  
  let title, description, fields;
  
  if (isEscort && destination) {
    const destinationEmoji = getVillageEmojiByName(destination);
    title = '❌ Wrong Village!';
    description = `**${character.name}** is currently in **${villageEmoji} ${capitalizeFirstLetter(character.currentVillage)}**, but needs to be in **${destinationEmoji} ${capitalizeFirstLetter(destination)}** to complete this escort quest.`;
    
    fields = [
      { name: '🏠 Home Village', value: `${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}`, inline: true },
      { name: '📍 Current Location', value: `${villageEmoji} ${capitalizeFirstLetter(character.currentVillage)}`, inline: true },
      { name: '🎯 Quest Village', value: `${questVillageEmoji} ${capitalizeFirstLetter(questVillage)}`, inline: true },
      { name: '🎯 Destination', value: `${destinationEmoji} ${capitalizeFirstLetter(destination)}`, inline: true },
      { name: '💡 Need to travel?', value: 'Use `/travel` to move between villages.', inline: false }
    ];
  } else {
    title = '❌ Wrong Village!';
    description = `**${character.name}** is currently in **${villageEmoji} ${capitalizeFirstLetter(character.currentVillage)}**, but this quest is for **${questVillageEmoji} ${capitalizeFirstLetter(questVillage)}**.`;
    
    fields = [
      { name: '🏠 Home Village', value: `${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}`, inline: true },
      { name: '📍 Current Location', value: `${villageEmoji} ${capitalizeFirstLetter(character.currentVillage)}`, inline: true },
      { name: '🎯 Quest Village', value: `${questVillageEmoji} ${capitalizeFirstLetter(questVillage)}`, inline: true },
      { name: '💡 Need to travel?', value: 'Use `/travel` to move between villages.', inline: false }
    ];
  }
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setColor(0xFF0000)
    .setFooter({
      text: isEscort ? 'For escort quests, characters must travel to the destination village to complete the quest.' : 'Characters must be in their home village to complete Help Wanted quests.'
    })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
}

// ------------------- Function: createRaidKOEmbed -------------------
// Creates an embed for characters who are KO'd and cannot participate in raids
const createRaidKOEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);
 const locationPrefix = getLocationPrefix(character);

 const embed = new EmbedBuilder()
  .setColor("#FF0000")
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author?.iconURL,
   url: settings.author?.url,
  })
  .setTitle(`💥 ${locationPrefix}: ${character.name} Cannot Join Raid!`)
  .setDescription(
   `> **${character.name} is KO'd and cannot participate in raids.**\n\n` +
   `> **To heal your character and join raids:**\n` +
   `> • Use </item:1379838613067530385> with a healing item\n` +
   `> • Use </heal:1390420428840894557> to request healing from a Healer\n` +
   `> **Current Status:** ${character.currentHearts}/${character.maxHearts} hearts`
  )
  .addFields(
   {
    name: "__❤️ Hearts__",
    value: `> ${character.currentHearts}/${character.maxHearts}`,
    inline: true,
   },
   {
    name: "__📍 Location__",
    value: `> ${capitalizeFirstLetter(character.currentVillage)}`,
    inline: true,
   },
   {
    name: "__💊 Healing Options__",
         value: `> • Item healing (</item:1379838613067530385>)\n> • Healer request (</heal:1390420428840894557>)\n>`,
    inline: false,
   }
  )
  .setImage("https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png");

 return embed;
};

// ------------------- Function: createHealEmbed -------------------
// Creates a healing request embed with boost support
const createHealEmbed = async (
 healerCharacter,
 characterToHeal,
 heartsToHeal,
 paymentOffered,
 healingRequestId,
 isFulfilled = false,
 status = undefined
) => {
 if (!characterToHeal) {
  throw new Error("Character to heal is required.");
 }

 const healerName = healerCharacter?.name || "Any available healer";
 const healerIcon = healerCharacter?.icon || DEFAULT_IMAGE_URL;

 // Get boost information
 const boostInfo = await getBoostInfo(characterToHeal, 'Healers');

 const settings = healerCharacter
  ? getCommonEmbedSettings(healerCharacter)
  : { color: "#AA926A" }; // Default color if no healer

 // Handle cancelled state
 if (status === 'cancelled') {
  const embed = new EmbedBuilder()
   .setColor('#888888')
   .setAuthor({
    name: `${characterToHeal.name} 🔗`,
    iconURL: characterToHeal.icon || DEFAULT_IMAGE_URL,
    url: characterToHeal.inventory || "",
   })
   .setTitle('❌ Healing Request Cancelled')
   .setDescription(`This healing request was cancelled by the requester and can no longer be fulfilled.`)
   .addFields(
    {
     name: "__📍 Village__",
     value: `> ${capitalizeFirstLetter(characterToHeal.currentVillage)}`,
     inline: true,
    },
    { name: "__❤️ Hearts to Heal__", value: `> ${heartsToHeal}`, inline: true },
    {
     name: "__💰 Payment Offered__",
     value: `> ${paymentOffered || "None"}`,
     inline: false,
    },
    {
     name: "__🆔 Request ID__",
     value: `> \`${healingRequestId}\``,
     inline: false,
    },
    {
     name: "__❌ Status__",
     value: `> Cancelled by the requester. This request cannot be fulfilled.`,
     inline: false,
    }
   )
   .setFooter({
    text: "This request was cancelled.",
    iconURL: healerCharacter ? healerIcon : null,
   });
  return embed;
 }

 // Pending or fulfilled state
 const embed = new EmbedBuilder()
  .setColor("#AA926A")
  .setAuthor({
   name: `${characterToHeal.name} 🔗`,
   iconURL: characterToHeal.icon || DEFAULT_IMAGE_URL,
   url: characterToHeal.inventory || "",
  });

 if (isFulfilled) {
  // Add boost flavor text to description if available
  let description = `> ${healerName} has healed your character for ${heartsToHeal} hearts!`;
  description = addBoostFlavorText(description, boostInfo);

  embed
   .setTitle('✅ Healing Request Fulfilled')
   .setDescription(description)
   .addFields(
    {
     name: "__❤️ Hearts to Heal__",
     value: `> ${heartsToHeal}`,
     inline: true,
    },
    {
     name: "__💰 Payment Offered__",
     value: `> ${paymentOffered || "None"}`,
     inline: false,
    },
    {
     name: "__🆔 Request ID__",
     value: `> \`${healingRequestId}\``,
     inline: false,
    },
    {
     name: "__✅ Status__",
     value: `> Fulfilled`,
     inline: false,
    }
   );

  // Build footer text
  let footerText = "Healing process successfully completed.";
  footerText = buildFooterText(footerText, characterToHeal, boostInfo);

  embed.setFooter({
   text: footerText,
   iconURL: healerCharacter ? healerIcon : null,
  });
  setDefaultImage(embed);
 } else {
  embed
   .setTitle('📝 Healing Request Pending')
   .setDescription(
    `> ${healerName} has been requested to heal your character for ${heartsToHeal} hearts!`)
   .addFields(
    {
     name: "__❤️ Hearts to Heal__",
     value: `> ${heartsToHeal}`,
     inline: true,
    },
    {
     name: "__💖 Current Hearts__",
     value: `> ${characterToHeal.currentHearts}/${characterToHeal.maxHearts}`,
     inline: true,
    },
    {
     name: "__💰 Payment Offered__",
     value: `> ${paymentOffered || "None"}`,
     inline: false,
    },
    {
     name: "__🆔 Request ID__",
     value: `> \`${healingRequestId}\``,
     inline: false,
    },
    {
     name: "__🕒 Status__",
     value: `> Pending`,
     inline: false,
    }
   );

  // Build footer text for pending state
  let pendingFooterText = "Waiting for a healer to fulfill this request.";
  pendingFooterText = buildFooterText(pendingFooterText, characterToHeal, boostInfo);

  embed.setFooter({
   text: pendingFooterText,
   iconURL: healerCharacter ? healerIcon : null,
  });
  setDefaultImage(embed);
 }
 return embed;
};

// ------------------- Travel and Movement Embeds ------------------
// ------------------- Function: createTravelMonsterEncounterEmbed -------------------
// Creates a travel monster encounter embed with boost support
const createTravelMonsterEncounterEmbed = async (
 character,
 monster,
 outcomeMessage,
 heartsRemaining,
 lootItem,
 day,
 totalTravelDuration,
 pathEmoji,
 currentPath
) => {
 const settings = getCommonEmbedSettings(character);

 const nameMapping = monster.nameMapping || monster.name;
 const normalizedMapping = nameMapping
  .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
   index === 0 ? letter.toLowerCase() : letter.toUpperCase()
  )
  .replace(/\s+/g, "");

 const monsterDetails = monsterMapping[normalizedMapping] || {
  name: monster.name,
  image: "https://via.placeholder.com/100x100",
 };

 // Get boost information
 const boostInfo = await getBoostInfo(character, 'Looting');

 const embed = new EmbedBuilder()
  .setColor("#AA926A")
  .setTitle(
   `**${character.name}** encountered a ${monsterDetails.name || monster.name}!`
  )
  .setAuthor({
   name: `🗺️ Day ${day}/${totalTravelDuration} of travel on ${pathEmoji} ${capitalizeFirstLetter(
    currentPath.replace(/([a-z])([A-Z])/g, "$1 $2")
   )}`,
   iconURL: character.icon,
  })
  .setDescription(
   `**❤️ Hearts: ${character.currentHearts}/${character.maxHearts}**\n**🟩 Stamina: ${character.currentStamina}/${character.maxStamina}**`
  );

  // Add boost flavor text to outcome if available
  let outcomeWithBoost = outcomeMessage;
  outcomeWithBoost = addBoostFlavorText(outcomeWithBoost, boostInfo);

  embed.addFields({
   name: "🔹 __Outcome__",
   value: `> ${outcomeWithBoost}`,
   inline: false,
  });

  // Build footer text
  let footerText = `Tier: ${monster.tier}`;
  footerText = buildFooterText(footerText, character, boostInfo);

  // Add item rarity to footer if there's loot
  if (lootItem) {
    let itemRarity = 1; // Default to common
    try {
      const itemFromDb = await ItemModel.findOne({ itemName: lootItem.itemName }).select('itemRarity');
      if (itemFromDb && itemFromDb.itemRarity) {
        itemRarity = itemFromDb.itemRarity;
      }
    } catch (error) {
      console.error(`[embeds.js]: Error fetching item rarity for ${lootItem.itemName}:`, error);
    }
    
    if (footerText) {
      footerText += ` | Rarity: ${itemRarity}`;
    } else {
      footerText = `Rarity: ${itemRarity}`;
    }
  }

  embed.setFooter({ text: footerText })
    .setImage(PATH_IMAGES[currentPath] || settings.image.url);

 if (lootItem) {
  embed.addFields({
   name: "💥 __Loot__",
   value: `${formatItemDetails(
    lootItem.itemName,
    lootItem.quantity,
    lootItem.emoji
   )}`,
   inline: false,
  });
 }

 // Set thumbnail and image
 setThumbnailWithFallback(embed, monsterDetails.image);
 setDefaultImage(embed);

 return embed;
};

// ------------------- Function: createInitialTravelEmbed -------------------
// Creates an embed for initial travel announcements
const createInitialTravelEmbed = (
 character,
 startingVillage,
 destination,
 paths,
 totalTravelDuration,
 mount = null,
 mode = 'on foot'
) => {
 const startEmoji = villageEmojis[startingVillage.toLowerCase()] || "";
 const destEmoji = villageEmojis[destination.toLowerCase()] || "";
 
 const staminaLine = mode === 'on mount' && mount
  ? `**🥕 __${mount.name}'s Stamina:__** ${mount.currentStamina}/${mount.stamina}`
  : `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;

 const travelPath = paths
  .map((path) => `${pathEmojis[path]} ${capitalizeWords(path.replace(/([a-z])([A-Z])/g, "$1 $2"))}`)
  .join(", ");

 const embed = new EmbedBuilder()
  .setTitle(`**${character.name}** is traveling from ${startEmoji} **${capitalizeFirstLetter(startingVillage)}** to ${destEmoji} **${capitalizeFirstLetter(destination)}**.`)
  .setDescription(
   `**Travel Path:** ${travelPath}\n` +
   `**Total Travel Duration:** ${totalTravelDuration} days\n` +
   `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
   `${staminaLine}`
  )
  .setColor("#AA926A")
  .setAuthor({ name: "Travel Announcement", iconURL: character.icon })
  .setTimestamp();

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createTravelingEmbed -------------------
// Creates an embed for ongoing travel status
const createTravelingEmbed = (character) => {
 const embed = new EmbedBuilder()
  .setDescription(`**${character.name} is traveling** <a:loading:1260369094151114852>`)
  .setColor("#AA926A")
  .setTimestamp();

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createSafeTravelDayEmbed -------------------
// Creates an embed for safe travel days
const createSafeTravelDayEmbed = (
 character,
 day,
 totalTravelDuration,
 pathEmoji,
 currentPath
) => {
 const description = `🌸 **It's a nice and safe day of traveling.** What do you want to do next?\n- ❤️ Recover a heart (costs 1 🟩 stamina)\n- 🌿 Gather (costs 1 🟩 stamina)\n- 💤 Do nothing (move onto the next day)`;

 const pathName = capitalizeWords(currentPath.replace(/([a-z])([A-Z])/g, "$1 $2"));
 const pathImage = PATH_IMAGES[currentPath] || DEFAULT_IMAGE_URL;

 const embed = new EmbedBuilder()
  .setAuthor({
   name: `🗺️ Day ${day}/${totalTravelDuration} of travel on ${pathEmoji} ${pathName}`,
   iconURL: character.icon,
  })
  .setTitle(`**${character.name}** is traveling`)
  .setDescription(
   `${description}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
  )
  .setColor("#AA926A")
  .setTimestamp();

 if (isValidImageUrl(pathImage)) {
  embed.setImage(pathImage);
 } else {
  setDefaultImage(embed);
 }

 return embed;
};



// ------------------- Function: createUpdatedTravelEmbed -------------------
// Creates an updated travel embed from existing encounter message
function createUpdatedTravelEmbed({ encounterMessage, character, description, fields = [], footer = null, titleFallback = null }) {
  const baseEmbed = (encounterMessage?.embeds?.[0])
    ? new EmbedBuilder(encounterMessage.embeds[0].toJSON())
    : new EmbedBuilder().setTitle(titleFallback || `${character.name}'s Travel Log`);

  // Remove old conflicting fields
  baseEmbed.spliceFields(0, baseEmbed.data.fields?.length || 0);
  baseEmbed.addFields(...fields);
  
  return baseEmbed
    .setDescription(description)
    .setFooter(footer || null);
}

// ------------------- Function: createMountEncounterEmbed -------------------
// Creates an embed for mount encounters
function createMountEncounterEmbed(encounter) {
    const mountEmoji = getMountEmoji(encounter.mountType);
    const mountThumbnail = getMountThumbnail(encounter.mountType);
    const villageWithEmoji = `${getVillageEmojiByName(encounter.village)} ${capitalizeFirstLetter(encounter.village)}`;
    const allVillageMounts = ['Horse', 'Donkey', 'Mule']; // Add any other mounts that can be kept by anyone

    const villageInfo = allVillageMounts.includes(encounter.mountType)
        ? `> 🏠 This mount can be kept by anyone in **any village**, but only those currently in **${villageWithEmoji}** can participate!`
        : `> ❗ This mount can only be kept by villagers from **${villageWithEmoji}**, and only those currently in **${villageWithEmoji}** can participate!`;

    const embed = new EmbedBuilder()
        .setTitle(`${mountEmoji} 🌟 ${encounter.mountLevel} Level ${encounter.mountType} Encounter!`)
        .setDescription(`🐾 A **${encounter.mountLevel} level ${encounter.mountType}** has been spotted in **${villageWithEmoji}**!\n\nTo join the encounter, use </mount:1306176789755858983>.`)
        .addFields(
            {
                name: '📜 Encounter Information',
                value: `> You will need **Tokens** for this game if you succeed!\n\nUse the command below to join:\n\`\`\`/mount encounterid:${encounter.encounterId} charactername:\`\`\``,
                inline: false,
            },
            {
                name: '🏠 Village',
                value: villageInfo,
                inline: false,
            }
        )
        .setColor(0xAA926A)
        .setFooter({ text: '⏳ Wait a minute before rolling again or let others participate.' })
        .setTimestamp();

    setThumbnailWithFallback(embed, mountThumbnail);
    return embed;
}

// ------------------- Boost System Embeds ------------------
// ------------------- Function: createBoostRequestEmbed -------------------
// Creates an embed for boost requests
const createBoostRequestEmbed = (requestData, existingRequestId = null, status = 'pending') => {
  // Use existing ID if provided, otherwise generate a unique ID for the request
  const requestId = existingRequestId || generateUniqueId('B'); // 'B' for Boost
  
  // Format the data with proper capitalization
  const requestedBy = capitalizeFirstLetter(requestData.requestedBy || 'Unknown');
  const booster = capitalizeFirstLetter(requestData.booster || 'Unknown');
  const boosterJob = capitalizeWords(requestData.boosterJob || 'Unknown');
  const category = capitalizeFirstLetter(requestData.category || 'Unknown');
  const boostEffect = requestData.boostEffect || 'No effect specified';
  const village = capitalizeFirstLetter(requestData.village || 'Unknown');
  
  // Get village styling
  const villageColor = getVillageColorByName(village) || '#7289DA';
  const villageEmoji = getVillageEmojiByName(village) || '🏘️';
  
  // Calculate expiration time (24 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const expiresIn = `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`;

  // Determine status color and emoji
  let statusColor, statusEmoji, statusText;
  switch (status) {
    case 'pending':
      statusColor = '#FFA500'; // Orange
      statusEmoji = '⏳';
      statusText = 'Pending';
      break;
    case 'fulfilled':
      statusColor = '#00FF00'; // Green
      statusEmoji = '✅';
      statusText = 'Fulfilled';
      break;
    case 'expired':
      statusColor = '#FF0000'; // Red
      statusEmoji = '❌';
      statusText = 'Expired';
      break;
    default:
      statusColor = '#FFA500';
      statusEmoji = '⏳';
      statusText = 'Pending';
  }

  // Build fields array conditionally
  const fields = [
    {
      name: '👤 **Requested By**',
      value: `> ${requestedBy}`,
      inline: true
    },
    {
      name: '🎭 **Booster**',
      value: `> ${booster}`,
      inline: true
    },
    {
      name: '💼 **Booster Job**',
      value: `> ${boosterJob}`,
      inline: true
    },
    {
      name: '📋 **Category**',
      value: `> ${category}`,
      inline: true
    },
    {
      name: '🏘️ **Village**',
      value: `> ${villageEmoji} ${village}`,
      inline: true
    }
  ];

  // Only add Target Village field if it's specified
  if (requestData.targetVillage) {
    fields.push({
      name: '🎯 **Target Village**',
      value: `> ${getVillageEmojiByName(requestData.targetVillage) || '🏘️'} ${capitalizeFirstLetter(requestData.targetVillage)}`,
      inline: true
    });
  }

  // Add remaining fields
  fields.push(
    {
      name: '🆔 **Request ID**',
      value: `> \`${requestId}\``,
      inline: true
    },
    {
      name: `${statusEmoji} **Status**`,
      value: `> ${statusText}`,
      inline: true
    },
    {
      name: '⚡ **Boost Effect**',
      value: `> ${boostEffect}`,
      inline: false
    },
    {
      name: '⏰ **Expires**',
      value: `> ${expiresIn}`,
      inline: false
    }
  );

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Boost Request Created`)
    .setDescription(
      `**${requestedBy}** has requested a boost from **${booster}**!\n\n` +
      `This request will expire in **24 hours** if not accepted.`
    )
    .setColor(statusColor)
    .setThumbnail(requestData.requestedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-icon.png')
    .addFields(fields)
    .setFooter({ 
      text: `Boost requested by ${requestedBy} • This request will expire in 24 hours if not accepted.`,
      iconURL: requestData.boosterIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-icon.png'
    })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: updateBoostRequestEmbed -------------------
// Updates an existing boost request embed with new status information
const updateBoostRequestEmbed = async (client, requestData, newStatus = 'pending') => {
  try {
    // Check if we have the message ID and channel ID
    if (!requestData.messageId || !requestData.channelId) {
      console.log(`[embeds.js] No message ID or channel ID found for boost request ${requestData.boostRequestId}`);
      return false;
    }

    // Get the channel
    const channel = await client.channels.fetch(requestData.channelId);
    if (!channel) {
      console.log(`[embeds.js] Could not find channel ${requestData.channelId} for boost request ${requestData.boostRequestId}`);
      return false;
    }

    // Get the message
    const message = await channel.messages.fetch(requestData.messageId);
    if (!message) {
      console.log(`[embeds.js] Could not find message ${requestData.messageId} for boost request ${requestData.boostRequestId}`);
      return false;
    }

    // Create updated embed data
    const embedData = {
      requestedBy: requestData.targetCharacter,
      booster: requestData.boostingCharacter,
      boosterJob: requestData.boosterJob || 'Unknown',
      category: requestData.category,
      boostEffect: requestData.boostEffect || 'No effect specified',
      village: requestData.village,
      targetVillage: requestData.targetVillage,
      requestedByIcon: requestData.requestedByIcon,
      boosterIcon: requestData.boosterIcon
    };

    // Create the updated embed
    const updatedEmbed = createBoostRequestEmbed(embedData, requestData.boostRequestId, newStatus);

    // Update the message
    await message.edit({
      embeds: [updatedEmbed]
    });

    console.log(`[embeds.js] Successfully updated boost request embed ${requestData.boostRequestId} to status: ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`[embeds.js] Error updating boost request embed ${requestData.boostRequestId}:`, error);
    return false;
  }
};

// ------------------- Function: createBoostAppliedEmbed -------------------
// Creates an embed for when a boost is successfully applied
const createBoostAppliedEmbed = (boostData) => {
  // Format the data with proper capitalization
  const boostedBy = capitalizeFirstLetter(boostData.boostedBy || 'Unknown');
  const boosterJob = capitalizeWords(boostData.boosterJob || 'Unknown');
  const target = capitalizeFirstLetter(boostData.target || 'Unknown');
  const category = capitalizeFirstLetter(boostData.category || 'Unknown');
  const effect = boostData.effect || 'No effect specified';
  const village = capitalizeFirstLetter(boostData.village || 'Unknown');
  
  // Get village styling
  const villageColor = getVillageColorByName(village) || '#00cc99';
  
  // Calculate expiration time (24 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const expiresIn = `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`;

  // Format stamina and hearts display
  const boosterStamina = boostData.boosterStamina || 0;
  const boosterMaxStamina = boostData.boosterMaxStamina || 0;
  const boosterHearts = boostData.boosterHearts || 0;
  const boosterMaxHearts = boostData.boosterMaxHearts || 0;

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Boost Applied: ${boostData.boostName || 'Unknown Boost'}`)
    .setDescription(
      `**${boostedBy}** has successfully applied their boost to **${target}**!\n\n` +
      `The boost will remain active for **24 hours** and provide enhanced abilities.`
    )
    .setColor(villageColor)
    .setThumbnail(boostData.boostedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-applied-icon.png')
    .addFields(
      {
        name: '💼 **Booster Job**',
        value: `> ${boosterJob}`,
        inline: true
      },
      {
        name: '👤 **Target**',
        value: `> ${target}`,
        inline: true
      },
      {
        name: '📋 **Category**',
        value: `> ${category}`,
        inline: true
      },
      {
        name: '⏰ **Expires**',
        value: `> ${expiresIn}`,
        inline: true
      },
      {
        name: '💚 **Booster Stamina**',
        value: `> ${boosterStamina} → ${boosterStamina - 1}`,
        inline: true
      },
      {
        name: '❤️ **Booster Hearts**',
        value: `> ${boosterHearts}`,
        inline: true
      },
      {
        name: '⚡ **Boost Effect**',
        value:
          `> ${effect}\n\n` +
          `> Boost by: ${boosterJob} ${boostedBy} - ${boostData.boostName || 'Unknown Boost'} for ${category}`,
        inline: false
      }
    )
    .setFooter({ 
      text: `Boost ID: ${boostData.boostRequestId || 'Unknown'} • Boost applied to ${target} • Will last 24 hours`,
      iconURL: boostData.targetIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-success-icon.png'
    })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: createRaidVictoryEmbed -------------------
// Creates an embed for when a raid monster is defeated
const createRaidVictoryEmbed = (monsterName, monsterImage = null) => {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${monsterName} DEFEATED!`)
    .setDescription(`The mighty **${monsterName}** has fallen! Processing loot distribution... Please stop rolling! ⏳`)
    .setColor('#FFD700')
    .setFooter({ text: 'Loot processing in progress...' })
    .setTimestamp();

  // Add monster thumbnail if provided
  if (monsterImage && isValidImageUrl(monsterImage)) {
    embed.setThumbnail(monsterImage);
  }

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: createDailyRollsResetEmbed -------------------
// Creates an embed for when a character's daily rolls have been reset
const createDailyRollsResetEmbed = (characterName, rollTypesList) => {
  const embed = new EmbedBuilder()
    .setTitle(`✅ ${characterName}'s Daily Rolls Reset`)
    .setDescription(`**${characterName}**'s daily rolls have been reset!\n\n📋 **Reset roll types:** ${rollTypesList}\n🔄 They can now use their daily rolls again.`)
    .setColor('#00FF00')
    .setFooter({ text: 'Daily rolls reset successfully' })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: createEquippedItemErrorEmbed -------------------
// Creates an embed for when a user tries to sell an equipped item
const createEquippedItemErrorEmbed = (itemName) => {
  const embed = new EmbedBuilder()
    .setTitle('❌ Cannot Sell Equipped Item')
    .setDescription(`You cannot sell \`${itemName}\` because it is currently equipped. Please unequip the item first if you want to sell it.`)
    .setColor('#FF0000')
    .setFooter({ text: 'Item Management' })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: createWeatherTravelRestrictionEmbed -------------------
// Creates an embed for when travel is blocked due to severe weather conditions
const createWeatherTravelRestrictionEmbed = (character, weatherCondition, emoji, village, isDestination = false) => {
  const settings = getCommonEmbedSettings(character);
  const villageEmoji = getVillageEmojiByName(village) || '🏘️';
  const villageName = capitalizeFirstLetter(village);
  
  const title = isDestination 
    ? `❌ Travel to ${villageEmoji} ${villageName} Blocked`
    : `❌ Travel from ${villageEmoji} ${villageName} Blocked`;
    
  const description = isDestination
    ? `**${character.name}** cannot travel to **${villageEmoji} ${villageName}** due to severe weather conditions.`
    : `**${character.name}** cannot travel from **${villageEmoji} ${villageName}** due to severe weather conditions.`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#FF6B6B') // Weather warning red
    .setAuthor({
      name: `${character.name} 🔗`,
      iconURL: character.icon || DEFAULT_IMAGE_URL,
      url: character.inventory || "",
    })
    .addFields(
      {
        name: '🌊 __Weather Condition__',
        value: `> ${emoji} **${weatherCondition}**`,
        inline: true
      },
      {
        name: '📍 __Location__',
        value: `> ${villageEmoji} ${villageName}`,
        inline: true
      },
      {
        name: '⏰ __Status__',
        value: '> Travel temporarily suspended',
        inline: true
      },
      {
        name: '💡 __What to do__',
        value: '> Please wait for the weather to improve before attempting to travel again.',
        inline: false
      }
    )
    .setFooter({ 
      text: 'Severe weather conditions prevent safe travel',
      iconURL: character.icon || DEFAULT_IMAGE_URL
    })
    .setTimestamp();

  setDefaultImage(embed);
  return embed;
};

// ------------------- Function: createGameOverEmbed -------------------
// Creates a game over embed for minigame results
const createGameOverEmbed = (animalsSaved, totalAnimals, aliensDefeated, roundsCompleted, totalRounds) => {
  const savePercentage = Math.round((animalsSaved / totalAnimals) * 100);
  
  return new EmbedBuilder()
    .setTitle("🏁 Game Over! Processing results...")
    .addFields(
      { name: "🐄 Animals Saved", value: `${animalsSaved}/${totalAnimals} (${savePercentage}%)`, inline: true },
      { name: "👾 Aliens Defeated", value: aliensDefeated.toString(), inline: true },
      { name: "⏱️ Rounds Completed", value: `${roundsCompleted}/${totalRounds}`, inline: true }
    )
    .setColor("#FF6B6B")
    .setTimestamp()
    .setImage(DEFAULT_IMAGE_URL);
};

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
 // ------------------- Constants ------------------
 DEFAULT_EMOJI,
 DEFAULT_IMAGE_URL,
 DEFAULT_THUMBNAIL_URL,
 jobActions,
 regionColors,
 regionImages,
 PATH_IMAGES,
 villageEmojis,
 pathEmojis,
 
 // ------------------- Utility Functions ------------------
 getArticleForItem,
 formatItemDetails,
 getCommonEmbedSettings,
 aggregateItems,
 formatMaterialsList,
 setDefaultImage,
 setThumbnailWithFallback,
 getBoostInfo,
 addBoostFlavorText,
 buildFooterText,
 getVillageImage,
 getLocationPrefix,
 
 // ------------------- Embed Creation Functions ------------------
 createDebuffEmbed,
 createGatherDebuffEmbed,
 createCharacterEmbed,
 createSimpleCharacterEmbed,
 createCharacterGearEmbed,
 createVendorEmbed,
 createVendingSetupInstructionsEmbed,
 createExplorationItemEmbed,
 createExplorationMonsterEmbed,
 createSetupInstructionsEmbed,
 createSyncEmbed,
 editSyncMessage,
 editSyncErrorMessage,
 createTokenTrackerSetupEmbed,
 createCraftingEmbed,
 createWritingSubmissionEmbed,
 createArtSubmissionEmbed,
 createGatherEmbed,
 createTransferEmbed,
 createGiftEmbed,
 createTradeEmbed,
 createMonsterEncounterEmbed,
 createNoEncounterEmbed,
 createBlightStage3NoEncounterEmbed,
 createBlightRaidParticipationEmbed,
 createKOEmbed,
 createRaidKOEmbed,
 createHealEmbed,
 createTravelMonsterEncounterEmbed,
 createInitialTravelEmbed,
 createTravelingEmbed,
 createSafeTravelDayEmbed,
 createUpdatedTravelEmbed,
 createMountEncounterEmbed,
 createWrongVillageEmbed,
 createBoostRequestEmbed,
 updateBoostRequestEmbed,
 createBoostAppliedEmbed,
 createRaidVictoryEmbed,
 createDailyRollsResetEmbed,
 createEquippedItemErrorEmbed,
 createWeatherTravelRestrictionEmbed,
 createGameOverEmbed,
};





