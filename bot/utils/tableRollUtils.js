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

/**
 * Quest RP parent channels (forum / village RP) — same IDs as dashboard
 * admin/quests `RP_THREAD_CHANNELS`. First id per village is the main hub; others are sub-areas.
 */
const QUEST_RP_PARENT_IDS_BY_VILLAGE = Object.freeze({
  Rudania: ['629027808274022410', '717090447369043990'],
  Inariko: ['629027788229443623', '717090521218285670'],
  Vhintl: ['629027942437224498', '717090589690298419'],
});

/** Shared RP parents (e.g. ⭐ casual-rp): any character stationed in a known village may roll here or in threads under them. */
const QUEST_RP_SHARED_PARENT_IDS = Object.freeze(['717091108295016448']);

function getVillageTownHallChannelIds() {
  return {
    Rudania: process.env.RUDANIA_TOWNHALL,
    Inariko: process.env.INARIKO_TOWNHALL,
    Vhintl: process.env.VHINTL_TOWNHALL,
  };
}

/** Forum / village RP channels (🔥 rudania etc.) — optional; complements town halls for `/tableroll roll`. */
function getVillageForumChannelIds() {
  return {
    Rudania: process.env.RUDANIA_VILLAGE,
    Inariko: process.env.INARIKO_VILLAGE,
    Vhintl: process.env.VHINTL_VILLAGE,
  };
}

/** Parent channel IDs where a roll is allowed for this village (town hall + optional env + quest RP parents). */
function getTablerollParentChannelIdsForVillage(villageKey) {
  const hall = getVillageTownHallChannelIds()[villageKey];
  const forum = getVillageForumChannelIds()[villageKey];
  const questExtras = Array.isArray(QUEST_RP_PARENT_IDS_BY_VILLAGE[villageKey])
    ? QUEST_RP_PARENT_IDS_BY_VILLAGE[villageKey]
    : [];
  const ids = [hall, forum, ...questExtras].map((id) => (id ? String(id).trim() : '')).filter(Boolean);
  return [...new Set(ids)];
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

function normalizeDiscordSnowflake(id) {
  if (id == null || id === '') return '';
  return String(id).trim();
}

/** True if slash is in this channel or in a thread/post whose parent is this channel (forum, text, announcements). */
function isChannelOrThreadOf(interaction, channelId) {
  const target = normalizeDiscordSnowflake(channelId);
  if (!target) return false;
  const ch = interaction.channel;
  if (!ch) return false;
  if (normalizeDiscordSnowflake(ch.id) === target) return true;
  const parentIdRaw = ch.parentId != null ? ch.parentId : ch.parent?.id;
  const parentId = normalizeDiscordSnowflake(parentIdRaw);
  return Boolean(parentId && parentId === target);
}

function isOnBypassList(interaction, bypassIds) {
  return bypassIds.some((id) => isChannelOrThreadOf(interaction, id));
}

/**
 * Enforces: roll in guild; character village Town Hall **or** village forum channel (or bypass); optional table.allowedVillages.
 * @returns {{ ok: true } | { ok: false, reply: object }}
 */
function assertTablerollRollAllowed(interaction, character, tableDoc) {
  if (!interaction.guildId) {
    return {
      ok: false,
      reply: {
        content:
          '❌ Use `/tableroll roll` in your village **Town Hall or village channel** (or a thread there), not in DMs.',
        flags: [MessageFlags.Ephemeral],
      },
    };
  }

  const villageKey = normalizeCharacterVillageName(character);
  const bypass = getTablerollBypassChannelIds();

  const allowedOnTable = Array.isArray(tableDoc?.allowedVillages) ? tableDoc.allowedVillages : [];
  if (allowedOnTable.length > 0) {
    const curLower = villageKey.toLowerCase();
    const allowedLower = new Set(allowedOnTable.map((v) => String(v).trim().toLowerCase()).filter(Boolean));
    if (!allowedLower.has(curLower)) {
      const unique = [...new Set(allowedOnTable.map((v) => capitalizeWords(String(v))))];
      const boldV = unique.map((n) => `**${n}**`);
      const villageListMd =
        boldV.length === 1
          ? boldV[0]
          : boldV.length === 2
            ? `${boldV[0]} or ${boldV[1]}`
            : `${boldV.slice(0, -1).join(', ')}, or ${boldV[boldV.length - 1]}`;
      const hallLine =
        boldV.length === 1
          ? `You must roll in **${unique[0]} Town Hall**, that village channel, **or** a thread there.`
          : `When you roll, use **that village's Town Hall or village channel** (matching where you're stationed), or a thread there.`;

      const embed = new EmbedBuilder()
        .setColor(0x008b8b)
        .setTitle('🏘️ Village restriction')
        .setDescription(
          [
            `**${tableDoc.name?.trim() || 'This table roll'}** is only available to characters stationed in ${villageListMd}.`,
            hallLine,
            '',
            `**${character.name}** is currently stationed in **${villageKey || 'unknown'}**.`,
          ].join('\n')
        )
        .setFooter({ text: 'Table roll' })
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
      return {
        ok: false,
        reply: {
          embeds: [embed],
          flags: [MessageFlags.Ephemeral],
        },
      };
    }
  }

  if (isOnBypassList(interaction, bypass)) {
    return { ok: true };
  }

  if (
    villageKey &&
    KNOWN_VILLAGES.includes(villageKey) &&
    QUEST_RP_SHARED_PARENT_IDS.length > 0 &&
    QUEST_RP_SHARED_PARENT_IDS.some((id) => isChannelOrThreadOf(interaction, id))
  ) {
    return { ok: true };
  }

  const rollParentIds = getTablerollParentChannelIdsForVillage(villageKey);

  if (rollParentIds.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x008b8b)
      .setDescription(
        `⚠️ **No roll channels configured** for **${villageKey || 'this village'}**.\nSet **town hall** env IDs (\`RUDANIA_TOWNHALL\`, etc.) if needed, or optional \`*_VILLAGE\` overrides. (Quest-style RP parent IDs are baked in for the three villages—if those change, update \`tableRollUtils.js\` next to dashboard \`RP_THREAD_CHANNELS\`.)\n📍 Character location: **${villageKey || 'unknown'}**`
      )
      .setFooter({ text: 'Channel configuration' })
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    return { ok: false, reply: { embeds: [embed], flags: [MessageFlags.Ephemeral] } };
  }

  if (!rollParentIds.some((id) => isChannelOrThreadOf(interaction, id))) {
    const hereLine =
      rollParentIds.length === 1
        ? `<#${rollParentIds[0]}>`
        : rollParentIds.map((id) => `<#${id}>`).join(' · ');
    const embed = new EmbedBuilder()
      .setColor(0x008b8b)
      .setDescription(
        `*${character.name} looks around, confused by their surroundings...*\n\n**Channel restriction**\nYou can only roll in **${villageKey}** Town Hall **or** that village's channel—or a thread in either.\n\n📍 **Current location:** ${villageKey}\n💬 **Roll here:** ${hereLine}`
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