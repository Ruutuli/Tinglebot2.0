// ============================================================================
// ------------------- Inventory API Routes -------------------
// Routes for inventory data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const { fetchAllCharacters, getCharacterInventoryCollection, fetchAllItems } = require('@app/shared/database/db');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateRequiredFields } = require('../../middleware/validation');
const logger = require('@app/shared/utils/logger');
const mongoose = require('mongoose');
const Character = require('@app/shared/models/CharacterModel');
const Item = require('@app/shared/models/ItemModel');
const InventoryLog = require('@app/shared/models/InventoryLogModel');

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ------------------- Function: checkDatabaseConnections -------------------
// Verifies that required database connections are available before processing
async function checkDatabaseConnections() {
  try {
    // Check main database connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Main database connection not available');
    }
    
    // Note: We can't directly check inventoriesDbNativeConnection here as it's not exported
    // The getCharacterInventoryCollection will handle connection internally
    return true;
  } catch (error) {
    logger.error(`Database connection check failed: ${error.message}`, 'inventory.js');
    throw error;
  }
}

// ------------------- Function: getAllInventory -------------------
// Returns all inventory data for all characters
router.get('/', asyncHandler(async (req, res) => {
  await checkDatabaseConnections();
  const characters = await fetchAllCharacters();
  const inventoryData = [];

  for (const char of characters) {
    try {
      const col = await getCharacterInventoryCollection(char.name);
      const inv = await col.find().toArray();
      inventoryData.push({
        characterName: char.name,
        inventory: inv
      });
    } catch (error) {
      logger.warn(`Error fetching inventory for character ${char.name}: ${error.message}`, 'inventory.js');
      continue;
    }
  }

  res.json({ data: inventoryData });
}));

// ------------------- Function: getInventoryList -------------------
// Returns character list with inventory summaries for simplified inventory view
router.get('/list', asyncHandler(async (req, res) => {
  await checkDatabaseConnections();
  const characters = await fetchAllCharacters();
  const list = [];

  for (const char of characters) {
    try {
      const col = await getCharacterInventoryCollection(char.name);
      const inv = await col.find().toArray();
      
      // Calculate totalItems (sum of all quantities) and uniqueItems (count of unique item names)
      const totalItems = inv.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const uniqueItemNames = new Set(inv.filter(item => (item.quantity || 0) > 0).map(item => item.itemName));
      const uniqueItems = uniqueItemNames.size;
      
      list.push({
        characterName: char.name,
        icon: char.icon || null,
        job: char.job || null,
        currentVillage: char.currentVillage || null,
        uniqueItems: uniqueItems,
        totalItems: totalItems
      });
    } catch (error) {
      logger.warn(`Error fetching inventory list for character ${char.name}: ${error.message}`, 'inventory.js');
      continue;
    }
  }

  res.json({ data: list });
}));

// ------------------- Function: getCharacterItems -------------------
// Returns inventory items for a specific character
router.get('/character/:characterName/items', asyncHandler(async (req, res) => {
  const { characterName } = req.params;
  
  logger.info(`[inventory.js] GET /api/inventory/character/${characterName}/items - Route matched`, 'inventory.js');
  
  await checkDatabaseConnections();
  
  if (!characterName) {
    return res.status(400).json({ error: 'Character name is required' });
  }

  try {
    const decodedName = decodeURIComponent(characterName);
    const escapedName = escapeRegExp(decodedName);
    
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    }).lean();

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const col = await getCharacterInventoryCollection(character.name);
    const items = await col.find({ quantity: { $gt: 0 } })
      .sort({ itemName: 1 })
      .limit(1000)
      .toArray();

    // Stack items by name and sum quantities
    const stackedItems = new Map();
    items.forEach(item => {
      const itemName = item.itemName || 'Unknown Item';
      if (stackedItems.has(itemName)) {
        stackedItems.get(itemName).quantity += (item.quantity || 0);
      } else {
        stackedItems.set(itemName, {
          itemName: itemName,
          quantity: item.quantity || 0,
          category: item.category || null,
          type: item.type || null,
          image: item.image || null
        });
      }
    });

    res.json({
      data: Array.from(stackedItems.values())
    });
  } catch (error) {
    logger.error(`Error fetching items for ${characterName}: ${error.message}`, 'inventory.js');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}));

