// ============================================================================
// ------------------- Character Service -------------------
// CRUD and helper functions for Character and ModCharacter entities
// ============================================================================

const { ObjectId } = require('mongodb');
const DatabaseConnectionManager = require('../connectionManager');
const Character = require('../../models/CharacterModel');
const ModCharacter = require('../../models/ModCharacterModel');
const path = require('path');

// Try to import utilities (may not be available in all contexts)
let handleError = null;
let inventoryUtils = null;

try {
  const errorHandlerPath = path.join(__dirname, '..', '..', 'bot', 'utils', 'globalErrorHandler');
  const errorHandler = require(errorHandlerPath);
  handleError = errorHandler.handleError;
} catch (e) {
  handleError = (error, source) => {
    console.error(`[${source || 'characterService'}] Error:`, error.message);
  };
}

try {
  inventoryUtils = require(path.join(__dirname, '..', '..', 'bot', 'utils', 'inventoryUtils'));
} catch (e) {
  // inventoryUtils may not be available
}

// ------------------- getCharactersInVillage -------------------
async function getCharactersInVillage(userId, village) {
  try {
    const characters = await fetchCharactersByUserId(userId);
    return characters.filter(
      (character) =>
        character.currentVillage.toLowerCase() === village.toLowerCase()
    );
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in getCharactersInVillage: ${error.message}`
    );
    throw error;
  }
}

// ------------------- fetchCharacterByName -------------------
const fetchCharacterByName = async (characterName) => {
  const actualName = characterName.split('|')[0].trim();
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await Character.findOne({
      name: new RegExp(`^${escapedName}$`, "i"),
    });

    if (!character) {
      return null;
    }
    return character;
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `❌ Error fetching character "${actualName}": ${error.message}`
    );
    throw error;
  }
};

// ------------------- fetchBlightedCharactersByUserId -------------------
const fetchBlightedCharactersByUserId = async (userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    return await Character.find({ userId, blighted: true }).lean().exec();
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in fetchBlightedCharactersByUserId: ${error.message}`
    );
    throw error;
  }
};

// ------------------- fetchAllCharacters -------------------
const fetchAllCharacters = async () => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    return await Character.find().lean().exec();
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in fetchAllCharacters: ${error.message}`
    );
    throw error;
  }
};

// ------------------- fetchCharacterById -------------------
const fetchCharacterById = async (characterId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const character = await Character.findById(characterId);
    if (!character) {
      return null;
    }
    return character;
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in fetchCharacterById: ${error.message}`
    );
    throw error;
  }
};

// ------------------- fetchCharactersByUserId -------------------
const fetchCharactersByUserId = async (userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const characters = await Character.find({ userId }).lean().exec();
    return characters;
  } catch (error) {
    handleError(error, "characterService");
    throw error;
  }
};

// ------------------- fetchCharacterByNameAndUserId -------------------
const fetchCharacterByNameAndUserId = async (characterName, userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();

    if (!characterName) {
      return null;
    }

    const actualName = characterName.split('|')[0].trim();
    const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const character = await Character.findOne({
      name: new RegExp(`^${escapedName}$`, "i"),
      userId
    });

    if (!character) {
      return null;
    }

    return character;
  } catch (error) {
    handleError(error, "characterService");
    const actualName = characterName ? characterName.split('|')[0].trim() : 'null/undefined';
    console.error(`[characterService]: ❌ Error searching for "${actualName}": ${error.message}`);
    throw error;
  }
};

// ------------------- fetchAnyCharacterByNameAndUserId -------------------
const fetchAnyCharacterByNameAndUserId = async (characterName, userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const actualName = characterName.split('|')[0].trim();
    const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const character = await Character.findOne({
      name: new RegExp(`^${escapedName}$`, "i"),
      userId
    });

    if (character) {
      return character;
    }

    const modCharacter = await ModCharacter.findOne({
      name: new RegExp(`^${escapedName}$`, "i"),
      userId
    });

    return modCharacter;
  } catch (error) {
    handleError(error, "characterService");
    console.error(`[characterService]: ❌ Error searching for "${characterName.split('|')[0].trim()}" in both character collections: ${error.message}`);
    throw error;
  }
};

// ------------------- fetchAllCharactersExceptUser -------------------
const fetchAllCharactersExceptUser = async (userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    return await Character.find({ userId: { $ne: userId } }).exec();
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in fetchAllCharactersExceptUser: ${error.message}`
    );
    throw error;
  }
};

// ------------------- createCharacter -------------------
const createCharacter = async (characterData) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const character = new Character(characterData);
    await character.save();
    return character;
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in createCharacter: ${error.message}`
    );
    throw error;
  }
};

// ------------------- updateCharacterById -------------------
const updateCharacterById = async (characterId, updateData) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    return await Character.findByIdAndUpdate(
      new ObjectId(characterId),
      updateData,
      { new: true }
    )
      .lean()
      .exec();
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in updateCharacterById: ${error.message}`
    );
    throw error;
  }
};

// ------------------- deleteCharacterById -------------------
const deleteCharacterById = async (characterId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    return await Character.findByIdAndDelete(new ObjectId(characterId))
      .lean()
      .exec();
  } catch (error) {
    handleError(error, "characterService");
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

    if (inventoryUtils && inventoryUtils.removeInitialItemIfSynced) {
      await inventoryUtils.removeInitialItemIfSynced(characterId);
    }
  } catch (error) {
    handleError(error, "characterService");
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
    await DatabaseConnectionManager.connectToInventories();
    const collectionName = characterName.trim().toLowerCase();
    return await DatabaseConnectionManager.getInventoryCollection(collectionName);
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in getCharacterInventoryCollection for "${characterName}": ${error.message}`
    );
    throw error;
  }
};

