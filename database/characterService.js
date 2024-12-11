// ------------------- Import necessary modules and services -------------------
const { connectToInventories, connectToTinglebot } = require('../database/connection');
const { ObjectId } = require('mongodb');
const Character = require('../models/CharacterModel');
const { getInventoryCollection } = require('../database/nativeMongoHelper');

// ------------------- Function to get characters in a specific village -------------------
async function getCharactersInVillage(userId, village) {
    const characters = await fetchCharactersByUserId(userId);
    // Check if the character's current village matches the encounter village (case-insensitive)
    return characters.filter(character => 
        character.currentVillage.toLowerCase() === village.toLowerCase());
}

// ------------------- Fetch character by name with enhanced logging -------------------
const fetchCharacterByName = async (characterName) => {
  try {
      await connectToTinglebot();
      const character = await Character.findOne({ name: new RegExp(`^${characterName}$`, 'i') });

      if (!character) {
          throw new Error('Character not found');
      }

      return character;
  } catch (error) {
      console.error(`❌ Error fetching character: ${characterName}. Error message: ${error.message}`);
      throw error;
  }
};

// ------------------- Fetch Blighted characters -------------------
const fetchBlightedCharactersByUserId = async (userId) => {
  await connectToTinglebot();
  return await Character.find({ userId, blighted: true }).lean().exec();
};


// ------------------- Fetch all characters -------------------
const fetchAllCharacters = async () => {
  await connectToTinglebot();
  return await Character.find().lean().exec();
};

// ------------------- Fetch character by ID -------------------
const fetchCharacterById = async (characterId) => {
    await connectToTinglebot();
    const character = await Character.findById(characterId);
    if (!character) throw new Error('Character not found');
    return character;
};

// ------------------- Fetch characters by user ID -------------------
const fetchCharactersByUserId = async (userId) => {
  await connectToTinglebot();
  const characters = await Character.find({ userId }).lean().exec();
  return characters;
};

// ------------------- Fetch character by name and user ID -------------------
const fetchCharacterByNameAndUserId = async (characterName, userId) => {
  await connectToTinglebot();
  const character = await Character.findOne({ name: characterName, userId });
  return character;
};

// ------------------- Fetch all characters except those belonging to a specific user -------------------
const fetchAllCharactersExceptUser = async (userId) => {
    await connectToTinglebot();
    return await Character.find({ userId: { $ne: userId } }).exec();
};

// ------------------- Create a new character -------------------
const createCharacter = async (characterData) => {
    await connectToTinglebot();
    const character = new Character(characterData);
    await character.save();
    return character;
};

// ------------------- Update a character by ID -------------------
const updateCharacterById = async (characterId, updateData) => {
    await connectToTinglebot();
    return await Character.findByIdAndUpdate(new ObjectId(characterId), updateData, { new: true }).lean().exec();
};

// ------------------- Delete a character by ID -------------------
const deleteCharacterById = async (characterId) => {
    await connectToTinglebot();
    return await Character.findByIdAndDelete(new ObjectId(characterId)).lean().exec();
};

// ------------------- Get the inventory collection for a specific character -------------------
const getCharacterInventoryCollection = async (characterName) => {
    await connectToInventories();
    const collectionName = characterName.trim().toLowerCase();
    return await getInventoryCollection(collectionName);
    
};

// ------------------- Create a new inventory for a character -------------------
const createCharacterInventory = async (characterName, characterId, job) => {
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
};

// ------------------- Delete a character's inventory collection -------------------
const deleteCharacterInventoryCollection = async (characterName) => {
    const collection = await getCharacterInventoryCollection(characterName);
    await collection.drop();
};


// ------------------- Add a new pet to a character -------------------
async function addPetToCharacter(characterId, petName, species, size, level, perk) {
    try {
      // Add a new pet object to the character's pets array
      await Character.findByIdAndUpdate(characterId, {
        $push: {
          pets: {
            name: petName,
            species: species,
            size: size,           // Small or Large pet
            level: level,         // Starting level
            rollsRemaining: 1,     // Default rolls remaining
            perks: [perk],        // Perk type (Array in case of future additional perks)
          }
        }
      });
    } catch (error) {
      console.error('Error adding pet:', error);
      throw error;
    }
}
  
  // ------------------- Update pet rolls -------------------
  async function updatePetRolls(characterId, petName, newRolls) {
    await Character.updateOne(
      { _id: characterId, 'pets.name': petName },
      { $set: { 'pets.$.rollsRemaining': newRolls } }
    );
  }
  
  // ------------------- Upgrade pet level -------------------
  async function upgradePetLevel(characterId, petName, newLevel) {
    await Character.updateOne(
      { _id: characterId, 'pets.name': petName },
      { $set: { 'pets.$.level': newLevel } }
    );
  }

  // ------------------- Update Pet in Character -------------------
// Updates an existing pet's information for a specific character
async function updatePetToCharacter(characterId, petName, updatedPetData) {
  try {
    // Find the character by ID and update the pet's details
    await Character.updateOne(
      { _id: characterId, "pets.name": petName },
      { $set: { "pets.$": updatedPetData } }
    );
    console.log(`Pet ${petName} updated successfully.`);
  } catch (error) {
    console.error(`Failed to update pet ${petName}:`, error);
    throw new Error('Failed to update pet');
  }
}

// ------------------- Reset Pet Rolls for All Characters -------------------
// Resets pet rolls to the maximum allowed based on pet level
async function resetPetRollsForAllCharacters() {
  try {
      const characters = await fetchAllCharacters(); // Fetch all characters from the database
      for (let character of characters) {
          character.pets = character.pets.map(pet => {
              pet.rollsRemaining = Math.min(pet.level, 3); // Set rolls to maximum based on pet's level
              return pet;
          });
          await Character.findByIdAndUpdate(character._id, { pets: character.pets }); // Save changes for each character
      }
      console.log('✅ All pet rolls have been reset.');
  } catch (error) {
      console.error('❌ Error resetting pet rolls:', error);
  }
}

// ------------------- Export all functions -------------------
module.exports = {
    getCharactersInVillage,
    fetchCharacterByName,
    fetchAllCharacters,
    fetchCharacterById,
    fetchCharactersByUserId,
    fetchCharacterByNameAndUserId,
    createCharacter,
    updateCharacterById,
    deleteCharacterById,
    createCharacterInventory,
    getCharacterInventoryCollection,
    deleteCharacterInventoryCollection,
    fetchAllCharactersExceptUser,
    addPetToCharacter,
    updatePetRolls,
    upgradePetLevel,
    updatePetToCharacter,
    resetPetRollsForAllCharacters,
    fetchBlightedCharactersByUserId,
};
