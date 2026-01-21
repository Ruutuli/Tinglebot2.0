// ============================================================================
// ------------------- fixCollabQuestTokens.js -------------------
// Script to fix token distribution for existing approved collab quest submissions
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const ApprovedSubmission = require('./shared/models/ApprovedSubmissionModel');
const Quest = require('./shared/models/QuestModel');
const User = require('./shared/models/UserModel');
const { 
  getQuestBonus, 
  getCollabBonus, 
  calculateWritingTokensWithCollab,
  calculateTokens 
} = require('./shared/utils/tokenUtils');
const { 
  appendEarnedTokens, 
  updateTokenBalance 
} = require('./shared/database/db');

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

async function fixSubmission(submission, dryRun = true) {
    try {
        const submissionId = submission.submissionId;
        const questEvent = submission.questEvent;
        const collab = submission.collab || [];
        const category = submission.category;
        const wordCount = submission.wordCount;
        
        console.log(`\n📝 Processing submission: ${submissionId}`);
        console.log(`   Quest: ${questEvent}`);
        console.log(`   Category: ${category}`);
        console.log(`   Collab: ${collab.length > 0 ? collab.join(', ') : 'None'}`);
        console.log(`   Current finalTokenAmount: ${submission.finalTokenAmount}`);
        
        // Get quest to extract bonuses
        const quest = await Quest.findOne({ questID: questEvent });
        if (!quest) {
            console.log(`   ⚠️  Quest ${questEvent} not found, skipping...`);
            return { success: false, reason: 'Quest not found' };
        }
        
        const questBonus = await getQuestBonus(questEvent, submission.userId);
        const collabBonus = await getCollabBonus(questEvent);
        
        console.log(`   Quest bonus: ${questBonus}`);
        console.log(`   Collab bonus: ${collabBonus}`);
        
        // Calculate correct tokens per person
        let correctTokensPerPerson = 0;
        let baseTokens = 0;
        
        if (category === 'writing') {
            if (!wordCount) {
                console.log(`   ⚠️  No word count found for writing submission, skipping...`);
                return { success: false, reason: 'No word count' };
            }
            
            const calculation = calculateWritingTokensWithCollab(wordCount, collab, questBonus, collabBonus);
            correctTokensPerPerson = calculation.tokensPerPerson;
            baseTokens = calculation.breakdown.baseTokens;
        } else {
            // Art submission - need to recalculate
            if (!submission.baseSelections || submission.baseSelections.length === 0) {
                console.log(`   ⚠️  No base selections found for art submission, skipping...`);
                return { success: false, reason: 'No base selections' };
            }
            
            // Convert Maps to objects if needed
            const baseCounts = submission.baseCounts instanceof Map 
                ? Object.fromEntries(submission.baseCounts) 
                : submission.baseCounts || {};
            
            const typeMultiplierCounts = submission.typeMultiplierCounts instanceof Map
                ? Object.fromEntries(submission.typeMultiplierCounts)
                : submission.typeMultiplierCounts || {};
            
            const calculation = calculateTokens({
                baseSelections: submission.baseSelections,
                baseCounts: baseCounts,
                typeMultiplierSelections: submission.typeMultiplierSelections || [],
                productMultiplierValue: submission.productMultiplierValue,
                addOnsApplied: submission.addOnsApplied || [],
                typeMultiplierCounts: typeMultiplierCounts,
                specialWorksApplied: submission.specialWorksApplied || [],
                collab: collab,
                questBonus: questBonus,
                collabBonus: collabBonus
            });
            
            correctTokensPerPerson = calculation.tokensPerPerson;
            baseTokens = calculation.breakdown.baseTokensPerPerson || calculation.breakdown.regularTotal || 0;
        }
        
        console.log(`   Correct tokens per person: ${correctTokensPerPerson}`);
        
        // Calculate what was given (incorrectly split)
        // Old logic: split finalTokenAmount between all participants
        // New logic: finalTokenAmount should be tokensPerPerson
        const hasCollab = collab && collab.length > 0;
        const totalParticipants = hasCollab ? (1 + collab.length) : 1;
        
        // Check if tokenCalculation has tokensPerPerson (new format) or if we need to calculate old split
        let tokensGivenPerPerson = submission.finalTokenAmount;
        if (submission.tokenCalculation && typeof submission.tokenCalculation === 'object') {
            tokensGivenPerPerson = submission.tokenCalculation.tokensPerPerson || 
                                   submission.tokenCalculation.finalTotal || 
                                   submission.finalTokenAmount;
        } else {
            // Old format: tokens were split, so calculate what each person got
            tokensGivenPerPerson = Math.floor(submission.finalTokenAmount / totalParticipants);
        }
        
        console.log(`   Tokens given per person (incorrect): ${tokensGivenPerPerson}`);
        
        // Calculate difference
        const tokenDifference = correctTokensPerPerson - tokensGivenPerPerson;
        console.log(`   Token difference per person: ${tokenDifference > 0 ? '+' : ''}${tokenDifference}`);
        
        if (tokenDifference === 0) {
            console.log(`   ✅ No correction needed, tokens are already correct`);
            return { success: true, corrected: false, reason: 'Already correct' };
        }
        
        if (!dryRun) {
            // Get all participants (submitter + collaborators)
            const participants = [submission.userId];
            if (hasCollab) {
                for (const collaboratorMention of collab) {
                    const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
                    participants.push(collaboratorId);
                }
            }
            
            // Update token balances for all participants
            const submissionTitle = submission.title || submission.fileName || 'Untitled';
            const submissionUrl = submission.fileUrl || submission.link || '';
            
            for (const participantId of participants) {
                try {
                    // Add the difference to their balance
                    await updateTokenBalance(participantId, tokenDifference);
                    
                    // Also log it to their token tracker (optional - you might want to skip this)
                    // await appendEarnedTokens(participantId, submissionTitle, category, tokenDifference, submissionUrl);
                    
                    console.log(`   ✅ Updated balance for user ${participantId}: +${tokenDifference} tokens`);
                } catch (error) {
                    console.error(`   ❌ Error updating balance for user ${participantId}:`, error.message);
                    throw error;
                }
            }
            
            // Update submission record with correct token amount (optional)
            submission.finalTokenAmount = correctTokensPerPerson;
            submission.tokenCalculation = {
                ...(submission.tokenCalculation || {}),
                tokensPerPerson: correctTokensPerPerson,
                baseTokensPerPerson: baseTokens,
                questBonus: questBonus,
                collabBonus: hasCollab ? collabBonus : 0
            };
            await submission.save();
            console.log(`   💾 Updated submission record`);
        }
        
        return {
            success: true,
            corrected: true,
            submissionId,
            tokensGivenPerPerson,
            correctTokensPerPerson,
            tokenDifference,
            participants: totalParticipants
        };
    } catch (error) {
        console.error(`   ❌ Error processing submission:`, error);
        return { success: false, reason: error.message };
    }
}

