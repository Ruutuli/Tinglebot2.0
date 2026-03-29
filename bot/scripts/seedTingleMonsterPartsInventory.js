// ============================================================================
// Seed monster-category materials into a character's inventory (default: Tingle).
// Adds a fixed quantity per item via addItemInventoryDatabase (stacks with existing).
// ============================================================================
// Usage (from bot/):
//   node scripts/seedTingleMonsterPartsInventory.js
//   node scripts/seedTingleMonsterPartsInventory.js --dry-run
//   node scripts/seedTingleMonsterPartsInventory.js --character Tingle --qty 50
// ============================================================================

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const botEnvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(botEnvPath)) {
  dotenv.config({ path: botEnvPath });
}

const mongoose = require('mongoose');
const DatabaseConnectionManager = require('../database/connectionManager');
const Character = require('../models/CharacterModel');

// Side effect: wires inventoryUtils → db (connectToInventories, fetchItemByName, …)
require('../database/db.js');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let characterName = 'Tingle';
  let qty = 50;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--character' && argv[i + 1]) characterName = String(argv[++i]).trim();
    else if (a === '--qty' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (!Number.isFinite(n) || n < 1) {
        console.error('❌ --qty must be a positive integer');
        process.exit(1);
      }
      qty = n;
    }
  }
  return { dryRun, characterName, qty };
}

/** Display names from the Monster parts list (25/53 UI); must match `items` catalog itemName. */
const MONSTER_PART_ITEM_NAMES = [
  'Blin Bling',
  'Bokoblin Fang',
  'Bokoblin Guts',
  'Bokoblin Horn',
  'Chuchu Egg',
  'Chuchu Jelly',
  'Electric Keese Wing',
  'Fire Keese Wing',
  'Freezard Water',
  'Gibdo Bandage',
  'Gibdo Bone',
  'Gibdo Guts',
  'Gibdo Wing',
  'Golden Skull',
  'Hinox Guts',
  'Hinox Toenail',
  'Hinox Tooth',
  'Horriblin Claw',
  'Horriblin Guts',
  'Horriblin Horn',
  'Ice Keese Wing',
  'Icy Lizalfos Tail',
  'Keese Eyeball',
  'Keese Wing',
  'Like Like Stone',
  'Lizalfos Horn',
  'Lizalfos Tail',
  'Lizalfos Talon',
  'Lynel Guts',
  'Lynel Hoof',
  'Lynel Horn',
  'Moblin Fang',
  'Moblin Guts',
  'Moblin Horn',
  'Molduga Fin',
  'Molduga Guts',
  'Monster Claw',
  'Monster Extract',
  'Monster Horn',
  'Octo Balloon',
  'Octorok Eyeball',
  'Octorok Tentacle',
  'Ornamental Skull',
  'Poe Soul',
  'Red Chuchu Jelly',
  'Red Lizalfos Tail',
  'Rugged Horn',
  'Serpent Fangs',
  "Spider's Eye",
  'Stal Skull',
  'White Chuchu Jelly',
  'Yellow Chuchu Jelly',
  'Yellow Lizalfos Tail',
];

async function main() {
  const { dryRun, characterName, qty } = parseArgs();

  if (!process.env.MONGODB_URI && !process.env.MONGODB_TINGLEBOT_URI) {
    console.error('❌ Set MONGODB_URI (or MONGODB_TINGLEBOT_URI) in .env');
    process.exit(1);
  }

  console.log(`
seedTingleMonsterPartsInventory
───────────────────────────────
Character: ${characterName}
Quantity per item (added to existing stacks): ${qty}
Mode: ${dryRun ? 'DRY RUN — no writes' : 'APPLY'}
Items: ${MONSTER_PART_ITEM_NAMES.length}
`);

  await DatabaseConnectionManager.connectToTinglebot();

  const character = await Character.findOne({
    name: { $regex: new RegExp(`^${escapeRegExp(characterName)}$`, 'i') },
  }).lean();

  if (!character) {
    console.error(`❌ Character not found: "${characterName}"`);
    await DatabaseConnectionManager.closeAll().catch(() => {});
    process.exit(1);
  }

  let ok = 0;
  const failed = [];

  for (const itemName of MONSTER_PART_ITEM_NAMES) {
    if (dryRun) {
      console.log(`[dry-run] ${character.name}  ←  +${qty}  ${itemName}`);
      ok++;
      continue;
    }
    try {
      await addItemInventoryDatabase(character._id, itemName, qty, null, 'Trade');
      console.log(`✓ +${qty} ${itemName}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${itemName}: ${e.message}`);
      failed.push({ itemName, error: e.message });
    }
  }

  console.log(`\nDone. ${ok}/${MONSTER_PART_ITEM_NAMES.length} succeeded.`);
  if (failed.length) {
    console.log('Failed:', failed.map((f) => f.itemName).join(', '));
  }

  await DatabaseConnectionManager.closeAll().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  DatabaseConnectionManager.closeAll().catch(() => {});
  process.exit(1);
});
