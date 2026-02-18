// ============================================================================
// Sync Relic Names to relicOutcomes.js
// ============================================================================
// Purpose: Ensure relic documents' `name` field matches canonical names from
//          RELIC_OUTCOMES. Updates NAME only where mismatched.
//          Handles legacy/variant names from CSV imports (e.g. "Naydra scale"
//          -> "Naydra's Scale", "Shard of Nayru's Horn" -> "Shard of Naydra's Horn").
//
// Usage: node bot/scripts/sync-relic-names-to-outcomes.js [--dry-run]
//        (run from project root)
// ============================================================================

const path = require('path');
const fs = require('fs');

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

const mongoose = require('mongoose');
const RelicModel = require(path.join(projectRoot, 'bot', 'models', 'RelicModel.js'));
const { RELIC_OUTCOMES } = require(path.join(projectRoot, 'bot', 'data', 'relicOutcomes.js'));

const MONGODB_URI = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;

// Legacy/variant relic names (from CSV, form responses) -> canonical RELIC_OUTCOMES name
const LEGACY_NAME_MAP = {
  'Naydra scale': "Naydra's Scale",
  "Naydra Scale": "Naydra's Scale",
  "Shard of Nayru's Horn": "Shard of Naydra's Horn",
  'Shard of Nayru\'s Horn': "Shard of Naydra's Horn",
  'Translation Scroll Volume 26: Scroll of Celestial Transcription': 'Translation Scroll Volume 26',
};

function buildCanonicalSetAndMap() {
  const canonicalNames = new Set(RELIC_OUTCOMES.map((o) => o.name));
  const lookup = { ...LEGACY_NAME_MAP };
  for (const name of canonicalNames) {
    lookup[name] = name;
  }
  return { canonicalNames, lookup };
}

function resolveCanonicalName(value, lookup, canonicalNames) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (lookup[trimmed]) return lookup[trimmed];
  if (canonicalNames.has(trimmed)) return trimmed;
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!MONGODB_URI) {
    console.error('❌ Set MONGODB_TINGLEBOT_URI or MONGODB_URI in dashboard/.env or bot/.env');
    process.exit(1);
  }

  const { canonicalNames, lookup } = buildCanonicalSetAndMap();
  console.log(`Canonical outcomes: ${RELIC_OUTCOMES.length}`);
  console.log(`Legacy mappings: ${Object.keys(LEGACY_NAME_MAP).length}\n`);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected.\n');

  const relics = await RelicModel.find({}).lean();
  let updated = 0;
  const skipped = [];
  const noMatch = [];

  for (const relic of relics) {
    const source = relic.rollOutcome || relic.name;
    const canonical = resolveCanonicalName(source, lookup, canonicalNames);

    if (!canonical) {
      noMatch.push({ relicId: relic.relicId || relic._id, name: relic.name, rollOutcome: relic.rollOutcome });
      continue;
    }

    if (relic.name !== canonical) {
      if (!dryRun) {
        await RelicModel.findByIdAndUpdate(relic._id, { name: canonical });
      }
      console.log(`  ${relic.relicId || relic._id}: "${relic.name}" -> "${canonical}"`);
      updated++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Relics scanned: ${relics.length}`);
  console.log(`Name updated: ${updated}${dryRun ? ' (dry-run, no changes written)' : ''}`);
  if (noMatch.length) {
    console.log(`\n⚠️ No canonical match (unchanged): ${noMatch.length}`);
    noMatch.forEach((m) => console.log(`   - ${m.relicId}: name="${m.name}" rollOutcome="${m.rollOutcome || ''}"`));
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