// ------------------- Function: getInventorySummary -------------------
// Returns summary of inventory data
router.get('/summary', asyncHandler(async (req, res) => {
  await checkDatabaseConnections();
  const characters = await fetchAllCharacters();
  const summary = [];

  for (const char of characters) {
    try {
      const col = await getCharacterInventoryCollection(char.name);
      const inv = await col.find().toArray();
      
      // Calculate totalItems (sum of all quantities) and uniqueItems (count of unique item names)
      const totalItems = inv.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const uniqueItemNames = new Set(inv.filter(item => (item.quantity || 0) > 0).map(item => item.itemName));
      const uniqueItems = uniqueItemNames.size;
      
      summary.push({
        characterName: char.name,
        totalItems: totalItems,
        uniqueItems: uniqueItems
      });
    } catch (error) {
      logger.warn(`Error counting inventory for character ${char.name}: ${error.message}`, 'inventory.js');
      continue;
    }
  }

  res.json({ data: summary });
}));

// ------------------- Function: searchInventoryByItem -------------------
// Searches inventory for specific item across all characters
// Uses batched parallel queries to prevent connection pool exhaustion
router.post('/item', validateRequiredFields(['itemName']), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { itemName } = req.body;
  const REQUEST_TIMEOUT = 30000; // 30 seconds max request time
  const BATCH_SIZE = 25; // Process 25 characters at a time
  
  // Set request timeout
  req.setTimeout(REQUEST_TIMEOUT, () => {
    logger.warn(`Request timeout for item search: "${itemName}"`, 'inventory.js');
  });
  
  if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) {
    logger.warn('Invalid itemName provided to searchInventoryByItem', 'inventory.js');
    return res.status(400).json({ error: 'Invalid itemName provided' });
  }

  try {
    // Check database connections before processing
    await checkDatabaseConnections();
    
    const characters = await fetchAllCharacters();
    logger.info(`Searching for item "${itemName}" across ${characters.length} characters`, 'inventory.js');
    
    // Process characters in batches to prevent connection pool exhaustion
    const inventoryData = [];
    const normalizedItemName = itemName.toLowerCase();
    
    for (let i = 0; i < characters.length; i += BATCH_SIZE) {
      const batch = characters.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();
      
      // Process batch in parallel with timeout protection
      const batchPromises = batch.map(async (char) => {
        try {
          // Add timeout to individual character queries
          const queryPromise = (async () => {
            const col = await getCharacterInventoryCollection(char.name);
            const inv = await col.find().toArray();
            const entry = inv.find(i => i.itemName.toLowerCase() === normalizedItemName);
            if (entry) {
              return { characterName: char.name, quantity: entry.quantity };
            }
            return null;
          })();
          
          // Race against timeout (5 seconds per character)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Character query timeout')), 5000)
          );
          
          return await Promise.race([queryPromise, timeoutPromise]);
        } catch (error) {
          // Log but don't fail the entire request
          if (error.message !== 'Character query timeout') {
            logger.warn(`Error searching inventory for character ${char.name}: ${error.message}`, 'inventory.js');
          }
          return null;
        }
      });
      
      try {
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(Boolean);
        inventoryData.push(...validResults);
        
        const batchDuration = Date.now() - batchStartTime;
        logger.debug(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} characters) in ${batchDuration}ms`, 'inventory.js');
      } catch (batchError) {
        logger.warn(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`, 'inventory.js');
        // Continue with next batch instead of failing entire request
      }
      
      // Check if overall request is taking too long
      if (Date.now() - startTime > REQUEST_TIMEOUT - 5000) {
        logger.warn(`Request approaching timeout, stopping at character ${i + batch.length} of ${characters.length}`, 'inventory.js');
        break;
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`Item search completed in ${duration}ms. Found ${inventoryData.length} characters with item "${itemName}"`, 'inventory.js');
    
    res.json(inventoryData);
  } catch (error) {
    logger.error(`Error in searchInventoryByItem for item "${itemName}": ${error.message}`, 'inventory.js');
    // Don't crash - return error response instead
    res.status(500).json({ error: 'Internal server error while searching inventory', details: error.message });
  }
}));

