// ============================================================================
// ------------------- Database Service Layer -------------------
// Purpose: Main database service module with all CRUD operations
// - Provides high-level database functions for characters, items, monsters, pets, tokens, etc.
// - Wraps DatabaseConnectionManager for backward compatibility
// - Contains business logic for database operations
// - Tracks database operation counts for monitoring
// Used by: Most command handlers and modules throughout the application
// Dependencies: connectionManager.js, config/database.js, various models
// ============================================================================

// ------------------- Standard Libraries -------------------
const mongoose = require("mongoose");
const { MongoClient, ObjectId } = require("mongodb");

// ------------------- Project Utilities -------------------
const { handleError, resetErrorCounter } = require("../utils/globalErrorHandler");
const { characterQueryDetector, modCharacterQueryDetector } = require("../utils/throttleDetector");
const dbConfig = require('../config/database');
const logger = require('../utils/logger');
const DatabaseConnectionManager = require('./connectionManager');

// Memory monitor (optional - won't break if not initialized)
let memoryMonitor = null;
try {
  const { getMemoryMonitor } = require('../utils/memoryMonitor');
  memoryMonitor = getMemoryMonitor();
} catch (err) {
  // Memory monitor not available, continue without it
}

// Database operation tracking
let dbOperationCounts = {
  queries: 0,
  updates: 0,
  inserts: 0,
  deletes: 0,
  transactions: 0
};

// Track database operations
function trackDbOperation(type) {
  if (dbOperationCounts[type] !== undefined) {
    dbOperationCounts[type]++;
  }
  
  // Update memory monitor every 100 operations
  const totalOps = Object.values(dbOperationCounts).reduce((a, b) => a + b, 0);
  if (memoryMonitor && totalOps % 100 === 0) {
    memoryMonitor.trackResource('dbQueries', dbOperationCounts.queries);
    memoryMonitor.trackResource('dbUpdates', dbOperationCounts.updates);
    memoryMonitor.trackResource('dbInserts', dbOperationCounts.inserts);
    memoryMonitor.trackResource('dbDeletes', dbOperationCounts.deletes);
    memoryMonitor.trackResource('dbTransactions', dbOperationCounts.transactions);
  }
}

// Export function to get operation counts
function getDbOperationCounts() {
  return { ...dbOperationCounts };
}

// ============================================================================
// ------------------- Inventory Link Normalization -------------------
// All inventory links should point to the dashboard route:
//   /characters/inventories/<slug>
// ============================================================================

const WEB_BASE_URL = "https://tinglebot.xyz";

function createSlug(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildInventoryUrl(characterName) {
  const slug = createSlug(characterName);
  return `${WEB_BASE_URL}/characters/inventories/${slug}`;
}

function normalizeInventoryUrlForCharacter(characterDoc) {
  if (!characterDoc || !characterDoc.name) return characterDoc;
  const current = characterDoc.inventory;
  const isNewFormat =
    typeof current === "string" && current.includes("/characters/inventories/");
  if (!isNewFormat) {
    characterDoc.inventory = buildInventoryUrl(characterDoc.name);
  }
  return characterDoc;
}

// Import inventoryUtils but don't use removeInitialItemIfSynced directly
const inventoryUtils = require("../utils/inventoryUtils");

// ------------------- Models -------------------
const Character = require("../models/CharacterModel");
const ModCharacter = require("../models/ModCharacterModel");
const Monster = require("../models/MonsterModel");
const Quest = require("../models/QuestModel");
const RelicModel = require("../models/RelicModel");
const User = require("../models/UserModel");
const Pet = require("../models/PetModel");
const { Stable, ForSaleMount, ForSalePet } = require("../models/StableModel");
const VillageShopItem = require("../models/VillageShopsModel");
const generalCategories = require("../models/GeneralItemCategories");
const { escapeRegExp } = require("../utils/inventoryUtils");

// ============================================================================
// ------------------- Database Connection Functions -------------------
// Wrapper functions that use DatabaseConnectionManager for backward compatibility
// ============================================================================

// ============================================================================
// ------------------- Configuration Constants -------------------
// Definitions of static constants like village names and icons.
// ============================================================================

const VILLAGE_NAMES = ["Rudania", "Inariko", "Vhintl"];
const LIMITED_ITEMS_COUNT = 5;

const VILLAGE_IMAGES = {
 Rudania:
  "https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_red_bottom.png",
 Inariko:
  "https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_blue_bottom.png",
 Vhintl:
  "https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_green_bottom.png",
};

const VILLAGE_ICONS = {
  Rudania:
   "https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_rudania_.png",
  Inariko:
   "https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_inariko_.png",
  Vhintl:
   "https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_vhintl_.png",
 };

const VILLAGE_BANNERS = {
  Rudania: 'https://storage.googleapis.com/tinglebot/Graphics/rudania_village_banner.png',
  Inariko: 'https://storage.googleapis.com/tinglebot/Graphics/inariko_village_banner.png',
  Vhintl: 'https://storage.googleapis.com/tinglebot/Graphics/vhintl_village_banner.png',
};

// ------------------- connectToTinglebot -------------------
async function connectToTinglebot() {
  try {
    return await DatabaseConnectionManager.connectToTinglebot();
  } catch (error) {
    handleError(error, "db.js");
    logger.error('DATABASE', 'Failed to connect to tinglebot database');
    throw error;
  }
}

// ------------------- connectToInventories -------------------
async function connectToInventories() {
  try {
    return await DatabaseConnectionManager.connectToInventories();
  } catch (error) {
    handleError(error, "db.js");
    logger.error('DATABASE', 'Failed to connect to inventories database');
    throw error;
  }
}

// ------------------- connectToInventoriesNative -------------------
const connectToInventoriesNative = async () => {
  try {
    return await DatabaseConnectionManager.connectToInventoriesNative();
  } catch (error) {
    handleError(error, "db.js");
    logger.error('DATABASE', 'Failed to connect to native inventories database');
    throw error;
  }
};

// ------------------- getInventoryCollection -------------------
const getInventoryCollection = async (characterName) => {
  try {
    return await DatabaseConnectionManager.getInventoryCollection(characterName);
  } catch (error) {
    handleError(error, "db.js");
    logger.error('DATABASE', `Failed to get inventory collection for ${characterName}`);
    throw error;
  }
};

// ------------------- connectToVending -------------------
async function connectToVending() {
  try {
    return await DatabaseConnectionManager.connectToVending();
  } catch (error) {
    handleError(error, "db.js");
    logger.error('DATABASE', 'Failed to connect to vending database');
    throw error;
  }
}



// ============================================================================
// ------------------- Character Service Functions -------------------
// CRUD and helper functions for Character entities.
// ============================================================================

// ------------------- getCharactersInVillage -------------------
async function getCharactersInVillage(userId, village) {
 try {
  const characters = await fetchCharactersByUserId(userId);
  return characters.filter(
   (character) =>
    character.currentVillage.toLowerCase() === village.toLowerCase()
  );
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in getCharactersInVillage: ${error.message}`
  );
  throw error;
 }
}

// ------------------- fetchCharacterByName -------------------
const fetchCharacterByName = async (characterName) => {
 // Get the actual name part before the "|" if it exists
 const actualName = characterName.split('|')[0].trim();
 try {
  await connectToTinglebot();
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  trackDbOperation('queries');
  const character = await Character.findOne({
   name: new RegExp(`^${escapedName}$`, "i"),
  });

  if (!character) {
   return null;
  }
  return character;
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `❌ Error fetching character "${actualName}": ${error.message}`
  );
  throw error;
 }
};

// ------------------- fetchBlightedCharactersByUserId -------------------
const fetchBlightedCharactersByUserId = async (userId) => {
 try {
  await connectToTinglebot();
  trackDbOperation('queries');
  // Fetch blighted characters from both Character and ModCharacter collections
  const [regularCharacters, modCharacters] = await Promise.all([
    Character.find({ userId, blighted: true }).lean().exec(),
    ModCharacter.find({ userId, blighted: true }).lean().exec()
  ]);
  // Merge and return both types
  return [...regularCharacters, ...modCharacters];
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in fetchBlightedCharactersByUserId: ${error.message}`
  );
  throw error;
 }
};

