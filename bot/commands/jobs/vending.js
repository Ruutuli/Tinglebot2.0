// ============================================================================
// ------------------- Vending Slash Command Router -------------------
// Registers all /vending subcommands and dispatches to handlers.
// ============================================================================

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require("discord.js");

// ------------------- Boost Integration -------------------
const { applyVendingBoost } = require("../../modules/boostIntegration");
const { clearBoostAfterUse } = require("./boosting");

// ------------------- Command Handlers -------------------
const {
 executeVending,
 handleCollectPoints,
 handleRestock,
 handleVendingBarter,
 handleFulfill,
 handleEditShop,
 handleVendingSync,
 handlePouchUpgrade,
 handleVendingSetup,
 handleViewShop,
 handleShopLink,
 viewVendingStock,
} = require("../../handlers/vendingHandler");

// ============================================================================
// ------------------- Slash Command Definition -------------------
// Main command: /vending
// ============================================================================
const command = new SlashCommandBuilder()
 .setName("vending")
 .setDescription("🎪 Manage your vending shop and barters")

 // ------------------- Shop Setup & Management -------------------
 .addSubcommand((sub) =>
  sub
   .setName("setup")
   .setDescription("Set up your vending shop")
 )

 .addSubcommand((sub) =>
  sub
   .setName("pouch")
   .setDescription("Upgrade your shop pouch to get more vending slots")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Your character's name")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("pouchtype")
     .setDescription("The pouch tier you want to upgrade to")
     .setRequired(true)
     .addChoices(
      { name: "Bronze (15 slots) - 1,000 tokens", value: "bronze" },
      { name: "Silver (30 slots) - 5,000 tokens", value: "silver" },
      { name: "Gold (50 slots) - 10,000 tokens", value: "gold" }
     )
   )
 )

 .addSubcommand((sub) =>
  sub
   .setName("restock")
   .setDescription("Restock items to your shop from monthly vending stock")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Your character's name")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("itemname")
     .setDescription("Name of the item to add")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("slot")
     .setDescription('Which slot to add the item to (e.g. "Slot 1")')
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addIntegerOption((opt) =>
    opt.setName("quantity").setDescription("How many to add").setRequired(true)
   )
   .addIntegerOption((opt) =>
    opt.setName("tokenprice").setDescription("Price in tokens (optional)")
   )
   .addStringOption((opt) =>
    opt.setName("artprice").setDescription("Price in art (optional)")
   )
   .addStringOption((opt) =>
    opt.setName("otherprice").setDescription("Other price details (optional)")
   )
 )

 .addSubcommand((sub) =>
  sub
   .setName("edit")
   .setDescription("Edit your shop items or settings")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Your character's name")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("action")
     .setDescription("What would you like to edit?")
     .setRequired(true)
     .addChoices(
      { name: "📝 Edit Item", value: "item" },
      { name: "🖼️ Update Shop Banner", value: "banner" }
     )
   )
   .addStringOption((opt) =>
    opt
     .setName("slot")
     .setDescription("Slot to edit (required for item editing)")
     .setAutocomplete(true)
   )
   .addAttachmentOption((opt) =>
    opt
     .setName("shopimagefile")
     .setDescription(
      "Upload new shop banner image (required for banner update)"
     )
   )
   .addIntegerOption((opt) =>
    opt
     .setName("tokenprice")
     .setDescription("New token price (for item editing)")
   )
   .addStringOption((opt) =>
    opt.setName("artprice").setDescription("New art price (for item editing)")
   )
   .addStringOption((opt) =>
    opt
     .setName("otherprice")
     .setDescription("New other price (for item editing)")
   )
 )

 // ------------------- Viewing & Browsing -------------------
 .addSubcommand((sub) =>
  sub
   .setName("view")
   .setDescription("View a shop's inventory")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Shop owner to view")
     .setRequired(true)
     .setAutocomplete(true)
   )
 )

 .addSubcommand((sub) =>
  sub
   .setName("stock")
   .setDescription("View current month's vending stock by village")
 )

 // ------------------- Trading System -------------------
 .addSubcommand((sub) =>
  sub
   .setName("barter")
   .setDescription("🔄 Buy or barter for items from a shop")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Your character's name")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("vendorcharacter")
     .setDescription("Shop you're bartering with")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("itemname")
     .setDescription("Item you want to barter for")
     .setRequired(true)
     .setAutocomplete(true)
   )
   .addIntegerOption((opt) =>
    opt
     .setName("quantity")
     .setDescription("Quantity to request")
     .setRequired(true)
   )
   .addStringOption((opt) =>
    opt
     .setName("payment_type")
     .setDescription("How you want to pay for the item")
     .setRequired(true)
     .addChoices(
      { name: "💰 Tokens", value: "tokens" },
      { name: "🎨 Art", value: "art" },
      { name: "🔄 Barter", value: "barter" }
     )
   )
   .addStringOption((opt) =>
    opt
     .setName("artlink")
     .setDescription("Link to your art submission (required when payment type is Art)")
   )
   .addStringOption((opt) =>
    opt
     .setName("barter_item_1")
     .setDescription("First item you are offering (required for barter)")
     .setAutocomplete(true)
   )
   .addIntegerOption((opt) =>
    opt
     .setName("barter_item_1_qty")
     .setDescription("Quantity of first barter item (required for barter)")
   )
   .addStringOption((opt) =>
    opt
     .setName("barter_item_2")
     .setDescription("Second item you are offering (optional for barter)")
     .setAutocomplete(true)
   )
   .addIntegerOption((opt) =>
    opt
     .setName("barter_item_2_qty")
     .setDescription("Quantity of second barter item")
   )
   .addStringOption((opt) =>
    opt
     .setName("barter_item_3")
     .setDescription("Third item you are offering (optional for barter)")
     .setAutocomplete(true)
   )
   .addIntegerOption((opt) =>
    opt
     .setName("barter_item_3_qty")
     .setDescription("Quantity of third barter item")
   )
   .addStringOption((opt) =>
    opt.setName("notes").setDescription("Additional notes for the vendor")
   )
 )

 .addSubcommand((sub) =>
  sub
   .setName("accept")
   .setDescription("✅ Accept a pending barter request")
   .addStringOption((opt) =>
    opt
     .setName("fulfillmentid")
     .setDescription("The barter request ID")
     .setRequired(true)
     .setAutocomplete(true)
   )
 )

 .addSubcommand((sub) =>
  sub
   .setName("collect_points")
   .setDescription("Collect your monthly vending points")
   .addStringOption((opt) =>
    opt
     .setName("charactername")
     .setDescription("Your character's name")
     .setRequired(true)
     .setAutocomplete(true)
   )
 );

