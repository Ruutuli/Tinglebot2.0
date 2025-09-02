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
const { connectToTinglebot, connectToInventories, checkDatabaseHealth, reconnectDatabases } = require("./database/db");
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
async function initializeDatabases(maxRetries = 3, retryDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[index.js]: 🔄 Database connection attempt ${attempt}/${maxRetries}...`);
      
      // Add timeout to database connections (increased to 60 seconds)
      const connectionTimeout = setTimeout(() => {
        console.error(`[index.js]: Database connection timeout after 60 seconds (attempt ${attempt}/${maxRetries})`);
        throw new Error('Connection timeout');
      }, 60000);

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
      
      // Clean up expired and fulfilled boosting data
      const boostingCleanupResult = await TempData.deleteMany({
        type: 'boosting',
        $or: [
          { expiresAt: { $lt: new Date() } },
          { 'data.status': 'expired' },
          { 'data.status': 'fulfilled', 'data.boostExpiresAt': { $lt: Date.now() } }
        ]
      });
      console.log(`[index.js]: 🧹 Cleaned up ${boostingCleanupResult.deletedCount} expired/fulfilled boosting entries`);
      
          console.log("[index.js]: ✅ Databases connected successfully");
    
    // Start periodic health checks
    startDatabaseHealthChecks();
    
    return; // Success, exit the retry loop
      
    } catch (err) {
      console.error(`[index.js]: ❌ Database connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      
      if (attempt === maxRetries) {
        console.error("[index.js]: ❌ All database connection attempts failed. Exiting...");
        console.error("[index.js]: ❌ Final error details:", {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
        process.exit(1);
      }
      
      console.log(`[index.js]: ⏳ Retrying in ${retryDelay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Increase delay for next attempt (exponential backoff)
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    }
  }
}

// ------------------- Database Health Monitoring -------------------
function startDatabaseHealthChecks() {
  // Check database health every 5 minutes
  setInterval(async () => {
    try {
      const health = await checkDatabaseHealth();
      const allHealthy = health.tinglebot && health.inventories && health.vending;
      
      if (!allHealthy) {
        console.log("[index.js]: ⚠️ Database health check failed:", health);
        
        // Attempt reconnection if any database is unhealthy
        const reconnected = await reconnectDatabases();
        if (reconnected) {
          console.log("[index.js]: ✅ Database reconnection successful");
        } else {
          console.log("[index.js]: ❌ Database reconnection failed");
        }
      } else {
        console.log("[index.js]: ✅ Database health check passed");
      }
    } catch (error) {
      console.error("[index.js]: ❌ Database health check error:", error.message);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Add process error handlers
process.on('uncaughtException', (error) => {
  console.error('[index.js]: ❌ Uncaught Exception:', error);
  console.error('[index.js]: Stack trace:', error.stack);
  // Don't exit immediately, give time for cleanup
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[index.js]: ❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, give time for cleanup
  setTimeout(() => process.exit(1), 1000);
});

// Add graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('[index.js]: Received SIGTERM. Performing graceful shutdown...');
  try {
    if (client) {
      console.log('[index.js]: Destroying Discord client...');
      await client.destroy();
    }
    
    // Close database connections gracefully
    console.log('[index.js]: Closing database connections...');
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    console.log('[index.js]: Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[index.js]: Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

// Also handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', async () => {
  console.log('[index.js]: Received SIGINT. Performing graceful shutdown...');
  try {
    if (client) {
      console.log('[index.js]: Destroying Discord client...');
      await client.destroy();
    }
    
    // Close database connections gracefully
    console.log('[index.js]: Closing database connections...');
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
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
      console.error('[index.js]: Discord client error:', error);
      // Don't exit immediately, try to recover
      setTimeout(() => {
        if (client && client.readyState === 0) {
          console.log('[index.js]: Attempting to reconnect Discord client...');
          client.login(process.env.DISCORD_TOKEN);
        }
      }, 5000);
    });

    // Add error handler for Discord connection
    client.on('disconnect', () => {
      console.log('[index.js]: Discord client disconnected, attempting to reconnect...');
      // Don't exit immediately, try to recover
      setTimeout(() => {
        if (client && client.readyState === 0) {
          console.log('[index.js]: Attempting to reconnect Discord client...');
          client.login(process.env.DISCORD_TOKEN);
        }
      }, 5000);
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
            handleError(error, "index.js", {
              operation: 'initialization',
              context: 'scheduler_and_encounters'
            });
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
            handleError(error, 'index.js', {
              commandName: interaction.commandName,
              userTag: interaction.user?.tag,
              userId: interaction.user?.id,
              options: interaction.options?.data
            });
            console.error(`[index.js]: Command execution error:`, error);
            
            // Check if it's a webhook token error
            if (error.code === 50027) {
              console.warn('[index.js]: Webhook token expired, sending error as regular message');
              try {
                await interaction.channel.send('❌ The command took too long to complete. Please try again.');
              } catch (sendError) {
                console.error('[index.js]: Failed to send fallback error message:', sendError);
              }
              return;
            }
            
            const errorMessage = { content: 'There was an error while executing this command!', flags: [4096] };
            try {
              if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
              } else {
                await interaction.reply(errorMessage);
              }
            } catch (responseError) {
              console.error('[index.js]: Failed to send error response:', responseError);
              // Final fallback - send as regular message
              try {
                await interaction.channel.send('❌ There was an error while executing this command!');
              } catch (sendError) {
                console.error('[index.js]: Failed to send fallback error message:', sendError);
              }
            }
          }
        } else if (interaction.isButton()) {
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
              handleError(error, "index.js", {
                commandName: interaction.commandName,
                userTag: interaction.user?.tag,
                userId: interaction.user?.id,
                operation: 'autocomplete'
              });
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
        handleError(error, "index.js", {
          commandName: interaction?.commandName || 'Unknown',
          userTag: interaction?.user?.tag || 'Unknown',
          userId: interaction?.user?.id || 'Unknown',
          interactionType: interaction?.type || 'Unknown'
        });
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
    handleError(error, "index.js", {
      operation: 'blood_moon_check',
      context: 'scheduler_and_encounters'
    });
    console.error("[index.js]: ❌ Blood Moon check failed:", error.message);
  }

  // Only log if it's a blood moon day
  if (isBloodMoon) {
    console.log(`[index.js]: 🌕 Blood Moon Active (${hyruleanDate})`);
  }
}

initializeClient();
