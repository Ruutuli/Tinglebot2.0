// ============================================================================
// Script to analyze and balance village materials
// ============================================================================
const mongoose = require('mongoose');
const { VILLAGE_CONFIG } = require('./shared/models/VillageModel');
const Item = require('./shared/models/ItemModel');
const { connectToTinglebot } = require('./shared/database/db');

// ============================================================================
// Analysis Functions
// ============================================================================

async function getItemRarity(itemName) {
    try {
        const item = await Item.findOne({ itemName: itemName });
        return item ? item.itemRarity : null;
    } catch (error) {
        console.error(`Error fetching rarity for ${itemName}:`, error);
        return null;
    }
}

function calculateVillageTotals(villageName, materials) {
    const level2Total = { materials: 0, rareCount: 0 };
    const level3Total = { materials: 0, rareCount: 0 };
    const level3Additional = { materials: 0, rareCount: 0 };
    
    const materialDetails = [];
    
    for (const [materialName, data] of Object.entries(materials)) {
        const level2Req = data.required[2] || 0;
        const level3Req = data.required[3] || 0;
        const level3Add = level3Req - level2Req;
        
        // Check if it's a rare material (Level 3 only, quantity 1)
        const isRare = level2Req === 0 && level3Req === 1;
        
        if (level2Req > 0) {
            level2Total.materials += level2Req;
        }
        if (level3Req > 0) {
            level3Total.materials += level3Req;
            if (isRare) {
                level3Total.rareCount += 1;
            }
        }
        if (level3Add > 0) {
            level3Additional.materials += level3Add;
            if (isRare) {
                level3Additional.rareCount += 1;
            }
        }
        
        materialDetails.push({
            name: materialName,
            level2: level2Req,
            level3: level3Req,
            level3Additional: level3Add,
            isRare: isRare
        });
    }
    
    return {
        level2Total,
        level3Total,
        level3Additional,
        materialDetails
    };
}

