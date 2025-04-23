require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { handleError } = require('./utils/globalErrorHandler');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { connectToTinglebot, connectToInventories } = require('./database/db');
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleComponentInteraction } = require('./handlers/componentHandler');
const { handleSelectMenuInteraction } = require('./handlers/selectMenuHandler');
const { initializeReactionHandler } = require('./handlers/vendingHandler');
const { isBloodMoonDay } = require('./scripts/bloodmoon');
const { convertToHyruleanDate } = require('./modules/calendarModule');
const scheduler = require('./scheduler');
const { initializeRandomEncounterBot } = require('./scripts/randomEncounters');
const { createTrelloCard, logWishlistToTrello  } = require('./scripts/trello');
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

function getCommandFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat.isDirectory()) {
            results = results.concat(getCommandFiles(file));
        } else if (file.endsWith('.js')) {
            results.push(file);
        }
    });
    return results;
}

const commandDir = path.join(__dirname, 'commands');
const commandFiles = getCommandFiles(commandDir);

for (const file of commandFiles) {
    const command = require(file);
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

// ============================================================================
// ------------------- Forum + Wishlist Trello Logging -------------------
// ============================================================================

// ------------------- Forum Bug Report Thread Creation Listener -------------------
// Triggered when a new thread is created in the bug report forum
client.on('threadCreate', async thread => {
  const FEEDBACK_FORUM_CHANNEL_ID = '1315866996776374302';
  if (thread.parentId !== FEEDBACK_FORUM_CHANNEL_ID) return;

  console.log(`[index.js]: New forum thread created: ${thread.name}`);

  try {
    const starterMessage = await thread.fetchStarterMessage();
    if (!starterMessage || starterMessage.author.bot) return;
    if (!starterMessage.content.replace(/\*/g, '').startsWith('Command:')) return;

    const threadName = thread.name;
    const username = starterMessage.author?.tag || starterMessage.author?.username || `User-${starterMessage.author?.id}`;
    const content = starterMessage.content;
    const createdAt = starterMessage.createdAt;
    const images = starterMessage.attachments.map(attachment => attachment.url);

    const cardUrl = await createTrelloCard({ threadName, username, content, images, createdAt });

    if (cardUrl) {
      await starterMessage.reply(`✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`);
    } else {
      await starterMessage.reply(`❌ Failed to send bug report to Trello.`);
    }

  } catch (err) {
    console.error('[index.js]: ❌ Error handling forum thread creation:', err);
  }
});

// ------------------- Forum Bug Report Reply Listener -------------------
// Triggered when a new message is posted in an existing bug report thread
client.on('messageCreate', async message => {
  const FEEDBACK_FORUM_CHANNEL_ID = '1315866996776374302';
  if (message.channel.parentId !== FEEDBACK_FORUM_CHANNEL_ID) return;
  if (message.author.bot) return;

  // ------------------- Bug Report Format Validation -------------------
  if (!message.content.replace(/\*/g, '').startsWith('Command')) {
    const reply = await message.reply(
      `❌ **Bug Report Rejected — Missing Required Format!**\n\n` +
      `Your message must start with this line:\n\`Command: [Command Name]\`\n\n` +
      `> Example:\n> \`Command: /gather\`\n\n` +
      `Please update your post to match this format:\n\n` +
      `**Command:** [Specify the command or feature]\n` +
      `**Issue:** [Brief description of the problem]\n` +
      `**Steps to Reproduce:**\n1. [Step 1]\n2. [Step 2]\n` +
      `**Error Output:** [Error message]\n**Screenshots:** [Attach images]\n` +
      `**Expected Behavior:** [What you expected to happen]\n` +
      `**Actual Behavior:** [What actually happened]`
    );

    setTimeout(() => reply.delete().catch(() => {}), 600000); // Auto-delete after 10 mins
    return;
  }

  try {
    const threadName = message.channel.name;
    const username = message.author?.tag || message.author?.username || `User-${message.author?.id}`;
    const content = message.content;
    const createdAt = message.createdAt;
    const images = message.attachments.map(attachment => attachment.url);

    const cardUrl = await createTrelloCard({ threadName, username, content, images, createdAt });

    if (cardUrl) {
      await message.reply(`✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`);
    } else {
      await message.reply(`❌ Failed to send bug report to Trello.`);
    }

  } catch (err) {
    console.error('[index.js]: ❌ Error handling forum reply for Trello:', err);
  }
});

// ------------------- Wishlist Channel Listener -------------------
// Automatically logs any message in the wishlist channel directly to Trello
client.on('messageCreate', async message => {
  const WISHLIST_CHANNEL_ID = '1319826690935099463';
  if (message.channelId !== WISHLIST_CHANNEL_ID) return;
  if (message.author.bot) return;

  const content = message.content;
  const author = message.author.tag;

  try {
    await logWishlistToTrello(content, author);
    await message.react('⭐'); // Visual confirmation
  } catch (err) {
    console.error('[index.js]: Failed to log wishlist to Trello:', err);
    await message.reply('❌ Could not send this wishlist item to Trello.');
  }
});

// ------------------- Login the Bot -------------------
// Initialize the client and start the bot.
client.login(process.env.DISCORD_TOKEN);

}


// ------------------- Start Client Initialization -------------------
// Initialize the client and start the bot.
initializeClient();
