// ============================================================================
// Old Map Utils - Add and check old maps found (stored outside inventory)
// ============================================================================

const OldMapFound = require('../models/OldMapFoundModel.js');
const { getOldMapByNumber, normalizeOldMapCellKey, getAllOldMapsByCoordinates } = require('../data/oldMaps.js');
const { generateUniqueId } = require('./uniqueIdUtils.js');
const logger = require('./logger.js');

/** Destination for this map # from seed data (for DB snapshot at appraisal). */
/** True if this map's destination is a discovery that should be marked with an expedition Explore pin (not chest/relic). `shrine` === grotto (legacy label). */
function oldMapLeadsToNeedsExploreMapPin(leadsTo) {
  const t = String(leadsTo ?? '').trim().toLowerCase();
  return t === 'grotto' || t === 'shrine' || t === 'ruins' || t === 'monster_camp';
}

/** Progress-log / pin outcome matches what's stored on the quadrant for this old map # (for syncing OldMapFound when a dashboard pin is saved). `shrine` leadsTo === grotto. */
function pinOutcomeMatchesOldMapLead(outcome, leadsToRaw) {
  const o = String(outcome ?? '').trim().toLowerCase();
  const lt = String(leadsToRaw ?? '').trim().toLowerCase();
  const grottoOutcomes = new Set(['grotto', 'grotto_found', 'grotto_cleansed', 'map_grotto', 'shrine']);
  const ruinsOutcomes = new Set(['ruin_rest', 'map_ruins', 'ruins']);
  const campOutcomes = new Set(['monster_camp', 'monster_camp_fight']);
  if (grottoOutcomes.has(o) && (lt === 'grotto' || lt === 'shrine')) return true;
  if (ruinsOutcomes.has(o) && lt === 'ruins') return true;
  if (campOutcomes.has(o) && lt === 'monster_camp') return true;
  return false;
}

function getMapDestinationSnapshot(mapNumber) {
  if (typeof mapNumber !== 'number' || mapNumber < 1 || mapNumber > 46) {
    return { leadsTo: null, leadsToCoordinates: null };
  }
  const info = getOldMapByNumber(mapNumber);
  if (!info) return { leadsTo: null, leadsToCoordinates: null };
  return {
    leadsTo: info.leadsTo != null ? String(info.leadsTo) : null,
    leadsToCoordinates: info.coordinates != null ? String(info.coordinates) : null,
  };
}

function asObjectIdString(value) {
  if (!value) return '';
  try {
    return value.toString();
  } catch (_) {
    return '';
  }
}

function normalizeCharacterRef(characterRef) {
  if (!characterRef) return null;
  if (typeof characterRef === 'string') {
    const characterName = characterRef.trim();
    return characterName ? { characterName, characterId: '', ownerUserId: '' } : null;
  }

  const characterName = String(characterRef.characterName || characterRef.name || '').trim();
  const characterId = asObjectIdString(characterRef.characterId || characterRef._id);
  const ownerUserId = String(characterRef.ownerUserId || characterRef.userId || '').trim();
  if (!characterName && !characterId) return null;
  return { characterName, characterId, ownerUserId };
}

/**
 * Recognize old-map loot lines from the items collection (e.g. "Map #12") for routing to OldMapFound, not inventory.
 * @param {string} itemName
 * @returns {number|null} map number 1–46, or null
 */
