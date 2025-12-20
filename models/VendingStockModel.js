// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

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
  year: { type: Number, default: null }, // Make year optional for backward compatibility
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
// Uses the main tinglebot database connection (default mongoose connection)
let VendingStock = null;

const initializeVendingStockModel = async () => {
  // Check if model already exists on the default connection
  if (mongoose.models.VendingStock) {
    return mongoose.models.VendingStock;
  }

  // Create model on the default mongoose connection (tinglebot database)
  VendingStock = mongoose.model('VendingStock', vendingStockSchema);
  return VendingStock;
};

// ------------------- Get the VendingStock model -------------------
const getVendingStockModel = () => {
  if (!VendingStock && mongoose.models.VendingStock) {
    VendingStock = mongoose.models.VendingStock;
  }
  return VendingStock || mongoose.model('VendingStock', vendingStockSchema);
};

// ------------------- Export the model and initialization function -------------------
module.exports = {
  initializeVendingStockModel,
  getVendingStockModel,
  VendingStock: getVendingStockModel,
  vendingStockSchema,
  vendingStockItemSchema,
  limitedItemSchema
};

