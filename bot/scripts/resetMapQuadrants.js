// ============================================================================
// Reset Map Quadrants to Unexplored
// ============================================================================
// Resets all quadrant statuses to 'unexplored' (except 'inaccessible' which stays).
// This script ONLY changes quadrant status - it does NOT delete:
//   - Relics
//   - Grottos
//   - Pins
//   - Path images
//   - Old maps found
//   - Any other exploration data
//
// Usage: node bot/scripts/resetMapQuadrants.js
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

const QuadrantSchema = new mongoose.Schema({
  quadrantId: String,
  status: String,
  blighted: Boolean,
  discoveries: Array,
  exploredBy: String,
  exploredAt: Date,
  oldMapNumber: Number,
  oldMapLeadsTo: String,
  ruinRestStamina: Number,
}, { _id: true, strict: false });

const SquareSchema = new mongoose.Schema({
  squareId: String,
  region: String,
  status: String,
  quadrants: [QuadrantSchema],
  image: String,
  pathImageUrl: String,
  mapCoordinates: Object,
  displayProperties: Object,
  createdAt: Date,
  updatedAt: Date,
}, { strict: false });

const Square = mongoose.model('Square', SquareSchema, 'exploringMap');

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const squares = await Square.find({}).lean();
  let squaresUpdated = 0;
  let quadrantsReset = 0;

  for (const doc of squares) {
    let modified = false;
    const quadrants = (doc.quadrants || []).map((q) => {
      const s = (q.status || '').toLowerCase();
      // Keep inaccessible as-is
      if (s === 'inaccessible') {
        return q;
      }
      // Already unexplored - no change needed
      if (s === 'unexplored') {
        return q;
      }
      // Reset explored/secured to unexplored (but keep discoveries, etc.)
      if (s === 'secured' || s === 'explored') {
        quadrantsReset++;
        modified = true;
        return {
          ...q,
          status: 'unexplored',
          exploredBy: '',
          exploredAt: null,
        };
      }
      // Unknown status - reset to unexplored
      quadrantsReset++;
      modified = true;
      return {
        ...q,
        status: 'unexplored',
        exploredBy: '',
        exploredAt: null,
      };
    });

    if (modified) {
      await Square.updateOne(
        { _id: doc._id },
        {
          $set: {
            quadrants,
            updatedAt: new Date(),
          },
        }
      );
      squaresUpdated++;
    }
  }

  console.log(`[exploringMap] Updated ${squaresUpdated} squares (${quadrantsReset} quadrants reset to unexplored)`);
  console.log('Done. Relics, grottos, pins, and other data were NOT modified.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