// ------------------- fetchAllCharacters -------------------
const fetchAllCharacters = async () => {
 try {
  await connectToTinglebot();
  trackDbOperation('queries');
  const characters = await Character.find().lean().exec();
  return characters.map((c) => normalizeInventoryUrlForCharacter(c));
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in fetchAllCharacters: ${error.message}`
  );
  throw error;
 }
};

// ------------------- fetchCharacterById -------------------
const fetchCharacterById = async (characterId) => {
 try {
  await connectToTinglebot();
  const character = await Character.findById(characterId);
  if (!character) {
   return null; // Return null instead of throwing error
  }
  return normalizeInventoryUrlForCharacter(character);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in fetchCharacterById: ${error.message}`
  );
  throw error;
 }
};

// ------------------- fetchCharactersByUserId -------------------
const fetchCharactersByUserId = async (userId, fields = null) => {
  const startTime = Date.now();
  
  // Check circuit breaker
  if (characterQueryDetector.shouldBlock()) {
    const duration = Date.now() - startTime;
    characterQueryDetector.recordQuery(false, duration);
    throw new Error('Database queries temporarily blocked due to circuit breaker');
  }
  
  // Wait for backoff if throttled
  await characterQueryDetector.waitIfNeeded();
  
  try {
    let query = Character.find({ userId }).lean();
    if (fields && Array.isArray(fields)) {
      query = query.select(fields.join(' '));
    }
    
    const characters = await query.exec();
    const duration = Date.now() - startTime;
    characterQueryDetector.recordQuery(true, duration);
    return characters.map((c) => normalizeInventoryUrlForCharacter(c));
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // If query fails, try reconnecting once
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectToTinglebot();
        let retryQuery = Character.find({ userId }).lean();
        if (fields && Array.isArray(fields)) {
          retryQuery = retryQuery.select(fields.join(' '));
        }
        const retryResult = await retryQuery.exec();
        const retryDuration = Date.now() - startTime;
        characterQueryDetector.recordQuery(true, retryDuration);
        return retryResult.map((c) => normalizeInventoryUrlForCharacter(c));
      } catch (retryError) {
        const retryDuration = Date.now() - startTime;
        characterQueryDetector.recordQuery(false, retryDuration);
        handleError(retryError, "db.js");
        throw retryError;
      }
    }
    
    characterQueryDetector.recordQuery(false, duration);
    handleError(error, "db.js");
    throw error;
  }
};

// ------------------- fetchCharacterByNameAndUserId -------------------
const fetchCharacterByNameAndUserId = async (characterName, userId) => {
 try {
  await connectToTinglebot();
  
  // Handle null/undefined characterName
  if (!characterName) {
    return null;
  }
  
  // Get the actual name part before the "|" if it exists
  const actualName = characterName.split('|')[0].trim();
  
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const character = await Character.findOne({
    name: new RegExp(`^${escapedName}$`, "i"),
    userId
  });

  if (!character) {
    return null;
  }

  return normalizeInventoryUrlForCharacter(character);
 } catch (error) {
  handleError(error, "db.js");
  const actualName = characterName ? characterName.split('|')[0].trim() : 'null/undefined';
  console.error(`[characterService]: ❌ Error searching for "${actualName}": ${error.message}`);
  throw error;
 }
};

// ------------------- fetchAnyCharacterByNameAndUserId -------------------
const fetchAnyCharacterByNameAndUserId = async (characterName, userId) => {
 try {
  await connectToTinglebot();
  // Get the actual name part before the "|" if it exists
  const actualName = characterName.split('|')[0].trim();
  
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // First try to find a regular character
  const character = await Character.findOne({
    name: new RegExp(`^${escapedName}$`, "i"),
    userId
  });

  if (character) {
    return character;
  }

  // If no regular character found, try to find a mod character
  const modCharacter = await ModCharacter.findOne({
    name: new RegExp(`^${escapedName}$`, "i"),
    userId
  });

  return modCharacter;
 } catch (error) {
  handleError(error, "db.js");
  console.error(`[characterService]: ❌ Error searching for "${actualName}" in both character collections: ${error.message}`);
  throw error;
 }
};

// ------------------- fetchAllCharactersExceptUser -------------------
const fetchAllCharactersExceptUser = async (userId) => {
 try {
  await connectToTinglebot();
  return await Character.find({ userId: { $ne: userId } }).exec();
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in fetchAllCharactersExceptUser: ${error.message}`
  );
  throw error;
 }
};

// ------------------- createCharacter -------------------
const createCharacter = async (characterData) => {
 try {
  await connectToTinglebot();
  const character = new Character(characterData);
  await character.save();
  return character;
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in createCharacter: ${error.message}`
  );
  throw error;
 }
};

// ------------------- updateCharacterById -------------------
const updateCharacterById = async (characterId, updateData) => {
 try {
  await connectToTinglebot();
  return await Character.findByIdAndUpdate(
   new ObjectId(characterId),
   updateData,
   { new: true }
  )
   .lean()
   .exec();
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in updateCharacterById: ${error.message}`
  );
  throw error;
 }
};

// ------------------- deleteCharacterById -------------------
const deleteCharacterById = async (characterId) => {
 try {
  await connectToTinglebot();
  const charObjectId = new ObjectId(characterId);

  // Cascade delete: pets + stable/market listings tied to this character.
  // 1) Capture owned pet IDs before deleting.
  const ownedPets = await Pet.find({ owner: charObjectId }).select("_id").lean().exec();
  const ownedPetIds = ownedPets.map((p) => p._id).filter(Boolean);

  // 2) Remove any stable/market records referencing these pets/character.
  // Stable is 1:1 per character; safest to delete the stable record entirely.
  await Stable.deleteMany({ characterId: charObjectId });

  // Remove for-sale listings for this character (and any listing that references an owned pet).
  await ForSalePet.deleteMany({
    $or: [
      { characterId: charObjectId },
      ...(ownedPetIds.length > 0 ? [{ petId: { $in: ownedPetIds } }] : []),
    ],
  });
  // Also remove any for-sale mounts tied to this character to prevent orphaned listings.
  await ForSaleMount.deleteMany({ characterId: charObjectId });

  // 3) Delete the pets themselves.
  await Pet.deleteMany({ owner: charObjectId });

  // 4) Delete the character last.
  return await Character.findByIdAndDelete(charObjectId).lean().exec();
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in deleteCharacterById: ${error.message}`
  );
  throw error;
 }
};

// ------------------- updateCharacterInventorySynced -------------------
const updateCharacterInventorySynced = async (characterId) => {
 try {

  // Instead of directly requiring removeInitialItemIfSynced, use the reference
  // from the initialized module
  await inventoryUtils.removeInitialItemIfSynced(characterId);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in updateCharacterInventorySynced: ${error.message}`
  );
  throw error;
 }
};

// ------------------- getCharacterInventoryCollection -------------------
const getCharacterInventoryCollection = async (characterName) => {
 try {
  if (typeof characterName !== "string") {
   throw new TypeError(
    `Expected a string for characterName, but received ${typeof characterName}`
   );
  }
  await connectToInventories();
  const collectionName = characterName.trim().toLowerCase();
  return await getInventoryCollection(collectionName);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in getCharacterInventoryCollection for "${characterName}": ${error.message}`
  );
  throw error;
 }
};

// ------------------- getCharacterInventoryCollectionWithModSupport -------------------
const getCharacterInventoryCollectionWithModSupport = async (characterOrName) => {
 try {
  await connectToInventories();
  let collectionName;
  if (typeof characterOrName === 'object' && characterOrName.isModCharacter) {
    collectionName = characterOrName.name.toLowerCase(); // Now uses individual collection
  } else if (typeof characterOrName === 'object') {
    collectionName = characterOrName.name.toLowerCase();
  } else { // string
    collectionName = characterOrName.trim().toLowerCase();
  }
  return await getInventoryCollection(collectionName);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in getCharacterInventoryCollectionWithModSupport: ${error.message}`
  );
  throw error;
 }
};

// ------------------- createCharacterInventory -------------------
const createCharacterInventory = async (characterName, characterId, job) => {
 try {
  const collection = await getInventoryCollection(characterName);
  const initialInventory = {
   characterId,
   itemName: "Initial Item",
   quantity: 1,
   category: "Misc",
   type: "Misc",
   subtype: "Misc",
   job,
   perk: "",
   location: "",
   link: "",
   date: new Date(),
   obtain: [],
  };
  await collection.insertOne(initialInventory);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in createCharacterInventory for "${characterName}": ${error.message}`
  );
  throw error;
 }
};

