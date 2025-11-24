// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { connectToVending } = require('../database/db');

// ------------------- Define the vending stock item schema -------------------
const vendingStockItemSchema = new Schema({
  itemName: { type: String, required: true },
  emoji: { type: String, default: '' },
  points: { type: Number, required: true },
  vendingType: { type: String, required: true },
  itemRarity: { type: Number, default: 1 },
  village: { type: String, required: true }
}, { _id: false });

// ------------------- Define the limited item schema -------------------
const limitedItemSchema = new Schema({
  itemName: { type: String, required: true },
  emoji: { type: String, default: '' },
  points: { type: Number, required: true },
  stock: { type: Number, required: true }
}, { _id: false });

// ------------------- Define the vending stock schema -------------------
const vendingStockSchema = new Schema({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  stockList: {
    type: Map,
    of: [vendingStockItemSchema],
    default: new Map()
  },
  limitedItems: {
    type: [limitedItemSchema],
    default: []
  }
}, { 
  collection: 'vending_stock', 
  timestamps: true,
  strict: false // Allow additional fields like createdAt
});

// ------------------- Initialize the VendingStock model -------------------
const initializeVendingStockModel = async () => {
  const vendingConnection = await connectToVending();

  if (!vendingConnection) {
    throw new Error(`[VendingStockModel]: Failed to connect to the vending database.`);
  }

  // Check if model already exists
  if (vendingConnection.models.VendingStock) {
    return vendingConnection.models.VendingStock;
  }

  return vendingConnection.model('VendingStock', vendingStockSchema);
};

// ------------------- Export the model and initialization function -------------------
module.exports = {
  initializeVendingStockModel,
  vendingStockSchema,
  vendingStockItemSchema,
  limitedItemSchema
};

