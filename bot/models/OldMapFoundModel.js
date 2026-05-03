// ============================================================================
// OldMapFound Model - Stores old maps found during exploration (outside character inventory).
// "Map #N" lines may exist in the items catalog for display/loot weights; addItemInventoryDatabase routes them here instead of inventories DB.
// ============================================================================
// Maps are stored here instead of the Item/inventory system to avoid polluting
// the item database and random loot tables. Can be surfaced in inventory view later.
// ============================================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

const OldMapFoundSchema = new Schema({
  mapId: { type: String, default: '' },                   // Short display ID (e.g. M12345).
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', default: null, index: true },
  ownerUserId: { type: String, default: '', index: true },
  characterName: { type: String, required: true, index: true },
  mapNumber: { type: Number, required: true, min: 1, max: 46 },
  foundAt: { type: Date, default: Date.now },
  /** Where this copy was found during exploration (e.g. "G9 Q4"). Finder is `characterName` / `characterId`. */
  locationFound: { type: String, default: '' },
  appraised: { type: Boolean, default: false },
  appraisedAt: { type: Date, default: null },
  appraisedBy: { type: String, default: null },
  /** Snapshot from Map #N seed data at appraisal time: destination type (e.g. grotto, chest). */
  leadsTo: { type: String, default: null },
  /** Snapshot: coordinates where the map points (e.g. "G9-Q1"). */
  leadsToCoordinates: { type: String, default: null },
  /** When set, this map copy was used at its location (one-and-done). */
  redeemedAt: { type: Date, default: null },
  /** Expedition partyId when this copy was redeemed at the map destination (scopes explore-map pin to one run). */
  redeemedForPartyId: { type: String, default: null },
  /** Grid square where this redemption occurred (uppercase, e.g. G9). */
  redeemedDestinationSquare: { type: String, default: null },
  /** Quadrant where this redemption occurred (e.g. Q1). */
  redeemedDestinationQuadrant: { type: String, default: null },
  /** When set, the party placed an Explore-map marker for this discovery (dashboard pin tied to expedition). */
  exploreMapPinnedAt: { type: Date, default: null },
  /** Expedition partyId when exploreMapPinnedAt was set (optional audit). */
  exploreMapPinnedPartyId: { type: String, default: null },
}, { collection: 'oldMapsFound' });

OldMapFoundSchema.index({ characterName: 1, mapNumber: 1 });
OldMapFoundSchema.index({ characterId: 1, foundAt: 1 });
OldMapFoundSchema.index({ characterId: 1, mapNumber: 1 });
OldMapFoundSchema.index({ mapId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('OldMapFound', OldMapFoundSchema);
