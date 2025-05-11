// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Schema for crafting materials -------------------
const CraftingMaterialSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, required: true }, // ID from the original item
  itemName: { type: String, required: true }, // Name of the crafting material
  quantity: { type: Number, required: true } // Quantity of the material
});

// ------------------- Schema for items -------------------
const ItemSchema = new Schema({
  itemName: { type: String, required: true }, // Name of the item
  image: { type: String, default: 'No Image' }, // Image URL for the item
  imageType: { type: String, default: 'No Image Type' }, // Type of image
  itemRarity: { type: Number, default: 1 }, // Rarity level of the item
  category: { type: [String], default: ['Misc'] }, // Item category
  categoryGear: { type: String, default: 'None' }, // Gear category
  type: { type: [String], default: ['Unknown'] }, // Item type
  subtype: { type: [String], default: ['None'] }, // Item subtype
  recipeTag: { type: [String], default: ['#Not Craftable'] }, // Recipe tags
  craftingMaterial: { type: [CraftingMaterialSchema], default: [] }, // Materials required for crafting
  buyPrice: { type: Number, default: 0 }, // Buy price
  sellPrice: { type: Number, default: 0 }, // Sell price
  staminaToCraft: { type: Schema.Types.Mixed, default: null }, // Stamina required for crafting
  modifierHearts: { type: Number, default: 0 }, // Hearts modifier
  staminaRecovered: { type: Number, default: 0 }, // Stamina recovered from the item
  obtain: { type: [String], default: [] }, // Methods of obtaining the item
  obtainTags: { type: [String], default: [] }, // Tags for how the item is obtained
  crafting: { type: Boolean, default: false }, // Can this item be crafted
  gathering: { type: Boolean, default: false }, // Can this item be gathered
  looting: { type: Boolean, default: false }, // Can this item be looted
  vending: { type: Boolean, default: false }, // Can this item be vended
  traveling: { type: Boolean, default: false }, // Can this item be found while traveling
  // ============================================================================
  // Special Weather
  // Stores weather requirements for the item as booleans for each weather type.
  // ============================================================================
  specialWeather: {
    muggy: { type: Boolean, default: false }, // Muggy weather
    flowerbloom: { type: Boolean, default: false }, // Flowerbloom weather
    fairycircle: { type: Boolean, default: false }, // Fairycircle weather
    jubilee: { type: Boolean, default: false }, // Jubilee weather
    meteorShower: { type: Boolean, default: false }, // Meteor Shower weather
    rockslide: { type: Boolean, default: false }, // Rockslide weather
    avalanche: { type: Boolean, default: false } // Avalanche weather
  },
  petPerk: { type: Boolean, default: false }, // Has pet perks
  exploring: { type: Boolean, default: false }, // Used for exploring
  craftingJobs: { type: [String], default: [] }, // Jobs that can craft the item
  craftingTags: { type: [String], default: [] }, // Crafting tags
  artist: { type: Boolean, default: false }, // Artist-related
  blacksmith: { type: Boolean, default: false }, // Blacksmith-related
  cook: { type: Boolean, default: false }, // Cooking-related
  craftsman: { type: Boolean, default: false }, // Craftsman-related
  maskMaker: { type: Boolean, default: false }, // Mask-making related
  researcher: { type: Boolean, default: false }, // Researcher-related
  weaver: { type: Boolean, default: false }, // Weaver-related
  witch: { type: Boolean, default: false }, // Witchcraft-related
  locations: { type: [String], default: [] }, // Available locations
  locationsTags: { type: [String], default: [] }, // Tags for item locations
  emoji: { type: String, default: '' }, // Emoji representing the item
  stackable: { type: Boolean, default: false }, // Whether the item can be stacked
  maxStackSize: { type: Number, default: 10 }, // Maximum stack size for stackable items

  // Flags for various monsters (e.g., Bokoblin, Chuchu, etc.)
  blackBokoblin: { type: Boolean, default: false },
  blueBokoblin: { type: Boolean, default: false },
  cursedBokoblin: { type: Boolean, default: false },
  goldenBokoblin: { type: Boolean, default: false },
  silverBokoblin: { type: Boolean, default: false },
  bokoblin: { type: Boolean, default: false },
  electricChuchuLarge: { type: Boolean, default: false },
  fireChuchuLarge: { type: Boolean, default: false },
  iceChuchuLarge: { type: Boolean, default: false },
  chuchuLarge: { type: Boolean, default: false },
  electricChuchuMedium: { type: Boolean, default: false },
  fireChuchuMedium: { type: Boolean, default: false },
  iceChuchuMedium: { type: Boolean, default: false },
  chuchuMedium: { type: Boolean, default: false },
  electricChuchuSmall: { type: Boolean, default: false },
  fireChuchuSmall: { type: Boolean, default: false },
  iceChuchuSmall: { type: Boolean, default: false },
  chuchuSmall: { type: Boolean, default: false },
  blackHinox: { type: Boolean, default: false },
  blueHinox: { type: Boolean, default: false },
  hinox: { type: Boolean, default: false },
  electricKeese: { type: Boolean, default: false },
  fireKeese: { type: Boolean, default: false },
  iceKeese: { type: Boolean, default: false },
  keese: { type: Boolean, default: false },
  blackLizalfos: { type: Boolean, default: false },
  blueLizalfos: { type: Boolean, default: false },
  cursedLizalfos: { type: Boolean, default: false },
  electricLizalfos: { type: Boolean, default: false },
  fireBreathLizalfos: { type: Boolean, default: false },
  goldenLizalfos: { type: Boolean, default: false },
  iceBreathLizalfos: { type: Boolean, default: false },
  silverLizalfos: { type: Boolean, default: false },
  lizalfos: { type: Boolean, default: false },
  blueManedLynel: { type: Boolean, default: false },
  goldenLynel: { type: Boolean, default: false },
  silverLynel: { type: Boolean, default: false },
  whiteManedLynel: { type: Boolean, default: false },
  lynel: { type: Boolean, default: false },
  blackMoblin: { type: Boolean, default: false },
  blueMoblin: { type: Boolean, default: false },
  cursedMoblin: { type: Boolean, default: false },
  goldenMoblin: { type: Boolean, default: false },
  silverMoblin: { type: Boolean, default: false },
  moblin: { type: Boolean, default: false },
  molduga: { type: Boolean, default: false },
  molduking: { type: Boolean, default: false },
  forestOctorok: { type: Boolean, default: false },
  rockOctorok: { type: Boolean, default: false },
  skyOctorok: { type: Boolean, default: false },
  snowOctorok: { type: Boolean, default: false },
  treasureOctorok: { type: Boolean, default: false },
  waterOctorok: { type: Boolean, default: false },
  frostPebblit: { type: Boolean, default: false },
  igneoPebblit: { type: Boolean, default: false },
  stonePebblit: { type: Boolean, default: false },
  stalizalfos: { type: Boolean, default: false },
  stalkoblin: { type: Boolean, default: false },
  stalmoblin: { type: Boolean, default: false },
  stalnox: { type: Boolean, default: false },
  frostTalus: { type: Boolean, default: false },
  igneoTalus: { type: Boolean, default: false },
  luminousTalus: { type: Boolean, default: false },
  rareTalus: { type: Boolean, default: false },
  stoneTalus: { type: Boolean, default: false },
  blizzardWizzrobe: { type: Boolean, default: false },
  electricWizzrobe: { type: Boolean, default: false },
  fireWizzrobe: { type: Boolean, default: false },
  iceWizzrobe: { type: Boolean, default: false },
  meteoWizzrobe: { type: Boolean, default: false },
  thunderWizzrobe: { type: Boolean, default: false },
  likeLike: { type: Boolean, default: false },
  evermean: { type: Boolean, default: false },
  gibdo: { type: Boolean, default: false },
  horriblin: { type: Boolean, default: false },
  gloomHands: { type: Boolean, default: false },
  bossBokoblin: { type: Boolean, default: false },
  mothGibdo: { type: Boolean, default: false },
  littleFrox: { type: Boolean, default: false },

  // Pet Perk Obtain-related fields
  petperkobtain: { type: [String], default: ['None'] }, // Pet Perk Obtain
  petprey: { type: Boolean, default: false }, // Pet Prey obtain flag
  petforage: { type: Boolean, default: false }, // Pet Forage obtain flag
  lgpetprey: { type: Boolean, default: false }, // Large Pet Prey obtain flag
  petmon: { type: Boolean, default: false }, // Pet Monster obtain flag
  petchu: { type: Boolean, default: false }, // Pet Chuchu obtain flag
  petfirechu: { type: Boolean, default: false }, // Pet Fire Chuchu obtain flag
  peticechu: { type: Boolean, default: false }, // Pet Ice Chuchu obtain flag
  petelectricchu: { type: Boolean, default: false }, // Pet Electric Chuchu obtain flag

  allJobs: { type: [String], default: ['None'] }, // Define allJobs as an array with a default value
  allJobsTags: { type: [String], default: ['None'] }, // Define allJobsTags as an array with a default value
}, { collection: 'items' });

// ------------------- Add index on itemName for quick lookup -------------------
ItemSchema.index({ itemName: 1 });

module.exports = mongoose.model('Item', ItemSchema);

