require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { triggerBloodMoonNow, renameChannels } = require('../scripts/bloodmoon');

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
  console.log('🤖 Bot is ready. Triggering Blood Moon ON...');
  try {
    const rudaniaChannelId = process.env.RUDANIA_TOWN_HALL;
    const inarikoChannelId = process.env.INARIKO_TOWN_HALL;
    const vhintlChannelId = process.env.VHINTL_TOWN_HALL;

    // Execute all Blood Moon announcements in parallel
    await Promise.all([
      triggerBloodMoonNow(client, rudaniaChannelId),
      triggerBloodMoonNow(client, inarikoChannelId),
      triggerBloodMoonNow(client, vhintlChannelId),
    ]);

    console.log('🌕 Blood Moon ON successfully triggered for all channels!');
  } catch (error) {
    console.error('❌ Error triggering Blood Moon ON:', error);
  } finally {
    client.destroy(); // Log out the bot after execution
  }
});

client.login(process.env.DISCORD_TOKEN);
