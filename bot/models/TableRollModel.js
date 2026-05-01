// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Schema for table roll entries -------------------
const TableRollEntrySchema = new Schema({
  weight: { 
    type: Number, 
    required: true, 
    min: 0.1, // Minimum weight to prevent zero-weight entries
    default: 1 
  },
  flavor: { 
    type: String, 
    default: '', 
    maxlength: 2000 // Prevent extremely long flavor text
  },
  item: { 
    type: String, 
    default: '', 
    maxlength: 500 // Prevent extremely long item names
  },
  thumbnailImage: { 
    type: String, 
    default: '',
    validate: {
      validator: function(v) {
        // Lenient URL validation - same logic as CSV parser
        if (!v) return true; // Empty is allowed
        
        // Check if it looks like a URL (starts with http/https or contains common URL patterns)
        const urlPattern = /^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/;
        if (!urlPattern.test(v.trim())) {
          return true; // If it doesn't look like a URL, consider it valid (probably just text)
        }
        
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format for thumbnail image'
    }
  },

  rollCount: {
    type: Number,
    default: 0,
    min: 0
  }
});

// ------------------- Schema for table rolls -------------------
const TableRollSchema = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    maxlength: 100,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s\-_]+$/.test(v); // Only alphanumeric, spaces, hyphens, underscores
      },
      message: 'Table name can only contain letters, numbers, spaces, hyphens, and underscores'
    }
  },

  entries: { 
    type: [TableRollEntrySchema], 
    required: true,
    validate: {
      validator: function(entries) {
        return entries && entries.length > 0;
      },
      message: 'Table must have at least one entry'
    }
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  isActive: { 
    type: Boolean, 
    default: true
  },
  totalWeight: { 
    type: Number, 
    default: 0,
    min: 0
  },



  // If non-empty, character must be stationed in one of these villages (normalized name) to roll
  allowedVillages: {
    type: [String],
    default: [],
    validate: {
      validator(arr) {
        if (!Array.isArray(arr)) return false;
        return arr.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 32);
      },
      message: 'allowedVillages must be strings',
    },
  },

  maxRollsPerDay: {
    type: Number,
    default: 0, // 0 means unlimited
    min: 0
  },
  dailyRollCount: {
    type: Number,
    default: 0,
    min: 0
  },
  dailyRollReset: {
    type: Date,
    default: Date.now
  },

  /** Lifetime count of successful rolls (Discord /tableroll, Blupee table, etc.). */
  totalRollCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { 
  collection: 'tablerolls',
  timestamps: true // Automatically manage createdAt and updatedAt
});

// ------------------- Indexes for performance -------------------
TableRollSchema.index({ createdBy: 1 });
TableRollSchema.index({ isActive: 1 });
TableRollSchema.index({ name: 'text' }); // Text search index
TableRollSchema.index({ createdAt: -1 });

// ------------------- Pre-save middleware to calculate total weight -------------------
TableRollSchema.pre('save', function(next) {
  this.totalWeight = this.entries.reduce((sum, entry) => sum + (entry.weight || 1), 0);
  this.updatedAt = new Date();
  
  // Reset daily roll count if it's a new day
  if (this.dailyRollReset) {
    const now = new Date();
    const resetDate = new Date(this.dailyRollReset);
    if (now.getDate() !== resetDate.getDate() || 
        now.getMonth() !== resetDate.getMonth() || 
        now.getFullYear() !== resetDate.getFullYear()) {
      this.dailyRollCount = 0;
      this.dailyRollReset = now;
    }
  }
  
  next();
});

// ------------------- Pre-validate middleware -------------------
TableRollSchema.pre('validate', function(next) {
  // Ensure entries have valid weights
  if (this.entries) {
    this.entries = this.entries.filter(entry => entry.weight > 0);
  }
  next();
});

// ------------------- Static methods -------------------

// ------------------- Roll on a table with enhanced features -------------------
/** Calendar day key using the same local-date semantics as table dailyRollReset (server timezone). */
function getTableRollCalendarDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tableRollDailyMapKey(tableName) {
  return `tr:${String(tableName).trim()}`;
}

function ensureCharacterDailyRollMap(character) {
  if (!character.dailyRoll) {
    character.dailyRoll = new Map();
    return;
  }
  if (!(character.dailyRoll instanceof Map)) {
    const plain = character.dailyRoll;
    character.dailyRoll = new Map(
      plain && typeof plain === 'object' ? Object.entries(plain) : []
    );
  }
}

function parseTableRollDailyState(raw) {
  if (raw == null) return { dayKey: '', count: 0 };
  if (typeof raw === 'object' && raw !== null && 'd' in raw && 'c' in raw) {
    return { dayKey: String(raw.d || ''), count: Math.max(0, Number(raw.c) || 0) };
  }
  return { dayKey: '', count: 0 };
}

