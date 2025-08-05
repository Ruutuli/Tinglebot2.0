const { EmbedBuilder } = require("discord.js");
const { handleError } = require("../utils/globalErrorHandler");
const {
 capitalize,
 capitalizeFirstLetter,
 capitalizeWords,
 getRandomColor,
} = require("../modules/formattingModule");
const {
 convertCmToFeetInches,
 isValidImageUrl,
} = require("../utils/validation");
const {
 getVillageColorByName,
 getVillageEmojiByName,
} = require("../modules/locationsModule");
const {
 getNoEncounterMessage,
 typeActionMap,
 generateGatherFlavorText,
 generateCraftingFlavorText,
} = require("../modules/flavorTextModule");
const { getLastDebugValues } = require("../modules/buffModule");
const ItemModel = require("../models/ItemModel");
const Character = require("../models/CharacterModel");
const { monsterMapping } = require("../models/MonsterModel");
const { validateInventorySheet } = require('../utils/googleSheetsUtils')
const { getMountEmoji, getMountThumbnail } = require('../modules/mountModule');

const DEFAULT_EMOJI = "🔹";
const DEFAULT_IMAGE_URL =
 "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";

const regionColors = {
 eldin: "#FF0000",
 lanayru: "#0000FF",
 faron: "#008000",
 central_hyrule: "#00FFFF",
 gerudo: "#FFA500",
 hebra: "#800080",
};

const regionImages = {
 eldin: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
 lanayru:
  "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
 faron: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 central_hyrule:
  "https://storage.googleapis.com/tinglebot/Graphics/Central-Hyrule-Region.png",
 gerudo: "https://storage.googleapis.com/tinglebot/Graphics/Gerudo-Region.png",
 hebra: "https://storage.googleapis.com/tinglebot/Graphics/Hebra-Region.png",
};

const PATH_IMAGES = {
 pathOfScarletLeaves: "https://storage.googleapis.com/tinglebot/psl.png",
 leafDewWay: "https://storage.googleapis.com/tinglebot/ldw.png",
};

const villageEmojis = {
 rudania: "<:rudania:899492917452890142>",
 inariko: "<:inariko:899493009073274920>",
 vhintl: "<:vhintl:899492879205007450>",
};

const pathEmojis = {
 pathOfScarletLeaves: "🍂",
 leafDewWay: "🥬",
};

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

function getArticleForItem(itemName) {
 const vowels = ["A", "E", "I", "O", "U"];
 return vowels.includes(itemName.charAt(0).toUpperCase()) ? "an" : "a";
}

function formatItemDetails(itemName, quantity = 1, emoji = DEFAULT_EMOJI) {
 const truncatedName =
  itemName.length > 20 ? itemName.substring(0, 17) + "..." : itemName;
 const itemNamePadded = truncatedName.padEnd(20, " ");
 const quantityPadded = quantity.toString().padStart(3, " ");
 return `${emoji} \`${itemNamePadded}\` ⨯ \`${quantityPadded}\``;
}

