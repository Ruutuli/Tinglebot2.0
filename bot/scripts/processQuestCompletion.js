// ============================================================================
// ------------------- processQuestCompletion.js -------------------
// Script to manually process quest completion and distribute rewards
// Usage: node scripts/processQuestCompletion.js <questID>
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const { connectToTinglebot } = require('@app/shared/database/db');
const Quest = require('@app/shared/models/QuestModel');
const questRewardModule = require('../modules/questRewardModule');

// Initialize Discord client for sending messages
let discordClient = null;

// ============================================================================
// ------------------- Main Function -------------------
// ============================================================================

async function initializeDiscordClient() {
    try {
        console.log('🔌 Initializing Discord client...');
        discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        await discordClient.login(process.env.DISCORD_TOKEN);
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            discordClient.once('ready', resolve);
        });
        
        // Make client available to questRewardModule by setting it on index.js module
        // This is needed because sendQuestCompletionSummary requires client from index.js
        const indexModulePath = require.resolve('../index.js');
        const indexModule = require.cache[indexModulePath];
        if (indexModule) {
            indexModule.exports.client = discordClient;
        } else {
            // If module not cached, create a mock export
            const mockIndex = { client: discordClient };
            require.cache[indexModulePath] = {
                exports: mockIndex
            };
        }
        
        console.log('✅ Discord client initialized\n');
        return true;
    } catch (error) {
        console.log(`⚠️ Could not initialize Discord client: ${error.message}`);
        console.log('   (Rewards will still be processed, but summary won\'t be sent)\n');
        return false;
    }
}

