// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Schema for table roll entries -------------------
const TableRollEntrySchema = new Schema({
  weight: { type: Number, required: true }, // Weight/probability for this entry
  flavor: { type: String, default: '' }, // Flavor text for the entry
  item: { type: String, default: '' }, // Item name or description (optional for flavor-only entries)
  thumbnailImage: { type: String, default: '' } // Image URL for the item
});

// ------------------- Schema for table rolls -------------------
const TableRollSchema = new Schema({
  name: { type: String, required: true, unique: true }, // Name of the table
  description: { type: String, default: '' }, // Description of the table
  entries: { type: [TableRollEntrySchema], required: true }, // Array of table entries
  createdBy: { type: String, required: true }, // Discord user ID who created the table
  createdAt: { type: Date, default: Date.now }, // When the table was created
  updatedAt: { type: Date, default: Date.now }, // When the table was last updated
  isActive: { type: Boolean, default: true }, // Whether the table is active
  totalWeight: { type: Number, default: 0 } // Sum of all weights for quick calculations
}, { collection: 'tablerolls' });

// ------------------- Pre-save middleware to calculate total weight -------------------
TableRollSchema.pre('save', function(next) {
  this.totalWeight = this.entries.reduce((sum, entry) => sum + entry.weight, 0);
  this.updatedAt = new Date();
  next();
});

// ------------------- Add indexes for quick lookup -------------------
TableRollSchema.index({ createdBy: 1 });
TableRollSchema.index({ isActive: 1 });

// ------------------- Static method to roll on a table -------------------
TableRollSchema.statics.rollOnTable = function(tableName) {
  return this.findOne({ name: tableName, isActive: true })
    .then(table => {
      if (!table) {
        throw new Error(`Table '${tableName}' not found or inactive`);
      }
      
      if (table.entries.length === 0) {
        throw new Error(`Table '${tableName}' has no entries`);
      }
      
      // Generate random number between 0 and total weight
      const randomValue = Math.random() * table.totalWeight;
      
      // Find the entry based on weight
      let currentWeight = 0;
      for (const entry of table.entries) {
        currentWeight += entry.weight;
        if (randomValue <= currentWeight) {
          return {
            table: table,
            result: entry,
            rollValue: randomValue
          };
        }
      }
      
      // Fallback to last entry (shouldn't happen with proper weight calculation)
      return {
        table: table,
        result: table.entries[table.entries.length - 1],
        rollValue: randomValue
      };
    });
};

module.exports = mongoose.model('TableRoll', TableRollSchema); 