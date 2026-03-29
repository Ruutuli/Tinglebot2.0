// ============================================================================
// Seed Creature-category critters/items into a character's inventory (default: Tingle).
// Adds a fixed quantity per item via addItemInventoryDatabase (stacks with existing).
// ============================================================================
// Usage (from repo root):  npm run seed:tingle-creature -- --character Tingle --qty 50
//        (from bot/):       node scripts/seedTingleCreatureInventory.js --dry-run
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

const DatabaseConnectionManager = require('../database/connectionManager');
const Character = require('../models/CharacterModel');

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

/** Creature list (21/39 UI); must match `items` catalog itemName. */
const CREATURE_ITEM_NAMES = [
  'Bladed Rhino Beetle',
  'Blessed Butterfly',
  'Cold Darner',
  'Deep Firefly',
  'Deku Hornet',
  'Eldin Roller',
  'Electric Darner',
  'Energetic Rhino Beetle',
  'Fabled Butterfly',
  'Fairy',
  'Faron Grasshopper',
  'Fireproof Lizard',
  'Gerudo Dragonfly',
  'Golden Insect',
  'Hearty Lizard',
  'Hightail Lizard',
  'Hornet Larvae',
  'Hot-Footed Frog',
  'Insect Parts',
  'Lanayru Ant',
  'Lizard Tail',
  'Mock Fairy',
  'Restless Cricket',
  'Rugged Rhino Beetle',
  'Sand Cicada',
  'Sky Stag Beetle',
  'Skyloft Mantis',
  'Smotherwing Butterfly',
  'Starry Firefly',
  'Sticky Frog',
  'Sticky Lizard',
  'Summerwing Butterfly',
  'Sunset Firefly',
  'Thunderwing Butterfly',
  'Tireless Frog',
  'Volcanic Ladybug',
  'Warm Darner',
  'Winterwing Butterfly',
  'Woodland Rhino Beetle',
];

async function main() {
  const { dryRun, characterName, qty } = parseArgs();

  if (!process.env.MONGODB_URI && !process.env.MONGODB_TINGLEBOT_URI) {
    console.error('❌ Set MONGODB_URI (or MONGODB_TINGLEBOT_URI) in .env');
    process.exit(1);
  }

  console.log(`
seedTingleCreatureInventory
───────────────────────────
Character: ${characterName}
Quantity per item (added to existing stacks): ${qty}
Mode: ${dryRun ? 'DRY RUN — no writes' : 'APPLY'}
Items: ${CREATURE_ITEM_NAMES.length}
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

  for (const itemName of CREATURE_ITEM_NAMES) {
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

  console.log(`\nDone. ${ok}/${CREATURE_ITEM_NAMES.length} succeeded.`);
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
