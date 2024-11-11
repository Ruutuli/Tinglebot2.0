// ------------------- Import necessary modules and handlers -------------------
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ------------------- Import local modules -------------------
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { getGuildIds } = require('./utils/getGuildIds');
const { connectToTinglebot, connectToInventories } = require('./database/connection');
const scheduler = require('./scheduler');
const { generateVendingStockList } = require('./database/vendingService');
const { renameChannels, trackBloodMoonCycle } = require('./scripts/bloodmoon');

// Declare the client variable for use across functions
let client;

// ------------------- Initialize Databases -------------------
async function initializeDatabases() {
  try {
    await connectToTinglebot();
    await connectToInventories();
    console.log('✅ Databases connected');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  }
}

// ------------------- Initialize Client -------------------
async function initializeClient() {
  await initializeDatabases();

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.commands = new Collection();
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }

  // ------------------- On Bot Ready -------------------
  client.once('ready', async () => {
    console.log('🤖 Bot is online');

    // ------------------- Simplified Blood Moon Code Log -------------------
    await renameChannels(client);
    console.log('🌕 Blood Moon functionality active');

    cron.schedule('0 0 * * *', () => {
      trackBloodMoonCycle(client, '1286562327218622475');
    }, {
      timezone: 'America/New_York',
    });

    scheduler(client);

    try {
      await generateVendingStockList();
      console.log('🛍️ Vending stock generated');
    } catch (error) {
      console.error('❌ Vending stock generation error:', error);
    }
  });

// ------------------- Interaction Handlers -------------------
client.on('interactionCreate', async interaction => {
  try {
      if (interaction.isButton()) {
          await handleComponentInteraction(interaction);
      } else if (interaction.isCommand()) {
          const command = client.commands.get(interaction.commandName);
          if (command) await command.execute(interaction);
      } else if (interaction.isAutocomplete() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
          await handleInteraction(interaction, client);
      }
  } catch (error) {
      console.error('❌ Interaction error:', error);
  }
});


  client.login(process.env.DISCORD_TOKEN);
}

// Initialize the client
initializeClient();
