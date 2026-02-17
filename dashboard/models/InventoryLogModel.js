// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// ------------------- Define the inventory log schema -------------------
// Tracks all item inventory changes (additions and removals)
// Similar to loggedInventory CSV - quantity can be positive (additions) or negative (removals)
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
    required: true,
    // Positive = item added to inventory (Bought, Quest Reward, etc.)
    // Negative = item removed from inventory (Sold, Traded, Used, etc.)
    validate: {
      validator: function(v) {
        return v !== 0; // Quantity must not be zero
      },
      message: 'Quantity must be positive (addition) or negative (removal)'
    }
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

  // ------------------- Transaction Details -------------------
  // How the item was obtained or removed:
  // Additions: 'Bought', 'Quest Reward', 'Crafting', 'Trade', 'Gift', etc.
  // Removals: 'Sold', 'Traded', 'Used', 'Barter Trade', 'Sold to shop', etc.
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
// Supports filtering by additions, removals, or both
inventoryLogSchema.statics.getCharacterLogs = async function(characterName, filters = {}) {
  const {
    itemName,
    obtain,
    category,
    type,
    location,
    startDate,
    endDate,
    transactionType, // 'addition', 'removal', or undefined (both)
    limit = 1000,
    skip = 0
  } = filters;

  const query = { characterName };
  
  // Exact case-insensitive match for itemName (escape special regex characters)
  if (itemName && typeof itemName === 'string' && itemName.trim().length > 0) {
    const trimmedItemName = itemName.trim();
    const escapedItemName = escapeRegExp(trimmedItemName);
    const regexPattern = `^${escapedItemName}$`;
    query.itemName = { $regex: new RegExp(regexPattern, 'i') };
  } else if (itemName !== undefined && itemName !== null) {
    console.warn("[InventoryLog] itemName filter invalid:", itemName, typeof itemName);
  }
  if (obtain != null) {
    const s = String(obtain).trim();
    if (s.length > 0) {
      query.obtain = { $regex: new RegExp(escapeRegExp(s), 'i') };
    }
  }
  if (category) query.category = category;
  if (type) query.type = type;
  if (location != null) {
    const s = String(location).trim();
    if (s.length > 0) {
      query.location = { $regex: new RegExp(escapeRegExp(s), 'i') };
    }
  }
  if (startDate || endDate) {
    query.dateTime = {};
    if (startDate) query.dateTime.$gte = new Date(startDate);
    if (endDate) query.dateTime.$lte = new Date(endDate);
  }
  
  // Filter by transaction type: addition (positive) or removal (negative)
  if (transactionType === 'addition') {
    query.quantity = { $gt: 0 };
  } else if (transactionType === 'removal') {
    query.quantity = { $lt: 0 };
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
