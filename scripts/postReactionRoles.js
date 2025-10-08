// ============================================================================
// POST REACTION ROLES TO CHANNEL
// ============================================================================

const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  setupAllReactionRoles,
  setupPronounsReactionRoles,
  setupVillageReactionRoles,
  setupInactiveRoleEmbed,
  setupNotificationReactionRoles
} = require('../handlers/reactionRolesHandler');

// Load environment variables
dotenv.config();

// Target channel ID
const TARGET_CHANNEL_ID = '1391812848099004578';

async function postReactionRoles() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  try {
    console.log('🚀 Starting reaction roles posting script...');
    
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

    // Clear existing messages in the channel (optional)
    console.log('🧹 Clearing existing messages...');
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      if (messages.size > 0) {
        await channel.bulkDelete(messages);
        console.log(`✅ Deleted ${messages.size} existing messages`);
      }
    } catch (error) {
      console.log('⚠️ Could not clear messages (may not have permission)');
    }

    // Post a header message
    await channel.send('🎭 **Reaction Roles Test** - Checking formatting and functionality...\n*This is a test of the reaction roles system.*\n');

    // Set up all reaction roles
    console.log('📝 Setting up all reaction roles...');
    const messages = await setupAllReactionRoles(channel);
    
    console.log('✅ Successfully posted all reaction roles!');
    console.log('\n📋 Posted Messages:');
    console.log(`   📝 Pronouns: ${messages.pronouns.url}`);
    console.log(`   🏘️ Villages: ${messages.villages.url}`);
    console.log(`   ⏸️ Inactive: ${messages.inactive.url}`);
    console.log(`   🔔 Notifications: ${messages.notifications.url}`);

    // Post a footer message
    await channel.send('\n🎉 **Reaction Roles Setup Complete!**\n*You can now test the reactions to see if roles are assigned correctly.*');

    console.log('\n🎉 All reaction roles have been posted successfully!');
    console.log(`📺 Check channel: https://discord.com/channels/${channel.guildId}/${TARGET_CHANNEL_ID}`);

  } catch (error) {
    console.error('❌ Error posting reaction roles:', error);
    process.exit(1);
  } finally {
    // Close the client
    client.destroy();
    console.log('👋 Disconnected from Discord');
  }
}

// Run the script
if (require.main === module) {
  postReactionRoles().catch(console.error);
}

module.exports = { postReactionRoles };
