// ============================================================================
// Seed noCamp flag on pre-established path/village quadrants
// ============================================================================
// Sets quadrants.noCamp = true for the hard-coded list so parties can pass
// through but cannot camp there.
//
// Usage: node scripts/seed-no-camp-quadrants.js
// ============================================================================

const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_TINGLEBOT_URI or MONGODB_URI is not defined.');
  process.exit(1);
}

const { PREESTABLISHED_NO_CAMP } = require('./preestablished-no-camp.js');

// Minimal schema for update (Square model with quadrants.noCamp)
const QuadrantSchema = new mongoose.Schema({
  quadrantId: String,
  status: String,
  noCamp: { type: Boolean, default: false }
}, { _id: true, strict: false });
const SquareSchema = new mongoose.Schema({
  squareId: String,
  quadrants: [QuadrantSchema]
}, { strict: false });
const Square = mongoose.model('Square', SquareSchema, 'exploringMap');

async function main() {
  await mongoose.connect(MONGODB_URI);

  for (const { squareId, quadrantId } of PREESTABLISHED_NO_CAMP) {
    await Square.updateOne(
      { squareId: new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { $set: { 'quadrants.$[q].noCamp': true, 'quadrants.$[q].status': 'secured', updatedAt: new Date() } },
      { arrayFilters: [{ 'q.quadrantId': quadrantId }] }
    );
  }

  console.log(`✅ noCamp set for ${PREESTABLISHED_NO_CAMP.length} quadrants.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
