// ============================================================================
// Seed elixir mixer labels from docs/elixir-ingredient-labels.json → MongoDB items
// ============================================================================
// - Critter rows: sets `effectFamily` on matching Item documents.
// - Monster part rows: sets `element` (mixer affinity: fire, ice, electric, undead, none).
//
// Usage (repo root):  npm run seed:elixir-ingredient-labels -- --dry-run
//        (from bot/):  npm run seed:elixir-ingredient-labels -- --dry-run
//        Or:           node bot/scripts/seedElixirIngredientLabels.js [--dry-run] [--file=path]
// ============================================================================

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

const DEFAULT_JSON = path.join(__dirname, '..', '..', 'docs', 'elixir-ingredient-labels.json');

const Item = require('../models/ItemModel');

function parseArgs() {
  let dryRun = false;
  let jsonPath = DEFAULT_JSON;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--file=')) jsonPath = path.resolve(arg.slice(7));
  }
  return { dryRun, jsonPath };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadLabels(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const labels = data.labels;
  if (!labels || typeof labels !== 'object') {
    throw new Error('Invalid JSON: expected top-level "labels" object');
  }
  return { version: data.version, labels };
}

async function main() {
  const { dryRun, jsonPath } = parseArgs();

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ File not found:', jsonPath);
    process.exit(1);
  }

  const { version, labels } = loadLabels(jsonPath);
  console.log(`📄 ${path.basename(jsonPath)}  (version ${version ?? '?'})\n`);

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  const missing = [];
  const bad = [];

  for (const [itemName, spec] of Object.entries(labels)) {
    if (!spec || typeof spec !== 'object') continue;

    const hasFamily = spec.effectFamily != null && spec.effectFamily !== '';
    const hasElement = spec.element != null && spec.element !== '';

    if (hasFamily && hasElement) {
      bad.push(`${itemName}: has both effectFamily and element`);
      continue;
    }
    if (!hasFamily && !hasElement) {
      bad.push(`${itemName}: missing effectFamily and element`);
      continue;
    }

    const rx = new RegExp(`^${escapeRegExp(itemName)}$`, 'i');
    const doc = await Item.findOne({ itemName: rx }).select('itemName effectFamily element').lean();

    if (!doc) {
      notFound++;
      missing.push(itemName);
      continue;
    }

    const canonical = doc.itemName;
    const $set = {};

    if (hasFamily) {
      if (doc.effectFamily === spec.effectFamily) {
        unchanged++;
        continue;
      }
      $set.effectFamily = spec.effectFamily;
    } else if (hasElement) {
      const noStrayFamily = doc.effectFamily == null || doc.effectFamily === '';
      if (doc.element === spec.element && noStrayFamily) {
        unchanged++;
        continue;
      }
      $set.element = spec.element;
      $set.effectFamily = null;
    }

    if (dryRun) {
      if (hasFamily) {
        console.log(
          `[dry-run] ${canonical}: effectFamily ${JSON.stringify(doc.effectFamily)} → ${JSON.stringify($set.effectFamily)}`
        );
      } else {
        console.log(
          `[dry-run] ${canonical}: element ${JSON.stringify(doc.element)} → ${JSON.stringify($set.element)}` +
            (Object.prototype.hasOwnProperty.call($set, 'effectFamily')
              ? `; effectFamily ${JSON.stringify(doc.effectFamily)} → null`
              : '')
        );
      }
      updated++;
      continue;
    }

    await Item.updateOne({ _id: doc._id }, { $set });
    updated++;
    if (hasFamily) {
      console.log(`✓ ${canonical}: effectFamily → ${JSON.stringify($set.effectFamily)}`);
    } else {
      console.log(`✓ ${canonical}: element → ${JSON.stringify($set.element)} (effectFamily cleared if was set)`);
    }
  }

  await mongoose.disconnect();

  console.log('\n── Summary ──');
  console.log(`  Updated:   ${updated}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Not found: ${notFound}`);
  if (bad.length) {
    console.log(`  Skipped (bad rows): ${bad.length}`);
    for (const b of bad) console.log(`    - ${b}`);
  }
  if (missing.length) {
    console.log('  Missing items:', missing.join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
