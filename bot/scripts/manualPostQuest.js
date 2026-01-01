// ============================================================================
// ------------------- manualPostQuest.js -------------------
// Script to manually post all quests for the current month from Google Sheets
// This works exactly like the automatic midnight quest posting
// Usage: node bot/scripts/manualPostQuest.js
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');

// Import the quest posting function
const questAnnouncements = require('./questAnnouncements');

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

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

async function loginDiscordClient() {
    try {
        const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            throw new Error('DISCORD_TOKEN or DISCORD_BOT_TOKEN not found in environment variables');
        }
        await client.login(token);
        console.log('✅ Logged in to Discord');
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            client.once('ready', resolve);
        });
        console.log('✅ Discord client is ready\n');
        
        return true;
    } catch (error) {
        console.error('❌ Error logging in to Discord:', error);
        return false;
    }
}

// ============================================================================
// ------------------- Main Function -------------------
// ============================================================================

async function manualPostAllQuests() {
    try {
        console.log('🚀 Starting manual quest post (works like midnight posting)...\n');
        
        // Use the existing postQuests function which handles:
        // - Fetching quests from Google Sheets
        // - Filtering for current month
        // - Filtering for unposted quests
        // - Posting month image
        // - Processing and posting each quest
        // - Saving to database
        // - Updating Google Sheets
        
        await questAnnouncements.postQuests(client);
        
        console.log('\n✅ Quest posting completed!');
        
    } catch (error) {
        console.error('❌ Error posting quests:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Main Execution -------------------
// ============================================================================

async function main() {
    try {
        // Connect to database
        const dbConnected = await connectToDatabase();
        if (!dbConnected) {
            process.exit(1);
        }
        
        // Login to Discord
        const discordLoggedIn = await loginDiscordClient();
        if (!discordLoggedIn) {
            await mongoose.connection.close();
            process.exit(1);
        }
        
        // Post quests
        await manualPostAllQuests();
        
        // Cleanup
        await client.destroy();
        await mongoose.connection.close();
        console.log('\n✅ Script completed successfully!');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        if (client) await client.destroy();
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { manualPostAllQuests };
