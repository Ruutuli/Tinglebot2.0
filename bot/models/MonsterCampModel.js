// ============================================================================
// MonsterCampModel.js — Monster camps discovered during exploration
// Tracks location and refightability (Blood Moon regeneration)
// ============================================================================

const mongoose = require('mongoose');

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

// Unique index on square + quadrant (one camp per map location)
monsterCampSchema.index({ squareId: 1, quadrantId: 1 }, { unique: true });

// ---- Static: findOrCreate ----
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
