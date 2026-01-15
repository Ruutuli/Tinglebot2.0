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

// ------------------- Function: getAllInventory -------------------
// Returns all inventory data for all characters
router.get('/', asyncHandler(async (req, res) => {
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
// Optimized to use parallel queries for better performance
router.post('/item', validateRequiredFields(['itemName']), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { itemName } = req.body;
  
  if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) {
    logger.warn('Invalid itemName provided to searchInventoryByItem', 'inventory.js');
    return res.status(400).json({ error: 'Invalid itemName provided' });
  }

  try {
    const characters = await fetchAllCharacters();
    logger.info(`Searching for item "${itemName}" across ${characters.length} characters`, 'inventory.js');
    
    // Use parallel queries instead of sequential for better performance
    const inventoryPromises = characters.map(async (char) => {
      try {
        const col = await getCharacterInventoryCollection(char.name);
        const inv = await col.find().toArray();
        const entry = inv.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
        if (entry) {
          return { characterName: char.name, quantity: entry.quantity };
        }
        return null;
      } catch (error) {
        logger.warn(`Error searching inventory for character ${char.name}: ${error.message}`, 'inventory.js');
        return null;
      }
    });
    
    const results = await Promise.all(inventoryPromises);
    const inventoryData = results.filter(Boolean);
    
    const duration = Date.now() - startTime;
    logger.info(`Item search completed in ${duration}ms. Found ${inventoryData.length} characters with item "${itemName}"`, 'inventory.js');
    
    res.json(inventoryData);
  } catch (error) {
    logger.error(`Error in searchInventoryByItem for item "${itemName}": ${error.message}`, 'inventory.js');
    res.status(500).json({ error: 'Internal server error while searching inventory' });
  }
}));

// ------------------- Function: getCharacterInventories -------------------
// Returns inventory data for all characters (with character info)
router.get('/characters', asyncHandler(async (req, res) => {
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






