// ============================================================================
// LIST ALL ITEMS SCRIPT
// ============================================================================
// This script fetches all items from the database and outputs them in a
// format that's easy to analyze for village materials selection.
//
// Usage:
//   node scripts/listAllItems.js
//
// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');
const fs = require('fs');

// ============================================================================
// ---- Database Configuration ----
// ============================================================================
const dbConfig = require('../shared/config/database');
const ItemModel = require('../shared/models/ItemModel');

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: getRegion -------------------
function getRegion(item) {
    const regions = [];
    if (item.eldin) regions.push('Eldin');
    if (item.lanayru) regions.push('Lanayru');
    if (item.faron) regions.push('Faron');
    if (item.gerudo) regions.push('Gerudo');
    if (item.hebra) regions.push('Hebra');
    if (item.centralHyrule) regions.push('Central');
    return regions.length > 0 ? regions.join(', ') : 'None';
}

// ------------------- Function: formatItemForOutput -------------------
function formatItemForOutput(item, index) {
    const emoji = item.emoji || '❓';
    const rarity = '⭐'.repeat(item.itemRarity || 1);
    const categories = item.category?.join(', ') || 'Misc';
    const types = item.type?.join(', ') || 'Unknown';
    const region = getRegion(item);
    const gathering = item.gathering ? '✓' : '✗';
    const looting = item.looting ? '✓' : '✗';
    const crafting = item.crafting ? '✓' : '✗';
    
    return {
        index: index + 1,
        name: item.itemName,
        emoji: emoji,
        rarity: item.itemRarity || 1,
        categories: categories,
        types: types,
        region: region,
        gathering: gathering,
        looting: looting,
        crafting: crafting,
        stackable: item.stackable ? 'Yes' : 'No',
        buyPrice: item.buyPrice || 0,
        sellPrice: item.sellPrice || 0
    };
}

// ------------------- Function: groupByCategory -------------------
function groupByCategory(items) {
    const grouped = {};
    items.forEach(item => {
        const primaryCategory = item.category?.[0] || 'Misc';
        if (!grouped[primaryCategory]) {
            grouped[primaryCategory] = [];
        }
        grouped[primaryCategory].push(item);
    });
    return grouped;
}

// ------------------- Function: groupByRegion -------------------
function groupByRegion(items) {
    const grouped = {
        'Eldin': [],
        'Lanayru': [],
        'Faron': [],
        'Gerudo': [],
        'Hebra': [],
        'Central Hyrule': [],
        'Multiple': [],
        'None': []
    };
    
    items.forEach(item => {
        const regions = [];
        if (item.eldin) regions.push('Eldin');
        if (item.lanayru) regions.push('Lanayru');
        if (item.faron) regions.push('Faron');
        if (item.gerudo) regions.push('Gerudo');
        if (item.hebra) regions.push('Hebra');
        if (item.centralHyrule) regions.push('Central Hyrule');
        
        if (regions.length === 0) {
            grouped['None'].push(item);
        } else if (regions.length === 1) {
            grouped[regions[0]].push(item);
        } else {
            grouped['Multiple'].push(item);
        }
    });
    
    return grouped;
}

// ------------------- Function: outputItems -------------------
function outputItems(items, filename) {
    const output = [];
    
    // Summary
    output.push('='.repeat(100));
    output.push('ALL ITEMS FROM DATABASE');
    output.push('='.repeat(100));
    output.push(`Total Items: ${items.length}`);
    output.push('');
    
    // Group by category
    const byCategory = groupByCategory(items);
    output.push('ITEMS BY CATEGORY:');
    output.push('-'.repeat(100));
    Object.keys(byCategory).sort().forEach(cat => {
        output.push(`${cat}: ${byCategory[cat].length} items`);
    });
    output.push('');
    
    // Group by region
    const byRegion = groupByRegion(items);
    output.push('ITEMS BY REGION:');
    output.push('-'.repeat(100));
    Object.keys(byRegion).forEach(region => {
        if (byRegion[region].length > 0) {
            output.push(`${region}: ${byRegion[region].length} items`);
        }
    });
    output.push('');
    
    // All items
    output.push('='.repeat(100));
    output.push('ALL ITEMS (DETAILED):');
    output.push('='.repeat(100));
    output.push('');
    
    items.forEach((item, index) => {
        const formatted = formatItemForOutput(item, index);
        output.push(`${formatted.index}. ${formatted.emoji} ${formatted.name}`);
        output.push(`   Rarity: ${'⭐'.repeat(formatted.rarity)} | Categories: ${formatted.categories}`);
        output.push(`   Types: ${formatted.types} | Region: ${formatted.region}`);
        output.push(`   Gathering: ${formatted.gathering} | Looting: ${formatted.looting} | Crafting: ${formatted.crafting}`);
        output.push(`   Stackable: ${formatted.stackable} | Buy: ${formatted.buyPrice} | Sell: ${formatted.sellPrice}`);
        output.push('');
    });
    
    // Save to file
    const content = output.join('\n');
    fs.writeFileSync(filename, content);
    console.log(`✓ Output saved to ${filename}`);
    
    return content;
}

// ============================================================================
// ---- Main Function ----
// ============================================================================
async function main() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(dbConfig.tinglebot, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✓ Connected to database\n');
        
        // Fetch all items
        console.log('Fetching all items...');
        const allItems = await ItemModel.find({}).lean().sort({ itemName: 1 });
        console.log(`✓ Found ${allItems.length} items\n`);
        
        // Output items
        const filename = `all_items_${Date.now()}.txt`;
        const content = outputItems(allItems, filename);
        
        // Also output JSON for easier processing
        const jsonFilename = `all_items_${Date.now()}.json`;
        const jsonData = allItems.map((item, index) => formatItemForOutput(item, index));
        fs.writeFileSync(jsonFilename, JSON.stringify(jsonData, null, 2));
        console.log(`✓ JSON output saved to ${jsonFilename}`);
        
        // Display summary
        console.log('\n' + '='.repeat(100));
        console.log('SUMMARY');
        console.log('='.repeat(100));
        console.log(`Total Items: ${allItems.length}`);
        
        const byCategory = groupByCategory(allItems);
        console.log('\nBy Category:');
        Object.keys(byCategory).sort().forEach(cat => {
            console.log(`  ${cat}: ${byCategory[cat].length} items`);
        });
        
        const byRegion = groupByRegion(allItems);
        console.log('\nBy Region:');
        Object.keys(byRegion).forEach(region => {
            if (byRegion[region].length > 0) {
                console.log(`  ${region}: ${byRegion[region].length} items`);
            }
        });
        
        // Show potential material candidates
        console.log('\n' + '='.repeat(100));
        console.log('POTENTIAL VILLAGE MATERIAL CANDIDATES:');
        console.log('='.repeat(100));
        
        // Materials that are stackable, have gathering/looting, and are common
        const candidates = allItems.filter(item => 
            item.stackable && 
            (item.gathering || item.looting) && 
            (item.itemRarity <= 3) &&
            (item.type?.some(t => t.toLowerCase().includes('material')) || 
             item.category?.some(c => c.toLowerCase().includes('material')))
        );
        
        console.log(`\nStackable Materials (Gathering/Looting, Rarity ≤3): ${candidates.length} items`);
        candidates.slice(0, 50).forEach((item, index) => {
            console.log(`${index + 1}. ${item.emoji || '❓'} ${item.itemName} (${getRegion(item)})`);
        });
        if (candidates.length > 50) {
            console.log(`... and ${candidates.length - 50} more`);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n✓ Database connection closed');
        process.exit(0);
    }
}

// Run the script
main();
