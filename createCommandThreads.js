// ------------------- Import necessary modules -------------------
require('dotenv').config(); // Load environment variables
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ------------------- Initialize Discord Client -------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// ------------------- Function to Create Forum Threads -------------------
async function createCommandThreads(client, channelId) {
  try {
    const guildId = process.env.GUILD_IDS; // Fetch the guild ID from .env
    if (!guildId) {
      console.error('[createCommandThreads.js]: ❌ GUILD_IDS is not defined in .env!');
      return;
    }

    const guild = await client.guilds.fetch(guildId); // Fetch the guild
    if (!guild) {
      console.error('[createCommandThreads.js]: ❌ Guild not found!');
      return;
    }

    const forumChannel = await guild.channels.fetch(channelId); // Fetch the target forum channel
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      console.error('[createCommandThreads.js]: ❌ Invalid channel type or channel not found!');
      return;
    }

    console.log(`[createCommandThreads.js]: 🏁 Creating threads in forum channel: ${forumChannel.name}`);

    // Load commands from the commands directory
    const commandFiles = fs
      .readdirSync(path.join(__dirname, 'commands'))
      .filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
      if (command?.data?.name) {
        const threadName = `/${command.data.name}`;
        const threadText = `Thread for issues involving \`${threadName}\`.`;

        try {
          // Create a post in the forum
          const thread = await forumChannel.threads.create({
            name: threadName,
            message: {
              content: threadText,
            },
            reason: `Thread for ${threadName} issues`,
          });

          console.log(`[createCommandThreads.js]: ✅ Created forum thread: ${threadName}`);
        } catch (error) {
          console.error(`[createCommandThreads.js]: ❌ Error creating thread "${threadName}":`, error);
        }
      }
    }

    console.log('[createCommandThreads.js]: ✅ All threads created successfully.');
  } catch (error) {
    console.error('[createCommandThreads.js]: ❌ Error in createCommandThreads function:', error);
  }
}

// ------------------- Login and Execute -------------------
client.once('ready', async () => {
  console.log('[createCommandThreads.js]: 🤖 Bot is online and ready.');
  const channelId = '1315866996776374302'; // Target forum channel ID
  await createCommandThreads(client, channelId);
  client.destroy(); // Disconnect the bot after completing the task
});

client.login(process.env.DISCORD_TOKEN);
