// ------------------- Environment Variables -------------------
// Load environment variables from the .env file.
require('dotenv').config();


// ------------------- Standard Libraries -------------------
// Import Node.js core modules.
const fs = require('fs');
const path = require('path');


// ------------------- Third-Party Modules -------------------
// Import modules from discord.js and cron for scheduling.
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const cron = require('node-cron');


// ------------------- Database Connections -------------------
// Import functions to establish connections to the databases.
const { connectToTinglebot, connectToInventories } = require('./database/connection');
const { generateVendingStockList } = require('./database/vendingService');


// ------------------- Handlers -------------------
// Import all interaction and component handlers.
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleModalSubmission, handleButtonModalTrigger } = require('./handlers/modalHandler');
const { handleSelectMenuInteraction } = require('./handlers/selectMenuHandler');
const { executeVending, initializeReactionHandler } = require('./handlers/vendingHandler');


// ------------------- Scripts and Utilities -------------------
// Import scripts and utility functions used across the bot.
const { renameChannels, trackBloodMoon, isBloodMoonDay } = require('./scripts/bloodmoon');
const { convertToHyruleanDate } = require('./modules/calendarModule');
const scheduler = require('./scheduler');
const { getGuildIds } = require('./utils/getGuildIds');
const { initializeRandomEncounterBot } = require('./scripts/randomEncounters');
const { createTrelloCard } = require('./scripts/trello');

// ------------------- Blood Moon Status Checker -------------------
// Logs the current Blood Moon status with real-world and Hyrulean dates.
function logBloodMoonStatus() {
  const today = new Date();
  const hyruleanDate = convertToHyruleanDate(today);
  let isBloodMoon = false;

  try {
    isBloodMoon = isBloodMoonDay();
  } catch (error) {
    console.error(`[index.js]: Error checking Blood Moon status: ${error.message}`);
  }

  console.log(`[index.js]: 🌕 Blood Moon Today (Real Date: ${today.toISOString().slice(0, 10)}, Hyrulean Date: ${hyruleanDate}): ${isBloodMoon}`);
}


// ------------------- Global Variables -------------------
// Define global variables used by the bot.
let client;


// ------------------- Database Initialization -------------------
// Establish connections to the required databases.
async function initializeDatabases() {
  try {
    await connectToTinglebot();
    await connectToInventories();
    console.log('[index.js]: ✅ Databases connected');
  } catch (err) {
    console.error('[index.js]: ❌ Database initialization error:', err);
    throw err;
  }
}


// ------------------- Client Initialization -------------------
// Sets up the Discord client, loads commands, and defines event handlers.
async function initializeClient() {
  await initializeDatabases();

  // Create a new Discord client with the necessary intents.
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Initialize the commands collection and load command files.
  client.commands = new Collection();
  const commandFiles = fs
    .readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }

  // ------------------- Bot Ready Event -------------------
  // When the bot is ready, initialize reaction handlers, log Blood Moon status, and start the scheduler.
  client.once('ready', async () => {
    console.log('[index.js]: 🤖 Bot is online');

    initializeReactionHandler(client);
    logBloodMoonStatus();
    scheduler(client);

    try {
      initializeRandomEncounterBot(client);
      console.log('[index.js]: ⚔️ Random encounter functionality initialized');
    } catch (error) {
      console.error('[index.js]: ❌ Error initializing random encounters:', error);
    }
  });

  // ------------------- Interaction Handlers -------------------
  // Define handlers for different types of interactions.
  client.on('interactionCreate', async interaction => {
    try {
      const allowedChannels = [
        '1305487405985431583', // Path of Scarlet Leaves
        '1305487571228557322'  // Leaf Dew Way
      ];

      if (interaction.isCommand()) {
        // Check if the command is allowed in the current channel.
        if (allowedChannels.includes(interaction.channelId) && interaction.commandName !== 'travel') {
          console.warn(`[index.js]: Command '${interaction.commandName}' not allowed in channel ${interaction.channelId}.`);
          await interaction.reply({
            content: `🚫 Only the \`/travel\` command is allowed in this channel.`,
            ephemeral: true
          });
          return;
        }

        // Execute the command if it exists.
        const command = client.commands.get(interaction.commandName);
        if (command) {
          console.info(`[index.js]: Executing command '${interaction.commandName}'.`);
          await command.execute(interaction);
        }
      } else if (interaction.isButton()) {
        console.info(`[index.js]: Button interaction detected. CustomId=${interaction.customId}`);
        if (interaction.customId.startsWith('triggerModal-')) {
          const { handleButtonModalTrigger } = require('./handlers/modalHandler');
          await handleButtonModalTrigger(interaction);
        } else {
          await handleComponentInteraction(interaction);
        }
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
        console.log(`[index.js]: Autocomplete interaction detected: ${interaction.commandName}`);
        await handleAutocomplete(interaction);
      } else if (interaction.isModalSubmit()) {
        const { handleModalSubmission } = require('./handlers/modalHandler');
        await handleModalSubmission(interaction);
      } else {
        console.warn(`[index.js]: Unhandled interaction type: ${interaction.type}`);
      }
    } catch (error) {
      console.error('[index.js]: ❌ Interaction error:', error);
    }
  });