// ============================================================================
// ------------------- Main Fix Function -------------------
// ============================================================================

async function fixCollabQuestTokens(dryRun = true) {
    try {
        console.log('🔍 Starting collab quest token fix...\n');
        if (dryRun) {
            console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
        }
        
        // Find all approved submissions with collab and questEvent
        const submissions = await ApprovedSubmission.find({
            $and: [
                { collab: { $exists: true, $ne: [], $ne: null } },
                { questEvent: { $exists: true, $ne: 'N/A', $ne: null } },
                { approvedAt: { $exists: true } }
            ]
        });
        
        console.log(`📋 Found ${submissions.length} approved collab quest submissions to process\n`);
        
        if (submissions.length === 0) {
            console.log('✅ No submissions to fix!');
            return;
        }
        
        let totalProcessed = 0;
        let totalCorrected = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        let totalTokensAdded = 0;
        
        const results = {
            corrected: [],
            skipped: [],
            errors: []
        };
        
        for (const submission of submissions) {
            totalProcessed++;
            const result = await fixSubmission(submission, dryRun);
            
            if (result.success && result.corrected) {
                totalCorrected++;
                totalTokensAdded += result.tokenDifference * result.participants;
                results.corrected.push(result);
            } else if (result.success && !result.corrected) {
                totalSkipped++;
                results.skipped.push({ submissionId: submission.submissionId, reason: result.reason });
            } else {
                totalErrors++;
                results.errors.push({ submissionId: submission.submissionId, reason: result.reason });
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total processed: ${totalProcessed}`);
        console.log(`✅ Corrected: ${totalCorrected}`);
        console.log(`⏭️  Skipped: ${totalSkipped}`);
        console.log(`❌ Errors: ${totalErrors}`);
        if (totalCorrected > 0 && !dryRun) {
            console.log(`💰 Total tokens added: ${totalTokensAdded}`);
        }
        console.log('='.repeat(60));
        
        if (dryRun && totalCorrected > 0) {
            console.log('\n⚠️  This was a DRY RUN. Run again with dryRun=false to apply changes.');
        }
        
        return results;
    } catch (error) {
        console.error('❌ Error in fixCollabQuestTokens:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Script Execution -------------------
// ============================================================================

async function main() {
    try {
        const connected = await connectToDatabase();
        if (!connected) {
            console.error('❌ Failed to connect to database');
            process.exit(1);
        }
        
        // Get dry run flag from command line arguments
        const args = process.argv.slice(2);
        const dryRun = !args.includes('--execute');
        
        await fixCollabQuestTokens(dryRun);
        
        console.log('\n✅ Script completed successfully');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Script failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { fixCollabQuestTokens };
