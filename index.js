// Auto-deployed via GitHub Actions
// ------------------- Load Environment -------------------
const dotenv = require('dotenv');
const path = require('path');

// Determine environment
const env = process.env.NODE_ENV || 'development';

// Try to load .env files in order of priority
const possiblePaths = [
  path.resolve(process.cwd(), `.env.${env}`),
  path.resolve(process.cwd(), '..', `.env.${env}`),
  path.resolve('/app', `.env.${env}`),
  `.env.${env}`,
  // Also try loading the other environment file as fallback
  path.resolve(process.cwd(), `.env.${env === 'development' ? 'production' : 'development'}`),
  path.resolve(process.cwd(), '..', `.env.${env === 'development' ? 'production' : 'development'}`),
  path.resolve('/app', `.env.${env === 'development' ? 'production' : 'development'}`),
  `.env.${env === 'development' ? 'production' : 'development'}`
];

let loaded = false;
for (const envPath of possiblePaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✅ Loaded environment from ${envPath}`);
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.log('⚠️ No .env file found, using environment variables from Railway');
}

// Log which environment variables were loaded
console.log(`🚀 Running in ${env} mode on port ${process.env.PORT}`);
console.log('📝 Loaded environment variables:', {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN ? '✅ Set' : '❌ Not set',
  CLIENT_ID: process.env.CLIENT_ID ? '✅ Set' : '❌ Not set',
  FEEDBACK_FORUM_CHANNEL_ID: process.env.FEEDBACK_FORUM_CHANNEL_ID ? '✅ Set' : '❌ Not set',
  // Add other critical environment variables here
});

// ------------------- Standard Libraries -------------------
const figlet = require("figlet");

// ------------------- Discord.js Components -------------------
const { Client, GatewayIntentBits } = require("discord.js");

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require("./database/db");
const TempData = require("./models/TempDataModel");

// ------------------- Handlers -------------------

const { handleAutocomplete } = require("./handlers/autocompleteHandler");
const { handleComponentInteraction } = require("./handlers/componentHandler");
const { handleSelectMenuInteraction } = require("./handlers/selectMenuHandler");
const { handleInteraction, initializeReactionHandler } = require('./handlers/interactionHandler');
// const { handleMessage } = require('./handlers/messageHandler');
const { startExpirationChecks } = require('./utils/expirationHandler');

// ------------------- Scripts -------------------
const {
  handleError,
  initializeErrorHandler,
} = require("./utils/globalErrorHandler");
const {
  createTrelloCard,
  logWishlistToTrello,
  logErrorToTrello,
} = require("./scripts/trello");
const { isBloodMoonDay } = require("./scripts/bloodmoon");
// const { initializeRandomEncounterBot } = require("./scripts/randomEncounters");
const {
  initializeScheduler,
  setupWeatherScheduler,
  setupBlightScheduler
} = require('./scheduler');
const { convertToHyruleanDate } = require("./modules/calendarModule");

// ------------------- Weather -------------------


// ============================================================================
// ------------------- Main Initialization -------------------
// ============================================================================
let client;

// ----------------------------------------------------------------------------
// ──────────────────── Database Initialization ──────────────────────────────
// ----------------------------------------------------------------------------
async function initializeDatabases() {
  try {
    console.log("[index.js]: 🔄 Attempting to connect to databases...");
    
    // Add timeout to database connections
    const connectionTimeout = setTimeout(() => {
      console.error("[index.js]: ❌ Database connection timeout after 30 seconds");
      process.exit(1);
    }, 30000);

    await connectToTinglebot();
    await connectToInventories();
    
    clearTimeout(connectionTimeout);
    
    // Clean up expired temp data and entries without expiration dates
    const [expiredResult, noExpirationResult] = await Promise.all([
      TempData.cleanup(),
      TempData.deleteMany({ expiresAt: { $exists: false } })
    ]);
    console.log(`[index.js]: 🧹 Cleaned up ${expiredResult.deletedCount} expired temp data entries`);
    console.log(`[index.js]: 🧹 Cleaned up ${noExpirationResult.deletedCount} entries without expiration dates`);
    
    console.log("[index.js]: ✅ Databases connected successfully");
  } catch (err) {
    console.error("[index.js]: ❌ Database initialization error:", err);
    console.error("[index.js]: ❌ Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
}

// Add process error handlers
process.on('uncaughtException', (error) => {
  console.error('[index.js]: ❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[index.js]: ❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Add graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('[index.js]: 🔄 Received SIGTERM. Performing graceful shutdown...');
  try {
    if (client) {
      console.log('[index.js]: 🔄 Destroying Discord client...');
      await client.destroy();
    }
    console.log('[index.js]: ✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[index.js]: ❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// ----------------------------------------------------------------------------
// ──────────────────── Client Setup and Event Binding ───────────────────────
// ----------------------------------------------------------------------------
async function initializeClient() {
  try {
    console.log("[index.js]: 🔄 Starting bot initialization...");
    
    // Initialize databases first
    await initializeDatabases();
    console.log("[index.js]: ✅ Database initialization complete");

    client = new Client({
      intents: [
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
      ],
    });

    // Add error handler for Discord client
    client.on('error', error => {
      console.error('[index.js]: ❌ Discord client error:', error);
      process.exit(1);
    });

    // Add error handler for Discord connection
    client.on('disconnect', () => {
      console.error('[index.js]: ❌ Discord client disconnected');
      process.exit(1);
    });

    module.exports = { client };

    // Import command handlers
    const commandHandler = require("./handlers/commandHandler");
    commandHandler(client);

    // // Add message event handler
    // client.on('messageCreate', async (message) => {
    //   await handleMessage(message);
    // });

    // --------------------------------------------------------------------------
    // Ready Event: Attach global error handler to send errors to Trello
    // --------------------------------------------------------------------------
    client.once("ready", async () => {
      console.log(`[index.js]: 🤖 Logged in as ${client.user.tag}!`);
      initializeErrorHandler(logErrorToTrello, client);
    });

    // --------------------------------------------------------------------------
    // Ready Event: ASCII banner and bot feature initialization
    // --------------------------------------------------------------------------
    client.once("ready", async () => {
      console.clear();

      figlet.text(
        "Tinglebot 2.0",
        {
          font: "Slant",
          horizontalLayout: "default",
          verticalLayout: "default",
        },
        async (err, data) => {
          if (err) {
            console.error("[index.js]: ❌ Figlet error:", err);
            return;
          }

          console.log(data);
          console.log("==========================================================");
          console.log("[index.js]: 🤖 Bot is online");

          try {
            // Initialize core systems
            initializeReactionHandler(client);
            logBloodMoonStatus();
            initializeScheduler(client);
            // initializeRandomEncounterBot(client);
            startExpirationChecks(client);

            // Log initialization status
            console.log("----------------------------------------------------------");
            console.log("[index.js]: ✅ Core Systems Initialized:");
            console.log("  • Reaction Handler");
            console.log("  • Blood Moon Tracker");
            console.log("  • Scheduler");
            console.log("  • Random Encounters");
            console.log("  • Request Expiration Handler");
            console.log("==========================================================");
            console.log("[index.js]: 🚀 Tinglebot 2.0 is fully operational!");
            console.log("==========================================================");
          } catch (error) {
            handleError(error, "index.js");
            console.error("[index.js]: ❌ Error during initialization:", error);
          }
        }
      );
    });

    // --------------------------------------------------------------------------
    // Interaction Handling
    // --------------------------------------------------------------------------
    client.on("interactionCreate", async (interaction) => {
      try {
        if (interaction.isCommand()) {
          const command = client.commands.get(interaction.commandName);
          if (!command) return;

          try {
            await command.execute(interaction);
          } catch (error) {
            handleError(error, 'index.js');
            const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(errorMessage);
            } else {
              await interaction.reply(errorMessage);
            }
          }
        } else if (interaction.isButton()) {
          console.log(`[index.js]: 🔄 Processing button interaction: ${interaction.customId}`);
          
          await handleComponentInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await handleSelectMenuInteraction(interaction);
        } else if (interaction.isAutocomplete()) {
          const command = client.commands.get(interaction.commandName);
          if (command && typeof command.autocomplete === "function") {
            try {
              await command.autocomplete(interaction);
            } catch (error) {
              handleError(error, "index.js");
              console.error(
                `[index.js]: ❌ Error in command autocomplete handler for '${interaction.commandName}':`,
                error
              );
              await interaction.respond([]);
            }
          } else {
            await handleAutocomplete(interaction);
          }
        } else if (interaction.isModalSubmit()) {
          const { handleModalSubmission } = require("./handlers/modalHandler");
          await handleModalSubmission(interaction);
        } else {
          console.warn(`[index.js]: Unhandled interaction type: ${interaction.type}`);
        }
      } catch (error) {
        handleError(error, "index.js");
        console.error("[index.js]: ❌ Interaction error:", error);
      }
    });

    // --------------------------------------------------------------------------
    // Forum Thread Creation Handling
    // --------------------------------------------------------------------------
    client.on("threadCreate", async (thread) => {
      console.log('🔍 Thread created:', {
        threadId: thread.id,
        threadName: thread.name,
        parentId: thread.parentId,
        expectedParentId: process.env.FEEDBACK_FORUM_CHANNEL_ID,
        channelType: thread.parent?.type
      });

      const FEEDBACK_FORUM_CHANNEL_ID = process.env.FEEDBACK_FORUM_CHANNEL_ID;
      
      if (!FEEDBACK_FORUM_CHANNEL_ID) {
        console.error('❌ FEEDBACK_FORUM_CHANNEL_ID is not defined in environment variables');
        return;
      }

      // Check if the thread is in the feedback channel (either as a forum thread or regular channel thread)
      if (thread.parentId !== FEEDBACK_FORUM_CHANNEL_ID && thread.channelId !== FEEDBACK_FORUM_CHANNEL_ID) {
        console.log('⏭️ Skipping thread - not in feedback channel:', {
          threadParentId: thread.parentId,
          threadChannelId: thread.channelId,
          expectedChannelId: FEEDBACK_FORUM_CHANNEL_ID
        });
        return;
      }

      console.log('✅ Processing feedback thread:', thread.name);

      try {
        const starterMessage = await thread.fetchStarterMessage();
        if (!starterMessage || starterMessage.author.bot) return;
        if (!starterMessage.content.replace(/\*/g, "").startsWith("Command:")) return;

        const threadName = thread.name;
        const username =
          starterMessage.author?.tag ||
          starterMessage.author?.username ||
          `User-${starterMessage.author?.id}`;
        const content = starterMessage.content;
        const createdAt = starterMessage.createdAt;
        const images = starterMessage.attachments.map((attachment) => attachment.url);

        const cardUrl = await createTrelloCard({
          threadName,
          username,
          content,
          images,
          createdAt,
        });

        if (cardUrl) {
          await starterMessage.reply(
            `✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`
          );
        } else {
          await starterMessage.reply(`❌ Failed to send bug report to Trello.`);
        }
      } catch (err) {
        console.error("[index.js]: ❌ Error handling forum thread creation:", err);
      }
    });

    // --------------------------------------------------------------------------
    // Forum Thread Reply Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const FEEDBACK_FORUM_CHANNEL_ID = process.env.FEEDBACK_FORUM_CHANNEL_ID;
      
      // Check if the message is in the feedback channel (either as a forum thread or regular channel)
      if (message.channel.parentId !== FEEDBACK_FORUM_CHANNEL_ID && message.channelId !== FEEDBACK_FORUM_CHANNEL_ID) {
        console.log('⏭️ Skipping message - not in feedback channel:', {
          messageChannelId: message.channelId,
          messageParentId: message.channel.parentId,
          expectedChannelId: FEEDBACK_FORUM_CHANNEL_ID
        });
        return;
      }

      if (message.author.bot) {
        console.log('⏭️ Skipping message - from bot');
        return;
      }

      console.log('✅ Processing feedback message:', {
        content: message.content.substring(0, 50) + '...',
        author: message.author.tag
      });

      if (!message.content.replace(/\*/g, "").startsWith("Command")) {
        console.log('❌ Message rejected - missing required format');
        const reply = await message.reply(
          "❌ **Bug Report Rejected — Missing Required Format!**\n\n" +
            "Your message must start with this line:\n" +
            "`Command: [Command Name]`\n\n" +
            "> Example:\n> `Command: /gather`\n\n" +
            "Please update your post to match this format:\n\n" +
            "**Command:** [Specify the command or feature]\n" +
            "**Issue:** [Brief description of the problem]\n" +
            "**Steps to Reproduce:**\n1. [Step 1]\n2. [Step 2]\n" +
            "**Error Output:** [Error message]\n**Screenshots:** [Attach images]\n" +
            "**Expected Behavior:** [What you expected to happen]\n" +
            "**Actual Behavior:** [What actually happened]"
        );

        setTimeout(() => reply.delete().catch(() => {}), 600000);
        return;
      }

      try {
        // Extract command name from the message content
        const commandMatch = message.content.match(/Command:\s*\[?([^\n\]]+)\]?/i);
        const threadName = commandMatch ? commandMatch[1].trim() : 'Unknown Command';
        
        const username = message.author?.tag || message.author?.username || `User-${message.author?.id}`;
        const content = message.content;
        const createdAt = message.createdAt;
        const images = message.attachments.map((attachment) => attachment.url);

        console.log('📝 Creating Trello card for feedback:', {
          threadName,
          username,
          contentLength: content.length,
          imageCount: images.length,
          extractedCommand: commandMatch ? commandMatch[1] : 'Not found'
        });

        const cardUrl = await createTrelloCard({
          threadName,
          username,
          content,
          images,
          createdAt,
        });

        if (cardUrl) {
          console.log('✅ Successfully created Trello card:', cardUrl);
          await message.reply(
            `✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`
          );
        } else {
          console.error('❌ Failed to create Trello card');
          await message.reply(`❌ Failed to send bug report to Trello.`);
        }
      } catch (err) {
        console.error("[index.js]: ❌ Error handling forum reply for Trello:", err);
        console.error("[index.js]: Error details:", {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
      }
    });

    // --------------------------------------------------------------------------
    // Wishlist Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const WISHLIST_CHANNEL_ID = "1319826690935099463";
      if (message.channelId !== WISHLIST_CHANNEL_ID) return;
      if (message.author.bot) return;

      const content = message.content;
      const author = message.author.tag;

      try {
        await logWishlistToTrello(content, author);
        await message.react("⭐");
      } catch (err) {
        console.error("[index.js]: Failed to log wishlist to Trello:", err);
        await message.reply("❌ Could not send this wishlist item to Trello.");
      }
    });

    // --------------------------------------------------------------------------
    // Start the Bot
    // --------------------------------------------------------------------------
    try {
      console.log("[index.js]: 🔄 Attempting to login to Discord...");
      await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
      console.error('[index.js]: ❌ Failed to login to Discord:', error);
      if (error.code === 'TokenInvalid') {
        console.error('[index.js]: ❌ Invalid Discord token. Please check your DISCORD_TOKEN environment variable.');
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('[index.js]: ❌ Fatal error during initialization:', error);
    process.exit(1);
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Brief description: Logging and utilities.
// ============================================================================
function logBloodMoonStatus() {
  const today = new Date();
  const hyruleanDate = convertToHyruleanDate(today);
  let isBloodMoon = false;

  try {
    isBloodMoon = isBloodMoonDay();
  } catch (error) {
    handleError(error, "index.js");
    console.error("[index.js]: ❌ Blood Moon check failed:", error.message);
  }

  // Only log if it's a blood moon day
  if (isBloodMoon) {
    console.log(`[index.js]: 🌕 Blood Moon Active (${hyruleanDate})`);
  }
}

initializeClient();