const getCommonEmbedSettings = (character) => {
 const villageColor = getVillageColorByName(
  capitalizeFirstLetter(character.homeVillage)
 );
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

const aggregateItems = (items) => {
 return items.reduce((acc, item) => {
  acc[item.name] = (acc[item.name] || 0) + item.quantity;
  return acc;
 }, {});
};

const formatMaterialsList = (materials) => {
 return materials
  .map((material) => `${material.name} x${material.quantity}`)
  .join(", ");
};

// ------------------- Debuff Embed -------------------
// Creates an embed for when a character is debuffed and cannot use items
const createDebuffEmbed = (character) => {
  // Calculate the debuff expiration date and time
  let debuffExpirationText = '**Midnight EST**';
  
  if (character.debuff?.endDate) {
    const debuffEndDate = new Date(character.debuff.endDate);
    
    // Use the original endDate timestamp directly for Discord display
    const utcTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    
    debuffExpirationText = `<t:${utcTimestamp}:D> (<t:${utcTimestamp}:R>)`;
  }

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('⚠️ Debuff Active ⚠️')
    .setDescription(`**${character.name}** is currently debuffed and cannot use items to heal.`)
    .addFields(
      {
        name: '🕒 Debuff Resets',
        value: debuffExpirationText,
        inline: false
      }
    )
    .setThumbnail(character.icon)
    .setFooter({ text: 'Debuff System' });
  
  return embed;
};

// ------------------- Character Embed -------------------
// Creates a detailed character information embed
const createCharacterEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);

 const homeVillageEmoji = getVillageEmojiByName(character.homeVillage) || "";
 const currentVillageEmoji =
  getVillageEmojiByName(character.currentVillage) || "";

 const heightInFeetInches = character.height
  ? convertCmToFeetInches(character.height)
  : "N/A";

 const embed = new EmbedBuilder()
  .setTitle(
   `${character.name} | ${capitalize(character.race)} | ${capitalizeFirstLetter(
    character.currentVillage
   )} | ${capitalizeFirstLetter(character.job)}`
  )
  .addFields(
   { name: "👤 __Name__", value: `> ${character.name}`, inline: true },
   {
    name: "❤️ __Hearts__",
    value: `> ${character.currentHearts}/${character.maxHearts}`,
    inline: true,
   },
   {
    name: "🟩 __Stamina__",
    value: `> ${character.currentStamina}/${character.maxStamina}`,
    inline: true,
   },
   { name: "🔹 __Pronouns__", value: `> ${character.pronouns}`, inline: true },
   { name: "🔹 __Age__", value: `> ${character.age || "N/A"}`, inline: true },
   {
    name: "🔹 __Height__",
    value: `> ${
     character.height ? `${character.height} cm (${heightInFeetInches})` : "N/A"
    }`,
    inline: true,
   },
   {
    name: "🔹 __Race__",
    value: `> ${capitalize(character.race)}`,
    inline: true,
   },
   {
    name: `🔹 __Home Village__`,
    value: `> ${homeVillageEmoji} ${capitalizeFirstLetter(
     character.homeVillage
    )}`,
    inline: true,
   },
   {
    name: `🔹 __Current Village__`,
    value: `> ${currentVillageEmoji} ${capitalizeFirstLetter(
     character.currentVillage
    )}`,
    inline: true,
   },
   {
    name: "🔹 __Job__",
    value: `> ${capitalizeFirstLetter(character.job)}`,
    inline: true,
   },
   {
    name: "🎫 __Active Job Voucher__",
    value: character.jobVoucher && character.jobVoucherJob
     ? `> ${capitalizeWords(character.jobVoucherJob)}`
     : `> N/A`,
    inline: true,
   },   
   {
    name: "🔹 __Blighted__",
    value: `> ${
     character.blighted ? `Yes (Stage ${character.blightStage})` : "No"
    }`,
    inline: true,
   },
   {
    name: "🔹 __Spirit Orbs__",
    value: `> ${character.spiritOrbs}`,
    inline: true,
   },

   {
    name: "💥 __KO Status__",
    value: `> ${character.ko ? "True" : "False"}`,
    inline: true,
   },

   // Full-width fields below
   {
    name: "📦 __Inventory__",
    value: `> [Google Sheets](${character.inventory})`,
    inline: false,
   },
   {
    name: "🔗 __Application Link__",
    value: `> [Link](${character.appLink})`,
    inline: false,
   }
  )
  .setDescription("📋 Character profile created successfully.")
  .setColor(settings.color)
  .setThumbnail(character.icon)
  .setFooter({ text: "Character details" })
  .setImage(DEFAULT_IMAGE_URL);


 return embed;
};

// ------------------- Subsection Title ------------------- 
const createSimpleCharacterEmbed = (character, description) => {
 const settings = getCommonEmbedSettings(character);

 const embed = new EmbedBuilder()
  .addFields(
   { name: "👤 __Name__", value: character.name, inline: true },
   { name: "🔹 __Pronouns__", value: character.pronouns, inline: true },
   { name: "\u200B", value: "\u200B", inline: true },
   {
    name: "❤️ __Hearts__",
    value: `${character.currentHearts}/${character.maxHearts}`,
    inline: true,
   },
   {
    name: "🟩 __Stamina__",
    value: `${character.currentStamina}/${character.maxStamina}`,
    inline: true,
   }
  )
  .setColor(settings.color)
  .setThumbnail(character.icon)
  .setDescription(description)
  .setTimestamp()
  .setImage(DEFAULT_IMAGE_URL);

 return embed;
};