// ------------------- transferCharacterInventoryToVillageShops -------------------
// Before deleting a character's inventory, transfer all items into the village shops
// so they are not lost. Does not drop the collection; caller still calls deleteCharacterInventoryCollection.
const transferCharacterInventoryToVillageShops = async (characterName) => {
 try {
  const collection = await getCharacterInventoryCollection(characterName);
  const docs = await collection.find({}).toArray();
  const byItem = new Map();
  for (const doc of docs) {
   const name = doc.itemName;
   if (!name || name === "Initial Item") continue;
   const qty = typeof doc.quantity === "number" ? doc.quantity : 0;
   if (qty <= 0) continue;
   byItem.set(name, (byItem.get(name) || 0) + qty);
  }
  for (const [itemName, totalQty] of byItem) {
   let itemFilter;
   if (itemName.includes("+")) {
    itemFilter = { itemName };
   } else {
    itemFilter = { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, "i") } };
   }
   const shopItem = await VillageShopItem.findOne(itemFilter);
   if (shopItem) {
    await VillageShopItem.updateOne(
     { _id: shopItem._id },
     { $inc: { stock: totalQty } }
    );
    continue;
   }
   const item = await fetchItemByName(itemName);
   if (!item) {
    logger.warn("INVENTORY_TRANSFER", `[db.js] Skipping ${itemName} - not in Item DB (character: ${characterName})`);
    continue;
   }
   const finalBuyPrice = item.buyPrice || 0;
   const finalSellPrice = item.sellPrice || 0;
   const newShopItem = new VillageShopItem({
    itemId: item._id,
    itemName: item.itemName,
    image: item.image || "No Image",
    imageType: item.imageType || "No Image Type",
    itemRarity: item.itemRarity || 1,
    category: item.category || ["Misc"],
    categoryGear: item.categoryGear || "None",
    type: item.type || ["Unknown"],
    subtype: item.subtype || ["None"],
    recipeTag: item.recipeTag || ["#Not Craftable"],
    craftingMaterial: item.craftingMaterial || [],
    buyPrice: finalBuyPrice,
    sellPrice: finalSellPrice,
    staminaToCraft: item.staminaToCraft ?? null,
    modifierHearts: item.modifierHearts || 0,
    staminaRecovered: item.staminaRecovered || 0,
    obtain: item.obtain || [],
    crafting: item.crafting || false,
    gathering: item.gathering || false,
    looting: item.looting || false,
    vending: item.vending || false,
    traveling: item.traveling || false,
    specialWeather: typeof item.specialWeather === "object"
     ? Object.values(item.specialWeather).some((v) => v === true)
     : Boolean(item.specialWeather),
    petPerk: item.petPerk || false,
    exploring: item.exploring || false,
    craftingJobs: item.craftingJobs || [],
    artist: item.artist || false,
    blacksmith: item.blacksmith || false,
    cook: item.cook || false,
    craftsman: item.craftsman || false,
    maskMaker: item.maskMaker || false,
    researcher: item.researcher || false,
    weaver: item.weaver || false,
    witch: item.witch || false,
    locations: item.locations || [],
    emoji: item.emoji || "",
    allJobs: item.allJobs || ["None"],
    stock: totalQty
   });
   await newShopItem.save();
  }
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in transferCharacterInventoryToVillageShops for "${characterName}": ${error.message}`
  );
  throw error;
 }
};

// ------------------- deleteCharacterInventoryCollection -------------------
const deleteCharacterInventoryCollection = async (characterName) => {
 try {
  const collection = await getCharacterInventoryCollection(characterName);
  await collection.drop();
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in deleteCharacterInventoryCollection for "${characterName}": ${error.message}`
  );
  throw error;
 }
};

// ------------------- getModSharedInventoryCollection -------------------
const getModSharedInventoryCollection = async () => {
 try {
  await connectToInventories();
  const collectionName = 'mod_shared_inventory';
  return await getInventoryCollection(collectionName);
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in getModSharedInventoryCollection: ${error.message}`
  );
  throw error;
 }
};

// ============================================================================
// ------------------- Mod Character Database Functions -------------------
// Functions for managing mod characters with unlimited hearts/stamina
// ============================================================================

const fetchModCharacterByNameAndUserId = async (characterName, userId) => {
 try {
  await connectToTinglebot();
  // Get the actual name part before the "|" if it exists
  const actualName = characterName.split('|')[0].trim();
  
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const modCharacter = await ModCharacter.findOne({
    name: new RegExp(`^${escapedName}$`, "i"),
    userId
  });

  if (!modCharacter) {
    return null;
  }

  return normalizeInventoryUrlForCharacter(modCharacter);
 } catch (error) {
  handleError(error, "db.js", {
   function: "fetchModCharacterByNameAndUserId",
   characterName: characterName,
   userId: userId,
  });
  throw error;
 }
};

// ------------------- fetchModCharacterByName -------------------
const fetchModCharacterByName = async (characterName) => {
 try {
  await connectToTinglebot();
  // Get the actual name part before the "|" if it exists
  const actualName = characterName.split('|')[0].trim();
  
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const modCharacter = await ModCharacter.findOne({
    name: new RegExp(`^${escapedName}$`, "i")
  });

  if (!modCharacter) {
    return null;
  }

  return normalizeInventoryUrlForCharacter(modCharacter);
 } catch (error) {
  handleError(error, "db.js", {
   function: "fetchModCharacterByName",
   characterName: characterName,
  });
  throw error;
 }
};

const fetchModCharactersByUserId = async (userId, fields = null) => {
  const startTime = Date.now();
  
  // Check circuit breaker
  if (modCharacterQueryDetector.shouldBlock()) {
    const duration = Date.now() - startTime;
    modCharacterQueryDetector.recordQuery(false, duration);
    throw new Error('Database queries temporarily blocked due to circuit breaker');
  }
  
  // Wait for backoff if throttled
  await modCharacterQueryDetector.waitIfNeeded();
  
  try {
    let query = ModCharacter.find({ userId: userId }).lean();
    if (fields && Array.isArray(fields)) {
      query = query.select(fields.join(' '));
    }
    
    const modCharacters = await query.exec();
    const duration = Date.now() - startTime;
    modCharacterQueryDetector.recordQuery(true, duration);
    return modCharacters.map((c) => normalizeInventoryUrlForCharacter(c));
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // If query fails, try reconnecting once
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectToTinglebot();
        let retryQuery = ModCharacter.find({ userId: userId }).lean();
        if (fields && Array.isArray(fields)) {
          retryQuery = retryQuery.select(fields.join(' '));
        }
        const retryResult = await retryQuery.exec();
        const retryDuration = Date.now() - startTime;
        modCharacterQueryDetector.recordQuery(true, retryDuration);
        return retryResult.map((c) => normalizeInventoryUrlForCharacter(c));
      } catch (retryError) {
        const retryDuration = Date.now() - startTime;
        modCharacterQueryDetector.recordQuery(false, retryDuration);
        handleError(retryError, "db.js", {
          function: "fetchModCharactersByUserId",
          userId: userId,
        });
        throw retryError;
      }
    }
    
    modCharacterQueryDetector.recordQuery(false, duration);
    handleError(error, "db.js", {
      function: "fetchModCharactersByUserId",
      userId: userId,
    });
    throw error;
  }
};

const fetchAllModCharacters = async () => {
 try {
  await connectToTinglebot();
  const modCharacters = await ModCharacter.find({});
  return modCharacters.map((c) => normalizeInventoryUrlForCharacter(c));
 } catch (error) {
  handleError(error, "db.js", {
   function: "fetchAllModCharacters",
  });
  throw error;
 }
};

const createModCharacter = async (modCharacterData) => {
 try {
  await connectToTinglebot();
  const modCharacter = new ModCharacter(modCharacterData);
  const savedModCharacter = await modCharacter.save();
  return savedModCharacter;
 } catch (error) {
  handleError(error, "db.js", {
   function: "createModCharacter",
   modCharacterData: modCharacterData,
  });
  throw error;
 }
};

const updateModCharacterById = async (modCharacterId, updateData) => {
 try {
  await connectToTinglebot();
  const updatedModCharacter = await ModCharacter.findByIdAndUpdate(
   modCharacterId,
   updateData,
   { new: true }
  );
  return normalizeInventoryUrlForCharacter(updatedModCharacter);
 } catch (error) {
  handleError(error, "db.js", {
   function: "updateModCharacterById",
   modCharacterId: modCharacterId,
   updateData: updateData,
  });
  throw error;
 }
};

const deleteModCharacterById = async (modCharacterId) => {
 try {
  await connectToTinglebot();
  const deletedModCharacter = await ModCharacter.findByIdAndDelete(modCharacterId);
  return deletedModCharacter;
 } catch (error) {
  handleError(error, "db.js", {
   function: "deleteModCharacterById",
   modCharacterId: modCharacterId,
  });
  throw error;
 }
};

const fetchModCharacterById = async (modCharacterId) => {
 try {
  await connectToTinglebot();
  const modCharacter = await ModCharacter.findById(modCharacterId);
  return modCharacter;
 } catch (error) {
  handleError(error, "db.js", {
   function: "fetchModCharacterById",
   modCharacterId: modCharacterId,
  });
  throw error;
 }
};

// ============================================================================
// ------------------- Pet Service Functions -------------------
// CRUD and helper functions for managing character pets.
// ============================================================================
// ------------------- addPetToCharacter -------------------
async function addPetToCharacter(
 characterId,
 petName,
 species,
 size,
 level,
 perk
) {
 try {
  await Character.findByIdAndUpdate(characterId, {
   $push: {
    pets: {
     name: petName,
     species: species,
     size: size,
     level: level,
     rollsRemaining: 1,
     perks: [perk],
    },
   },
  });
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in addPetToCharacter: ${error.message}`
  );
  throw error;
 }
}

