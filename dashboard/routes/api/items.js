// ============================================================================
// ------------------- Items API Routes -------------------
// Routes for item data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const { fetchAllItems, fetchItemByName } = require('../../../shared/database/db');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../../shared/utils/logger');

// ------------------- Function: getAllItems -------------------
// Returns all items from the database
router.get('/', asyncHandler(async (req, res) => {
  const items = await fetchAllItems();
  res.json(items);
}));

// ------------------- Function: getItemByName -------------------
// Returns a specific item by name
router.get('/:name', asyncHandler(async (req, res) => {
  const itemName = decodeURIComponent(req.params.name);
  const item = await fetchItemByName(itemName);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  res.json(item);
}));

module.exports = router;






