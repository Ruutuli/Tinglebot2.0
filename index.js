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

  // ------------------- Login the Bot -------------------
  client.login(process.env.DISCORD_TOKEN);
}


// ------------------- Start Client Initialization -------------------
// Initialize the client and start the bot.
initializeClient();
