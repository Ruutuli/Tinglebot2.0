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
const CharacterModeration = require('../../models/CharacterModerationModel');
const User = require('../../models/UserModel');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');
const { validateObjectId } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { 
  connectToInventoriesNative,
  connectToTinglebot,
  createCharacter,
  createCharacterInventory,
  getOrCreateUser,
  getCharacterInventoryCollection,
  fetchItemByName
} = require('../../database/db');
const { isValidRace } = require('../../utils/validation');
const { isValidVillage } = require('../../modules/locationsModule');
const bucket = require('../../config/gcsService');

// Import shared utilities
const { STATUS, isPending, isAccepted, isNeedsChanges, isDraft } = require('../../utils/statusConstants');
const {
  validateCharacterData,
  validateAge,
  validateHeight,
  validateRace,
  validateVillage,
  validateJob,
  validateJobVillageCompatibility,
  validateBiography
} = require('../../utils/characterValidation');
const {
  setupGearFromItems,
  updateGearFromItems,
  calculateGearStats
} = require('../../utils/gearUtils');
const { updateCharacterStats } = require('../../utils/characterStats');
const { createCharacterSlug, normalizeSlug } = require('../../utils/slugUtils');
const { assignCharacterRoles } = require('../../services/discordRoleService');
const { postCharacterCreationToDiscord } = require('../../services/discordPostingService');

// Multer configuration for character icon and appArt uploads to Google Cloud Storage
const characterIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 7 * 1024 * 1024 // 7MB limit
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

// Multer configuration for both icon and appArt uploads
const characterUploads = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 7 * 1024 * 1024, // 7MB limit per file
    files: 2 // Allow up to 2 files (icon and appArt)
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
}).fields([
  { name: 'icon', maxCount: 1 },
  { name: 'appArt', maxCount: 1 }
]);

// Helper function to find character with ownership check
async function findCharacterWithOwnership(characterId, userId) {
  // Try both string and original type for userId (Discord IDs can be stored as strings or numbers)
  let character = await Character.findOne({ 
    _id: characterId, 
    userId: String(userId) 
  });
  
  // If not found, try with the userId as-is in case it's already the right type
  if (!character) {
    character = await Character.findOne({ 
      _id: characterId, 
      userId: userId 
    });
  }
  
  return character;
}

// Post character status update (accepted) to Discord
async function postCharacterStatusToDiscord(character, status, isModCharacter = false) {
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    
    if (!DISCORD_TOKEN) {
      logger.warn('CHARACTERS', 'DISCORD_TOKEN not configured, skipping Discord post');
      return;
    }
    
    // Get user info
    const user = await User.findOne({ discordId: character.userId }).lean();
    const userName = user?.username || user?.discordId || 'Unknown';
    
    // Generate OC page URL using shared utility
    const ocPageSlug = createCharacterSlug(character.name);
    const dashboardUrl = (process.env.DASHBOARD_URL || 'https://tinglebot.xyz').replace(/\/+$/, '');
    const ocPageUrl = `${dashboardUrl}/ocs/${ocPageSlug}`;
    
    
    // Handle accepted status - post to character creation channel
    if (isAccepted(status)) {
      const channelId = process.env.CHARACTER_CREATION_CHANNEL_ID || '641858948802150400';
      
      const embed = {
        title: `✅ Character Accepted: ${character.name}`,
        color: 0x4caf50,
        description: `Your character **${character.name}** has been accepted and is now active!`,
        fields: [
          {
            name: '👤 Character Details',
            value: `**Name:** ${character.name}\n**Race:** ${character.race}\n**Village:** ${character.homeVillage}\n**Job:** ${character.job}`,
            inline: false
          },
          {
            name: '📝 Next Steps',
            value: `Approved! Please submit OC to ⁠Roots Of The Wild⁠🔔》roster channel!`,
            inline: false
          }
        ],
        footer: {
          text: `User: ${userName} • Character ID: ${character._id}`
        },
        timestamp: new Date().toISOString()
      };
      
      // Post to Discord with user mention outside embed
      const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: `<@${character.userId}>`,
          embeds: [embed]
        })
      });
      
      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        logger.error('CHARACTERS', `Failed to post character status to Discord: ${discordResponse.status} - ${errorText}`);
        return;
      }
      
      logger.success('CHARACTERS', `Character ${status} notification posted to Discord: ${character.name}`);
    }
  } catch (error) {
    logger.error('CHARACTERS', 'Error posting character status to Discord', error);
    // Don't throw - Discord posting failure shouldn't break the moderation flow
  }
}


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
        logger.error('CHARACTERS', 'Error uploading character icon to GCS', error);
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error in uploadCharacterIconToGCS', error);
    throw error;
  }
}

// Helper function to upload character appArt to Google Cloud Storage
async function uploadCharacterAppArtToGCS(file) {
  try {
    if (!file) return null;
    
    const fileName = `character-appart/${uuidv4()}${path.extname(file.originalname)}`;
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
        logger.error('CHARACTERS', 'Error uploading character appArt to GCS', error);
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error in uploadCharacterAppArtToGCS', error);
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
  const { getAllRaces } = require('../../modules/raceModule');
  const races = getAllRaces();
  res.json({ data: races });
}));

// ------------------- Function: getJobs -------------------
// Returns list of all jobs, optionally filtered by village
router.get('/jobs', asyncHandler(async (req, res) => {
  const { villageJobs, generalJobs, allJobs } = require('../../data/jobData');
  const village = req.query.village?.toLowerCase();
  
  if (village && villageJobs[village]) {
    // Return village-specific jobs + general jobs
    const jobs = [...villageJobs[village], ...generalJobs].sort();
    res.json({ data: jobs });
  } else {
    // Return all jobs
    res.json({ data: allJobs });
  }
}));