// ------------------- Subsection Title ------------------- 
const createCharacterGearEmbed = (
 character,
 gearMap,
 type,
 unequippedMessage = ""
) => {
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

 const embed = new EmbedBuilder()
  .setColor(settings.color || "#0099ff")
  .setTitle(
   `${character.name}'s Equipment - 🗡️ ATK +${totalAttack} | 🛡️ DEF +${totalDefense}`
  )
  .addFields(
   {
    name: `__${gearEmojis.head} Head__`,
    value: gearMap.head || "> N/A",
    inline: true,
   },
   {
    name: `__${gearEmojis.chest} Chest__`,
    value: gearMap.chest || "> N/A",
    inline: true,
   },
   {
    name: `__${gearEmojis.legs} Legs__`,
    value: gearMap.legs || "> N/A",
    inline: true,
   },
   {
    name: `__${gearEmojis.weapon} Weapon__`,
    value: gearMap.weapon || "> N/A",
    inline: true,
   },
   { name: "\u200B", value: "\u200B", inline: true },
   {
    name: `__${gearEmojis.shield} Shield__`,
    value: gearMap.shield || "> N/A",
    inline: true,
   }
  )
  .setFooter({
   text: unequippedMessage
    ? `${unequippedMessage}\nGear type: ${type}`
    : `Gear type: ${type}`,
  })
  .setTimestamp()
  .setImage(DEFAULT_IMAGE_URL);

 return embed;
};

// ------------------- Subsection Title ------------------- 
const createVendorEmbed = (character) => {
 if (!character.vendorType) return null;

 const monthName = character.lastCollectedMonth
  ? new Date(0, character.lastCollectedMonth - 1).toLocaleString("default", {
     month: "long",
    })
  : "N/A";

 const embed = new EmbedBuilder()
  .setTitle(`${character.name}'s Shop`)
  .addFields(
   {
    name: "🛒 __Vendor Type__",
    value: `> ${capitalizeFirstLetter(character.vendorType)}`,
    inline: false,
   },
   {
    name: "💰 __Shop Pouch__",
    value: `> ${character.shopPouch || "N/A"}`,
    inline: false,
   },
   {
    name: "🏆 __Vending Points__",
    value: `> ${character.vendingPoints || 0}`,
    inline: false,
   },
   {
    name: "📅 __Last Collection Month__",
    value: `> ${monthName}`,
    inline: false,
   }
  )
  .setColor("#FFD700")
  .setThumbnail(character.icon)
  .setImage(DEFAULT_IMAGE_URL)
  .setFooter({ text: "Vendor details" });

 return embed;
};

// ------------------- Vending Setup Instructions -------------------
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

// ------------------- Subsection Title ------------------- 
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

// ------------------- Subsection Title ------------------- 
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

// ------------------- Subsection Title -------------------
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


// ------------------- Subsection Title -------------------
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

// ------------------- Subsection Title ------------------- 
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

// ------------------- Subsection Title ------------------- 
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

// ------------------- Subsection Title ------------------- 
const createCraftingEmbed = async (
 item,
 character,
 flavorText,
 materialsUsed,
 quantity,
 staminaCost,
 remainingStamina
) => {
 const action = jobActions[character.job] || "crafted";

 const itemQuantityText = ` x${quantity}`;

 const isVisiting =
  character.homeVillage.toLowerCase() !==
  character.currentVillage.toLowerCase();
 const locationPrefix = isVisiting
  ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )} is visiting ${capitalizeWords(character.currentVillage)}`
  : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(
     character.job
    )}`;

 const embedTitle = `${locationPrefix}: ${character.name} ${action} ${item.itemName}${itemQuantityText}`;

 const jobForFlavorText = character.jobVoucher
  ? character.jobVoucherJob
  : character.job;

const craftingFlavorText = generateCraftingFlavorText(
  typeof jobForFlavorText === 'string' ? jobForFlavorText.trim() : ''
);

