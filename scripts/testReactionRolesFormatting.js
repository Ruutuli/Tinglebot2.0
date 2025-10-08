// ============================================================================
// TEST REACTION ROLES FORMATTING
// ============================================================================

const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  setupPronounsReactionRoles,
  setupVillageReactionRoles,
  setupInactiveRoleEmbed,
  setupNotificationReactionRoles
} = require('../handlers/reactionRolesHandler');

// Load environment variables
dotenv.config();

// Target channel ID
const TARGET_CHANNEL_ID = '1391812848099004578';

async function testReactionRolesFormatting() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  try {
    console.log('🚀 Starting reaction roles formatting test...');
    
    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ Logged in to Discord');

    // Wait for client to be ready
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });
    console.log('✅ Client is ready');

    // Get the target channel
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) {
      throw new Error(`Channel ${TARGET_CHANNEL_ID} not found`);
    }
    console.log(`✅ Found target channel: ${channel.name}`);

    // Post header
    await channel.send('🧪 **Reaction Roles Formatting Test**\n*Testing individual embed formatting...*\n');

    // Test each embed individually using the setup functions
    console.log('📝 Testing Pronouns embed...');
    const pronounsMessage = await setupPronounsReactionRoles(channel);
    console.log(`✅ Pronouns embed posted: ${pronounsMessage.url}`);

    console.log('🏘️ Testing Village embed...');
    const villageMessage = await setupVillageReactionRoles(channel);
    console.log(`✅ Village embed posted: ${villageMessage.url}`);

    console.log('⏸️ Testing Inactive embed...');
    const inactiveMessage = await setupInactiveRoleEmbed(channel);
    console.log(`✅ Inactive embed posted: ${inactiveMessage.url}`);

    console.log('🔔 Testing Notification Roles embed...');
    const notificationMessage = await setupNotificationReactionRoles(channel);
    console.log(`✅ Notification embed posted: ${notificationMessage.url}`);

    // Post footer
    await channel.send('\n🎉 **Formatting Test Complete!**\n*Check the embeds above for formatting and test the reactions.*');

    console.log('\n🎉 All formatting tests completed successfully!');
    console.log(`📺 Check channel: https://discord.com/channels/${channel.guildId}/${TARGET_CHANNEL_ID}`);

  } catch (error) {
    console.error('❌ Error testing reaction roles formatting:', error);
    process.exit(1);
  } finally {
    // Close the client
    client.destroy();
    console.log('👋 Disconnected from Discord');
  }
}

// Run the script
if (require.main === module) {
  testReactionRolesFormatting().catch(console.error);
}

module.exports = { testReactionRolesFormatting };
