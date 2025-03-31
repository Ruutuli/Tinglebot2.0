// ------------------- Third-Party Libraries -------------------
const { ObjectId } = require('mongodb');

// ------------------- Database Connections -------------------
const { connectToInventories, connectToTinglebot } = require('../database/connection');

// ------------------- Database Models -------------------
const Character = require('../models/CharacterModel');
const Pet = require('../models/PetModel');

// ------------------- Database Services / Helpers -------------------
const { getInventoryCollection } = require('../database/nativeMongoHelper');


// ------------------- Character Services -------------------

// ------------------- Get Characters in a Specific Village -------------------
// Fetches all characters for a given user and filters them by their current village (case-insensitive)
async function getCharactersInVillage(userId, village) {
    try {
        const characters = await fetchCharactersByUserId(userId);
        return characters.filter(character =>
            character.currentVillage.toLowerCase() === village.toLowerCase()
        );
    } catch (error) {
        console.error(`[characterService]: logs - Error in getCharactersInVillage: ${error.message}`);
        throw error;
    }
}

// ------------------- Fetch Character by Name -------------------
// Searches for a character by name (case-insensitive) and returns the character if found
const fetchCharacterByName = async (characterName) => {
    try {
        await connectToTinglebot();
        const character = await Character.findOne({ name: new RegExp(`^${characterName.trim()}$`, 'i') });
        
        if (!character) {
            console.error(`[characterService]: logs - Character "${characterName}" not found in database.`);
            throw new Error('Character not found');
        }
        return character;
    } catch (error) {
        console.error(`❌ Error fetching character "${characterName}": ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch Blighted Characters by User ID -------------------
// Retrieves all characters for a given user that are marked as blighted
const fetchBlightedCharactersByUserId = async (userId) => {
    try {
        await connectToTinglebot();
        return await Character.find({ userId, blighted: true }).lean().exec();
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchBlightedCharactersByUserId: ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch All Characters -------------------
// Retrieves all characters from the database
const fetchAllCharacters = async () => {
    try {
        await connectToTinglebot();
        return await Character.find().lean().exec();
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchAllCharacters: ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch Character by ID -------------------
// Retrieves a character using its unique ID
const fetchCharacterById = async (characterId) => {
    try {
        await connectToTinglebot();
        const character = await Character.findById(characterId);
        if (!character) {
            console.error(`[characterService]: logs - Character with ID "${characterId}" not found.`);
            throw new Error('Character not found');
        }
        return character;
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchCharacterById: ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch Characters by User ID -------------------
// Retrieves all characters associated with a specific user
const fetchCharactersByUserId = async (userId) => {
    try {
        await connectToTinglebot();
        const characters = await Character.find({ userId }).lean().exec();
        return characters;
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchCharactersByUserId: ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch Character by Name and User ID -------------------
// Retrieves a character by matching both the name and user ID
const fetchCharacterByNameAndUserId = async (characterName, userId) => {
    try {
        await connectToTinglebot();
        const character = await Character.findOne({ name: characterName, userId });
        return character;
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchCharacterByNameAndUserId: ${error.message}`);
        throw error;
    }
};

// ------------------- Fetch All Characters Except a Specific User -------------------
// Retrieves all characters that do not belong to the specified user
const fetchAllCharactersExceptUser = async (userId) => {
    try {
        await connectToTinglebot();
        return await Character.find({ userId: { $ne: userId } }).exec();
    } catch (error) {
        console.error(`[characterService]: logs - Error in fetchAllCharactersExceptUser: ${error.message}`);
        throw error;
    }
};

// ------------------- Create a New Character -------------------
// Creates and saves a new character using the provided character data
const createCharacter = async (characterData) => {
    try {
        await connectToTinglebot();
        const character = new Character(characterData);
        await character.save();
        return character;
    } catch (error) {
        console.error(`[characterService]: logs - Error in createCharacter: ${error.message}`);
        throw error;
    }
};

// ------------------- Update a Character by ID -------------------
// Updates a character's details based on its ID and the provided update data
const updateCharacterById = async (characterId, updateData) => {
    try {
        await connectToTinglebot();
        return await Character.findByIdAndUpdate(new ObjectId(characterId), updateData, { new: true }).lean().exec();
    } catch (error) {
        console.error(`[characterService]: logs - Error in updateCharacterById: ${error.message}`);
        throw error;
    }
};

// ------------------- Delete a Character by ID -------------------
// Deletes a character from the database using its unique ID
const deleteCharacterById = async (characterId) => {
    try {
        await connectToTinglebot();
        return await Character.findByIdAndDelete(new ObjectId(characterId)).lean().exec();
    } catch (error) {
        console.error(`[characterService]: logs - Error in deleteCharacterById: ${error.message}`);
        throw error;
    }
};

// ------------------- Update Character Inventory Synced -------------------
// Marks a character's inventory as synced and removes the initial item if synced
// **Note:** Assumes that removeInitialItemIfSynced is defined elsewhere in your codebase.
const updateCharacterInventorySynced = async (characterId) => {
    try {
        await updateCharacterById(characterId, { inventorySynced: true });
        await removeInitialItemIfSynced(characterId);
    } catch (error) {
        console.error(`[characterService]: logs - Error in updateCharacterInventorySynced: ${error.message}`);
        throw error;
    }
};


