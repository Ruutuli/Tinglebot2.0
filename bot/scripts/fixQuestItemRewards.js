// ============================================================================
// ------------------- fixQuestItemRewards.js -------------------
// Script to fix quest itemRewards array for quests that were saved with
// itemReward/itemRewardQty but empty itemRewards array
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('../../shared/models/QuestModel');

// ============================================================================
// ------------------- Database Connection -------------------
// ============================================================================

async function connectToDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MongoDB URI not found in environment variables');
        }
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error);
        return false;
    }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- parseItemRewardsString -
function parseItemRewardsString(itemRewardString) {
    if (!itemRewardString || itemRewardString.trim() === '' || itemRewardString === 'N/A') {
        return [];
    }
    
    const itemRewards = [];
    const itemRewardStr = itemRewardString.trim();
    
    // Handle semicolon-separated items (backward compatibility)
    if (itemRewardStr.includes(';')) {
        const itemStrings = itemRewardStr.split(';');
        for (const itemString of itemStrings) {
            const trimmed = itemString.trim();
            if (trimmed) {
                if (trimmed.includes(':')) {
                    const [name, qty] = trimmed.split(':').map(s => s.trim());
                    itemRewards.push({
                        name: name,
                        quantity: parseInt(qty, 10) || 1
                    });
                } else {
                    itemRewards.push({
                        name: trimmed,
                        quantity: 1
                    });
                }
            }
        }
    } else {
        // Handle space-separated items or single item
        // Split by pattern ":number " (colon + digits + space) to find item boundaries
        // This handles items with spaces in their names like "Freezard Water:1"
        const itemPattern = /([^:]+):(\d+)(?:\s|$)/g;
        let match;
        const matches = [];
        
        while ((match = itemPattern.exec(itemRewardStr)) !== null) {
            matches.push({
                name: match[1].trim(),
                quantity: parseInt(match[2], 10) || 1
            });
        }
        
        // If pattern matching found items, use them
        if (matches.length > 0) {
            itemRewards.push(...matches);
        } else if (itemRewardStr.includes(':')) {
            // Fallback: single item with quantity
            const [name, qty] = itemRewardStr.split(':').map(s => s.trim());
            itemRewards.push({
                name: name,
                quantity: parseInt(qty, 10) || 1
            });
        } else if (itemRewardStr) {
            // Fallback: single item without quantity
            itemRewards.push({
                name: itemRewardStr,
                quantity: 1
            });
        }
    }
    
    return itemRewards;
}

// ============================================================================
// ------------------- Main Fix Function -------------------
// ============================================================================

