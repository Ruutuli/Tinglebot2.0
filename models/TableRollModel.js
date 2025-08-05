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
        // Basic URL validation
        if (!v) return true; // Empty is allowed
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format for thumbnail image'
    }
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
TableRollSchema.statics.rollOnTable = function(tableName, options = {}) {
  return this.findOne({ name: tableName, isActive: true })
    .then(table => {
      if (!table) {
        throw new Error(`Table '${tableName}' not found or inactive`);
      }
      
      if (table.entries.length === 0) {
        throw new Error(`Table '${tableName}' has no entries`);
      }

      // Check daily roll limit
      if (table.maxRollsPerDay > 0 && table.dailyRollCount >= table.maxRollsPerDay) {
        throw new Error(`Table '${tableName}' has reached its daily roll limit`);
      }
      
      // Generate random number between 0 and total weight
      const randomValue = Math.random() * table.totalWeight;
      
      // Find the entry based on weight
      let currentWeight = 0;
      let selectedEntry = null;
      
      for (const entry of table.entries) {
        currentWeight += entry.weight;
        if (randomValue <= currentWeight) {
          selectedEntry = entry;
          break;
        }
      }
      
      // Fallback to last entry (shouldn't happen with proper weight calculation)
      if (!selectedEntry) {
        selectedEntry = table.entries[table.entries.length - 1];
      }

             // Update daily roll count
       table.dailyRollCount += 1;
      
      // Save the updated statistics
      table.save().catch(err => {
        console.error(`[TableRollModel] Error updating roll statistics:`, err);
      });

             return {
         table: table,
         result: selectedEntry,
         rollValue: randomValue,
         dailyRollsRemaining: table.maxRollsPerDay > 0 ? 
           Math.max(0, table.maxRollsPerDay - table.dailyRollCount) : null
       };
    });
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
    maxRollsPerDay: this.maxRollsPerDay
  });
  
  return duplicate.save();
};

// ------------------- Export the model -------------------
module.exports = mongoose.model('TableRoll', TableRollSchema); 