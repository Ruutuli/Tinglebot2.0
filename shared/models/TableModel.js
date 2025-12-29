const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Schema for storing tables -------------------
const TableSchema = new Schema({
    tableName: { type: String, required: true, unique: true }, // Name of the table (Google Sheets tab name)
    data: { type: [[String]], required: true }, // 2D array storing Weight, Flavor Text, and Item columns
    createdAt: { type: Date, default: Date.now }, // Timestamp for when the table was added
    updatedAt: { type: Date, default: Date.now }, // Timestamp for when the table was last updated
});

// ------------------- Middleware to update timestamps -------------------
TableSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// ------------------- Export the model -------------------
module.exports = mongoose.model('Table', TableSchema);
