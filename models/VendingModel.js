// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the vending inventory schema -------------------
const vendingInventorySchema = new Schema({
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', required: true }, // ID of the character owning the item
  itemName: { type: String, required: true }, // Name of the vending item
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, // Reference to the item ID
  quantity: { type: Number, default: 1 }, // Quantity of the item
  tokenPrice: { type: Number, default: 0 }, // Price in tokens
  artPrice: { type: String, default: '' }, // Art-related pricing
  otherPrice: { type: String, default: '' }, // Other price types
  tradesOpen: { type: Boolean, default: true }, // Can the item be traded?
  otherNotes: { type: String, default: '' } // Additional notes for the vending item
});

// ------------------- Export the VendingInventory model -------------------
const VendingInventory = mongoose.model('VendingInventory', vendingInventorySchema);
module.exports = VendingInventory;

