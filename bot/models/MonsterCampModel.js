// ============================================================================
// MonsterCampModel.js — Monster camps discovered during exploration
// Tracks location and refightability (Blood Moon regeneration).
// Each discovered camp has a unique campId so multiple camps can exist in the same quadrant.
// ============================================================================

const mongoose = require('mongoose');
const crypto = require('crypto');

const monsterCampSchema = new mongoose.Schema({
  campId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  squareId: {
    type: String,
    required: true,
  },
  quadrantId: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
    enum: ['Eldin', 'Lanayru', 'Faron'],
  },
  lastDefeatedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
}, {
  timestamps: true,
  collection: 'monstercamps',
});

// Non-unique index for listing camps by location (multiple camps per quadrant allowed).
// If upgrading from one-camp-per-quadrant: drop the old unique index in MongoDB, e.g.
// db.monstercamps.dropIndex("squareId_1_quadrantId_1")
monsterCampSchema.index({ squareId: 1, quadrantId: 1 });

// ---- Static: createCamp ----
// Create a new camp with a unique campId (used when a camp is first discovered on roll).
monsterCampSchema.statics.createCamp = async function (squareId, quadrantId, region) {
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  const campId = `${squareId}-${quadrantId}-${Date.now()}-${uniqueSuffix}`;
  return this.create({
    campId,
    squareId,
    quadrantId,
    region,
  });
};

// ---- Static: findByCampId ----
// Find a camp by its unique id (used when revisiting a discovery that has campId).
monsterCampSchema.statics.findByCampId = async function (campId) {
  if (!campId) return null;
  return this.findOne({ campId });
};

// ---- Static: findOrCreate (legacy) ----
// Find or create the single legacy camp for a location (campId = square-quadrant).
// Used only for revisiting old discoveries that have no campId stored.
monsterCampSchema.statics.findOrCreate = async function (squareId, quadrantId, region) {
  const campId = `${squareId}-${quadrantId}`;
  let camp = await this.findOne({ campId });
  if (!camp) {
    camp = await this.create({
      campId,
      squareId,
      quadrantId,
      region,
    });
  }
  return camp;
};

// ---- Static: isFightable ----
// Camp is fightable if never fought OR a blood moon has occurred since lastDefeatedAt
monsterCampSchema.statics.isFightable = async function (camp) {
  const { getMostRecentPastBloodMoonDate } = require('../modules/calendarModule');
  if (!camp.lastDefeatedAt) return true;
  const lastBloodMoonDate = getMostRecentPastBloodMoonDate();
  if (!lastBloodMoonDate) return false;
  // Camp was defeated before the most recent blood moon -> refightable
  return camp.lastDefeatedAt < lastBloodMoonDate;
};

module.exports = mongoose.model('MonsterCamp', monsterCampSchema);
