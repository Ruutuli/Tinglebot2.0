// ============================================================================
// ------------------- fixQuestItemRewardsAndEmbeds.js -------------------
// Script to fix quest itemRewards array in database AND update Discord embeds
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const Quest = require('../../shared/models/QuestModel');

// Import formatQuestEmbed from questAnnouncements
const { formatQuestEmbed } = require('./questAnnouncements');

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
// ------------------- Discord Client Setup -------------------
// ============================================================================

async function initializeDiscordClient() {
    try {
        const client = new Client({ 
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
        });
        
        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Discord client logged in');
        return client;
    } catch (error) {
        console.error('❌ Error initializing Discord client:', error);
        return null;
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

async function fixQuestItemRewardsAndEmbeds(dryRun = true, client = null) {
    try {
        console.log('🔍 Starting quest item rewards fix with embed updates...\n');
        if (dryRun) {
            console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
        }
        
        console.log('ℹ️  NOTE: This script will:');
        console.log('   1. Update itemRewards array in the database');
        console.log('   2. Update the Discord embed message if messageID exists\n');
        
        // Find all quests that have itemReward but empty or missing itemRewards array
        // Also include quests that might need re-parsing (have itemReward/itemRewardQty)
        const questsToFix = await Quest.find({
            $and: [
                {
                    $or: [
                        { itemReward: { $exists: true, $ne: null, $ne: '' } },
                        { itemRewardQty: { $exists: true, $ne: null } }
                    ]
                }
            ]
        }).then(quests => {
            // Filter to only quests that either:
            // 1. Don't have itemRewards array, OR
            // 2. Have empty itemRewards array, OR
            // 3. Have itemReward that contains colon (might have full format preserved)
            return quests.filter(quest => {
                if (!quest.itemRewards || quest.itemRewards.length === 0) {
                    return true;
                }
                // Check if itemReward contains colon format (might need re-parsing)
                if (quest.itemReward && quest.itemReward.includes(':') && quest.itemReward.includes(' ')) {
                    // Has format like "Item1:1 Item2:2" - might need re-parsing
                    return true;
                }
                return false;
            });
        });
        
        console.log(`📋 Found ${questsToFix.length} quests to process\n`);
        
        let totalQuestsProcessed = 0;
        let totalQuestsFixed = 0;
        let totalEmbedsUpdated = 0;
        let totalQuestsSkipped = 0;
        let totalErrors = 0;
        
        const results = {
            fixed: [],
            embedUpdated: [],
            skipped: [],
            errors: []
        };
        
        for (const quest of questsToFix) {
            try {
                console.log(`\n📜 Processing quest: ${quest.questID} - ${quest.title}`);
                console.log(`   Current itemReward: ${quest.itemReward || 'null'}`);
                console.log(`   Current itemRewardQty: ${quest.itemRewardQty || 'null'}`);
                console.log(`   Current itemRewards: ${JSON.stringify(quest.itemRewards || [])}`);
                console.log(`   MessageID: ${quest.messageID || 'null'}`);
                console.log(`   ChannelID: ${quest.targetChannel || 'null'}`);
                
                // Determine the item reward string to parse
                let itemRewardString = null;
                
                if (quest.itemReward) {
                    // Check if itemReward already contains colon format (full format preserved)
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
                    // Update the quest in database
                    quest.itemRewards = parsedItemRewards;
                    
                    // Also ensure itemReward and itemRewardQty are set to first item for backward compatibility
                    if (parsedItemRewards.length > 0) {
                        quest.itemReward = parsedItemRewards[0].name;
                        quest.itemRewardQty = parsedItemRewards[0].quantity;
                    }
                    
                    await quest.save();
                    console.log(`   💾 Quest updated in database`);
                    
                    // Update Discord embed if messageID exists
                    if (quest.messageID && quest.targetChannel && client) {
                        try {
                            const channel = await client.channels.fetch(quest.targetChannel);
                            if (channel) {
                                const message = await channel.messages.fetch(quest.messageID);
                                if (message) {
                                    // Re-format the embed with updated quest data
                                    const updatedEmbed = formatQuestEmbed(quest);
                                    await message.edit({ embeds: [updatedEmbed] });
                                    console.log(`   📝 Discord embed updated successfully`);
                                    totalEmbedsUpdated++;
                                    results.embedUpdated.push({
                                        questID: quest.questID,
                                        title: quest.title,
                                        messageID: quest.messageID
                                    });
                                } else {
                                    console.log(`   ⚠️  Message not found (may have been deleted)`);
                                }
                            } else {
                                console.log(`   ⚠️  Channel not found`);
                            }
                        } catch (embedError) {
                            console.error(`   ❌ Error updating embed:`, embedError.message);
                            // Don't fail the whole operation if embed update fails
                        }
                    } else {
                        if (!quest.messageID) {
                            console.log(`   ⚠️  No messageID - embed not updated`);
                        } else if (!client) {
                            console.log(`   ⚠️  Discord client not available - embed not updated`);
                        }
                    }
                } else {
                    console.log(`   🔍 Would update itemRewards array (DRY RUN)`);
                    if (quest.messageID && quest.targetChannel) {
                        console.log(`   🔍 Would update Discord embed (DRY RUN)`);
                    }
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
                    originalItemRewardQty: quest.itemRewardQty,
                    embedUpdated: !dryRun && quest.messageID && quest.targetChannel && client
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
        console.log(`Total embeds ${dryRun ? 'that would be ' : ''}updated: ${totalEmbedsUpdated}`);
        console.log(`Total quests skipped: ${totalQuestsSkipped}`);
        console.log(`Total errors: ${totalErrors}`);
        console.log('='.repeat(60) + '\n');
        
        if (dryRun && totalQuestsFixed > 0) {
            console.log('⚠️  This was a DRY RUN. Run with --execute flag to apply changes.');
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Error in fixQuestItemRewardsAndEmbeds:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Manual Fix Function (for specific quests) -------------------
// ============================================================================

async function manuallyFixQuest(questID, itemRewardsArray, dryRun = true, client = null) {
    try {
        console.log(`\n🔧 Manual fix for quest: ${questID}`);
        console.log(`   Item rewards: ${JSON.stringify(itemRewardsArray)}\n`);
        
        const quest = await Quest.findOne({ questID: questID });
        if (!quest) {
            console.error(`❌ Quest ${questID} not found!`);
            return { success: false, error: 'Quest not found' };
        }
        
        console.log(`📜 Found quest: "${quest.title}"`);
        
        if (!dryRun) {
            // Update the quest in database
            quest.itemRewards = itemRewardsArray;
            
            // Also set itemReward and itemRewardQty to first item for backward compatibility
            if (itemRewardsArray.length > 0) {
                quest.itemReward = itemRewardsArray[0].name;
                quest.itemRewardQty = itemRewardsArray[0].quantity;
            }
            
            await quest.save();
            console.log(`   💾 Quest updated in database`);
            
            // Update Discord embed if messageID exists
            if (quest.messageID && quest.targetChannel && client) {
                try {
                    const channel = await client.channels.fetch(quest.targetChannel);
                    if (channel) {
                        const message = await channel.messages.fetch(quest.messageID);
                        if (message) {
                            // Re-format the embed with updated quest data
                            const updatedEmbed = formatQuestEmbed(quest);
                            await message.edit({ embeds: [updatedEmbed] });
                            console.log(`   📝 Discord embed updated successfully`);
                            return { success: true, embedUpdated: true };
                        } else {
                            console.log(`   ⚠️  Message not found (may have been deleted)`);
                            return { success: true, embedUpdated: false, warning: 'Message not found' };
                        }
                    } else {
                        console.log(`   ⚠️  Channel not found`);
                        return { success: true, embedUpdated: false, warning: 'Channel not found' };
                    }
                } catch (embedError) {
                    console.error(`   ❌ Error updating embed:`, embedError.message);
                    return { success: true, embedUpdated: false, error: embedError.message };
                }
            } else {
                console.log(`   ⚠️  No messageID or channelID - embed not updated`);
                return { success: true, embedUpdated: false };
            }
        } else {
            console.log(`   🔍 Would update quest (DRY RUN)`);
            return { success: true, dryRun: true };
        }
    } catch (error) {
        console.error(`❌ Error in manuallyFixQuest:`, error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ------------------- Main Execution -------------------
// ============================================================================

async function main() {
    try {
        // Check command line arguments
        const args = process.argv.slice(2);
        const dryRun = !args.includes('--execute') && !args.includes('--no-dry-run');
        const manualFix = args.includes('--manual');
        
        if (dryRun) {
            console.log('⚠️  Running in DRY RUN mode. Add --execute flag to apply changes.\n');
        }
        
        const connected = await connectToDatabase();
        if (!connected) {
            process.exit(1);
        }
        
        let client = null;
        if (!dryRun || manualFix) {
            client = await initializeDiscordClient();
            if (!client) {
                console.log('⚠️  Discord client not available. Database will be updated but embeds will not be updated.\n');
            }
        }
        
        // Manual fix mode (for specific quests)
        if (manualFix) {
            console.log('🔧 MANUAL FIX MODE\n');
            
            // Define manual fixes for specific quests
            const manualFixes = [
                {
                    questID: 'Q343559', // Winter Ball 2026
                    items: [
                        { name: 'Freezard Water', quantity: 1 },
                        { name: 'Gourmet Meat Curry', quantity: 1 }
                    ]
                },
                {
                    questID: 'Q803672', // Put On Your War Paint 2026
                    items: [
                        { name: 'Eldin Ore', quantity: 3 }
                    ]
                }
                // Add more manual fixes here as needed
            ];
            
            let successCount = 0;
            let failCount = 0;
            
            for (const fix of manualFixes) {
                console.log(`\n${'='.repeat(60)}`);
                const result = await manuallyFixQuest(fix.questID, fix.items, dryRun, client);
                if (result.success) {
                    successCount++;
                    console.log(`✅ Manual fix completed for ${fix.questID}`);
                } else {
                    failCount++;
                    console.log(`❌ Manual fix failed for ${fix.questID}:`, result.error);
                }
            }
            
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📊 Manual Fix Summary: ${successCount} succeeded, ${failCount} failed`);
        } else {
            // Automatic fix mode
            const results = await fixQuestItemRewardsAndEmbeds(dryRun, client);
        }
        
        console.log('✅ Script completed successfully!');
        
        if (client) {
            client.destroy();
        }
        
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        if (client) {
            client.destroy();
        }
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { fixQuestItemRewardsAndEmbeds, manuallyFixQuest, parseItemRewardsString };

