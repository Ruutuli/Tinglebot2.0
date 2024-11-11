// ------------------- Import necessary modules -------------------
require('dotenv').config(); // Load .env file to use environment variables
const { Client, GatewayIntentBits } = require('discord.js');
const { sendBloodMoonAnnouncement, trackBloodMoonCycle, renameChannels, revertChannelNames } = require('./scripts/bloodmoon'); // Adjust the path as needed

// Set up the Discord client with appropriate intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Token for your bot (loaded from .env)
const token = process.env.DISCORD_TOKEN; // Securely load the token from .env
const channelId = process.env.BLOODMOON_ANNOUNCMENTS_CHANNEL_ID; // Updated channel ID for Bloodmoon announcements

// ------------------- Test function for Blood Moon announcements -------------------
async function testBloodMoonAnnouncement() {
  try {
    console.log('🌕 Testing Blood Moon announcement...');
    await sendBloodMoonAnnouncement(client, channelId, 'Blood Moon testing in progress!');
    console.log('✅ Blood Moon announcement test completed.');
  } catch (error) {
    console.error('❌ Error during Blood Moon announcement test:', error);
  }
}

// ------------------- Test function to trigger channel renaming -------------------
async function testRenameChannels() {
  try {
    console.log('🔄 Testing channel renaming for Blood Moon...');
    await renameChannels(client);
    console.log('✅ Channel renaming test completed.');
  } catch (error) {
    console.error('❌ Error during channel renaming test:', error);
  }
}

// ------------------- Test function to revert channel names -------------------
async function testRevertChannelNames() {
  try {
    console.log('🔄 Testing channel name reversion after Blood Moon...');
    await revertChannelNames(client);
    console.log('✅ Channel name reversion test completed.');
  } catch (error) {
    console.error('❌ Error during channel name reversion test:', error);
  }
}

// ------------------- Test function for tracking the Blood Moon cycle -------------------
function testTrackBloodMoonCycle() {
  console.log('🔄 Tracking Blood Moon cycle...');
  trackBloodMoonCycle(client, channelId);
  console.log('✅ Blood Moon cycle tracking test completed.');
}

// ------------------- Login the bot and trigger the test functions -------------------
client.once('ready', async () => {
  console.log('🤖 Bot is logged in and ready for testing...');

  // Uncomment the specific test functions you want to run
  await testBloodMoonAnnouncement(); // Test Blood Moon announcement
await testRenameChannels();      // Test channel renaming
await testRevertChannelNames();  // Test reverting channel names
 testTrackBloodMoonCycle();       // Test Blood Moon cycle tracking

  // Close the bot after testing
  client.destroy();
});

// Log the bot in
client.login(token); // Log in using the token from .env
