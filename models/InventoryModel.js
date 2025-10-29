// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { connectToInventories } = require('../database/db');

// ------------------- Define the inventory schema -------------------
const inventorySchema = new Schema({
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', required: true }, // Reference to Character model
  itemName: { type: String, required: true }, // Item name
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, // Reference to Item model
  quantity: { type: Number, default: 1 }, // Quantity of the item (default to 1)
  category: { type: String }, // Item category
  type: { type: String }, // Item type
  subtype: { type: String }, // Item subtype
  job: { type: String }, // Associated job
  perk: { type: String }, // Associated perk
  location: { type: String }, // Item location
  date: { type: Date }, // Date associated with the item
  craftedAt: { type: Date }, // Date the item was crafted (if applicable)
  gatheredAt: { type: Date }, // Date the item was gathered (if applicable)
  obtain: { type: String, default: '' },
  synced: { type: String, unique: true }, // Unique identifier for synced items
  fortuneTellerBoost: { type: Boolean, default: false } // Tag for items crafted with Fortune Teller boost (sell for 20% more)
});

// ------------------- Initialize the inventory model -------------------
// Initialize the model using the inventories database connection
const initializeInventoryModel = async () => {
  console.log(`[initializeInventoryModel]: Initializing inventory model.`);
  try {
    const inventoriesConnection = await connectToInventories();
    if (!inventoriesConnection) {
      throw new Error(`[initializeInventoryModel]: Failed to connect to the inventories database.`);
    }
    console.log(`[initializeInventoryModel]: Successfully connected to the inventories database.`);

    // Create and return both the model and connection
    const model = inventoriesConnection.model('Inventory', inventorySchema);
    return {
      model,
      connection: inventoriesConnection
    };
  } catch (error) {
    console.error(`[initializeInventoryModel]: Error initializing model:`, error);
    throw error;
  }
};

module.exports = initializeInventoryModel;

