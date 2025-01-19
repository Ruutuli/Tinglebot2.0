require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { revertChannelNames } = require('../scripts/bloodmoon');

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log('🤖 Bot is ready. Reverting Blood Moon OFF...');
  try {
    // Revert channel names to original state
    await revertChannelNames(client);

    console.log('🌕 Blood Moon OFF successfully reverted for all channels!');
  } catch (error) {
    console.error('❌ Error reverting Blood Moon OFF:', error);
  } finally {
    client.destroy(); // Log out the bot after execution
  }
});

// Log in the bot
client.login(process.env.DISCORD_TOKEN);