const combinedFlavorText = flavorText?.trim()
  ? `${craftingFlavorText}\n\n🌟 **Custom Flavor Text:** ${flavorText.trim()}`
  : craftingFlavorText;

 const DEFAULT_EMOJI = ":small_blue_diamond:";
 let craftingMaterialText = "No materials used or invalid data format.";
 if (Array.isArray(materialsUsed) && materialsUsed.length > 0) {
  const formattedMaterials = await Promise.all(
   materialsUsed.map(async (material) => {
    const materialItem = await ItemModel.findOne({
     itemName: material.itemName,
    }).select("emoji");
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
 const updatedStamina = latestCharacter
  ? latestCharacter.currentStamina
  : remainingStamina;

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
    : [
       {
        name: "📜 **__Materials Used__**",
        value: craftingMaterialText,
        inline: false,
       },
      ]),
   { name: "⚡ **__Stamina Cost__**", value: `> ${staminaCost}`, inline: true },
   {
    name: "💚 **__Remaining Stamina__**",
    value: `> ${updatedStamina}`,
    inline: true,
   }
  );

 embed
  .setThumbnail(item.image || 'https://via.placeholder.com/150')
  .setImage("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png")
  .setFooter({ 
    text: character.jobVoucher ? `🎫 Job Voucher activated for ${character.name} to perform the job ${jobForFlavorText}` : 
         character.boostedBy ? `⚡ Boosted by: ${character.boostedBy}` : '✨ Successfully crafted!'
  });

 return embed;
};

// ------------------- Subsection Title ------------------- 
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

// ------------------- Subsection Title ------------------- 
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

// Helper to capitalize first letter
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ------------------- Subsection Title ------------------- 
const createGatherEmbed = (character, randomItem, bonusItem = null) => {
 const settings = getCommonEmbedSettings(character);
 const action = typeActionMap[randomItem.type[0]]?.action || "found";
 const article = getArticleForItem(randomItem.itemName);

 const flavorText = generateGatherFlavorText(randomItem.type[0]);

 // Add bonus item information if present
 let description = flavorText;
 if (bonusItem) {
   const bonusArticle = getArticleForItem(bonusItem.itemName);
   description += `\n\n🎭 **Entertainer's Gift:** ${character.name} also found ${bonusArticle} ${bonusItem.itemName}!`;
 }
 
 // Add Scholar cross-region information if needed
 if (character.boostedBy && character.boostedBy.toLowerCase().includes('scholar')) {
   description += `\n\n📚 **Scholar's Insight:** ${character.name} used their knowledge to gather from afar!`;
 }

 const isVisiting =
  character.homeVillage.toLowerCase() !==
  character.currentVillage.toLowerCase();
 const locationPrefix = isVisiting
  ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )} is visiting ${capitalizeWords(character.currentVillage)}`
  : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(
     character.job
    )}`;

 const embedColor =
  getVillageColorByName(character.currentVillage) ||
  settings.color ||
  "#000000";

 const villageImages = {
  Inariko:
   "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
  Rudania:
   "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
  Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 };

 const villageImage =
  villageImages[capitalizeWords(character.currentVillage)] || DEFAULT_IMAGE_URL;

 const thumbnailUrl = isValidImageUrl(randomItem.image)
  ? randomItem.image
  : DEFAULT_IMAGE_URL;

 const embed = new EmbedBuilder()
  .setTitle(
   `${locationPrefix}: ${character.name} ${action} ${article} ${randomItem.itemName}!`
  )
  .setDescription(description)
  .setColor(embedColor)
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: character.icon || DEFAULT_IMAGE_URL,
   url: character.inventory || "",
  })
  .setThumbnail(thumbnailUrl)
  .setImage(villageImage); // Use the village-specific image

 // Add voucher info to footer if active
 if (character.jobVoucher && character.jobVoucherJob) {
  embed.setFooter({ text: `🎫 Job Voucher in use: ${character.jobVoucherJob}` });
 } else if (character.boostedBy) {
  // Add boost indicator to footer
  embed.setFooter({ text: `⚡ Boosted by: ${character.boostedBy}` });
 }

 return embed;
};

// ------------------- Subsection Title ------------------- 
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
  .map(
   ({ itemName, quantity, itemIcon }) =>
    `${formatItemDetails(String(itemName), quantity, itemIcon)}`
  )
  .join("\n");

 // Fix iconURL for footer: only set if non-empty and looks like a URL
 let safeFooterIcon = toCharacterIcon && /^https?:\/\//.test(toCharacterIcon) ? toCharacterIcon : undefined;

 return new EmbedBuilder()
  .setColor(fromSettings.color)
  .setAuthor({
   name: `${fromCharacter.name} 🔗`,
   iconURL: fromSettings.author.iconURL,
   url: fromSettings.author.url,
  })
  .setTitle("✬ Item Transfer ✬")
  .setDescription(`**${fromCharacter.name}** ➡️ **[${toCharacter.name}](${toInventoryLink})🔗**`)
  .addFields({ name: "__Items__", value: formattedItems, inline: false })
  .setFooter({ text: toCharacter.name, iconURL: safeFooterIcon })
  .setImage(fromSettings.image.url);
};

