// ============================================================================
// Seed map locations onto exploringMap (oldMapNumber, oldMapLeadsTo per quadrant)
// ============================================================================
// 1. Clears oldMapNumber and oldMapLeadsTo from every quadrant in exploringMap.
// 2. For each map in OLD_MAPS, sets the matching square+quadrant with that map's number and leadsTo.
//
// Usage: node bot/scripts/seedMapLocations.js
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // Ignore missing .env
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

const { OLD_MAPS } = require('../data/oldMaps.js');
const MapModule = require('../modules/mapModule.js');
const mapModule = new MapModule();

const QuadrantSchema = new mongoose.Schema(
  {
    quadrantId: String,
    oldMapNumber: Number,
    oldMapLeadsTo: String,
  },
  { _id: true, strict: false }
);

const SquareSchema = new mongoose.Schema(
  {
    squareId: String,
    quadrants: [QuadrantSchema],
    updatedAt: Date,
  },
  { strict: false }
);

const Square = mongoose.model('Square', SquareSchema, 'exploringMap');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse coordinates string "G9-Q1" or "I11-Q2" -> { squareId, quadrantId }.
 * Quadrant is normalized to uppercase (Q1-Q4).
 */
function parseCoordinates(coords) {
  if (!coords || typeof coords !== 'string') return null;
  const trimmed = coords.trim();
  const parts = trimmed.split(/\s*-\s*/);
  if (parts.length < 2) return null;
  const squarePart = parts[0].trim();
  const quadPart = (parts[1] || '').trim().toUpperCase();
  if (!/^Q[1-4]$/.test(quadPart)) return null;
  const col = squarePart.charAt(0);
  const rowStr = squarePart.slice(1);
  const row = parseInt(rowStr, 10);
  if (!mapModule.isValidSquare(col, row)) return null;
  return {
    squareId: col.toUpperCase() + row,
    quadrantId: quadPart,
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Clear oldMapNumber and oldMapLeadsTo from all quadrants
  const squares = await Square.find({}).lean();
  let cleared = 0;
  for (const doc of squares) {
    const quadrants = (doc.quadrants || []).map((q) => ({
      ...q,
      oldMapNumber: null,
      oldMapLeadsTo: null,
    }));
    await Square.updateOne(
      { _id: doc._id },
      { $set: { quadrants, updatedAt: new Date() } }
    );
    cleared += quadrants.length;
  }
  console.log(`Cleared oldMapNumber/oldMapLeadsTo from ${cleared} quadrants across ${squares.length} squares.`);

  // 2. Seed each map location
  let seeded = 0;
  let skipped = 0;
  for (const map of OLD_MAPS) {
    const parsed = parseCoordinates(map.coordinates);
    if (!parsed) {
      console.warn(`⚠️ Skipped Map #${map.number}: invalid coordinates "${map.coordinates}"`);
      skipped++;
      continue;
    }
    const { squareId, quadrantId } = parsed;
    const squareRegex = new RegExp(`^${escapeRegex(squareId)}$`, 'i');
    const result = await Square.updateOne(
      { squareId: squareRegex },
      {
        $set: {
          'quadrants.$[q].oldMapNumber': map.number,
          'quadrants.$[q].oldMapLeadsTo': map.leadsTo,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'q.quadrantId': quadrantId }] }
    );
    if (result.matchedCount === 0) {
      console.warn(`⚠️ Skipped Map #${map.number}: no Square found for ${squareId}`);
      skipped++;
    } else if (result.modifiedCount > 0) {
      seeded++;
      console.log(`✅ Map #${map.number} → ${squareId} ${quadrantId} (${map.leadsTo})`);
    }
  }

  console.log(`\nDone. Seeded ${seeded} map locations, skipped ${skipped}.`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