// ------------------- Function: getCharacterInventories -------------------
// Returns inventory data for all characters (with character info)
router.get('/characters', asyncHandler(async (req, res) => {
  await checkDatabaseConnections();
  const characters = await fetchAllCharacters();
  const inventoryData = [];

  for (const char of characters) {
    try {
      const col = await getCharacterInventoryCollection(char.name);
      const inv = await col.find().toArray();
      inventoryData.push({
        characterName: char.name,
        characterId: char._id,
        inventory: inv.map(item => ({
          itemName: item.itemName,
          quantity: item.quantity
        }))
      });
    } catch (error) {
      logger.warn(`Error fetching inventory for character ${char.name}: ${error.message}`, 'inventory.js');
      continue;
    }
  }

  res.json({ data: inventoryData });
}));

// ------------------- Function: getCharacterDetailedInventory -------------------
// Returns complete inventory with all items (owned and not owned) for a specific character
router.get('/character/:characterName/detailed', asyncHandler(async (req, res) => {
  const { characterName } = req.params;
  
  logger.info(`[inventory.js] GET /api/inventory/character/${characterName}/detailed - Route matched`, 'inventory.js');
  logger.info(`[inventory.js] Request URL: ${req.url}, Original URL: ${req.originalUrl}`, 'inventory.js');
  
  await checkDatabaseConnections();
  
  if (!characterName) {
    return res.status(400).json({ error: 'Character name is required' });
  }

  try {
    // Decode URL-encoded character name and escape regex special characters
    const decodedName = decodeURIComponent(characterName);
    const escapedName = escapeRegExp(decodedName);
    
    // Find character (case-insensitive)
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    }).lean();

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get character's inventory
    const col = await getCharacterInventoryCollection(character.name);
    const inventoryItems = await col.find().toArray();

    // Create a map of owned items for quick lookup
    const ownedItemsMap = new Map();
    inventoryItems.forEach(item => {
      if (item.quantity > 0) {
        ownedItemsMap.set(item.itemName.toLowerCase(), {
          quantity: item.quantity,
          category: item.category,
          type: item.type,
          subtype: item.subtype,
          obtain: item.obtain,
          location: item.location,
          date: item.date
        });
      }
    });

    // Get all items in the game
    const allItems = await fetchAllItems();

    // Merge all items with owned status
    const completeInventory = allItems.map(item => {
      const owned = ownedItemsMap.get(item.itemName.toLowerCase());
      return {
        itemName: item.itemName,
        quantity: owned ? owned.quantity : 0,
        category: item.category || [],
        type: item.type || [],
        subtype: item.subtype || [],
        image: item.image,
        emoji: item.emoji,
        owned: !!owned,
        obtain: owned ? owned.obtain : null,
        location: owned ? owned.location : null
      };
    });

    res.json({
      data: {
        characterName: character.name,
        characterId: character._id,
        icon: character.icon,
        totalItems: inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
        uniqueItems: inventoryItems.filter(item => (item.quantity || 0) > 0).length,
        inventory: completeInventory
      }
    });
  } catch (error) {
    logger.error(`Error fetching detailed inventory for ${characterName}: ${error.message}`, 'inventory.js');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}));

