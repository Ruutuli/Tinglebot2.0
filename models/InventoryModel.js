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
  obtain: { type: String, default: '' },
  synced: { type: String, unique: true } // Unique identifier for synced items
});

// ------------------- Initialize the inventory model -------------------
// Initialize the model using the inventories database connection
const initializeInventoryModel = async () => {
  console.log(`[initializeInventoryModel]: Initializing inventory model.`);
  const inventoriesConnection = await connectToInventories();

  if (!inventoriesConnection) {
      throw new Error(`[initializeInventoryModel]: Failed to connect to the inventories database.`);
  }
  console.log(`[initializeInventoryModel]: Successfully connected to the inventories database.`);

  return inventoriesConnection.model('Inventory', inventorySchema);
};


module.exports = initializeInventoryModel;

