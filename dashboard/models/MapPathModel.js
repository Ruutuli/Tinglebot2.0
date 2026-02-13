/**
 * MapPath Model - User-drawn paths on the map (e.g. secured paths from expeditions)
 * Coordinates use map space: lat 0-20000, lng 0-24000 (CRS.Simple)
 */

const mongoose = require('mongoose');

const MAP_PATH_LIMITS = {
  MIN_POINTS: 2,
  MAX_POINTS: 500,
  LAT_MIN: 0,
  LAT_MAX: 20000,
  LNG_MIN: 0,
  LNG_MAX: 24000
};

const MapPathSchema = new mongoose.Schema({
  /** Expedition/party id when path was drawn after securing (e.g. E123456) */
  partyId: {
    type: String,
    trim: true,
    index: true,
    default: null,
    maxlength: 32
  },
  /** Optional: square + quadrant where the secure happened (e.g. H8, Q2) */
  squareId: { type: String, trim: true, default: null, maxlength: 8 },
  quadrantId: { type: String, trim: true, default: null, maxlength: 4 },
  /** Polyline points in map coordinates [lat, lng] */
  coordinates: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],
  /** Optional label (e.g. "Secured path H8 Q2") */
  name: { type: String, trim: true, maxlength: 100, default: '' },
  /** Creator */
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  discordId: { type: String, required: true, index: true, maxlength: 64 },
  createdAt: { type: Date, default: Date.now }
});

// Robust validation: point count, bounds, and dedupe consecutive identical points
MapPathSchema.pre('validate', function (next) {
  if (!Array.isArray(this.coordinates) || this.coordinates.length < MAP_PATH_LIMITS.MIN_POINTS) {
    return next(new Error(`Path must have at least ${MAP_PATH_LIMITS.MIN_POINTS} points`));
  }
  if (this.coordinates.length > MAP_PATH_LIMITS.MAX_POINTS) {
    return next(new Error(`Path cannot exceed ${MAP_PATH_LIMITS.MAX_POINTS} points`));
  }
  const { LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX } = MAP_PATH_LIMITS;
  const out = [];
  for (let i = 0; i < this.coordinates.length; i++) {
    const p = this.coordinates[i];
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return next(new Error('Invalid coordinate: lat and lng must be numbers'));
    }
    const clamped = {
      lat: Math.max(LAT_MIN, Math.min(LAT_MAX, lat)),
      lng: Math.max(LNG_MIN, Math.min(LNG_MAX, lng))
    };
    const prev = out[out.length - 1];
    if (!prev || prev.lat !== clamped.lat || prev.lng !== clamped.lng) {
      out.push(clamped);
    }
  }
  if (out.length < MAP_PATH_LIMITS.MIN_POINTS) {
    return next(new Error('Path must have at least 2 distinct points'));
  }
  this.coordinates = out;
  next();
});

module.exports = mongoose.models.MapPath || mongoose.model('MapPath', MapPathSchema, 'mapPaths');
module.exports.MAP_PATH_LIMITS = MAP_PATH_LIMITS;
