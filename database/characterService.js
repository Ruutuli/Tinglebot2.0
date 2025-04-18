const { getTinglebotConnection, getInventoriesConnection } = require('./connection');
const BaseService = require('./BaseService');
const Character = require('../models/CharacterModel');
const { getInventoryCollection } = require('./nativeMongoHelper');
const { handleError } = require('../utils/globalErrorHandler');

class CharacterService extends BaseService {
  constructor() {
    super(Character, 'CharacterService');
  }

   async getCharactersInVillage(userId, village) {
    try {
      await getTinglebotConnection();
      const characters = await this.find({ userId });
      return characters.filter(character =>
        character.currentVillage.toLowerCase() === village.toLowerCase()
      );
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Error getting characters in village ${village}:`, error.message);
      throw error;
    }
  }

   async getCharacterByName(characterName) {
    try {
      await getTinglebotConnection();
      const character = await this.findOne({ 
        name: new RegExp(`^${characterName.trim()}$`, 'i') 
      }, { 
        throwIfNotFound: true,
        entityName: `Character "${characterName}"`
      });
      return character;
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Error fetching character "${characterName}":`, error.message);
      throw error;
    }
  }

   async getBlightedCharacters(userId) {
    try {
      await getTinglebotConnection();
      return await this.find({ userId, blighted: true });
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Error fetching blighted characters for user ${userId}:`, error.message);
      throw error;
    }
  }

  async getInventoryCollection(characterName) {
    try {
      if (typeof characterName !== 'string') {
        throw new TypeError(`Expected a string for characterName, but received ${typeof characterName}`);
      }
      
      await getInventoriesConnection();
      const collectionName = characterName.trim().toLowerCase();
      return await getInventoryCollection(collectionName);
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Error getting inventory collection for "${characterName}":`, error.message);
      throw error;
    }
  }

    async createInventory(characterName, characterId, job) {
    try {
      const collection = await this.getInventoryCollection(characterName);
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
      handleError(error, 'CharacterService');
      console.error(`Error creating inventory for "${characterName}":`, error.message);
      throw error;
    }
  }

   async addPet(characterId, petName, species, size, level, perk) {
    try {
      await getTinglebotConnection();
      await this.updateById(characterId, {
        $push: {
          pets: {
            name: petName,
            species,
            size,
            level,
            rollsRemaining: 1,
            perks: [perk]
          }
        }
      });
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Error adding pet "${petName}" to character:`, error.message);
      throw error;
    }
  }

   async updatePet(characterId, petName, updatedPetData) {
    try {
      await getTinglebotConnection();
      await Character.updateOne(
        { _id: characterId, "pets.name": petName },
        { $set: { "pets.$": updatedPetData } }
      );
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error(`Failed to update pet "${petName}":`, error.message);
      throw error;
    }
  }

    async resetAllPetRolls() {
    try {
      await getTinglebotConnection();
      const characters = await this.find({});
      
      for (const character of characters) {
        if (character.pets && Array.isArray(character.pets)) {
          character.pets = character.pets.map(pet => {
            pet.rollsRemaining = Math.min(pet.level, 3);
            return pet;
          });
          
          await this.updateById(character._id, { pets: character.pets });
        }
      }
    } catch (error) {
      handleError(error, 'CharacterService');
      console.error("Error resetting pet rolls for all characters:", error.message);
      throw error;
    }
  }
}

const characterService = new CharacterService();
module.exports = characterService;