// ------------------- Subsection Title ------------------- 
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
  .map(
   ({ itemName, quantity, itemIcon }) =>
    `${formatItemDetails(itemName, quantity, itemIcon)}`
  )
  .join("\n");

 return new EmbedBuilder()
  .setColor(fromSettings.color)
  .setAuthor({
   name: `${fromCharacter.name} 🔗`,
   iconURL: fromSettings.author.iconURL,
   url: fromSettings.author.url,
  })
  .setTitle("✬ Gift ✬")
  .setDescription(
   `**${fromCharacter.name}** ➡️ **[${toCharacter.name}](${toInventoryLink})🔗**`
  )
  .addFields({ name: "__Items__", value: formattedItems, inline: false })
  .setFooter({ text: toCharacter.name, iconURL: toCharacterIcon })
  .setImage(fromSettings.image.url);
};

// ------------------- Subsection Title ------------------- 
const createTradeEmbed = async (
 fromCharacter,
 toCharacter,
 fromItems,
 toItems,
 messageUrl
) => {
 const settingsFrom = getCommonEmbedSettings(fromCharacter);
 const fromItemsDescription = fromItems
  .map((item) => {
    const emoji = item.emoji || DEFAULT_EMOJI;
    return `${emoji} **${item.name}** x ${item.quantity}`;
  })
  .join("\n");
 const toItemsDescription =
  toItems.length > 0
   ? toItems
      .map((item) => {
        const emoji = item.emoji || DEFAULT_EMOJI;
        return `${emoji} **${item.name}** x ${item.quantity}`;
      })
      .join("\n")
   : "No items offered";

 // Fix iconURL for footer: only set if non-empty and looks like a URL
 let safeFooterIcon = toCharacter.icon && /^https?:\/\//.test(toCharacter.icon) ? toCharacter.icon : undefined;
 return new EmbedBuilder()
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
    value: fromItemsDescription || "No items offered",
    inline: true,
   },
   {
    name: `__${toCharacter.name} offers__`,
    value: toItemsDescription || "No items offered",
    inline: true,
   }
  )
  .setFooter({ text: toCharacter.name, iconURL: safeFooterIcon })
  .setImage(settingsFrom.image.url);
};

// ------------------- Subsection Title ------------------- 
const createMonsterEncounterEmbed = (
 character,
 monster,
 outcomeMessage,
 heartsRemaining,
 lootItem,
 isBloodMoon = false,
 actualRoll = null,
 currentMonster = null,
 totalMonsters = null
) => {
 const settings = getCommonEmbedSettings(character) || {};
 const nameMapping = monster.nameMapping || monster.name;
 const monsterDetails = monsterMapping[nameMapping.replace(/\s+/g, "")] || {
  name: monster.name,
  image: "https://via.placeholder.com/100x100",
 };

 const authorIconURL =
  settings.author?.iconURL || "https://via.placeholder.com/100x100";

 const koMessage =
  heartsRemaining === 0
   ? "\n> 💥 **KO! You have been defeated and can't continue!**"
   : "";

 const embedColor =
  getVillageColorByName(character.currentVillage) || "#000000";

 const villageImages = {
  Inariko:
   "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
  Rudania:
   "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
  Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 };

 const villageImage =
  villageImages[capitalizeWords(character.currentVillage)] ||
  "https://via.placeholder.com/100x100";

 // Add progress indicator if provided
 const progressField = currentMonster && totalMonsters ? {
  name: "⚔️ __Battle Progress__",
  value: `> Fighting monster **${currentMonster}/${totalMonsters}**`,
  inline: true,
 } : null;

 const embed = new EmbedBuilder()
  .setColor(isBloodMoon ? "#FF4500" : embedColor)
  .setTitle(
   `${character.name} encountered a ${
    monsterDetails.name || monster.name
   }!`
  )
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: authorIconURL,
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
  value: `> ${outcomeMessage || "No outcome specified."}${koMessage}`,
  inline: false,
 });

 embed.setFooter({
  text: `Tier: ${monster.tier}${
   isBloodMoon ? " 🔴 Blood Moon Encounter" : ""
  }${character.jobVoucher && character.jobVoucherJob ? ` | 🎫 Job Voucher in use: ${character.jobVoucherJob}` : ""}${
   character.boostedBy ? ` | ⚡ Boosted by: ${character.boostedBy}` : ""
  }`,
  iconURL: authorIconURL,
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

 if (isValidImageUrl(monsterDetails.image)) {
  embed.setThumbnail(monsterDetails.image);
 } else {
  embed.setThumbnail("https://via.placeholder.com/100x100");
 }

 // Set the default image for loot embeds
 embed.setImage(DEFAULT_IMAGE_URL);

 return embed;
};

// ------------------- Subsection Title ------------------- 
const createNoEncounterEmbed = (character, isBloodMoon = false) => {
 const settings = getCommonEmbedSettings(character);

 const noEncounterMessage = getNoEncounterMessage(character.currentVillage);

 const isVisiting =
  character.homeVillage.toLowerCase() !==
  character.currentVillage.toLowerCase();
 const locationPrefix = isVisiting
  ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )} is visiting ${capitalizeWords(character.currentVillage)}`
  : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(
     character.job
    )}`;

 const embedColor = isBloodMoon
  ? "#FF4500"
  : isVisiting
  ? getVillageColorByName(character.currentVillage) || "#000000"
  : settings.color || "#000000";

 const villageImages = {
  inariko:
   "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
  rudania:
   "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
  vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
 };

 const villageImage =
  villageImages[character.currentVillage.toLowerCase()] ||
  "https://via.placeholder.com/100x100";

 const authorOptions = { name: `${character.name} 🔗` };
 if (settings.author && typeof settings.author.iconURL === "string") {
  authorOptions.iconURL = settings.author.iconURL;
 }
 if (settings.author && typeof settings.author.url === "string") {
  authorOptions.url = settings.author.url;
 }

 return new EmbedBuilder()
  .setColor(embedColor)
  .setTitle(`${locationPrefix}: ${character.name} encountered no monsters.`)
  .setAuthor(authorOptions)
  .addFields({
   name: "🔹 __Outcome__",
   value: `> ${noEncounterMessage}`,
   inline: false,
  })
  .setImage(villageImage)
  .setFooter({
   text: isBloodMoon
    ? "🔴 The Blood Moon rises... but nothing stirs in the shadows."
    : character.jobVoucher && character.jobVoucherJob 
    ? `🎫 No monsters encountered, job voucher for ${character.jobVoucherJob} remains active!`
    : "A quiet day in the village.",
  });
};

