// MonsterCampModel.js — Monster camps (exploration); mirrors bot model for dashboard
const mongoose = require("mongoose");
const { Schema } = mongoose;

const MonsterCampSchema = new Schema(
  {
    campId: { type: String, required: true, unique: true, index: true },
    squareId: { type: String, required: true },
    quadrantId: { type: String, required: true },
    region: { type: String, required: true, enum: ["Eldin", "Lanayru", "Faron"] },
    lastDefeatedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, collection: "monstercamps" }
);

MonsterCampSchema.index({ squareId: 1, quadrantId: 1 }, { unique: true });

module.exports = mongoose.model("MonsterCamp", MonsterCampSchema);