// ------------------- Forum Bug Report Listener -------------------
// Detect new thread (forum post)
client.on('threadCreate', async thread => {
  if (thread.parentId !== '1315866996776374302') return; // Feedback Forum Channel ID
  console.log(`[index.js]: New forum thread created: ${thread.name}`);
  
  // Fetch the starter message
  const starterMessage = await thread.fetchStarterMessage();
  if (!starterMessage || starterMessage.author.bot) return;
  if (!starterMessage.content.replace(/\*/g, '').startsWith('Command:')) return;

  const threadName = thread.name;
  const username = starterMessage.author.tag;
  const content = starterMessage.content;
  const createdAt = starterMessage.createdAt;
  const images = starterMessage.attachments.map(attachment => attachment.url);

  const cardUrl = await createTrelloCard({ threadName, username, content, images, createdAt });

  if (cardUrl) {
    await starterMessage.reply(`✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`);
  } else {
    await starterMessage.reply(`❌ Failed to send bug report to Trello.`);
  }
});

// Detect new message in forum thread (reply)
client.on('messageCreate', async message => {
  if (message.channel.parentId !== '1315866996776374302') return; // Feedback Forum Channel ID
  if (message.author.bot) return;

  // ------------------- Bug Report Format Validation -------------------
if (!message.content.replace(/\*/g, '').startsWith('Command')) {
  const reply = await message.reply(
    `❌ **Bug Report Rejected — Missing Required Format!**\n\n` +
    `Your message could not be processed because it is missing the required starting line:\n` +
    `\`Command: [Command Name]\`\n\n` +
    `> This line **must** be the very first line of your bug report.\n` +
    `> Example:\n` +
    `Command: /gather\n\n` +
    `---\n` +
    `### Why was this rejected?\n` +
    `We automatically check for \`Command:\` at the top of your message so we know what command you are reporting a bug for.\n\n` +
    `Without this line, we can't create a Trello ticket for your report.\n\n` +
    `---\n` +
    `### How to fix your report:\n` +
    `Please edit your message to follow this format:\n\n` +
    `**Command:** [Specify the command or feature]\n` +
    `**Issue:** [Brief description of the problem]\n` +
    `**Steps to Reproduce:**\n` +
    `1. [Step 1]\n` +
    `2. [Step 2]\n` +
    `**Error Output:**\n` +
    `[Copy and paste the exact error message or output text here]\n` +
    `**Screenshots:** [Attach screenshots if possible]\n` +
    `**Expected Behavior:** [What you expected to happen]\n` +
    `**Actual Behavior:** [What actually happened]`
  );

  setTimeout(() => {
    reply.delete().catch(() => {});
  }, 600000); // 10 minutes

  return;
}

  const threadName = message.channel.name;
  const username = message.author.tag;
  const content = message.content;
  const createdAt = message.createdAt;
  const images = message.attachments.map(attachment => attachment.url);

  const cardUrl = await createTrelloCard({ threadName, username, content, images, createdAt });

  if (cardUrl) {
    await message.reply(`✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`);
  } else {
    await message.reply(`❌ Failed to send bug report to Trello.`);
  }  
});


// ------------------- Login the Bot -------------------
// Initialize the client and start the bot.
client.login(process.env.DISCORD_TOKEN);

}


// ------------------- Start Client Initialization -------------------
// Initialize the client and start the bot.
initializeClient();
