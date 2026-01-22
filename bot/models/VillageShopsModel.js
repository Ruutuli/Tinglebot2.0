// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Utility: Normalize specialWeather values -------------------
function normalizeSpecialWeather(value, depth = 0) {
  if (depth > 10) {
    console.warn('[VillageShopsModel]: normalizeSpecialWeather exceeded max depth, defaulting to false');
    return false;
  }

  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return false;
    }
    if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0', 'off', 'disabled', 'null', 'none'].includes(normalized)) {
      return false;
    }
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(entry => normalizeSpecialWeather(entry, depth + 1));
  }

  if (value instanceof Map) {
    return normalizeSpecialWeather(Object.fromEntries(value), depth + 1);
  }

  if (typeof value === 'object') {
    if (typeof value.toObject === 'function') {
      return normalizeSpecialWeather(value.toObject(), depth + 1);
    }

    const objectValues = Object.values(value);
    if (objectValues.length === 0) {
      return false;
    }

    return objectValues.some(entry => normalizeSpecialWeather(entry, depth + 1));
  }

  return Boolean(value);
}

// ------------------- Define the VillageShopItem schema -------------------
const VillageShopItemSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, required: true, ref: 'Item' },
  itemName: { type: String, required: true },
  image: { type: String, default: 'No Image' },
  imageType: { type: String, default: 'No Image Type' },
  itemRarity: { type: Number, default: 1 },
  category: { type: [String], default: ['Misc'] },
  categoryGear: { type: String, default: 'None' },
  type: { type: [String], default: ['Unknown'] },
  subtype: { type: [String], default: ['None'] },
  recipeTag: { type: [String], default: ['#Not Craftable'] },
  craftingMaterial: { type: [Schema.Types.Mixed], default: [] },
  buyPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, default: 0 },
  staminaToCraft: { type: Number, default: null },
  modifierHearts: { type: Number, default: 0 },
  staminaRecovered: { type: Number, default: 0 },
  obtain: { type: [String], default: [] },
  obtainTags: { type: [String], default: [] },
  crafting: { type: Boolean, default: false },
  gathering: { type: Boolean, default: false },
  looting: { type: Boolean, default: false },
  vending: { type: Boolean, default: false },
  traveling: { type: Boolean, default: false },
  specialWeather: { 
    type: Boolean, 
    default: false,
    set: function(value) {
      const normalized = normalizeSpecialWeather(value);
      if (typeof value !== 'boolean' && value !== undefined && value !== null) {
        console.warn(`[VillageShopsModel]: Normalizing specialWeather for ${this.itemName || 'unknown'} from`, value, '→', normalized);
      }
      return normalized;
    },
    validate: {
      validator: function(value) {
        return typeof value === 'boolean';
      },
      message: 'specialWeather must resolve to a boolean'
    }
  },
  petPerk: { type: Boolean, default: false },
  exploring: { type: Boolean, default: false },
  craftingJobs: { type: [String], default: [] },
  craftingTags: { type: [String], default: [] },
  artist: { type: Boolean, default: false },
  blacksmith: { type: Boolean, default: false },
  cook: { type: Boolean, default: false },
  craftsman: { type: Boolean, default: false },
  maskMaker: { type: Boolean, default: false },
  researcher: { type: Boolean, default: false },
  weaver: { type: Boolean, default: false },
  witch: { type: Boolean, default: false },
  locations: { type: [String], default: [] },
  locationsTags: { type: [String], default: [] },
  emoji: { type: String, default: '' },
  allJobs: { type: [String], default: ['None'] },
  allJobsTags: { type: [String], default: ['None'] },
  stock: { type: Number, required: true },
}, { collection: 'villageShops', timestamps: true, strict: true }); // strict:true ensures only defined fields are saved

