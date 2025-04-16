// ------------------- Import necessary modules -------------------
const mongoose = require("mongoose");
const { handleError } = require('../utils/globalErrorHandler');
const { fetchCharacterByName } = require("../database/characterService");
const { addItemInventoryDatabase } = require("../utils/inventoryUtils");
const Item = require("../models/ItemModel"); // Import ItemModel directly
require("dotenv").config();

// ------------------- Function to Add Item to Alden's Inventory -------------------
async function addBlueprintVoucherToAlden() {
  try {
    // ------------------- Connect to MongoDB -------------------
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // ------------------- Fetch Alden's Character Data -------------------
    const characterName = "Alden";
    const character = await fetchCharacterByName(characterName);

    if (!character) {
      throw new Error(`❌ Character "${characterName}" not found.`);
    }
    console.log(`✅ Found character: ${character.name}`);

    // ------------------- Fetch the "Blueprint Voucher" Item -------------------
    const itemName = "Blueprint Voucher";

    // 🔹 Fetch the item directly from MongoDB
    let item = await Item.findOne({ itemName: itemName });

    // Final check to ensure item exists
    if (!item) {
      throw new Error(`❌ Item "${itemName}" not found in database.`);
    }
    console.log(`✅ Found item: ${item.itemName} (ID: ${item._id})`);

    // 🔹 Ensure category, type, and subtype are **always valid**
    const safeCategory = Array.isArray(item.category) && item.category.length > 0 ? item.category.join(", ") : "Misc";
    const safeType = Array.isArray(item.type) && item.type.length > 0 ? item.type.join(", ") : "Unknown";
    const safeSubtype = Array.isArray(item.subtype) && item.subtype.length > 0 ? item.subtype.join(", ") : "None";

    console.log(`🛠 Processed fields:`);
    console.log(`   - Category: ${safeCategory} (Type: ${typeof safeCategory})`);
    console.log(`   - Type: ${safeType} (Type: ${typeof safeType})`);
    console.log(`   - Subtype: ${safeSubtype} (Type: ${typeof safeSubtype})`);

    // ------------------- Add 55 of the "Blueprint Voucher" to Alden's Inventory -------------------
    const quantityToAdd = 55;
    const obtainMethod = "Vending"; // Set the obtain method

    console.log("📤 Sending the following data to addItemInventoryDatabase:");
    console.log({
      characterId: character._id,
      itemName: item.itemName,
      quantity: quantityToAdd,
      obtainMethod,
      category: safeCategory,
      type: safeType,
      subtype: safeSubtype,
    });

    // 🔹 Call `addItemInventoryDatabase` ensuring all required arguments are passed
    await addItemInventoryDatabase(
      character._id,  // Character ID
      item.itemName,  // Item Name
      quantityToAdd,  // Quantity
      {},             // Empty interaction to avoid errors
      obtainMethod,   // Obtain Method
      safeCategory,   // Category
      safeType,       // Type
      safeSubtype     // Subtype
    );

    console.log(`✅ Successfully added ${quantityToAdd} "${item.itemName}" to Alden's inventory.`);
  } catch (error) {
    handleError(error, 'addBlueprintVoucherToAlden.js');

    console.error(`❌ Error updating inventory: ${error.message}`);
  } finally {
    // ------------------- Disconnect from MongoDB -------------------
    mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  }
}

// ------------------- Run the Function -------------------
addBlueprintVoucherToAlden();
