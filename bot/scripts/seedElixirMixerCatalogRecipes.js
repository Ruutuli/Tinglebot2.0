// ============================================================================
// Seed catalog `craftingMaterial` for elixirs — mixer shape:
//   one labeled critter (README representative) + **Any Monster Part**
//
// Players still pick any valid monster part at brew time (neutral, fire for chilly,
// etc.); that validation is in `elixirBrewModule` / brew flow — not a fixed jelly here.
// ============================================================================
// Usage:
//   Preview only:  npm run seed:elixir-mixer-recipes -- --dry-run
//   Apply to DB:   npm run seed:elixir-mixer-recipes
// (npm needs `--` before `--dry-run` or the flag never reaches this script.)
// ============================================================================

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const mongoose = require('mongoose');
const Item = require('../models/ItemModel');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in bot/.env');
  process.exit(1);
}

const generalCategories = require('../models/GeneralItemCategories');

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Same pattern as `seedBrightStickyElixirsAndRetireFireproof.js`:
 * critter = concrete item; part = category key `Any Monster Part` with anchored _id.
 */
async function buildMixerCraftingMaterial(critterName) {
  const specs = [
    { name: critterName, quantity: 1 },
    { name: 'Any Monster Part', quantity: 1 },
  ];
  const directNames = new Set(specs.map((s) => s.name).filter((n) => !generalCategories[n]));

  const out = [];
  for (const { name, quantity } of specs) {
    const alts = generalCategories[name];
    if (alts && alts.length) {
      let chosen = null;
      for (const alt of alts) {
        if (directNames.has(alt)) continue;
        chosen = await Item.findOne({ itemName: new RegExp(`^${escapeRx(alt)}$`, 'i') })
          .select('_id itemName')
          .lean();
        if (chosen) break;
      }
      if (!chosen) {
        throw new Error(
          `General category "${name}": no member item in DB (sync items). Tried ${alts.length} alternates.`
        );
      }
      out.push({ _id: chosen._id, itemName: name, quantity });
      continue;
    }

    const doc = await Item.findOne({ itemName: new RegExp(`^${escapeRx(name)}$`, 'i') })
      .select('_id itemName')
      .lean();
    if (!doc) {
      throw new Error(`Missing ingredient item in DB: "${name}"`);
    }
    out.push({ _id: doc._id, itemName: doc.itemName, quantity });
  }
  return out;
}

/** Representative critter per README “Elixir | Critter + part” table (part slot = Any Monster Part in DB). */
const MIXER_RECIPES = [
  { elixir: 'Bright Elixir', critter: 'Deep Firefly' },
  { elixir: 'Chilly Elixir', critter: 'Cold Darner' },
  { elixir: 'Electro Elixir', critter: 'Electric Darner' },
  { elixir: 'Enduring Elixir', critter: 'Tireless Frog' },
  { elixir: 'Energizing Elixir', critter: 'Restless Cricket' },
  { elixir: 'Fairy Tonic', critter: 'Fairy' },
  { elixir: 'Hasty Elixir', critter: 'Hightail Lizard' },
  { elixir: 'Hearty Elixir', critter: 'Hearty Lizard' },
  { elixir: 'Mighty Elixir', critter: 'Bladed Rhino Beetle' },
  { elixir: 'Sneaky Elixir', critter: 'Sunset Firefly' },
  { elixir: 'Spicy Elixir', critter: 'Warm Darner' },
  { elixir: 'Sticky Elixir', critter: 'Sticky Lizard' },
  { elixir: 'Tough Elixir', critter: 'Rugged Rhino Beetle' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`
seedElixirMixerCatalogRecipes
─────────────────────────────
What it does:
  • Connects to MongoDB (MONGODB_URI in bot/.env).
  • For each elixir in MIXER_RECIPES, finds that item in the **items** collection
    (by itemName, case-insensitive).
  • **Only changes** the field: craftingMaterial
  • Sets craftingMaterial to exactly **2** rows:
      1) One **critter** (representative name from the mixer README table)
      2) **Any Monster Part** — same as Witch recipes elsewhere: itemName is the
         category string; _id points at a real catalog item used as anchor.
  • Does **not** create new elixir items, delete items, or change buy/sell/stats.

Mode: ${dryRun ? 'DRY RUN — no writes; only prints what would be set.' : 'APPLY — running Item.updateOne(..., { $set: { craftingMaterial } }) per elixir.'}
`);

  await mongoose.connect(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });

  for (const row of MIXER_RECIPES) {
    let mats;
    try {
      mats = await buildMixerCraftingMaterial(row.critter);
    } catch (e) {
      console.error(`❌ ${row.elixir}: ${e.message}`);
      continue;
    }

    if (dryRun) {
      const crit = mats[0].itemName;
      console.log(`[dry-run] ${row.elixir}  →  craftingMaterial: [ ${crit} x1, Any Monster Part x1 ]`);
      continue;
    }

    const res = await Item.updateOne(
      { itemName: new RegExp(`^${escapeRx(row.elixir)}$`, 'i') },
      { $set: { craftingMaterial: mats } }
    );
    if (res.matchedCount === 0) {
      console.warn(`⚠️  No item matched "${row.elixir}" — skipped`);
    } else {
      const crit = mats[0].itemName;
      console.log(`✓ ${row.elixir}  →  craftingMaterial: [ ${crit} x1, Any Monster Part x1 ] (modifiedCount=${res.modifiedCount})`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