// ------------------- Subsection Title ------------------- 
const createKOEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);

 const isVisiting = character.homeVillage !== character.currentVillage;
 const locationPrefix = isVisiting
  ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )} is visiting ${capitalizeWords(character.currentVillage)}`
  : `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )}`;

 return new EmbedBuilder()
  .setColor("#FF0000") // Set to red
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author.iconURL,
   url: settings.author.url,
  })
  .setTitle(`💥 ${locationPrefix}: ${character.name} is KO'd!`)
  .setDescription(
   `> KO status can only be healed by fairies or Healers.\n` +
    `> Use </itemheal:1306176789755858979> or </heal request:1306176789755858977> to heal your character.`
  )
  .setImage(
   "https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png"
  );
};

// ------------------- Function: createWrongVillageEmbed -------------------
// Creates an embed for wrong village location messages
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
  
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setColor(0xFF0000)
    .setImage({
      url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
    })
    .setFooter({
      text: isEscort ? 'For escort quests, characters must travel to the destination village to complete the quest.' : 'Characters must be in their home village to complete Help Wanted quests.'
    })
    .setTimestamp();
}

// ------------------- Function: createRaidKOEmbed -------------------
// Creates an embed for characters who are KO'd and cannot participate in raids
const createRaidKOEmbed = (character) => {
 const settings = getCommonEmbedSettings(character);

 const isVisiting = character.homeVillage !== character.currentVillage;
 const locationPrefix = isVisiting
  ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )} is visiting ${capitalizeWords(character.currentVillage)}`
  : `${capitalizeWords(character.homeVillage)} ${capitalizeWords(
     character.job
    )}`;

 return new EmbedBuilder()
  .setColor("#FF0000") // Red for KO status
  .setAuthor({
   name: `${character.name} 🔗`,
   iconURL: settings.author.iconURL,
   url: settings.author.url,
  })
  .setTitle(`💥 ${locationPrefix}: ${character.name} Cannot Join Raid!`)
  .setDescription(
   `> **${character.name} is KO'd and cannot participate in raids.**\n\n` +
   `> **To heal your character and join raids:**\n` +
   `> • Use </itemheal:1306176789755858979> with a healing item\n` +
   `> • Use </heal request:1306176789755858977> to request healing from a Healer\n` +
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
    value: `> • Item healing (</itemheal:1306176789755858979>)\n> • Healer request (</heal request:1306176789755858977>)\n>`,
    inline: false,
   }
  )
  .setImage(
   "https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png"
  );
};

// ------------------- Subsection Title ------------------- 
const createHealEmbed = (
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
  embed
   .setTitle('✅ Healing Request Fulfilled')
   .setDescription(
    `> ${healerName} has healed your character for ${heartsToHeal} hearts!`)
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
   )
   .setFooter({
    text: "Healing process successfully completed.",
    iconURL: healerCharacter ? healerIcon : null,
   })
   .setImage(DEFAULT_IMAGE_URL);
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
   )
   .setFooter({
    text: "Waiting for a healer to fulfill this request.",
    iconURL: healerCharacter ? healerIcon : null,
   })
   .setImage(DEFAULT_IMAGE_URL);
 }
 return embed;
};

