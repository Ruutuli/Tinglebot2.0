// ============================================================================
// Clear all discoveries from the exploringMap collection
// ============================================================================
// This script removes ALL quadrant-level discoveries from the map model
// (exploringMap collection), but leaves other fields (status, blight, ruinRest,
// path images, etc.) untouched.
//
// Usage:
//   node bot/scripts/clearMapDiscoveries.js
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

// Minimal schema: we only care that quadrants[] exists and has a discoveries array
const QuadrantSchema = new mongoose.Schema(
  {
    quadrantId: String,
    discoveries: Array,
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

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const squares = await Square.find({}).lean();
  let squaresUpdated = 0;
  let discoveriesCleared = 0;

  for (const doc of squares) {
    if (!Array.isArray(doc.quadrants) || doc.quadrants.length === 0) continue;
    let modified = false;
    const newQuadrants = doc.quadrants.map((q) => {
      if (Array.isArray(q.discoveries) && q.discoveries.length > 0) {
        discoveriesCleared += q.discoveries.length;
        modified = true;
        return {
          ...q,
          discoveries: [],
        };
      }
      return q;
    });

    if (!modified) continue;

    await Square.updateOne(
      { _id: doc._id },
      {
        $set: {
          quadrants: newQuadrants,
          updatedAt: new Date(),
        },
      }
    );
    squaresUpdated++;
  }

  console.log(`✅ Cleared discoveries from ${squaresUpdated} squares (removed ${discoveriesCleared} discovery entries total).`);
  console.log('Done. Quadrant statuses, blight, ruin-rest, paths, pins, and other data were NOT modified.');

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error while clearing discoveries:', err);
    process.exit(1);
  });

