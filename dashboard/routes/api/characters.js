// ============================================================================
// ------------------- Character API Routes -------------------
// Routes for character data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const Character = require('@app/shared/models/CharacterModel');
const ModCharacter = require('@app/shared/models/ModCharacterModel');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');
const { validateObjectId } = require('../../middleware/validation');
const logger = require('@app/shared/utils/logger');
const { connectToInventoriesNative } = require('@app/shared/database/db');

// Helper function to count spirit orbs (needs to be imported or defined)
// This is a placeholder - actual implementation should be imported from appropriate module
async function countSpiritOrbsBatch(characterNames) {
  // Placeholder - implement based on actual spirit orb counting logic
  return {};
}

// ------------------- Function: getCharacterCount -------------------
// Returns total number of characters
router.get('/count', asyncHandler(async (req, res) => {
  const regularCount = await Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } });
  const modCount = await ModCharacter.countDocuments();
  res.json({ count: regularCount + modCount });
}));

// ------------------- Function: getUserCharacters -------------------
// Returns all characters belonging to the authenticated user (including mod characters)
router.get('/user/characters', asyncHandler(async (req, res) => {
  const userId = req.user?.discordId;
  
  const regularCharacters = await Character.find({ userId }).lean();
  const modCharacters = await ModCharacter.find({ userId }).lean();
  
  // Combine both character types
  const characters = [...regularCharacters, ...modCharacters];
  
  // Initialize spirit orbs count for characters
  characters.forEach(character => {
    character.spiritOrbs = 0; // Will be updated with actual count from inventory
  });
  
  // Get spirit orb counts for all characters
  const characterNames = characters.map(char => char.name);
  const spiritOrbCounts = await countSpiritOrbsBatch(characterNames);
  
  // Update spirit orb counts
  characters.forEach(character => {
    character.spiritOrbs = spiritOrbCounts[character.name] || 0;
  });
  
  res.json({ data: characters });
}));

// ------------------- Function: getCharacterList -------------------
// Returns basic character info without inventory data (fast loading, including mod characters)
router.get('/list', asyncHandler(async (req, res) => {
  const regularCharacters = await Character.find({}, {
    name: 1,
    icon: 1,
    race: 1,
    job: 1,
    homeVillage: 1,
    currentVillage: 1,
    isModCharacter: 1
  }).lean();
  
  const modCharacters = await ModCharacter.find({}, {
    name: 1,
    icon: 1,
    race: 1,
    job: 1,
    homeVillage: 1,
    currentVillage: 1,
    isModCharacter: 1,
    modTitle: 1,
    modType: 1
  }).lean();
  
  // Combine both character types
  const allCharacters = [...regularCharacters, ...modCharacters];
  
  // Filter out excluded characters
  const excludedCharacters = ['Tingle', 'Tingle test', 'John'];
  const filteredCharacters = allCharacters.filter(char => 
    !excludedCharacters.includes(char.name)
  );
  
  const characterList = filteredCharacters.map(char => ({
    characterName: char.name,
    icon: char.icon,
    race: char.race,
    job: char.job,
    homeVillage: char.homeVillage,
    currentVillage: char.currentVillage,
    isModCharacter: char.isModCharacter || false,
    modTitle: char.modTitle || null,
    modType: char.modType || null
  }));
  
  res.json({ data: characterList });
}));

// ------------------- Function: getAllCharacters -------------------
// Returns all characters for relationship selection (including mod characters)
router.get('/', asyncHandler(async (req, res) => {
  const regularCharacters = await Character.find({})
    .select('name race job currentVillage homeVillage icon userId isModCharacter')
    .sort({ name: 1 })
    .lean();
  
  const modCharacters = await ModCharacter.find({})
    .select('name race job currentVillage homeVillage icon userId isModCharacter modTitle modType')
    .sort({ name: 1 })
    .lean();
  
  // Combine both character types
  const characters = [...regularCharacters, ...modCharacters];
  
  res.json({ characters });
}));

// ------------------- Function: getCharacterById -------------------
// Returns character data by character ID
// NOTE: This must be defined LAST to avoid matching specific routes like /list, /count, etc.
router.get('/:id', validateObjectId('id'), asyncHandler(async (req, res) => {
  const char = await Character.findById(req.params.id);
  if (!char) {
    throw new NotFoundError('Character not found');
  }
  res.json({ ...char.toObject(), icon: char.icon });
}));

module.exports = router;






