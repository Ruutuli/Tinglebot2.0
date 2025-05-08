// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { connectToInventories } = require('../database/db');

// ------------------- Define the vending inventory schema -------------------
const vendingInventorySchema = new Schema({
  characterName: { type: String, required: true }, // Character name
  itemName: { type: String, required: true }, // Item name
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, // Reference to Item model
  stockQty: { type: Number, default: 1 }, // Quantity in stock
  costEach: { type: Number, default: 0 }, // Cost in vending points
  pointsSpent: { type: Number, default: 0 }, // Total points spent
  boughtFrom: { type: String }, // Village where item was bought
  tokenPrice: { type: Number, default: 0 }, // Price in tokens
  artPrice: { type: String, default: 'N/A' }, // Price in art
  otherPrice: { type: String, default: 'N/A' }, // Other price type
  tradesOpen: { type: Boolean, default: false }, // Whether trades are open
  slot: { type: String }, // Slot number
  date: { type: Date, default: Date.now } // Date added to inventory
});

// ------------------- Initialize the vending inventory model -------------------
const initializeVendingInventoryModel = async (characterName) => {
  console.log(`[initializeVendingInventoryModel]: Initializing vending inventory model for ${characterName}`);
  const inventoriesConnection = await connectToInventories();

  if (!inventoriesConnection) {
    throw new Error(`[initializeVendingInventoryModel]: Failed to connect to the inventories database.`);
  }
  console.log(`[initializeVendingInventoryModel]: Successfully connected to the inventories database.`);

  // Create a unique model name for each character's vending inventory
  const modelName = `VendingInventory_${characterName.toLowerCase()}`;
  return inventoriesConnection.model(modelName, vendingInventorySchema, characterName.toLowerCase());
};

// ------------------- Define the vending request schema -------------------
const vendingRequestSchema = new Schema({
  fulfillmentId: { type: String, required: true, unique: true },
  userCharacterName: { type: String, required: true },
  vendorCharacterName: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  notes: { type: String },
  buyerId: { type: String, required: true },
  buyerUsername: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

// ------------------- Create and export the VendingRequest model -------------------
const VendingRequest = mongoose.model('VendingRequest', vendingRequestSchema);

module.exports = {
  VendingRequest,
  initializeVendingInventoryModel,
  vendingInventorySchema
};
