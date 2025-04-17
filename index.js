// ------------------- Environment Variables -------------------
require('dotenv').config();

// ------------------- Standard Libraries -------------------
const fs = require('fs');
const path = require('path');
const { handleError } = require('./utils/globalErrorHandler');

// ------------------- Third-Party Modules -------------------
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const cron = require('node-cron');

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection');
const { generateVendingStockList } = require('./database/vendingService');

// ------------------- Handlers -------------------
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleModalSubmission, handleButtonModalTrigger } = require('./handlers/modalHandler');
const { handleSelectMenuInteraction } = require('./handlers/selectMenuHandler');
const { executeVending, initializeReactionHandler } = require('./handlers/vendingHandler');

// ------------------- Scripts and Utilities -------------------
const { renameChannels, trackBloodMoon, isBloodMoonDay } = require('./scripts/bloodmoon');
const { convertToHyruleanDate } = require('./modules/calendarModule');
const scheduler = require('./scheduler');
const { getGuildIds } = require('./utils/getGuildIds');
const { initializeRandomEncounterBot } = require('./scripts/randomEncounters');
const { createTrelloCard } = require('./scripts/trello');
const { simulateWeightedWeather } = require('./.weather/weatherHandler');
const {
  temperatureWeights,
  windWeights,
  precipitationWeights,
  specialWeights
} = require('./.weather/weatherData');

// ------------------- Blood Moon Status Checker -------------------
function logBloodMoonStatus() {
  const today = new Date();
  const hyruleanDate = convertToHyruleanDate(today);
  let isBloodMoon = false;

  try {
    isBloodMoon = isBloodMoonDay();
  } catch (error) {
    handleError(error, 'index.js');
    console.error(`[index.js]: Error checking Blood Moon status: ${error.message}`);
  }

  console.log(`[index.js]: 🌕 Blood Moon Today (Real Date: ${today.toISOString().slice(0, 10)}, Hyrulean Date: ${hyruleanDate}): ${isBloodMoon}`);
}

// ------------------- Globals -------------------
let client;

// ------------------- Database Initialization -------------------
async function initializeDatabases() {
  try {
    await connectToTinglebot();
    await connectToInventories();
    console.log('[index.js]: ✅ Databases connected');
  } catch (err) {
    handleError(err, 'index.js');
    console.error('[index.js]: ❌ Database initialization error:', err);
    throw err;
  }
}

// ------------------- Client Initialization -------------------
async function initializeClient() {
  await initializeDatabases();

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.commands = new Collection();
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }

  client.once('ready', async () => {
    console.log('[index.js]: 🤖 Bot is online');
    initializeReactionHandler(client);
    logBloodMoonStatus();
    scheduler(client);

    try {
      initializeRandomEncounterBot(client);
      console.log('[index.js]: ⚔️ Random encounter functionality initialized');
    } catch (error) {
      handleError(error, 'index.js');
      console.error('[index.js]: ❌ Error initializing random encounters:', error);
    }
  });

  // ------------------- Interaction Handlers -------------------
  // Define handlers for different types of interactions.
  client.on('interactionCreate', async interaction => {
    try {
      const allowedChannels = ['1305487405985431583', '1305487571228557322'];

      if (interaction.isCommand()) {
        if (allowedChannels.includes(interaction.channelId) && interaction.commandName !== 'travel') {
          console.warn(`[index.js]: Command '${interaction.commandName}' not allowed in channel ${interaction.channelId}.`);
          await interaction.reply({
            content: `🚫 Only the \`/travel\` command is allowed in this channel.`,
            ephemeral: true
          });
          return;
        }

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
      handleError(error, 'index.js');
      console.error('[index.js]: ❌ Interaction error:', error);
    }
  });
  
    // ------------------- Global Weather Message Command -------------------
    client.on('messageCreate', async message => {
      if (message.author.bot) return;
      if (message.content.trim().toLowerCase() !== '!weather') return;
  
      const villages = ["Rudania", "Vhintl", "Inariko"];
      const seasons = ["Winter", "Spring", "Summer", "Autumn"];
  
      function getProb(label, weightMap) {
        const weights = Object.values(weightMap);
        const total = weights.reduce((a, b) => a + b, 0);
        const weight = weightMap[label] ?? 0.01;
        return weight / total;
      }
  
      function getCombinedProbability(weather) {
        const tempProb = getProb(weather.temperature.label, temperatureWeights);
        const windProb = getProb(weather.wind.label, windWeights);
        const precipProb = getProb(weather.precipitation.label, precipitationWeights);
        const specialProb = weather.special ? getProb(weather.special.label, specialWeights) : 1;
        return tempProb * windProb * precipProb * specialProb;
      }
  
      try {
        let results = [];
  
        for (const village of villages) {
          for (const season of seasons) {
            const weather = simulateWeightedWeather(village, season);
            const prob = getCombinedProbability(weather);
  
            results.push([
              `**🛖 ${weather.village} — ${weather.season}**`,
              `\`\`\``,
              `🌡️  Temperature   : ${weather.temperature.label}`,
              `🌬️  Wind          : ${weather.wind.label}`,
              `🌧️  Precipitation : ${weather.precipitation.label}`,
              `✨  Special       : ${weather.special ? weather.special.label : 'None'}`,
              `📊  Probability   : ${(prob * 100).toFixed(2)}%`,
              `\`\`\``,
              `---`
            ].join('\n'));
            
          }
        }
  
        const forecastChunks = [];
        let currentChunk = `📡 **Weather Forecast Simulation**\n\n`;
        
        for (const line of results) {
          if ((currentChunk + line).length > 1990) {
            forecastChunks.push(currentChunk);
            currentChunk = '';
          }
          currentChunk += line + '\n';
        }
        
        if (currentChunk.trim().length > 0) {
          forecastChunks.push(currentChunk);
        }
        
        for (const chunk of forecastChunks) {
          await message.author.send(chunk);
        }
        await message.react('✅');
        
      } catch (err) {
        console.error('[index.js]: Failed to simulate weather forecast:', err);
        await message.reply('❌ Something went wrong while generating the weather.');
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
