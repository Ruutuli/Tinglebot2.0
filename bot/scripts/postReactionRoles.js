// ============================================================================
// POST REACTION ROLES TO LIVE CHANNELS
// ============================================================================

const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  setupPronounsReactionRoles,
  setupVillageReactionRoles,
  setupInactiveRoleEmbed,
  setupNotificationReactionRoles,
  setupRulesAgreementEmbed
} = require('../handlers/reactionRolesHandler');

// Load environment variables
dotenv.config({ path: require('path').join(__dirname, '../../.env') });

// Channel IDs
const ROLES_CHANNEL_ID = '787807438119370752'; // 🔔》roles
const RULES_CHANNEL_ID = '788106986327506994'; // 🔔》rules

async function postReactionRoles() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  try {
    console.log('🚀 Starting reaction roles deployment...');
    
    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ Logged in to Discord');

    // Wait for client to be ready
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });
    console.log('✅ Client is ready');

    // Get the roles channel
    const rolesChannel = await client.channels.fetch(ROLES_CHANNEL_ID);
    if (!rolesChannel) {
      throw new Error(`Roles channel ${ROLES_CHANNEL_ID} not found`);
    }
    console.log(`✅ Found roles channel: ${rolesChannel.name}`);

    // Get the rules channel
    const rulesChannel = await client.channels.fetch(RULES_CHANNEL_ID);
    if (!rulesChannel) {
      throw new Error(`Rules channel ${RULES_CHANNEL_ID} not found`);
    }
    console.log(`✅ Found rules channel: ${rulesChannel.name}`);

    // ========================================================================
    // POST TO ROLES CHANNEL
    // ========================================================================
    console.log('\n📝 Posting to roles channel...');

    console.log('📝 Posting Pronouns...');
    const pronounsMessage = await setupPronounsReactionRoles(rolesChannel);
    console.log(`✅ Pronouns posted: ${pronounsMessage.url}`);

    console.log('🏘️ Posting Village...');
    const villageMessage = await setupVillageReactionRoles(rolesChannel);
    console.log(`✅ Village posted: ${villageMessage.url}`);

    console.log('⏸️ Posting Inactive...');
    const inactiveMessage = await setupInactiveRoleEmbed(rolesChannel);
    console.log(`✅ Inactive posted: ${inactiveMessage.url}`);

    console.log('🔔 Posting Notification Roles...');
    const notificationMessage = await setupNotificationReactionRoles(rolesChannel);
    console.log(`✅ Notification Roles posted: ${notificationMessage.url}`);

    // ========================================================================
    // POST TO RULES CHANNEL
    // ========================================================================
    console.log('\n⚠️ Posting to rules channel...');

    console.log('⚠️ Posting Rules Agreement...');
    const rulesMessage = await setupRulesAgreementEmbed(rulesChannel);
    console.log(`✅ Rules Agreement posted: ${rulesMessage.url}`);

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n🎉 All reaction roles deployed successfully!');
    console.log(`\n📺 Roles Channel: https://discord.com/channels/${rolesChannel.guildId}/${ROLES_CHANNEL_ID}`);
    console.log(`📺 Rules Channel: https://discord.com/channels/${rulesChannel.guildId}/${RULES_CHANNEL_ID}`);

  } catch (error) {
    console.error('❌ Error posting reaction roles:', error);
    process.exit(1);
  } finally {
    // Close the client
    client.destroy();
    console.log('\n👋 Disconnected from Discord');
  }
}

// Run the script
if (require.main === module) {
  postReactionRoles().catch(console.error);
}

module.exports = { postReactionRoles };
