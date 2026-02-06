// ============================================================================
// Item Rarity Audit Script
// ============================================================================
// Purpose: Audit all items and suggest rarity adjustments based on:
// - Obtain method
// - Number of jobs that can get it
// - Number of accessible vs. total locations
// - Crafting component rarities (for craftable items)
//
// Usage: node scripts/audit-item-rarity.js
// Output: audit-item-rarity.txt (in dashboard root)
// ============================================================================

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
// Minimal Item Schema (for querying only)
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
  // Location booleans
  centralHyrule: Boolean,
  eldin: Boolean,
  faron: Boolean,
  gerudo: Boolean,
  hebra: Boolean,
  lanayru: Boolean,
  pathOfScarletLeaves: Boolean,
  leafDewWay: Boolean,
  // Job booleans (we'll use allJobs primarily, but need these as fallback)
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
// Helper Functions
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
 * Format obtain methods as string
 */
function formatObtainMethods(item) {
  if (!item.obtain || !Array.isArray(item.obtain) || item.obtain.length === 0) {
    return 'None';
  }
  return item.obtain.filter(Boolean).join(', ');
}

/**
 * Analyze item and suggest rarity changes
 */
function analyzeItem(item, itemMap) {
  const jobCount = getJobCount(item);
  const locationList = getLocationList(item);
  const locationCount = locationList.includes('None') ? 0 : locationList.length;
  const accessibleLocationCount = getAccessibleLocationCount(item);
  const obtainMethods = formatObtainMethods(item);
  const isCraftable = item.crafting === true && item.craftingMaterial && item.craftingMaterial.length > 0;
  
  let maxComponentRarity = null;
  let componentRarities = [];
  
  // Resolve crafting materials if craftable
  if (isCraftable) {
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
  }
  
  // Calculate suggested rarity
  let suggestedRarity = item.itemRarity || 1;
  const currentRarity = item.itemRarity || 1;
  
  if (isCraftable) {
    // ============================================================================
    // CRAFTED ITEMS: Rarity based on components + jobs + regions + obtain methods
    // ============================================================================
    
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
    } else {
      // No component rarities found, start with current rarity
      suggestedRarity = currentRarity;
    }
    
    // Adjust based on crafting jobs (more jobs = potentially more common)
    // Count crafting jobs specifically
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
    // If it can ONLY be crafted (no other obtain methods), it might be rarer
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
    
  } else {
    // ============================================================================
    // NON-CRAFTED ITEMS: Original heuristics
    // ============================================================================
    
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
  }
  
  return {
    itemName: item.itemName || 'Unknown',
    currentRarity,
    suggestedRarity,
    isCraftable
  };
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('🔍 Starting Item Rarity Audit...\n');
  
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
    
    // Build item lookup maps (by _id and by name)
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
    
    // Analyze each item
    console.log('🔬 Analyzing items...');
    const results = [];
    
    for (const item of items) {
      const analysis = analyzeItem(item, itemMap);
      results.push(analysis);
    }
    
    console.log(`✅ Analyzed ${results.length} items\n`);
    
    // Separate non-crafted and crafted items
    const nonCraftedItems = results.filter(r => !r.isCraftable);
    const craftedItems = results.filter(r => r.isCraftable);
    
    // Separate items with changes and without changes for each group
    const nonCraftedWithChanges = nonCraftedItems.filter(r => r.currentRarity !== r.suggestedRarity);
    const nonCraftedUnchanged = nonCraftedItems.filter(r => r.currentRarity === r.suggestedRarity);
    const craftedWithChanges = craftedItems.filter(r => r.currentRarity !== r.suggestedRarity);
    const craftedUnchanged = craftedItems.filter(r => r.currentRarity === r.suggestedRarity);
    
    // Sort each group by item name for readability
    nonCraftedWithChanges.sort((a, b) => a.itemName.localeCompare(b.itemName));
    nonCraftedUnchanged.sort((a, b) => a.itemName.localeCompare(b.itemName));
    craftedWithChanges.sort((a, b) => a.itemName.localeCompare(b.itemName));
    craftedUnchanged.sort((a, b) => a.itemName.localeCompare(b.itemName));
    
    // Generate report
    console.log('📝 Generating report...');
    const reportLines = [];
    
    // Header
    reportLines.push('ITEM RARITY AUDIT REPORT');
    reportLines.push(`Generated: ${new Date().toISOString()}`);
    reportLines.push(`Total Items: ${items.length}`);
    reportLines.push(`Non-Crafted Items: ${nonCraftedItems.length} (${nonCraftedWithChanges.length} with changes)`);
    reportLines.push(`Crafted Items: ${craftedItems.length} (${craftedWithChanges.length} with changes)`);
    reportLines.push('');
    
    // Non-crafted items with changes first
    reportLines.push('='.repeat(80));
    reportLines.push('NON-CRAFTED ITEMS - WITH CHANGES');
    reportLines.push('='.repeat(80));
    reportLines.push('');
    
    for (const result of nonCraftedWithChanges) {
      const itemName = result.itemName || 'Unknown';
      const currentRarity = result.currentRarity || 1;
      const suggestedRarity = result.suggestedRarity || currentRarity;
      const changeSymbol = suggestedRarity > currentRarity ? '↑' : '↓';
      
      reportLines.push(`${itemName} - ${currentRarity} | ${suggestedRarity} ${changeSymbol}`);
    }
    
    reportLines.push('');
    reportLines.push('');
    
    // Non-crafted items without changes
    reportLines.push('='.repeat(80));
    reportLines.push('NON-CRAFTED ITEMS - NO CHANGES');
    reportLines.push('='.repeat(80));
    reportLines.push('');
    
    for (const result of nonCraftedUnchanged) {
      const itemName = result.itemName || 'Unknown';
      const currentRarity = result.currentRarity || 1;
      const suggestedRarity = result.suggestedRarity || currentRarity;
      
      reportLines.push(`${itemName} - ${currentRarity} | ${suggestedRarity}`);
    }
    
    reportLines.push('');
    reportLines.push('');
    
    // Crafted items with changes
    reportLines.push('='.repeat(80));
    reportLines.push('CRAFTED ITEMS - WITH CHANGES');
    reportLines.push('='.repeat(80));
    reportLines.push('');
    
    for (const result of craftedWithChanges) {
      const itemName = result.itemName || 'Unknown';
      const currentRarity = result.currentRarity || 1;
      const suggestedRarity = result.suggestedRarity || currentRarity;
      const changeSymbol = suggestedRarity > currentRarity ? '↑' : '↓';
      
      reportLines.push(`${itemName} - ${currentRarity} | ${suggestedRarity} ${changeSymbol}`);
    }
    
    reportLines.push('');
    reportLines.push('');
    
    // Crafted items without changes
    reportLines.push('='.repeat(80));
    reportLines.push('CRAFTED ITEMS - NO CHANGES');
    reportLines.push('='.repeat(80));
    reportLines.push('');
    
    for (const result of craftedUnchanged) {
      const itemName = result.itemName || 'Unknown';
      const currentRarity = result.currentRarity || 1;
      const suggestedRarity = result.suggestedRarity || currentRarity;
      
      reportLines.push(`${itemName} - ${currentRarity} | ${suggestedRarity}`);
    }
    
    // Write to file
    const outputPath = path.join(__dirname, '..', 'audit-item-rarity.txt');
    const reportText = reportLines.join('\n');
    fs.writeFileSync(outputPath, reportText, 'utf8');
    
    // Count changes
    const totalChanged = nonCraftedWithChanges.length + craftedWithChanges.length;
    const totalUnchanged = nonCraftedUnchanged.length + craftedUnchanged.length;
    
    console.log(`✅ Report written to: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Total Items: ${results.length}`);
    console.log(`   Non-Crafted with changes: ${nonCraftedWithChanges.length}`);
    console.log(`   Non-Crafted unchanged: ${nonCraftedUnchanged.length}`);
    console.log(`   Crafted with changes: ${craftedWithChanges.length}`);
    console.log(`   Crafted unchanged: ${craftedUnchanged.length}`);
    console.log(`   Total with changes: ${totalChanged}`);
    console.log(`   Total unchanged: ${totalUnchanged}`);
    
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
