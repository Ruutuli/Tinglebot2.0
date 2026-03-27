// ============================================================================
// Backfill oldMapsFound ownership fields
// ============================================================================
// Purpose:
// - Populate `characterId` and `ownerUserId` on legacy old map rows.
// - Match by exact character name (case-insensitive) across Character/ModCharacter.
// - Emit unresolved rows for manual review.
//
// Usage:
//   node bot/scripts/backfill-old-map-owners.js --dry-run
//   node bot/scripts/backfill-old-map-owners.js --write
// ============================================================================

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const projectRoot = path.resolve(__dirname, '..', '..');
for (const envFile of [
  path.join(projectRoot, '.env'),
  path.join(projectRoot, 'dashboard', '.env'),
  path.join(projectRoot, 'bot', '.env'),
]) {
  if (fs.existsSync(envFile)) {
    require('dotenv').config({ path: envFile });
    break;
  }
}

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
const OldMapFound = require(path.join(projectRoot, 'bot', 'models', 'OldMapFoundModel.js'));
const Character = require(path.join(projectRoot, 'bot', 'models', 'CharacterModel.js'));
const ModCharacter = require(path.join(projectRoot, 'bot', 'models', 'ModCharacterModel.js'));

function byNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function addToLookup(map, character, source) {
  const key = byNameKey(character?.name);
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push({
    _id: character._id,
    name: character.name,
    userId: String(character.userId || ''),
    source,
  });
}

function resolveOwnerForMapRow(row, lookup) {
  const key = byNameKey(row.characterName);
  const candidates = lookup.get(key) || [];
  if (!candidates.length) {
    return { match: null, reason: 'no_name_match' };
  }

  const rowOwner = String(row.ownerUserId || '').trim();
  if (rowOwner) {
    const userMatches = candidates.filter((c) => c.userId && c.userId === rowOwner);
    if (userMatches.length === 1) return { match: userMatches[0], reason: 'matched_by_userId' };
    if (userMatches.length > 1) return { match: null, reason: 'ambiguous_same_user_multiple_chars' };
  }

  if (candidates.length === 1) return { match: candidates[0], reason: 'matched_by_unique_name' };
  return { match: null, reason: 'ambiguous_name' };
}

async function main() {
  const dryRun = !process.argv.includes('--write');
  if (!MONGODB_URI) {
    console.error('❌ Missing MONGODB_TINGLEBOT_URI or MONGODB_URI in env.');
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? 'dry-run' : 'write'}`);
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected.\n');

  const [characters, modCharacters] = await Promise.all([
    Character.find({}, { _id: 1, name: 1, userId: 1 }).lean(),
    ModCharacter.find({}, { _id: 1, name: 1, userId: 1 }).lean(),
  ]);

  const lookup = new Map();
  for (const c of characters) addToLookup(lookup, c, 'character');
  for (const c of modCharacters) addToLookup(lookup, c, 'mod_character');

  const mapRows = await OldMapFound.find({
    $or: [{ characterId: null }, { characterId: { $exists: false } }, { ownerUserId: '' }, { ownerUserId: { $exists: false } }],
  }).lean();

  let updated = 0;
  let skippedAlreadyGood = 0;
  const unresolved = [];

  for (const row of mapRows) {
    const hasCharacterId = !!row.characterId;
    const hasOwnerUserId = !!String(row.ownerUserId || '').trim();
    if (hasCharacterId && hasOwnerUserId) {
      skippedAlreadyGood += 1;
      continue;
    }

    const { match, reason } = resolveOwnerForMapRow(row, lookup);
    if (!match) {
      unresolved.push({
        _id: String(row._id),
        mapId: row.mapId || '',
        characterName: row.characterName || '',
        ownerUserId: row.ownerUserId || '',
        reason,
      });
      continue;
    }

    const update = {
      characterId: match._id,
      ownerUserId: String(row.ownerUserId || '').trim() || match.userId,
    };
    if (!dryRun) {
      await OldMapFound.updateOne({ _id: row._id }, { $set: update });
    }
    updated += 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'write',
    scanned: mapRows.length,
    updated,
    skippedAlreadyGood,
    unresolvedCount: unresolved.length,
    unresolved,
  };

  const reportPath = path.join(projectRoot, 'bot', 'scripts', 'backfill-old-map-owners.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('--- Backfill Summary ---');
  console.log(`Rows scanned: ${mapRows.length}`);
  console.log(`Rows updated: ${updated}${dryRun ? ' (dry-run only)' : ''}`);
  console.log(`Rows already complete: ${skippedAlreadyGood}`);
  console.log(`Rows unresolved: ${unresolved.length}`);
  console.log(`Report: ${reportPath}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
