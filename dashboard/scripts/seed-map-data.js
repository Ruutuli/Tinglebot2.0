// ============================================================================
// Seed Map Data Script
// ============================================================================
// Purpose: Seed the exploringMap collection with square/quadrant data from
//          ROTW_Map Coords_2025 - Sheet1.csv, using map geometry from mapold.
//
// Usage: node scripts/seed-map-data.js
//        (run from dashboard directory, or with path to csv)
// ============================================================================

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load dotenv if available
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

// Map constants (from mapold/map-constants.js)
const SQUARE_W = 2400;
const SQUARE_H = 1666;
const GRID_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const GCS_BASE_URL = 'https://storage.googleapis.com';
const GCS_BUCKET = 'tinglebot';
const GCS_IMAGES_PATH = 'maps/squares/';
const BASE_LAYER = 'MAP_0002_Map-Base';

// Square schema (matches mapModel.js)
const DiscoverySchema = new mongoose.Schema({
  type: { type: String, required: true },
  number: { type: String, required: false },
  discoveredBy: { type: String, default: '' },
  discoveredAt: { type: Date, default: Date.now }
});

const QuadrantSchema = new mongoose.Schema({
  quadrantId: { type: String, required: true },
  status: { type: String, enum: ['inaccessible', 'unexplored', 'explored', 'secured'], default: 'unexplored' },
  blighted: { type: Boolean, default: false },
  discoveries: [DiscoverySchema],
  exploredBy: { type: String, default: '' },
  exploredAt: { type: Date, default: null }
});

const SquareSchema = new mongoose.Schema({
  squareId: { type: String, required: true, unique: true },
  region: { type: String, required: true },
  status: { type: String, enum: ['inaccessible', 'explorable'], required: true },
  quadrants: [QuadrantSchema],
  image: { type: String, required: true },
  mapCoordinates: {
    center: { lat: Number, lng: Number },
    bounds: { north: Number, south: Number, east: Number, west: Number }
  },
  displayProperties: {
    visible: { type: Boolean, default: true },
    opacity: { type: Number, default: 1, min: 0, max: 1 },
    zIndex: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Square = mongoose.model('Square', SquareSchema, 'exploringMap');

/**
 * Parse square ID to get column/row indices
 */
function parseSquareId(squareId) {
  const match = squareId.match(/^([A-J])(\d+)$/);
  if (!match) throw new Error(`Invalid square ID: ${squareId}`);
  const col = match[1];
  const row = parseInt(match[2], 10);
  const colIndex = GRID_COLS.indexOf(col);
  const rowIndex = GRID_ROWS.indexOf(row);
  if (colIndex === -1 || rowIndex === -1) throw new Error(`Square ID out of bounds: ${squareId}`);
  return { colIndex, rowIndex };
}

/**
 * Get map coordinates for a square (image-space: y=lat, x=lng)
 */
function getSquareMapCoords(squareId) {
  const { colIndex, rowIndex } = parseSquareId(squareId);
  const x0 = colIndex * SQUARE_W;
  const y0 = rowIndex * SQUARE_H;
  const x1 = x0 + SQUARE_W;
  const y1 = y0 + SQUARE_H;
  return {
    center: {
      lat: y0 + SQUARE_H / 2,
      lng: x0 + SQUARE_W / 2
    },
    bounds: {
      north: y0,
      south: y1,
      east: x1,
      west: x0
    }
  };
}

/**
 * Get GCS image URL for a square
 */
function getSquareImageUrl(squareId) {
  const filename = `${BASE_LAYER}_${squareId}.png`;
  return `${GCS_BASE_URL}/${GCS_BUCKET}/${GCS_IMAGES_PATH}${BASE_LAYER}/${filename}`;
}

/**
 * Parse CSV and group rows by square
 */
function parseCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header and at least one row');
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const colIdx = {};
  header.forEach((h, i) => { colIdx[h] = i; });

  const squaresMap = new Map(); // squareId -> quadrants array

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const square = cols[colIdx['Square']]?.trim();
    const quadrant = parseInt(cols[colIdx['Quadrant']] || '1', 10);
    const blightStr = (cols[colIdx['Blight?']] || 'N').trim().toLowerCase();
    const region = (cols[colIdx['Region']] || '').trim();
    const status = (cols[colIdx['Status']] || 'Inaccessible').trim();

    if (!square || !region) continue;

    const quadrantId = `Q${quadrant}`;
    const blighted = blightStr === 'yes' || blightStr === 'y';
    const quadStatus = status.toLowerCase() === 'explorable' ? 'unexplored' : 'inaccessible';

    if (!squaresMap.has(square)) {
      squaresMap.set(square, { Q1: null, Q2: null, Q3: null, Q4: null });
    }
    const quads = squaresMap.get(square);
    quads[`Q${quadrant}`] = { quadrantId, status: quadStatus, blighted, region };
  }

  return squaresMap;
}

/**
 * Parse a CSV line handling quoted fields
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
 * Build Square documents from parsed CSV data
 */
function buildSquares(squaresMap) {
  const squares = [];
  for (const [squareId, quadrantsObj] of squaresMap) {
    const quadrants = ['Q1', 'Q2', 'Q3', 'Q4'].map((qId) => {
      const d = quadrantsObj[qId] || {
        quadrantId: qId,
        status: 'unexplored',
        blighted: false,
        region: 'Unknown'
      };
      return {
        quadrantId: d.quadrantId,
        status: d.status,
        blighted: d.blighted,
        discoveries: [],
        exploredBy: '',
        exploredAt: null
      };
    });

    const hasExplorable = quadrants.some((q) => q.status === 'unexplored');
    const squareStatus = hasExplorable ? 'explorable' : 'inaccessible';

    // Region: use first quadrant's region (they usually match per square)
    const regions = Object.values(quadrantsObj).map((q) => q?.region).filter(Boolean);
    const region = regions[0] || 'Unknown';

    const coords = getSquareMapCoords(squareId);

    squares.push({
      squareId,
      region,
      status: squareStatus,
      quadrants,
      image: getSquareImageUrl(squareId),
      mapCoordinates: coords,
      displayProperties: { visible: true, opacity: 1, zIndex: 0 }
    });
  }
  return squares;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const csvPath = path.join(projectRoot, 'ROTW_Map Coords_2025 - Sheet1.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('Parsing CSV...');
  const squaresMap = parseCsv(csvPath);
  const squares = buildSquares(squaresMap);

  console.log(`Found ${squares.length} squares to seed.`);

  await mongoose.connect(MONGODB_URI);

  for (const doc of squares) {
    try {
      await Square.findOneAndUpdate(
        { squareId: doc.squareId },
        { $set: { ...doc, updatedAt: new Date() } },
        { upsert: true, runValidators: true }
      );
    } catch (err) {
      console.error(`Error upserting ${doc.squareId}:`, err.message);
    }
  }

  const count = await Square.countDocuments();
  console.log(`✅ Seeding complete. ${squares.length} squares upserted. Total in DB: ${count}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
