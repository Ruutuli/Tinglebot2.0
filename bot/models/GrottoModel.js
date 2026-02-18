// GrottoModel.js — Grottos discovered during exploration (sealed/unsealed, trial type, progress)

const mongoose = require('mongoose');
const { Schema } = mongoose;

const GrottoSchema = new Schema({
  // Location (links to map discovery)
  squareId: { type: String, required: true },
  quadrantId: { type: String, required: true },
  discoveryKey: { type: String, default: '' },

  // State
  sealed: { type: Boolean, default: true },
  trialType: {
    type: String,
    enum: ['blessing', 'target_practice', 'puzzle', 'test_of_power', 'maze'],
    default: null,
  },
  name: { type: String, default: '' },

  // Progress
  partyId: { type: String, default: null },
  completedAt: { type: Date, default: null },
  unsealedAt: { type: Date, default: null },
  unsealedBy: { type: String, default: '' },

  // Trial-specific state
  targetPracticeState: {
    turnIndex: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failed: { type: Boolean, default: false },
  },
  puzzleState: {
    puzzleSubType: { type: String, enum: ['odd_structure', 'offering_statue'], default: null },
    puzzleVariant: { type: Number, default: null }, // 0-4 for odd structure
    puzzleClueIndex: { type: Number, default: null }, // 0-13 for offering statue
    offeringSubmitted: { type: Boolean, default: false },
    offeringApproved: { type: Boolean, default: null },
    offeringDeniedAt: { type: Date, default: null },
    offeringItems: [String],
    offeringDescription: { type: String, default: '' },
    offeringBy: { type: String, default: '' },
    offeredAt: { type: Date, default: null },
  },
  mazeState: {
    currentNode: { type: String, default: '' }, // 'x,y' matrix coords or legacy id
    steps: [{ direction: String, at: Date }],
    facing: { type: String, enum: ['n', 's', 'e', 'w'], default: 's' },
    layout: {
      matrix: [String],
      width: Number,
      height: Number,
      entryNodes: Schema.Types.Mixed,
      pathCells: [{
        x: Number,
        y: Number,
        type: { type: String, enum: ['start', 'exit', 'trap', 'chest', 'mazep', 'mazen', 'path'] },
        key: String,
      }],
    },
    openedChests: [{ type: String }], // cell keys e.g. '3,5' to avoid double-open
  },
  testOfPowerState: {
    raidStarted: { type: Boolean, default: false },
    raidId: { type: String, default: null },
  },
}, { collection: 'grottos' });

GrottoSchema.index({ squareId: 1, quadrantId: 1 }, { unique: true });

module.exports = mongoose.model('Grotto', GrottoSchema);