// ------------------- updatePetRolls -------------------
async function updatePetRolls(characterId, petIdentifier, newRolls) {
 try {
  let filter;
  if (petIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
   filter = { _id: petIdentifier, owner: characterId };
  } else {
   filter = { name: petIdentifier, owner: characterId };
  }
  // Ensure newRolls is never negative
  const safeRolls = Math.max(0, newRolls);
  await Pet.updateOne(filter, { 
    $set: { 
      rollsRemaining: safeRolls,
      lastRollDate: new Date()
    } 
  });
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - updatePetRolls error: ${error.message}`
  );
  throw error;
 }
}

// ------------------- upgradePetLevel -------------------
async function upgradePetLevel(characterId, petName, newLevel) {
 try {
  // Update the Pet model instead of Character model
  await Pet.updateOne(
   { name: petName, owner: characterId },
   { 
     $set: { 
       level: newLevel,
       rollsRemaining: Math.min(newLevel, 3), // Reset rolls based on new level
       lastRollDate: null // Clear daily roll restriction so pet can roll immediately
     } 
   }
  );
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in upgradePetLevel: ${error.message}`
  );
  throw error;
 }
}

// ------------------- updatePetToCharacter -------------------
async function updatePetToCharacter(characterId, petName, updatedPetData) {
 try {
  await Character.updateOne(
   { _id: characterId, "pets.name": petName },
   { $set: { "pets.$": updatedPetData } }
  );
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Failed to update pet "${petName}": ${error.message}`
  );
  throw new Error("Failed to update pet");
 }
}

// ------------------- resetPetRollsForAllCharacters -------------------
async function resetPetRollsForAllCharacters() {
 try {
  console.log(`[db.js]: 🔄 Starting pet roll reset at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  
  // First, get all active pets
  const activePets = await Pet.find({ status: 'active' });
  console.log(`[db.js]: 📊 Found ${activePets.length} active pets to reset`);
  
  // Update each pet's rolls based on their level
  let successCount = 0;
  let failCount = 0;
  let totalOldRolls = 0;
  let totalNewRolls = 0;
  
  for (const pet of activePets) {
    try {
      // Only reset rollsRemaining to match the pet's current level
      const newRolls = Math.min(pet.level, 3);
      const oldRolls = pet.rollsRemaining;
      
      // Only update rollsRemaining, preserving the level
      await Pet.updateOne(
        { _id: pet._id },
        { $set: { rollsRemaining: newRolls } }
      );
      
      totalOldRolls += oldRolls;
      totalNewRolls += newRolls;
      console.log(`[db.js]: ✅ Reset pet "${pet.name}" (${pet.ownerName}) from ${oldRolls} to ${newRolls} rolls`);
      successCount++;
    } catch (petError) {
      console.error(`[db.js]: ❌ Failed to reset pet "${pet.name}" (${pet.ownerName}): ${petError.message}`);
      failCount++;
    }
  }
  
  console.log(`[db.js]: 📊 Pet roll reset complete. Success: ${successCount}, Failed: ${failCount}`);
  
  // Return result object with oldRolls and newRolls for mod.js compatibility
  return {
    success: true,
    oldRolls: totalOldRolls,
    newRolls: totalNewRolls,
    successCount,
    failCount,
    totalPets: activePets.length
  };
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[db.js]: ❌ Error in resetPetRollsForAllCharacters: ${error.message}`
  );
  throw error;
 }
}

// ------------------- restorePetLevel -------------------
async function restorePetLevel(characterId, petName, level) {
 try {
  // Update the Pet model to restore the level
  await Pet.updateOne(
   { name: petName, owner: characterId },
   { 
     $set: { 
       level: level,
       rollsRemaining: Math.min(level, 3), // Also update rolls to match level
       lastRollDate: null // Clear daily roll restriction so pet can roll immediately
     } 
   }
  );
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[db.js]: ❌ Error in restorePetLevel: ${error.message}`
  );
  throw error;
 }
}

