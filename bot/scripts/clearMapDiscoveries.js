// ============================================================================
// Clear all discoveries from the exploringMap collection, grottos, and discovery pins
// ============================================================================
// This script:
// 1. Removes ALL quadrant-level discoveries from the map model (exploringMap).
// 2. Deletes ALL grottos from the grottos collection (cleansed/cleared grottos).
// 3. Deletes ALL "Points of Interest" pins that were created from expeditions
//    (Report to town hall → Place on map), so markers like "Jiotak Grotto" are removed.
// Other map fields (status, blight, ruinRest, path images, etc.) are untouched.
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

  // Delete all grottos (cleansed/cleared) so they don't persist after clearing discoveries
  const grottosCollection = mongoose.connection.collection('grottos');
  const grottosToRemove = await grottosCollection
    .find({})
    .project({ name: 1, squareId: 1, quadrantId: 1 })
    .toArray();
  const grottoResult = await grottosCollection.deleteMany({});
  const grottosRemoved = grottoResult.deletedCount || 0;
  if (grottosRemoved > 0) {
    console.log(`✅ Removed ${grottosRemoved} grotto(s) from grottos collection:`);
    grottosToRemove.forEach((g) => {
      const loc = [g.squareId, g.quadrantId].filter(Boolean).join(' ') || '(no location)';
      console.log(`   - "${g.name || 'unnamed'}" at ${loc}`);
    });
  }

  // Delete discovery-report pins (Points of Interest created from "Place on map" on expedition page)
  const pinsCollection = mongoose.connection.collection('pins');
  const pinQuery = {
    category: 'points-of-interest',
    $or: [
      { sourceDiscoveryKey: { $exists: true, $ne: null, $ne: '' } },
      { partyId: { $exists: true, $ne: null, $ne: '' } },
    ],
  };
  const pinsToRemove = await pinsCollection.find(pinQuery).project({ name: 1, gridLocation: 1 }).toArray();
  const pinsResult = await pinsCollection.deleteMany(pinQuery);
  const pinsRemoved = pinsResult.deletedCount || 0;
  if (pinsRemoved > 0) {
    console.log(`✅ Removed ${pinsRemoved} discovery pin(s):`);
    pinsToRemove.forEach((p) => {
      console.log(`   - "${p.name || 'unnamed'}" at ${p.gridLocation || '?'}`);
    });
  }

  const squares = await Square.find({}).lean();
  let squaresUpdated = 0;
  let discoveriesCleared = 0;
  const discoveriesRemovedList = [];

  for (const doc of squares) {
    if (!Array.isArray(doc.quadrants) || doc.quadrants.length === 0) continue;
    let modified = false;
    const newQuadrants = doc.quadrants.map((q) => {
      if (Array.isArray(q.discoveries) && q.discoveries.length > 0) {
        discoveriesCleared += q.discoveries.length;
        modified = true;
        const squareId = doc.squareId || '?';
        for (const d of q.discoveries) {
          const type = d.type || 'unknown';
          const name = d.name ? ` "${d.name}"` : '';
          discoveriesRemovedList.push(`   - ${squareId} ${q.quadrantId || '?'}: ${type}${name}`);
        }
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
  if (discoveriesRemovedList.length > 0) {
    discoveriesRemovedList.forEach((line) => console.log(line));
  }
  console.log('Done. Quadrant statuses, blight, ruin-rest, and path images were NOT modified.');
  if (grottosRemoved === 0 && discoveriesCleared === 0 && pinsRemoved === 0) {
    console.log('(No grottos, discoveries, or discovery pins were present.)');
  }

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error while clearing discoveries:', err);
    process.exit(1);
  });

