// ============================================================================
// Remove misplaced old-map rows from per-character inventory collections
// ============================================================================
// Old maps belong in `oldMapsFound` (OldMapFound), not in the inventories DB.
// Matches "Map #N" / "Old Map" using the same rules as bot/utils/oldMapUtils.js
// (flexible whitespace, strips invisible chars). Optionally scans multiple DB names.
//
// Usage:
//   node bot/scripts/remove-old-maps-from-inventories.js
//   node bot/scripts/remove-old-maps-from-inventories.js --write
//   node bot/scripts/remove-old-maps-from-inventories.js --databases inventories,tinglebot
//   node bot/scripts/remove-old-maps-from-inventories.js --id 69c16a7886e546b0e8fccb52 --write
// ============================================================================

const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

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

const {
  parseOldMapNumberFromItemName,
  normalizeOldMapItemNameString,
} = require(path.join(projectRoot, 'bot', 'utils', 'oldMapUtils.js'));

/** Never treat these as per-character inventories (global catalog, logs, etc.) */
const EXCLUDED_COLLECTIONS = new Set(
  [
    'items',
    'inventorylogs',
    'inventorylog',
    'item',
    'monsters',
    'characters',
    'modcharacters',
    'parties',
    'users',
    'inventorylogmodels',
  ].map((s) => s.toLowerCase())
);

function isExcludedCollection(name) {
  const n = String(name || '').toLowerCase();
  if (EXCLUDED_COLLECTIONS.has(n)) return true;
  if (n.startsWith('system.')) return true;
  if (n.includes('inventorylog')) return true;
  return false;
}

/** Broad Mongo filter — then we confirm with parseOldMapNumberFromItemName() in JS */
const LOOSE_MAP_NAME_FILTER = {
  $or: [
    { itemName: { $regex: 'Map\\s*#', $options: 'i' } },
    { itemName: { $regex: '^\\s*old\\s+map\\s*$', $options: 'i' } },
  ],
};

function isOldMapInventoryDoc(doc) {
  if (!doc || doc.itemName == null) return false;
  const raw = doc.itemName;
  if (typeof raw !== 'string') return false;
  const n = parseOldMapNumberFromItemName(raw);
  if (n != null) return true;
  const norm = normalizeOldMapItemNameString(raw);
  return /^old map$/i.test(norm);
}

function getInventoriesUri() {
  return (
    process.env.MONGODB_INVENTORIES_URI ||
    process.env.MONGODB_INVENTORIES_URI_PROD ||
    process.env.MONGODB_TINGLEBOT_URI ||
    process.env.MONGODB_TINGLEBOT_URI_PROD ||
    process.env.MONGODB_URI ||
    null
  );
}

function parseArgValue(argv, prefix) {
  const hit = argv.find((a) => a.startsWith(prefix));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  if (eq === -1) return null;
  return hit.slice(eq + 1).trim();
}

function maskUri(uri) {
  try {
    const m = String(uri).match(/^(mongodb\+?srv?:\/\/)([^@]+)@/);
    if (m) return `${m[1]}***@${String(uri).split('@')[1]?.slice(0, 80) || ''}`;
    return String(uri).slice(0, 60) + (uri.length > 60 ? '…' : '');
  } catch (_) {
    return '(uri)';
  }
}

async function scanDatabase(client, dbName, dryRun, targetIdHex) {
  const removed = [];
  const db = client.db(dbName);
  const collInfos = await db.listCollections().toArray();
  const names = collInfos.map((c) => c.name).filter((n) => !isExcludedCollection(n));

  if (targetIdHex) {
    let oid;
    try {
      oid = new ObjectId(targetIdHex);
    } catch (_) {
      throw new Error(`Invalid --id (not a valid ObjectId): ${targetIdHex}`);
    }
    for (const collName of names.sort()) {
      const coll = db.collection(collName);
      const doc = await coll.findOne({ _id: oid });
      if (!doc) continue;
      if (!isOldMapInventoryDoc(doc)) {
        console.warn(
          `⚠️ Found _id=${targetIdHex} in [${dbName}.${collName}] but itemName does not look like an old map: ${JSON.stringify(doc.itemName)}`
        );
        continue;
      }
      removed.push({
        database: dbName,
        collection: collName,
        _id: String(doc._id),
        itemName: doc.itemName,
        quantity: doc.quantity ?? 1,
        characterId: doc.characterId ? String(doc.characterId) : '',
      });
      if (!dryRun) {
        await coll.deleteOne({ _id: oid });
      }
    }
    return { names, removed };
  }

  for (const collName of names.sort()) {
    const coll = db.collection(collName);
    const candidates = await coll.find(LOOSE_MAP_NAME_FILTER).toArray();
    const batch = candidates.filter(isOldMapInventoryDoc);
    if (batch.length === 0) continue;

    for (const doc of batch) {
      removed.push({
        database: dbName,
        collection: collName,
        _id: String(doc._id),
        itemName: doc.itemName,
        quantity: doc.quantity ?? 1,
        characterId: doc.characterId ? String(doc.characterId) : '',
      });
    }

    if (!dryRun && batch.length > 0) {
      const ids = batch.map((d) => d._id);
      const result = await coll.deleteMany({ _id: { $in: ids } });
      if (result.deletedCount !== batch.length) {
        console.warn(`⚠️ [${dbName}.${collName}]: expected ${batch.length} deletes, got ${result.deletedCount}`);
      }
    }
  }

  return { names, removed };
}

