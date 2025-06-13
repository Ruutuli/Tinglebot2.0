// ------------------- Standard Libraries -------------------
const mongoose = require("mongoose");
const { MongoClient, ObjectId } = require("mongodb");

// ------------------- Third-Party Modules -------------------
const { google } = require("googleapis");

// ------------------- Project Utilities -------------------
const { handleError } = require("../utils/globalErrorHandler");
const {
 authorizeSheets,
 appendSheetData,
 extractSpreadsheetId,
 isValidGoogleSheetsUrl,
 readSheetData,
 safeAppendDataToSheet,
} = require("../utils/googleSheetsUtils");
const dbConfig = require('../config/database');

// Import inventoryUtils but don't use removeInitialItemIfSynced directly
const inventoryUtils = require("../utils/inventoryUtils");

// ------------------- Models -------------------
const Character = require("../models/CharacterModel");
const Monster = require("../models/MonsterModel");
const Quest = require("../models/QuestModel");
const RelicModel = require("../models/RelicModel");
const User = require("../models/UserModel");
const Pet = require("../models/PetModel");
const generalCategories = require("../models/GeneralItemCategories");

// ============================================================================
// ------------------- Database Connection Functions -------------------
// Functions to establish and retrieve MongoDB connections.
// ============================================================================
const tinglebotUri = dbConfig.tinglebot;
const inventoriesUri = dbConfig.inventories;
let tinglebotDbConnection;
let inventoriesDbConnection;
let inventoriesDbNativeConnection = null;
let vendingDbConnection = null;

// Add these at the top with other connection variables
let inventoriesClient = null;
let inventoriesDb = null;

// ============================================================================
// ------------------- Configuration Constants -------------------
// Definitions of static constants like village names and icons.
// ============================================================================

const VILLAGE_NAMES = ["Rudania", "Inariko", "Vhintl"];
const LIMITED_ITEMS_COUNT = 5;

const VILLAGE_IMAGES = {
 Rudania:
  "https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png",
 Inariko:
  "https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png",
 Vhintl:
  "https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png",
};

const VILLAGE_ICONS = {
 Rudania:
  "https://static.wixstatic.com/media/7573f4_ffb523e41dbb43c183283a5afbbc74e1~mv2.png",
 Inariko:
  "https://static.wixstatic.com/media/7573f4_066600957d904b1dbce10912d698f5a2~mv2.png",
 Vhintl:
  "https://static.wixstatic.com/media/7573f4_15ac377e0dd643309853fc77250a86a1~mv2.png",
};


// ------------------- connectToTinglebot -------------------
async function connectToTinglebot() {
 try {
  if (!tinglebotDbConnection || mongoose.connection.readyState === 0) {
   mongoose.set("strictQuery", false);
   const uri = dbConfig.tinglebot;
   try {
    tinglebotDbConnection = await mongoose.connect(uri, {
     serverSelectionTimeoutMS: 30000,
     socketTimeoutMS: 45000,
     connectTimeoutMS: 30000,
     maxPoolSize: 10,
     minPoolSize: 5,
     retryWrites: true,
     retryReads: true,
     w: 'majority',
     wtimeoutMS: 2500,
     heartbeatFrequencyMS: 10000,
     maxIdleTimeMS: 60000,
     family: 4
    });
   } catch (connectError) {
    // Try to reconnect once
    try {
     tinglebotDbConnection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 5,
      retryWrites: true,
      retryReads: true,
      w: 'majority',
      wtimeoutMS: 2500,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 60000,
      family: 4
     });
    } catch (retryError) {
     throw retryError;
    }
   }
  }
  return tinglebotDbConnection;
 } catch (error) {
  handleError(error, "connection.js");
  throw error;
 }
}