// ============================================================================
// ------------------- Enhanced Dispatcher Function with Boost Integration -------------------
// Routes interaction to the correct handler based on subcommand with boost support.
// ============================================================================
async function execute(interaction) {
 const subcommand = interaction.options.getSubcommand();
 const characterName = interaction.options.getString("charactername");

 // Apply vending boosts where applicable
 if (
  ["collect_points", "restock", "barter", "accept"].includes(subcommand) &&
  characterName
 ) {
  try {
   const { fetchCharacterByNameAndUserId } = require('../../database/db-bot');
   let character = await fetchCharacterByNameAndUserId(
    characterName,
    interaction.user.id
   );

   // If not found as regular character, try as mod character
   if (!character) {
    const { fetchModCharacterByNameAndUserId } = require('../../database/db-bot');
    character = await fetchModCharacterByNameAndUserId(
     characterName,
     interaction.user.id
    );
   }

   if (character && character.boostedBy) {
    console.log(
     `[vending.js] Character ${character.name} is boosted by ${character.boostedBy} for vending`
    );
    // Store boost info for handlers to use
    interaction.boostInfo = {
     boosterName: character.boostedBy,
     character: character,
    };
   }
  } catch (error) {
   console.error(`[vending.js]: Error checking boost status:`, error);
  }
 }

 switch (subcommand) {
  case "barter":
   return await handleVendingBarterWithBoost(interaction);

  case "accept":
   return await handleFulfillWithBoost(interaction);

  case "edit":
   return await handleEditShop(interaction);

  case "sync":
   return await handleVendingSync(interaction);

  case "pouch":
   return await handlePouchUpgradeWithBoost(interaction);

  case "setup":
   return await handleVendingSetup(interaction);

  case "view":
   return await handleViewShop(interaction);

  case "stock":
   return await viewVendingStock(interaction);

  case "shoplink":
   return await handleShopLink(interaction);

  case "collect_points":
   return await executeVendingWithBoost(interaction);

  case "restock":
   return await handleRestockWithBoost(interaction);

  default:
   return interaction.reply({
    content: "❌ Unknown vending subcommand.",
    ephemeral: true,
   });
 }
}

