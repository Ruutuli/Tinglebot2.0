// ------------------- Import necessary modules -------------------
require('dotenv').config(); // Load environment variables
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

// ------------------- Initialize Discord Client -------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// ------------------- Function to Delete All Threads -------------------
async function deleteThreads(client) {
  try {
    const guildId = process.env.GUILD_IDS; // Fetch the guild ID from .env
    if (!guildId) {
      console.error('[deleteThreads.js]: ❌ GUILD_IDS is not defined in .env!');
      return;
    }

    const guild = await client.guilds.fetch(guildId); // Fetch the guild
    if (!guild) {
      console.error('[deleteThreads.js]: ❌ Guild not found!');
      return;
    }

    console.log(`[deleteThreads.js]: 🏁 Fetching threads in guild: ${guild.name}`);

    const channels = await guild.channels.fetch(); // Fetch all channels in the guild
    let threadCount = 0;

    for (const [id, channel] of channels) {
      if (
        channel.type === ChannelType.GuildText || // Parent text channels
        channel.type === ChannelType.GuildForum // Parent forum channels
      ) {
        // Fetch active threads for each parent channel
        const activeThreads = await channel.threads.fetchActive();
        for (const [threadId, thread] of activeThreads.threads) {
          try {
            await thread.delete();
            console.log(`[deleteThreads.js]: 🗑️ Deleted active thread: ${thread.name}`);
            threadCount++;
          } catch (error) {
            console.error(`[deleteThreads.js]: ❌ Error deleting thread "${thread.name}":`, error);
          }
        }

        // Fetch archived threads for each parent channel
        const archivedThreads = await channel.threads.fetchArchived();
        for (const [threadId, thread] of archivedThreads.threads) {
          try {
            await thread.delete();
            console.log(`[deleteThreads.js]: 🗑️ Deleted archived thread: ${thread.name}`);
            threadCount++;
          } catch (error) {
            console.error(`[deleteThreads.js]: ❌ Error deleting thread "${thread.name}":`, error);
          }
        }
      }
    }

    if (threadCount === 0) {
      console.log('[deleteThreads.js]: ✅ No threads found to delete.');
    } else {
      console.log(`[deleteThreads.js]: ✅ Successfully deleted ${threadCount} threads.`);
    }
  } catch (error) {
    console.error('[deleteThreads.js]: ❌ Error in deleteThreads function:', error);
  }
}

// ------------------- Login and Execute -------------------
client.once('ready', async () => {
  console.log('[deleteThreads.js]: 🤖 Bot is online and ready.');
  await deleteThreads(client);
  client.destroy(); // Disconnect the bot after completing the task
});

client.login(process.env.DISCORD_TOKEN);
