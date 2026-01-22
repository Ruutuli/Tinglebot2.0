// ============================================================================
// ------------------- Character API Routes -------------------
// Routes for character data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Character = require('../../models/CharacterModel');
const ModCharacter = require('../../models/ModCharacterModel');
const User = require('../../models/UserModel');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');
const { validateObjectId } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { 
  connectToInventoriesNative,
  connectToTinglebot,
  createCharacter,
  createCharacterInventory,
  getOrCreateUser
} = require('../../database/db');
const { 
  isUniqueCharacterName,
  isValidRace
} = require('../../utils/validation');
const { isValidJob, isVillageExclusiveJob, villageJobs, generalJobs } = require('../../../bot/modules/jobsModule');
const { isValidVillage } = require('../../../bot/modules/locationsModule');
const bucket = require('../../config/gcsService');

// Multer configuration for character icon uploads to Google Cloud Storage
const characterIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed!'), false);
      return;
    }
    // Additional validation for image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed!'), false);
      return;
    }
    cb(null, true);
  }
});

// Helper function to upload character icon to Google Cloud Storage
async function uploadCharacterIconToGCS(file) {
  try {
    if (!file) return null;
    
    const fileName = `character-icons/${uuidv4()}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      }
    });
    
    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        logger.error('Error uploading character icon to GCS', error, 'characters.js');
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('Error in uploadCharacterIconToGCS', error, 'characters.js');
    throw error;
  }
}

// Helper function to count spirit orbs (needs to be imported or defined)
// This is a placeholder - actual implementation should be imported from appropriate module
async function countSpiritOrbsBatch(characterNames) {
  // Placeholder - implement based on actual spirit orb counting logic
  return {};
}

// ------------------- Function: getRaces -------------------
// Returns list of all valid races
router.get('/races', asyncHandler(async (req, res) => {
  const { getAllRaces } = require('../../../bot/modules/raceModule');
  const races = getAllRaces();
  res.json({ data: races });
}));

// ------------------- Function: getJobs -------------------
// Returns list of all jobs, optionally filtered by village
router.get('/jobs', asyncHandler(async (req, res) => {
  const { villageJobs, generalJobs, getAllJobs } = require('../../../bot/modules/jobsModule');
  const village = req.query.village?.toLowerCase();
  
  if (village && villageJobs[village]) {
    // Return village-specific jobs + general jobs
    const jobs = [...villageJobs[village], ...generalJobs].sort();
    res.json({ data: jobs });
  } else {
    // Return all jobs
    const allJobs = getAllJobs();
    res.json({ data: allJobs });
  }
}));

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

// ------------------- Function: createCharacter -------------------
// Creates a new character for the authenticated user
router.post('/create', characterIconUpload.single('icon'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  if (!userId) {
    return res.status(400).json({ error: 'User ID not found' });
  }

  // Extract and validate form data
  const {
    name,
    age,
    height,
    hearts,
    stamina,
    pronouns,
    race,
    village,
    job,
    appLink
  } = req.body;

  // Validate required fields
  if (!name || !age || !height || !hearts || !stamina || !pronouns || !race || !village || !job || !appLink) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['name', 'age', 'height', 'hearts', 'stamina', 'pronouns', 'race', 'village', 'job', 'appLink']
    });
  }

  // Validate icon file
  if (!req.file) {
    return res.status(400).json({ error: 'Character icon is required' });
  }

  // Validate numeric fields
  const ageNum = parseInt(age, 10);
  const heightNum = parseFloat(height);
  const heartsNum = parseInt(hearts, 10);
  const staminaNum = parseInt(stamina, 10);

  if (isNaN(ageNum) || ageNum < 1) {
    return res.status(400).json({ error: 'Age must be a positive number (minimum 1)' });
  }

  if (isNaN(heightNum) || heightNum <= 0) {
    return res.status(400).json({ error: 'Height must be a positive number' });
  }

  if (isNaN(heartsNum) || heartsNum < 1) {
    return res.status(400).json({ error: 'Hearts must be a positive number (minimum 1)' });
  }

  if (isNaN(staminaNum) || staminaNum < 1) {
    return res.status(400).json({ error: 'Stamina must be a positive number (minimum 1)' });
  }

  // Validate race
  if (!isValidRace(race)) {
    return res.status(400).json({ error: `"${race}" is not a valid race` });
  }

  // Validate village
  if (!isValidVillage(village)) {
    return res.status(400).json({ error: `"${village}" is not a valid village` });
  }

  // Validate job
  if (!isValidJob(job)) {
    return res.status(400).json({ error: `"${job}" is not a valid job` });
  }

  // Check job/village compatibility
  const jobVillage = isVillageExclusiveJob(job);
  if (jobVillage && jobVillage.toLowerCase() !== village.toLowerCase()) {
    return res.status(400).json({ 
      error: `Job "${job}" is exclusive to ${jobVillage} village, but character is in ${village} village` 
    });
  }

  // Check character name uniqueness
  await connectToTinglebot();
  const isUnique = await isUniqueCharacterName(userId, name);
  if (!isUnique) {
    return res.status(400).json({ error: `A character with the name "${name}" already exists` });
  }

  // Check user's character slot availability
  let user = await User.findOne({ discordId: userId });
  if (!user) {
    // Create user if doesn't exist
    user = new User({
      discordId: userId,
      characterSlot: 2
    });
    await user.save();
  }

  if (user.characterSlot <= 0) {
    return res.status(400).json({ error: 'You do not have enough character slots available to create a new character' });
  }

  try {
    // Upload icon to GCS
    const iconUrl = await uploadCharacterIconToGCS(req.file);
    if (!iconUrl) {
      return res.status(500).json({ error: 'Failed to upload character icon' });
    }

    // Create character
    const character = new Character({
      userId: userId,
      name: name.trim(),
      age: ageNum,
      height: heightNum,
      maxHearts: heartsNum,
      currentHearts: heartsNum,
      maxStamina: staminaNum,
      currentStamina: staminaNum,
      pronouns: pronouns.trim(),
      race: race.toLowerCase(),
      homeVillage: village.toLowerCase(),
      currentVillage: village.toLowerCase(),
      job: job,
      inventory: '', // No longer using Google Sheets
      appLink: appLink.trim(),
      icon: iconUrl,
      blighted: false,
      spiritOrbs: 0,
      birthday: '',
      inventorySynced: false
    });

    await character.save();

    // Create inventory collection
    await createCharacterInventory(character.name, character._id, character.job);

    // Decrement character slot
    user.characterSlot -= 1;
    await user.save();

    logger.info(`Character created: ${character.name} by user ${userId}`, 'characters.js');

    // Return created character
    res.status(201).json({ 
      success: true,
      message: 'Character created successfully',
      character: character.toObject()
    });

  } catch (error) {
    logger.error('Error creating character', error, 'characters.js');
    
    // If character was created but something else failed, try to clean up
    if (character && character._id) {
      try {
        await Character.findByIdAndDelete(character._id);
      } catch (cleanupError) {
        logger.error('Error cleaning up character after creation failure', cleanupError, 'characters.js');
      }
    }

    res.status(500).json({ 
      error: 'An error occurred while creating your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
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






