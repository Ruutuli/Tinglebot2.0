// ============================================================================
// ------------------- Character API Routes -------------------
// Routes for character data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');
const { validateObjectId } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { connectToInventoriesNative } = require('../../database/db-dashboard');

// Helper function to count spirit orbs (needs to be imported or defined)
// This is a placeholder - actual implementation should be imported from appropriate module
async function countSpiritOrbsBatch(characterNames) {
  // Placeholder - implement based on actual spirit orb counting logic
  return {};
}

// ------------------- Function: getCharacterCount -------------------
// Returns total number of characters
router.get('/count', asyncHandler(async (req, res) => {
  const Character = mongoose.models.Character;
  const ModCharacter = mongoose.models.ModCharacter;
  const regularCount = await Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } });
  const modCount = await ModCharacter.countDocuments();
  res.json({ count: regularCount + modCount });
}));

// ------------------- Function: getCharacterList -------------------
// Returns basic character info without inventory data (fast loading, including mod characters)
// NOTE: This route must be defined BEFORE /:id to avoid route matching conflicts
router.get('/list', asyncHandler(async (req, res) => {
  logger.info('GET /api/characters/list - Route matched', 'characters.js');
  
  // Verify connection is ready
  if (mongoose.connection.readyState !== 1) {
    logger.warn('Database connection not ready for /list', 'characters.js');
    return res.status(503).json({ 
      error: 'Database connection not available',
      message: 'Please try again in a moment'
    });
  }
  
  // Use mongoose.models to ensure we're using models bound to the active connection
  const Character = mongoose.models.Character;
  const ModCharacter = mongoose.models.ModCharacter;
  
  if (!Character || !ModCharacter) {
    logger.warn('Character or ModCharacter model not found in mongoose.models', 'characters.js');
    return res.status(503).json({ 
      error: 'Database models not available',
      message: 'Please try again in a moment'
    });
  }
  
  // Use select() instead of projection object for better compatibility
  const regularCharacters = await Character.find({})
    .select('name icon race job homeVillage currentVillage isModCharacter')
    .lean();
  
  const modCharacters = await ModCharacter.find({})
    .select('name icon race job homeVillage currentVillage isModCharacter modTitle modType')
    .lean();
  
  // Combine both character types
  const allCharacters = [...regularCharacters, ...modCharacters];
  
  // Filter out excluded characters
  const excludedCharacters = ['Tingle', 'Tingle test', 'John'];
  const filteredCharacters = allCharacters.filter(char => 
    char && char.name && !excludedCharacters.includes(char.name)
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
  
  logger.info(`GET /api/characters/list - Returning ${characterList.length} characters`, 'characters.js');
  res.json({ data: characterList });
}));

// ------------------- Function: getUserCharacters -------------------
// Returns all characters belonging to the authenticated user (including mod characters)
router.get('/user/characters', requireAuth, asyncHandler(async (req, res) => {
  const Character = mongoose.models.Character;
  const ModCharacter = mongoose.models.ModCharacter;
  const userId = req.user.discordId;
  
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

// ------------------- Function: getAllCharacters -------------------
// Returns all characters for relationship selection (including mod characters)
router.get('/', asyncHandler(async (req, res) => {
  const Character = mongoose.models.Character;
  const ModCharacter = mongoose.models.ModCharacter;
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
// NOTE: This parameterized route must be defined LAST to avoid matching specific routes like /list
router.get('/:id', asyncHandler(async (req, res) => {
  // Explicitly reject 'list' to prevent route matching issues
  if (req.params.id === 'list') {
    logger.error('CRITICAL: Route /:id matched /list - route ordering issue!', 'characters.js');
    throw new NotFoundError('Route /list should be used instead of /:id with id=list');
  }
  
  const Character = mongoose.models.Character;
  const char = await Character.findById(req.params.id);
  if (!char) {
    throw new NotFoundError('Character not found');
  }
  res.json({ ...char.toObject(), icon: char.icon });
}));

module.exports = router;