// ------------------- forceResetPetRolls -------------------
async function forceResetPetRolls(characterId, petName) {
  try {
    console.log(`[db.js]: 🔄 Force resetting rolls for pet "${petName}" (${characterId})`);
    
    const pet = await Pet.findOne({ name: petName, owner: characterId });
    if (!pet) {
      throw new Error(`Pet "${petName}" not found for character ${characterId}`);
    }
    
    const newRolls = Math.min(pet.level, 3);
    const oldRolls = pet.rollsRemaining;
    
    await Pet.updateOne(
      { _id: pet._id },
      { $set: { rollsRemaining: newRolls, lastRollDate: null } }
    );
    
    console.log(`[db.js]: ✅ Force reset pet "${pet.name}" (${pet.ownerName}) from ${oldRolls} to ${newRolls} rolls`);
    return { success: true, oldRolls, newRolls };
  } catch (error) {
    handleError(error, "db.js");
    console.error(`[db.js]: ❌ Error in forceResetPetRolls: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// ------------------- Item Service Functions  -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- fetchAllItems -------------------
const fetchAllItems = async () => {
    try {
        const db = await connectToInventoriesForItems();
        
        // Check if database connection is null
        if (!db) {
            throw new Error('Database connection failed - unable to connect to items database');
        }
        
        const items = await db.collection("items").find().toArray();
        return items;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching all items:", error);
        throw error;
    }
};

// ------------------- fetchItemByName -------------------
async function fetchItemByName(itemName, context = {}) {
    try {
        const db = await connectToInventoriesForItems(context);
        
        // Check if database connection is null
        if (!db) {
            throw new Error('Database connection failed - unable to connect to items database');
        }
        
        const normalizedItemName = itemName.trim();
        // Escape special regex characters (including + and ++) so we match the exact variant
        // e.g. "Sword+", "Sword++" without cross-variant matches; case-insensitive.
        const escapedName = normalizedItemName.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
        const item = await db.collection("items").findOne({
            itemName: new RegExp(`^${escapedName}$`, "i"),
        });
        if (!item) {
            return null;
        }
        return item;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching item by name:", error);
        
        
        throw error;
    }
};

// ------------------- fetchItemById -------------------
const fetchItemById = async (itemId) => {
    try {
        const db = await connectToInventoriesForItems();
        
        // Check if database connection is null
        if (!db) {
            throw new Error('Database connection failed - unable to connect to items database');
        }
        
        const item = await db.collection("items").findOne({ _id: ObjectId(itemId) });
        return item;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching item by ID:", error);
        
        
        throw error;
    }
};

// ------------------- fetchItemsByMonster -------------------
const fetchItemsByMonster = async (monsterName) => {
    try {
        const db = await connectToInventoriesForItems();
        
        // Check if database connection is null
        if (!db) {
            throw new Error('Database connection failed - unable to connect to items database');
        }
        
        // Import monsterMapping to get the correct field names
        const { monsterMapping } = require('../models/MonsterModel');
        
        // Find the monster mapping entry that matches the monster name
        let fieldName = null;
        for (const [key, value] of Object.entries(monsterMapping)) {
            if (value.name === monsterName) {
                fieldName = key;
                break;
            }
        }
        
        // Fallback to manual mapping if not found in monsterMapping
        if (!fieldName) {
            const manualMapping = {
                'Frox': 'littleFrox',
                'Little Frox': 'littleFrox',
                // Chuchu mappings
                'Chuchu (Large)': 'chuchuLarge',
                'Chuchu (Medium)': 'chuchuMedium', 
                'Chuchu (Small)': 'chuchuSmall',
                'Fire Chuchu (Large)': 'fireChuchuLarge',
                'Fire Chuchu (Medium)': 'fireChuchuMedium',
                'Fire Chuchu (Small)': 'fireChuchuSmall',
                'Ice Chuchu (Large)': 'iceChuchuLarge',
                'Ice Chuchu (Medium)': 'iceChuchuMedium',
                'Ice Chuchu (Small)': 'iceChuchuSmall',
                'Electric Chuchu (Large)': 'electricChuchuLarge',
                'Electric Chuchu (Medium)': 'electricChuchuMedium',
                'Electric Chuchu (Small)': 'electricChuchuSmall',
                // Other monster mappings
                'Fire-breath Lizalfos': 'fireBreathLizalfos',
                'Ice-breath Lizalfos': 'iceBreathLizalfos',
                'Blue-Maned Lynel': 'blueManedLynel',
                'White-maned Lynel': 'whiteManedLynel',
                'Like Like': 'likeLike',
                'Gloom Hands': 'gloomHands',
                'Boss Bokoblin': 'bossBokoblin',
                'Moth Gibdo': 'mothGibdo',
                'Little Frox': 'littleFrox',
                'Yiga Blademaster': 'yigaBlademaster',
                'Yiga Footsoldier': 'yigaFootsoldier'
            };
            fieldName = manualMapping[monsterName] || toCamelCase(monsterName);
        }
        
        const query = {
            $or: [
                { monsterList: monsterName }, 
                { monsterList: { $in: [monsterName] } },
                { [fieldName]: true },
                { [monsterName]: true }  // Also check the original monster name as a field
            ],
        };
        
        const items = await db.collection("items").find(query).toArray();
        return items.filter((item) => item.itemName && item.itemRarity);
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching items by monster:", error);
        throw error;
    }
};

// ------------------- fetchCraftableItemsAndCheckMaterials -------------------
const fetchCraftableItemsAndCheckMaterials = async (inventory) => {
    try {
        const db = await connectToInventoriesForItems();
        const craftableItems = await db
            .collection("items")
            .find({ crafting: true })
            .toArray();
        const craftableItemsWithMaterials = [];

        for (const item of craftableItems) {
            const { craftingMaterial } = item;
            if (!craftingMaterial || craftingMaterial.length === 0) {
                continue;
            }
            const allMaterialsAvailable = checkMaterialAvailability(
                craftingMaterial,
                inventory
            );
            if (allMaterialsAvailable) {
                craftableItemsWithMaterials.push(item);
            }
        }
        return craftableItemsWithMaterials;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error(
            "[itemService.js]: ❌ Error fetching craftable items and checking materials:",
            error
        );
        throw error;
    }
};

// ------------------- getIngredientItems -------------------
const getIngredientItems = async (ingredientName) => {
 try {
  const items = await fetchAllItems();
  const craftingItems = items.filter((item) => item.crafting);
  const directMatches = craftingItems.filter((item) =>
   item.craftingMaterial.some(
    (material) => material.itemName.toLowerCase() === ingredientName.toLowerCase()
   )
  );
  const formattedResults = directMatches.map((item) => ({
   name: `**${item.emoji || "🔹"} ${item.itemName}** | ${
    item.staminaToCraft
   } 🟩 | ${item.craftingJobs.join(", ")}`,
   value: item.itemName,
   craftingMaterial: item.craftingMaterial,
  }));
  return formattedResults;
 } catch (error) {
  handleError(error, "itemService.js");
  console.error("[itemService.js]: ❌ Error fetching ingredient items:", error);
  throw error;
 }
};

// ------------------- fetchItemsByIds -------------------
const fetchItemsByIds = async (itemIds) => {
    try {
        const db = await connectToInventoriesForItems();
        const items = await db
            .collection("items")
            .find({ _id: { $in: itemIds } })
            .toArray();
        return items;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching items by IDs:", error);
        throw error;
    }
};

// ------------------- fetchItemRarityByName -------------------
const fetchItemRarityByName = async (itemName) => {
    try {
        const db = await connectToInventoriesForItems();
        const normalizedItemName = itemName.trim().toLowerCase();
        // Properly escape all regex special characters including +
        const escapedName = normalizedItemName.replace(/[.*?^${}()|[\]\\+]/g, "\\$&");
        const item = await db.collection("items").findOne({
            itemName: new RegExp(`^${escapedName}$`, "i"),
        });
        return item ? item.itemRarity : null;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error(
            "[itemService.js]: ❌ Error fetching item rarity by name:",
            error
        );
        throw error;
    }
};

// ------------------- fetchItemsByCategory -------------------
const fetchItemsByCategory = async (category) => {
    try {
        const db = await connectToInventoriesForItems();
        const items = await db
            .collection("items")
            .find({
                category: { $regex: `^${category}$`, $options: "i" },
            })
            .toArray();

        if (!items || items.length === 0) {
            return [];
        }
        return items;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error(
            "[itemService.js]: ❌ Error fetching items by category:",
            error
        );
        throw error;
    }
};

// ------------------- fetchValidWeaponSubtypes -------------------
const fetchValidWeaponSubtypes = async () => {
    try {
        const db = await connectToInventoriesForItems();
        const subtypes = await db.collection("items").distinct("subtype");
        return subtypes.filter(Boolean).map((sub) => sub.toLowerCase());
    } catch (error) {
        handleError(error, "itemService.js");
        console.error(
            "[itemService.js]: ❌ Error fetching valid weapon subtypes:",
            error
        );
        return [];
    }
};

// ============================================================================
// ------------------- Helper / Utility Functions   -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- toCamelCase -------------------
function toCamelCase(str) {
 return str.replace(/(?:^\w|[A-Z]|\b\w|\s+|[-()/])/g, (match, index) => {
  if (match === "-" || match === "(" || match === ")" || match === "/")
   return "";
  return index === 0 ? match.toLowerCase() : match.toUpperCase();
 });
}

// ============================================================================
// ------------------- Monster Service Functions -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- fetchAllMonsters -------------------
const fetchAllMonsters = async () => {
 try {
  return await Monster.find();
 } catch (error) {
  handleError(error, "monsterService.js");
  console.error("[monsterService.js]: ❌ Error fetching monsters:", error);
  throw error;
 }
};

// ------------------- fetchMonsterByName -------------------
const fetchMonsterByName = async (name) => {
 try {
  return await Monster.findOne({ name });
 } catch (error) {
  handleError(error, "monsterService.js");
  console.error(
   `[monsterService.js]: ❌ Error fetching monster with name "${name}":`,
   error
  );
  throw error;
 }
};

// ------------------- getMonsterDetailsByMapping -------------------
const getMonsterDetailsByMapping = async (nameMapping) => {
 if (!nameMapping) {
  console.error("[monsterService.js]: ❌ No nameMapping provided.");
  return null;
 }
 const normalizedMapping = toCamelCase(nameMapping);
 try {
  const monster = await Monster.findOne({ nameMapping: normalizedMapping });
  if (!monster) {
   console.error(
    `[monsterService.js]: ❌ No monster found with nameMapping: ${normalizedMapping}`
   );
   return null;
  }
  return monster;
 } catch (error) {
  handleError(error, "monsterService.js");
  console.error(
   "[monsterService.js]: ❌ Error fetching monster by mapping:",
   error
  );
  throw error;
 }
};

// ------------------- getMonstersAboveTier -------------------
async function getMonstersAboveTier(minTier = 5) {
 try {
  const monsters = await Monster.find({ tier: { $gte: minTier } }).exec();
  if (!monsters || monsters.length === 0) {
   console.error(
    `[monsterService.js]: ❌ No monsters found above tier ${minTier}.`
   );
   return null;
  }
  const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];
  return randomMonster;
 } catch (error) {
  handleError(error, "monsterService.js");
  console.error(
   `[monsterService.js]: ❌ Error fetching monsters above tier ${minTier}:`,
   error
  );
  return null;
 }
}

// ------------------- getMonstersAboveTierByRegion -------------------
async function getMonstersAboveTierByRegion(minTier = 5, region) {
 try {
  if (!region) {
   console.error(
    "[monsterService.js]: ❌ No region provided for filtering monsters."
   );
   return null;
  }
  const filter = {
   tier: { $gte: minTier },
   [region.toLowerCase()]: true,
  };
  const monsters = await Monster.find(filter).exec();
  if (!monsters || monsters.length === 0) {
   console.error(
    `[monsterService.js]: ❌ No monsters found above tier ${minTier} for region: ${region}.`
   );
   return null;
  }
  const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];
  return randomMonster;
 } catch (error) {
  handleError(error, "monsterService.js");
  console.error(
   `[monsterService.js]: ❌ Error fetching monsters above tier ${minTier} for region "${region}":`,
   error
  );
  return null;
 }
}

// ============================================================================
// ------------------- Quest Service Functions   -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- createQuest -------------------
async function createQuest(questData) {
 const quest = new Quest(questData);
 await quest.save();
 return quest;
}

// ------------------- joinQuest -------------------
async function joinQuest(userId, questId) {
 const quest = await Quest.findById(questId);
 if (!quest || quest.status !== "open")
  throw new Error("Quest is not available.");
 quest.participants.push(userId);
 await quest.save();
}

// ------------------- completeQuest -------------------
async function completeQuest(userId, questId) {
 const quest = await Quest.findById(questId);
 if (!quest) throw new Error("Quest not found.");
 return quest.rewards;
}

// ============================================================================
// ------------------- Relic Service Functions  -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- createRelic -------------------
const createRelic = async (relicData) => {
 try {
  await connectToTinglebot();
  const newRelic = new RelicModel(relicData);
  return await newRelic.save();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error creating relic:", error);
  throw error;
 }
};

// ------------------- fetchRelicsByCharacter -------------------
const fetchRelicsByCharacter = async (characterName) => {
 try {
  await connectToTinglebot();
  return await RelicModel.find({ discoveredBy: characterName }).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error(
   "[relicService.js]: ❌ Error fetching relics by character:",
   error
  );
  throw error;
 }
};

// ------------------- appraiseRelic -------------------
const appraiseRelic = async (
 relicId,
 appraiserName,
 description,
 rollOutcome
) => {
 try {
  await connectToTinglebot();
  const updateData = {
   appraised: true,
   appraisedBy: appraiserName,
   appraisalDate: new Date(),
   appraisalDescription: description,
  };
  if (rollOutcome) {
   updateData.rollOutcome = rollOutcome;
  }
  return await RelicModel.findByIdAndUpdate(relicId, updateData, { new: true });
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error appraising relic:", error);
  throw error;
 }
};

// ------------------- archiveRelic -------------------
const archiveRelic = async (relicId, imageUrl) => {
 try {
  await connectToTinglebot();
  return await RelicModel.findByIdAndUpdate(
   relicId,
   {
    artSubmitted: true,
    imageUrl: imageUrl,
    archived: true,
   },
   { new: true }
  );
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error archiving relic:", error);
  throw error;
 }
};

// ------------------- markRelicDeteriorated -------------------
const markRelicDeteriorated = async (relicId) => {
 try {
  await connectToTinglebot();
  return await RelicModel.findByIdAndUpdate(
   relicId,
   { deteriorated: true },
   { new: true }
  );
 } catch (error) {
  handleError(error, "relicService.js");
  console.error(
   "[relicService.js]: ❌ Error marking relic as deteriorated:",
   error
  );
  throw error;
 }
};

// ------------------- fetchArchivedRelics -------------------=
const fetchArchivedRelics = async () => {
 try {
  await connectToTinglebot();
  return await RelicModel.find({ archived: true }).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error fetching archived relics:", error);
  throw error;
 }
};

// ------------------- fetchRelicById -------------------
const fetchRelicById = async (relicId) => {
 try {
  await connectToTinglebot();
  return await RelicModel.findById(relicId).lean();
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error fetching relic by ID:", error);
  throw error;
 }
};

// ------------------- deleteAllRelics -------------------
const deleteAllRelics = async () => {
 try {
  await connectToTinglebot();
  return await RelicModel.deleteMany({});
 } catch (error) {
  handleError(error, "relicService.js");
  console.error("[relicService.js]: ❌ Error deleting relics:", error);
  throw error;
 }
};

// ============================================================================
// ------------------- Token Service Functions -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- getTokenBalance -------------------
async function getTokenBalance(userId) {
 try {
  const user = await User.findOne({ discordId: userId });
  return user?.tokens || 0;
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error("[tokenService.js]: ❌ Error fetching token balance:", error);
  throw error;
 }
}

// ------------------- getUserTokenData -------------------
async function getUserTokenData(userId) {
 try {
  const user = await User.findOne({ discordId: userId });
  if (!user) {
    return { tokens: 0, tokenTracker: '' };
  }
  return {
    tokens: user.tokens || 0
  };
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error("[tokenService.js]: ❌ Error fetching user token data:", error);
  throw error;
 }
}

// ------------------- getOrCreateToken -------------------
async function getOrCreateToken(userId) {
 await connectToTinglebot();
 let user = await User.findOne({ discordId: userId });

 if (!user) {
  user = new User({
   discordId: userId,
   tokens: 0,
  });
  await user.save();
  await user.save();
 }
 return user;
}

// ------------------- updateTokenBalance -------------------
async function updateTokenBalance(userId, change, transactionMetadata = null) {
 try {
  await connectToTinglebot();

  if (isNaN(change)) {
   throw new Error(
    `[tokenService.js]: Invalid token change value provided: ${change}`
   );
  }
  const normalizedChange = Number(change);
  if (!Number.isFinite(normalizedChange)) {
   throw new Error(
    `[tokenService.js]: Invalid token change value provided: ${change}`
   );
  }

  // Ensure user exists and has a discordId on insert.
  const user = await User.findOneAndUpdate(
   { discordId: userId },
   { $setOnInsert: { discordId: userId, tokens: 0 } },
   { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const currentBalance = user.tokens || 0;
  const newBalance = currentBalance + normalizedChange;
  if (newBalance < 0) {
   throw new Error(
    `[tokenService.js]: Insufficient tokens. Current balance: ${currentBalance}, Change: ${normalizedChange}`
   );
  }
  user.tokens = newBalance;
  await user.save();
  
  // Always log transactions for Dashboard history (best-effort; never fail the balance update).
  if (normalizedChange !== 0) {
   try {
    const TokenTransaction = require('../models/TokenTransactionModel');
    const transactionType = normalizedChange >= 0 ? 'earned' : 'spent';

    const meta = (transactionMetadata && typeof transactionMetadata === 'object')
     ? transactionMetadata
     : {};

    await TokenTransaction.createTransaction({
     userId: userId,
     amount: Math.abs(normalizedChange),
     type: transactionType,
     category: meta.category || 'system',
     description: meta.description || 'Token balance update',
     link: meta.link || '',
     balanceBefore: currentBalance,
     balanceAfter: newBalance
    });
   } catch (logError) {
    console.error('[tokenService.js]: ⚠️ Error logging token transaction:', logError);
   }
  }
  
  return newBalance;
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error updating token balance for user ID ${userId}:`,
   error
  );
  throw error;
 }
}

