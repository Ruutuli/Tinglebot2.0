// ============================================================================
// ------------------- Inventory API Routes -------------------
// Routes for inventory data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const { fetchAllCharacters, getCharacterInventoryCollection } = require('../../database/db-dashboard');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateRequiredFields } = require('../../middleware/validation');
const logger = require('../../utils/logger');

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
      const count = await col.countDocuments();
      summary.push({
        characterName: char.name,
        itemCount: count
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
router.post('/item', validateRequiredFields(['itemName']), asyncHandler(async (req, res) => {
  const { itemName } = req.body;
  const characters = await fetchAllCharacters();
  const inventoryData = [];

  for (const char of characters) {
    try {
      const col = await getCharacterInventoryCollection(char.name);
      const inv = await col.find().toArray();
      const entry = inv.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
      if (entry) {
        inventoryData.push({ characterName: char.name, quantity: entry.quantity });
      }
    } catch (error) {
      logger.warn(`Error searching inventory for character ${char.name}: ${error.message}`, 'inventory.js');
      continue;
    }
  }

  res.json(inventoryData);
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







