// ============================================================================
// Seed ROTW Map & Items New Fields
// ============================================================================
// Purpose: Seed the new fields on maps (status, blighted, terrain, hazards,
//          items, monsters, bossMonsters, special per quadrant) and on items (terrain) from
//          ROTW_Map Coords_2025 - Map.csv and ROTW_Map Coords_2025 - Items.csv.
//
// Usage: node scripts/seed-rotw-map-and-items-fields.js
//        node scripts/seed-rotw-map-and-items-fields.js --maps-only
//        node scripts/seed-rotw-map-and-items-fields.js --items-only
// ============================================================================

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined. Set it in your .env file.');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..', '..');
const MAP_CSV = path.join(projectRoot, 'ROTW_Map Coords_2025 - Map.csv');
const ITEMS_CSV = path.join(projectRoot, 'ROTW_Map Coords_2025 - Items.csv');

/**
 * Parse a CSV line handling quoted fields (commas inside quotes stay)
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse CSV file and return { header, rows } where each row is array of cell values
 */
function parseCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('CSV must have header and at least one row');
  }
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const colIdx = {};
  header.forEach((h, i) => { colIdx[h] = i; });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLine(lines[i]));
  }
  return { header, colIdx, rows };
}

/** Split a cell value into array of non-empty trimmed strings (comma-separated) */
function parseList(value) {
  if (value == null || String(value).trim() === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Map seeding: update quadrants with terrain, hazards, items, monsters, bossMonsters, special
// ---------------------------------------------------------------------------
async function seedMapFields(Square) {
  if (!fs.existsSync(MAP_CSV)) {
    console.warn(`⚠️ Map CSV not found: ${MAP_CSV}. Skipping map seeding.`);
    return { totalInCsv: 0, updated: 0, skipped: 0 };
  }

  const { colIdx, rows } = parseCsv(MAP_CSV);
  const get = (row, key) => (colIdx[key] != null ? (row[colIdx[key]] || '').trim() : '');

  // Group rows by square (each square has 4 rows for Q1–Q4)
  const bySquare = new Map();
  for (const row of rows) {
    const square = get(row, 'Square');
    const quadrantNum = parseInt(get(row, 'Quadrant') || '1', 10);
    if (!square) continue;

    const blightStr = get(row, 'Blight?').toLowerCase();
    const statusStr = get(row, 'Status').toLowerCase();
    const blighted = blightStr === 'yes' || blightStr === 'y';
    const status = statusStr === 'explorable' ? 'unexplored' : 'inaccessible';

    const terrain = parseList(get(row, 'Terrain'));
    const hazards = parseList(get(row, 'Hazards'));
    const items = parseList(get(row, 'Items'));
    const monsters = parseList(get(row, 'Monsters'));
    const bossMonsters = parseList(get(row, 'Boss Monsters'));
    const special = parseList(get(row, 'Special'));

    if (!bySquare.has(square)) {
      bySquare.set(square, { Q1: null, Q2: null, Q3: null, Q4: null });
    }
    const quads = bySquare.get(square);
    quads[`Q${quadrantNum}`] = {
      status,
      blighted,
      terrain,
      hazards,
      items,
      monsters,
      bossMonsters,
      special
    };
  }

  let updated = 0;
  let skipped = 0;
  const totalInCsv = bySquare.size;

  for (const [squareId, quadData] of bySquare) {
    const squareDoc = await Square.findOne({ squareId: squareId.trim().toUpperCase() });
    if (!squareDoc) {
      skipped++;
      continue;
    }

    const quadrants = squareDoc.quadrants || [];
    for (let i = 0; i < 4; i++) {
      const qId = `Q${i + 1}`;
      const data = quadData[qId];
      if (!data || i >= quadrants.length) continue;

      const q = quadrants[i];
      q.status = data.status;
      q.blighted = data.blighted;
      q.terrain = data.terrain;
      q.hazards = data.hazards;
      q.items = data.items;
      q.monsters = data.monsters;
      q.bossMonsters = data.bossMonsters;
      q.special = data.special;
    }

    // Force Mongoose to persist quadrants (including new keys on subdocuments)
    squareDoc.markModified('quadrants');
    squareDoc.updatedAt = new Date();
    await squareDoc.save();
    updated++;
  }

  return { totalInCsv, updated, skipped };
}

// ---------------------------------------------------------------------------
// Items seeding: update terrain field by item name (uses raw collection to avoid ItemModel's jobData dependency)
// ---------------------------------------------------------------------------
async function seedItemFields(itemsColl) {
  if (!fs.existsSync(ITEMS_CSV)) {
    console.warn(`⚠️ Items CSV not found: ${ITEMS_CSV}. Skipping items seeding.`);
    return { updated: 0, notFoundNames: [] };
  }

  const { colIdx, rows } = parseCsv(ITEMS_CSV);
  const get = (row, key) => (colIdx[key] != null ? (row[colIdx[key]] || '').trim() : '');

  let updated = 0;
  const notFoundNames = [];

  for (const row of rows) {
    const itemName = get(row, 'ITEM NAME');
    const terrainRaw = get(row, 'Terrain');
    const terrain = parseList(terrainRaw);
    if (!itemName) continue;

    const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await itemsColl.updateOne(
      { itemName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { $set: { terrain } }
    );
    if (result.matchedCount === 0) notFoundNames.push(itemName);
    else if (result.modifiedCount > 0) updated++;
  }

  return { updated, notFoundNames };
}

async function main() {
  const mapsOnly = process.argv.includes('--maps-only');
  const itemsOnly = process.argv.includes('--items-only');

  await mongoose.connect(MONGODB_URI);

  const Square = require('../models/mapModel');

  if (!itemsOnly) {
    console.log('Seeding map fields (status, blighted, terrain, hazards, items, monsters, bossMonsters, special)...');
    const mapResult = await seedMapFields(Square);
    console.log(`  Maps: ${mapResult.totalInCsv} squares in CSV → ${mapResult.updated} seeded, ${mapResult.skipped} not in DB.`);
  }

  if (!mapsOnly) {
    console.log('Seeding item terrain fields...');
    const itemsColl = mongoose.connection.collection('items');
    const itemResult = await seedItemFields(itemsColl);
    console.log(`  Items: ${itemResult.updated} updated, ${itemResult.notFoundNames.length} not found in DB.`);
    if (itemResult.notFoundNames.length > 0) {
      console.log('  Items not found:');
      itemResult.notFoundNames.forEach((name) => console.log(`    - ${name}`));
    }
  }

  await mongoose.disconnect();
  console.log('✅ Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
