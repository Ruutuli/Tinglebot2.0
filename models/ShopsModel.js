// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the ShopStock schema -------------------
const ShopStockSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, required: true, ref: 'Item' },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true, default: 0 },
  buyPrice: { type: Number, required: true },
  sellPrice: { type: Number, required: true }
}, { collection: 'shopStock', timestamps: true, strict: true }); // Enforce strict schema


// ------------------- Export the ShopStock model -------------------
module.exports = mongoose.model('ShopStock', ShopStockSchema);
