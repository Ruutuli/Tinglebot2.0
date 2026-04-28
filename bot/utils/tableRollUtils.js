// ============================================================================
// ------------------- Table Roll Utilities -------------------
// Utility functions for table roll operations, validation, and CSV processing
// ============================================================================

const { EmbedBuilder, MessageFlags } = require('discord.js');
const TableRoll = require('../models/TableRollModel');
const { handleError } = require('./globalErrorHandler');
const { connectToTinglebot } = require('../database/db');
const { capitalizeWords } = require('../modules/formattingModule');

const KNOWN_VILLAGES = Object.freeze(['Rudania', 'Inariko', 'Vhintl']);
const KNOWN_VILLAGES_LOWER = new Set(KNOWN_VILLAGES.map((v) => v.toLowerCase()));

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

// ------------------- Function: validateURL -------------------
// Validates URL format (consistent with Mongoose model)
function validateURL(url) {
  if (!url) return true; // Empty is allowed
  
  // Trim whitespace
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return true; // Empty after trimming is allowed
  
  // Check if it looks like a URL (starts with http/https or contains common URL patterns)
  const urlPattern = /^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/;
  if (!urlPattern.test(trimmedUrl)) {
    return true; // If it doesn't look like a URL, consider it valid (probably just text)
  }
  
  try {
    new URL(trimmedUrl);
    return true;
  } catch {
    return false;
  }
}