// ------------------- syncTokenTracker -------------------
// Note: Google Sheets sync functionality has been removed
async function syncTokenTracker(userId) {
  throw new Error("Token tracker sync is no longer supported. Google Sheets integration has been removed.");
}

// ------------------- appendEarnedTokens -------------------
async function appendEarnedTokens(
 userId,
 fileName,
 category,
 amount,
 fileUrl = ""
) {
 const user = await getOrCreateToken(userId);
 
 // Log to TokenTransactionModel
 try {
   const TokenTransaction = require('../models/TokenTransactionModel');
   const currentBalance = user.tokens || 0;
   await TokenTransaction.createTransaction({
     userId: userId,
     amount: amount,
     type: 'earned',
     category: category || '',
     description: fileName || '',
     link: fileUrl || '',
     balanceBefore: currentBalance,
     balanceAfter: currentBalance + amount
   });
 } catch (logError) {
   // Log error but don't fail the transaction
   console.error('[tokenService.js]: ⚠️ Error logging earned token transaction:', logError);
 }
}

// ------------------- appendSpentTokens -------------------
async function appendSpentTokens(userId, purchaseName, amount, link = "") {
 try {
  const user = await getOrCreateToken(userId);
  
  // Log to TokenTransactionModel
  try {
    const TokenTransaction = require('../models/TokenTransactionModel');
    const currentBalance = user.tokens || 0;
    await TokenTransaction.createTransaction({
      userId: userId,
      amount: amount,
      type: 'spent',
      category: '',
      description: purchaseName || '',
      link: link || '',
      balanceBefore: currentBalance,
      balanceAfter: currentBalance - amount
    });
  } catch (logError) {
    // Log error but don't fail the transaction
    console.error('[tokenService.js]: ⚠️ Error logging spent token transaction:', logError);
  }
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   "[tokenService.js]: ❌ Error appending spent token data:",
   error
  );
  throw error;
 }
}

