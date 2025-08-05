// ============================================================================
// ------------------- Table Roll Utilities -------------------
// Utility functions for table roll operations, validation, and CSV processing
// ============================================================================

const TableRoll = require('../models/TableRollModel');
const { handleError } = require('./globalErrorHandler');
const { connectToTinglebot } = require('../database/db');

// ============================================================================
// ------------------- Validation Functions -------------------
// ============================================================================

// ------------------- Function: validateTableName -------------------
// Validates a table name format
function validateTableName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Table name must be a string' };
  }
  
  if (name.length < 1 || name.length > 100) {
    return { valid: false, error: 'Table name must be between 1 and 100 characters' };
  }
  
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
    return { valid: false, error: 'Table name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }
  
  return { valid: true };
}

// ------------------- Function: validateTableEntries -------------------
// Validates table entries format
function validateTableEntries(entries) {
  if (!Array.isArray(entries)) {
    return { valid: false, error: 'Entries must be an array' };
  }
  
  if (entries.length === 0) {
    return { valid: false, error: 'Table must have at least one entry' };
  }
  
  if (entries.length > 1000) {
    return { valid: false, error: 'Table cannot have more than 1000 entries' };
  }
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    
    if (!entry || typeof entry !== 'object') {
      return { valid: false, error: `Entry ${i + 1} must be an object` };
    }
    
    if (typeof entry.weight !== 'number' || entry.weight <= 0) {
      return { valid: false, error: `Entry ${i + 1} must have a positive weight` };
    }
    
    if (entry.flavor && typeof entry.flavor !== 'string') {
      return { valid: false, error: `Entry ${i + 1} flavor must be a string` };
    }
    
    if (entry.item && typeof entry.item !== 'string') {
      return { valid: false, error: `Entry ${i + 1} item must be a string` };
    }
    
    if (entry.thumbnailImage && typeof entry.thumbnailImage !== 'string') {
      return { valid: false, error: `Entry ${i + 1} thumbnailImage must be a string` };
    }
  }
  
  return { valid: true };
}

// ============================================================================
// ------------------- CSV Processing Functions -------------------
// ============================================================================

