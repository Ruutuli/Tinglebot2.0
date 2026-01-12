// ============================================================================
// VILLAGE MATERIALS SELECTOR SCRIPT
// ============================================================================
// This script helps you select items from the database to use as village
// upgrade materials. It provides an interactive interface to browse, filter,
// and select items, then generates the proper format for VillageModel.js
//
// Usage:
//   node scripts/selectVillageMaterials.js
//
// Features:
//   - View all items (paginated)
//   - Filter by category
//   - Filter by region (Eldin, Lanayru, Faron, etc.)
//   - Interactive selection with multiple input formats
//   - Generate VillageModel.js config format
//   - Save output to file
//
// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');
const readline = require('readline');

// ============================================================================
// ---- Database Configuration ----
// ============================================================================
const dbConfig = require('../shared/config/database');
const ItemModel = require('../shared/models/ItemModel');

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: createInterface -------------------
// Creates readline interface for user input
function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// ------------------- Function: question -------------------
// Prompts user with a question and returns a promise
function question(rl, query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// ------------------- Function: formatItemDisplay -------------------
// Formats an item for display
function formatItemDisplay(item, index) {
    const emoji = item.emoji || '❓';
    const rarity = '⭐'.repeat(item.itemRarity || 1);
    const categories = item.category?.join(', ') || 'Misc';
    const types = item.type?.join(', ') || 'Unknown';
    const region = [];
    if (item.eldin) region.push('Eldin');
    if (item.lanayru) region.push('Lanayru');
    if (item.faron) region.push('Faron');
    if (item.gerudo) region.push('Gerudo');
    if (item.hebra) region.push('Hebra');
    if (item.centralHyrule) region.push('Central');
    const regionStr = region.length > 0 ? `[${region.join(', ')}]` : '';
    
    return `${index + 1}. ${emoji} **${item.itemName}** ${rarity}\n   Categories: ${categories} | Types: ${types} ${regionStr}`;
}

// ------------------- Function: groupItemsByCategory -------------------
// Groups items by their primary category
function groupItemsByCategory(items) {
    const grouped = {};
    
    items.forEach(item => {
        const primaryCategory = item.category?.[0] || 'Misc';
        if (!grouped[primaryCategory]) {
            grouped[primaryCategory] = [];
        }
        grouped[primaryCategory].push(item);
    });
    
    // Sort categories alphabetically
    const sortedCategories = Object.keys(grouped).sort();
    const sortedGrouped = {};
    sortedCategories.forEach(cat => {
        sortedGrouped[cat] = grouped[cat].sort((a, b) => a.itemName.localeCompare(b.itemName));
    });
    
    return sortedGrouped;
}

// ------------------- Function: groupItemsByRegion -------------------
// Groups items by region
function groupItemsByRegion(items) {
    const grouped = {
        'Eldin': [],
        'Lanayru': [],
        'Faron': [],
        'Gerudo': [],
        'Hebra': [],
        'Central Hyrule': [],
        'Multiple Regions': [],
        'No Region': []
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
            grouped['No Region'].push(item);
        } else if (regions.length === 1) {
            grouped[regions[0]].push(item);
        } else {
            grouped['Multiple Regions'].push(item);
        }
    });
    
    // Sort items within each region
    Object.keys(grouped).forEach(region => {
        grouped[region].sort((a, b) => a.itemName.localeCompare(b.itemName));
    });
    
    return grouped;
}

