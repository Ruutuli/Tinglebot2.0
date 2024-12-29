// ------------------- Import necessary modules -------------------

// Environment Variables
require('dotenv').config();

// Standard Libraries
const fs = require('fs');
const path = require('path');

// Third-Party Modules
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const cron = require('node-cron');

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection');
const { generateVendingStockList } = require('./database/vendingService');

// ------------------- Handlers -------------------
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleModalSubmission, handleButtonModalTrigger  } = require('./handlers/modalHandler');
const { handleSelectMenuInteraction } = require('./handlers/selectMenuHandler');
const { executeVending, initializeReactionHandler } = require('./handlers/vendingHandler');

// ------------------- Scripts and Utilities -------------------
const { renameChannels, trackBloodMoonCycle, currentDayInCycle, isBloodMoonActive } = require('./scripts/bloodmoon');
const scheduler = require('./scheduler');
const { getGuildIds } = require('./utils/getGuildIds');
const { initializeRandomEncounterBot } = require('./scripts/randomEncounters');

// ------------------- Global Variables -------------------
let client;

// ------------------- Initialize Databases -------------------
// Establishes connections to required databases
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

// ------------------- Initialize Client -------------------
// Sets up the Discord client, commands, and interactions
async function initializeClient() {
  await initializeDatabases();

  // Configure client with necessary intents
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Load commands
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
  client.once('ready', async () => {
    console.log('[index.js]: 🤖 Bot is online');

        // Initialize the reaction handler
        initializeReactionHandler(client);

    // Blood Moon Status on Startup
    console.log(`[index.js]: [Startup] Current Day in Cycle: ${currentDayInCycle}`);
    if (isBloodMoonActive()) {
      console.log(`[index.js]: [Startup] Blood Moon is ACTIVE on Day ${currentDayInCycle}.`);
    } else {
      console.log(`[index.js]: [Startup] Blood Moon is NOT active. Day ${currentDayInCycle} in cycle.`);
    }

    // Schedule Blood Moon Tracking
    cron.schedule('0 0 * * *', () => {
      trackBloodMoonCycle(client, process.env.RUDANIA_TOWN_HALL);
      trackBloodMoonCycle(client, process.env.INARIKO_TOWN_HALL);
      trackBloodMoonCycle(client, process.env.VHINTL_TOWN_HALL);
    }, { timezone: 'America/New_York' });

    scheduler(client);

    // // Generate Vending Stock
    // try {
    //   await generateVendingStockList();
    //   console.log('[index.js]: 🛍️ Vending stock generated');
    // } catch (error) {
    //   console.error('[index.js]: ❌ Vending stock generation error:', error);
    // }

    // // Initialize Random Encounter Functionality
    // try {
    //   initializeRandomEncounterBot(client);
    //   console.log('[index.js]: ⚔️ Random encounter functionality initialized');
    // } catch (error) {
    //   console.error('[index.js]: ❌ Error initializing random encounters:', error);
    // }
  });

// ------------------- Interaction Handlers -------------------
client.on('interactionCreate', async interaction => {
  try {
      const allowedChannels = [
          '1305487405985431583', // Path of Scarlet Leaves
          '1305487571228557322'  // Leaf Dew Way
      ];

      if (interaction.isCommand()) {
          // Check if the command is in an allowed channel
          if (allowedChannels.includes(interaction.channelId) && interaction.commandName !== 'travel') {
              console.warn(`[index.js]: Command '${interaction.commandName}' not allowed in channel ${interaction.channelId}.`);
              await interaction.reply({
                  content: `🚫 Only the \`/travel\` command is allowed in this channel.`,
                  ephemeral: true
              });
              return;
          }

          // Execute the command
          const command = client.commands.get(interaction.commandName);
          if (command) {
              console.info(`[index.js]: Executing command '${interaction.commandName}'.`);
              await command.execute(interaction);
          }
      } else if (interaction.isButton()) {
          console.info(`[index.js]: Button interaction detected. CustomId=${interaction.customId}`);
          // Route button interactions for modals to modalHandler
          if (interaction.customId.startsWith('triggerModal-')) {
              const { handleButtonModalTrigger } = require('./handlers/modalHandler');
              await handleButtonModalTrigger(interaction);
          } else {
              await handleComponentInteraction(interaction);
          }
      } else if (interaction.isStringSelectMenu()) {
          await handleSelectMenuInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
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

// ------------------- Initialize the Client -------------------
initializeClient();
