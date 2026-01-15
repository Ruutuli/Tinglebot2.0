// ============================================================================
// ------------------- Inventory API Routes -------------------
// Routes for inventory data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const { fetchAllCharacters, getCharacterInventoryCollection } = require('../../../shared/database/db');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateRequiredFields } = require('../../middleware/validation');
const logger = require('../../../shared/utils/logger');
const mongoose = require('mongoose');

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

module.exports = router;