async function processQuest(questId) {
    try {
        console.log('\n');
        console.log('='.repeat(60));
        console.log('📜 QUEST COMPLETION PROCESSOR');
        console.log('='.repeat(60));
        console.log(`\nProcessing quest: ${questId}\n`);

        // Connect to database
        console.log('🔌 Connecting to database...');
        await connectToTinglebot();
        console.log('✅ Connected to database\n');

        // Initialize Discord client (optional - for sending summary)
        await initializeDiscordClient();

        // Find the quest
        console.log(`🔍 Finding quest ${questId}...`);
        const quest = await Quest.findOne({ questID: questId });

        if (!quest) {
            console.error(`❌ Quest ${questId} not found!`);
            process.exit(1);
        }

        console.log(`✅ Found quest: "${quest.title}"`);
        console.log(`   Status: ${quest.status}`);
        console.log(`   Type: ${quest.questType}`);
        console.log(`   Completion Processed: ${quest.completionProcessed}`);
        console.log(`   Created At: ${quest.createdAt ? new Date(quest.createdAt).toLocaleString() : 'Not set'}`);
        console.log(`   Posted At: ${quest.postedAt ? new Date(quest.postedAt).toLocaleString() : 'Not posted'}`);
        console.log(`   Time Limit: ${quest.timeLimit || 'N/A'}\n`);

        // Check if quest has expired and show date details
        const startDate = quest.postedAt || quest.createdAt;
        if (startDate && quest.timeLimit) {
            const startDateTime = new Date(startDate);
            const timeLimit = quest.timeLimit.toLowerCase();
            let durationMs = 0;
            
            // Use same multipliers as QuestModel
            const TIME_MULTIPLIERS = {
                HOUR: 60 * 60 * 1000,
                DAY: 24 * 60 * 60 * 1000,
                WEEK: 7 * 24 * 60 * 60 * 1000,
                MONTH: 30 * 24 * 60 * 60 * 1000
            };
            
            if (timeLimit.includes('month')) {
                const months = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
                durationMs = months * TIME_MULTIPLIERS.MONTH;
            } else if (timeLimit.includes('week')) {
                const weeks = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
                durationMs = weeks * TIME_MULTIPLIERS.WEEK;
            } else if (timeLimit.includes('day')) {
                const days = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
                durationMs = days * TIME_MULTIPLIERS.DAY;
            } else if (timeLimit.includes('hour')) {
                const hours = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
                durationMs = hours * TIME_MULTIPLIERS.HOUR;
            }
            
            const expirationTime = new Date(startDateTime.getTime() + durationMs);
            const now = new Date();
            const daysUntil = Math.ceil((expirationTime - now) / (24 * 60 * 60 * 1000));
            
            console.log(`   Start Date: ${startDateTime.toLocaleString()}`);
            console.log(`   Expiration Date: ${expirationTime.toLocaleString()}`);
            console.log(`   Current Date: ${now.toLocaleString()}`);
            console.log(`   ${daysUntil >= 0 ? 'Days Until' : 'Days Past'} Expiration: ${Math.abs(daysUntil)}\n`);
        }
        
        const timeExpired = quest.checkTimeExpiration();
        console.log(`⏰ Time Expired Check: ${timeExpired ? 'YES ✅' : 'NO ❌'}\n`);

        // Get participants
        const participants = Array.from(quest.participants.values());
        console.log(`👥 Participants: ${participants.length}`);
        
        const completedParticipants = participants.filter(p => p.progress === 'completed' || p.progress === 'rewarded');
        const rewardedParticipants = participants.filter(p => p.progress === 'rewarded');
        
        console.log(`   Completed: ${completedParticipants.length}`);
        console.log(`   Already Rewarded: ${rewardedParticipants.length}\n`);

        // Show participant details
        if (completedParticipants.length > 0) {
            console.log('📋 Completed Participants:');
            completedParticipants.forEach(p => {
                const status = p.progress === 'rewarded' ? '✅ Rewarded' : '⏳ Needs Rewards';
                console.log(`   • ${p.characterName} (${p.userId}) - ${status}`);
                if (p.rpPostCount !== undefined) {
                    console.log(`     Posts: ${p.rpPostCount}/${quest.postRequirement || 15}`);
                }
            });
            console.log('');
        }

        // Check if quest should be marked as completed
        if (quest.status === 'active' && (timeExpired || completedParticipants.length > 0)) {
            console.log('🔄 Checking auto-completion...');
            const completionResult = await quest.checkAutoCompletion(true); // Force check
            
            if (completionResult.completed && completionResult.needsRewardProcessing) {
                console.log(`✅ Quest should be completed: ${completionResult.reason}\n`);
                
                // Process rewards (this will also send the completion summary)
                console.log('💰 Processing rewards...');
                await questRewardModule.processQuestCompletion(quest.questID);
                
                // Mark as processed
                await quest.markCompletionProcessed();
                console.log('✅ Quest completion processed (summary sent automatically)\n');
            } else if (completionResult.completed) {
                console.log(`ℹ️ Quest already processed: ${completionResult.reason}\n`);
            } else {
                console.log(`ℹ️ Quest not ready for completion: ${completionResult.reason}\n`);
            }
        } else if (quest.status === 'completed' && !quest.completionProcessed) {
            // Quest is marked as completed but rewards weren't processed
            console.log('🔄 Quest is completed but rewards not processed. Processing now...\n');
            
            // Process rewards (this will also send the completion summary)
            console.log('💰 Processing rewards...');
            await questRewardModule.processQuestCompletion(quest.questID);
            
            // Mark as processed
            await quest.markCompletionProcessed();
            console.log('✅ Quest completion processed (summary sent automatically)\n');
        } else if (quest.completionProcessed) {
            // Check if rewards were actually distributed
            const rewardedParticipants = participants.filter(p => p.progress === 'rewarded');
            
            if (rewardedParticipants.length === 0 && completedParticipants.length > 0) {
                console.log('⚠️ Quest marked as processed but no rewards were distributed!');
                console.log('   Force processing rewards now...\n');
                
                // Reset completion processed flag to allow reprocessing
                quest.completionProcessed = false;
                await quest.save();
                
                // Process rewards (this will also send the completion summary)
                console.log('💰 Processing rewards...');
                await questRewardModule.processQuestCompletion(quest.questID);
                
                // Mark as processed again
                await quest.markCompletionProcessed();
                console.log('✅ Quest rewards force processed\n');
            } else {
                console.log('ℹ️ Quest completion has already been processed.\n');
            }
        } else {
            console.log('ℹ️ Quest is still active and not expired yet.\n');
        }

        // Reload quest to show updated status
        await quest.save();
        const updatedQuest = await Quest.findOne({ questID: questId });
        const updatedParticipants = Array.from(updatedQuest.participants.values());
        const updatedRewarded = updatedParticipants.filter(p => p.progress === 'rewarded');
        
        console.log('📊 Final Status:');
        console.log(`   Quest Status: ${updatedQuest.status}`);
        console.log(`   Completion Processed: ${updatedQuest.completionProcessed}`);
        console.log(`   Rewarded Participants: ${updatedRewarded.length}/${updatedParticipants.length}\n`);

        if (updatedRewarded.length > 0) {
            console.log('✅ Successfully Rewarded:');
            updatedRewarded.forEach(p => {
                console.log(`   • ${p.characterName} - ${p.tokensEarned || 0} tokens, ${p.itemsEarned?.length || 0} items`);
            });
            console.log('');
        }

        console.log('='.repeat(60));
        console.log('✅ PROCESSING COMPLETE');
        console.log('='.repeat(60));
        console.log('\n');

        // Close Discord client if initialized
        if (discordClient) {
            console.log('🔌 Closing Discord client...');
            discordClient.destroy();
        }

        // Close database connection
        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error processing quest:', error);
        console.error(error.stack);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// ============================================================================
// ------------------- Script Execution -------------------
// ============================================================================

const questId = process.argv[2];

if (!questId) {
    console.error('❌ Usage: node scripts/processQuestCompletion.js <questID>');
    console.error('   Example: node scripts/processQuestCompletion.js Q708037');
    process.exit(1);
}

processQuest(questId).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