// ------------------- connectToInventories -------------------
async function connectToInventories() {
 try {
  if (!inventoriesDbConnection) {
   const uri = dbConfig.inventories;
   
   if (!uri) {
     throw new Error('Missing MongoDB URI for inventories database');
   }
   
   inventoriesDbConnection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    wtimeoutMS: 2500,
    heartbeatFrequencyMS: 10000,
    maxIdleTimeMS: 60000,
    family: 4
   });

   // Set the database name
   inventoriesDbConnection.useDb('inventories');
  }
  return inventoriesDbConnection;
 } catch (error) {
  handleError(error, "db.js");
  throw error;
 }
}

// ------------------- connectToInventoriesNative -------------------
const connectToInventoriesNative = async () => {
 if (!inventoriesDbNativeConnection) {
  const uri = dbConfig.inventories;
  
  if (!uri) {
    throw new Error('Missing MongoDB URI for inventories database');
  }
  
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    wtimeoutMS: 2500,
    heartbeatFrequencyMS: 10000,
    maxIdleTimeMS: 60000,
    family: 4
  });
  await client.connect();
  inventoriesDbNativeConnection = client.db('inventories');
 }
 return inventoriesDbNativeConnection;
};

// ------------------- getInventoryCollection -------------------
const getInventoryCollection = async (characterName) => {
 if (typeof characterName !== "string") {
  throw new Error("Character name must be a string.");
 }
 const inventoriesDb = await connectToInventoriesNative();
 const collectionName = characterName.trim().toLowerCase();
 return inventoriesDb.collection(collectionName);
};

// ------------------- connectToVending -------------------
async function connectToVending() {
 try {
  if (!vendingDbConnection) {
   const uri = dbConfig.vending;
   vendingDbConnection = await mongoose.createConnection(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    wtimeoutMS: 2500,
    heartbeatFrequencyMS: 10000,
    maxIdleTimeMS: 60000,
    family: 4
   });
   console.log(`[db.js]: 🔌 Connected to Vending database`);
  }
  return vendingDbConnection;
 } catch (error) {
  handleError(error, "db.js");
  console.error("❌ Error in connectToVending:", error);
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
  const character = await Character.findOne({
   name: new RegExp(`^${escapedName}$`, "i"),
  });

  if (!character) {
   console.log(
    `[characterService]: logs - Character "${actualName}" not found in database.`
   );
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
  return await Character.find({ userId, blighted: true }).lean().exec();
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
  return await Character.find().lean().exec();
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
   console.error(
    `[characterService]: logs - Character with ID "${characterId}" not found.`
   );
   throw new Error("Character not found");
  }
  return character;
 } catch (error) {
  handleError(error, "db.js");
  console.error(
   `[characterService]: logs - Error in fetchCharacterById: ${error.message}`
  );
  throw error;
 }
};

// ------------------- fetchCharactersByUserId -------------------
const fetchCharactersByUserId = async (userId) => {
  try {
    await connectToTinglebot();
    const characters = await Character.find({ userId }).lean().exec();
    return characters;
  } catch (error) {
    handleError(error, "db.js");
    throw error;
  }
};

// ------------------- fetchCharacterByNameAndUserId -------------------
const fetchCharacterByNameAndUserId = async (characterName, userId) => {
 try {
  await connectToTinglebot();
  // Get the actual name part before the "|" if it exists
  const actualName = characterName.split('|')[0].trim();
  
  // Escape special regex characters in the character name
  const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const character = await Character.findOne({
    name: new RegExp(`^${escapedName}$`, "i"),
    userId
  });

  if (!character) {
    console.log(`[characterService]: 🔍 Character "${actualName}" not found for userId: ${userId}`);
    return null;
  }

  return character;
 } catch (error) {
  handleError(error, "db.js");
  console.error(`[characterService]: ❌ Error searching for "${actualName}": ${error.message}`);
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
  return await Character.findByIdAndDelete(new ObjectId(characterId))
   .lean()
   .exec();
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
  await updateCharacterById(characterId, { inventorySynced: true });

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
       rollsRemaining: Math.min(newLevel, 3) // Reset rolls based on new level
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
      
      console.log(`[db.js]: ✅ Reset pet "${pet.name}" (${pet.ownerName}) from ${oldRolls} to ${newRolls} rolls`);
      successCount++;
    } catch (petError) {
      console.error(`[db.js]: ❌ Failed to reset pet "${pet.name}" (${pet.ownerName}): ${petError.message}`);
      failCount++;
    }
  }
  
  console.log(`[db.js]: 📊 Pet roll reset complete. Success: ${successCount}, Failed: ${failCount}`);
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
       rollsRemaining: Math.min(level, 3) // Also update rolls to match level
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
      { $set: { rollsRemaining: newRolls } }
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
        console.log(`[db.js]: 🔍 Fetching items from collection 'items' in database '${db.databaseName}'`);
        const items = await db.collection("items").find().toArray();
        console.log(`[db.js]: ✅ Found ${items.length} items in collection`);
        return items;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error fetching all items:", error);
        throw error;
    }
};

