// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define the inventory log schema -------------------
// Tracks all item acquisition events (similar to loggedInventory CSV)
// ============================================================================
const inventoryLogSchema = new Schema({
  // ------------------- Character Information -------------------
  characterName: {
    type: String,
    required: true,
    index: true
  },
  characterId: {
    type: Schema.Types.ObjectId,
    ref: 'Character',
    required: true,
    index: true
  },

  // ------------------- Item Information -------------------
  itemName: {
    type: String,
    required: true,
    index: true
  },
  itemId: {
    type: Schema.Types.ObjectId,
    ref: 'Item',
    default: null
  },
  quantity: {
    type: Number,
    required: true
  },

  // ------------------- Item Classification -------------------
  category: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: ''
  },
  subtype: {
    type: String,
    default: ''
  },

  // ------------------- Acquisition Details -------------------
  obtain: {
    type: String,
    required: true,
    index: true
  },
  job: {
    type: String,
    default: ''
  },
  perk: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },

  // ------------------- Reference Information -------------------
  link: {
    type: String,
    default: ''
  },
  dateTime: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  confirmedSync: {
    type: String,
    default: ''
  }
}, {
  timestamps: false // We use our own dateTime field
});

// ============================================================================
// ------------------- Indexes for Performance -------------------
// ============================================================================
inventoryLogSchema.index({ characterName: 1, dateTime: -1 });
inventoryLogSchema.index({ characterId: 1, dateTime: -1 });
inventoryLogSchema.index({ itemName: 1, dateTime: -1 });
inventoryLogSchema.index({ obtain: 1, dateTime: -1 });
inventoryLogSchema.index({ characterName: 1, itemName: 1 });
inventoryLogSchema.index({ category: 1, type: 1 });

// ============================================================================
// ------------------- Static Methods -------------------
// ============================================================================

// ------------------- Get logs for a character -------------------
inventoryLogSchema.statics.getCharacterLogs = async function(characterName, filters = {}) {
  const {
    itemName,
    obtain,
    category,
    type,
    location,
    startDate,
    endDate,
    limit = 1000,
    skip = 0
  } = filters;

  const query = { characterName };
  
  if (itemName) query.itemName = { $regex: new RegExp(itemName, 'i') };
  if (obtain) query.obtain = { $regex: new RegExp(obtain, 'i') };
  if (category) query.category = category;
  if (type) query.type = type;
  if (location) query.location = { $regex: new RegExp(location, 'i') };
  if (startDate || endDate) {
    query.dateTime = {};
    if (startDate) query.dateTime.$gte = new Date(startDate);
    if (endDate) query.dateTime.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ dateTime: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .lean();
};

// ============================================================================
// ------------------- Create and Export Model -------------------
// ============================================================================
const InventoryLog = mongoose.models.InventoryLog || mongoose.model('InventoryLog', inventoryLogSchema);

module.exports = InventoryLog;