// ------------------- getUserGoogleSheetId -------------------
// Note: Google Sheets functionality has been removed
async function getUserGoogleSheetId(userId) {
  return null;
}

// ------------------- getOrCreateUser -------------------
async function getOrCreateUser(discordId, timezone) {
 await connectToTinglebot();
 let user = await User.findOne({ discordId });

 if (!user) {
  user = new User({
   discordId,
   timezone: timezone || "UTC",
   tokens: 0,
   blightedcharacter: false,
  });
  await user.save();
 } else {
  user.timezone = timezone || user.timezone || "UTC";
  await user.save();
 }

 return user;
}

// ------------------- getUserById -------------------
const getUserById = async (discordId) => {
 console.log(`Fetching user by Discord ID: ${discordId}`);
 await connectToTinglebot();
 const user = await User.findOne({ discordId });
 console.log(`User found: ${user ? user.discordId : "Not found"}`);
 return user;
};

// ------------------- updateUserTokens -------------------
async function updateUserTokens(discordId, amount, activity, link = "") {
 await connectToTinglebot();
 const user = await User.findOne({ discordId });

 if (!user) {
  throw new Error("User not found");
 }

 user.tokens += amount;
 await user.save();

 return user;
}

// ------------------- updateUserTokenTracker -------------------
// Note: Google Sheets functionality has been removed - this function is kept for compatibility but does nothing
async function updateUserTokenTracker(discordId, tokenTracker) {
 await connectToTinglebot();
 const user = await User.findOne({ discordId });

 if (!user) {
  throw new Error("User not found");
 }

 return user;
}

// ============================================================================
// ------------------- Vending Service Functions  -------------------
// Brief description of what this section handles.
// ============================================================================

// ------------------- connectToDatabase -------------------
const connectToDatabase = async () => {
 const client = new MongoClient(inventoriesUri, {});
 try {
  await client.connect();
  return client;
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error connecting to database:", error);
  throw error;
 }
};

// ------------------- connectToTinglebotDatabase -------------------
const connectToTinglebotDatabase = async () => {
 const client = new MongoClient(tinglebotUri, {});
 try {
  await client.connect();
  return client;
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error connecting to tinglebot database:", error);
  throw error;
 }
};

// ------------------- clearExistingStock -------------------
const clearExistingStock = async () => {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  // Clear only the current month/year's stock to preserve historical data
  await stockCollection.deleteMany({ month: currentMonth, year: currentYear });
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error clearing vending stock:", error);
 } finally {
  await client.close();
 }
};

// ------------------- generateVendingStockList -------------------
const generateVendingStockList = async () => {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 const priorityItems = [
  "Leather",
  "Eldin Ore",
  "Wood",
  "Rock Salt",
  "Goat Butter",
  "Cotton",
  "Hylian Rice",
  "Iron bar",
  "Tabantha Wheat",
  "Wool",
  "Fresh Milk",
  "Goron Ore",
  "Bird Egg",
  "Luminous Stone",
  "Goron Spice",
  "Chuchu Jelly",
  "Gold Dust",
  "Cane Sugar",
  "Gold Bar",
  "Fancy Fabric",
  "Vintage Linen",
  "Bird Feather",
 ];

 try {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  await clearExistingStock();
  const allItems = await fetchAllItems();
  const merchantItems = allItems.filter(
   (item) => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10
  );
  const shopkeeperItems = allItems.filter(
   (item) => item.vending && item.itemRarity >= 1 && item.itemRarity <= 10
  );

  if (merchantItems.length === 0 || shopkeeperItems.length === 0) {
   throw new Error(
    "[vendingService.js]: ❌ Insufficient items available for generating stock."
   );
  }

  const generateRoundedPrice = (min, max) => {
   const randomPrice = min + Math.floor(Math.random() * (max - min + 1));
   const adjustedPrice = Math.round(randomPrice / 5) * 5;
   return Math.min(adjustedPrice, max);
  };

  const selectItemWithWeight = (items, weightThreshold) => {
   const weightedItems = items.flatMap((item) => {
    const weight = priorityItems.includes(item.itemName) ? weightThreshold : 1;
    return Array(weight).fill(item);
   });
   const randomIndex = Math.floor(Math.random() * weightedItems.length);
   return weightedItems[randomIndex];
  };

  const stockList = {};
  for (const villageName of VILLAGE_NAMES) {
   stockList[villageName] = [];

   while (
    stockList[villageName].filter((item) => item.vendingType === "Merchant")
     .length < 4
   ) {
    const randomIndex = Math.floor(Math.random() * merchantItems.length);
    const selectedItem = merchantItems[randomIndex];

    if (
     !stockList[villageName].some(
      (item) => item.itemName === selectedItem.itemName
     )
    ) {
     const points = generateRoundedPrice(5, 250);
     stockList[villageName].push({
      itemName: selectedItem.itemName,
      emoji: selectedItem.emoji,
      points,
      vendingType: "Merchant",
      itemRarity: selectedItem.itemRarity,
      village: villageName,
     });
    }
   }

   while (
    stockList[villageName].filter((item) => item.vendingType === "Shopkeeper")
     .length < 4
   ) {
    const selectedItem = selectItemWithWeight(shopkeeperItems, 5);

    if (
     !stockList[villageName].some(
      (item) => item.itemName === selectedItem.itemName
     )
    ) {
     const points = generateRoundedPrice(50, 300);
     stockList[villageName].push({
      itemName: selectedItem.itemName,
      emoji: selectedItem.emoji,
      points,
      vendingType: "Shopkeeper",
      itemRarity: selectedItem.itemRarity,
      village: villageName,
     });
    }
   }
  }

  const limitedItems = [];
  while (limitedItems.length < LIMITED_ITEMS_COUNT) {
   const randomIndex = Math.floor(Math.random() * allItems.length);
   const selectedItem = allItems[randomIndex];

   if (
    !limitedItems.some((item) => item.itemName === selectedItem.itemName) &&
    selectedItem.itemRarity >= 7 &&
    selectedItem.vending
   ) {
    const points = generateRoundedPrice(250, 500);
    const stock = Math.floor(Math.random() * 5) + 1;
    limitedItems.push({
     itemName: selectedItem.itemName,
     emoji: selectedItem.emoji,
     points,
     stock,
    });
   }
  }

  await stockCollection.insertOne({
   month: currentMonth,
   year: currentYear,
   stockList,
   limitedItems,
   createdAt: new Date(),
  });
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error generating vending stock list:",
   error
  );
 } finally {
  await client.close();
 }
};

// ------------------- getCurrentVendingStockList -------------------
const getCurrentVendingStockList = async () => {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  // First try with year field, then fall back to month only
  let currentStock = await stockCollection.findOne({ month: currentMonth, year: currentYear });
  if (!currentStock) {
   currentStock = await stockCollection.findOne({ month: currentMonth });
  }
  if (!currentStock) {
   return null;
  }

  const normalizedStockList = {};
  for (const village in currentStock.stockList) {
   const normalizedVillage = village.toLowerCase().trim();
   normalizedStockList[normalizedVillage] = currentStock.stockList[village];
  }

  return {
   ...currentStock,
   stockList: normalizedStockList,
  };
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error retrieving current vending stock list:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

// ------------------- getLimitedItems -------------------
const getLimitedItems = async () => {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const currentStock = await stockCollection.findOne({ month: currentMonth, year: currentYear });
  return currentStock ? currentStock.limitedItems : [];
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error retrieving limited items:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

// ------------------- updateItemStockByName -------------------
const updateItemStockByName = async (itemName, quantity) => {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });

  if (!currentStock) {
   throw new Error("[vendingService.js]: No current stock found");
  }

  const itemIndex = currentStock.limitedItems.findIndex(
   (item) => item.itemName === itemName
  );
  if (itemIndex === -1) {
   throw new Error("[vendingService.js]: Item not found in limited stock");
  }

  currentStock.limitedItems[itemIndex].stock -= quantity;

  await stockCollection.updateOne(
   { month: currentMonth },
   { $set: { limitedItems: currentStock.limitedItems } }
  );
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error(
   "[vendingService.js]: ❌ Error updating item stock by name:",
   error
  );
  throw error;
 } finally {
  await client.close();
 }
};

