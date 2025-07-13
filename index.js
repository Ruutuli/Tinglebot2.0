// Auto-deployed via GitHub Actions
// ------------------- Load Environment -------------------
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const port = process.env.PORT || 5001;

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

// Suppress circular dependency warnings
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
    return;
  }
  console.warn(warning);
});

// ----------------------------------------------------------------------------
// ──────────────────── Database Initialization ──────────────────────────────
// ----------------------------------------------------------------------------
async function initializeDatabases() {
  try {
    console.log("[index.js]: Connecting to databases...");
    
    // Add timeout to database connections
    const connectionTimeout = setTimeout(() => {
      console.error("[index.js]: Database connection timeout after 30 seconds");
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
  console.log('[index.js]: Received SIGTERM. Performing graceful shutdown...');
  try {
    if (client) {
      console.log('[index.js]: Destroying Discord client...');
      await client.destroy();
    }
    console.log('[index.js]: Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[index.js]: Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

// ----------------------------------------------------------------------------
// ──────────────────── Client Setup and Event Binding ───────────────────────
// ----------------------------------------------------------------------------
async function initializeClient() {
  try {
    // Initialize databases first
    await initializeDatabases();

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
      process.exit(1);
    });

    // Add error handler for Discord connection
    client.on('disconnect', () => {
      process.exit(1);
    });

    module.exports = { client };

    // Import command handlers
    const commandHandler = require("./handlers/commandHandler");
    commandHandler(client);

    client.once("ready", async () => {
      initializeErrorHandler(logErrorToTrello, client);
    });

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
          if (err) return;

          console.log(data);
          console.log("==========================================================");
          console.log("[index.js]: 🤖 Bot is online");

          try {
            // Initialize core systems
            initializeReactionHandler(client);
            logBloodMoonStatus();
            initializeScheduler(client);
            startExpirationChecks(client);
            
            // Initialize random encounters system
            const { initializeRandomEncounterBot } = require('./scripts/randomMonsterEncounters');
            initializeRandomEncounterBot(client);
          } catch (error) {
            handleError(error, "index.js");
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
            const errorMessage = { content: 'There was an error while executing this command!', flags: [4096] };
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
          console.log(`[index.js]: 🔄 Processing select menu interaction: ${interaction.customId}`);
          
          // Route submission-related select menus to the submission handler
          const submissionMenuIds = ['baseSelect', 'typeMultiplierSelect', 'productMultiplierSelect', 'addOnsSelect', 'specialWorksSelect'];
          if (submissionMenuIds.includes(interaction.customId)) {
            await handleSelectMenuInteraction(interaction);
          } else {
            // Route other select menus to the component handler
            await handleComponentInteraction(interaction);
          }
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
    // Error Report Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const ERROR_REPORT_CHANNEL_ID = "1379974822506795030";
      
      // Check if the message is in the error report channel
      if (message.channelId !== ERROR_REPORT_CHANNEL_ID) {
        return;
      }

      if (message.author.bot) {
        return;
      }

      if (!message.content.replace(/\*/g, "").startsWith("Command")) {
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

        const cardUrl = await createTrelloCard({
          threadName,
          username,
          content,
          images,
          createdAt,
        });

        if (cardUrl) {
          await message.reply(
            `✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`
          );
        } else {
          await message.reply(`❌ Failed to send bug report to Trello.`);
        }
      } catch (err) {
        console.error("[index.js]: ❌ Error handling error report for Trello:", err);
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
        await logWishlistToTrello(content, author, process.env.TRELLO_WISHLIST);
        await message.react("⭐");
      } catch (err) {
        console.error("[index.js]: Failed to log wishlist to Trello:", err);
        await message.reply("❌ Could not send this wishlist item to Trello.");
      }
    });

    // --------------------------------------------------------------------------
    // New Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const NEW_CHANNEL_ID = "1381442926667763773";
      if (message.channelId !== NEW_CHANNEL_ID) return;
      if (message.author.bot) return;

      const content = message.content;
      const author = message.author.tag;

      try {
        await logWishlistToTrello(content, author, process.env.TRELLO_WISHLIST);
        await message.react("⭐");
      } catch (err) {
        console.error("[index.js]: Failed to log wishlist to Trello:", err);
        await message.reply("❌ Could not send this wishlist item to Trello.");
      }
    });

    // --------------------------------------------------------------------------
    // Raid Thread Slow Mode Management
    // --------------------------------------------------------------------------
    // Enable slow mode on raid threads when they're created
    client.on("threadCreate", async (thread) => {
      try {
        // Check if this thread is associated with a raid (thread name contains raid indicators)
        const threadName = thread.name.toLowerCase();
        const isRaidThread = threadName.includes('🛡️') || 
                             threadName.includes('raid') || 
                             threadName.includes('rudania') || 
                             threadName.includes('inariko') || 
                             threadName.includes('vhintl');
        
        if (isRaidThread) {
          // Enable 10-second slow mode on the thread
          await thread.setRateLimitPerUser(10);
          console.log(`[index.js]: ⏰ Enabled 10-second slow mode on raid thread: ${thread.name} (${thread.id})`);
        }
      } catch (error) {
        console.error(`[index.js]: ❌ Error enabling slow mode on raid thread:`, error);
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
