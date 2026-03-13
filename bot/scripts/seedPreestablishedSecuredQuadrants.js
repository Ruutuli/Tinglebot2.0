// ============================================================================
// Seed pre-established secured quadrants into exploringMap
// ============================================================================
// Uses the hard-coded list in bot/data/preestablishedSecuredQuadrants.js to:
//   - Set quadrants.status = 'secured'
//   - Set quadrants.noCamp = true
// for each listed square/quadrant in the exploringMap collection.
//
// Usage:
//   node bot/scripts/seedPreestablishedSecuredQuadrants.js
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // Ignore missing .env here; we'll validate MONGODB_URI below.
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

const { PREESTABLISHED_SECURED_QUADRANTS } = require('../data/preestablishedSecuredQuadrants.js');

// Minimal schema for updating status/noCamp
const QuadrantSchema = new mongoose.Schema(
  {
    quadrantId: String,
    status: String,
    noCamp: { type: Boolean, default: false },
  },
  { _id: true, strict: false }
);

const SquareSchema = new mongoose.Schema(
  {
    squareId: String,
    quadrants: [QuadrantSchema],
  },
  { strict: false }
);

const Square = mongoose.model('Square', SquareSchema, 'exploringMap');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  let quadrantsUpdated = 0;

  for (const { squareId, quadrantId } of PREESTABLISHED_SECURED_QUADRANTS) {
    const squareRegex = new RegExp(`^${escapeRegex(squareId)}$`, 'i');
    const result = await Square.updateOne(
      { squareId: squareRegex },
      {
        $set: {
          'quadrants.$[q].status': 'secured',
          'quadrants.$[q].noCamp': true,
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [{ 'q.quadrantId': quadrantId }],
      }
    );

    if (result.modifiedCount > 0) {
      quadrantsUpdated += result.modifiedCount;
      console.log(
        `✅ Marked ${squareId} ${quadrantId} as secured/noCamp (modified ${result.modifiedCount} quadrant doc(s))`
      );
    } else {
      console.log(`ℹ️ No matching quadrant found for ${squareId} ${quadrantId} (already seeded or missing).`);
    }
  }

  console.log(`\nDone. Total quadrants updated: ${quadrantsUpdated}.`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error while seeding pre-established secured quadrants:', err);
    process.exit(1);
  });