// ------------------- Inventory Services -------------------

// ------------------- Get Character Inventory Collection -------------------
// Retrieves the inventory collection for a specific character by name
const getCharacterInventoryCollection = async (characterName) => {
    try {
        if (typeof characterName !== 'string') {
            throw new TypeError(`Expected a string for characterName, but received ${typeof characterName}`);
        }
        await connectToInventories();
        const collectionName = characterName.trim().toLowerCase();
        return await getInventoryCollection(collectionName);
    } catch (error) {
        console.error(`[characterService]: logs - Error in getCharacterInventoryCollection for "${characterName}": ${error.message}`);
        throw error;
    }
};

// ------------------- Create Character Inventory -------------------
// Initializes a new inventory for a character with default item values
const createCharacterInventory = async (characterName, characterId, job) => {
    try {
        const collection = await getInventoryCollection(characterName);
        const initialInventory = {
            characterId,
            itemName: 'Initial Item',
            quantity: 1,
            category: 'Misc',
            type: 'Misc',
            subtype: 'Misc',
            job,
            perk: '',
            location: '',
            link: '',
            date: new Date(),
            obtain: []
        };
        await collection.insertOne(initialInventory);
    } catch (error) {
        console.error(`[characterService]: logs - Error in createCharacterInventory for "${characterName}": ${error.message}`);
        throw error;
    }
};

// ------------------- Delete Character Inventory Collection -------------------
// Drops the entire inventory collection associated with a specific character
const deleteCharacterInventoryCollection = async (characterName) => {
    try {
        const collection = await getCharacterInventoryCollection(characterName);
        await collection.drop();
    } catch (error) {
        console.error(`[characterService]: logs - Error in deleteCharacterInventoryCollection for "${characterName}": ${error.message}`);
        throw error;
    }
};


// ------------------- Pet Services -------------------

// ------------------- Add a New Pet to a Character -------------------
// Adds a new pet object to the specified character's pets array
async function addPetToCharacter(characterId, petName, species, size, level, perk) {
    try {
        await Character.findByIdAndUpdate(characterId, {
            $push: {
                pets: {
                    name: petName,
                    species: species,
                    size: size,           // Expected values: Small or Large pet
                    level: level,         // Starting level of the pet
                    rollsRemaining: 1,    // Default number of rolls remaining
                    perks: [perk]         // Array to support future additional perks
                }
            }
        });
    } catch (error) {
        console.error(`[characterService]: logs - Error in addPetToCharacter: ${error.message}`);
        throw error;
    }
}
  
// ------------------- Update Pet Rolls -------------------
// Updates the 'rollsRemaining' field for a pet identified by its ObjectId or name
async function updatePetRolls(characterId, petIdentifier, newRolls) {
    try {
        let filter;
        // Determine filter criteria based on whether petIdentifier is a valid ObjectId
        if (petIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
            filter = { _id: petIdentifier, owner: characterId };
        } else {
            filter = { name: petIdentifier, owner: characterId };
        }
        await Pet.updateOne(filter, { $set: { rollsRemaining: newRolls } });
    } catch (error) {
        console.error(`[characterService]: logs - updatePetRolls error: ${error.message}`);
        throw error;
    }
}
  
// ------------------- Upgrade Pet Level -------------------
// Updates the level of a specific pet belonging to a character
async function upgradePetLevel(characterId, petName, newLevel) {
    try {
        await Character.updateOne(
            { _id: characterId, 'pets.name': petName },
            { $set: { 'pets.$.level': newLevel } }
        );
    } catch (error) {
        console.error(`[characterService]: logs - Error in upgradePetLevel: ${error.message}`);
        throw error;
    }
}
  
// ------------------- Update Pet in Character -------------------
// Updates an existing pet's information within a character's pet array
async function updatePetToCharacter(characterId, petName, updatedPetData) {
    try {
        await Character.updateOne(
            { _id: characterId, "pets.name": petName },
            { $set: { "pets.$": updatedPetData } }
        );
    } catch (error) {
        console.error(`[characterService]: logs - Failed to update pet "${petName}": ${error.message}`);
        throw new Error('Failed to update pet');
    }
}

// ------------------- Reset Pet Rolls for All Characters -------------------
// Resets the 'rollsRemaining' for every pet to the maximum allowed (minimum of pet level and 3)
async function resetPetRollsForAllCharacters() {
    try {
        const characters = await fetchAllCharacters();
        for (let character of characters) {
            if (character.pets && Array.isArray(character.pets)) {
                character.pets = character.pets.map(pet => {
                    pet.rollsRemaining = Math.min(pet.level, 3);
                    return pet;
                });
                await Character.findByIdAndUpdate(character._id, { pets: character.pets });
            }
        }
    } catch (error) {
        console.error(`[characterService]: logs - Error in resetPetRollsForAllCharacters: ${error.message}`);
        throw error;
    }
}


// ------------------- Export Functions -------------------
// Organized exports by functionality for clarity
module.exports = {
    // Character Services
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

    // Inventory Services
    getCharacterInventoryCollection,
    createCharacterInventory,
    deleteCharacterInventoryCollection,

    // Pet Services
    addPetToCharacter,
    updatePetRolls,
    upgradePetLevel,
    updatePetToCharacter,
    resetPetRollsForAllCharacters
};
