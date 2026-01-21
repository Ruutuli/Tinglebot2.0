// ============================================================================
// ------------------- fixQuestTypes.js -------------------
// Script to fix quest types that have invalid enum values like "Interactive, RP"
// and "Writing, Art" by normalizing them to valid enum values
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('./shared/models/QuestModel');

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

// ------------------- normalizeQuestType -
function normalizeQuestType(questType) {
    if (!questType) return null;
    
    const normalized = questType.trim();
    
    // Handle combined types that need to be normalized to valid enum values
    if (normalized.includes(',')) {
        // Split by comma and trim each part
        const parts = normalized.split(',').map(p => p.trim());
        const lowerParts = parts.map(p => p.toLowerCase());
        
        // Handle "Interactive, RP" -> "Interactive"
        if (lowerParts.includes('interactive') && lowerParts.includes('rp')) {
            return 'Interactive';
        }
        
        // Handle "Writing, Art" or "Art, Writing" -> "Art / Writing"
        if ((lowerParts.includes('writing') && lowerParts.includes('art')) ||
            (lowerParts.includes('art') && lowerParts.includes('writing'))) {
            return 'Art / Writing';
        }
    }
    
    // Handle slash-separated types
    if (normalized.includes('/')) {
        const parts = normalized.split('/').map(p => p.trim());
        const lowerParts = parts.map(p => p.toLowerCase());
        
        // Handle "Art / Writing" or "Writing / Art" -> "Art / Writing"
        if ((lowerParts.includes('writing') && lowerParts.includes('art'))) {
            return 'Art / Writing';
        }
    }
    
    // Direct mapping to valid enum values (case-insensitive)
    const lower = normalized.toLowerCase();
    if (lower === 'art') return 'Art';
    if (lower === 'writing') return 'Writing';
    if (lower === 'interactive') return 'Interactive';
    if (lower === 'rp') return 'RP';
    if (lower === 'art / writing' || lower === 'art/writing') return 'Art / Writing';
    
    // Return null if no match (shouldn't happen for valid quests)
    return null;
}

// Valid enum values from QuestModel
const VALID_QUEST_TYPES = ['Art', 'Writing', 'Interactive', 'RP', 'Art / Writing'];

// ============================================================================
// ------------------- Main Fix Function -------------------
// ============================================================================

async function fixQuestTypes(dryRun = true) {
    try {
        console.log(`🔍 ${dryRun ? '[DRY RUN]' : '[LIVE]'} Starting quest type fix...\n`);
        
        // Find all quests
        const allQuests = await Quest.find({});
        console.log(`📋 Found ${allQuests.length} total quests to check\n`);
        
        let totalQuestsChecked = 0;
        let totalQuestsFixed = 0;
        let totalQuestsNoChange = 0;
        let totalErrors = 0;
        const fixes = [];
        
        for (const quest of allQuests) {
            totalQuestsChecked++;
            
            try {
                // Check if questType is valid
                const currentType = quest.questType;
                const isValid = VALID_QUEST_TYPES.includes(currentType);
                
                if (isValid) {
                    totalQuestsNoChange++;
                    continue;
                }
                
                // Normalize the quest type
                const normalizedType = normalizeQuestType(currentType);
                
                if (!normalizedType) {
                    console.warn(`⚠️  Quest ${quest.questID || quest._id} (${quest.title}) has unknown questType: "${currentType}" - skipping`);
                    totalErrors++;
                    continue;
                }
                
                // Track the fix
                fixes.push({
                    questID: quest.questID || quest._id,
                    title: quest.title,
                    oldType: currentType,
                    newType: normalizedType
                });
                
                console.log(`🔧 Quest: "${quest.title}" (${quest.questID || quest._id})`);
                console.log(`   Current: "${currentType}" -> Normalized: "${normalizedType}"`);
                
                // Update the quest if not dry run
                if (!dryRun) {
                    quest.questType = normalizedType;
                    await quest.save();
                    console.log(`   ✅ Updated in database\n`);
                } else {
                    console.log(`   📝 [DRY RUN] Would update in database\n`);
                }
                
                totalQuestsFixed++;
                
            } catch (error) {
                console.error(`❌ Error processing quest ${quest.questID || quest._id}:`, error.message);
                totalErrors++;
            }
        }
        
        // Print summary
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`             ${dryRun ? 'DRY RUN' : 'LIVE FIX'} SUMMARY`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        console.log(`📊 Total Quests Checked: ${totalQuestsChecked}`);
        console.log(`✅ Quests Already Valid: ${totalQuestsNoChange}`);
        console.log(`🔧 Quests ${dryRun ? 'That Would Be' : ''} Fixed: ${totalQuestsFixed}`);
        console.log(`❌ Errors: ${totalErrors}`);
        
        if (fixes.length > 0) {
            console.log(`\n📝 Fixes ${dryRun ? 'That Would Be' : ''} Applied:\n`);
            fixes.forEach((fix, index) => {
                console.log(`${index + 1}. "${fix.title}" (${fix.questID})`);
                console.log(`   "${fix.oldType}" -> "${fix.newType}"`);
            });
        }
        
        return {
            totalChecked: totalQuestsChecked,
            totalFixed: totalQuestsFixed,
            totalNoChange: totalQuestsNoChange,
            totalErrors: totalErrors,
            fixes: fixes
        };
        
    } catch (error) {
        console.error('❌ Error in fixQuestTypes:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Main Execution -------------------
// ============================================================================

async function main() {
    try {
        const connected = await connectToDatabase();
        if (!connected) {
            process.exit(1);
        }
        
        // First run dry run
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('                    DRY RUN MODE');
        console.log('═══════════════════════════════════════════════════════════════\n');
        const dryRunResults = await fixQuestTypes(true);
        
        // If there are fixes to apply, ask user (or apply automatically)
        if (dryRunResults.totalFixed > 0) {
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log('                    APPLYING FIXES');
            console.log('═══════════════════════════════════════════════════════════════\n');
            await fixQuestTypes(false);
        } else {
            console.log('\n✅ No fixes needed - all quest types are valid!');
        }
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
        
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

module.exports = { fixQuestTypes, normalizeQuestType };