// ------------------- Function: getCharacterInventoryLogs -------------------
// Returns acquisition history/logs for a specific character
router.get('/character/:characterName/logs', asyncHandler(async (req, res) => {
  const { characterName } = req.params;
  
  logger.info(`[inventory.js] GET /api/inventory/character/${characterName}/logs - Route matched`, 'inventory.js');
  logger.info(`[inventory.js] Request URL: ${req.url}, Original URL: ${req.originalUrl}`, 'inventory.js');
  
  await checkDatabaseConnections();
  
  // Log all query parameters for debugging
  logger.info(`[inventory.js] Query params: ${JSON.stringify(req.query)}`, 'inventory.js');
  
  const {
    item, // Accept 'item' query parameter (from frontend)
    itemName, // Also accept 'itemName' for backwards compatibility
    obtain,
    category,
    type,
    location,
    startDate,
    endDate,
    limit = 1000,
    skip = 0
  } = req.query;
  
  // Use 'item' if provided, otherwise fall back to 'itemName'
  // Decode URL-encoded values
  let filterItemName = null;
  const itemParam = item || itemName;
  if (itemParam && typeof itemParam === 'string' && itemParam.trim().length > 0) {
    try {
      filterItemName = decodeURIComponent(itemParam.trim());
      logger.info(`[inventory.js] Decoded itemName: "${filterItemName}" from "${itemParam}"`, 'inventory.js');
    } catch (e) {
      // If decoding fails, use the raw value
      filterItemName = itemParam.trim();
      logger.warn(`[inventory.js] Failed to decode itemName, using raw: "${filterItemName}"`, 'inventory.js');
    }
  } else {
    logger.info(`[inventory.js] No item parameter found in query (item="${item}", itemName="${itemName}")`, 'inventory.js');
  }

  // Log the filter being applied
  if (filterItemName) {
    logger.info(`[inventory.js] Filtering logs by itemName: "${filterItemName}"`, 'inventory.js');
  } else {
    logger.info(`[inventory.js] No item filter provided - returning all logs`, 'inventory.js');
  }

  if (!characterName) {
    return res.status(400).json({ error: 'Character name is required' });
  }

  try {
    // Decode URL-encoded character name and escape regex special characters
    const decodedName = decodeURIComponent(characterName);
    const escapedName = escapeRegExp(decodedName);
    
    // Find character (case-insensitive)
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    }).lean();

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Build filters object - only include itemName if it's provided
    const filters = {
      obtain,
      category,
      type,
      location,
      startDate,
      endDate,
      limit: parseInt(limit),
      skip: parseInt(skip)
    };
    
    // Only add itemName filter if it was provided
    if (filterItemName) {
      filters.itemName = filterItemName;
      logger.info(`[inventory.js] Adding itemName filter to query: "${filterItemName}"`, 'inventory.js');
    } else {
      logger.warn(`[inventory.js] WARNING: filterItemName is null/undefined - NOT filtering by item!`, 'inventory.js');
    }

    logger.info(`[inventory.js] Calling getCharacterLogs with filters: ${JSON.stringify(filters)}`, 'inventory.js');

    // Get logs with filters
    const logs = await InventoryLog.getCharacterLogs(character.name, filters);
    
    logger.info(`[inventory.js] Found ${logs.length} logs for character "${character.name}"${filterItemName ? ` with item "${filterItemName}"` : ' (ALL ITEMS)'}`, 'inventory.js');

    res.json({
      data: {
        characterName: character.name,
        characterId: character._id,
        logs: logs,
        total: logs.length
      }
    });
  } catch (error) {
    logger.error(`Error fetching inventory logs for ${characterName}: ${error.message}`, 'inventory.js');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}));

// ------------------- Function: getCharacterAllItems -------------------
// Returns all game items with owned status for a specific character
router.get('/character/:characterName/all-items', asyncHandler(async (req, res) => {
  await checkDatabaseConnections();
  const { characterName } = req.params;

  if (!characterName) {
    return res.status(400).json({ error: 'Character name is required' });
  }

  try {
    // Decode URL-encoded character name and escape regex special characters
    const decodedName = decodeURIComponent(characterName);
    const escapedName = escapeRegExp(decodedName);
    
    // Find character (case-insensitive)
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    }).lean();

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get character's inventory
    const col = await getCharacterInventoryCollection(character.name);
    const inventoryItems = await col.find().toArray();

    // Create a map of owned items for quick lookup
    const ownedItemsMap = new Map();
    inventoryItems.forEach(item => {
      if (item.quantity > 0) {
        ownedItemsMap.set(item.itemName.toLowerCase(), item.quantity);
      }
    });

    // Get all items in the game
    const allItems = await fetchAllItems();

    // Map items with owned status
    const itemsWithStatus = allItems.map(item => ({
      itemName: item.itemName,
      quantity: ownedItemsMap.get(item.itemName.toLowerCase()) || 0,
      owned: ownedItemsMap.has(item.itemName.toLowerCase()),
      category: item.category || [],
      type: item.type || [],
      subtype: item.subtype || [],
      image: item.image,
      emoji: item.emoji
    }));

    res.json({
      data: {
        characterName: character.name,
        characterId: character._id,
        items: itemsWithStatus,
        totalItems: allItems.length,
        ownedItems: inventoryItems.filter(item => (item.quantity || 0) > 0).length
      }
    });
  } catch (error) {
    logger.error(`Error fetching all items for ${characterName}: ${error.message}`, 'inventory.js');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}));

module.exports = router;






