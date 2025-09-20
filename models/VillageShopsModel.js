// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

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
  craftingMaterial: { type: [String], default: [] },
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
  specialWeather: { type: Boolean, default: false },
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

// ------------------- Pre-save hook to fix data type issues -------------------
VillageShopItemSchema.pre('save', function(next) {
  // Fix craftingMaterial if it contains stringified arrays
  if (this.craftingMaterial && Array.isArray(this.craftingMaterial)) {
    this.craftingMaterial = this.craftingMaterial.map(item => {
      if (typeof item === 'string' && item.startsWith('[') && item.endsWith(']')) {
        try {
          // Try to parse the stringified array
          const parsed = JSON.parse(item);
          return Array.isArray(parsed) ? parsed[0] : item; // Take first element if it's an array
        } catch (e) {
          console.warn(`[VillageShopsModel]: Could not parse craftingMaterial item: ${item}`);
          return item; // Return as-is if parsing fails
        }
      }
      return item;
    });
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
  
  next();
});

// ------------------- Export the VillageShopItem model -------------------
module.exports = mongoose.model('VillageShopItem', VillageShopItemSchema);