// ------------------- Pre-validate hook to fix data type issues -------------------
// This runs BEFORE validation, allowing us to fix data type issues before Mongoose validates
VillageShopItemSchema.pre('validate', function(next) {
  try {
    // Fix craftingMaterial if it contains stringified arrays
    if (this.craftingMaterial && Array.isArray(this.craftingMaterial)) {
      this.craftingMaterial = this.craftingMaterial.map(item => {
        if (typeof item === 'string' && item.startsWith('[') && item.endsWith(']')) {
          try {
            // Try to parse the stringified array
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) {
              // If it's an array of objects, return the array
              return parsed;
            } else {
              return item; // Return as-is if not an array
            }
          } catch (e) {
            console.warn(`[VillageShopsModel]: Could not parse craftingMaterial item: ${item}`);
            return item; // Return as-is if parsing fails
          }
        }
        return item;
      });
      
      // Flatten any nested arrays that might have been created
      this.craftingMaterial = this.craftingMaterial.flat();
    }
    
    // Ensure all array fields are properly formatted
    const arrayFields = ['category', 'type', 'subtype', 'recipeTag', 'obtain', 'obtainTags', 
                        'craftingJobs', 'craftingTags', 'locations', 'locationsTags', 'allJobs', 'allJobsTags'];
    
    for (const field of arrayFields) {
      if (this[field] && !Array.isArray(this[field])) {
        console.warn(`[VillageShopsModel]: Converting ${field} from ${typeof this[field]} to array`);
        this[field] = [this[field]];
      }
    }
    
    // Handle specialWeather conversion from object to boolean
    const normalizedSpecialWeather = normalizeSpecialWeather(this.specialWeather);
    if (this.specialWeather !== normalizedSpecialWeather) {
      console.warn(`[VillageShopsModel]: Pre-validate normalization for ${this.itemName || 'unknown'}:`, this.specialWeather, '→', normalizedSpecialWeather);
      this.specialWeather = normalizedSpecialWeather;
    }
    
    next();
  } catch (error) {
    console.error(`[VillageShopsModel]: Error in pre-validate hook:`, error);
    next(error);
  }
});

// ------------------- Pre-save hook to ensure data integrity -------------------
VillageShopItemSchema.pre('save', function(next) {
  try {
    // Final safety check for specialWeather conversion
    const normalizedSpecialWeather = normalizeSpecialWeather(this.specialWeather);
    if (this.specialWeather !== normalizedSpecialWeather) {
      console.warn(`[VillageShopsModel]: Pre-save normalization for ${this.itemName || 'unknown'}:`, this.specialWeather, '→', normalizedSpecialWeather);
      this.specialWeather = normalizedSpecialWeather;
    }
    
    next();
  } catch (error) {
    console.error(`[VillageShopsModel]: Error in pre-save hook:`, error);
    next(error);
  }
});

// ------------------- Utility function to fix corrupted specialWeather data -------------------
VillageShopItemSchema.statics.fixSpecialWeatherData = async function(options = {}) {
  try {
    const { filter = {}, limit = 0, dryRun = false, source = 'manual' } = options;
    console.log('[VillageShopsModel]: Starting specialWeather cleanup', { source, limit, dryRun, filter });

    const query = { ...filter };
    const projection = { itemName: 1, specialWeather: 1 };
    let cursor = this.find(query, projection);
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }
    const items = await cursor.lean();

    let examined = 0;
    let updated = 0;
    let alreadyValid = 0;
    let skipped = 0;

    for (const item of items) {
      examined++;
      const normalized = normalizeSpecialWeather(item.specialWeather);
      const needsUpdate = typeof item.specialWeather !== 'boolean' || item.specialWeather !== normalized;

      if (!needsUpdate) {
        alreadyValid++;
        continue;
      }

      if (dryRun) {
        console.warn(`[VillageShopsModel]: Dry-run would normalize ${item.itemName}:`, item.specialWeather, '→', normalized);
        skipped++;
        continue;
      }

      try {
        await this.updateOne(
          { _id: item._id },
          { $set: { specialWeather: normalized } }
        );
        console.warn(`[VillageShopsModel]: Normalized ${item.itemName}:`, item.specialWeather, '→', normalized);
        updated++;
      } catch (updateError) {
        console.error(`[VillageShopsModel]: Error normalizing ${item.itemName}:`, updateError);
        skipped++;
      }
    }

    const summary = { source, examined, updated, alreadyValid, skipped, dryRun };
    console.log('[VillageShopsModel]: specialWeather cleanup summary', summary);
    return summary;
  } catch (error) {
    console.error('[VillageShopsModel]: Error in fixSpecialWeatherData:', error);
    throw error;
  }
};

// ------------------- Expose normalizer for reuse -------------------
VillageShopItemSchema.statics.normalizeSpecialWeather = function(value) {
  return normalizeSpecialWeather(value);
};

// ------------------- Export the VillageShopItem model -------------------
module.exports = mongoose.model('VillageShopItem', VillageShopItemSchema);