function normalizeOldMapItemNameString(itemName) {
  if (itemName == null || typeof itemName !== 'string') return '';
  return String(itemName)
    .replace(/[\uFEFF\u200B\u200C\u200D]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\uFF03/g, '#')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseOldMapNumberFromItemName(itemName) {
  if (!itemName || typeof itemName !== 'string') return null;
  const normalized = normalizeOldMapItemNameString(itemName);
  const m = normalized.match(/^Map\s*#\s*(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 46) return null;
  return n;
}

/**
 * Add an old map to a character's collection.
 * Assigns a short mapId (e.g. M12345).
 * @param {string} characterName - Character who found the map
 * @param {number} mapNumber - Map number (1-46)
 * @param {string} [locationFound] - Optional location string (e.g. "H8 Q2")
 */
async function addOldMapToCharacter(characterRef, mapNumber, locationFound = '') {
  const normalized = normalizeCharacterRef(characterRef);
  if (!normalized || typeof mapNumber !== 'number' || mapNumber < 1 || mapNumber > 46) {
    logger.warn(
      'OLD_MAP',
      `addOldMapToCharacter skipped: invalid ref or mapNumber ref=${JSON.stringify(characterRef)} mapNumber=${mapNumber}`
    );
    return null;
  }

  const basePayload = {
    characterName: normalized.characterName || '',
    characterId: normalized.characterId || null,
    ownerUserId: normalized.ownerUserId || '',
    mapNumber,
    locationFound: String(locationFound || '').trim(),
  };

  const MAX_MAP_ID_RETRIES = 8;
  for (let attempt = 1; attempt <= MAX_MAP_ID_RETRIES; attempt += 1) {
    try {
      const mapId = generateUniqueId('M');
      const doc = await OldMapFound.create({ ...basePayload, mapId });
      logger.info(
        'OLD_MAP',
        `oldMapsFound created mapId=${doc.mapId} _id=${doc._id} characterId=${doc.characterId || 'null'} characterName=${doc.characterName} ownerUserId=${doc.ownerUserId || ''} mapNumber=${doc.mapNumber} location=${String(locationFound || '').slice(0, 80)}`
      );
      return doc;
    } catch (error) {
      const duplicateMapId = error?.code === 11000 && String(error?.message || '').includes('mapId');
      if (duplicateMapId && attempt < MAX_MAP_ID_RETRIES) continue;
      throw error;
    }
  }
  return null;
}

/**
 * Find an OldMapFound by MongoDB _id or short mapId (e.g. M12345).
 * @param {string} idOrMapId - MongoDB _id (24 hex) or mapId (e.g. M12345)
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findOldMapByIdOrMapId(idOrMapId) {
  if (!idOrMapId || typeof idOrMapId !== 'string') {
    logger.info('OLD_MAP', `findOldMapByIdOrMapId: invalid input type=${typeof idOrMapId}`);
    return null;
  }
  const str = idOrMapId.trim();
  const byMongoId = /^[0-9a-fA-F]{24}$/.test(str);
  const doc = byMongoId ? await OldMapFound.findById(str) : await OldMapFound.findOne({ mapId: str });
  logger.info(
    'OLD_MAP',
    `findOldMapByIdOrMapId: by=${byMongoId ? 'mongoId' : 'mapId'} query=${str.slice(0, 32)}${str.length > 32 ? '…' : ''} found=${!!doc}` +
      (doc
        ? ` _id=${doc._id} mapId=${doc.mapId || '—'} characterId=${doc.characterId || 'null'} characterName=${doc.characterName || '—'} appraised=${!!doc.appraised}`
        : '')
  );
  return doc;
}

const charNameRegex = (name) =>
  new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

function resolveOwnerMatch(characterRef) {
  const normalized = normalizeCharacterRef(characterRef);
  if (!normalized) return null;
  if (normalized.characterId && normalized.characterName) {
    return {
      $or: [
        { characterId: normalized.characterId },
        { characterId: null, characterName: charNameRegex(normalized.characterName) },
      ],
    };
  }
  if (normalized.characterId) {
    return { characterId: normalized.characterId };
  }
  return { characterName: charNameRegex(normalized.characterName) };
}

function coordsSnapshotMatchesCell(leadsToCoordinates, squareId, quadrantId) {
  const target = normalizeOldMapCellKey(squareId, quadrantId);
  if (!target) return false;
  const tCompact = target.replace(/-/g, '');
  const sCompact = String(leadsToCoordinates ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, '');
  return tCompact === sCompact && tCompact.length > 0;
}

/**
 * When multiple catalog maps share one grid cell, pick the map # from party state / appraisal snapshots (never guess blindly).
 * @param {{ characters?: Array<{ _id?: unknown, name?: string, userId?: string }> }} party
 * @param {string} squareId
 * @param {string} quadrantId
 * @param {Array<{ number: number, leadsTo: string, coordinates: string }>} catalogCandidates — same cell, sorted by number
 * @returns {Promise<number|null>}
 */
async function resolveOldMapNumberForAmbiguousCell(party, squareId, quadrantId, catalogCandidates) {
  if (!catalogCandidates || catalogCandidates.length === 0) return null;
  if (catalogCandidates.length === 1) return catalogCandidates[0].number;
  if (!party?.characters?.length) return null;

  for (const cand of catalogCandidates) {
    for (const pc of party.characters) {
      const ref = { _id: pc._id, name: pc.name, userId: pc.userId };
      if (await hasAppraisedUnexpiredOldMap(ref, cand.number)) return cand.number;
    }
  }

  for (const pc of party.characters) {
    const ownerMatch = resolveOwnerMatch({ _id: pc._id, name: pc.name, userId: pc.userId });
    if (!ownerMatch) continue;
    const docs = await OldMapFound.find({
      ...ownerMatch,
      appraised: true,
      redeemedAt: null,
    }).lean();
    for (const d of docs) {
      if (!catalogCandidates.some((c) => c.number === d.mapNumber)) continue;
      if (coordsSnapshotMatchesCell(d.leadsToCoordinates, squareId, quadrantId)) return d.mapNumber;
    }
  }

  for (const cand of catalogCandidates) {
    for (const pc of party.characters) {
      const ref = { _id: pc._id, name: pc.name, userId: pc.userId };
      const hasU = await hasOldMap(ref, cand.number);
      const appr = await hasAppraisedOldMap(ref, cand.number);
      if (hasU && !appr) return cand.number;
    }
  }

  return null;
}

/**
 * Resolve map # for this cell (single catalog row, DB quadrant, or ambiguous-cell disambiguation).
 */
async function resolveOldMapNumberForExplorationMove(party, squareId, quadrantId, quadFromDb) {
  let num =
    quadFromDb != null && quadFromDb.oldMapNumber != null && quadFromDb.oldMapNumber !== ''
      ? Number(quadFromDb.oldMapNumber)
      : null;
  if (num != null && (Number.isNaN(num) || num < 1 || num > 46)) num = null;

  const catalogCandidates = getAllOldMapsByCoordinates(squareId, quadrantId);
  const uniqueCatalog = catalogCandidates.length === 1 ? catalogCandidates[0] : null;

  if (num == null && uniqueCatalog) num = uniqueCatalog.number;
  if (num == null && catalogCandidates.length > 1) {
    num = await resolveOldMapNumberForAmbiguousCell(party, squareId, quadrantId, catalogCandidates);
  }

  let leadsTo =
    quadFromDb?.oldMapLeadsTo != null && String(quadFromDb.oldMapLeadsTo).trim() !== ''
      ? String(quadFromDb.oldMapLeadsTo)
      : null;
  if (num != null && (leadsTo == null || leadsTo === '')) {
    const byNum = getOldMapByNumber(num);
    leadsTo = byNum?.leadsTo ?? uniqueCatalog?.leadsTo ?? catalogCandidates[0]?.leadsTo ?? 'chest';
  }

  return { resolvedOldMapNumber: num, resolvedOldMapLeadsTo: leadsTo, catalogCandidates, usedCatalogFallback: quadFromDb == null || quadFromDb.oldMapNumber == null };
}

/**
 * Check if a character has at least one of the given map number.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised map of the given number.
 * Used for quadrant "map location" prompt (only appraised maps count).
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised, not-yet-redeemed map of the given number.
 * Used to decide whether to grant map-led reward on entering a quadrant.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedUnexpiredOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: null,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised, already-redeemed map of the given number.
 * Used to show "you've already claimed the reward here" only when someone entered this square with the map and redeemed.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedRedeemedOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: { $ne: null },
  });
  return count > 0;
}

/**
 * Find one appraised, unredeemed OldMapFound for the character and map number;
 * set redeemedAt to now and return the doc. Used after granting map-led reward (one-and-done).
 * @param {{ characterId?: string, characterName?: string, userId?: string }|string} characterRef
 * @param {number} mapNumber - Map number (1-46)
 * @param {{ partyId?: string, destinationSquare?: string, destinationQuadrant?: string }} [options] - Tie redemption to one expedition and grid cell so a later copy of the same map # is independent.
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findAndRedeemOldMap(characterRef, mapNumber, options = {}) {
  if (!characterRef || typeof mapNumber !== 'number') return null;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return null;
  const doc = await OldMapFound.findOne({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: null,
  }).sort({ foundAt: 1 });
  if (!doc) return null;
  doc.redeemedAt = new Date();
  const pid = options.partyId != null && String(options.partyId).trim();
  if (pid) doc.redeemedForPartyId = String(pid).slice(0, 32);
  const ds = options.destinationSquare != null && String(options.destinationSquare).trim();
  const dq = options.destinationQuadrant != null && String(options.destinationQuadrant).trim();
  if (ds) doc.redeemedDestinationSquare = ds.replace(/\s+/g, '').toUpperCase().slice(0, 8);
  if (dq) doc.redeemedDestinationQuadrant = String(dq).trim().toUpperCase().slice(0, 4);
  await doc.save();
  return doc;
}

/**
 * Get all map numbers a character has (with counts).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{mapNumber: number, quantity: number}>>}
 */
async function getCharacterOldMaps(characterRef) {
  if (!characterRef) return [];
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return [];
  const docs = await OldMapFound.aggregate([
    { $match: ownerMatch },
    { $group: { _id: '$mapNumber', quantity: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return docs.map((d) => ({ mapNumber: d._id, quantity: d.quantity }));
}

/**
 * Get all old maps for a character with full details (for /map list and appraisal-request).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{_id: import('mongoose').Types.ObjectId, mapId: string, mapNumber: number, appraised: boolean, redeemedAt: Date|null, foundAt: Date, locationFound: string}>>}
 */
async function getCharacterOldMapsWithDetails(characterRef) {
  if (!characterRef) return [];
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) {
    logger.info('OLD_MAP', `getCharacterOldMapsWithDetails: no ownerMatch for ref=${typeof characterRef === 'string' ? characterRef : JSON.stringify({ id: characterRef?._id, name: characterRef?.name })}`);
    return [];
  }
  const docs = await OldMapFound.find(ownerMatch)
    .sort({ foundAt: 1 })
    .lean();
  if (docs.length === 0) {
    logger.info(
      'OLD_MAP',
      `getCharacterOldMapsWithDetails: no rows matchKeys=${Object.keys(ownerMatch).join(',')}`
    );
  }
  return docs.map((d) => {
    const snap = getMapDestinationSnapshot(d.mapNumber);
    const appraised = !!d.appraised;
    return {
      _id: d._id,
      mapId: d.mapId || '',
      characterId: d.characterId || null,
      ownerUserId: d.ownerUserId || '',
      characterName: d.characterName || '',
      mapNumber: d.mapNumber,
      appraised,
      redeemedAt: d.redeemedAt || null,
      redeemedForPartyId: d.redeemedForPartyId || null,
      redeemedDestinationSquare: d.redeemedDestinationSquare || null,
      redeemedDestinationQuadrant: d.redeemedDestinationQuadrant || null,
      exploreMapPinnedAt: d.exploreMapPinnedAt || null,
      exploreMapPinnedPartyId: d.exploreMapPinnedPartyId || null,
      foundAt: d.foundAt,
      locationFound: d.locationFound || '',
      foundByCharacterName: d.characterName || '',
      foundWhere: d.locationFound || '',
      appraisedBy: d.appraisedBy || null,
      // Only expose destination after appraisal (DB snapshot or seed fallback for legacy rows).
      leadsTo: appraised ? d.leadsTo || snap.leadsTo : null,
      leadsToCoordinates: appraised ? d.leadsToCoordinates || snap.leadsToCoordinates : null,
    };
  });
}

module.exports = {
  oldMapLeadsToNeedsExploreMapPin,
  pinOutcomeMatchesOldMapLead,
  normalizeOldMapItemNameString,
  parseOldMapNumberFromItemName,
  addOldMapToCharacter,
  findOldMapByIdOrMapId,
  getMapDestinationSnapshot,
  hasOldMap,
  hasAppraisedOldMap,
  hasAppraisedUnexpiredOldMap,
  hasAppraisedRedeemedOldMap,
  findAndRedeemOldMap,
  getCharacterOldMaps,
  getCharacterOldMapsWithDetails,
  resolveOldMapNumberForAmbiguousCell,
  resolveOldMapNumberForExplorationMove,
};
