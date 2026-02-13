/**
 * MapPathImage Model - User-uploaded path images (drawn on square image, then uploaded)
 * One image per (partyId, squareId); re-upload overwrites GCS and this record.
 */

const mongoose = require("mongoose");

const MapPathImageSchema = new mongoose.Schema({
  partyId: { type: String, required: true, trim: true, index: true, maxlength: 32 },
  squareId: { type: String, required: true, trim: true, maxlength: 8 },
  imageUrl: { type: String, required: true, trim: true },
  discordId: { type: String, required: true, index: true, maxlength: 64 },
  createdAt: { type: Date, default: Date.now },
});

MapPathImageSchema.index({ partyId: 1, squareId: 1 }, { unique: true });

module.exports =
  mongoose.models.MapPathImage || mongoose.model("MapPathImage", MapPathImageSchema, "mapPathImages");
