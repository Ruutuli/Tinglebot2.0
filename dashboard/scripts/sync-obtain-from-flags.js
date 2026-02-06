// ============================================================================
// Sync Obtain Field from Flags Script
// ============================================================================
// Purpose: Update the `obtain` array field for all items based on their
//          activity flags (gathering, looting, crafting, vending, traveling,
//          exploring) and special weather flags.
// - Computes the correct `obtain` array from boolean flags
// - Updates items where `obtain` is missing entries or is out of sync
//
// Usage: node scripts/sync-obtain-from-flags.js
// ============================================================================

const mongoose = require('mongoose');
const path = require('path');

// Try to load dotenv if available (optional)
// Load from dashboard/.env (one directory up from scripts/)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv not available, continue without it
}

// ============================================================================
// Configuration
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined. Set it in your .env file or environment.');
  process.exit(1);
}

// ============================================================================
// Minimal Item Schema (for querying and updating)
// ============================================================================

const ItemSchema = new mongoose.Schema({
  itemName: String,
  obtain: [String],
  vending: Boolean,
  traveling: Boolean,
  exploring: Boolean,
  craftingMaterial: [mongoose.Schema.Types.Mixed],
  // Gathering jobs
  farmer: Boolean,
  forager: Boolean,
  herbalist: Boolean,
  rancher: Boolean,
  miner: Boolean,
  beekeeper: Boolean,
  fisherman: Boolean,
  hunter: Boolean,
  // Looting jobs
  adventurer: Boolean,
  gravekeeper: Boolean,
  guard: Boolean,
  mercenary: Boolean,
  scout: Boolean,
  hunterLooting: Boolean,
  // Crafting jobs
  cook: Boolean,
  blacksmith: Boolean,
  craftsman: Boolean,
  maskMaker: Boolean,
  researcher: Boolean,
  weaver: Boolean,
  artist: Boolean,
  witch: Boolean,
  // Monster flags (check if any monster flag is true for looting)
  monsterList: [String],
  // All monster boolean fields (for checking if any is true)
  specialWeather: {
    muggy: Boolean,
    flowerbloom: Boolean,
    fairycircle: Boolean,
    jubilee: Boolean,
    meteorShower: Boolean,
    rockslide: Boolean,
    avalanche: Boolean
  }
}, { collection: 'items', strict: false });

const Item = mongoose.model('Item', ItemSchema);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if item has any monster flag set to true
 */