async function fixQuestItemRewards(dryRun = true) {
    try {
        console.log('🔍 Starting quest item rewards fix...\n');
        if (dryRun) {
            console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
        }
        
        console.log('ℹ️  NOTE: This script can only fix quests using data already in the database.');
        console.log('   If a quest originally had multiple items but only the first was saved,');
        console.log('   the missing items cannot be recovered without the original source data.\n');
        
        // Find all quests that have itemReward but empty or missing itemRewards array
        const questsToFix = await Quest.find({
            $and: [
                {
                    $or: [
                        { itemReward: { $exists: true, $ne: null, $ne: '' } },
                        { itemRewardQty: { $exists: true, $ne: null } }
                    ]
                },
                {
                    $or: [
                        { itemRewards: { $exists: false } },
                        { itemRewards: { $eq: [] } },
                        { itemRewards: { $size: 0 } }
                    ]
                }
            ]
        });
        
        console.log(`📋 Found ${questsToFix.length} quests to process\n`);
        
        let totalQuestsProcessed = 0;
        let totalQuestsFixed = 0;
        let totalQuestsSkipped = 0;
        let totalErrors = 0;
        
        const results = {
            fixed: [],
            skipped: [],
            errors: []
        };
        
        for (const quest of questsToFix) {
            try {
                console.log(`\n📜 Processing quest: ${quest.questID} - ${quest.title}`);
                console.log(`   Current itemReward: ${quest.itemReward || 'null'}`);
                console.log(`   Current itemRewardQty: ${quest.itemRewardQty || 'null'}`);
                console.log(`   Current itemRewards: ${JSON.stringify(quest.itemRewards || [])}`);
                
                // Determine the item reward string to parse
                // If itemReward contains a colon, it might still have the full format
                // Otherwise, reconstruct from itemReward + itemRewardQty
                let itemRewardString = null;
                
                if (quest.itemReward) {
                    // Check if itemReward already contains colon format (full format preserved)
                    // If it contains a colon, it's likely in format "Item:Qty" or "Item1:Qty1 Item2:Qty2"
                    if (quest.itemReward.includes(':')) {
                        itemRewardString = quest.itemReward;
                    } else if (quest.itemRewardQty !== null && quest.itemRewardQty !== undefined) {
                        // Reconstruct from itemReward name + itemRewardQty
                        itemRewardString = `${quest.itemReward}:${quest.itemRewardQty}`;
                    } else {
                        // Just the item name, quantity defaults to 1
                        itemRewardString = quest.itemReward;
                    }
                }
                
                if (!itemRewardString) {
                    console.log(`   ⚠️  No itemReward found, skipping...`);
                    totalQuestsSkipped++;
                    results.skipped.push({
                        questID: quest.questID,
                        title: quest.title,
                        reason: 'No itemReward found'
                    });
                    continue;
                }
                
                // Parse the item rewards
                const parsedItemRewards = parseItemRewardsString(itemRewardString);
                
                if (parsedItemRewards.length === 0) {
                    console.log(`   ⚠️  No items parsed from "${itemRewardString}", skipping...`);
                    totalQuestsSkipped++;
                    results.skipped.push({
                        questID: quest.questID,
                        title: quest.title,
                        reason: `Could not parse items from: ${itemRewardString}`
                    });
                    continue;
                }
                
                console.log(`   ✅ Parsed ${parsedItemRewards.length} item(s):`);
                parsedItemRewards.forEach((item, idx) => {
                    console.log(`      ${idx + 1}. ${item.name} × ${item.quantity}`);
                });
                
                if (!dryRun) {
                    // Update the quest
                    quest.itemRewards = parsedItemRewards;
                    
                    // Also ensure itemReward and itemRewardQty are set to first item for backward compatibility
                    if (parsedItemRewards.length > 0) {
                        quest.itemReward = parsedItemRewards[0].name;
                        quest.itemRewardQty = parsedItemRewards[0].quantity;
                    }
                    
                    await quest.save();
                    console.log(`   💾 Quest updated successfully`);
                } else {
                    console.log(`   🔍 Would update itemRewards array (DRY RUN)`);
                }
                
                totalQuestsProcessed++;
                if (!dryRun) {
                    totalQuestsFixed++;
                }
                
                results.fixed.push({
                    questID: quest.questID,
                    title: quest.title,
                    itemRewards: parsedItemRewards,
                    originalItemReward: quest.itemReward,
                    originalItemRewardQty: quest.itemRewardQty
                });
                
            } catch (error) {
                console.error(`   ❌ Error processing quest ${quest.questID}:`, error.message);
                totalErrors++;
                results.errors.push({
                    questID: quest.questID,
                    title: quest.title,
                    error: error.message
                });
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total quests processed: ${totalQuestsProcessed}`);
        console.log(`Total quests ${dryRun ? 'that would be ' : ''}fixed: ${totalQuestsFixed}`);
        console.log(`Total quests skipped: ${totalQuestsSkipped}`);
        console.log(`Total errors: ${totalErrors}`);
        console.log('='.repeat(60) + '\n');
        
        if (dryRun && totalQuestsFixed > 0) {
            console.log('⚠️  This was a DRY RUN. Run with dryRun=false to apply changes.');
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Error in fixQuestItemRewards:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Main Execution -------------------
// ============================================================================

async function main() {
    try {
        // Check command line arguments for dry-run flag
        const args = process.argv.slice(2);
        const dryRun = !args.includes('--execute') && !args.includes('--no-dry-run');
        
        if (dryRun) {
            console.log('⚠️  Running in DRY RUN mode. Add --execute flag to apply changes.\n');
        }
        
        const connected = await connectToDatabase();
        if (!connected) {
            process.exit(1);
        }
        
        const results = await fixQuestItemRewards(dryRun);
        
        console.log('✅ Script completed successfully!');
        
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { fixQuestItemRewards, parseItemRewardsString };

