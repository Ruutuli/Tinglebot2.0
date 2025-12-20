// ============================================================================
// ------------------- fixQuestCompletionTracking.js -------------------
// Script to fix user quest completion tracking for participants who completed
// quests but their completion wasn't properly recorded in user.quests
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('../../models/QuestModel');
const User = require('../../models/UserModel');
const ApprovedSubmission = require('../../models/ApprovedSubmissionModel');

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

function getQuestTypeKey(questType = '') {
    const normalized = questType.trim().toLowerCase();
    
    if (normalized === 'art') return 'art';
    if (normalized === 'writing') return 'writing';
    if (normalized === 'interactive') return 'interactive';
    if (normalized === 'rp') return 'rp';
    if (normalized === 'art / writing' || normalized === 'art/writing') return 'artWriting';
    
    return 'other';
}

// ============================================================================
// ------------------- Main Fix Function -------------------
// ============================================================================

async function fixQuestCompletionTracking() {
    try {
        console.log('🔍 Starting quest completion tracking fix...\n');
        
        // Find all completed quests
        const completedQuests = await Quest.find({ status: 'completed' });
        console.log(`📋 Found ${completedQuests.length} completed quests to process\n`);
        
        let totalQuestsProcessed = 0;
        let totalParticipantsProcessed = 0;
        let totalCompletionsRecorded = 0;
        let totalCompletionsUpdated = 0;
        let totalErrors = 0;
        let totalNeedsReward = 0;
        
        const results = {
            quests: [],
            users: new Map() // Track users to recalculate totals at the end
        };
        
        for (const quest of completedQuests) {
            try {
                console.log(`\n📜 Processing quest: ${quest.questID} - ${quest.title}`);
                
                let questCompletionsRecorded = 0;
                let questCompletionsUpdated = 0;
                
                // First, check for participants with approved submissions that weren't marked as completed
                // This handles cases like Kimino where submission was approved but quest completion didn't trigger
                const approvedSubmissions = await ApprovedSubmission.find({ 
                    questEvent: quest.questID,
                    approvedAt: { $exists: true, $ne: null }
                });
                
                for (const submission of approvedSubmissions) {
                    const participant = quest.getParticipant(submission.userId);
                    if (!participant) continue;
                    
                    // Check if participant has approved submission but isn't marked as completed
                    const hasApprovedSubmission = participant.submissions?.some(sub => sub.approved === true) || 
                                                  (submission.approvedAt && participant.progress === 'active');
                    
                    if (hasApprovedSubmission && participant.progress === 'active') {
                        // Check if submission type matches quest requirements
                        const questType = quest.questType.toLowerCase();
                        const submissionType = submission.category.toLowerCase();
                        
                        let shouldComplete = false;
                        if (questType === 'art' && submissionType === 'art') {
                            shouldComplete = true;
                        } else if (questType === 'writing' && submissionType === 'writing') {
                            shouldComplete = true;
                        } else if (questType === 'art / writing' || questType === 'art/writing') {
                            // For Art/Writing quests, check if they have the required submission type
                            // If they have art, they need writing too (and vice versa)
                            const hasArt = participant.submissions?.some(sub => sub.type === 'art' && sub.approved) || 
                                          (submissionType === 'art');
                            const hasWriting = participant.submissions?.some(sub => sub.type === 'writing' && sub.approved);
                            
                            // For now, mark as completed if they have at least one approved submission
                            // The monthly reward system will handle checking for both
                            if (hasArt || hasWriting) {
                                shouldComplete = true;
                            }
                        }
                        
                        if (shouldComplete) {
                            // Add submission to participant if not already there
                            const submissionExists = participant.submissions?.some(sub => 
                                sub.url === submission.messageUrl || 
                                (sub.type === submission.category && sub.approved)
                            );
                            
                            if (!submissionExists) {
                                if (!participant.submissions) {
                                    participant.submissions = [];
                                }
                                participant.submissions.push({
                                    type: submission.category,
                                    url: submission.messageUrl || submission.fileUrl,
                                    submittedAt: submission.submittedAt || submission.approvedAt,
                                    approved: true,
                                    approvedBy: submission.approvedBy,
                                    approvedAt: submission.approvedAt
                                });
                            }
                            
                            // Mark participant as completed
                            participant.progress = 'completed';
                            participant.completedAt = submission.approvedAt || new Date();
                            participant.updatedAt = new Date();
                            
                            console.log(`  🔧 Fixed: Marked ${participant.characterName} as completed (had approved submission but wasn't marked)`);
                        }
                    }
                }
                
                // Save quest after fixing participant statuses
                await quest.save();
                
                // Refresh participants array after fixing statuses
                const participants = Array.from(quest.participants.values());
                
                for (const participant of participants) {
                    try {
                        // Check for inconsistencies in progress status
                        const hasApprovedSubmission = participant.submissions?.some(sub => sub.approved === true);
                        const isCompletedButNotRewarded = participant.progress === 'completed' && 
                                                         (!participant.rewardedAt || participant.tokensEarned === 0);
                        const isActiveButHasSubmission = participant.progress === 'active' && hasApprovedSubmission;
                        
                        // Log inconsistencies
                        if (isCompletedButNotRewarded) {
                            console.log(`  ⚠️ ${participant.characterName} is marked as completed but not rewarded (needs reward processing)`);
                            totalNeedsReward++;
                        }
                        
                        if (isActiveButHasSubmission) {
                            console.log(`  ⚠️ ${participant.characterName} is marked as active but has approved submission (should be completed)`);
                        }
                        
                        // Process participants who completed or were rewarded
                        // Also process participants who have approved submissions (we just fixed them above)
                        const shouldProcess = participant.progress === 'completed' || 
                                            participant.progress === 'rewarded' ||
                                            (participant.progress === 'active' && hasApprovedSubmission);
                        
                        if (!shouldProcess) {
                            continue;
                        }
                        
                        totalParticipantsProcessed++;
                        
                        // Get the user
                        const user = await User.findOne({ discordId: participant.userId });
                        if (!user) {
                            console.log(`  ⚠️ User not found for participant ${participant.characterName} (${participant.userId})`);
                            continue;
                        }
                        
                        // Ensure quest tracking exists
                        if (!user.quests) {
                            user.quests = {
                                totalCompleted: 0,
                                lastCompletionAt: null,
                                typeTotals: {
                                    art: 0,
                                    writing: 0,
                                    interactive: 0,
                                    rp: 0,
                                    artWriting: 0,
                                    other: 0
                                },
                                completions: [],
                                legacy: {
                                    totalTransferred: 0,
                                    pendingTurnIns: 0,
                                    transferredAt: null,
                                    transferUsed: false
                                }
                            };
                        }
                        
                        if (!user.quests.completions) {
                            user.quests.completions = [];
                        }
                        
                        // Check if this quest completion is already recorded
                        const existingCompletion = user.quests.completions.find(
                            entry => entry.questId === quest.questID
                        );
                        
                        if (existingCompletion) {
                            // Update existing completion with latest data
                            existingCompletion.questType = quest.questType;
                            existingCompletion.questTitle = quest.title;
                            existingCompletion.completedAt = participant.completedAt || existingCompletion.completedAt || new Date();
                            existingCompletion.rewardedAt = participant.rewardedAt || existingCompletion.rewardedAt || participant.completedAt || new Date();
                            existingCompletion.tokensEarned = participant.tokensEarned || existingCompletion.tokensEarned || 0;
                            existingCompletion.itemsEarned = participant.itemsEarned || existingCompletion.itemsEarned || [];
                            existingCompletion.rewardSource = participant.rewardSource || existingCompletion.rewardSource || 'monthly';
                            
                            questCompletionsUpdated++;
                            totalCompletionsUpdated++;
                            
                            console.log(`  ✅ Updated completion record for ${participant.characterName} (quest already tracked)`);
                        } else {
                            // Record new completion
                            const typeKey = getQuestTypeKey(quest.questType);
                            
                            // Get approved submission date if available
                            const approvedSubmission = participant.submissions?.find(sub => sub.approved === true);
                            const completionDate = participant.completedAt || 
                                                  approvedSubmission?.approvedAt || 
                                                  approvedSubmission?.submittedAt || 
                                                  new Date();
                            
                            user.quests.completions.push({
                                questId: quest.questID,
                                questType: quest.questType,
                                questTitle: quest.title,
                                completedAt: completionDate,
                                rewardedAt: participant.rewardedAt || completionDate,
                                tokensEarned: participant.tokensEarned || 0,
                                itemsEarned: participant.itemsEarned || [],
                                rewardSource: participant.rewardSource || 'monthly'
                            });
                            
                            // Update totals
                            user.quests.totalCompleted = (user.quests.totalCompleted || 0) + 1;
                            user.quests.typeTotals[typeKey] = (user.quests.typeTotals[typeKey] || 0) + 1;
                            
                            const completionTimestamp = participant.rewardedAt || completionDate;
                            if (!user.quests.lastCompletionAt || completionTimestamp > user.quests.lastCompletionAt) {
                                user.quests.lastCompletionAt = completionTimestamp;
                            }
                            
                            await user.save();
                            
                            questCompletionsRecorded++;
                            totalCompletionsRecorded++;
                            
                            // Track user for total recalculation
                            if (!results.users.has(user.discordId)) {
                                results.users.set(user.discordId, user);
                            }
                            
                            console.log(`  ✅ Recorded new completion for ${participant.characterName}`);
                        }
                        
                    } catch (error) {
                        console.error(`  ❌ Error processing participant ${participant.characterName}:`, error.message);
                        totalErrors++;
                    }
                }
                
                // Save quest if we made updates
                if (questCompletionsRecorded > 0 || questCompletionsUpdated > 0) {
                    await quest.save();
                }
                
                results.quests.push({
                    questId: quest.questID,
                    title: quest.title,
                    completionsRecorded: questCompletionsRecorded,
                    completionsUpdated: questCompletionsUpdated
                });
                
                totalQuestsProcessed++;
                
                console.log(`  📊 Quest ${quest.questID}: ${questCompletionsRecorded} new completions recorded, ${questCompletionsUpdated} completions updated`);
                
            } catch (error) {
                console.error(`❌ Error processing quest ${quest.questID}:`, error.message);
                totalErrors++;
            }
        }
        
        // Recalculate totals for all affected users
        console.log(`\n🔄 Recalculating totals for ${results.users.size} users...`);
        let recalculatedUsers = 0;
        
        for (const [userId, user] of results.users) {
            try {
                // Recalculate totals from completions array
                const completions = user.quests.completions || [];
                
                // Count unique quest completions
                const uniqueQuestIds = new Set(completions.map(c => c.questId).filter(id => id));
                user.quests.totalCompleted = uniqueQuestIds.size;
                
                // Recalculate type totals
                user.quests.typeTotals = {
                    art: 0,
                    writing: 0,
                    interactive: 0,
                    rp: 0,
                    artWriting: 0,
                    other: 0
                };
                
                for (const completion of completions) {
                    if (completion.questId) {
                        const typeKey = getQuestTypeKey(completion.questType);
                        user.quests.typeTotals[typeKey] = (user.quests.typeTotals[typeKey] || 0) + 1;
                    }
                }
                
                // Update lastCompletionAt
                if (completions.length > 0) {
                    const latestCompletion = completions.reduce((latest, current) => {
                        const currentTime = current.rewardedAt || current.completedAt || new Date(0);
                        const latestTime = latest.rewardedAt || latest.completedAt || new Date(0);
                        return currentTime > latestTime ? current : latest;
                    });
                    
                    user.quests.lastCompletionAt = latestCompletion.rewardedAt || latestCompletion.completedAt || new Date();
                }
                
                await user.save();
                recalculatedUsers++;
                
            } catch (error) {
                console.error(`  ❌ Error recalculating totals for user ${userId}:`, error.message);
            }
        }
        
        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 FIX SUMMARY');
        console.log('='.repeat(60));
        console.log(`Quests Processed: ${totalQuestsProcessed}`);
        console.log(`Participants Processed: ${totalParticipantsProcessed}`);
        console.log(`New Completions Recorded: ${totalCompletionsRecorded}`);
        console.log(`Completions Updated: ${totalCompletionsUpdated}`);
        console.log(`Participants Needing Rewards: ${totalNeedsReward}`);
        console.log(`Users Recalculated: ${recalculatedUsers}`);
        console.log(`Errors: ${totalErrors}`);
        console.log('='.repeat(60));
        
        if (totalNeedsReward > 0) {
            console.log(`\n⚠️  WARNING: ${totalNeedsReward} participants are marked as completed but not rewarded.`);
            console.log(`   These participants need to be processed through the monthly reward system.`);
        }
        
        return {
            success: true,
            questsProcessed: totalQuestsProcessed,
            participantsProcessed: totalParticipantsProcessed,
            completionsRecorded: totalCompletionsRecorded,
            completionsUpdated: totalCompletionsUpdated,
            needsReward: totalNeedsReward,
            usersRecalculated: recalculatedUsers,
            errors: totalErrors
        };
        
    } catch (error) {
        console.error('❌ Fatal error in fixQuestCompletionTracking:', error);
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
        
        const results = await fixQuestCompletionTracking();
        
        console.log('\n✅ Script completed successfully!');
        
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

module.exports = { fixQuestCompletionTracking };