// ------------------- Function: getStarterGear -------------------
// Returns list of starter gear items
router.get('/starter-gear', asyncHandler(async (req, res) => {
  const { fetchAllItems } = require('../../database/db');
  const Item = require('../../models/ItemModel');
  
  // List of allowed starter gear item names (from starterGear.js)
  const STARTER_GEAR_NAMES = [
    'Soup Ladle',
    'Pot Lid',
    'Wooden Shield',
    'Wooden Bow',
    'Boomerang',
    'Emblazoned Shield',
    "Fisherman's Shield",
    "Hunter's Shield",
    "Traveler's Shield",
    'Rusty Broadsword',
    "Traveler's Sword",
    "Woodcutter's Axe",
    "Traveler's Bow",
    'Wooden Mop',
    'Rusty Claymore',
    "Traveler's Claymore",
    'Tree Branch',
    'Rusty Shield',
    'Korok Leaf',
    'Farming Hoe',
    "Farmer's Pitchfork",
    'Rusty Halberd',
    "Traveler's Spear",
    'Old Shirt',
    'Well-Worn Trousers'
  ];
  
  function normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9' ]/gi, '')
      .trim();
  }
  
  const normalizedSet = new Set(STARTER_GEAR_NAMES.map(normalizeName));
  
  // Fetch all items and filter to starter gear
  const allItems = await fetchAllItems();
  const starterGear = allItems.filter(item => {
    const normalizedName = normalizeName(item.itemName || '');
    return normalizedSet.has(normalizedName);
  });
  
  // Categorize by type
  const categorized = {
    weapons: [],
    shields: [],
    armor: {
      head: [],
      chest: [],
      legs: []
    }
  };
  
  starterGear.forEach(item => {
    const categories = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
    const types = Array.isArray(item.type) ? item.type : (item.type ? [item.type] : []);
    const subtypes = Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []);
    
    // Check if it's a shield (check category, type, AND subtype)
    const isShield = categories.includes('Shield') 
      || types.includes('Shield') 
      || subtypes.includes('Shield') 
      || item.itemName?.toLowerCase().includes('shield');
    
    if (isShield) {
      categorized.shields.push(item);
    }
    // Check if it's a weapon
    else if (categories.includes('Weapon') || types.includes('1H') || types.includes('2H')) {
      categorized.weapons.push(item);
    }
    // Check if it's armor
    else if (categories.includes('Armor') || types.includes('Chest') || types.includes('Legs')) {
      if (types.includes('Chest') || item.itemName?.toLowerCase().includes('shirt')) {
        categorized.armor.chest.push(item);
      } else if (types.includes('Legs') || item.itemName?.toLowerCase().includes('trousers')) {
        categorized.armor.legs.push(item);
      } else {
        categorized.armor.head.push(item);
      }
    }
  });
  
  res.json({ 
    data: starterGear,
    categorized: categorized
  });
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
router.post('/create', characterUploads, asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  if (!userId) {
    return res.status(400).json({ error: 'User ID not found' });
  }

  // Extract form data
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
    appLink,
    starterWeapon,
    starterShield,
    starterArmorChest,
    starterArmorLegs,
    gender,
    virtue,
    personality,
    history,
    extras
  } = req.body;

  // Validate icon file
  const iconFile = req.files?.icon?.[0];
  if (!iconFile) {
    return res.status(400).json({ error: 'Character icon is required' });
  }

  // Validate appArt file
  const appArtFile = req.files?.appArt?.[0];
  if (!appArtFile) {
    return res.status(400).json({ error: 'Application art is required' });
  }

  // Validate all character data using shared validation utility
  await connectToTinglebot();
  const validationResult = await validateCharacterData({
    name,
    age,
    height,
    hearts,
    stamina,
    pronouns,
    race,
    village,
    job,
    gender,
    virtue,
    personality,
    history
  }, userId);

  if (!validationResult.valid) {
    return res.status(400).json({ 
      error: validationResult.errors.join('; '),
      errors: validationResult.errors
    });
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

  let character = null;
  try {
    // Upload icon to GCS
    const iconUrl = await uploadCharacterIconToGCS(iconFile);
    if (!iconUrl) {
      return res.status(500).json({ error: 'Failed to upload character icon' });
    }

    // Upload appArt to GCS
    const appArtUrl = await uploadCharacterAppArtToGCS(appArtFile);
    if (!appArtUrl) {
      return res.status(500).json({ error: 'Failed to upload application art' });
    }

    // Setup gear from starter items using shared utility
    const gear = await setupGearFromItems({
      starterWeapon,
      starterShield,
      starterArmorChest,
      starterArmorLegs
    });

    // Create character
    character = new Character({
      userId: userId,
      name: name.trim(),
      age: validationResult.values.age,
      height: validationResult.values.height,
      maxHearts: validationResult.values.hearts,
      currentHearts: validationResult.values.hearts,
      maxStamina: validationResult.values.stamina,
      currentStamina: validationResult.values.stamina,
      pronouns: pronouns.trim(),
      race: race.toLowerCase(),
      homeVillage: village.toLowerCase(),
      currentVillage: village.toLowerCase(),
      job: job,
      inventory: `https://tinglebot.xyz/character-inventory?character=${encodeURIComponent(name)}`,
      appLink: appLink ? appLink.trim() : '',
      icon: iconUrl,
      appArt: appArtUrl,
      blighted: false,
      spiritOrbs: 0,
      birthday: '',
      inventorySynced: false,
      gearWeapon: gear.gearWeapon,
      gearShield: gear.gearShield,
      gearArmor: gear.gearArmor,
      status: STATUS.DRAFT, // New characters start as DRAFT (null) - must be submitted
      applicationVersion: 1, // Start at version 1
      submittedAt: null, // Not submitted yet
      gender: gender.trim(),
      virtue: virtue.toLowerCase(),
      personality: personality.trim(),
      history: history.trim(),
      extras: extras ? extras.trim() : ''
    });

    await character.save();

    // Update character stats if gear was equipped using shared utility
    if (gear.gearWeapon || gear.gearShield || gear.gearArmor.chest || gear.gearArmor.legs) {
      await updateCharacterStats(character);
    }

    // Create inventory collection
    await createCharacterInventory(character.name, character._id, character.job);
    
    // Add selected gear items to inventory if they were selected
    if (starterWeapon || starterShield || starterArmorChest || starterArmorLegs) {
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      
      const gearItems = [starterWeapon, starterShield, starterArmorChest, starterArmorLegs].filter(Boolean);
      for (const itemName of gearItems) {
        const item = await fetchItemByName(itemName);
        if (item) {
          await inventoryCollection.insertOne({
            itemName: item.itemName,
            quantity: 1,
            obtained: `Starting gear - ${new Date().toLocaleDateString()}`,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    // Decrement character slot
    user.characterSlot -= 1;
    await user.save();

    logger.info('CHARACTERS', `Character created as DRAFT: ${character.name} by user ${userId}`);

    // Don't post to Discord yet - wait for submission
    // postCharacterCreationToDiscord will be called when character is submitted

    // Generate OC page URL slug from character name using shared utility
    const ocPageSlug = createCharacterSlug(character.name);
    const ocPageUrl = `/ocs/${ocPageSlug}`;

    // Return created character
    res.status(201).json({ 
      success: true,
      message: 'Character created successfully',
      character: character.toObject(),
      ocPageUrl: ocPageUrl
    });

  } catch (error) {
    logger.error('CHARACTERS', 'Error creating character', error);
    
    // If character was created but something else failed, try to clean up
    if (character && character._id) {
      try {
        await Character.findByIdAndDelete(character._id);
        // Restore character slot if character creation failed
        if (user) {
          user.characterSlot += 1;
          await user.save();
        }
      } catch (cleanupError) {
        logger.error('CHARACTERS', 'Error cleaning up character after creation failure', cleanupError);
      }
    }

    res.status(500).json({ 
      error: 'An error occurred while creating your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Middleware to check if user is a mod/admin
async function checkModAccess(req) {
  // Check if user is authenticated
  const user = req.session?.user || req.user;
  if (!user || !user.discordId) {
    return false;
  }
  
  // Use the same checkAdminAccess function from server.js
  // For now, we'll check the ADMIN_ROLE_ID
  const guildId = process.env.PROD_GUILD_ID;
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  
  if (!guildId || !ADMIN_ROLE_ID) {
    return false;
  }
  
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const memberData = await response.json();
      const roles = memberData.roles || [];
      const adminRoleIdStr = String(ADMIN_ROLE_ID);
      return roles.some(roleId => String(roleId) === adminRoleIdStr);
    }
    return false;
  } catch (error) {
    logger.error('CHARACTERS', `Error checking mod access: ${error.message}`);
    return false;
  }
}

// ------------------- Function: getCharacterByName -------------------
// Returns character data by character name (for OC page URL lookup)
// Verifies ownership - only the character owner can access
router.get('/by-name/:name', asyncHandler(async (req, res) => {
  const nameSlug = decodeURIComponent(req.params.name);
  
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const userId = req.user.discordId;
  
  // Normalize slug for comparison using shared utility
  const normalizedSlug = normalizeSlug(nameSlug);
  
  // First, search all characters to see if the character exists
  // This helps provide better error messages
  let allCharacters;
  try {
    allCharacters = await Character.find({}).lean();
  } catch (error) {
    logger.error(`[characters.js] Error fetching characters: ${error.message}`, error);
    throw new Error('Failed to fetch characters from database');
  }
  
  // Find character whose name matches the slug pattern (across all characters)
  // Filter out characters without names first to avoid errors
  let character;
  try {
    character = allCharacters.find(char => {
      if (!char || !char.name) return false;
      try {
        const charSlug = createCharacterSlug(char.name);
        return charSlug === normalizedSlug;
      } catch (error) {
        logger.warn(`[characters.js] Error creating slug for character: ${char._id}, name: ${char.name}, error: ${error.message}`);
        return false;
      }
    });
    
    // Fallback: try direct name match (case-insensitive) if slug match fails
    if (!character) {
      character = allCharacters.find(char => {
        if (!char || !char.name || typeof char.name !== 'string') return false;
        try {
          return char.name.toLowerCase() === normalizedSlug;
        } catch (error) {
          logger.warn(`[characters.js] Error matching name for character: ${char._id}, name: ${char.name}, error: ${error.message}`);
          return false;
        }
      });
    }
  } catch (error) {
    logger.error(`[characters.js] Error finding character: ${error.message}`, error);
    throw new Error('Failed to search for character');
  }
  
  if (!character) {
    // Character doesn't exist at all
    logger.warn(`[characters.js] Character not found for slug: "${nameSlug}" (userId: ${userId})`);
    throw new NotFoundError(`Character "${nameSlug}" not found. Please check the character name and try again.`);
  }
  
  // Validate character object has required properties
  if (!character || typeof character !== 'object') {
    logger.error(`[characters.js] Invalid character object found for slug: "${nameSlug}"`);
    throw new Error('Invalid character data');
  }
  
  // Check ownership - convert both to strings for comparison (Discord IDs can be stored as strings or numbers)
  const characterUserId = String(character.userId || '');
  const requestUserId = String(userId || '');
  const isOwner = characterUserId === requestUserId;
  
  // Check if user is admin/mod (for viewing pending characters)
  const isMod = await checkModAccess(req);
  
  // Public visibility: Only show approved characters to non-owners (unless they're admins/mods)
  if (!isOwner) {
    // Character exists but user doesn't own it
    // Allow viewing if character is approved (status: 'accepted') OR if user is admin/mod
    if (!isAccepted(character.status) && !isMod) {
      logger.info(`[characters.js] Blocked access to non-approved character "${character?.name || nameSlug}" by user ${requestUserId}`);
      throw new NotFoundError('Character not found or not yet approved for public viewing');
    }
    
    const charName = character?.name || 'Unknown';
    const viewerType = isMod ? 'admin/mod' : 'non-owner';
    logger.info(`[characters.js] Character "${charName}" viewed by ${viewerType} - userId: ${requestUserId}, ownerId: ${characterUserId}`);
  }
  
  // Return character data with ownership flag
  // Ensure all required fields exist before sending
  try {
    const responseData = {
      ...character,
      icon: character?.icon || null,
      isOwner: isOwner, // Frontend can use this to hide/edit edit buttons
      name: character?.name || 'Unknown'
    };
    
    res.json(responseData);
  } catch (error) {
    logger.error(`[characters.js] Error sending response for character "${character?.name || nameSlug}": ${error.message}`, error);
    throw new Error('Failed to send character data');
  }
}));

// ------------------- Function: editCharacter -------------------
// Updates a character (for accepted characters)
router.put('/edit/:id', characterUploads, validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;
  const { resubmit } = req.body; // Flag to resubmit character
  const shouldResubmit = resubmit === true || resubmit === 'true';

  // Find character and verify ownership using shared helper
  const character = await findCharacterWithOwnership(characterId, userId);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Import field editability utility
  const { isFieldEditable } = require('../../utils/fieldEditability');

  // Check if character can be edited based on status
  if (isPending(character.status)) {
    return res.status(400).json({ error: 'Character is pending moderation and cannot be edited. Please wait for moderation to complete.' });
  }

  // Don't auto-resubmit on edit - resubmit should be explicit via resubmit endpoint

  // Extract form data
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
    appLink,
    starterWeapon,
    starterShield,
    starterArmorChest,
    starterArmorLegs,
    personality,
    history,
    extras,
    gender,
    virtue,
    birthday
  } = req.body;

  // Check field editability for each field being updated
  const status = character.status; // null/undefined=DRAFT, 'pending'=PENDING, 'accepted'=ACCEPTED, 'needs_changes'=NEEDS_CHANGES
  const lockedFields = [];

  // Check each field
  if (name !== undefined && name.trim() !== character.name && !isFieldEditable('name', status)) {
    lockedFields.push('name');
  }
  if (age !== undefined && age !== '' && parseInt(age, 10) !== character.age && !isFieldEditable('age', status)) {
    lockedFields.push('age');
  }
  if (race !== undefined && race.toLowerCase() !== character.race?.toLowerCase() && !isFieldEditable('race', status)) {
    lockedFields.push('race');
  }
  if (village !== undefined && village.toLowerCase() !== character.homeVillage?.toLowerCase() && !isFieldEditable('homeVillage', status)) {
    lockedFields.push('homeVillage');
  }
  if (job !== undefined && job !== character.job && !isFieldEditable('job', status)) {
    lockedFields.push('job');
  }
  // Hearts and stamina can NEVER be edited by users (only mods/admins)
  if (hearts !== undefined && !isFieldEditable('maxHearts', status)) {
    lockedFields.push('hearts');
  }
  if (stamina !== undefined && !isFieldEditable('maxStamina', status)) {
    lockedFields.push('stamina');
  }
  if (starterWeapon !== undefined && !isFieldEditable('gearWeapon', status)) {
    lockedFields.push('starterWeapon');
  }
  if (starterShield !== undefined && !isFieldEditable('gearShield', status)) {
    lockedFields.push('starterShield');
  }
  if (starterArmorChest !== undefined && !isFieldEditable('gearArmor', status)) {
    lockedFields.push('starterArmorChest');
  }
  if (starterArmorLegs !== undefined && !isFieldEditable('gearArmor', status)) {
    lockedFields.push('starterArmorLegs');
  }

  if (lockedFields.length > 0) {
    return res.status(400).json({ 
      error: `The following fields cannot be edited: ${lockedFields.join(', ')}`,
      lockedFields: lockedFields
    });
  }

  // If status is 'accepted', only allow editing approved-editable fields
  if (isAccepted(character.status)) {
    // Only update allowed profile fields
    if (height !== undefined && height !== '' && isFieldEditable('height', status)) {
      character.height = parseFloat(height) || null;
    }
    if (pronouns !== undefined && isFieldEditable('pronouns', status)) {
      character.pronouns = pronouns.trim();
    }
    if (personality !== undefined && isFieldEditable('personality', status)) {
      character.personality = personality.trim();
    }
    if (history !== undefined && isFieldEditable('history', status)) {
      character.history = history.trim();
    }
    if (extras !== undefined && isFieldEditable('extras', status)) {
      character.extras = extras.trim();
    }
    if (gender !== undefined && isFieldEditable('gender', status)) {
      character.gender = gender.trim();
    }
    if (virtue !== undefined && isFieldEditable('virtue', status)) {
      character.virtue = virtue.toLowerCase();
    }
    if (appLink !== undefined && isFieldEditable('appLink', status)) {
      character.appLink = appLink.trim();
    }
    if (birthday !== undefined && isFieldEditable('birthday', status)) {
      character.birthday = birthday.trim();
    }
    const iconFile = req.files?.icon?.[0];
    if (iconFile && isFieldEditable('icon', status)) {
      const iconUrl = await uploadCharacterIconToGCS(iconFile);
      if (iconUrl) {
        character.icon = iconUrl;
      }
    }
    
    const appArtFile = req.files?.appArt?.[0];
    if (appArtFile && isFieldEditable('appArt', status)) {
      const appArtUrl = await uploadCharacterAppArtToGCS(appArtFile);
      if (appArtUrl) {
        character.appArt = appArtUrl;
      }
    }
    
    await character.save();
    return res.json({
      success: true,
      message: 'Character profile updated successfully',
      character: character.toObject()
    });
  }

  // For DRAFT status (null/undefined) or NEEDS_CHANGES status, allow partial updates - only validate and update fields that are provided
  // Validate and update age if provided
  if (age !== undefined && age !== '') {
    const ageResult = validateAge(age);
    if (!ageResult.valid) {
      return res.status(400).json({ error: ageResult.error });
    }
    character.age = ageResult.value;
  }

  // Validate and update height if provided
  if (height !== undefined && height !== '') {
    const heightResult = validateHeight(height);
    if (!heightResult.valid) {
      return res.status(400).json({ error: heightResult.error });
    }
    character.height = heightResult.value;
  }

  // Validate and update hearts if provided
  if (hearts !== undefined && hearts !== '') {
    const heartsResult = validateHearts(hearts);
    if (!heartsResult.valid) {
      return res.status(400).json({ error: heartsResult.error });
    }
    character.maxHearts = heartsResult.value;
    character.currentHearts = heartsResult.value;
  }

  // Validate and update stamina if provided
  if (stamina !== undefined && stamina !== '') {
    const staminaResult = validateStamina(stamina);
    if (!staminaResult.valid) {
      return res.status(400).json({ error: staminaResult.error });
    }
    character.maxStamina = staminaResult.value;
    character.currentStamina = staminaResult.value;
  }

  // Validate and update race if provided
  if (race !== undefined && race !== '') {
    const raceResult = validateRace(race);
    if (!raceResult.valid) {
      return res.status(400).json({ error: raceResult.error });
    }
    character.race = race.toLowerCase();
  }

  // Validate and update village if provided
  if (village !== undefined && village !== '') {
    const villageResult = validateVillage(village);
    if (!villageResult.valid) {
      return res.status(400).json({ error: villageResult.error });
    }
    character.homeVillage = village.toLowerCase();
    character.currentVillage = village.toLowerCase();
  }

  // Validate and update job if provided
  if (job !== undefined && job !== '') {
    const jobResult = validateJob(job);
    if (!jobResult.valid) {
      return res.status(400).json({ error: jobResult.error });
    }
    
    // Check job/village compatibility (use current village if village not being updated)
    const villageToCheck = village !== undefined ? village : character.homeVillage;
    const compatibilityResult = validateJobVillageCompatibility(job, villageToCheck);
    if (!compatibilityResult.valid) {
      return res.status(400).json({ error: compatibilityResult.error });
    }
    character.job = job;
  }

  // Name can NEVER be edited by users (only mods/admins) - this should have been caught by the earlier check, but adding guard here too
  if (name !== undefined && name.trim() !== '' && name.trim() !== character.name) {
    return res.status(400).json({ error: 'Name cannot be edited' });
  }

  // Update pronouns if provided
  if (pronouns !== undefined) {
    character.pronouns = pronouns.trim();
  }

  // Update appLink if provided
  if (appLink !== undefined) {
    character.appLink = appLink ? appLink.trim() : '';
  }

  // Handle icon upload
  const iconFile = req.files?.icon?.[0];
  if (iconFile && isFieldEditable('icon', status)) {
    const iconUrl = await uploadCharacterIconToGCS(iconFile);
    if (iconUrl) {
      character.icon = iconUrl;
    }
  }
  
  // Handle appArt upload
  const appArtFile = req.files?.appArt?.[0];
  if (appArtFile && isFieldEditable('appArt', status)) {
    const appArtUrl = await uploadCharacterAppArtToGCS(appArtFile);
    if (appArtUrl) {
      character.appArt = appArtUrl;
    }
  }

  // Handle starting gear updates if provided using shared utility
  const gearWasUpdated = starterWeapon !== undefined || starterShield !== undefined || 
                         starterArmorChest !== undefined || starterArmorLegs !== undefined;
  
  if (gearWasUpdated) {
    const updatedGear = await updateGearFromItems({
      gearWeapon: character.gearWeapon,
      gearShield: character.gearShield,
      gearArmor: character.gearArmor
    }, {
      starterWeapon,
      starterShield,
      starterArmorChest,
      starterArmorLegs
    });
    
    character.gearWeapon = updatedGear.gearWeapon;
    character.gearShield = updatedGear.gearShield;
    character.gearArmor = updatedGear.gearArmor;
  }
  
  // Update biography fields if provided
  if (personality !== undefined) {
    character.personality = personality.trim();
  }
  if (history !== undefined) {
    character.history = history.trim();
  }
  if (extras !== undefined) {
    character.extras = extras ? extras.trim() : '';
  }
  if (gender !== undefined) {
    character.gender = gender.trim();
  }
  if (virtue !== undefined) {
    character.virtue = virtue.toLowerCase();
  }

  // Update character stats if gear was updated using shared utility
  if (gearWasUpdated) {
    await updateCharacterStats(character);
  }

  await character.save();

  logger.info('CHARACTERS', `Character updated: ${character.name} by user ${userId}${shouldResubmit ? ' (resubmitted)' : ''}`);

  // If resubmitted, post to Discord
  if (shouldResubmit) {
    postCharacterCreationToDiscord(character, await User.findOne({ discordId: userId }), req.user, req).catch(err => {
      logger.error('SERVER', 'Failed to post character resubmission to Discord', err);
    });
  }

  // Generate OC page URL slug using shared utility
  const ocPageSlug = createCharacterSlug(character.name);
  const ocPageUrl = `/ocs/${ocPageSlug}`;

  res.json({
    success: true,
    message: shouldResubmit ? 'Character updated and resubmitted successfully' : 'Character updated successfully',
    character: character.toObject(),
    ocPageUrl: ocPageUrl
  });
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

// ------------------- Section: Character Moderation Routes -------------------

// Get all pending characters for moderation review
router.get('/moderation/pending', asyncHandler(async (req, res) => {
  const isMod = await checkModAccess(req);
  if (!isMod) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  
  await connectToTinglebot();
  
  // Get all pending and needs_changes characters (both regular and mod)
  // needs_changes characters should still show so mods can add more feedback
  const pendingCharacters = await Character.find({ 
    status: { $in: [STATUS.PENDING, STATUS.NEEDS_CHANGES] } 
  })
    .select('name userId age height pronouns race homeVillage job icon appLink createdAt applicationVersion discordMessageId discordThreadId submittedAt status')
    .lean();
  
  const pendingModCharacters = await ModCharacter.find({ 
    status: { $in: [STATUS.PENDING, STATUS.NEEDS_CHANGES] } 
  })
    .select('name userId age height pronouns race homeVillage job icon appLink createdAt modTitle modType applicationVersion discordMessageId discordThreadId submittedAt status')
    .lean();
  
  // Get moderation votes for each character
  const allCharacterIds = [
    ...pendingCharacters.map(c => c._id),
    ...pendingModCharacters.map(c => c._id)
  ];
  
  const moderationVotes = await CharacterModeration.find({
    characterId: { $in: allCharacterIds }
  }).lean();
  
  // Create a map of character IDs to their current applicationVersion for quick lookup
  const characterVersionMap = {};
  [...pendingCharacters, ...pendingModCharacters].forEach(char => {
    const charId = char._id.toString();
    characterVersionMap[charId] = char.applicationVersion || 1;
  });
  
  // Group votes by character ID and application version
  // Only include votes that match the character's current applicationVersion
  const votesByCharacter = {};
  moderationVotes.forEach(vote => {
    const charId = vote.characterId.toString();
    const voteVersion = vote.applicationVersion || 1;
    const currentVersion = characterVersionMap[charId];
    
    // Skip if character not found or vote is for a different version
    if (currentVersion === undefined || voteVersion !== currentVersion) return;
    
    if (!votesByCharacter[charId]) {
      votesByCharacter[charId] = { approves: [], needsChanges: [] };
    }
    if (vote.vote === 'approve') {
      votesByCharacter[charId].approves.push({
        modId: vote.modId,
        modUsername: vote.modUsername,
        note: vote.note,
        createdAt: vote.createdAt
      });
    } else if (vote.vote === STATUS.NEEDS_CHANGES) {
      votesByCharacter[charId].needsChanges.push({
        modId: vote.modId,
        modUsername: vote.modUsername,
        reason: vote.reason,
        note: vote.note,
        createdAt: vote.createdAt
      });
    }
  });
  
  // Add vote counts to characters
  const charactersWithVotes = [
    ...pendingCharacters.map(char => {
      const charId = char._id.toString();
      const votes = votesByCharacter[charId] || { approves: [], needsChanges: [] };
      return {
        ...char,
        isModCharacter: false,
        votes: votes,
        approveCount: votes.approves.length,
        needsChangesCount: votes.needsChanges.length
      };
    }),
    ...pendingModCharacters.map(char => {
      const charId = char._id.toString();
      const votes = votesByCharacter[charId] || { approves: [], needsChanges: [] };
      return {
        ...char,
        isModCharacter: true,
        votes: votes,
        approveCount: votes.approves.length,
        needsChangesCount: votes.needsChanges.length
      };
    })
  ];
  
  res.json({ characters: charactersWithVotes });
}));

// Approve or deny a character
router.post('/moderation/vote', asyncHandler(async (req, res) => {
  const isMod = await checkModAccess(req);
  if (!isMod) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  
  const { characterId, vote, reason, note, isModCharacter } = req.body;
  
  // Support 'needs_changes' in addition to 'approve'
  if (!characterId || !vote || !['approve', STATUS.NEEDS_CHANGES].includes(vote)) {
    return res.status(400).json({ error: 'Invalid request. characterId and vote (approve/needs_changes) are required.' });
  }
  
  // Reason required for needs_changes
  if (vote === STATUS.NEEDS_CHANGES && !reason && !note) {
    return res.status(400).json({ error: 'Reason or note is required for needs_changes votes.' });
  }
  
  await connectToTinglebot();
  
  // Get the character
  const CharacterModel = isModCharacter ? ModCharacter : Character;
  const character = await CharacterModel.findById(characterId);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  // Allow voting on pending or needs_changes status (mods can continue voting on needs_changes)
  if (!isPending(character.status) && !isNeedsChanges(character.status)) {
    return res.status(400).json({ error: 'Character is not pending moderation' });
  }
  
  // Get mod user info
  const modUser = req.session?.user || req.user;
  const modId = modUser.discordId;
  const modUsername = modUser.username || modUser.discordId;
  
    // Use ocApplicationService to record vote
    const ocApplicationService = require('../../services/ocApplicationService');
    const auditService = require('../../services/auditService');
    const notificationService = require('../../utils/notificationService');
    const feedback = note || reason || null;
  
  try {
    // Check for existing vote to detect vote changes
    const applicationVersion = character.applicationVersion || 1;
    const existingVote = await CharacterModeration.findOne({
      characterId: characterId,
      modId: modId,
      applicationVersion: applicationVersion
    });
    
    const voteResult = await ocApplicationService.recordVote(
      characterId,
      modId,
      modUsername,
      vote,
      feedback
    );
    
    // If this is a needs_changes vote and character is still pending, immediately change status
    // This triggers on the FIRST needs_changes vote (only one vote needed)
    if (vote === STATUS.NEEDS_CHANGES && isPending(character.status)) {
      character.status = STATUS.NEEDS_CHANGES;
      await character.save();
      
      // Send DM and dashboard notification (sendOCDecisionNotification creates both)
      await notificationService.sendOCDecisionNotification(
        character.userId,
        STATUS.NEEDS_CHANGES,
        character.toObject(),
        feedback
      ).catch(err => {
        logger.error('CHARACTERS', 'Failed to send needs_changes notification', err);
      });
      
      // Post to Discord channel 641858948802150400
      const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
      if (DISCORD_TOKEN) {
        const dashboardUrl = (process.env.DASHBOARD_URL || 'https://tinglebot.xyz').replace(/\/+$/, '');
        const notificationsUrl = `${dashboardUrl}/notifications`;
        
        const embed = {
          title: `⚠️ OC Decision Update`,
          color: 0xFFA500, // Orange
          description: `There has been a decision made on your OC. Go to [notifications on dashboard](${notificationsUrl}) or see DMs for more info.`,
          timestamp: new Date().toISOString()
        };
        
        try {
          await fetch(`https://discord.com/api/v10/channels/641858948802150400/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${DISCORD_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              content: `<@${character.userId}>`,
              embeds: [embed]
            })
          });
          logger.success('CHARACTERS', `Needs changes notification posted to Discord channel for ${character.name}`);
        } catch (discordError) {
          logger.error('CHARACTERS', 'Failed to post needs_changes to Discord channel', discordError);
        }
      }
    }
    
    // Log vote (or vote change)
    if (existingVote && existingVote.vote !== vote) {
      await auditService.logVoteChange(
        characterId,
        applicationVersion,
        modId,
        modUsername,
        existingVote.vote,
        vote
      );
    } else {
      await auditService.logVote(
        characterId,
        applicationVersion,
        modId,
        modUsername,
        vote,
        feedback
      );
    }
    
    // Update Discord embed if message exists
    if (character.discordMessageId) {
      const discordPostingService = require('../../services/discordPostingService');
      await discordPostingService.updateApplicationEmbed(character.discordMessageId, character).catch(err => {
        logger.error('CHARACTERS', 'Failed to update Discord embed', err);
      });
    }
    
    // Check if decision has been reached (only for pending characters)
    if (isPending(character.status)) {
      const decision = await ocApplicationService.checkDecision(characterId);
      
      if (decision) {
        if (decision.decision === 'approved') {
          // Process approval
          await ocApplicationService.processApproval(characterId);
          
          // Log decision
          await auditService.logDecision(
            characterId,
            applicationVersion,
            'approved',
            modId,
            { modUsername, voteCounts: voteResult.counts }
          );
          
          // Refresh character
          const refreshedCharacter = await CharacterModel.findById(characterId);
          
          // Assign Discord roles
          try {
            await assignCharacterRoles(refreshedCharacter);
          } catch (err) {
            logger.error('CHARACTERS', 'Failed to assign character roles', err);
            // Log role assignment failure to mod channel if configured
            const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID;
            if (LOGGING_CHANNEL_ID && process.env.DISCORD_TOKEN) {
              const failedRoles = err.message || 'Unknown error';
              await fetch(`https://discord.com/api/v10/channels/${LOGGING_CHANNEL_ID}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  content: `⚠️ **Role Assignment Failed**\n\nUser: <@${refreshedCharacter.userId}>\nCharacter: ${refreshedCharacter.name}\nOC Link: ${process.env.DASHBOARD_URL || 'https://tinglebot.xyz'}/ocs/${refreshedCharacter.publicSlug || refreshedCharacter.name.toLowerCase().replace(/\s+/g, '-')}\n\n**Error:** ${failedRoles}\n\nPlease assign roles manually.`
                })
              }).catch(() => {});
            }
          }
          
          // Send notification via notificationService
          await notificationService.sendOCDecisionNotification(
            refreshedCharacter.userId,
            'approved',
            refreshedCharacter.toObject(),
            null
          ).catch(err => {
            logger.error('CHARACTERS', 'Failed to send approval notification', err);
          });
          
          // Also post to Discord channel
          postCharacterStatusToDiscord(refreshedCharacter, STATUS.ACCEPTED, isModCharacter).catch(err => {
            logger.error('CHARACTERS', 'Failed to post character acceptance to Discord', err);
          });
          
          return res.json({
            success: true,
            message: 'Character approved',
            character: refreshedCharacter.toObject(),
            voteCounts: voteResult.counts
          });
        }
      }
    }
    
    // Refresh character to get updated status
    const refreshedCharacter = await CharacterModel.findById(characterId);
    
    // Return vote counts and status
    const { APPROVAL_THRESHOLD } = ocApplicationService;
    let responseMessage = 'Vote recorded';
    
    if (vote === STATUS.NEEDS_CHANGES && isNeedsChanges(refreshedCharacter.status)) {
      responseMessage = 'Character marked as needs changes. DM sent and notification posted.';
    }
    
    return res.json({
      success: true,
      message: responseMessage,
      voteCounts: voteResult.counts,
      characterStatus: refreshedCharacter.status,
      remaining: {
        approvesNeeded: APPROVAL_THRESHOLD - voteResult.counts.approves
      }
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error recording vote', error);
    return res.status(500).json({ 
      error: 'An error occurred while recording your vote',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// ------------------- Function: submitCharacter -------------------
// Submit character for review (move from DRAFT to PENDING)
router.post('/:id/submit', validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;

  // Find character and verify ownership using shared helper
  let character = await findCharacterWithOwnership(characterId, userId);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Check if character is in DRAFT or NEEDS_CHANGES state (can submit/resubmit from either)
  const isResubmission = isNeedsChanges(character.status);
  
  const { canSubmit } = require('../../utils/statusConstants');
  if (!canSubmit(character.status)) {
    return res.status(400).json({ 
      error: `Character cannot be submitted. Current status: ${character.status || 'DRAFT'}` 
    });
  }

    try {
    const ocApplicationService = require('../../services/ocApplicationService');
    const auditService = require('../../services/auditService');
    
    // If resubmitting from needs_changes, clear all votes/comments and increment version
    if (isResubmission) {
      const currentVersion = character.applicationVersion || 1;
      const newVersion = currentVersion + 1;
      
      // Delete ALL moderation votes/comments for this character (regardless of version)
      // This ensures a clean slate for the new application version
      const deleteResult = await CharacterModeration.deleteMany({ characterId: characterId });
      
      logger.info('CHARACTERS', `Clearing votes/comments for ${character.name} resubmission (v${currentVersion} → v${newVersion}). Deleted ${deleteResult.deletedCount} vote(s)`);
      
      // Clear application feedback
      character.applicationFeedback = [];
      
      // Increment application version (set before submitCharacter so it's preserved)
      character.applicationVersion = newVersion;
      await character.save(); // Save version increment
      
      // Verify deletion worked by checking if any votes remain
      const remainingVotes = await CharacterModeration.countDocuments({ characterId: characterId });
      if (remainingVotes > 0) {
        logger.warn('CHARACTERS', `Warning: ${remainingVotes} vote(s) still exist for ${character.name} after deletion attempt. Attempting force delete.`);
        // Force delete any remaining votes
        await CharacterModeration.deleteMany({ characterId: characterId });
      }
    }
    
    await ocApplicationService.submitCharacter(characterId);

    // Refresh character
    character = await Character.findById(characterId);

    // Log submission
    await auditService.logOCAction(
      'character',
      characterId,
      character.applicationVersion,
      'submitted',
      userId,
      { characterName: character.name }
    );

    // Post to Discord admin channel/thread
    const discordPostingService = require('../../services/discordPostingService');
    logger.info('CHARACTERS', `Attempting to post character ${character.name} to Discord...`);
    await discordPostingService.postApplicationToAdminChannel(character).catch(err => {
      logger.error('CHARACTERS', 'Failed to post character submission to Discord', err);
      console.error('[CHARACTERS] Discord posting error details:', {
        error: err.message,
        stack: err.stack,
        characterId: character._id,
        characterName: character.name,
        userId: character.userId
      });
    });

    logger.info('CHARACTERS', `Character ${character.name} submitted for review by user ${userId}`);

    res.json({
      success: true,
      message: 'Character submitted for review successfully',
      character: character.toObject()
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error submitting character', error);
    res.status(500).json({ 
      error: 'An error occurred while submitting your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));


// ------------------- Function: getApplicationStatus -------------------
// Get current application status for a character
router.get('/:id/application', validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;

  // Find character using shared helper
  const character = await findCharacterWithOwnership(characterId, userId);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Get vote counts
  const applicationVersion = character.applicationVersion || 1;
  const approveCount = await CharacterModeration.countDocuments({
    characterId: characterId,
    applicationVersion: applicationVersion,
    vote: 'approve'
  });
  
  const needsChangesCount = await CharacterModeration.countDocuments({
    characterId: characterId,
    applicationVersion: applicationVersion,
    vote: 'needs_changes'
  });

  // Get all votes
  const votes = await CharacterModeration.find({
    characterId: characterId,
    applicationVersion: applicationVersion
  }).sort({ createdAt: -1 }).lean();

  res.json({
    status: character.status, // null/undefined=DRAFT, 'pending'=PENDING, 'accepted'=ACCEPTED, 'needs_changes'=NEEDS_CHANGES
    applicationVersion: character.applicationVersion,
    submittedAt: character.submittedAt,
    decidedAt: character.decidedAt,
    approvedAt: character.approvedAt,
    applicationFeedback: character.applicationFeedback || [],
    voteCounts: {
      approves: approveCount,
      needsChanges: needsChangesCount
    },
    votes: votes,
    discordMessageId: character.discordMessageId,
    discordThreadId: character.discordThreadId
  });
}));

module.exports = router;