// ------------------- Subsection Title ------------------- 
const createTravelMonsterEncounterEmbed = (
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
  )
  .addFields({
   name: "🔹 __Outcome__",
   value: `> ${outcomeMessage}`,
   inline: false,
  })
  .setFooter({ text: `Tier: ${monster.tier}` })
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

 if (isValidImageUrl(monsterDetails.image)) {
  embed.setThumbnail(monsterDetails.image);
 } else {
  embed.setThumbnail("https://via.placeholder.com/100x100");
 }

 // Set the default image for loot embeds
 embed.setImage(DEFAULT_IMAGE_URL);

 return embed;
};

// ------------------- Subsection Title ------------------- 
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
 let staminaLine = `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
 if (mode === 'on mount' && mount) {
   staminaLine = `**🥕 __${mount.name}'s Stamina:__** ${mount.currentStamina}/${mount.stamina}`;
 }
 return new EmbedBuilder()
  .setTitle(
   `**${
    character.name
   }** is traveling from ${startEmoji} **${capitalizeFirstLetter(
    startingVillage
   )}** to ${destEmoji} **${capitalizeFirstLetter(destination)}**.`
  )
  .setDescription(
   `**Travel Path:** ${paths
    .map(
     (path) =>
      `${pathEmojis[path]} ${capitalizeWords(
       path.replace(/([a-z])([A-Z])/g, "$1 $2")
      )}`
    )
    .join(
     ", "
    )}\n**Total Travel Duration:** ${totalTravelDuration} days\n**❤️ __Hearts:__** ${
    character.currentHearts
   }/${character.maxHearts}\n${staminaLine}`
  )
  .setColor("#AA926A")
  .setAuthor({ name: "Travel Announcement", iconURL: character.icon })
  .setImage(DEFAULT_IMAGE_URL)
  .setTimestamp();
};

// ------------------- Subsection Title ------------------- 
const createTravelingEmbed = (character) => {
 return new EmbedBuilder()
  .setDescription(
   `**${character.name} is traveling** <a:loading:1260369094151114852>`
  )
  .setImage(DEFAULT_IMAGE_URL)
  .setColor("#AA926A")
  .setTimestamp();
};

// ------------------- Subsection Title ------------------- 
const createSafeTravelDayEmbed = (
 character,
 day,
 totalTravelDuration,
 pathEmoji,
 currentPath
) => {
 const description = `🌸 **It's a nice and safe day of traveling.** What do you want to do next?\n- ❤️ Recover a heart (costs 1 🟩 stamina)\n- 🌿 Gather (costs 1 🟩 stamina)\n- 💤 Do 
 nothing (move onto the next day)`;

 return new EmbedBuilder()
  .setAuthor({
   name: `🗺️ Day ${day}/${totalTravelDuration} of travel on ${pathEmoji} ${capitalizeWords(
    currentPath.replace(/([a-z])([A-Z])/g, "$1 $2")
   )}`,
   iconURL: character.icon,
  })
  .setTitle(`**${character.name}** is traveling`)
  .setDescription(
   `${description}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
  )
  .setColor("#AA926A")
  .setImage(PATH_IMAGES[currentPath] || DEFAULT_IMAGE_URL)
  .setTimestamp();
};



// ------------------- Subsection Title ------------------- 
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

// Create an embed for mount encounters
function createMountEncounterEmbed(encounter) {
    const mountEmoji = getMountEmoji(encounter.mountType);
    const mountThumbnail = getMountThumbnail(encounter.mountType);
    const villageWithEmoji = `${getVillageEmojiByName(encounter.village)} ${capitalizeFirstLetter(encounter.village)}`;
    const allVillageMounts = ['Horse', 'Donkey', 'Mule']; // Add any other mounts that can be kept by anyone

    return new EmbedBuilder()
        .setTitle(`${mountEmoji} 🌟 ${encounter.mountLevel} Level ${encounter.mountType} Encounter!`)
        .setDescription(`🐾 A **${encounter.mountLevel} level ${encounter.mountType}** has been spotted in **${villageWithEmoji}**!\n\nTo join the encounter, use </
        mount:1306176789755858983>.`)
        .addFields(
            {
                name: '📜 Encounter Information',
                value:
                    `> You will need **Tokens** for this game if you succeed!\n\n` +
                    `Use the command below to join:\n` +
                    `\`\`\`/mount encounterid:${encounter.encounterId} charactername:\`\`\``,
                inline: false,
            },
            {
                name: '🏠 Village',
                value: allVillageMounts.includes(encounter.mountType)
                    ? `> 🏠 This mount can be kept by anyone in **any village**, but only those currently in **${villageWithEmoji}** can participate!`
                    : `> ❗ This mount can only be kept by villagers from **${villageWithEmoji}**, and only those currently in **${villageWithEmoji}** can participate!`,
                inline: false,
            }
        )
        .setThumbnail(mountThumbnail || '')
        .setColor(0xAA926A)
        .setFooter({ text: '⏳ Wait a minute before rolling again or let others participate.' })
        .setTimestamp();
}

