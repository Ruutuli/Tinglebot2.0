// GrottoModel.js — Grottos (exploration); mirrors bot model for dashboard/mod tools
const mongoose = require("mongoose");
const { Schema } = mongoose;

const GrottoSchema = new Schema({
  squareId: { type: String, required: true },
  quadrantId: { type: String, required: true },
  discoveryKey: { type: String, default: "" },
  // cleansed = opened, trial in progress or failed; cleared = trial done, cannot be redone
  status: { type: String, enum: ["cleansed", "cleared"], default: "cleansed" },
  sealed: { type: Boolean, default: true },
  trialType: {
    type: String,
    enum: ["blessing", "target_practice", "puzzle", "test_of_power", "maze"],
    default: null,
  },
  name: { type: String, default: "" },
  partyId: { type: String, default: null },
  completedAt: { type: Date, default: null },
  unsealedAt: { type: Date, default: null },
  unsealedBy: { type: String, default: "" },
  targetPracticeState: {
    turnIndex: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failed: { type: Boolean, default: false },
  },
  puzzleState: {
    offeringSubmitted: { type: Boolean, default: false },
    offeringApproved: { type: Boolean, default: null },
    offeringDeniedAt: { type: Date, default: null },
    offeringItems: [String],
    offeringDescription: { type: String, default: "" },
    offeringBy: { type: String, default: "" },
    offeredAt: { type: Date, default: null },
  },
  mazeState: {
    currentNode: { type: String, default: "" },
    steps: [{ direction: String, at: Date }],
    facing: { type: String, enum: ["n", "s", "e", "w"], default: "s" },
    layout: {
      matrix: [String],
      width: Number,
      height: Number,
      entryNodes: Schema.Types.Mixed,
      pathCells: [{
        x: Number,
        y: Number,
        type: { type: String, enum: ["start", "exit", "trap", "chest", "mazep", "mazen", "path"] },
        key: String,
      }],
    },
    openedChests: [{ type: String }],
    triggeredTraps: [{ type: String }],
    usedScryingWalls: [{ type: String }],
  },
}, { collection: "grottos" });

GrottoSchema.index({ squareId: 1, quadrantId: 1 }, { unique: true });

module.exports = (mongoose.models && mongoose.models.Grotto) || mongoose.model("Grotto", GrottoSchema);
