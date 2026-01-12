// ============================================================================
// GET ITEMS FOR VILLAGE MATERIALS
// ============================================================================
// Simple script to fetch all items and help decide which should be village materials
//
// ============================================================================
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const dbConfig = require('../shared/config/database');
const ItemModel = require('../shared/models/ItemModel');

async function main() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(dbConfig.tinglebot, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✓ Connected\n');
        
        const allItems = await ItemModel.find({}).lean().sort({ itemName: 1 });
        console.log(`Found ${allItems.length} total items\n`);
        
        // Group by category
        const byCategory = {};
        allItems.forEach(item => {
            const cat = item.category?.[0] || 'Misc';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(item);
        });
        
        console.log('ITEMS BY CATEGORY:');
        Object.keys(byCategory).sort().forEach(cat => {
            console.log(`  ${cat}: ${byCategory[cat].length} items`);
        });
        
        // Potential candidates
        const candidates = allItems.filter(item => 
            item.stackable && 
            (item.gathering || item.looting) &&
            item.itemRarity <= 3
        );
        
        console.log(`\n\nPOTENTIAL CANDIDATES (Stackable, Gather/Loot, Rarity ≤3): ${candidates.length} items`);
        console.log('='.repeat(80));
        
        // Group candidates by region
        const eldin = candidates.filter(i => i.eldin);
        const lanayru = candidates.filter(i => i.lanayru);
        const faron = candidates.filter(i => i.faron);
        const multiple = candidates.filter(i => {
            const regions = [];
            if (i.eldin) regions.push('Eldin');
            if (i.lanayru) regions.push('Lanayru');
            if (i.faron) regions.push('Faron');
            return regions.length > 1;
        });
        const none = candidates.filter(i => !i.eldin && !i.lanayru && !i.faron);
        
        console.log(`\nELDIN (Rudania) - ${eldin.length} items:`);
        eldin.forEach(item => {
            console.log(`  ${item.emoji || '❓'} ${item.itemName} (Rarity: ${item.itemRarity || 1}, ${item.category?.[0] || 'Misc'})`);
        });
        
        console.log(`\nLANAYRU (Inariko) - ${lanayru.length} items:`);
        lanayru.forEach(item => {
            console.log(`  ${item.emoji || '❓'} ${item.itemName} (Rarity: ${item.itemRarity || 1}, ${item.category?.[0] || 'Misc'})`);
        });
        
        console.log(`\nFARON (Vhintl) - ${faron.length} items:`);
        faron.forEach(item => {
            console.log(`  ${item.emoji || '❓'} ${item.itemName} (Rarity: ${item.itemRarity || 1}, ${item.category?.[0] || 'Misc'})`);
        });
        
        console.log(`\nMULTIPLE REGIONS - ${multiple.length} items:`);
        multiple.forEach(item => {
            const regions = [];
            if (item.eldin) regions.push('Eldin');
            if (item.lanayru) regions.push('Lanayru');
            if (item.faron) regions.push('Faron');
            console.log(`  ${item.emoji || '❓'} ${item.itemName} (${regions.join(', ')})`);
        });
        
        console.log(`\nNO REGION - ${none.length} items:`);
        none.slice(0, 20).forEach(item => {
            console.log(`  ${item.emoji || '❓'} ${item.itemName} (Rarity: ${item.itemRarity || 1})`);
        });
        if (none.length > 20) console.log(`  ... and ${none.length - 20} more`);
        
        // Materials specifically
        const materials = candidates.filter(item => 
            item.type?.some(t => t.toLowerCase().includes('material')) ||
            item.category?.some(c => c.toLowerCase().includes('material'))
        );
        
        console.log(`\n\nMATERIALS SPECIFICALLY: ${materials.length} items`);
        console.log('='.repeat(80));
        materials.forEach(item => {
            const regions = [];
            if (item.eldin) regions.push('Eldin');
            if (item.lanayru) regions.push('Lanayru');
            if (item.faron) regions.push('Faron');
            const regionStr = regions.length > 0 ? `[${regions.join(', ')}]` : '[None]';
            console.log(`  ${item.emoji || '❓'} ${item.itemName} ${regionStr} (Rarity: ${item.itemRarity || 1})`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

main();
