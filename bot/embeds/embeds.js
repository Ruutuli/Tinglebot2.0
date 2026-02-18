// ============================================================================
// IMPORTS
// ============================================================================

// ------------------- Discord.js Imports ------------------
const { EmbedBuilder } = require("discord.js");

// ------------------- Utility Module Imports ------------------
const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');
const { getLastDebugValues } = require("../modules/buffModule");
const { capitalize, capitalizeFirstLetter, capitalizeWords, getRandomColor } = require("../modules/formattingModule");
const { getVillageColorByName, getVillageEmojiByName } = require("../modules/locationsModule");
const { getMountEmoji, getMountThumbnail } = require("../modules/mountModule");
const { getNoEncounterMessage, generateCraftingFlavorText, generateGatherFlavorText, typeActionMap, generateBoostFlavorText, generateUnusedBoostFlavorText, generateDivineItemFlavorText, generateTeacherGatheringFlavorText, generateBlightRollBoostFlavorText, generateSubmissionBoostFlavorText } = require("../modules/flavorTextModule");
const { convertCmToFeetInches, isValidImageUrl } = require('../utils/validation');
// Google Sheets functionality removed
const { getCharacterBoostStatus } = require('../modules/boostIntegration');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Database Model Imports ------------------
const Character = require('../models/CharacterModel');
const ItemModel = require('../models/ItemModel');
const { monsterMapping } = require('../models/MonsterModel');

// ============================================================================
// CONSTANTS
// ============================================================================

// ------------------- Default Values ------------------
const DEFAULT_EMOJI = "🔹";
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const DEFAULT_THUMBNAIL_URL = "https://via.placeholder.com/100x100";
const WRITING_SUBMISSION_THUMBNAIL_URL = "https://static.wikia.nocookie.net/zelda_gamepedia_en/images/5/51/ALttP_Book_of_Mudora_Artwork_2.png/revision/latest?cb=20100201171604&format=original";

// ------------------- Region Color Mapping ------------------
const regionColors = {
 eldin: "#FF0000",
 lanayru: "#0000FF",
 faron: "#008000",
 central_hyrule: "#00FFFF",
 gerudo: "#FFA500",
 hebra: "#800080",
};

// ------------------- Command IDs (for clickable slash command mentions) ------------------
// Fetched dynamically on bot ready; fallbacks used until then or if fetch fails
let _exploreCmdId = "1471454947089580107";
let _waveCmdId = "1456463356515979308";
let _itemCmdId = "1379838613067530385";
let _healCmdId = "1390420428840894557";

function getExploreCommandId() {
  return _exploreCmdId;
}
function getWaveCommandId() {
  return _waveCmdId;
}
function getItemCommandId() {
  return _itemCmdId;
}
function getHealCommandId() {
  return _healCmdId;
}

function setExploreCommandId(id) {
  if (id && typeof id === "string") _exploreCmdId = id;
}
function setWaveCommandId(id) {
  if (id && typeof id === "string") _waveCmdId = id;
}
function setItemCommandId(id) {
  if (id && typeof id === "string") _itemCmdId = id;
}
function setHealCommandId(id) {
  if (id && typeof id === "string") _healCmdId = id;
}