// ------------------- getCharacterInventoryCollectionWithModSupport -------------------
const getCharacterInventoryCollectionWithModSupport = async (characterOrName) => {
  try {
    await DatabaseConnectionManager.connectToInventories();
    let collectionName;
    if (typeof characterOrName === 'object' && characterOrName.isModCharacter) {
      collectionName = characterOrName.name.toLowerCase();
    } else if (typeof characterOrName === 'object') {
      collectionName = characterOrName.name.toLowerCase();
    } else {
      collectionName = characterOrName.trim().toLowerCase();
    }
    return await DatabaseConnectionManager.getInventoryCollection(collectionName);
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in getCharacterInventoryCollectionWithModSupport: ${error.message}`
    );
    throw error;
  }
};

// ------------------- createCharacterInventory -------------------
const createCharacterInventory = async (characterName, characterId, job) => {
  try {
    const collection = await DatabaseConnectionManager.getInventoryCollection(characterName);
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
    handleError(error, "characterService");
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
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in deleteCharacterInventoryCollection for "${characterName}": ${error.message}`
    );
    throw error;
  }
};

// ------------------- getModSharedInventoryCollection -------------------
const getModSharedInventoryCollection = async () => {
  try {
    await DatabaseConnectionManager.connectToInventories();
    const collectionName = 'mod_shared_inventory';
    return await DatabaseConnectionManager.getInventoryCollection(collectionName);
  } catch (error) {
    handleError(error, "characterService");
    console.error(
      `[characterService]: logs - Error in getModSharedInventoryCollection: ${error.message}`
    );
    throw error;
  }
};

// ============================================================================
// ------------------- Mod Character Functions -------------------
// ============================================================================

const fetchModCharacterByNameAndUserId = async (characterName, userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const actualName = characterName.split('|')[0].trim();
    const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const modCharacter = await ModCharacter.findOne({
      name: new RegExp(`^${escapedName}$`, "i"),
      userId
    });

    if (!modCharacter) {
      return null;
    }

    return modCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "fetchModCharacterByNameAndUserId",
      characterName: characterName,
      userId: userId,
    });
    throw error;
  }
};

const fetchModCharacterByName = async (characterName) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const actualName = characterName.split('|')[0].trim();
    const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const modCharacter = await ModCharacter.findOne({
      name: new RegExp(`^${escapedName}$`, "i")
    });

    if (!modCharacter) {
      return null;
    }

    return modCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "fetchModCharacterByName",
      characterName: characterName,
    });
    throw error;
  }
};

const fetchModCharactersByUserId = async (userId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const modCharacters = await ModCharacter.find({ userId: userId });
    return modCharacters;
  } catch (error) {
    handleError(error, "characterService", {
      function: "fetchModCharactersByUserId",
      userId: userId,
    });
    throw error;
  }
};

const fetchAllModCharacters = async () => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const modCharacters = await ModCharacter.find({});
    return modCharacters;
  } catch (error) {
    handleError(error, "characterService", {
      function: "fetchAllModCharacters",
    });
    throw error;
  }
};

const createModCharacter = async (modCharacterData) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const modCharacter = new ModCharacter(modCharacterData);
    const savedModCharacter = await modCharacter.save();
    return savedModCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "createModCharacter",
      modCharacterData: modCharacterData,
    });
    throw error;
  }
};

const updateModCharacterById = async (modCharacterId, updateData) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const updatedModCharacter = await ModCharacter.findByIdAndUpdate(
      modCharacterId,
      updateData,
      { new: true }
    );
    return updatedModCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "updateModCharacterById",
      modCharacterId: modCharacterId,
      updateData: updateData,
    });
    throw error;
  }
};

const deleteModCharacterById = async (modCharacterId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const deletedModCharacter = await ModCharacter.findByIdAndDelete(modCharacterId);
    return deletedModCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "deleteModCharacterById",
      modCharacterId: modCharacterId,
    });
    throw error;
  }
};

const fetchModCharacterById = async (modCharacterId) => {
  try {
    await DatabaseConnectionManager.connectToTinglebot();
    const modCharacter = await ModCharacter.findById(modCharacterId);
    return modCharacter;
  } catch (error) {
    handleError(error, "characterService", {
      function: "fetchModCharacterById",
      modCharacterId: modCharacterId,
    });
    throw error;
  }
};

module.exports = {
  getCharactersInVillage,
  fetchCharacterByName,
  fetchBlightedCharactersByUserId,
  fetchAllCharacters,
  fetchCharacterById,
  fetchCharactersByUserId,
  fetchCharacterByNameAndUserId,
  fetchAnyCharacterByNameAndUserId,
  fetchAllCharactersExceptUser,
  createCharacter,
  updateCharacterById,
  deleteCharacterById,
  updateCharacterInventorySynced,
  getCharacterInventoryCollection,
  getCharacterInventoryCollectionWithModSupport,
  createCharacterInventory,
  deleteCharacterInventoryCollection,
  getModSharedInventoryCollection,
  fetchModCharacterByName,
  fetchModCharacterByNameAndUserId,
  fetchModCharactersByUserId,
  fetchAllModCharacters,
  createModCharacter,
  updateModCharacterById,
  deleteModCharacterById,
  fetchModCharacterById
};