// ------------------- fetchItemByName -------------------
async function fetchItemByName(itemName) {
    try {
        const db = await connectToInventoriesForItems();
        const normalizedItemName = itemName.trim();
        const escapedName = normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const item = await db.collection("items").findOne({
            itemName: new RegExp(`^${escapedName}$`, "i"),
        });
        if (!item) {
            console.warn(`[itemService.js]: ⚠️ No item found for "${normalizedItemName}"`);
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
        const query = {
            $or: [{ monsterList: monsterName }, { [monsterName]: true }],
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
        const escapedName = normalizedItemName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
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
            console.warn(`[itemService.js]: ⚠️ No items found in category: ${category}`);
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

 const auth = await authorizeSheets();
 await appendSheetData(auth, quest.spreadsheetId, "Quests!A1", [
  [userId, questId, quest.rewards],
 ]);
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

// ------------------- getOrCreateToken -------------------
async function getOrCreateToken(userId, tokenTrackerLink = "") {
 await connectToTinglebot();
 let user = await User.findOne({ discordId: userId });

 if (!user) {
  user = new User({
   discordId: userId,
   tokens: 0,
   tokenTracker: tokenTrackerLink || "",
   tokensSynced: false,
  });
  await user.save();
 } else if (tokenTrackerLink && !user.tokenTracker) {
  user.tokenTracker = tokenTrackerLink;
  await user.save();
 }
 return user;
}

// ------------------- updateTokenBalance -------------------
async function updateTokenBalance(userId, change) {
 try {
  if (isNaN(change)) {
   throw new Error(
    `[tokenService.js]: Invalid token change value provided: ${change}`
   );
  }
  const user = await User.findOneAndUpdate(
   { discordId: userId },
   {},
   { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const currentBalance = user.tokens || 0;
  const newBalance = currentBalance + change;
  if (newBalance < 0) {
   throw new Error(
    `[tokenService.js]: Insufficient tokens. Current balance: ${currentBalance}, Change: ${change}`
   );
  }
  user.tokens = newBalance;
  await user.save();
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
async function syncTokenTracker(userId) {
 try {
  const user = await getOrCreateToken(userId);
  if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
   throw new Error("Invalid URL");
  }

  const auth = await authorizeSheets();
  const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
  const range = "loggedTracker!B7:F";
  const sheetData = await readSheetData(auth, spreadsheetId, range);

  // Validate headers
  const headers = sheetData[0];
  if (!headers || headers.length < 5) {
    throw new Error("Invalid sheet format. Please ensure your sheet has the correct headers in row 7.");
  }

  // Check if there are any earned entries
  const hasEarnedEntries = sheetData.slice(1).some(row => row[3] === "earned");
  if (!hasEarnedEntries) {
    throw new Error("No 'earned' entries found in your token tracker. Please add at least one entry with type 'earned' in column E.");
  }

  let totalEarned = 0;
  let totalSpent = 0;

  sheetData.slice(1).forEach((row) => {
    if (row.length < 5) return; // Skip invalid rows
    const amount = parseInt(row[4]);
    if (isNaN(amount)) return; // Skip rows with invalid amounts
    
    if (row[3] === "earned") {
      totalEarned += amount;
    } else if (row[3] === "spent") {
      totalSpent += Math.abs(amount);
    }
  });

  user.tokens = totalEarned - totalSpent;
  user.tokensSynced = true;
  await user.save();

  return user;
 } catch (error) {
  // Only log non-validation errors
  if (!error.message.includes('No \'earned\' entries found') && 
      !error.message.includes('Invalid sheet format') && 
      !error.message.includes('Invalid URL')) {
    handleError(error, "tokenService.js");
    console.error("[tokenService.js]: ❌ Error syncing token tracker:", error);
  }
  throw error; // Pass the original error to maintain the specific error message
 }
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
 const tokenTrackerLink = user.tokenTracker;
 if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
  throw new Error(
   `[tokenService.js]: Invalid Google Sheets URL for user ${userId}`
  );
 }
 const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
 const auth = await authorizeSheets();
 const checkRange = "loggedTracker!B7:F";
 let nextRow = 7;
 try {
  const response = await google
   .sheets({ version: "v4", auth })
   .spreadsheets.values.get({
    spreadsheetId,
    range: checkRange,
   });
  const rows = response.data.values || [];
  nextRow += rows.length;
  const appendRange = `loggedTracker!B${nextRow}:F`;
  const newRow = [fileName, fileUrl, category, "earned", `${amount}`];
  await google.sheets({ version: "v4", auth }).spreadsheets.values.update({
   spreadsheetId,
   range: appendRange,
   valueInputOption: "USER_ENTERED",
   resource: { values: [newRow] },
  });
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error appending earned token data: ${error.message}`
  );
  throw new Error("Error appending earned token data to the Google Sheet.");
 }
}

// ------------------- appendSpentTokens -------------------
async function appendSpentTokens(userId, purchaseName, amount, link = "") {
 try {
  const user = await getOrCreateToken(userId);
  const tokenTrackerLink = user.tokenTracker;
  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
   throw new Error(
    `[tokenService.js]: Invalid Google Sheets URL for user ID: ${userId}`
   );
  }
  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();
  const newRow = [purchaseName, link, "", "spent", `-${amount}`];
  await safeAppendDataToSheet(character.inventory, character, "loggedTracker!B7:F", [newRow]);
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
async function getUserGoogleSheetId(userId) {
 try {
  const user = await User.findOne({ discordId: userId });
  if (user && user.tokenTracker) {
   if (!isValidGoogleSheetsUrl(user.tokenTracker)) {
    throw new Error(
     `[tokenService.js]: Invalid Google Sheets URL for user ${userId}`
    );
   }
   return extractSpreadsheetId(user.tokenTracker);
  } else {
   console.error(
    `[tokenService.js]: No Token Tracker linked for user ${userId}`
   );
   return null;
  }
 } catch (error) {
  handleError(error, "tokenService.js");
  console.error(
   `[tokenService.js]: ❌ Error retrieving Token Tracker ID for user ${userId}:`,
   error.message
  );
  return null;
 }
}

// ------------------- getOrCreateUser -------------------
async function getOrCreateUser(discordId, googleSheetsUrl, timezone) {
 await connectToTinglebot();
 let user = await User.findOne({ discordId });

 if (!user) {
  user = new User({
   discordId,
   googleSheetsUrl: googleSheetsUrl || "",
   timezone: timezone || "UTC",
   tokens: 0,
   tokenTracker: "",
   blightedcharacter: false,
  });
  await user.save();
 } else {
  user.googleSheetsUrl = googleSheetsUrl || user.googleSheetsUrl || "";
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

 if (user.tokenTracker) {
  const auth = await authorizeSheets();
  const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
  const range = "loggedTracker!B:F";
  const dateTime = new Date().toISOString();
  const values = [["Update", activity, link, amount.toString(), dateTime]];
  if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values);
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

 }

 return user;
}

// ------------------- updateUserTokenTracker -------------------
async function updateUserTokenTracker(discordId, tokenTracker) {
 await connectToTinglebot();
 const user = await User.findOneAndUpdate(
  { discordId },
  { tokenTracker },
  { new: true }
 );

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

// ------------------- clearExistingStock -------------------
const clearExistingStock = async () => {
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  await stockCollection.deleteMany({});
 } catch (error) {
  handleError(error, "vendingService.js");
  console.error("[vendingService.js]: ❌ Error clearing vending stock:", error);
 } finally {
  await client.close();
 }
};

// ------------------- generateVendingStockList -------------------
const generateVendingStockList = async () => {
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
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
  const currentMonth = new Date().getMonth() + 1;
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
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });
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
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
 const db = client.db(dbName);
 const stockCollection = db.collection("vending_stock");

 try {
  const currentMonth = new Date().getMonth() + 1;
  const currentStock = await stockCollection.findOne({ month: currentMonth });
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
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
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
 const client = await connectToDatabase();
 const dbName = inventoriesUri.split('/').pop();
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

const connectToInventoriesForItems = async () => {
    try {
        if (!inventoriesClient) {
            const env = process.env.NODE_ENV || 'development';
            const uri = env === 'development' ? dbConfig.tinglebot : dbConfig.tinglebot;
            inventoriesClient = new MongoClient(uri, {
                maxPoolSize: 10,
                minPoolSize: 5,
                serverSelectionTimeoutMS: 30000,
                connectTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                retryWrites: true,
                retryReads: true,
                w: 'majority',
                wtimeoutMS: 2500,
                heartbeatFrequencyMS: 10000,
                maxIdleTimeMS: 60000,
                family: 4
            });
            await inventoriesClient.connect();
            // Use tinglebot database for items
            inventoriesDb = inventoriesClient.db('tinglebot');
            console.log(`[db.js]: 🔌 Connected to Items database: tinglebot`);
        } else {
            // Try to ping the server to check connection
            try {
                await inventoriesClient.db('tinglebot').command({ ping: 1 });
            } catch (error) {
                // If ping fails, reconnect
                await inventoriesClient.close();
                const env = process.env.NODE_ENV || 'development';
                const uri = env === 'development' ? dbConfig.tinglebot : dbConfig.tinglebot;
                inventoriesClient = new MongoClient(uri, {
                    maxPoolSize: 10,
                    minPoolSize: 5,
                    serverSelectionTimeoutMS: 30000,
                    connectTimeoutMS: 30000,
                    socketTimeoutMS: 45000,
                    retryWrites: true,
                    retryReads: true,
                    w: 'majority',
                    wtimeoutMS: 2500,
                    heartbeatFrequencyMS: 10000,
                    maxIdleTimeMS: 60000,
                    family: 4
                });
                await inventoriesClient.connect();
                inventoriesDb = inventoriesClient.db('tinglebot');
                console.log(`[db.js]: 🔌 Reconnected to Items database: tinglebot`);
            }
        }
        return inventoriesDb;
    } catch (error) {
        handleError(error, "itemService.js");
        console.error("[itemService.js]: ❌ Error connecting to Items database:", error);
        throw error;
    }
};

// Initialize the inventoryUtils module with the necessary functions
inventoryUtils.initializeInventoryUtils({
 connectToInventories,
 fetchItemByName,
 fetchCharacterById,
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

// Add this at the end of the file, before module.exports
process.on('SIGINT', async () => {
    if (inventoriesClient) {
        await inventoriesClient.close();
    }
    process.exit(0);
});

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
 fetchAllCharactersExceptUser,
 createCharacter,
 updateCharacterById,
 deleteCharacterById,
 fetchBlightedCharactersByUserId,
 updateCharacterInventorySynced,
 getCharacterInventoryCollection,
 createCharacterInventory,
 deleteCharacterInventoryCollection,
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
 connectToInventoriesForItems,
 checkMaterialAvailability,
 checkMaterial,
 recordBlightRoll,
 getCharacterBlightHistory,
 getUserBlightHistory,
 connectToVending,
 addItemToInventory,
 restorePetLevel,
 forceResetPetRolls
};