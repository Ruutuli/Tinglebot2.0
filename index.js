// ------------------- Import necessary modules and handlers -------------------
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection');
const { generateVendingStockList } = require('./database/vendingService');

// ------------------- Handlers -------------------
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleModalSubmission } = require('./handlers/modalHandler');
const { handleSelectMenuInteraction } = require('./handlers/selectMenuHandler');

// ------------------- Scripts and Utilities -------------------
const { renameChannels, trackBloodMoonCycle, currentDayInCycle } = require('./scripts/bloodmoon');
const scheduler = require('./scheduler');
const { getGuildIds } = require('./utils/getGuildIds');




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

     // ------------------- Check Blood Moon Status on Startup -------------------
     const { isBloodMoonActive, currentDayInCycle } = require('./scripts/bloodmoon');
     console.log(`[Startup] Current Day in Cycle: ${currentDayInCycle}`);
     if (isBloodMoonActive()) {
         console.log(`[Startup] Blood Moon is ACTIVE on Day ${currentDayInCycle}.`);
     } else {
         console.log(`[Startup] Blood Moon is NOT active. Day ${currentDayInCycle} in cycle.`);
     }
 
     // ------------------- Simplified Blood Moon Code Log -------------------
     console.log('🌕 Blood Moon functionality active');
 
     cron.schedule('0 0 * * *', () => {
         trackBloodMoonCycle(client, process.env.RUDANIA_TOWN_HALL);
         trackBloodMoonCycle(client, process.env.INARIKO_TOWN_HALL);
         trackBloodMoonCycle(client, process.env.VHINTL_TOWN_HALL);
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
          await handleComponentInteraction(interaction); // Handles buttons
      } else if (interaction.isStringSelectMenu()) { // Handles dropdowns
          console.log(`Dropdown interaction detected: ${interaction.customId}`); // Debugging log
          await handleSelectMenuInteraction(interaction); 
      } else if (interaction.isCommand()) {
          const command = client.commands.get(interaction.commandName);
          if (command) await command.execute(interaction); // Executes slash commands
      } else if (interaction.isAutocomplete()) {
          await handleAutocomplete(interaction); // Handles autocomplete
      } else if (interaction.isModalSubmit()) {
          await handleModalSubmission(interaction); // Handles modals
      }
  } catch (error) {
      console.error('❌ Interaction error:', error);
  }
});


  client.login(process.env.DISCORD_TOKEN);
}

// Initialize the client
initializeClient();
