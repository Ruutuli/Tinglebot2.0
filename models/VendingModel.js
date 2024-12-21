// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the vending inventory schema -------------------
const vendingInventorySchema = new Schema({
  characterName: { type: String, required: true },
  itemName: { type: String, required: true },
  stockQty: { type: Number, required: true },
  costEach: { type: Number, required: true },
  pointsSpent: { type: Number, required: true },
  boughtFrom: { type: String, default: '' },
  tokenPrice: { type: Number, required: true },
  artPrice: { type: Number, default: 0 },
  otherPrice: { type: Number, default: 0 },
  tradesOpen: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

// ------------------- Export the VendingInventory model -------------------
const VendingInventory = mongoose.model('VendingInventory', vendingInventorySchema);
module.exports = VendingInventory;

