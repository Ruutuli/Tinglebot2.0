// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the vending inventory schema -------------------
const vendingInventorySchema = new Schema({
  itemName: { type: String, required: true }, // Item name
  stockQty: { type: Number, required: true }, // Stock quantity
  costEach: { type: Number, required: true }, // Cost per item in points
  pointsSpent: { type: Number, required: true }, // Total points spent
  boughtFrom: { type: String, default: '' }, // Village or source of purchase
  tokenPrice: { type: Number, default: 0 }, // Price in tokens
  artPrice: { type: Number, default: 0 }, // Price in art
  otherPrice: { type: Number, default: 0 }, // Price in other currency
  tradesOpen: { type: Boolean, default: false }, // Whether trades are open
  date: { type: Date, default: Date.now }, // Date of addition
  shopImage: { type: String, default: '' }, // Shop image link
});

// ------------------- Export the VendingInventory schema -------------------
module.exports = vendingInventorySchema;
