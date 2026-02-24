// ============================================================================
// Find Inactive Users Script
// Identifies users who haven't sent a message in the last 3 months
// Run from bot directory: node scripts/findInactiveUsers.js
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables - try root .env first, then bot/.env as fallback
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const botEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    console.log('Loaded env from root:', rootEnvPath);
} else if (fs.existsSync(botEnvPath)) {
    dotenv.config({ path: botEnvPath });
    console.log('Loaded env from bot:', botEnvPath);
} else {
    console.log('No .env file found, using system environment variables');
}

// Connect to MongoDB
async function connectToTinglebot() {
    const uri = process.env.MONGODB_TINGLEBOT_URI || process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_TINGLEBOT_URI or MONGODB_URI not set in environment');
    }
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
}

const MessageTracking = require('../models/MessageTrackingModel');
const Character = require('../models/CharacterModel');

async function findInactiveUsers() {
    try {
        console.log('Connecting to database...');
        await connectToTinglebot();
        console.log('Connected!\n');

        // Calculate date 3 months ago
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const cutoffDayKey = threeMonthsAgo.toISOString().split('T')[0];

        console.log(`Checking for users inactive since: ${cutoffDayKey}\n`);

        // Get all unique user IDs from characters
        const allCharacters = await Character.find({}, 'userId name').lean();
        const userCharacterMap = new Map();
        
        // Group characters by userId
        for (const char of allCharacters) {
            if (!userCharacterMap.has(char.userId)) {
                userCharacterMap.set(char.userId, []);
            }
            userCharacterMap.get(char.userId).push(char.name);
        }

        const allUserIds = Array.from(userCharacterMap.keys());
        console.log(`Found ${allUserIds.length} unique users with characters\n`);

        // Get last message timestamp for each user using aggregation
        const lastMessages = await MessageTracking.aggregate([
            {
                $group: {
                    _id: '$userId',
                    lastMessageDate: { $max: '$timestamp' },
                    lastDayKey: { $max: '$dayKey' }
                }
            }
        ]);

        // Create a map of userId -> last message info
        const lastMessageMap = new Map();
        for (const msg of lastMessages) {
            lastMessageMap.set(msg._id, {
                lastMessageDate: msg.lastMessageDate,
                lastDayKey: msg.lastDayKey
            });
        }

        // Find inactive users
        const inactiveUsers = [];
        const neverMessaged = [];

        for (const userId of allUserIds) {
            const lastMsg = lastMessageMap.get(userId);
            const characterNames = userCharacterMap.get(userId);

            if (!lastMsg) {
                // User has never sent a tracked message
                neverMessaged.push({
                    userId,
                    characterNames
                });
            } else if (lastMsg.lastDayKey < cutoffDayKey) {
                // User hasn't messaged in 3+ months
                inactiveUsers.push({
                    userId,
                    characterNames,
                    lastMessageDate: lastMsg.lastMessageDate,
                    lastDayKey: lastMsg.lastDayKey
                });
            }
        }

        // Sort inactive users by last message date (oldest first)
        inactiveUsers.sort((a, b) => new Date(a.lastMessageDate) - new Date(b.lastMessageDate));

        // Output results
        console.log('='.repeat(60));
        console.log('INACTIVE USERS (No message in last 3 months)');
        console.log('='.repeat(60));
        console.log(`Total inactive: ${inactiveUsers.length}\n`);

        for (const user of inactiveUsers) {
            const daysSince = Math.floor((new Date() - new Date(user.lastMessageDate)) / (1000 * 60 * 60 * 24));
            console.log(`User ID: ${user.userId}`);
            console.log(`  Characters: ${user.characterNames.join(', ')}`);
            console.log(`  Last message: ${user.lastDayKey} (${daysSince} days ago)`);
            console.log('');
        }

        console.log('='.repeat(60));
        console.log('USERS WITH NO TRACKED MESSAGES');
        console.log('='.repeat(60));
        console.log(`Total: ${neverMessaged.length}\n`);

        for (const user of neverMessaged) {
            console.log(`User ID: ${user.userId}`);
            console.log(`  Characters: ${user.characterNames.join(', ')}`);
            console.log('');
        }

        // Summary
        console.log('='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total users with characters: ${allUserIds.length}`);
        console.log(`Inactive (3+ months): ${inactiveUsers.length}`);
        console.log(`Never messaged (tracked): ${neverMessaged.length}`);
        console.log(`Active: ${allUserIds.length - inactiveUsers.length - neverMessaged.length}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

findInactiveUsers();
