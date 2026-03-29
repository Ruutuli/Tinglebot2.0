// ============================================================================
// Seed Bright + Sticky Elixir items; remove Fireproof Elixir; migrate inventory
// ============================================================================
// - Upserts **Bright Elixir** and **Sticky Elixir** (Witch recipes, TotK-style art).
// - Deletes **Fireproof Elixir** from `items` (heat/fire is **Chilly Elixir** in this bot).
// - Renames inventory rows `Fireproof Elixir` → **Chilly Elixir** and sets `itemId` to Chilly’s _id.
//
// Usage (repo root):  npm run seed:bright-sticky-elixirs -- --dry-run
//        (from bot/):  npm run seed:bright-sticky-elixirs -- --dry-run
// ============================================================================

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

const Item = require('../models/ItemModel');
/** Keys like `Any Monster Part` — not always real `items` rows; see `inventoryUtils` + `GeneralItemCategories`. */
const generalCategories = require('../models/GeneralItemCategories');

const BRIGHT_IMG = 'https://cdn.wikimg.net/en/zeldawiki/images/0/0a/TotK_Bright_Elixir_Icon.png';
const STICKY_IMG = 'https://cdn.wikimg.net/en/zeldawiki/images/9/94/TotK_Sticky_Elixir_Icon.png';
const COOKING_GRAPHIC = 'https://storage.googleapis.com/tinglebot/Graphics/cooking_white.png';

function parseArgs() {
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
  }
  return { dryRun };
}

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findItemByName(name) {
  return Item.findOne({ itemName: new RegExp(`^${escapeRx(name)}$`, 'i') }).lean();
}

/**
 * Build crafting material refs. Real items: lookup by name.
 * General categories (e.g. **Any Monster Part**): anchor `_id` to a real item from
 * `GeneralItemCategories`, keep `itemName` as the category key (crafting matches that string).
 */
async function buildCraftingMaterial(specs) {
  const directNames = new Set(
    specs.map((s) => s.name).filter((n) => !generalCategories[n])
  );

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
          `General category "${name}": no member item found in DB (try syncing items). Tried ${alts.length} alternates.`
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

/**
 * Clone boolean/monster fields from an existing elixir document (Chilly template).
 */
function applyElixirTemplate(baseLean, overrides) {
  const { _id, __v, ...rest } = baseLean;
  return { ...rest, ...overrides };
}

async function seedBrightSticky(dryRun, chillyTemplate) {
  const brightMats = await buildCraftingMaterial([
    { name: 'Any Monster Part', quantity: 1 },
    { name: 'Blessed Butterfly', quantity: 1 },
    { name: 'Deep Firefly', quantity: 1 },
    { name: 'Chuchu Jelly', quantity: 1 },
  ]);

  const stickyMats = await buildCraftingMaterial([
    { name: 'Any Monster Part', quantity: 1 },
    { name: 'Sticky Lizard', quantity: 1 },
    { name: 'Sticky Frog', quantity: 1 },
    { name: 'Chuchu Jelly', quantity: 1 },
  ]);

  const brightDoc = applyElixirTemplate(chillyTemplate, {
    itemName: 'Bright Elixir',
    image: BRIGHT_IMG,
    imageType: COOKING_GRAPHIC,
    emoji: '',
    itemRarity: 5,
    buyPrice: 750,
    sellPrice: 190,
    staminaToCraft: '4',
    craftingMaterial: brightMats,
    element: 'none',
    effectFamily: null,
    elixirLevel: 1,
  });

  const stickyDoc = applyElixirTemplate(chillyTemplate, {
    itemName: 'Sticky Elixir',
    image: STICKY_IMG,
    imageType: COOKING_GRAPHIC,
    emoji: '',
    itemRarity: 5,
    buyPrice: 750,
    sellPrice: 190,
    staminaToCraft: '4',
    craftingMaterial: stickyMats,
    element: 'none',
    effectFamily: null,
    elixirLevel: 1,
  });

  if (dryRun) {
    console.log(
      '[dry-run] Would upsert Bright Elixir + Sticky Elixir (ingredients validated). TotK art URLs.'
    );
    return;
  }

  for (const doc of [brightDoc, stickyDoc]) {
    const name = doc.itemName;
    await Item.updateOne(
      { itemName: new RegExp(`^${escapeRx(name)}$`, 'i') },
      { $set: doc },
      { upsert: true }
    );
    console.log(`✓ Upserted: ${name}`);
  }
}

async function migrateInventoriesToChilly(dryRun, chillyId) {
  const invDb = mongoose.connection.useDb('inventories');
  // Mongoose returns a Promise of collection info objects (native driver's `.toArray()` is on Db, not here).
  const cols = await invDb.listCollections();
  let total = 0;

  for (const { name: collName } of cols) {
    if (collName.startsWith('system.')) continue;
    const coll = invDb.collection(collName);
    const filter = { itemName: /^Fireproof Elixir$/i };
    const count = await coll.countDocuments(filter);
    if (count === 0) continue;

    if (dryRun) {
      console.log(`[dry-run] ${collName}: would update ${count} row(s) Fireproof Elixir → Chilly Elixir`);
      total += count;
      continue;
    }

    const res = await coll.updateMany(filter, {
      $set: { itemName: 'Chilly Elixir', itemId: chillyId },
    });
    total += res.modifiedCount;
    console.log(`✓ ${collName}: migrated ${res.modifiedCount} stack(s)`);
  }

  console.log(`\nInventory rows updated (Fireproof → Chilly): ${total}${dryRun ? ' (dry-run)' : ''}`);
}

async function deleteFireproofItem(dryRun) {
  const fp = await Item.findOne({ itemName: /^Fireproof Elixir$/i }).select('_id').lean();
  if (!fp) {
    console.log('ℹ️  Fireproof Elixir not in items collection (already removed).');
    return;
  }
  if (dryRun) {
    console.log('[dry-run] Would delete items/Fireproof Elixir');
    return;
  }
  await Item.deleteOne({ _id: fp._id });
  console.log('✓ Deleted item: Fireproof Elixir');
}

async function main() {
  const { dryRun } = parseArgs();
  console.log(dryRun ? '🔎 DRY RUN — no DB writes\n' : '▶ Running migrations\n');

  await mongoose.connect(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });

  const chilly = await findItemByName('Chilly Elixir');
  if (!chilly) {
    console.error('❌ Chilly Elixir not found — add it before running this script.');
    process.exit(1);
  }

  await seedBrightSticky(dryRun, chilly);

  const chillyFresh = await Item.findOne({ itemName: /^Chilly Elixir$/i }).select('_id').lean();
  const chillyId = chillyFresh._id;

  await migrateInventoriesToChilly(dryRun, chillyId);

  await deleteFireproofItem(dryRun);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