// ------------------- Function: displayItems -------------------
// Displays items in pages
async function displayItems(rl, items, pageSize = 20) {
    const totalPages = Math.ceil(items.length / pageSize);
    let currentPage = 0;
    
    while (currentPage < totalPages) {
        const start = currentPage * pageSize;
        const end = Math.min(start + pageSize, items.length);
        const pageItems = items.slice(start, end);
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Page ${currentPage + 1} of ${totalPages} (Items ${start + 1}-${end} of ${items.length})`);
        console.log('='.repeat(80));
        
        pageItems.forEach((item, index) => {
            console.log(formatItemDisplay(item, start + index));
        });
        
        if (currentPage < totalPages - 1) {
            const next = await question(rl, `\nPress Enter for next page, or type 'q' to quit viewing: `);
            if (next.toLowerCase() === 'q') break;
            currentPage++;
        } else {
            break;
        }
    }
}

// ------------------- Function: selectItems -------------------
// Interactive item selection
async function selectItems(rl, items) {
    const selected = [];
    const itemMap = new Map(items.map((item, index) => [index + 1, item]));
    
    console.log('\n' + '='.repeat(80));
    console.log('ITEM SELECTION MODE');
    console.log('='.repeat(80));
    console.log('Commands:');
    console.log('  - Enter item numbers (e.g., "1 5 10" or "1-5" or "1,5,10")');
    console.log('  - Type "list" to see all items again');
    console.log('  - Type "selected" to see your current selections');
    console.log('  - Type "remove <number>" to remove an item');
    console.log('  - Type "filter <category>" to filter by category');
    console.log('  - Type "region <region>" to filter by region (Eldin, Lanayru, Faron)');
    console.log('  - Type "done" when finished selecting');
    console.log('='.repeat(80));
    
    let filteredItems = items;
    let filteredMap = itemMap;
    
    while (true) {
        const input = await question(rl, `\nEnter command or item numbers: `);
        const trimmed = input.trim().toLowerCase();
        
        if (trimmed === 'done') {
            break;
        }
        
        if (trimmed === 'list') {
            await displayItems(rl, filteredItems);
            continue;
        }
        
        if (trimmed === 'selected') {
            if (selected.length === 0) {
                console.log('\nNo items selected yet.');
            } else {
                console.log('\n' + '='.repeat(80));
                console.log('SELECTED ITEMS:');
                console.log('='.repeat(80));
                selected.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.emoji || '❓'} ${item.itemName}`);
                });
            }
            continue;
        }
        
        if (trimmed.startsWith('remove ')) {
            const num = parseInt(trimmed.replace('remove ', ''));
            if (isNaN(num) || num < 1 || num > selected.length) {
                console.log('Invalid selection number.');
                continue;
            }
            const removed = selected.splice(num - 1, 1)[0];
            console.log(`Removed: ${removed.itemName}`);
            continue;
        }
        
        if (trimmed.startsWith('filter ')) {
            const category = trimmed.replace('filter ', '').trim();
            filteredItems = items.filter(item => 
                item.category?.some(cat => cat.toLowerCase().includes(category.toLowerCase()))
            );
            filteredMap = new Map(filteredItems.map((item, index) => {
                const originalIndex = items.indexOf(item);
                return [originalIndex + 1, item];
            }));
            console.log(`\nFiltered to ${filteredItems.length} items in category "${category}"`);
            await displayItems(rl, filteredItems);
            continue;
        }
        
        if (trimmed.startsWith('region ')) {
            const region = trimmed.replace('region ', '').trim().toLowerCase();
            filteredItems = items.filter(item => {
                if (region === 'eldin') return item.eldin;
                if (region === 'lanayru') return item.lanayru;
                if (region === 'faron') return item.faron;
                if (region === 'gerudo') return item.gerudo;
                if (region === 'hebra') return item.hebra;
                if (region === 'central') return item.centralHyrule;
                return false;
            });
            filteredMap = new Map(filteredItems.map((item, index) => {
                const originalIndex = items.indexOf(item);
                return [originalIndex + 1, item];
            }));
            console.log(`\nFiltered to ${filteredItems.length} items in region "${region}"`);
            await displayItems(rl, filteredItems);
            continue;
        }
        
        // Parse item numbers
        const numbers = [];
        if (trimmed.includes('-')) {
            // Range format: "1-5"
            const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    numbers.push(i);
                }
            }
        } else {
            // Comma or space separated: "1,5,10" or "1 5 10"
            const parts = trimmed.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            numbers.push(...parts);
        }
        
        // Add selected items
        for (const num of numbers) {
            const item = filteredMap.get(num);
            if (item) {
                if (!selected.find(s => s.itemName === item.itemName)) {
                    selected.push(item);
                    console.log(`✓ Added: ${item.emoji || '❓'} ${item.itemName}`);
                } else {
                    console.log(`⚠ Already selected: ${item.itemName}`);
                }
            } else {
                console.log(`⚠ Invalid item number: ${num}`);
            }
        }
    }
    
    return selected;
}

// ------------------- Function: generateVillageConfig -------------------
// Generates village config format for selected items
function generateVillageConfig(selectedItems, villageName) {
    const config = {};
    
    selectedItems.forEach(item => {
        config[item.itemName] = { 
            required: { 
                2: 0,  // Level 2 requirement (to be filled in)
                3: 0   // Level 3 requirement (to be filled in)
            } 
        };
    });
    
    return config;
}

