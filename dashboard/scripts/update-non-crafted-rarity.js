// ============================================================================
// Update Non-Crafted Item Rarity Script
// ============================================================================
// Purpose: Update rarity for non-crafted items based on audit heuristics
// - Only updates non-crafted items (crafted items will be updated separately)
// - Uses the same heuristics as the audit script
//
// Usage: node scripts/update-non-crafted-rarity.js
// ============================================================================

const mongoose = require('mongoose');

// Try to load dotenv if available (optional)
try {
  require('dotenv').config();
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

// Accessible locations (currently available in game)
const ACCESSIBLE_LOCATIONS = new Set([
  'eldin',
  'lanayru',
  'faron',
  'pathOfScarletLeaves',
  'leafDewWay'
]);

// Location field names to display names mapping
const LOCATION_DISPLAY_NAMES = {
  centralHyrule: 'Central Hyrule',
  eldin: 'Eldin',
  faron: 'Faron',
  gerudo: 'Gerudo',
  hebra: 'Hebra',
  lanayru: 'Lanayru',
  pathOfScarletLeaves: 'Path of Scarlet Leaves',
  leafDewWay: 'Leaf Dew Way'
};

// Job boolean field names (from ItemModel)
const JOB_FIELDS = [
  'adventurer',
  'artist',
  'beekeeper',
  'blacksmith',
  'cook',
  'craftsman',
  'farmer',
  'fisherman',
  'forager',
  'gravekeeper',
  'guard',
  'maskMaker',
  'rancher',
  'herbalist',
  'hunter',
  'hunterLooting',
  'mercenary',
  'miner',
  'researcher',
  'scout',
  'weaver',
  'witch'
];

// ============================================================================
// Minimal Item Schema (for querying and updating)
// ============================================================================

const ItemSchema = new mongoose.Schema({
  itemName: String,
  itemRarity: Number,
  obtain: [String],
  allJobs: [String],
  locations: [String],
  crafting: Boolean,
  craftingMaterial: [mongoose.Schema.Types.Mixed],
  // Location booleans
  centralHyrule: Boolean,
  eldin: Boolean,
  faron: Boolean,
  gerudo: Boolean,
  hebra: Boolean,
  lanayru: Boolean,
  pathOfScarletLeaves: Boolean,
  leafDewWay: Boolean,
  // Job booleans
  adventurer: Boolean,
  artist: Boolean,
  beekeeper: Boolean,
  blacksmith: Boolean,
  cook: Boolean,
  craftsman: Boolean,
  farmer: Boolean,
  fisherman: Boolean,
  forager: Boolean,
  gravekeeper: Boolean,
  guard: Boolean,
  maskMaker: Boolean,
  rancher: Boolean,
  herbalist: Boolean,
  hunter: Boolean,
  hunterLooting: Boolean,
  mercenary: Boolean,
  miner: Boolean,
  researcher: Boolean,
  scout: Boolean,
  weaver: Boolean,
  witch: Boolean
}, { collection: 'items', strict: false });

const Item = mongoose.model('Item', ItemSchema);

// ============================================================================
// Helper Functions (same as audit script)
// ============================================================================

/**
 * Get job count from item
 */
function getJobCount(item) {
  if (item.allJobs && Array.isArray(item.allJobs) && item.allJobs.length > 0 && !item.allJobs.includes('None')) {
    return item.allJobs.length;
  }
  
  // Fallback: count job boolean flags
  let count = 0;
  for (const field of JOB_FIELDS) {
    if (item[field] === true) {
      count++;
    }
  }
  return count;
}

/**
 * Get location list from item
 */
function getLocationList(item) {
  if (item.locations && Array.isArray(item.locations) && item.locations.length > 0) {
    return item.locations.filter(Boolean);
  }
  
  // Fallback: build from boolean flags
  const locations = [];
  for (const [field, displayName] of Object.entries(LOCATION_DISPLAY_NAMES)) {
    if (item[field] === true) {
      locations.push(displayName);
    }
  }
  return locations.length > 0 ? locations : ['None'];
}

/**
 * Get accessible location count
 */
function getAccessibleLocationCount(item) {
  // If locations array is used, check it directly
  if (item.locations && Array.isArray(item.locations) && item.locations.length > 0) {
    const accessibleDisplayNames = new Set([
      'Eldin',
      'Lanayru',
      'Faron',
      'Path of Scarlet Leaves',
      'Leaf Dew Way'
    ]);
    
    let count = 0;
    for (const loc of item.locations) {
      if (loc && accessibleDisplayNames.has(loc)) {
        count++;
      }
    }
    return count;
  }
  
  // Fallback: count boolean flags that are accessible
  let count = 0;
  for (const [field, displayName] of Object.entries(LOCATION_DISPLAY_NAMES)) {
    if (item[field] === true && ACCESSIBLE_LOCATIONS.has(field)) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate suggested rarity for non-crafted items
 */
function calculateSuggestedRarity(item) {
  const jobCount = getJobCount(item);
  const locationList = getLocationList(item);
  const locationCount = locationList.includes('None') ? 0 : locationList.length;
  const accessibleLocationCount = getAccessibleLocationCount(item);
  const isCraftable = item.crafting === true && item.craftingMaterial && item.craftingMaterial.length > 0;
  
  // Skip crafted items
  if (isCraftable) {
    return item.itemRarity || 1;
  }
  
  // Calculate suggested rarity
  let suggestedRarity = item.itemRarity || 1;
  const currentRarity = item.itemRarity || 1;
  
  // Check: Only in inaccessible locations - suggest higher rarity
  if (accessibleLocationCount === 0 && locationCount > 0) {
    suggestedRarity = Math.max(suggestedRarity, Math.min(currentRarity + 2, 10));
  }
  
  // Check: Many jobs + many accessible locations but high rarity - suggest lower
  if (jobCount >= 3 && accessibleLocationCount >= 2 && currentRarity >= 4) {
    suggestedRarity = Math.min(suggestedRarity, Math.max(currentRarity - 1, 1));
  }
  
  // Check: Very few jobs or one location but low rarity - suggest higher
  if (jobCount === 1 && accessibleLocationCount === 1 && currentRarity <= 2) {
    suggestedRarity = Math.max(suggestedRarity, Math.min(currentRarity + 1, 10));
  }
  
  // Additional heuristics based on job count and locations
  // More jobs = potentially more common (lower rarity)
  if (jobCount >= 5 && accessibleLocationCount >= 3 && currentRarity >= 3) {
    suggestedRarity = Math.min(suggestedRarity, Math.max(currentRarity - 1, 1));
  }
  
  // Fewer jobs and locations = potentially rarer
  if (jobCount <= 2 && accessibleLocationCount <= 1 && currentRarity <= 3) {
    suggestedRarity = Math.max(suggestedRarity, Math.min(currentRarity + 1, 10));
  }
  
  return suggestedRarity;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('🔍 Starting Non-Crafted Item Rarity Update...\n');
  
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
    
    // Filter non-crafted items and calculate changes
    console.log('🔬 Analyzing non-crafted items...');
    const updates = [];
    
    for (const item of items) {
      const isCraftable = item.crafting === true && item.craftingMaterial && item.craftingMaterial.length > 0;
      
      // Skip crafted items
      if (isCraftable) {
        continue;
      }
      
      const currentRarity = item.itemRarity || 1;
      const suggestedRarity = calculateSuggestedRarity(item);
      
      // Only add to updates if rarity would change
      if (currentRarity !== suggestedRarity) {
        updates.push({
          itemId: item._id,
          itemName: item.itemName || 'Unknown',
          currentRarity,
          suggestedRarity
        });
      }
    }
    
    console.log(`✅ Found ${updates.length} non-crafted items that need updates\n`);
    
    if (updates.length === 0) {
      console.log('✨ No updates needed! All non-crafted items are already at their suggested rarities.\n');
      return;
    }
    
    // Show what will be updated
    console.log('📋 Items to be updated:');
    console.log('-'.repeat(80));
    for (const update of updates) {
      const changeSymbol = update.suggestedRarity > update.currentRarity ? '↑' : '↓';
      console.log(`  ${update.itemName.padEnd(40)} ${update.currentRarity} → ${update.suggestedRarity} ${changeSymbol}`);
    }
    console.log('-'.repeat(80));
    console.log('');
    
    // Perform updates
    console.log('💾 Updating items in database...');
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        await Item.updateOne(
          { _id: update.itemId },
          { $set: { itemRarity: update.suggestedRarity } }
        );
        successCount++;
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