async function main() {
  const write = process.argv.includes('--write');
  const dryRun = !write;
  const uri = getInventoriesUri();
  if (!uri) {
    console.error('❌ Missing MongoDB URI (try MONGODB_INVENTORIES_URI or MONGODB_TINGLEBOT_URI or MONGODB_URI).');
    process.exit(1);
  }

  const dbArg = parseArgValue(process.argv, '--databases=') || parseArgValue(process.argv, '--db=');
  // Per-character inventories live in the `inventories` database. Only add more DB names if you know
  // your deployment stores character inventory elsewhere (never delete from global `items` / logs — excluded above).
  const databaseNames = dbArg
    ? dbArg.split(',').map((s) => s.trim()).filter(Boolean)
    : ['inventories'];

  const idArg = parseArgValue(process.argv, '--id=');

  console.log(`Mode: ${dryRun ? 'dry-run (no deletes)' : 'WRITE — will delete matching inventory rows'}`);
  console.log(`URI: ${maskUri(uri)}`);
  console.log(`Databases: ${databaseNames.join(', ')}`);
  if (idArg) console.log(`Target document _id: ${idArg}`);
  console.log('Connecting...\n');

  const client = new MongoClient(uri);
  await client.connect();

  const allRemoved = [];
  let totalCollections = 0;

  for (const dbName of databaseNames) {
    try {
      const { names, removed } = await scanDatabase(client, dbName, dryRun, idArg);
      totalCollections += names.length;
      allRemoved.push(...removed);
    } catch (e) {
      if (e.codeName === 'NamespaceNotFound' || String(e.message || '').includes('ns not found')) {
        console.warn(`⚠️ Database "${dbName}" not found or not accessible — skipping.`);
      } else {
        throw e;
      }
    }
  }

  await client.close();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'write',
    databases: databaseNames,
    collectionsScannedTotal: totalCollections,
    documentsMatched: allRemoved.length,
    removed: allRemoved,
  };

  const reportPath = path.join(projectRoot, 'bot', 'scripts', 'remove-old-maps-from-inventories.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Scanned ${totalCollections} collection slots across ${databaseNames.length} database(s).`);
  console.log(`Matched ${allRemoved.length} inventory document(s) that look like old maps.`);
  if (dryRun) {
    console.log('\nDry-run only. Re-run with --write to delete these rows.');
  } else {
    console.log('\nDeleted matching rows (or --id target).');
  }
  console.log(`\nReport written to: ${reportPath}`);
  if (idArg && allRemoved.length === 0) {
    console.log(
      `\nNo document with _id=${idArg} found in any scanned collection (already deleted, wrong cluster/URI, or id lives in a DB you did not list).`
    );
  }
  if (allRemoved.length && allRemoved.length <= 40) {
    console.log('\nDetails:');
    for (const r of allRemoved) {
      console.log(`  • [${r.database}.${r.collection}] ${r.itemName} x${r.quantity} (_id=${r._id})`);
    }
  } else if (allRemoved.length > 40) {
    console.log(`\n(${allRemoved.length} rows — see report JSON for full list)`);
  }

  if (allRemoved.length === 0 && !idArg) {
    console.log(
      '\n💡 Tips:\n' +
        '   • Confirm Compass is using the same cluster as MONGODB_* in .env.\n' +
        '   • Character inventories are usually database `inventories`, collection = character name lowercased (e.g. ven).\n' +
        '   • Delete one bad row by _id:\n' +
        '     node bot/scripts/remove-old-maps-from-inventories.js --id=<ObjectId> --write\n' +
        '   • Do not delete rows from the global `items` catalog or `inventorylogs` — this script skips those collections.'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
