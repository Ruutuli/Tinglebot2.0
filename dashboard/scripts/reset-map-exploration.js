// ============================================================================
// Reset Map Exploration Script
// ============================================================================
// Resets secured/explored quadrants to unexplored and clears all path images:
//   - exploringMap: any quadrant with status 'secured' or 'explored' -> 'unexplored',
//     clear discoveries/exploredBy/exploredAt for those; leave 'inaccessible' and
//     already 'unexplored' as-is. pathImageUrl -> null for all squares.
//   - mapPathImages: delete all documents
//   - Party: pathImageUploadedSquares -> []
//   - pins: delete pins placed during expeditions (partyId or sourceDiscoveryKey set)
//
// Does NOT delete files from GCS (path images remain in bucket but are no longer referenced).
//
// Usage: node scripts/reset-map-exploration.js
//        (run from dashboard directory; uses MONGODB_URI or MONGODB_TINGLEBOT_URI from .env)
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available
}

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ Set MONGODB_TINGLEBOT_URI or MONGODB_URI in your .env');
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

const PartySchema = new mongoose.Schema({
  partyId: String,
  pathImageUploadedSquares: [String],
}, { strict: false });

// Pins placed during expeditions have partyId or sourceDiscoveryKey set (from "Report to town hall")
const Pin = mongoose.models.Pin || mongoose.model('Pin', new mongoose.Schema({}, { strict: false }), 'pins');

const Square = mongoose.model('Square', SquareSchema, 'exploringMap');
const MapPathImage = mongoose.models.MapPathImage || mongoose.model('MapPathImage', new mongoose.Schema({
  partyId: String,
  squareId: String,
  imageUrl: String,
  discordId: String,
  createdAt: Date,
}, { strict: false }), 'mapPathImages');
const Party = mongoose.model('Party', PartySchema, 'parties');

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1) Reset exploringMap: secured/explored -> unexplored (clear discovery fields for those); pathImageUrl = null for all
  const squares = await Square.find({}).lean();
  let squaresUpdated = 0;
  let quadrantsReset = 0;
  for (const doc of squares) {
    const quadrants = (doc.quadrants || []).map((q) => {
      const s = (q.status || '').toLowerCase();
      if (s === 'inaccessible' || s === 'unexplored') {
        return q;
      }
      if (s === 'secured' || s === 'explored') {
        quadrantsReset++;
        return {
          ...q,
          status: 'unexplored',
          exploredBy: '',
          exploredAt: null,
          discoveries: [],
        };
      }
      quadrantsReset++;
      return {
        ...q,
        status: 'unexplored',
        exploredBy: '',
        exploredAt: null,
        discoveries: [],
      };
    });
    await Square.updateOne(
      { _id: doc._id },
      {
        $set: {
          pathImageUrl: null,
          quadrants,
          updatedAt: new Date(),
        },
      }
    );
    squaresUpdated++;
  }
  console.log(`[exploringMap] Reset ${squaresUpdated} squares (pathImageUrl cleared; ${quadrantsReset} quadrants set to unexplored)`);

  // 2) Delete all MapPathImage documents
  const pathResult = await MapPathImage.deleteMany({});
  console.log(`[mapPathImages] Deleted ${pathResult.deletedCount} path image record(s)`);

  // 3) Clear pathImageUploadedSquares on all parties
  const partyResult = await Party.updateMany(
    {},
    { $set: { pathImageUploadedSquares: [] } }
  );
  console.log(`[parties] Cleared pathImageUploadedSquares on ${partyResult.modifiedCount} party/parties`);

  // 4) Delete pins placed during expeditions (partyId or sourceDiscoveryKey set)
  const pinResult = await Pin.deleteMany({
    $or: [
      { partyId: { $exists: true, $nin: [null, ''] } },
      { sourceDiscoveryKey: { $exists: true, $nin: [null, ''] } },
    ],
  });
  console.log(`[pins] Deleted ${pinResult.deletedCount} expedition pin(s)`);

  console.log('Done.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