// ============================================================================
// ------------------- Boost-Enhanced Handler Wrappers -------------------
// ============================================================================

async function executeVendingWithBoost(interaction) {
 try {
  // Apply vending points boost if character is boosted
  if (interaction.boostInfo) {
   const originalResult = await executeVending(interaction);

   // Apply boost to vending points collection
   const character = interaction.boostInfo.character;
   const basePoints = originalResult?.pointsCollected || 0;
   const boostedPoints = await applyVendingBoost(character.name, basePoints);

   return originalResult;
  } else {
   return await executeVending(interaction);
  }
 } catch (error) {
  console.error("[vending.js]: Error in executeVendingWithBoost:", error);
  return await executeVending(interaction);
 }
}

async function handleRestockWithBoost(interaction) {
 try {
  // Apply vending cost reduction boost if character is boosted
  if (interaction.boostInfo) {
   const character = interaction.boostInfo.character;
   if (character.boostedBy) {
    console.log(
     `[vending.js] Applying vending boost to restock for ${character.name}`
    );

    // The boost will be applied within the handler when calculating costs
    const result = await handleRestock(interaction);

    // Clear boost after use
    await clearBoostAfterUse(character, {
      client: interaction.client,
      context: 'vending restock'
    });

    return result;
   }
  }

  return await handleRestock(interaction);
 } catch (error) {
  console.error("[vending.js]: Error in handleRestockWithBoost:", error);
  return await handleRestock(interaction);
 }
}

async function handleVendingBarterWithBoost(interaction) {
 try {
  // Apply vending boost to barter efficiency if character is boosted
  if (interaction.boostInfo) {
   const character = interaction.boostInfo.character;
   if (character.boostedBy) {
    console.log(
     `[vending.js] Applying vending boost to barter for ${character.name}`
    );

    // The boost will be applied within the handler
    const result = await handleVendingBarter(interaction);

    // Clear boost after use
    await clearBoostAfterUse(character, {
      client: interaction.client,
      context: 'vending barter'
    });

    return result;
   }
  }

  return await handleVendingBarter(interaction);
 } catch (error) {
  console.error("[vending.js]: Error in handleVendingBarterWithBoost:", error);
  return await handleVendingBarter(interaction);
 }
}

async function handleFulfillWithBoost(interaction) {
 try {
  // Apply vending boost to fulfillment if vendor is boosted
  const fulfillmentId = interaction.options.getString("fulfillmentid");

  // You'd need to get the vendor character from the fulfillment request
  // and check if they're boosted before applying the boost
  const result = await handleFulfill(interaction);

  return result;
 } catch (error) {
  console.error("[vending.js]: Error in handleFulfillWithBoost:", error);
  return await handleFulfill(interaction);
 }
}

async function handlePouchUpgradeWithBoost(interaction) {
 try {
  // Apply vending boost to pouch upgrade costs if character is boosted
  if (interaction.boostInfo) {
   const character = interaction.boostInfo.character;
   if (character.boostedBy) {
    console.log(
     `[vending.js] Applying vending boost to pouch upgrade for ${character.name}`
    );

    // The boost could reduce upgrade costs
    const result = await handlePouchUpgrade(interaction);

    // Clear boost after use
    await clearBoostAfterUse(character, {
      client: interaction.client,
      context: 'vending pouch upgrade'
    });

    return result;
   }
  }

  return await handlePouchUpgrade(interaction);
 } catch (error) {
  console.error("[vending.js]: Error in handlePouchUpgradeWithBoost:", error);
  return await handlePouchUpgrade(interaction);
 }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
 data: command,
 execute,
};