// ------------------- Function: createBoostRequestEmbed -------------------
const createBoostRequestEmbed = (requestData, existingRequestId = null) => {
  const { generateUniqueId } = require('../utils/uniqueIdUtils');
  const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');
  const { getVillageColorByName, getVillageEmojiByName } = require('../modules/locationsModule');

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

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Boost Request Created`)
    .setDescription(
      `**${requestedBy}** has requested a boost from **${booster}**!\n\n` +
      `This request will expire in **24 hours** if not accepted.`
    )
    .setColor(villageColor)
    .setThumbnail(requestData.requestedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-icon.png')
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .addFields(
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
      },
      {
        name: '🆔 **Request ID**',
        value: `> \`${requestId}\``,
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
    )
    .setFooter({ 
      text: `This request will expire in 24 hours if not accepted.`,
      iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/clock-icon.png'
    })
    .setTimestamp();

  return embed;
};

// ------------------- Function: createBoostAppliedEmbed -------------------
const createBoostAppliedEmbed = (boostData) => {
  const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');
  const { getVillageColorByName, getVillageEmojiByName } = require('../modules/locationsModule');

  // Format the data with proper capitalization
  const boostedBy = capitalizeFirstLetter(boostData.boostedBy || 'Unknown');
  const boosterJob = capitalizeWords(boostData.boosterJob || 'Unknown');
  const target = capitalizeFirstLetter(boostData.target || 'Unknown');
  const category = capitalizeFirstLetter(boostData.category || 'Unknown');
  const effect = boostData.effect || 'No effect specified';
  const village = capitalizeFirstLetter(boostData.village || 'Unknown');
  
  // Get village styling
  const villageColor = getVillageColorByName(village) || '#00cc99';
  const villageEmoji = getVillageEmojiByName(village) || '🏘️';
  
  // Calculate expiration time (24 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const expiresIn = `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`;

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Boost Applied: ${boostData.boostName || 'Unknown Boost'}`)
    .setDescription(
      `**${boostedBy}** has successfully applied their boost to **${target}**!\n\n` +
      `The boost will remain active for **24 hours** and provide enhanced abilities.`
    )
    .setColor(villageColor)
    .setThumbnail(boostData.boostedByIcon || 'https://storage.googleapis.com/tinglebot/Graphics/boost-applied-icon.png')
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .addFields(
      {
        name: '🎭 **Boosted By**',
        value: `> ${boostedBy}`,
        inline: true
      },
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
        name: '🏘️ **Village**',
        value: `> ${villageEmoji} ${village}`,
        inline: true
      },
      {
        name: '⏰ **Duration**',
        value: `> 24 hours`,
        inline: true
      },
      {
        name: '⚡ **Boost Effect**',
        value: `> ${effect}`,
        inline: false
      },
      {
        name: '⏰ **Expires**',
        value: `> ${expiresIn}`,
        inline: false
      },
      {
        name: '💚 **Stamina Cost**',
        value: `> 1 stamina used`,
        inline: false
      }
    )
    .setFooter({ 
      text: `Boost fulfilled by ${boostedBy} and will last 24 hours`,
      iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/boost-success-icon.png'
    })
    .setTimestamp();

  return embed;
};

module.exports = {
 DEFAULT_EMOJI,
 DEFAULT_IMAGE_URL,
 jobActions,
 regionColors,
 regionImages,
 PATH_IMAGES,
 villageEmojis,
 pathEmojis,
 getArticleForItem,
 formatItemDetails,
 getCommonEmbedSettings,
 aggregateItems,
 formatMaterialsList,
 createDebuffEmbed,
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
 createBoostAppliedEmbed,
};