TableRollSchema.statics.rollOnTable = async function (tableName, options = {}) {
  const character = options.character || null;

  const table = await this.findOne({ name: tableName, isActive: true });
  if (!table) {
    throw new Error(`Table '${tableName}' not found or inactive`);
  }

  if (table.entries.length === 0) {
    throw new Error(`Table '${tableName}' has no entries`);
  }

  const todayKey = getTableRollCalendarDayKey();
  let rollsTodayAfter = 0;

  if (table.maxRollsPerDay > 0) {
    if (!character || typeof character.save !== 'function') {
      throw new Error(
        `Table '${tableName}' has a daily roll limit per character; a character record is required to roll.`
      );
    }
    ensureCharacterDailyRollMap(character);
    const mapKey = tableRollDailyMapKey(table.name);
    const prev = parseTableRollDailyState(character.dailyRoll.get(mapKey));
    const countSoFar = prev.dayKey === todayKey ? prev.count : 0;
    if (countSoFar >= table.maxRollsPerDay) {
      throw new Error(
        `**${character.name}** has reached their daily roll limit for table '${tableName}' (${table.maxRollsPerDay}x per day).`
      );
    }
    rollsTodayAfter = countSoFar + 1;
    character.dailyRoll.set(mapKey, { d: todayKey, c: rollsTodayAfter });
    character.markModified('dailyRoll');
  }

  const totalW = table.totalWeight > 0 ? table.totalWeight : table.entries.reduce((s, e) => s + (e.weight || 0), 0);
  const randomValue = Math.random() * (totalW || 1);

  let currentWeight = 0;
  let selectedEntry = null;
  let entryIndex = 0;

  for (let i = 0; i < table.entries.length; i++) {
    const entry = table.entries[i];
    currentWeight += entry.weight;
    if (randomValue <= currentWeight) {
      selectedEntry = entry;
      entryIndex = i;
      break;
    }
  }

  if (!selectedEntry) {
    entryIndex = Math.max(0, table.entries.length - 1);
    selectedEntry = table.entries[entryIndex];
  }

  if (table.maxRollsPerDay > 0 && character) {
    try {
      await character.save();
    } catch (err) {
      console.error('[TableRollModel] Error saving character table roll limit:', err);
      throw err;
    }
  }

  try {
    const entryOid = selectedEntry._id;
    if (entryOid) {
      await this.updateOne(
        { _id: table._id },
        { $inc: { totalRollCount: 1, 'entries.$[e].rollCount': 1 } },
        { arrayFilters: [{ 'e._id': entryOid }] }
      );
    } else {
      await this.updateOne(
        { _id: table._id },
        { $inc: { totalRollCount: 1, [`entries.${entryIndex}.rollCount`]: 1 } }
      );
    }
  } catch (err) {
    console.error('[TableRollModel] Error incrementing roll counters:', err);
  }

  return {
    table,
    result: selectedEntry,
    entryIndex,
    rollValue: randomValue,
    dailyRollsRemaining:
      table.maxRollsPerDay > 0 ? Math.max(0, table.maxRollsPerDay - rollsTodayAfter) : null,
  };
};

// ------------------- Search tables by text -------------------
TableRollSchema.statics.searchTables = function(searchTerm, options = {}) {
  const query = {
    isActive: true,
    $text: { $search: searchTerm }
  };
  
  if (options.createdBy) {
    query.createdBy = options.createdBy;
  }
  
  if (options.isPublic !== undefined) {
    query.isPublic = options.isPublic;
  }
  
  return this.find(query, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .limit(options.limit || 10);
};

// ------------------- Get popular tables -------------------
TableRollSchema.statics.getPopularTables = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ------------------- Get recent tables -------------------
TableRollSchema.statics.getRecentTables = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};



// ------------------- Get user's tables -------------------
TableRollSchema.statics.getUserTables = function(userId, options = {}) {
  const query = { createdBy: userId };
  
  if (options.isActive !== undefined) {
    query.isActive = options.isActive;
  }
  
  return this.find(query)
    .sort({ updatedAt: -1 })
    .limit(options.limit || 50);
};

// ------------------- Instance methods -------------------

// ------------------- Add entry to table -------------------
TableRollSchema.methods.addEntry = function(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Invalid entry provided');
  }
  
  this.entries.push(entry);
  return this.save();
};

// ------------------- Remove entry from table -------------------
TableRollSchema.methods.removeEntry = function(index) {
  if (index < 0 || index >= this.entries.length) {
    throw new Error('Invalid entry index');
  }
  
  this.entries.splice(index, 1);
  return this.save();
};

// ------------------- Update entry in table -------------------
TableRollSchema.methods.updateEntry = function(index, updates) {
  if (index < 0 || index >= this.entries.length) {
    throw new Error('Invalid entry index');
  }
  
  Object.assign(this.entries[index], updates);
  return this.save();
};

// ------------------- Duplicate table -------------------
TableRollSchema.methods.duplicate = function(newName, newCreator) {
  const duplicate = new this.constructor({
    name: newName,
    entries: this.entries,
    createdBy: newCreator,
    maxRollsPerDay: this.maxRollsPerDay,
    allowedVillages: Array.isArray(this.allowedVillages) ? [...this.allowedVillages] : [],
  });
  
  return duplicate.save();
};

// ------------------- Export the model -------------------
module.exports = mongoose.model('TableRoll', TableRollSchema); 