async function analyzeVillageMaterials() {
    console.log('='.repeat(80));
    console.log('VILLAGE MATERIALS ANALYSIS');
    console.log('='.repeat(80));
    console.log();
    
    const results = {};
    const rarityData = {};
    
    // Calculate totals for each village
    for (const [villageName, config] of Object.entries(VILLAGE_CONFIG)) {
        const totals = calculateVillageTotals(villageName, config.materials);
        results[villageName] = totals;
        
        // Get rarity for each material
        console.log(`\n📊 Analyzing ${villageName}...`);
        for (const material of totals.materialDetails) {
            const rarity = await getItemRarity(material.name);
            if (rarity !== null) {
                material.rarity = rarity;
                if (!rarityData[material.name]) {
                    rarityData[material.name] = rarity;
                }
            } else {
                material.rarity = 'Unknown';
                console.warn(`  ⚠️  Could not find rarity for: ${material.name}`);
            }
        }
    }
    
    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('CURRENT TOTALS');
    console.log('='.repeat(80));
    
    for (const [villageName, data] of Object.entries(results)) {
        const config = VILLAGE_CONFIG[villageName];
        console.log(`\n${config.emoji || '🔥'} ${villageName}`);
        console.log(`  Level 2 Total: ${data.level2Total.materials} materials`);
        console.log(`  Level 3 Total: ${data.level3Total.materials} materials + ${data.level3Total.rareCount} rare`);
        console.log(`  Additional for Level 3: ${data.level3Additional.materials} materials + ${data.level3Additional.rareCount} rare`);
    }
    
    // Calculate averages and differences
    const level2Totals = Object.values(results).map(r => r.level2Total.materials);
    const level3Totals = Object.values(results).map(r => r.level3Total.materials);
    const level3AdditionalTotals = Object.values(results).map(r => r.level3Additional.materials);
    
    const avgLevel2 = level2Totals.reduce((a, b) => a + b, 0) / level2Totals.length;
    const avgLevel3 = level3Totals.reduce((a, b) => a + b, 0) / level3Totals.length;
    const avgLevel3Additional = level3AdditionalTotals.reduce((a, b) => a + b, 0) / level3AdditionalTotals.length;
    
    console.log('\n' + '='.repeat(80));
    console.log('BALANCE ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\nAverage Level 2 Total: ${Math.round(avgLevel2)}`);
    console.log(`Average Level 3 Total: ${Math.round(avgLevel3)}`);
    console.log(`Average Level 3 Additional: ${Math.round(avgLevel3Additional)}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('RARITY ANALYSIS');
    console.log('='.repeat(80));
    
    // Group materials by rarity
    for (const [villageName, data] of Object.entries(results)) {
        console.log(`\n${VILLAGE_CONFIG[villageName].emoji || '🔥'} ${villageName} - Material Rarities:`);
        const rarityGroups = {};
        
        for (const material of data.materialDetails) {
            if (material.rarity !== 'Unknown') {
                const rarity = material.rarity.toString();
                if (!rarityGroups[rarity]) {
                    rarityGroups[rarity] = [];
                }
                rarityGroups[rarity].push({
                    name: material.name,
                    level2: material.level2,
                    level3: material.level3
                });
            }
        }
        
        // Display by rarity
        const sortedRarities = Object.keys(rarityGroups).sort((a, b) => parseInt(a) - parseInt(b));
        for (const rarity of sortedRarities) {
            const items = rarityGroups[rarity];
            const totalLevel2 = items.reduce((sum, item) => sum + item.level2, 0);
            const totalLevel3 = items.reduce((sum, item) => sum + item.level3, 0);
            console.log(`  Rarity ${rarity}: ${items.length} items (L2: ${totalLevel2}, L3: ${totalLevel3})`);
            items.forEach(item => {
                console.log(`    - ${item.name} (L2: ${item.level2}, L3: ${item.level3})`);
            });
        }
    }
    
    // Suggest adjustments
    console.log('\n' + '='.repeat(80));
    console.log('BALANCING SUGGESTIONS');
    console.log('='.repeat(80));
    
    const targetLevel2 = Math.round(avgLevel2);
    const targetLevel3 = Math.round(avgLevel3);
    const targetLevel3Additional = Math.round(avgLevel3Additional);
    
    for (const [villageName, data] of Object.entries(results)) {
        const level2Diff = targetLevel2 - data.level2Total.materials;
        const level3Diff = targetLevel3 - data.level3Total.materials;
        const level3AdditionalDiff = targetLevel3Additional - data.level3Additional.materials;
        
        console.log(`\n${VILLAGE_CONFIG[villageName].emoji || '🔥'} ${villageName}:`);
        if (Math.abs(level2Diff) > 0) {
            console.log(`  Level 2: ${level2Diff > 0 ? '+' : ''}${level2Diff} materials needed`);
        }
        if (Math.abs(level3Diff) > 0) {
            console.log(`  Level 3: ${level3Diff > 0 ? '+' : ''}${level3Diff} materials needed`);
        }
        if (Math.abs(level3AdditionalDiff) > 0) {
            console.log(`  Level 3 Additional: ${level3AdditionalDiff > 0 ? '+' : ''}${level3AdditionalDiff} materials needed`);
        }
        if (Math.abs(level2Diff) === 0 && Math.abs(level3Diff) === 0 && Math.abs(level3AdditionalDiff) === 0) {
            console.log(`  ✅ Already balanced!`);
        }
    }
    
    return { results, rarityData, targets: { level2: targetLevel2, level3: targetLevel3, level3Additional: targetLevel3Additional } };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    try {
        await connectToTinglebot();
        console.log('✅ Connected to database');
        
        const analysis = await analyzeVillageMaterials();
        
        console.log('\n' + '='.repeat(80));
        console.log('Analysis complete!');
        console.log('='.repeat(80));
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { analyzeVillageMaterials, getItemRarity, calculateVillageTotals };