// ------------------- Function: parseCSVData -------------------
// Parses CSV data into table entries with validation
function parseCSVData(csvText) {
  try {
    const lines = csvText.split('\n');
    const entries = [];
    
    // Skip header line and process data
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line
      const values = parseCSVLine(line);
      if (values.length >= 3) {
        const weight = parseFloat(values[0]) || 1;
        const flavor = values[1] || '';
        const item = values[2] || '';
        const thumbnailImage = values[3] || '';
        const category = values[4] || 'general';
        const rarity = values[5] || 'common';
        
        // Validate weight
        if (weight <= 0) {
          continue; // Skip invalid entries
        }
        
        // Validate rarity
        const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const finalRarity = validRarities.includes(rarity) ? rarity : 'common';
        
        entries.push({
          weight: weight,
          flavor: flavor,
          item: item,
          thumbnailImage: thumbnailImage,
          category: category,
          rarity: finalRarity
        });
      }
    }
    
    return { success: true, entries };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ------------------- Function: parseCSVLine -------------------
// Parses a single CSV line with proper quote handling
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

// ============================================================================
// ------------------- Statistics Functions -------------------
// ============================================================================

// ------------------- Function: getTableStatistics -------------------
// Gets comprehensive statistics for a table
async function getTableStatistics(tableName) {
  try {
    const table = await TableRoll.findOne({ name: tableName });
    
    if (!table) {
      throw new Error(`Table '${tableName}' not found`);
    }
    
    // Calculate entry statistics
    const entryStats = {
      totalEntries: table.entries.length,
      totalWeight: table.totalWeight,
      averageWeight: table.totalWeight / table.entries.length,
      itemsWithFlavor: table.entries.filter(e => e.flavor && e.flavor.trim()).length,
      itemsOnly: table.entries.filter(e => e.item && e.item.trim() && !e.flavor).length,
      flavorOnly: table.entries.filter(e => e.flavor && e.flavor.trim() && !e.item).length,
      withThumbnails: table.entries.filter(e => e.thumbnailImage && e.thumbnailImage.trim()).length
    };
    
    // Calculate rarity distribution
    const rarityDistribution = {};
    table.entries.forEach(entry => {
      const rarity = entry.rarity || 'common';
      rarityDistribution[rarity] = (rarityDistribution[rarity] || 0) + 1;
    });
    
    return {
      table: table,
      entryStats: entryStats,
      rarityDistribution: rarityDistribution,
      rollStats: {
        totalRolls: table.rollCount || 0,
        dailyRolls: table.dailyRollCount || 0,
        lastRolled: table.lastRolled,
        maxRollsPerDay: table.maxRollsPerDay
      }
    };
    
  } catch (error) {
    handleError(error, 'tableRollUtils.js', {
      functionName: 'getTableStatistics',
      tableName: tableName
    });
    throw error;
  }
}

// ------------------- Function: getGlobalStatistics -------------------
// Gets global statistics for all tables
async function getGlobalStatistics() {
  try {
    const [totalTables, totalRolls, categoryStats, rarityStats] = await Promise.all([
      TableRoll.countDocuments({ isActive: true }),
      TableRoll.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: '$rollCount' } } }
      ]),
      TableRoll.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      TableRoll.aggregate([
        { $match: { isActive: true } },
        { $unwind: '$entries' },
        { $group: { _id: '$entries.rarity', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);
    
    return {
      totalTables: totalTables,
      totalRolls: totalRolls[0]?.total || 0,
      categoryStats: categoryStats,
      rarityStats: rarityStats
    };
    
  } catch (error) {
    handleError(error, 'tableRollUtils.js', {
      functionName: 'getGlobalStatistics'
    });
    throw error;
  }
}

// ============================================================================
// ------------------- Export Functions -------------------
// ============================================================================

// ------------------- Function: exportTableToCSV -------------------
// Exports a table to CSV format
function exportTableToCSV(table) {
  const csvLines = ['Weight,Flavor,Item,ThumbnailImage,Category,Rarity'];
  
  table.entries.forEach(entry => {
    const line = [
      entry.weight,
      `"${entry.flavor.replace(/"/g, '""')}"`,
      `"${entry.item.replace(/"/g, '""')}"`,
      `"${entry.thumbnailImage.replace(/"/g, '""')}"`,
      entry.category || 'general',
      entry.rarity || 'common'
    ].join(',');
    
    csvLines.push(line);
  });
  
  return csvLines.join('\n');
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: getRarityColor -------------------
// Gets the color for a rarity level
function getRarityColor(rarity) {
  const colors = {
    common: 0x9D9D9D,
    uncommon: 0x1EFF00,
    rare: 0x0070DD,
    epic: 0xA335EE,
    legendary: 0xFF8000
  };
  return colors[rarity] || 0x9D9D9D;
}

// ------------------- Function: getRarityEmoji -------------------
// Gets the emoji for a rarity level
function getRarityEmoji(rarity) {
  const emojis = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟠'
  };
  return emojis[rarity] || '⚪';
}

// ------------------- Function: getCategoryEmoji -------------------
// Gets the emoji for a category
function getCategoryEmoji(category) {
  const emojis = {
    general: '📋',
    loot: '💎',
    monster: '👹',
    treasure: '🏆',
    crafting: '🔨',
    event: '🎉',
    custom: '🎨'
  };
  return emojis[category] || '📋';
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  validateTableName,
  validateTableEntries,
  parseCSVData,
  parseCSVLine,
  getTableStatistics,
  getGlobalStatistics,
  exportTableToCSV,
  getRarityColor,
  getRarityEmoji,
  getCategoryEmoji
}; 