// ------------------- Function: formatOutput -------------------
// Formats the output for VillageModel.js
function formatOutput(selectedItems, villageName) {
    const config = generateVillageConfig(selectedItems, villageName);
    const entries = Object.entries(config);
    
    let output = `        materials: {\n`;
    entries.forEach(([itemName, config], index) => {
        const item = selectedItems.find(i => i.itemName === itemName);
        const emoji = item?.emoji || '❓';
        const comma = index < entries.length - 1 ? ',' : '';
        output += `            "${itemName}": { required: { 2: 0, 3: 0 } }${comma} // ${emoji}\n`;
    });
    output += `        },`;
    
    return output;
}

// ============================================================================
// ---- Main Function ----
// ============================================================================
async function main() {
    const rl = createInterface();
    
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
        
        // Display menu
        console.log('='.repeat(80));
        console.log('VILLAGE MATERIALS SELECTOR');
        console.log('='.repeat(80));
        console.log('1. View all items (paginated)');
        console.log('2. View items by category');
        console.log('3. View items by region');
        console.log('4. Select items for village materials');
        console.log('5. Exit');
        console.log('='.repeat(80));
        
        let selectedItems = [];
        
        while (true) {
            const choice = await question(rl, '\nEnter your choice (1-5): ');
            
            if (choice === '1') {
                await displayItems(rl, allItems);
            } else if (choice === '2') {
                const grouped = groupItemsByCategory(allItems);
                const categories = Object.keys(grouped);
                console.log('\nAvailable categories:');
                categories.forEach((cat, index) => {
                    console.log(`${index + 1}. ${cat} (${grouped[cat].length} items)`);
                });
                const catChoice = await question(rl, '\nEnter category number or name: ');
                const catIndex = parseInt(catChoice) - 1;
                const selectedCat = !isNaN(catIndex) && catIndex >= 0 && catIndex < categories.length
                    ? categories[catIndex]
                    : catChoice;
                if (grouped[selectedCat]) {
                    await displayItems(rl, grouped[selectedCat]);
                } else {
                    console.log('Invalid category.');
                }
            } else if (choice === '3') {
                const grouped = groupItemsByRegion(allItems);
                const regions = Object.keys(grouped);
                console.log('\nAvailable regions:');
                regions.forEach((region, index) => {
                    console.log(`${index + 1}. ${region} (${grouped[region].length} items)`);
                });
                const regChoice = await question(rl, '\nEnter region number or name: ');
                const regIndex = parseInt(regChoice) - 1;
                const selectedReg = !isNaN(regIndex) && regIndex >= 0 && regIndex < regions.length
                    ? regions[regIndex]
                    : regChoice;
                if (grouped[selectedReg]) {
                    await displayItems(rl, grouped[selectedReg]);
                } else {
                    console.log('Invalid region.');
                }
            } else if (choice === '4') {
                selectedItems = await selectItems(rl, allItems);
                console.log(`\n✓ Selected ${selectedItems.length} items`);
            } else if (choice === '5') {
                break;
            } else {
                console.log('Invalid choice.');
            }
        }
        
        // Generate output
        if (selectedItems.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('SELECTED ITEMS SUMMARY');
            console.log('='.repeat(80));
            selectedItems.forEach((item, index) => {
                console.log(`${index + 1}. ${item.emoji || '❓'} ${item.itemName}`);
            });
            
            const villageName = await question(rl, '\nEnter village name (Rudania/Inariko/Vhintl) or press Enter to skip: ');
            
            if (villageName) {
                console.log('\n' + '='.repeat(80));
                console.log('VILLAGE CONFIG OUTPUT');
                console.log('='.repeat(80));
                console.log(formatOutput(selectedItems, villageName));
                console.log('='.repeat(80));
                
                // Save to file option
                const save = await question(rl, '\nSave to file? (y/n): ');
                if (save.toLowerCase() === 'y') {
                    const fs = require('fs');
                    const filename = `village_materials_${villageName.toLowerCase()}_${Date.now()}.txt`;
                    fs.writeFileSync(filename, formatOutput(selectedItems, villageName));
                    console.log(`✓ Saved to ${filename}`);
                }
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        rl.close();
        await mongoose.connection.close();
        console.log('\n✓ Database connection closed');
        process.exit(0);
    }
}

// Run the script
main();