// ------------------- updateVendingStock -------------------
async function updateVendingStock({
 characterId,
 itemName,
 stockQty,
 tokenPrice,
 artPrice,
 otherPrice,
 tradesOpen,
}) {
 const client = await connectToTinglebotDatabase();
 const dbName = tinglebotUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const stockEntry = {
   characterId,
   itemName,
   stockQty,
   tokenPrice,
   artPrice,
   otherPrice,
   tradesOpen,
   updatedAt: new Date(),
  };

  await stockCollection.updateOne(
   { characterId, itemName },
   { $set: stockEntry },
   { upsert: true }
  );
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error updating vending stock:", error);
  throw error;
 } finally {
  await client.close();
 }
}

const getSpecificItems = (generalItemName) => {
 return generalCategories[generalItemName] || [];
};

const checkMaterialAvailability = (craftingMaterials, inventory) => {
 let allMaterialsAvailable = true;
 for (const material of craftingMaterials) {
  const { _id, itemName, quantity } = material;
  if (!_id) {
   const specificItems = getSpecificItems(itemName);
   if (specificItems.length === 0) {
    allMaterialsAvailable = false;
    continue;
   }
   let specificMaterialAvailable = false;
   for (const specificItem of specificItems) {
    if (checkMaterial(null, specificItem, quantity, inventory)) {
     specificMaterialAvailable = true;
     break;
    }
   }
   if (!specificMaterialAvailable) {
    allMaterialsAvailable = false;
   }
  } else {
   if (!checkMaterial(_id, itemName, quantity, inventory)) {
    allMaterialsAvailable = false;
   }
  }
 }
 return allMaterialsAvailable;
};

const checkMaterial = (materialId, materialName, quantityNeeded, inventory) => {
 try {
  if (!materialId && !materialName) {
   return false;
  }
  const itemById = materialId
   ? inventory.find(
      (inv) => inv.itemId && inv.itemId.toString() === materialId.toString()
     )
   : inventory.find((inv) => inv.itemName === materialName);
  return itemById && itemById.quantity >= quantityNeeded;
 } catch (error) {
  handleError(error, "itemService.js");
  console.error("[itemService.js]: ❌ Error checking material:", error);
  return false;
 }
};

const connectToInventoriesForItems = async (context = {}) => {
  try {
    return await DatabaseConnectionManager.connectToInventoriesForItems(context);
  } catch (error) {
    handleError(error, "db.js", context);
    logger.error('DATABASE', 'Failed to connect to items database');
    throw error;
  }
};

// Initialize the inventoryUtils module with the necessary functions
inventoryUtils.initializeInventoryUtils({
 connectToInventories,
 fetchItemByName,
 fetchCharacterById,
 fetchModCharacterById,
 getInventoryCollection,
});


// ============================================================================
// ------------------- Blight Roll History Functions -------------------
// Functions for tracking and managing blight roll history.
// ============================================================================

// ------------------- recordBlightRoll -------------------
const recordBlightRoll = async (characterId, characterName, userId, rollValue, previousStage, newStage, notes = '') => {
  try {
    await connectToTinglebot();
    const BlightRollHistory = require('../models/BlightRollHistoryModel');
    
    const rollRecord = new BlightRollHistory({
      characterId,
      characterName,
      userId,
      rollValue,
      previousStage,
      newStage,
      notes
    });

    await rollRecord.save();
    return rollRecord;
  } catch (error) {
    handleError(error, 'db.js');
    console.error(`[blightService]: Error recording blight roll: ${error.message}`);
    throw error;
  }
};

// ------------------- getCharacterBlightHistory -------------------
const getCharacterBlightHistory = async (characterId, limit = 10) => {
  try {
    await connectToTinglebot();
    const BlightRollHistory = require('../models/BlightRollHistoryModel');
    
    return await BlightRollHistory.find({ characterId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();
  } catch (error) {
    handleError(error, 'db.js');
    console.error(`[blightService]: Error fetching blight history: ${error.message}`);
    throw error;
  }
};

// ------------------- getUserBlightHistory -------------------
const getUserBlightHistory = async (userId, limit = 20) => {
  try {
    await connectToTinglebot();
    const BlightRollHistory = require('../models/BlightRollHistoryModel');
    
    return await BlightRollHistory.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();
  } catch (error) {
    handleError(error, 'db.js');
    console.error(`[blightService]: Error fetching user blight history: ${error.message}`);
    throw error;
  }
};



// ============================================================================
// ------------------- Module Exports -------------------
// Export all service functions and constants.
// ============================================================================

// ------------------- addItemToInventory -------------------
const addItemToInventory = async (inventoryCollection, itemName, quantity) => {
  try {
    const existingItem = await inventoryCollection.findOne({
      itemName: itemName.trim().toLowerCase()
    });

    if (existingItem) {
      await inventoryCollection.updateOne(
        { itemName: itemName.trim().toLowerCase() },
        { $inc: { quantity: quantity } }
      );
    } else {
      await inventoryCollection.insertOne({
        itemName: itemName.trim().toLowerCase(),
        quantity: quantity,
        date: new Date()
      });
    }
  } catch (error) {
    handleError(error, "db.js");
    console.error("[db.js]: Error adding item to inventory:", error);
    throw error;
  }
};

// Cleanup is handled by DatabaseConnectionManager

module.exports = {
 connectToTinglebot,
 connectToInventories,
 connectToInventoriesNative,
 getInventoryCollection,
 getCharactersInVillage,
 fetchCharacterByName,
 fetchAllCharacters,
 fetchCharacterById,
 fetchCharactersByUserId,
 fetchCharacterByNameAndUserId,
 fetchAnyCharacterByNameAndUserId,
 fetchAllCharactersExceptUser,
 createCharacter,
 updateCharacterById,
 deleteCharacterById,
 fetchBlightedCharactersByUserId,
 updateCharacterInventorySynced,
 getCharacterInventoryCollection,
 getCharacterInventoryCollectionWithModSupport,
 createCharacterInventory,
 transferCharacterInventoryToVillageShops,
 deleteCharacterInventoryCollection,
 getModSharedInventoryCollection,
 // Mod Character Functions
 fetchModCharacterByName,
 fetchModCharacterByNameAndUserId,
 fetchModCharactersByUserId,
 fetchAllModCharacters,
 createModCharacter,
 updateModCharacterById,
 deleteModCharacterById,
 fetchModCharacterById,
 addPetToCharacter,
 updatePetRolls,
 upgradePetLevel,
 updatePetToCharacter,
 resetPetRollsForAllCharacters,
 fetchAllItems,
 fetchItemByName,
 fetchItemById,
 fetchItemsByMonster,
 fetchCraftableItemsAndCheckMaterials,
 getIngredientItems,
 fetchItemsByIds,
 fetchItemRarityByName,
 fetchItemsByCategory,
 fetchValidWeaponSubtypes,
 getSpecificItems,
 fetchAllMonsters,
 fetchMonsterByName,
 getMonsterDetailsByMapping,
 getMonstersAboveTier,
 getMonstersAboveTierByRegion,
 createQuest,
 joinQuest,
 completeQuest,
 createRelic,
 fetchRelicsByCharacter,
 appraiseRelic,
 archiveRelic,
 markRelicDeteriorated,
 fetchArchivedRelics,
 fetchRelicById,
 deleteAllRelics,
 getOrCreateToken,
 updateTokenBalance,
 syncTokenTracker,
 appendEarnedTokens,
 appendSpentTokens,
 getUserGoogleSheetId,
 getTokenBalance,
 getUserTokenData,
 getOrCreateUser,
 getUserById,
 updateUserTokens,
 updateUserTokenTracker,
 connectToDatabase,
 clearExistingStock,
 generateVendingStockList,
 getCurrentVendingStockList,
 getLimitedItems,
 updateItemStockByName,
 updateVendingStock,
  VILLAGE_IMAGES,
  VILLAGE_ICONS,
  VILLAGE_BANNERS,
  connectToInventoriesForItems,
 checkMaterialAvailability,
 checkMaterial,
 recordBlightRoll,
 getCharacterBlightHistory,
 getUserBlightHistory,
 connectToVending,
 addItemToInventory,
 restorePetLevel,
 forceResetPetRolls,
 getDbOperationCounts
};