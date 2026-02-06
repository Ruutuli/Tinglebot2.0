// ============================================================================
// Update Crafted Item Rarity Script
// ============================================================================
// Purpose: Update rarity for crafted items based on audit heuristics
// - Only updates crafted items (non-crafted items should be updated separately)
// - Uses the same heuristics as the audit script
// - Considers component rarities, crafting jobs, regions, and obtain methods
//
// Usage: node scripts/update-crafted-rarity.js
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

// ============================================================================
// Minimal Item Schema (for querying and updating)
// ============================================================================

const CraftingMaterialSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  itemName: String,
  quantity: Number
}, { _id: false });

const ItemSchema = new mongoose.Schema({
  itemName: String,
  itemRarity: Number,
  obtain: [String],
  allJobs: [String],
  locations: [String],
  crafting: Boolean,
  craftingMaterial: [CraftingMaterialSchema],
  craftingJobs: [String],
  // Location booleans
  centralHyrule: Boolean,
  eldin: Boolean,
  faron: Boolean,
  gerudo: Boolean,
  hebra: Boolean,
  lanayru: Boolean,
  pathOfScarletLeaves: Boolean,
  leafDewWay: Boolean
}, { collection: 'items', strict: false });

const Item = mongoose.model('Item', ItemSchema);

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Calculate suggested rarity for crafted items
 */
function calculateSuggestedRarity(item, itemMap) {
  const isCraftable = item.crafting === true && item.craftingMaterial && item.craftingMaterial.length > 0;
  
  // Skip non-crafted items
  if (!isCraftable) {
    return item.itemRarity || 1;
  }
  
  const locationList = getLocationList(item);
  const locationCount = locationList.includes('None') ? 0 : locationList.length;
  const accessibleLocationCount = getAccessibleLocationCount(item);
  const currentRarity = item.itemRarity || 1;
  
  // Resolve crafting materials
  let maxComponentRarity = null;
  let componentRarities = [];
  
  for (const material of item.craftingMaterial) {
    if (!material) continue;
    
    let materialItem = null;
    
    // Try to find by _id first (handle both ObjectId objects and strings)
    if (material._id) {
      const idString = material._id.toString ? material._id.toString() : String(material._id);
      materialItem = itemMap.byId.get(idString);
    }
    
    // Fallback to itemName (case-insensitive)
    if (!materialItem && material.itemName) {
      materialItem = itemMap.byName.get(material.itemName.toLowerCase());
    }
    
    if (materialItem && materialItem.itemRarity !== undefined && materialItem.itemRarity !== null) {
      componentRarities.push(materialItem.itemRarity);
    }
  }
  
  if (componentRarities.length > 0) {
    maxComponentRarity = Math.max(...componentRarities);
  }
  
  // Calculate suggested rarity based on components + jobs + regions + obtain methods
  let suggestedRarity = currentRarity;
  
  // Start with component rarity as baseline
  if (maxComponentRarity !== null && componentRarities.length > 0) {
    // Calculate average component rarity
    const avgComponentRarity = componentRarities.reduce((a, b) => a + b, 0) / componentRarities.length;
    
    // Base rarity should be at least the max component rarity
    suggestedRarity = maxComponentRarity;
    
    // If average is significantly lower than max (wide spread), crafted item might be slightly rarer
    if (maxComponentRarity - avgComponentRarity >= 2 && componentRarities.length > 1) {
      // Components have wide rarity spread - crafted item might be max + 1
      suggestedRarity = Math.min(maxComponentRarity + 1, 10);
    } else if (componentRarities.length > 1 && Math.abs(maxComponentRarity - avgComponentRarity) < 1) {
      // Components are similar in rarity - crafted item might be max or max + 1
      suggestedRarity = Math.min(maxComponentRarity + 1, 10);
    }
  }
  
  // Adjust based on crafting jobs (more jobs = potentially more common)
  const craftingJobCount = item.craftingJobs && Array.isArray(item.craftingJobs) 
    ? item.craftingJobs.filter(j => j && j !== 'None').length 
    : 0;
  
  if (craftingJobCount >= 3 && suggestedRarity >= 3) {
    // Many jobs can craft it - might be slightly more common
    suggestedRarity = Math.max(1, suggestedRarity - 1);
  } else if (craftingJobCount === 1 && suggestedRarity <= 3) {
    // Only one job can craft it - might be rarer
    suggestedRarity = Math.min(10, suggestedRarity + 1);
  }
  
  // Adjust based on accessible regions (more regions = potentially more common)
  if (accessibleLocationCount >= 3 && suggestedRarity >= 3) {
    // Available in many accessible regions
    suggestedRarity = Math.max(1, suggestedRarity - 1);
  } else if (accessibleLocationCount === 0 && locationCount > 0) {
    // Only in inaccessible regions - should be rarer
    suggestedRarity = Math.min(10, suggestedRarity + 2);
  } else if (accessibleLocationCount <= 1 && suggestedRarity <= 4) {
    // Very limited regions
    suggestedRarity = Math.min(10, suggestedRarity + 1);
  }
  
  // Adjust based on obtain methods
  const obtainMethodsList = item.obtain || [];
  const onlyCraftable = obtainMethodsList.length === 1 && obtainMethodsList.includes('Crafting');
  
  if (onlyCraftable && suggestedRarity <= 4) {
    // Only obtainable through crafting - might be rarer
    suggestedRarity = Math.min(10, suggestedRarity + 1);
  } else if (obtainMethodsList.length > 2 && suggestedRarity >= 3) {
    // Can be obtained multiple ways - might be more common
    suggestedRarity = Math.max(1, suggestedRarity - 1);
  }
  
  // Ensure crafted items are never rarer than their hardest component
  if (maxComponentRarity !== null && suggestedRarity < maxComponentRarity) {
    suggestedRarity = maxComponentRarity;
  }
  
  return suggestedRarity;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('🔍 Starting Crafted Item Rarity Update...\n');
  
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
    
    // Build item lookup maps (by _id and by name) for resolving crafting materials
    console.log('🗺️  Building item lookup maps...');
    const itemMap = {
      byId: new Map(),
      byName: new Map()
    };
    
    for (const item of items) {
      if (item._id) {
        itemMap.byId.set(item._id.toString(), item);
      }
      if (item.itemName) {
        itemMap.byName.set(item.itemName.toLowerCase(), item);
      }
    }
    console.log(`✅ Built maps: ${itemMap.byId.size} by ID, ${itemMap.byName.size} by name\n`);
    
    // Filter crafted items and calculate changes
    console.log('🔬 Analyzing crafted items...');
    const updates = [];
    
    for (const item of items) {
      const isCraftable = item.crafting === true && item.craftingMaterial && item.craftingMaterial.length > 0;
      
      // Skip non-crafted items
      if (!isCraftable) {
        continue;
      }
      
      const currentRarity = item.itemRarity || 1;
      const suggestedRarity = calculateSuggestedRarity(item, itemMap);
      
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
    
    console.log(`✅ Found ${updates.length} crafted items that need updates\n`);
    
    if (updates.length === 0) {
      console.log('✨ No updates needed! All crafted items are already at their suggested rarities.\n');
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