// ------------------- Function: parseCSVData -------------------
// Parses CSV data into table entries with validation
function parseCSVData(csvText) {
  try {
    const lines = csvText.split('\n');
    const entries = [];
    const validationErrors = [];
    
    // Skip header line and process data
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line
      const values = parseCSVLine(line);
      if (values.length >= 3) {
        const weight = parseFloat(values[0]) || 1;
        const flavor = (values[1] || '').trim();
        const item = (values[2] || '').trim();
        const thumbnailImage = (values[3] || '').trim();
        const category = (values[4] || 'general').trim();
        const rarity = (values[5] || 'common').trim();
        
        // Validate weight
        if (weight <= 0) {
          validationErrors.push(`Row ${i + 1}: Invalid weight (${values[0]})`);
          continue;
        }
        
        // Validate thumbnail URL
        if (thumbnailImage && !validateURL(thumbnailImage)) {
          validationErrors.push(`Row ${i + 1}: Invalid URL format for thumbnail image (${thumbnailImage})`);
          continue;
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
    
    // Return validation errors if any found
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: `Validation errors found:\n${validationErrors.join('\n')}` 
      };
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
// ------------------- Location & village rules (Discord + character) -------------------
// ============================================================================

function getVillageTownHallChannelIds() {
  return {
    Rudania: process.env.RUDANIA_TOWNHALL,
    Inariko: process.env.INARIKO_TOWNHALL,
    Vhintl: process.env.VHINTL_TOWNHALL,
  };
}

/** Same default as crafting/travel tooling; optional TABLEROOLL_TEST_CHANNEL_IDS (comma-separated) and TABLEROOLL_TEST_CHANNEL_ID. */
function getTablerollBypassChannelIds() {
  const ids = new Set();
  const list = String(process.env.TABLEROLL_TEST_CHANNEL_IDS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  list.forEach((id) => ids.add(id));
  const single = String(process.env.TABLEROLL_TEST_CHANNEL_ID || '').trim();
  if (single) ids.add(single);
  ids.add('1391812848099004578'); // crafting / misc test channel override
  return [...ids];
}

function normalizeCharacterVillageName(character) {
  const raw = character?.currentVillage ?? character?.homeVillage ?? '';
  const s = capitalizeWords(String(raw || '').trim()) || '';
  return s || '';
}

/** Parse comma/semicolon village list from slash command or CSV note. */
function parseAllowedVillagesInput(raw) {
  if (raw == null || raw === '') {
    return { valid: true, villages: [] };
  }
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Village list must be text', villages: [] };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, villages: [] };
  }
  const parts = trimmed.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  const bad = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (KNOWN_VILLAGES_LOWER.has(key)) {
      out.push(capitalizeWords(p));
    } else {
      bad.push(p);
    }
  }
  if (bad.length) {
    return {
      valid: false,
      error: `Unknown village name(s): ${bad.join(', ')}. Use: ${KNOWN_VILLAGES.join(', ')}`,
      villages: [],
    };
  }
  return { valid: true, villages: [...new Set(out)] };
}

function isChannelOrThreadOf(interaction, channelId) {
  if (!channelId) return false;
  if (interaction.channelId === channelId) return true;
  const parentId = interaction.channel?.parentId;
  return Boolean(parentId && parentId === channelId);
}

function isOnBypassList(interaction, bypassIds) {
  return bypassIds.some((id) => isChannelOrThreadOf(interaction, id));
}

/**
 * Enforces: roll in guild; character village town hall (or bypass test channel); optional table.allowedVillages.
 * @returns {{ ok: true } | { ok: false, reply: object }}
 */
function assertTablerollRollAllowed(interaction, character, tableDoc) {
  if (!interaction.guildId) {
    return {
      ok: false,
      reply: {
        content:
          '❌ Use `/tableroll roll` in your village **Town Hall** channel (or a thread there), not in DMs.',
        flags: [MessageFlags.Ephemeral],
      },
    };
  }

  const villageKey = normalizeCharacterVillageName(character);
  const villages = getVillageTownHallChannelIds();
  const bypass = getTablerollBypassChannelIds();

  const allowedOnTable = Array.isArray(tableDoc?.allowedVillages) ? tableDoc.allowedVillages : [];
  if (allowedOnTable.length > 0) {
    const curLower = villageKey.toLowerCase();
    const allowedLower = new Set(allowedOnTable.map((v) => String(v).trim().toLowerCase()).filter(Boolean));
    if (!allowedLower.has(curLower)) {
      const pretty = [...new Set(allowedOnTable.map((v) => capitalizeWords(String(v))))].join(', ');
      return {
        ok: false,
        reply: {
          content:
            `❌ **${tableDoc.name || 'This table'}** can only be rolled while **${character.name}** is stationed in: **${pretty}**.\n📍 Currently: **${villageKey || 'unknown'}**`,
          flags: [MessageFlags.Ephemeral],
        },
      };
    }
  }

  if (isOnBypassList(interaction, bypass)) {
    return { ok: true };
  }

  const allowedChannelId = villages[villageKey];

  if (!allowedChannelId) {
    const embed = new EmbedBuilder()
      .setColor(0x008b8b)
      .setDescription(
        `⚠️ **Town hall channel is not configured** for **${villageKey || 'this village'}** (check server env: RUDANIA_TOWNHALL / INARIKO_TOWNHALL / VHINTL_TOWNHALL).\n📍 Character location: **${villageKey || 'unknown'}**`
      )
      .setFooter({ text: 'Channel configuration' })
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    return { ok: false, reply: { embeds: [embed], flags: [MessageFlags.Ephemeral] } };
  }

  if (!isChannelOrThreadOf(interaction, allowedChannelId)) {
    const embed = new EmbedBuilder()
      .setColor(0x008b8b)
      .setDescription(
        `*${character.name} looks around, confused by their surroundings...*\n\n**Channel restriction**\nYou can only roll in **${villageKey}** Town Hall.\n\n📍 **Current location:** ${villageKey}\n💬 **Roll here:** <#${allowedChannelId}>`
      )
      .setFooter({ text: 'Table roll' })
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    return { ok: false, reply: { embeds: [embed], flags: [MessageFlags.Ephemeral] } };
  }

  return { ok: true };
}

function formatAllowedVillagesShort(table) {
  const a = Array.isArray(table?.allowedVillages) ? table.allowedVillages.filter(Boolean) : [];
  if (a.length === 0) return '';
  return ` · 🏘️ ${[...new Set(a.map((v) => capitalizeWords(String(v))))].join(', ')}`;
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
  getCategoryEmoji,
  KNOWN_VILLAGES,
  parseAllowedVillagesInput,
  assertTablerollRollAllowed,
  formatAllowedVillagesShort,
}; 