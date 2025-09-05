// ============================================================================
// ------------------- testQuestPosting.js -------------------
// Test script to use main quest logic but post to test channel
// ============================================================================

const { Client, GatewayIntentBits } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { connectToTinglebot } = require('../database/db');

// ------------------- Discord Bot Setup -------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const TEST_CHANNEL_ID = '1391812848099004578'; // Test channel ID

// Override the QUEST_CHANNEL_ID before importing the module
process.env.TEST_CHANNEL_ID = TEST_CHANNEL_ID;

// Import the main quest posting logic
const questAnnouncements = require('./questAnnouncements');

// ------------------- Function to Run Test Quest Posting -------------------
async function runTestQuestPosting() {
    console.log('[TEST]: Starting test quest posting using main quest logic...');
    
    try {
        // Ensure database connection
        await connectToTinglebot();
        console.log('[TEST]: ✅ Database connection successful');
        
        console.log(`[TEST]: Using test channel ID: ${TEST_CHANNEL_ID}`);
        
        // Run the main quest posting logic with test channel
        await questAnnouncements.postQuests();
        
        console.log('[TEST]: ✅ Test quest posting completed successfully!');
    } catch (error) {
        handleError(error, 'testQuestPosting.js');
        console.error('[TEST]: ❌ Test quest posting failed:', error);
        throw error;
    }
}

// ------------------- Discord Bot Event Listeners -------------------
client.once('ready', async () => {
    console.log(`[TEST BOT]: Logged in as ${client.user.tag}`);
    console.log(`[TEST BOT]: Test channel ID: ${TEST_CHANNEL_ID}`);
    console.log(`[TEST BOT]: Using main quest logic with test channel override...`);
    
    try {
        await runTestQuestPosting();
        console.log(`[TEST BOT]: Test quest posting completed. Exiting...`);
        process.exit(0); // Exit after posting
    } catch (error) {
        handleError(error, 'testQuestPosting.js');
        console.error('[TEST BOT]: Failed to post quests:', error);
        process.exit(1);
    }
});

client.on('error', (error) => {
    console.error('[TEST BOT]: Discord client error:', error);
});

// ------------------- Login Bot -------------------
client.login(process.env.DISCORD_BOT_TOKEN);