function hasAnyMonsterFlag(item) {
  // List of all monster boolean fields from ItemModel
  const monsterFields = [
    'blackBokoblin', 'blueBokoblin', 'cursedBokoblin', 'goldenBokoblin', 'silverBokoblin', 'bokoblin',
    'electricChuchuLarge', 'fireChuchuLarge', 'iceChuchuLarge', 'chuchuLarge',
    'electricChuchuMedium', 'fireChuchuMedium', 'iceChuchuMedium', 'chuchuMedium',
    'electricChuchuSmall', 'fireChuchuSmall', 'iceChuchuSmall', 'chuchuSmall',
    'blackHinox', 'blueHinox', 'hinox',
    'electricKeese', 'fireKeese', 'iceKeese', 'keese',
    'blackLizalfos', 'blueLizalfos', 'cursedLizalfos', 'electricLizalfos', 'fireBreathLizalfos',
    'goldenLizalfos', 'iceBreathLizalfos', 'silverLizalfos', 'lizalfos',
    'blueManedLynel', 'goldenLynel', 'silverLynel', 'whiteManedLynel', 'lynel',
    'blackMoblin', 'blueMoblin', 'cursedMoblin', 'goldenMoblin', 'silverMoblin', 'moblin',
    'molduga', 'molduking',
    'forestOctorok', 'rockOctorok', 'skyOctorok', 'snowOctorok', 'treasureOctorok', 'waterOctorok',
    'frostPebblit', 'igneoPebblit', 'stonePebblit',
    'stalizalfos', 'stalkoblin', 'stalmoblin', 'stalnox',
    'frostTalus', 'igneoTalus', 'luminousTalus', 'rareTalus', 'stoneTalus',
    'blizzardWizzrobe', 'electricWizzrobe', 'fireWizzrobe', 'iceWizzrobe', 'meteoWizzrobe', 'thunderWizzrobe',
    'likeLike', 'evermean', 'gibdo', 'horriblin', 'gloomHands', 'bossBokoblin', 'mothGibdo', 'littleFrox',
    'yigaBlademaster', 'yigaFootsoldier',
    'normalBokoblin', 'normalGibdo', 'normalHinox', 'normalHorriblin', 'normalKeese',
    'normalLizalfos', 'normalLynel', 'normalMoblin'
  ];
  
  // Check if any monster field is true
  for (const field of monsterFields) {
    if (item[field] === true) {
      return true;
    }
  }
  
  // Also check monsterList array
  if (item.monsterList && Array.isArray(item.monsterList) && item.monsterList.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Compute the correct obtain array from item flags
 * Determines obtain methods based on:
 * - Gathering: if any gathering job is true
 * - Looting: if any looting job is true OR if any monster flag is true
 * - Crafting: if any crafting job is true (or has crafting materials + crafting job)
 * - Vending, Traveling, Exploring: from boolean flags
 * - Special Weather: from specialWeather flags
 */
function computeObtainFromFlags(item) {
  const obtain = [];
  
  // Gathering: check if any gathering job is true
  // Gathering jobs: Farmer, Forager, Herbalist, Rancher, Miner, Beekeeper, Fisherman, Hunter
  const hasGatheringJob = item.farmer || item.forager || item.herbalist || item.rancher || 
                          item.miner || item.beekeeper || item.fisherman || item.hunter;
  if (hasGatheringJob) {
    obtain.push("Gathering");
  }
  
  // Looting: check if any looting job is true OR if any monster flag is true
  // Looting jobs: Adventurer, Graveskeeper, Guard, Mercenary, Scout, Hunter, Hunter (Looting)
  const hasLootingJob = item.adventurer || item.gravekeeper || item.guard || item.mercenary || 
                        item.scout || item.hunter || item.hunterLooting;
  const hasMonster = hasAnyMonsterFlag(item);
  if (hasLootingJob || hasMonster) {
    obtain.push("Looting");
  }
  
  // Crafting: check if any crafting job is true (or has crafting materials + crafting job)
  // Crafting jobs: Cook, Blacksmith, Craftsman, Mask Maker, Researcher, Weaver, Artist, Witch
  const hasCraftingMaterials = item.craftingMaterial && Array.isArray(item.craftingMaterial) && item.craftingMaterial.length > 0;
  const hasCraftingJob = item.cook || item.blacksmith || item.craftsman || item.maskMaker || 
                         item.researcher || item.weaver || item.artist || item.witch;
  if (hasCraftingJob || (hasCraftingMaterials && hasCraftingJob)) {
    obtain.push("Crafting");
  }
  
  // Vending, Traveling, Exploring: from boolean flags
  if (item.vending === true) {
    obtain.push("Vending");
  }
  if (item.traveling === true) {
    obtain.push("Travel");
  }
  if (item.exploring === true) {
    obtain.push("Exploring");
  }
  
  // Special Weather: check if any special weather is active (add as single "Special Weather" entry)
  if (item.specialWeather) {
    const hasSpecialWeather = Object.values(item.specialWeather).some(Boolean);
    if (hasSpecialWeather) {
      obtain.push("Special Weather");
    }
  }
  
  return obtain.sort(); // Sort for consistent comparison
}

/**
 * Compare two arrays (order-independent)
 */
function arraysEqual(arr1, arr2) {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;
  
  const sorted1 = [...arr1].sort();
  const sorted2 = [...arr2].sort();
  
  return sorted1.every((val, idx) => val === sorted2[idx]);
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('🔍 Starting Obtain Field Sync from Flags...\n');
  
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Fetch all items
    console.log('📦 Fetching all items...');
    const items = await Item.find({}).lean();
    console.log(`✅ Found ${items.length} items\n`);
    
    // Compute correct obtain for each item and find differences
    console.log('🔬 Analyzing items and computing obtain arrays...');
    const updates = [];
    
    for (const item of items) {
      const currentObtain = (item.obtain || []).filter(Boolean); // Remove empty strings
      const computedObtain = computeObtainFromFlags(item);
      
      // Compare arrays (order-independent)
      if (!arraysEqual(currentObtain, computedObtain)) {
        updates.push({
          itemId: item._id,
          itemName: item.itemName || 'Unknown',
          currentObtain: currentObtain.length > 0 ? currentObtain : ['(empty)'],
          computedObtain: computedObtain.length > 0 ? computedObtain : ['(empty)']
        });
      }
    }
    
    console.log(`✅ Found ${updates.length} items that need updates\n`);
    
    if (updates.length === 0) {
      console.log('✨ No updates needed! All items already have correct obtain arrays.\n');
      return;
    }
    
    // Show what will be updated (first 20 items)
    console.log('📋 Items to be updated (showing first 20):');
    console.log('-'.repeat(100));
    const displayCount = Math.min(updates.length, 20);
    for (let i = 0; i < displayCount; i++) {
      const update = updates[i];
      const currentStr = Array.isArray(update.currentObtain) ? update.currentObtain.join(', ') : update.currentObtain;
      const computedStr = Array.isArray(update.computedObtain) ? update.computedObtain.join(', ') : update.computedObtain;
      console.log(`  ${update.itemName.padEnd(40)}`);
      console.log(`    Current:  ${currentStr}`);
      console.log(`    Computed: ${computedStr}`);
      
      // Show what's being added/removed
      const currentSet = new Set(Array.isArray(update.currentObtain) ? update.currentObtain : []);
      const computedSet = new Set(Array.isArray(update.computedObtain) ? update.computedObtain : []);
      const added = [...computedSet].filter(x => !currentSet.has(x));
      const removed = [...currentSet].filter(x => !computedSet.has(x));
      if (added.length > 0) {
        console.log(`    ➕ Adding: ${added.join(', ')}`);
      }
      if (removed.length > 0) {
        console.log(`    ➖ Removing: ${removed.join(', ')}`);
      }
      console.log('');
    }
    if (updates.length > 20) {
      console.log(`  ... and ${updates.length - 20} more items`);
    }
    console.log('-'.repeat(100));
    console.log('');
    
    // Perform updates
    console.log('💾 Updating items in database...');
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        const result = await Item.updateOne(
          { _id: update.itemId },
          { $set: { obtain: update.computedObtain } }
        );
        if (result.modifiedCount > 0) {
          successCount++;
        } else {
          console.warn(`  ⚠️  No changes made to ${update.itemName} (may already be updated)`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating ${update.itemName}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Update complete!`);
    console.log(`   Successfully updated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
