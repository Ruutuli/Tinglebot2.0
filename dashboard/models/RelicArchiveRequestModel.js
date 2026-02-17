// ------------------- Relic Archive Request -------------------
// Pending submissions to Library Archives; mods approve to archive the relic.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const RelicArchiveRequestSchema = new Schema(
  {
    relicId: { type: String, required: true },
    relicMongoId: { type: Schema.Types.ObjectId, ref: "Relic", default: null },
    submitterUserId: { type: String, required: true },
    title: { type: String, required: true },
    discoveredBy: { type: String, required: true },
    appraisedBy: { type: String, required: true },
    region: { type: String, default: "" },
    square: { type: String, default: "" },
    quadrant: { type: String, default: "" },
    info: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    modApprovedBy: { type: String, default: null },
    modApprovedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "relicarchiverequests" }
);

RelicArchiveRequestSchema.index({ status: 1 });
RelicArchiveRequestSchema.index({ relicId: 1 });
RelicArchiveRequestSchema.index({ submitterUserId: 1 });

module.exports =
  mongoose.models.RelicArchiveRequest ||
  mongoose.model("RelicArchiveRequest", RelicArchiveRequestSchema);