// Legacy export for backwards compatibility (returns fallback; prefer getExploreCommandId())
const EXPLORE_CMD_ID = "1471454947089580107";

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
// ------------------- Function: formatBoostCategoryName -------------------
// Formats a boost category name for display, converting internal names to user-friendly names
function formatBoostCategoryName(category) {
 if (!category) return 'Unknown';
 
 // Convert internal category names to display names
 const categoryMap = {
  'Healers': 'Healer',
  'Looting': 'Looting',
  'Gathering': 'Gathering',
  'Crafting': 'Crafting',
  'Stealing': 'Stealing',
  'Vending': 'Vending',
  'Tokens': 'Tokens',
  'Exploring': 'Exploring',
  'Traveling': 'Traveling',
  'Mounts': 'Mounts',
  'Other': 'Other'
 };
 
 return categoryMap[category] || capitalizeFirstLetter(category);
}

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
 // Ensure description is a string
 if (!description || typeof description !== 'string') {
   description = 'A successful gathering trip!';
 }
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
 
 // Show boost info if boostInfo is provided (even if character.boostedBy is null, as it may have been cleared)
 // Format: "Boosted by: Job Name: Character Name - Boost Name"
 if (boostInfo && boostInfo.boosterJob && boostInfo.boosterName && boostInfo.boostName) {
   footerText += ` | Boosted by: ${boostInfo.boosterJob}: ${boostInfo.boosterName} - ${boostInfo.boostName}`;
 } else if (character.boostedBy) {
   // Fallback if boostInfo not provided but character has boostedBy
   footerText += ` | Boosted by: ${character.boostedBy}`;
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
   { name: "📦 __Inventory__", value: `> [Inventory Link](${character.inventory})`, inline: false },
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

// ------------------- Function: getExplorationPartyCharacterFields -------------------
// Returns embed fields for each party member's hearts and stamina (for grotto maze / trial embeds).
function getExplorationPartyCharacterFields(party) {
 if (!party?.characters?.length) return [];
 return party.characters.map((c) => {
  const h = c.currentHearts ?? 0;
  const s = c.currentStamina ?? 0;
  const heartsStr = c.maxHearts ? `${h}/${c.maxHearts}` : String(h);
  const staminaStr = c.maxStamina ? `${s}/${c.maxStamina}` : String(s);
  return {
   name: `❤️🟩 __${c.name}__`,
   value: `❤️ ${heartsStr}  🟩 ${staminaStr}`,
   inline: true,
  };
 });
}

// ------------------- Function: addExplorationStandardFields -------------------
// Appends standard exploration embed fields (Expedition ID, Location, Party Hearts/Stamina, optional Next up + Commands).
// showRestSecureMove: only true for "Quadrant Explored!" embeds; do not set for monster/item/rest/secure/move/camp.
const EXPLORE_DASHBOARD_BASE = "https://tinglebot.xyz/explore";

const addExplorationStandardFields = (embed, { party, expeditionId, location, nextCharacter, showNextAndCommands, showRestSecureMove = false, isAtStartQuadrant = false, commandsLast = false, extraFieldsBeforeIdQuadrant = [], ruinRestRecovered = 0, hasActiveGrotto = false, activeGrottoCommand = "", hasDiscoveriesInQuadrant = false }) => {
 const expId = expeditionId || party?.partyId || "";
 if (expId) embed.setURL(`${EXPLORE_DASHBOARD_BASE}/${expId}`);
 const extraFields = hasActiveGrotto ? [] : (Array.isArray(extraFieldsBeforeIdQuadrant) ? extraFieldsBeforeIdQuadrant : []);
 const fields = [
  { name: "❤️ **__Party Hearts__**", value: String(party?.totalHearts ?? 0), inline: true },
  { name: "🟩 **__Party Stamina__**", value: String(party?.totalStamina ?? 0), inline: true },
  ...extraFields,
  ...(ruinRestRecovered > 0 ? [{ name: "📋 **__Ruin rest__**", value: `Known ruin-rest spot: +${ruinRestRecovered} stamina.`, inline: false }] : []),
  { name: "🆔 **__Expedition ID__**", value: expId || "Unknown", inline: true },
  { name: "📍 **__Quadrant__**", value: location || (party ? `${party.square} ${party.quadrant}` : "Unknown Location"), inline: true },
 ];
 if (showNextAndCommands && nextCharacter?.userId != null && nextCharacter?.name) {
  const nextName = nextCharacter.name;
  const cmdId = getExploreCommandId();
  const cmdRoll = `</explore roll:${cmdId}>`;
  let commandsValue = `**Next:** <@${nextCharacter.userId}> (${nextName})\n\n`;
  if (hasActiveGrotto) {
   commandsValue += `**Trial in progress** — take your turn:\n${activeGrottoCommand || `</explore grotto continue:${cmdId}>`}\n\n_Other explore actions are blocked until the trial ends._`;
  } else if (showRestSecureMove === true) {
   const cmdCamp = `</explore camp:${cmdId}>`;
   const cmdSecure = `</explore secure:${cmdId}>`;
   const cmdMove = `</explore move:${cmdId}>`;
   const cmdItem = `</explore item:${cmdId}>`;
   const cmdEnd = `</explore end:${cmdId}>`;
   commandsValue += `**Next actions**\nYou can do the following:\n\n` +
    `• **Roll** — ${cmdRoll}\n> Continue exploring current quadrant. (Costs 1 stamina)\n\n` +
    `• **Item** — ${cmdItem}\n> Use a healing item from your expedition loadout. Restores hearts and/or stamina.\n\n` +
    `• **Camp** — ${cmdCamp}\n> Rest and recover hearts. Costs 3 stamina in unsecured quadrants.\n\n` +
    `• **Secure** — ${cmdSecure}\n> Secure this quad and create a path. **Requires:** Wood, Eldin Ore (in party), 5 stamina.\n\n` +
    `• **Move** — ${cmdMove}\n> Move to adjacent quadrant. Costs 2 stamina (unexplored), 1 (explored), or 0 (secured). Pick the quadrant to move to via commands.`;
   if (hasDiscoveriesInQuadrant) {
    commandsValue += `\n\n• **Revisit discoveries** — </explore discovery:${cmdId}>\n> Visit a monster camp or grotto marked on the map in this quadrant.`;
   }
   if (isAtStartQuadrant) {
    commandsValue += `\n\n• **End expedition?** — ${cmdEnd}\n> Return home and end the expedition.`;
   }
  } else {
   const cmdItem = `</explore item:${cmdId}>`;
   commandsValue += `**Take your turn:** ${cmdRoll} or ${cmdItem}`;
   if (hasDiscoveriesInQuadrant) {
    const cmdDiscovery = `</explore discovery:${cmdId}>`;
    commandsValue += `\n\n**Revisit discoveries** (monster camps, grottos): ${cmdDiscovery}`;
   }
   commandsValue += `\n\n_Use id: \`${expId || "—"}\` and charactername: **${nextName}** for all commands._`;
  }
  if (!commandsLast) {
   fields.push({ name: "📋 **__Commands__**", value: commandsValue, inline: false });
  }
 }
 embed.addFields(...fields);
 return embed;
};

// Adds the Commands field to an embed (call last when commandsLast was used in addExplorationStandardFields)
// showSecuredQuadrantOnly: true = quadrant is secured, no Roll/Secure — show only Move, Item, Camp (and End if at start)
// showFairyRollOnly: true = fairy just appeared — only instruct to use /explore roll
// showMoveToUnexploredOnly: true = just moved to unexplored quadrant — only "use /explore roll"
const addExplorationCommandsField = (embed, { party, expeditionId, location, nextCharacter, showNextAndCommands, showRestSecureMove = false, showSecuredQuadrantOnly = false, showFairyRollOnly = false, showMoveToUnexploredOnly = false, isAtStartQuadrant = false, hasDiscoveriesInQuadrant = false }) => {
 const expId = expeditionId || party?.partyId || "";
 if (!showNextAndCommands || !nextCharacter?.userId || !nextCharacter?.name) return embed;
 const nextName = nextCharacter.name;
 const cmdId = getExploreCommandId();
 const cmdRoll = `</explore roll:${cmdId}>`;
 let commandsValue = `**Next:** <@${nextCharacter.userId}> (${nextName})\n\n`;
 if (showMoveToUnexploredOnly === true) {
  const cmdItem = `</explore item:${cmdId}>`;
  commandsValue += `**Moved to a new location — use ${cmdRoll} to explore this quadrant, or ${cmdItem} to use a healing item.**`;
 } else if (showSecuredQuadrantOnly === true) {
  const cmdCamp = `</explore camp:${cmdId}>`;
  const cmdMove = `</explore move:${cmdId}>`;
  const cmdItem = `</explore item:${cmdId}>`;
  const cmdEnd = `</explore end:${cmdId}>`;
  commandsValue += `**This quadrant is secured — you cannot roll here.** Use one of:\n\n` +
   `• **Move** — ${cmdMove}\n> Move to adjacent quadrant. Costs 2 stamina (unexplored), 1 (explored), or 0 (secured). Pick the quadrant to move to via commands.\n\n` +
   `• **Item** — ${cmdItem}\n> Use a healing item from your expedition loadout. Restores hearts and/or stamina.\n\n` +
   `• **Camp** — ${cmdCamp}\n> Rest and recover hearts. Costs 3 stamina in unsecured quadrants.`;
  if (isAtStartQuadrant) {
   commandsValue += `\n\n• **End expedition?** — ${cmdEnd}\n> Return home and end the expedition.`;
  }
 } else if (showFairyRollOnly === true) {
  const cmdItem = `</explore item:${cmdId}>`;
  commandsValue += `**A fairy appeared — use ${cmdRoll} or ${cmdItem} to continue exploring.**`;
 } else if (showRestSecureMove === true) {
  const cmdCamp = `</explore camp:${cmdId}>`;
  const cmdSecure = `</explore secure:${cmdId}>`;
  const cmdMove = `</explore move:${cmdId}>`;
  const cmdItem = `</explore item:${cmdId}>`;
  const cmdEnd = `</explore end:${cmdId}>`;
  commandsValue += `**Next actions**\nYou can do the following:\n\n` +
   `• **Roll** — ${cmdRoll}\n> Continue exploring current quadrant. (Costs 1 stamina)\n\n` +
   `• **Item** — ${cmdItem}\n> Use a healing item from your expedition loadout. Restores hearts and/or stamina.\n\n` +
   `• **Camp** — ${cmdCamp}\n> Rest and recover hearts. Costs 3 stamina in unsecured quadrants.\n\n` +
   `• **Secure** — ${cmdSecure}\n> Secure this quad and create a path. **Requires:** Wood, Eldin Ore (in party), 5 stamina.\n\n` +
   `• **Move** — ${cmdMove}\n> Move to adjacent quadrant. Costs 2 stamina (unexplored), 1 (explored), or 0 (secured). Pick the quadrant to move to via commands. **Only use when the expedition prompts you to move.**`;
  if (hasDiscoveriesInQuadrant) {
   commandsValue += `\n\n• **Revisit discoveries** — </explore discovery:${cmdId}>\n> Visit a monster camp or grotto marked on the map in this quadrant.`;
  }
  if (isAtStartQuadrant) {
   commandsValue += `\n\n• **End expedition?** — ${cmdEnd}\n> Return home and end the expedition.`;
  }
 } else {
  const cmdItem = `</explore item:${cmdId}>`;
  commandsValue += `**Take your turn:** ${cmdRoll} or ${cmdItem} — id: \`${expId || "—"}\` charactername: **${nextName}**`;
  if (hasDiscoveriesInQuadrant) {
   const cmdDiscovery = `</explore discovery:${cmdId}>`;
   commandsValue += `\n\nYou can also revisit monster camps or grottos in this quadrant with ${cmdDiscovery} — id: \`${expId || "—"}\` charactername: **${nextName}**`;
  }
 }
 embed.addFields({ name: "📋 **__Commands__**", value: commandsValue, inline: false });
 return embed;
};

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
 nextCharacter = null,
 showNextAndCommands = true,
 ruinRestRecovered = 0,
 hasDiscoveriesInQuadrant = false
) => {
 const embed = new EmbedBuilder()
  .setTitle(`🗺️ **Expedition: ${character.name} Found an Item!**`)
  .setDescription(
   `✨ **${character.name || "Adventurer"}** discovered ${item.emoji || ""} **${
    item.itemName
   }** during exploration in **${location || "Unknown"}**!\n\n`
  )
  .setColor(regionColors[party.region] || "#00ff99")
  .setThumbnail(item.image || "https://via.placeholder.com/100x100")
  .setImage(regionImages[party.region] || "https://via.placeholder.com/100x100");
 addExplorationStandardFields(embed, {
  party,
  expeditionId,
  location: location || "Unknown Location",
  nextCharacter: nextCharacter ?? null,
  showNextAndCommands: !!nextCharacter && showNextAndCommands,
  showRestSecureMove: false,
  extraFieldsBeforeIdQuadrant: [{ name: `❤️ __${character.name} Hearts__`, value: `${character.currentHearts ?? 0}/${character.maxHearts ?? 0}`, inline: true }],
  ruinRestRecovered,
  hasDiscoveriesInQuadrant,
 });
 const rarity = item.itemRarity ?? 1;
 embed.setFooter({ text: `Rarity: ${rarity}` });
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
 nextCharacter = null,
 showNextAndCommands = true,
 ruinRestRecovered = 0,
 hasDiscoveriesInQuadrant = false
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
   } **${monster.name || "Unknown Monster"}** during exploration in **${location || "Unknown"}**!`
  )
  .setColor(regionColors[party.region] || "#00ff99")
  .setThumbnail(monsterImage)
  .setImage(regionImages[party.region] || "https://via.placeholder.com/100x100");
 addExplorationStandardFields(embed, {
  party,
  expeditionId,
  location: location || "Unknown Location",
  nextCharacter: nextCharacter ?? null,
  showNextAndCommands: !!nextCharacter && showNextAndCommands,
  showRestSecureMove: false,
  commandsLast: true,
  extraFieldsBeforeIdQuadrant: [{ name: `❤️ __${character.name} Hearts__`, value: `${character.currentHearts ?? 0}/${character.maxHearts ?? 0}`, inline: true }],
  ruinRestRecovered,
  hasDiscoveriesInQuadrant,
 });
 const tier = monster.tier ?? 1;
 embed.setFooter({ text: `Tier: ${tier}` });
 return embed;
};

// ------------------- Function: createSetupInstructionsEmbed -------------------
// Creates setup instructions embed for inventory link configuration
const createSetupInstructionsEmbed = async (characterName, googleSheetsUrl) => {
  const validationResult = await validateInventorySheet(googleSheetsUrl, characterName); // <-- Pass characterName here too

  const fields = [
    {
      name: "⚠️ CRITICAL: Read This First",
      value: `> **Make sure you're linking the correct spreadsheet!**\n> If you have multiple spreadsheets, the bot will use whichever one is linked in your character profile.\n> \n> **⚠️ IMPORTANT:** You can ONLY have ONE tab named \`loggedInventory\` in your spreadsheet!\n> If you have multiple tabs with this name, delete all but one. Keep only the tab that has your character's starter gear.\n\n> ---`,
    },
    {
      name: "1️⃣ Open Your Inventory Link",
      value: `[📄 Inventory Link](${googleSheetsUrl})\n\n**Verify this is the correct spreadsheet you're editing!**\n\n> ---`,
    },
    {
      name: "2️⃣ Create a New Tab (ONLY ONE!)",
      value: `> 🔖 Create a new tab named **exactly**:\n> \`\`\`text\n> loggedInventory\n> \`\`\`\n> \n> **⚠️ WARNING:** \n> - Must be spelled exactly as shown (case-sensitive)\n> - No extra spaces before or after\n> - If you already have a tab with this name, **delete all duplicates** and keep only one\n> - The bot will get confused if there are multiple tabs with the same name\n\n> ---`,
    },
    {
      name: "3️⃣ Set Up Headers",
      value: `> ✏️ Ensure headers from **A1 to M1** match exactly:\n> \`\`\`text\n> Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync\n> \`\`\`\n\n> ---`,
    },
    {
      name: "4️⃣ Share Your Inventory",
      value: `> 📧 Share with **Editor Access** to:\n> \`\`\`text\n> tinglebot@rotw-tinglebot.iam.gserviceaccount.com\n> \`\`\`\n\n> ---`,
    },
    {
      name: "5️⃣ Add Your Starter Gear",
      value: `> 📦 **BEFORE testing or syncing**, add all your character's starter gear items to the \`loggedInventory\` tab.\n> \n> For each item, fill in at minimum:\n> - **Character Name** (column A): Your character's exact name\n> - **Item Name** (column B): The item name\n> - **Qty of Item** (column C): The quantity (must be greater than 0)\n> \n> **Don't sync until all your starter gear is added!**\n\n> ---`,
    },
    {
      name: "6️⃣ Test Your Inventory (Communication Check Only)",
      value: `> ✅ Use the command:\n> \`\`\`text\n> /inventory test charactername:${characterName}\n> \`\`\`\n> \n> **What this does:**\n> - ✅ Tests if the bot can communicate with your sheet\n> - ✅ Checks if headers are correct\n> - ✅ Verifies permissions are set up\n> - ❌ **Does NOT sync your items to the database**\n> - ❌ **Does NOT transfer any data**\n> \n> This is just a connection test!\n\n> ---`,
    },
    {
      name: "7️⃣ Sync Your Inventory (One Time Only!)",
      value: `> 🔄 **Only after** your test passes AND you've added all starter gear:\n> \`\`\`text\n> /inventory sync charactername:${characterName}\n> \`\`\`\n> \n> **What this does:**\n> - 🔄 Actually syncs your items to the database\n> - 🔄 Transfers all items from your sheet\n> - ⚠️ **Can only be done ONCE** without Moderator help\n> - ⚠️ **Make sure everything is correct before syncing!**\n\n> ---`,
    },
  ];

  if (validationResult.success) {
    fields.push({
      name: "✅ Validation Success",
      value: "🎉 Your inventory is set up correctly and ready for syncing!",
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
    .setDescription(`📋 Please follow these steps carefully to set up your inventory.`)
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
      name: "⚠️ CRITICAL: Verify Before Syncing",
      value: `> **1. Check the Spreadsheet URL:**\n> Make sure [this link](${googleSheetsUrl}) is the correct spreadsheet you're editing!\n> \n> **2. Check for Duplicate Tabs:**\n> ⚠️ **You can ONLY have ONE tab named \`loggedInventory\`!**\n> If you have multiple tabs with this name, delete all but one.\n> Keep only the tab that contains your character's starter gear.\n> \n> **3. Verify the Correct Tab:**\n> Make sure you're using the tab that has your starter gear in it.\n> The bot will read from whichever tab is named \`loggedInventory\`.\n\n> ---`,
    },
    {
      name: "📄 Step 1: Open Your Inventory Link",
      value: `Open your personal Google Sheet:\n[📄 Inventory Link](${googleSheetsUrl})\n\n**Double-check:** Is this the correct spreadsheet?\nMake sure your tab is named exactly \`loggedInventory\` (case-sensitive).`,
    },
    {
      name: "🧹 Step 2: Final Inventory Check",
      value:
        "Double-check that each item is listed properly:\n" +
        "- Character Name (must match your character's name exactly)\n" +
        "- Item Name\n" +
        "- Quantity (must be greater than 0)\n\n" +
        "✅ Only include real items your character owns.\n✅ No fake items, placeholders, or notes.\n✅ Make sure ALL your starter gear is in the sheet.",
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
        "- 📋 Double-check everything **before confirming**!\n" +
        "- 🔍 Make sure you've tested with `/inventory test` first!",
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
  const validatedLink = (() => {
   if (typeof characterInventoryLink === "string") {
    const trimmed = characterInventoryLink.trim();
    if (trimmed.length > 0) {
     if (trimmed.startsWith("http")) return trimmed;
     if (trimmed.startsWith("/")) return `https://tinglebot.xyz${trimmed}`;
    }
   }

   // Default to the dashboard inventory route
   const slug = String(characterName || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
   return `https://tinglebot.xyz/characters/inventories/${slug}`;
  })();

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
// Legacy: Token tracker Google Sheets setup (deprecated).
// Tokens are now tracked automatically in the database; keep this function
// for compatibility with older command flows, but do not reference Sheets.
const createTokenTrackerSetupEmbed = (
 username,
 googleSheetsUrl,
 errorMessage = ""
) => {
 // Keep params for compatibility; unused after deprecation.
 void googleSheetsUrl;

 const embed = new EmbedBuilder()
  .setTitle(`🪙 Tokens for ${username}`)
  .setDescription(
   "Tokens are tracked automatically in the database. No external tracker setup is required.\n\nUse `/tokens check` to view your current balance, and the Dashboard for detailed history."
  )
  .setColor(getRandomColor())
  .setTimestamp()
  .setFooter({ text: "Tokens" });

 if (errorMessage) {
  embed.addFields({ name: "Info", value: `⚠️ ${errorMessage}` });
 }

 return embed;
};

// ------------------- Function: createCraftingEmbed -------------------
// Creates an embed for crafting activities with materials used and boost support
const createCraftingEmbed = async (item, character, flavorText, materialsUsed, quantity, staminaCost, remainingStamina, jobForFlavorText = null, originalStaminaCost = null, staminaSavings = 0, materialSavings = [], teacherBoostInfo = null) => {
 const action = jobActions[character.job] || "crafted";
 const itemQuantityText = ` x${quantity}`;
 const locationPrefix = getLocationPrefix(character);
 const embedTitle = `${locationPrefix}: ${character.name} ${action} ${item.itemName}${itemQuantityText}`;

 const jobForFlavorTextParam = jobForFlavorText || (character.jobVoucher ? character.jobVoucherJob : character.job);
 const craftingFlavorText = generateCraftingFlavorText(typeof jobForFlavorTextParam === 'string' ? jobForFlavorTextParam.trim() : '');

 // Get boost information
 const boostInfo = await getBoostInfo(character, 'Crafting');
 
 // Enhance boost effect text with material savings if Scholar boost was active
 // Also add Teacher stamina split information if Teacher boost was active
 let enhancedBoostInfo = boostInfo;
 if (materialSavings && materialSavings.length > 0 && boostInfo) {
  const savingsList = materialSavings.map(m => `• ${m.itemName}: saved ${m.saved}`).join('\n');
  enhancedBoostInfo = {
   ...boostInfo,
   boostFlavorText: `${boostInfo.boostFlavorText || ''}\n\n💚 **Material Savings:**\n${savingsList}`
  };
 }
 
 // Add Teacher stamina split information if Teacher boost was active
 if (teacherBoostInfo) {
  const teacherInfo = `⚡ **Stamina Split:** ${teacherBoostInfo.teacherName} used ${teacherBoostInfo.teacherStaminaUsed} stamina, ${character.name} used ${teacherBoostInfo.crafterStaminaUsed} stamina (Total: ${teacherBoostInfo.totalStaminaCost})`;
  if (enhancedBoostInfo) {
   // Combine with existing boost info
   enhancedBoostInfo = {
    ...enhancedBoostInfo,
    boostFlavorText: `${enhancedBoostInfo.boostFlavorText || boostInfo?.boostFlavorText || ''}\n\n${teacherInfo}`
   };
  } else {
   // Teacher boost active but no other boost info - create new boost info
   enhancedBoostInfo = {
    boostFlavorText: teacherInfo
   };
  }
 }
 
 const combinedFlavorText = flavorText?.trim()
  ? `${craftingFlavorText}\n\n${addBoostFlavorText('', enhancedBoostInfo)}\n\n🌟 **Custom Flavor Text:** ${flavorText.trim()}`
  : addBoostFlavorText(craftingFlavorText, enhancedBoostInfo);

 const DEFAULT_EMOJI = ":small_blue_diamond:";
 let craftingMaterialText = "No materials used or invalid data format.";
 
 if (Array.isArray(materialsUsed) && materialsUsed.length > 0) {
  // Combine same items into one line (e.g. Ironshroom x4 instead of four "x1" lines)
  const aggregated = new Map();
  for (const material of materialsUsed) {
   const key = material.itemName;
   const prev = aggregated.get(key) || 0;
   aggregated.set(key, prev + (material.quantity ?? 1));
  }
  const materialsByItem = Array.from(aggregated.entries(), ([itemName, quantity]) => ({ itemName, quantity }));

  const formattedMaterials = await Promise.all(
   materialsByItem.map(async (material) => {
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

 // Build stamina cost field with savings info if Priest boost was active
 let staminaCostValue = `> ${staminaCost}`;
 if (staminaSavings > 0 && originalStaminaCost !== null) {
  const reducedCost = originalStaminaCost - staminaSavings;
  staminaCostValue = `> ${staminaCost}\n💫 *Would have used ${originalStaminaCost}, but thanks to Priest boost it was reduced to ${reducedCost} (saved ${staminaSavings})*`;
 }

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
   { name: "⚡ **__Stamina Cost__**", value: staminaCostValue, inline: true },
   { name: "💚 **__Remaining Stamina__**", value: `> ${updatedStamina}`, inline: true }
  )
  .setThumbnail(item.image || 'https://via.placeholder.com/150')
  .setImage(DEFAULT_IMAGE_URL)
  .setFooter({ 
    text: character.jobVoucher ? `🎫 Job Voucher activated for ${character.name} to perform the job ${jobForFlavorTextParam}` : 
         buildFooterText('✨ Successfully crafted!', character, enhancedBoostInfo)
  });

 return embed;
};

// ------------------- Function: createWritingSubmissionEmbed -------------------
// Creates an embed for writing submission approvals with token calculations
const createWritingSubmissionEmbed = (submissionData) => {
  const fields = [];

  const hasCollaborators =
    submissionData.collab &&
    ((Array.isArray(submissionData.collab) && submissionData.collab.length > 0) ||
      (typeof submissionData.collab === 'string' && submissionData.collab !== 'N/A'));

  const questBonusValue =
    submissionData.questBonus && submissionData.questBonus !== 'N/A' && submissionData.questBonus > 0
      ? submissionData.questBonus
      : 0;
  const boostIncreaseValue =
    submissionData.boostTokenIncrease && submissionData.boostTokenIncrease > 0
      ? submissionData.boostTokenIncrease
      : 0;

  // Extract token breakdown from tokenCalculation if available
  let baseTokenPortion = null;
  let collabBonusValue = 0;
  let tokensPerPerson = submissionData.finalTokenAmount;
  
  if (submissionData.tokenCalculation && typeof submissionData.tokenCalculation === 'object') {
    baseTokenPortion = submissionData.tokenCalculation.baseTokensPerPerson ?? 
                       submissionData.tokenCalculation.baseTokens ?? null;
    collabBonusValue = submissionData.tokenCalculation.collabBonus ?? 0;
    tokensPerPerson = submissionData.tokenCalculation.tokensPerPerson ?? 
                      submissionData.tokenCalculation.finalTotal ?? 
                      submissionData.finalTokenAmount;
  }

  if (baseTokenPortion === null) {
    baseTokenPortion = submissionData.finalTokenAmount - boostIncreaseValue;
    if (questBonusValue > 0) {
      baseTokenPortion -= questBonusValue;
    }
    if (hasCollaborators && collabBonusValue > 0) {
      baseTokenPortion -= collabBonusValue;
    }
  }

  let tokenDisplay = `${tokensPerPerson} tokens`;
  const breakdownParts = [];
  
  // Only show breakdown if there are bonuses or it's a collab
  if (baseTokenPortion !== null && baseTokenPortion >= 0) {
    breakdownParts.push(`${baseTokenPortion} base`);
  }
  if (questBonusValue > 0) {
    breakdownParts.push(`+ ${questBonusValue} quest bonus${hasCollaborators ? ' (each)' : ''}`);
  }
  if (hasCollaborators && collabBonusValue > 0) {
    breakdownParts.push(`+ ${collabBonusValue} collab bonus (each)`);
  }
  if (boostIncreaseValue > 0) {
    breakdownParts.push(`+ ${boostIncreaseValue} boost`);
  }
  
  if (breakdownParts.length > 0) {
    tokenDisplay = `${breakdownParts.join(' ')} = ${tokensPerPerson} tokens`;
  }
  
  if (hasCollaborators) {
    const collaborators = Array.isArray(submissionData.collab)
      ? submissionData.collab
      : [submissionData.collab];
    const totalParticipants = 1 + collaborators.length;
    tokenDisplay += ` per person (${totalParticipants} people)`;
  }

  if (submissionData.submissionId && submissionData.submissionId !== 'N/A') {
    fields.push({ name: "🆔 Submission ID", value: `\`${submissionData.submissionId}\``, inline: true });
  }

  fields.push({ name: "👤 Member", value: `<@${submissionData.userId}>`, inline: true });
  fields.push({ name: "📝 Word Count", value: `${submissionData.wordCount}`, inline: true });

  fields.push({
    name: "💰 Token Summary",
    value: `**${tokenDisplay}**`,
    inline: false,
  });

  if (submissionData.blightId && submissionData.blightId !== 'N/A') {
    fields.push({ name: "🩸 Blight Healing ID", value: `\`${submissionData.blightId}\``, inline: true });
  }

  if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
    fields.push({ name: "🎯 Quest/Event", value: `\`${submissionData.questEvent}\``, inline: true });
  }

  if (questBonusValue > 0) {
    fields.push({ name: "🎁 Quest Bonus", value: `+${questBonusValue} tokens`, inline: true });
  }

  if (hasCollaborators) {
    const collaborators = Array.isArray(submissionData.collab)
      ? submissionData.collab
      : [submissionData.collab];
    const collabDisplay = collaborators.join(', ');
    fields.push({ name: "🤝 Collaboration", value: collabDisplay, inline: true });
  }

  if (submissionData.taggedCharacters && submissionData.taggedCharacters.length > 0) {
    const taggedDisplay = submissionData.taggedCharacters.join(', ');
    fields.push({ name: "🏷️ Tagged Characters", value: taggedDisplay, inline: true });
  }

  if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
    const formattedEffects = submissionData.boostEffects.map(effect =>
      effect.startsWith('•') ? effect : `• ${effect}`
    );
    fields.push({
      name: "🎭 Boost Effects",
      value: formattedEffects.join('\n'),
      inline: false,
    });
  }

  fields.push({
    name: "🔗 Submission Link",
    value: submissionData.link ? `[View Submission](${submissionData.link})` : "N/A",
    inline: true,
  });

  fields.push({
    name: "🪙 Tokens",
    value: `[View Tokens](https://tinglebot.xyz/profile?tab=tokens)`,
    inline: true,
  });

  const boostMetadata = Array.isArray(submissionData.boostMetadata) ? submissionData.boostMetadata : [];
  const boostSummaries = boostMetadata
    .map(metadata =>
      generateSubmissionBoostFlavorText(metadata.boosterJob, 'writing', {
        boosterName: metadata.boosterName,
        targets: metadata.targets,
        tokenIncrease: metadata.tokenIncrease ?? boostIncreaseValue,
      })
    )
    .filter(Boolean);

  const descriptionLines = [];
  if (boostSummaries.length > 0) {
    descriptionLines.push(boostSummaries.join('\n'));
  }

  const rawDescription =
    typeof submissionData.description === 'string' && submissionData.description.trim().length > 0
      ? submissionData.description.trim()
      : '_No description provided._';
  descriptionLines.push(rawDescription);

  const submissionTitle = submissionData.title || 'Untitled Submission';

  const embed = new EmbedBuilder()
    .setColor("#AA926A")
    .setTitle(`📚 ${submissionTitle}`)
    .setAuthor({
      name: `Submitted by: ${submissionData.username}`,
      iconURL: submissionData.userAvatar || "https://via.placeholder.com/128",
    })
    .setDescription(descriptionLines.join('\n\n'))
    .addFields(fields)
    .setThumbnail(WRITING_SUBMISSION_THUMBNAIL_URL)
    .setImage(DEFAULT_IMAGE_URL)
    .setTimestamp();

 // Set different footer based on submission type
 if (submissionData.tokenCalculation === 'No tokens - Display only') {
  let footerText = "✅ Auto-approved - Display only";
  if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
    footerText += " • Boost active";
  }
  embed.setFooter({ text: footerText });
 } else {
  let footerText = "⏳ Please wait for a mod to approve your submission!";
  if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
    footerText += " • Boost active";
  }
  embed.setFooter({ text: footerText });
 }

 return embed;
};

// ------------------- Function: ensureEmbedFieldValueIsString -------------------
// Helper function to ensure embed field values are strings (Discord requirement)
// Converts numbers, null, undefined, and other types to appropriate string representations
const ensureEmbedFieldValueIsString = (value) => {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
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
    baseCounts,
    typeMultiplierSelections,
    productMultiplierValue,
    addOnsApplied,
    specialWorksApplied,
    collab,
    updatedAt,
    characterCount
  } = submissionData;

  // Art title fallback
  const artTitle = title || fileName || 'Untitled Art';

  // Member field (proper mention)
  const memberField = userId ? `<@${userId}>` : username ? `@${username}` : 'N/A';

  const tokensDashboardLink = 'https://tinglebot.xyz/profile?tab=tokens';

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
      // Show base total (baseTotal already includes multiplication by count)
      breakdown += `Base: ${baseTotal}\n`;
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
  fields.push({ name: '🪙 Tokens', value: `[View Tokens](${tokensDashboardLink})`, inline: true });
  
  // Add blight ID if provided
  if (submissionData.blightId && submissionData.blightId !== 'N/A') {
    fields.push({ name: '🩸 Blight Healing ID', value: `\`${submissionData.blightId}\``, inline: true });
  }
  
  // Only add quest/event fields if they're not N/A
  if (questEvent && questEvent !== 'N/A') {
    fields.push({ name: 'Quest/Event', value: questEvent, inline: true });
  }
  
  if (questBonus && questBonus !== 'N/A') {
    fields.push({ name: 'Quest/Event Bonus', value: ensureEmbedFieldValueIsString(questBonus), inline: true });
  }
  
  // Add collab field if present
  const hasCollaborators = collab && ((Array.isArray(collab) && collab.length > 0) || (typeof collab === 'string' && collab !== 'N/A'));
  
  if (hasCollaborators) {
    const collaborators = Array.isArray(collab) ? collab : [collab];
    const collabDisplay = collaborators.join(', ');
    fields.push({ name: 'Collaboration', value: `Collaborating with ${collabDisplay}`, inline: true });
  }

  // Add tagged characters field if present
  if (submissionData.taggedCharacters && submissionData.taggedCharacters.length > 0) {
    const taggedDisplay = submissionData.taggedCharacters.join(', ');
    fields.push({ name: 'Tagged Characters', value: taggedDisplay, inline: true });
  }

  // Add Group Art Meme field if applicable
  if (submissionData.isGroupMeme === true && submissionData.memeMode) {
    const modeLabel = submissionData.memeMode === 'hard' ? 'Hard' : 'Easy';
    let memeValue = `Yes (${modeLabel})`;
    if (submissionData.memeTemplate) {
      memeValue += ` – ${submissionData.memeTemplate}`;
    }
    if (submissionData.memeMode === 'hard') {
      memeValue += '\n_Eligible for 1 slot point if requirements met (Full Color + Waist Up or Full Body)._';
    }
    fields.push({ name: 'Group Art Meme', value: memeValue, inline: false });
  }

  if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
    fields.push({
      name: '🎭 Boost Effects',
      value: submissionData.boostEffects.join('\n'),
      inline: false
    });
  }
  
  // Calculate token display based on collaboration
  let tokenDisplay = `${finalTokenAmount || 0} Tokens`;
  if (hasCollaborators) {
    const collaborators = Array.isArray(collab) ? collab : [collab];
    const totalParticipants = 1 + collaborators.length;
    const splitTokens = Math.floor(finalTokenAmount / totalParticipants);
    tokenDisplay = `${finalTokenAmount || 0} Tokens (${splitTokens} each)`;
  }
  
  fields.push({ name: 'Token Total', value: tokenDisplay, inline: true });
  
  // Only show token calculation if it's not a no-tokens submission
  if (tokenCalculation !== 'No tokens - Display only') {
    fields.push({ name: 'Token Calculation', value: `\n${breakdown}\n`, inline: false });
  }

  // Validate all field values are strings (Discord requirement)
  const validatedFields = fields.map(field => ({
    ...field,
    value: ensureEmbedFieldValueIsString(field.value)
  }));

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: `Submitted by: ${username || 'Unknown User'}`, iconURL: userAvatar || undefined })
    .setTitle(`🎨 ${artTitle}`)
    .addFields(validatedFields);

  // Set different footer and timestamp based on submission type
  if (tokenCalculation === 'No tokens - Display only') {
    let footerText = '✅ Auto-approved - Display only';
    if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
      footerText += ' • Boost active';
    }
    embed.setFooter({ text: footerText, iconURL: undefined })
         .setTimestamp(updatedAt || new Date());
  } else {
    let footerText = '⏳ Please wait for a mod to approve your submission!';
    if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
      footerText += ' • Boost active';
    }
    embed.setFooter({ text: footerText, iconURL: undefined })
         .setTimestamp(updatedAt || new Date());
  }

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
const createGatherEmbed = async (character, randomItem, bonusItem = null, isDivineItemWithPriestBoost = false, boosterCharacter = null, scholarTargetVillage = null, villageBonusInfo = null, quantity = 1) => {
 const settings = getCommonEmbedSettings(character);
 const action = typeActionMap[randomItem.type[0]]?.action || "found";
 const article = getArticleForItem(randomItem.itemName);

 // Check if this is a Teacher boost for practical wisdom
 const isTeacherBoost = character.boostedBy && boosterCharacter && 
   (boosterCharacter.job === 'Teacher' || boosterCharacter.job?.toLowerCase() === 'teacher');
 
 // Check if this is a Priest boost
 const isPriestBoost = character.boostedBy && boosterCharacter && 
   (boosterCharacter.job === 'Priest' || boosterCharacter.job?.toLowerCase() === 'priest');
 
 // Use divine flavor text if this is a divine item gathered with Priest boost
 // Use noDivine flavor text if Priest boost is active but no divine item was found
 let flavorText;
 if (isDivineItemWithPriestBoost) {
    flavorText = generateDivineItemFlavorText();
 } else if (isPriestBoost && !isDivineItemWithPriestBoost) {
    // Priest boost active but no divine item found - use noDivine messages as main flavor text
    flavorText = generateBoostFlavorText('Priest', 'Gathering', { outcome: 'noDivine' });
 } else if (isTeacherBoost) {
      flavorText = generateTeacherGatheringFlavorText();
 } else {
     flavorText = generateGatherFlavorText(randomItem.type[0]);
 }
 
 // Ensure flavorText is always a string
 if (!flavorText || typeof flavorText !== 'string') {
   flavorText = 'A successful gathering trip!';
 }

  // Get boost information for non-special cases, including Entertainer bonus item name and Scholar target village
  // We always get boostInfo when there's a boost (for footer display), but we handle flavor text separately
  let boostInfo = !isTeacherBoost ? await getBoostInfo(character, 'Gathering') : null;
  if (boostInfo && boostInfo.boosterJob?.toLowerCase() === 'entertainer' && bonusItem?.itemName) {
    // Regenerate the boost flavor text to include the bonus item name
    boostInfo = {
      ...boostInfo,
      boostFlavorText: generateBoostFlavorText('Entertainer', 'Gathering', { bonusItemName: bonusItem.itemName })
    };
  }
  // For Scholar boosts, regenerate flavor text with target village
  if (boostInfo && boostInfo.boosterJob?.toLowerCase() === 'scholar' && scholarTargetVillage) {
    console.log(`[embeds.js]: 📖 Regenerating Scholar boost flavor with target village: ${scholarTargetVillage}`);
    boostInfo = {
      ...boostInfo,
      boostFlavorText: generateBoostFlavorText('Scholar', 'Gathering', { targetRegion: scholarTargetVillage })
    };
    console.log(`[embeds.js]: ✅ New Scholar boost flavor text: ${boostInfo.boostFlavorText}`);
  }
  // For Priest boosts, only add boost flavor text if we haven't already used it as the main flavor text
  // (i.e., only add it when there's a divine item, since noDivine is already the main text)
  if (boostInfo && boostInfo.boosterJob?.toLowerCase() === 'priest') {
    if (isDivineItemWithPriestBoost) {
      // Divine item found - add success message as boost effect
      const outcome = 'success';
      boostInfo = {
        ...boostInfo,
        boostFlavorText: generateBoostFlavorText('Priest', 'Gathering', { outcome })
      };
    } else {
      // No divine item - we already used noDivine as main text, so don't add it again as boost effect
      // Just keep boostInfo for footer display, but don't add boost flavor text
      boostInfo = {
        ...boostInfo,
        boostFlavorText: null
      };
    }
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

 // Ensure description is always a string (Discord embed requirement)
 if (!description || typeof description !== 'string') {
   description = 'A successful gathering trip!';
 }

 const locationPrefix = getLocationPrefix(character);
 const embedColor = getVillageColorByName(character.currentVillage) || settings.color || "#000000";
 const villageImage = getVillageImage(character);
 const thumbnailUrl = isValidImageUrl(randomItem.image) ? randomItem.image : DEFAULT_IMAGE_URL;

 // Build title with quantity if > 1
 let title = `${locationPrefix}: ${character.name} ${action} ${article} ${randomItem.itemName}!`;
 if (quantity > 1) {
   title = `${locationPrefix}: ${character.name} ${action} ${quantity}× ${randomItem.itemName}!`;
 }

 // Add village bonus information to description
 let descriptionWithBonus = description;
 if (villageBonusInfo) {
   const bonusEmoji = villageBonusInfo.level === 2 ? '🏘️' : '🌟';
   const bonusText = villageBonusInfo.bonus === 1 
     ? `\n\n${bonusEmoji} **Village Level ${villageBonusInfo.level} Bonus:** Gathered an extra item!`
     : `\n\n${bonusEmoji} **Village Level ${villageBonusInfo.level} Bonus:** Gathered ${villageBonusInfo.bonus} extra items!`;
   descriptionWithBonus = description + bonusText;
 }

 const embed = new EmbedBuilder()
  .setTitle(title)
  .setDescription(descriptionWithBonus)
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
 
 // Add quantity to footer if > 1 and no village bonus (to avoid redundancy)
 if (quantity > 1 && !villageBonusInfo) {
   footerText += ` | Quantity: ${quantity}`;
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
 originalRoll = null,
 blightRainMessage = null,
 entertainerBoostUnused = false,
 entertainerDamageReduction = 0,
  blightAdjustedRoll = null,
  boostUnused = false
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
 let boostInfo = await getBoostInfo(character, boostCategory);
 
 // Debug logging for boost info
 if (boostInfo) {
  logger.info('BOOST', 'createMonsterEncounterEmbed - Boost info retrieved', {
    source: 'embeds.js',
    boosterJob: boostInfo.boosterJob,
    boosterName: boostInfo.boosterName,
    boostName: boostInfo.boostName,
    category: boostInfo.category
  });
 } else {
   logger.info('LOOT', `No boost info found for character ${character.name}`);
 }

// Modify boost flavor text for Entertainer based on damage taken
 if (boostInfo && boostInfo.boosterJob?.toLowerCase() === 'entertainer' && boostInfo.category === 'Looting') {
  if (entertainerBoostUnused) {
    // No damage taken - boost consumed without applying
    boostInfo = {
      ...boostInfo,
      boostFlavorText: generateUnusedBoostFlavorText('Entertainer', 'Looting')
    };
    console.log(`[embeds.js]: 🎭 Entertainer boost - unused (no damage), consumed`);
   } else if (heartsRemaining !== undefined && heartsRemaining === character.maxHearts) {
     // Damage was fully negated by boost
     boostInfo = {
       ...boostInfo,
       boostFlavorText: "🎭✨ The monster attacked, but your Entertainer's performance dazzled them completely! The attack was negated and you took no damage thanks to the boost!"
     };
     console.log(`[embeds.js]: 🎭 Entertainer boost - damage fully negated`);
   } else if (entertainerDamageReduction > 0) {
     // Damage was partially reduced
     const heartsWord = entertainerDamageReduction === 1 ? 'heart' : 'hearts';
     boostInfo = {
       ...boostInfo,
       boostFlavorText: `🎭✨ The Entertainer's performance reduced the damage by ${entertainerDamageReduction} ${heartsWord}! Without the boost, you would have taken more damage.`
     };
     console.log(`[embeds.js]: 🎭 Entertainer boost - damage reduced by ${entertainerDamageReduction} hearts`);
   }
   // Otherwise use the default looting flavor text (no boost active or no reduction)
 }

// Add flavor for Fortune Teller when reroll boost was active but not needed (no damage taken)
if (boostInfo && boostInfo.boosterJob?.toLowerCase() === 'fortune teller' && boostInfo.category === 'Looting') {
  if (boostUnused) {
    boostInfo = {
      ...boostInfo,
      boostFlavorText: generateUnusedBoostFlavorText('Fortune Teller', 'Looting')
    };
  }
}

 // Add progress indicator if provided
 const progressField = currentMonster && totalMonsters ? {
  name: "⚔️ __Battle Progress__",
  value: `> Fighting monster **${currentMonster}/${totalMonsters}**`,
  inline: true,
 } : null;

 // Add boost flavor text to outcome if available
 let outcomeWithBoost = outcomeMessage || 'No outcome specified.';
 
 // Only show boost flavor text if character actually benefited from the boost
 // Check if character won the encounter (no damage taken, or successful defense/attack)
 const characterWon = !outcomeMessage.includes('💥') && !outcomeMessage.includes('lose') && !outcomeMessage.includes('damage');
 
 if (boostInfo && characterWon) {
   outcomeWithBoost = addBoostFlavorText(outcomeWithBoost, boostInfo);
} else if (boostInfo && !characterWon) {
  // If Fortune Teller improved the roll, consider it helpful even if damage occurred
  const isFortuneTeller = boostInfo.boosterJob?.toLowerCase() === 'fortune teller';
  const ftImproved = isFortuneTeller && originalRoll && actualRoll && actualRoll > originalRoll;
  if (ftImproved) {
    outcomeWithBoost = addBoostFlavorText(outcomeWithBoost, boostInfo);
  } else {
    // Otherwise show the generic 'did not improve' message
    outcomeWithBoost += `\n\n⚡ **Boost Effect:** Your boost was in effect but did not improve results! Better luck next time!`;
  }
}

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

 // Add blight boost information if available (use blightAdjustedRoll if provided, otherwise fallback to actualRoll)
 const blightRollValue = blightAdjustedRoll !== null ? blightAdjustedRoll : actualRoll;
 if (originalRoll && blightRollValue && character.blighted && character.blightStage && blightRollValue > originalRoll) {
   try {
     const blightBoostText = generateBlightRollBoostFlavorText(character.blightStage, originalRoll, blightRollValue);
     outcomeWithBoost += `\n\n${blightBoostText}`;
   } catch (error) {
     console.error(`[embeds.js]: Error generating blight boost text:`, error);
     // Fallback blight boost message
     const improvement = blightRollValue - originalRoll;
     const multiplier = (blightRollValue / originalRoll).toFixed(1);
     outcomeWithBoost += `\n\n💀 **Blight Boost Applied:** Your roll was enhanced from ${originalRoll} to ${blightRollValue} (${multiplier}x multiplier). The corruption within you amplified your combat abilities, making you ${improvement} points stronger than normal.`;
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

 // Add blight rain message if available
 if (blightRainMessage) {
  embed.addFields({
   name: "🌧️ __Blight Rain__",
   value: blightRainMessage,
   inline: false,
  });
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
      `> Use </item:${getItemCommandId()}> or </heal:${getHealCommandId()}> to heal your character.`
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

// (Removed) Fortune Teller boost flavor adjustment was incorrectly placed at module scope
// This logic must live inside the function where boostInfo and boostUnused are defined

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
   `> • Use </item:${getItemCommandId()}> with a healing item\n` +
   `> • Use </heal:${getHealCommandId()}> to request healing from a Healer\n` +
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
         value: `> • Item healing (</item:${getItemCommandId()}>)\n> • Healer request (</heal:${getHealCommandId()}>)\n>`,
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
 status = undefined,
 isDirectHealing = false,
 originalHeartsRequested = null,
 staminaCost = null,
 capturedBoostInfo = null,
 userId = null // Optional: userId to mention in embed title
) => {
 if (!characterToHeal) {
  throw new Error("Character to heal is required.");
 }

 const healerName = healerCharacter?.name || "Any available healer";
 const healerIcon = healerCharacter?.icon || DEFAULT_IMAGE_URL;

 // Refresh healer character to get updated stamina after healing
 let updatedHealer = healerCharacter;
 if (isFulfilled && healerCharacter && healerCharacter._id) {
  try {
   const Character = require('../models/CharacterModel');
   updatedHealer = await Character.findById(healerCharacter._id);
  } catch (error) {
   // Fallback to original character data if refresh fails
   updatedHealer = healerCharacter;
  }
 }

 // Get boost information from healer (boosts are on the healer, not the patient)
 // Use captured boost info if provided (captured before boost was cleared)
 // Otherwise try to get it from the character
 let boostInfo = null;
 if (capturedBoostInfo) {
  // Use captured boost info and generate flavor text if needed
  boostInfo = {
   ...capturedBoostInfo,
   boostFlavorText: capturedBoostInfo.boostFlavorText || generateBoostFlavorText(capturedBoostInfo.boosterJob, 'Healers')
  };
 } else {
  // Fallback: try to get boost info from character (may not work if boost was already cleared)
  boostInfo = updatedHealer ? await getBoostInfo(updatedHealer, 'Healers') : null;
  
  // Fallback: If boostInfo exists but lacks flavor text, generate it manually
  if (boostInfo && !boostInfo.boostFlavorText && boostInfo.boosterJob) {
   boostInfo.boostFlavorText = generateBoostFlavorText(boostInfo.boosterJob, 'Healers');
  }
  
  // Also check if healer has boostedBy but getBoostInfo didn't work - try to get boost status directly
  if (!boostInfo && updatedHealer && updatedHealer.boostedBy && isFulfilled) {
   try {
    const boostStatus = await getCharacterBoostStatus(updatedHealer.name);
    if (boostStatus && boostStatus.category === 'Healers') {
     boostInfo = {
      boosterJob: boostStatus.boosterJob,
      boosterName: boostStatus.boosterName,
      boostName: boostStatus.boostName,
      category: boostStatus.category,
      boostFlavorText: generateBoostFlavorText(boostStatus.boosterJob, 'Healers')
     };
    }
   } catch (error) {
    // Silently fail - boost info is optional
    console.error('[embeds.js] Error getting boost status for healing embed:', error);
   }
  }
 }

 const settings = healerCharacter
  ? getCommonEmbedSettings(healerCharacter)
  : { color: "#4CAF50" }; // Green color for healing theme

 // Handle cancelled state
 if (status === 'cancelled') {
  const embed = new EmbedBuilder()
   .setColor('#9E9E9E')
   .setTitle('❌ Healing Request Cancelled')
   .setDescription(`**${characterToHeal.name}**'s healing request has been cancelled and can no longer be fulfilled.`)
   .setThumbnail(characterToHeal.icon || DEFAULT_IMAGE_URL)
   .addFields(
    {
     name: "__📍 Location__",
     value: `> ${capitalizeFirstLetter(characterToHeal.currentVillage)}`,
     inline: false,
    },
    { 
     name: "__❤️ Requested Hearts__", 
     value: `> ${heartsToHeal}`, 
     inline: false 
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
    }
   )
   .setFooter({
    text: "Request cancelled by requester",
    iconURL: characterToHeal.icon || DEFAULT_IMAGE_URL,
   })
   .setTimestamp();
  setDefaultImage(embed);
  return embed;
 }

 if (isFulfilled) {
  // Build description showing boost bonus if applicable
  let description;
  const boostBonus = originalHeartsRequested !== null && heartsToHeal > originalHeartsRequested 
    ? heartsToHeal - originalHeartsRequested 
    : 0;
  
  if (boostBonus > 0) {
   const originalText = originalHeartsRequested === 1 ? '1 heart' : `${originalHeartsRequested} hearts`;
   const bonusText = boostBonus === 1 ? 'an extra heart' : `${boostBonus} extra hearts`;
   description = `**${healerName}** successfully healed **${characterToHeal.name}**! ${originalText} ${originalHeartsRequested === 1 ? 'was' : 'were'} requested, but ${bonusText} ${boostBonus === 1 ? 'was' : 'were'} healed due to the boost!`;
  } else {
   description = `**${healerName}** successfully healed **${characterToHeal.name}** for ${heartsToHeal} heart${heartsToHeal === 1 ? '' : 's'}!`;
  }

  // Build fields array - all non-inline for better readability
  // Note: Boost flavor text is shown as a separate field below, not in description
  const fields = [];

  // Hearts healed field
  fields.push({
   name: "__❤️ Hearts Healed__",
   value: boostBonus > 0 
     ? `> ${heartsToHeal} (${originalHeartsRequested} requested + ${boostBonus} boost bonus)`
     : `> ${heartsToHeal}`,
   inline: false,
  });

  // Add stamina cost with current/max if provided
  if (staminaCost !== null && updatedHealer) {
   const currentStamina = updatedHealer.currentStamina !== undefined ? updatedHealer.currentStamina : (healerCharacter?.currentStamina !== undefined ? healerCharacter.currentStamina : null);
   const maxStamina = updatedHealer.maxStamina || healerCharacter?.maxStamina || 0;
   if (currentStamina !== null) {
    fields.push({
     name: "__⚡ Stamina Cost__",
     value: `> ${staminaCost} stamina used\n> ${currentStamina}/${maxStamina} remaining`,
     inline: false,
    });
   } else {
    fields.push({
     name: "__⚡ Stamina Cost__",
     value: `> ${staminaCost} stamina used`,
     inline: false,
    });
   }
  }

  // Patient current status
  try {
   const Character = require('../models/CharacterModel');
   const refreshedPatient = await Character.findById(characterToHeal._id);
   if (refreshedPatient) {
    // Check if patient has temporary hearts (exceeds maxHearts)
    const tempHearts = refreshedPatient.tempHearts || 0;
    const currentHearts = refreshedPatient.currentHearts;
    const maxHearts = refreshedPatient.maxHearts;
    let statusText = `> ${currentHearts}/${maxHearts} hearts`;
    if (tempHearts > 0 || currentHearts > maxHearts) {
      // Show temporary hearts if they exist or if current exceeds max
      const tempDisplay = tempHearts > 0 ? tempHearts : (currentHearts - maxHearts);
      statusText = `> ${currentHearts}/${maxHearts} hearts (+${tempDisplay} temporary)`;
    }
    fields.push({
     name: "__💚 Patient Status__",
     value: statusText,
     inline: false,
    });
   }
  } catch (error) {
   // Fallback if refresh fails
   const tempHearts = characterToHeal.tempHearts || 0;
   const currentHearts = characterToHeal.currentHearts;
   const maxHearts = characterToHeal.maxHearts;
   let statusText = `> ${currentHearts}/${maxHearts} hearts`;
   if (tempHearts > 0 || currentHearts > maxHearts) {
     const tempDisplay = tempHearts > 0 ? tempHearts : (currentHearts - maxHearts);
     statusText = `> ${currentHearts}/${maxHearts} hearts (+${tempDisplay} temporary)`;
   }
   fields.push({
    name: "__💚 Patient Status__",
    value: statusText,
    inline: false,
   });
  }

  // Add boost flavor text as a field if available
  // Show boost effect if there's a boost bonus OR if boostInfo exists (even without bonus, like Fortune Teller stamina reduction)
  if (boostBonus > 0 || boostInfo) {
   let boostFlavorText = null;
   
   // Try to get flavor text from boostInfo
   if (boostInfo && boostInfo.boostFlavorText) {
    boostFlavorText = boostInfo.boostFlavorText;
   } else if (boostInfo && boostInfo.boosterJob) {
    // Generate flavor text if we have the job but not the text
    const { generateBoostFlavorText } = require('../modules/flavorTextModule');
    boostFlavorText = generateBoostFlavorText(boostInfo.boosterJob, 'Healers');
   } else if (boostBonus > 0) {
    // If we have a boost bonus but no boostInfo, try to get it directly
    try {
     const { getCharacterBoostStatus } = require('../modules/boostIntegration');
     const { generateBoostFlavorText } = require('../modules/flavorTextModule');
     const boostStatus = await getCharacterBoostStatus(updatedHealer?.name || healerCharacter?.name);
     if (boostStatus && boostStatus.category === 'Healers') {
      boostFlavorText = generateBoostFlavorText(boostStatus.boosterJob, 'Healers');
     }
    } catch (error) {
     // Silently fail
    }
   }
   
   // Add debuff removal info for Priest boost
   if (boostInfo && boostInfo.debuffRemoved && boostInfo.boosterJob === 'Priest') {
    boostFlavorText = boostFlavorText ? `${boostFlavorText}\n\n✨ The patient's debuff has been cleansed and removed.` : '✨ The patient\'s debuff has been cleansed and removed.';
   }
   
   // Add temporary hearts info for Teacher boost
   if (boostInfo && boostInfo.teacherTempHeartsInfo && boostInfo.boosterJob === 'Teacher') {
    const { heartsBefore, heartsAfter, maxHearts, tempHearts } = boostInfo.teacherTempHeartsInfo;
    const tempHeartsText = tempHearts > 0 ? ` (+${tempHearts} temporary)` : '';
    const heartsText = `\n\n💚 **Temporary Hearts:**\n> **${characterToHeal.name}:** ${heartsBefore}/${maxHearts} → ${heartsAfter}/${maxHearts}${tempHeartsText}`;
    
    if (boostFlavorText) {
     boostFlavorText = `${boostFlavorText}${heartsText}`;
    } else {
     boostFlavorText = `💚 Temporary Hearts:${heartsText}`;
    }
   }
   
   // Add stamina recovery info for Scholar boost
   if (boostInfo && boostInfo.scholarStaminaInfo && boostInfo.boosterJob === 'Scholar') {
    const { healerBefore, healerAfter, healerMax, recipientBefore, recipientAfter, recipientMax } = boostInfo.scholarStaminaInfo;
    
    // Scholar boost always grants +1 to both, so always show both
    let staminaText = `\n\n⚡ **Stamina Recovery:**`;
    
    // Show healer stamina recovery
    const healerChanged = healerAfter !== healerBefore;
    if (healerChanged) {
      staminaText += `\n> **${healerCharacter?.name || 'Healer'}:** ${healerBefore}/${healerMax} → ${healerAfter}/${healerMax}`;
    } else if (healerAfter === healerMax) {
      // At max, but still show to indicate boost was applied
      staminaText += `\n> **${healerCharacter?.name || 'Healer'}:** ${healerAfter}/${healerMax} (already at max)`;
    }
    
    // Show recipient stamina recovery
    const recipientChanged = recipientAfter !== recipientBefore;
    if (recipientChanged) {
      staminaText += `\n> **${characterToHeal.name}:** ${recipientBefore}/${recipientMax} → ${recipientAfter}/${recipientMax}`;
    } else if (recipientAfter === recipientMax) {
      // At max, but still show to indicate boost was applied
      staminaText += `\n> **${characterToHeal.name}:** ${recipientAfter}/${recipientMax} (already at max)`;
    }
    
    if (staminaText) {
     boostFlavorText = boostFlavorText ? `${boostFlavorText}${staminaText}` : `⚡ Stamina Recovery:${staminaText}`;
    }
   }
   
   // Only add field if we have flavor text
   if (boostFlavorText) {
    fields.push({
     name: "__⚡ Boost Effect__",
     value: `> ${boostFlavorText}`,
     inline: false,
    });
   }
  }

  // Only add Payment and Request ID if not direct healing
  if (!isDirectHealing) {
   fields.push(
    {
     name: "__💰 Payment__",
     value: `> ${paymentOffered && paymentOffered !== "None" ? paymentOffered : "No payment specified"}`,
     inline: false,
    },
    {
     name: "__🆔 Request ID__",
     value: `> \`${healingRequestId || "N/A"}\``,
     inline: false,
    }
   );
  }

  // Build footer text - use healer character for boost info
  let footerText = "✨ Healing complete";
  footerText = buildFooterText(footerText, updatedHealer || healerCharacter || characterToHeal, boostInfo);

  // Create notification-style title if userId is provided
  const title = userId 
    ? `🔔 Your character **${characterToHeal.name}** has been healed by **${healerName}**!`
    : '✨ Healing Complete';

  const embed = new EmbedBuilder()
   .setColor("#4CAF50") // Green for successful healing
   .setTitle(title)
   .setDescription(description)
   .setThumbnail(healerIcon)
   .addFields(fields)
   .setFooter({
    text: footerText,
    iconURL: healerIcon,
   })
   .setTimestamp();
  setDefaultImage(embed);
  return embed;
 } else {
  // Pending request state
  const embed = new EmbedBuilder()
   .setColor("#FFA500") // Orange for pending
   .setTitle('📝 Healing Request')
   .setDescription(
    healerName !== "Any available healer" 
     ? `**${characterToHeal.name}** is requesting healing from **${healerName}**`
     : `**${characterToHeal.name}** is requesting healing from any available healer`
   )
   .setThumbnail(characterToHeal.icon || DEFAULT_IMAGE_URL)
   .addFields(
    {
     name: "__❤️ Hearts Requested__",
     value: `> ${heartsToHeal}`,
     inline: false,
    },
    {
     name: "__💚 Current Hearts__",
     value: `> ${characterToHeal.currentHearts}/${characterToHeal.maxHearts}`,
     inline: false,
    },
    {
     name: "__📍 Location__",
     value: `> ${capitalizeFirstLetter(characterToHeal.currentVillage)}`,
     inline: false,
    },
    {
     name: "__💰 Payment Offered__",
     value: `> ${paymentOffered && paymentOffered !== "None" ? paymentOffered : "No payment specified"}`,
     inline: false,
    },
    {
     name: "__🆔 Request ID__",
     value: `> \`${healingRequestId}\``,
     inline: false,
    }
   );

  // Build footer text for pending state
  let pendingFooterText = "⏳ Waiting for healer to fulfill request";
  pendingFooterText = buildFooterText(pendingFooterText, characterToHeal, boostInfo);

  embed.setFooter({
   text: pendingFooterText,
   iconURL: characterToHeal.icon || DEFAULT_IMAGE_URL,
  })
  .setTimestamp();
  setDefaultImage(embed);
  return embed;
 }
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
 mode = 'on foot',
 boostFlavor = null
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

 if (boostFlavor) {
  embed.addFields({
   name: '🔮 Boost',
   value: boostFlavor,
   inline: false
  });
 }

 setDefaultImage(embed);
 return embed;
};

// ------------------- Function: createTravelingEmbed -------------------
// Creates an embed for ongoing travel status
const createTravelingEmbed = (character) => {
 const embed = new EmbedBuilder()
  .setDescription(`**${character.name} is traveling** <a:loading:1125545957136793712>`)
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
  const category = formatBoostCategoryName(requestData.category || 'Unknown');
  const boostEffect = requestData.boostEffect || 'No effect specified';
  const village = capitalizeFirstLetter(requestData.village || 'Unknown');
  
  // Get village styling
  const villageColor = getVillageColorByName(village) || '#7289DA';
  const villageEmoji = getVillageEmojiByName(village) || '🏘️';
  
  // Calculate expiration time using provided timestamps when available
  let expiresAt;
  if (status === 'accepted' && requestData.boostExpiresAt) {
    expiresAt = new Date(requestData.boostExpiresAt);
  } else if (status === 'pending' && requestData.expiresAt) {
    expiresAt = new Date(requestData.expiresAt);
  } else if (requestData.boostExpiresAt) {
    expiresAt = new Date(requestData.boostExpiresAt);
  } else {
    // Fallback: 24 hours from now
    expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
  }
  const expiresIn = `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`;

  // Determine status color and emoji
  let statusColor, statusEmoji, statusText;
  switch (status) {
    case 'pending':
      statusColor = '#FFA500'; // Orange
      statusEmoji = '⏳';
      statusText = 'Pending';
      break;
    case 'accepted':
      statusColor = '#4CAF50'; // Green
      statusEmoji = '✅';
      statusText = 'Accepted';
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
    case 'cancelled':
      statusColor = '#808080'; // Gray
      statusEmoji = '🚫';
      statusText = 'Cancelled';
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

  // Teacher Crafting: booster must manually activate both vouchers
  if (requestData.category === 'Crafting' && (requestData.boosterJob || '').toString().toLowerCase() === 'teacher') {
    fields.push({
      name: '📌 **Note**',
      value: '> The booster must **manually activate both** job vouchers: one to accept (e.g. use a voucher to be Teacher), and one before the crafting character uses stamina assistance (use a Job Voucher via `/item` with job Teacher).',
      inline: false
    });
  }

  // Title/description/footer vary by status
  let title;
  let description;
  let footerText;
  if (status === 'pending') {
    title = `⚡ Boost Request Created`;
    description = `**${requestedBy}** has requested a boost from **${booster}**!\n\nThis request will expire in **24 hours** if not accepted.`;
    footerText = `Boost requested by ${requestedBy} • Expires if not accepted`;
  } else if (status === 'accepted') {
    title = `⚡ Boost Request Accepted`;
    description = `**${booster}** has accepted the request for **${requestedBy}**.\n\nThe boost is now active for **24 hours**.`;
    footerText = `Boost accepted by ${booster} • Active until shown expiry`;
  } else if (status === 'fulfilled') {
    title = `⚡ Boost Fulfilled`;
    description = `The requested boost for **${requestedBy}** from **${booster}** has been fulfilled.`;
    footerText = `Boost fulfilled • No longer active`;
  } else if (status === 'cancelled') {
    title = `⚡ Boost Cancelled`;
    description = `The boost request from **${requestedBy}** to **${booster}** was cancelled.`;
    footerText = `Boost cancelled`;
  } else if (status === 'expired') {
    title = `⚡ Boost Request Expired`;
    description = `The boost request from **${requestedBy}** to **${booster}** has expired.`;
    footerText = `Boost request expired`;
  } else {
    title = `⚡ Boost Request`;
    description = `**${requestedBy}** has requested a boost from **${booster}**.`;
    footerText = `Boost request`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(statusColor)
    .setThumbnail(requestData.requestedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-icon.png')
    .addFields(fields)
    .setFooter({ 
      text: `${footerText}`,
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

    logger.success('BOOST', `Updated boost request embed ${requestData.boostRequestId} to status: ${newStatus}`);
    return true;
  } catch (error) {
    logger.error('BOOST', `Error updating boost request embed ${requestData.boostRequestId}`, error);
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
  const category = formatBoostCategoryName(boostData.category || 'Unknown');
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

  const appliedFields = [
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
    },
    {
      name: '📊 **Status**',
      value: `> ${boostData.status || 'accepted'}`,
      inline: true
    },
    {
      name: '🆔 **Boost ID**',
      value: `> \`${boostData.boostRequestId || 'Unknown'}\``,
      inline: true
    }
  ];
  // Teacher Crafting: booster must manually activate both vouchers
  if (boostData.category === 'Crafting' && (boostData.boosterJob || '').toString().toLowerCase() === 'teacher') {
    appliedFields.push({
      name: '📌 **Note**',
      value: '> The booster must **manually activate both** job vouchers: one to accept (e.g. use a voucher to be Teacher), and one before the crafting character uses stamina assistance (use a Job Voucher via `/item` with job Teacher).',
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Boost Applied: ${boostData.boostName || 'Unknown Boost'}`)
    .setDescription(
      `**${boostedBy}** has successfully applied their boost to **${target}**!\n\n` +
      `The boost will remain active for **24 hours** and provide enhanced abilities.`
    )
    .setColor(villageColor)
    .setThumbnail(boostData.boostedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-applied-icon.png')
    .addFields(appliedFields)
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

// ------------------- Function: createWaveEmbed -------------------
// Creates an embed for displaying wave information
const createWaveEmbed = (wave) => {
  const { getVillageEmojiByName } = require('../modules/locationsModule');
  const { capitalizeVillageName } = require('../utils/stringUtils');
  const { WAVE_DIFFICULTY_GROUPS } = require('../modules/waveModule');
  
  const villageName = capitalizeVillageName(wave.village);
  const villageEmoji = getVillageEmojiByName(wave.village) || '';
  const difficultyGroup = WAVE_DIFFICULTY_GROUPS[wave.analytics.difficultyGroup];
  const difficultyName = difficultyGroup ? difficultyGroup.name : wave.analytics.difficultyGroup;
  
  // Get first monster image for thumbnail
  const firstMonster = wave.monsters[0];
  const monsterDetails = monsterMapping && monsterMapping[firstMonster.nameMapping]
    ? monsterMapping[firstMonster.nameMapping]
    : { image: firstMonster.image };
  const monsterImage = monsterDetails.image || firstMonster.image;

  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('🌊 Monster Wave!')
    .setDescription(
      `**A wave of ${wave.analytics.totalMonsters} monsters approaches ${villageName}!**\n` +
      `*Difficulty: ${difficultyName}*\n\n` +
      `🌊 **Waves are like raids, but with multiple monsters in sequence!**\n` +
      `• Fight through all ${wave.analytics.totalMonsters} monsters to win\n` +
      `• Loot is distributed at the end (only for those who joined at the start)\n` +
      `• You must be in ${villageName} to participate\n\n` +
      `</wave:${getWaveCommandId()}> to join the fight!\n` +
      `</item:${getItemCommandId()}> to heal during the wave!`
    )
    .addFields(
      {
        name: `__Wave Details__`,
        value: `👹 **Monsters:** ${wave.analytics.totalMonsters}\n⭐ **Difficulty:** ${difficultyName}\n📍 **Location:** ${villageEmoji} ${villageName}`,
        inline: false
      },
      {
        name: `__Wave ID__`,
        value: `\`\`\`${wave.waveId}\`\`\``,
        inline: false
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();

  // Add first monster image as thumbnail if available
  if (monsterImage && monsterImage !== 'No Image' && isValidImageUrl(monsterImage)) {
    embed.setThumbnail(monsterImage);
  }

  return embed;
};

// ------------------- Function: createWaveVictoryEmbed -------------------
// Creates an embed for when all wave monsters are defeated
const createWaveVictoryEmbed = (wave) => {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 Wave Complete!`)
    .setDescription(`All **${wave.analytics.totalMonsters} monsters** have been defeated! Processing loot distribution... Please stop rolling! ⏳`)
    .setColor('#FFD700')
    .addFields(
      {
        name: `__Wave Summary__`,
        value: `👹 **Monsters Defeated:** ${wave.analytics.totalMonsters}\n👥 **Participants:** ${wave.analytics.participantCount}\n⚔️ **Total Damage:** ${wave.analytics.totalDamage} hearts`,
        inline: false
      }
    )
    .setFooter({ text: 'Loot processing in progress...' })
    .setTimestamp()
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

  return embed;
};

// ------------------- Function: createWaveFailureEmbed -------------------
// Creates an embed for when a wave fails (all participants KO'd)
const createWaveFailureEmbed = (wave) => {
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('💥 Wave Failed!')
    .setDescription(`The wave has been defeated!\n\nAll participants have been knocked out! 💀`)
    .addFields(
      {
        name: `__Wave Summary__`,
        value: `👹 **Monsters Remaining:** ${wave.monsters.length - wave.defeatedMonsters.length}/${wave.analytics.totalMonsters}\n👥 **Participants:** ${wave.analytics.participantCount}\n⚔️ **Total Damage:** ${wave.analytics.totalDamage} hearts`,
        inline: false
      },
      {
        name: `__Failure__`,
        value: `All participants have been knocked out! 💀`,
        inline: false
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: `Wave ID: ${wave.waveId}` })
    .setTimestamp();

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
 EXPLORE_CMD_ID,
 getExploreCommandId,
 setExploreCommandId,
 getWaveCommandId,
 setWaveCommandId,
 getItemCommandId,
 setItemCommandId,
 getHealCommandId,
 setHealCommandId,
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
 addExplorationStandardFields,
 getExplorationPartyCharacterFields,
 addExplorationCommandsField,
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
 createWaveEmbed,
 createWaveVictoryEmbed,
 createWaveFailureEmbed,
 createDailyRollsResetEmbed,
 createEquippedItemErrorEmbed,
 createWeatherTravelRestrictionEmbed,
 createGameOverEmbed,
};





