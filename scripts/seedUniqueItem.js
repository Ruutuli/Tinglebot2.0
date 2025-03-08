// ------------------- Import necessary modules -------------------
const mongoose = require("mongoose");
const Item = require("../models/ItemModel"); // Import the Item model
require("dotenv").config();

// ------------------- Connect to MongoDB -------------------
async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_TINGLEBOT_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

// ------------------- Define "Blueprint Voucher" Item -------------------
const newItem = {
  itemName: "Blueprint Voucher",
  image: "", // No general image specified
  imageType: "",
  itemRarity: 4,
  category: ["Material"],
  categoryGear: "",
  categoryRef: "",
  type: ["Natural"],
  subtype: [],
  recipeTag: ["#Raw Material"],
  craftingMaterial: [],
  buyPrice: 5000,
  sellPrice: 2000,
  staminaToCraft: 0,
  modifierHearts: 0,
  staminaRecovered: 0,
  flawed: false,
  obtain: ["Vending", "Traveling"],
  obtainTags: ["Vending", "Traveling"],
  crafting: false,
  gathering: false,
  looting: false,
  vending: true,
  traveling: true,
  specialWeather: false,
  petPerk: false,
  exploring: false,
  craftingJobs: [],
  craftingTags: [],
  artist: false,
  blacksmith: false,
  cook: false,
  craftsman: false,
  maskMaker: false,
  researcher: false,
  weaver: false,
  witch: false,
  locations: ["Eldin", "Lanayru", "Faron", "Central Hyrule", "Gerudo", "Hebra"],
  locationsTags: ["Eldin", "Lanayru", "Faron", "Central Hyrule", "Gerudo", "Hebra"],
  emoji: "✔️",
  eldin: true,
  rudaniaIMG: "wix:image://v1/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png/rudania_crest.png#originWidth=382&originHeight=572",
  lanayru: true,
  inarikoIMG: "wix:image://v1/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png/inariko_crest.png#originWidth=500&originHeight=500",
  faron: true,
  vhintlIMG: "wix:image://v1/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png/vhintl_crest.png#originWidth=1000&originHeight=801",
  centralHyrule: true,
  gerudo: true,
  hebra: true,
  pathOfScarletLeaves: false,
  leafDewWay: false,
  gatheringJobs: [],
  gatheringTags: [],
  abMeat: false,
  abLive: false,
  beekeeper: false,
  farmer: false,
  fisherman: false,
  forager: false,
  herbalist: false,
  hunter: false,
  miner: false,
  monsterList: [],
  lootingJobs: [],
  lootingTags: [],
  adventurer: false,
  guard: false,
  gravekeeper: false,
  hunterLooting: false,
  mercenary: false,
  scout: false,
  allJobs: [],
  allJobsTags: [],
  gear: false,
  blackBokoblin: false,
  blueBokoblin: false,
  cursedBokoblin: false,
  goldenBokoblin: false,
  silverBokoblin: false,
  bokoblin: false,
  electricChuchuLarge: false,
  fireChuchuLarge: false,
  iceChuchuLarge: false,
  chuchuLarge: false,
  electricChuchuMedium: false,
  fireChuchuMedium: false,
  iceChuchuMedium: false,
  chuchuMedium: false,
  electricChuchuSmall: false,
  fireChuchuSmall: false,
  iceChuchuSmall: false,
  chuchuSmall: false,
  blackHinox: false,
  blueHinox: false,
  hinox: false,
  electricKeese: false,
  fireKeese: false,
  iceKeese: false,
  keese: false,
  blackLizalfos: false,
  blueLizalfos: false,
  cursedLizalfos: false,
  electricLizalfos: false,
  fireBreathLizalfos: false,
  goldenLizalfos: false,
  iceBreathLizalfos: false,
  silverLizalfos: false,
  lizalfos: false,
  blueManedLynel: false,
  goldenLynel: false,
  silverLynel: false,
  whiteManedLynel: false,
  lynel: false,
  blackMoblin: false,
  blueMoblin: false,
  cursedMoblin: false,
  goldenMoblin: false,
  silverMoblin: false,
  moblin: false,
  molduga: false,
  molduking: false,
  forestOctorok: false,
  rockOctorok: false,
  skyOctorok: false,
  snowOctorok: false,
  treasureOctorok: false,
  waterOctorok: false,
  frostPebblit: false,
  igneoPebblit: false,
  stonePebblit: false,
  stalizalfos: false,
  stalkoblin: false,
  stalmoblin: false,
  stalnox: false,
  frostTalus: false,
  igneoTalus: false,
  luminousTalus: false,
  rareTalus: false,
  stoneTalus: false,
  blizzardWizzrobe: false,
  electricWizzrobe: false,
  fireWizzrobe: false,
  iceWizzrobe: false,
  meteoWizzrobe: false,
  thunderWizzrobe: false,
  likeLike: false,
  evermean: false,
  gibdo: false,
  horriblin: false,
  gloomHands: false,
  bossBokoblin: false,
  mothGibdo: false,
  littleFrox: false,
  petPerkObtain: [],
  petprey: false,
  petforage: false,
  lgpetprey: false,
  petmon: false,
  petchu: false,
  petfirechu: false,
  peticechu: false,
  petelectricchu: false,
};

// ------------------- Insert or Update Item -------------------
async function addItem() {
  await connectToDatabase();

  try {
    await Item.updateOne(
      { itemName: newItem.itemName }, // Find by item name
      { $setOnInsert: newItem }, // Insert only if it does not exist
      { upsert: true }
    );

    console.log(`✅ Item "${newItem.itemName}" added successfully (if it didn't already exist)!`);
  } catch (error) {
    console.error("❌ Error adding item:", error);
  } finally {
    mongoose.disconnect();
  }
}

// ------------------- Run the function -------------------
addItem();
