// Auto-deployed via GitHub Actions
// ------------------- Load Environment -------------------
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from project root .env file
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const port = process.env.PORT || 5001;

// ------------------- Standard Libraries -------------------
const figlet = require("figlet");

// ------------------- Discord.js Components -------------------
const { Client, GatewayIntentBits, Partials, REST, Routes } = require("discord.js");

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require("../shared/database/db");
const TempData = require("../shared/models/TempDataModel");

// ------------------- Handlers -------------------

const { handleAutocomplete } = require("./handlers/autocompleteHandler");
const { handleComponentInteraction } = require("./handlers/componentHandler");
const { handleSelectMenuInteraction } = require("./handlers/selectMenuHandler");
const { handleInteraction, initializeReactionHandler } = require('./handlers/interactionHandler');
const { initializeReactionRolesHandler } = require('./handlers/reactionRolesHandler');
// const { handleMessage } = require('./handlers/messageHandler');
const { startExpirationChecks } = require('../shared/utils/expirationHandler');
const logger = require('../shared/utils/logger');
const { getMemoryMonitor } = require('../shared/utils/memoryMonitor');

// ------------------- Scripts -------------------
const {
  handleError,
  initializeErrorHandler,
  initializeErrorTracking,
} = require("../shared/utils/globalErrorHandler");
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
  logger.warn('SYSTEM', `${warning.name}: ${warning.message}`);
});

// ----------------------------------------------------------------------------
// ──────────────────── Database Initialization ──────────────────────────────
// ----------------------------------------------------------------------------
async function initializeDatabases() {
  try {
    console.log('\n');
    logger.separator('═', 60);
    logger.section('💾 DATABASE INITIALIZATION');
    logger.separator('═', 60);
    console.log('\n');
    
    logger.info('DATABASE', 'Connecting to databases...');
    
    // Add timeout to database connections (increased to 60 seconds)
    const connectionTimeout = setTimeout(() => {
      logger.error('DATABASE', 'Connection timeout after 60 seconds');
      process.exit(1);
    }, 60000);

    await connectToTinglebot();
    await connectToInventories();
    
    clearTimeout(connectionTimeout);
    
    console.log('\n');
    logger.separator('─', 60);
    logger.info('CLEANUP', 'Running database cleanup...');
    logger.separator('─', 60);
    console.log('\n');
    
    // Clean up expired temp data and entries without expiration dates
    const [expiredResult, noExpirationResult] = await Promise.all([
      TempData.cleanup(),
      TempData.deleteMany({ expiresAt: { $exists: false } })
    ]);
    logger.success('CLEANUP', `${expiredResult.deletedCount} expired temp data`);
    logger.success('CLEANUP', `${noExpirationResult.deletedCount} entries without expiration`);
    
    // Clean up expired and fulfilled boosting data
    const boostingCleanupResult = await TempData.deleteMany({
      type: 'boosting',
      $or: [
        { expiresAt: { $lt: new Date() } },
        { 'data.status': 'expired' },
        { 'data.status': 'fulfilled', 'data.boostExpiresAt': { $lt: Date.now() } }
      ]
    });
    logger.success('CLEANUP', `${boostingCleanupResult.deletedCount} expired boosting entries`);
    
    // Fix questBonus type issues (convert numeric questBonus to string)
    try {
      const ApprovedSubmission = require('../shared/models/ApprovedSubmissionModel');
      
      // Fix ApprovedSubmission records with numeric questBonus
      const approvedSubmissionsWithNumericBonus = await ApprovedSubmission.find({
        questBonus: { $type: 'number' }
      });
      
      let approvedFixedCount = 0;
      for (const submission of approvedSubmissionsWithNumericBonus) {
        await ApprovedSubmission.updateOne(
          { _id: submission._id },
          { $set: { questBonus: String(submission.questBonus) } }
        );
        approvedFixedCount++;
      }
      
      // Fix TempData submission records with numeric questBonus in data field
      const tempSubmissionsWithNumericBonus = await TempData.find({
        type: 'submission',
        'data.questBonus': { $type: 'number' }
      });
      
      let tempFixedCount = 0;
      for (const tempData of tempSubmissionsWithNumericBonus) {
        if (tempData.data && typeof tempData.data.questBonus === 'number') {
          await TempData.updateOne(
            { _id: tempData._id },
            { $set: { 'data.questBonus': String(tempData.data.questBonus) } }
          );
          tempFixedCount++;
        }
      }
      
      if (approvedFixedCount > 0 || tempFixedCount > 0) {
        logger.success('CLEANUP', `Fixed ${approvedFixedCount} ApprovedSubmission records with numeric questBonus`);
        logger.success('CLEANUP', `Fixed ${tempFixedCount} TempData submission records with numeric questBonus`);
      } else {
        logger.info('CLEANUP', 'No questBonus type issues found');
      }
    } catch (questBonusError) {
      logger.warn('CLEANUP', `Error fixing questBonus types: ${questBonusError.message}`);
      // Don't fail initialization if cleanup fails
    }
    
    console.log('\n');
    logger.separator('═', 60);
    logger.success('DATABASE', '✨ Database initialization complete');
    logger.separator('═', 60);
    console.log('\n');
  } catch (err) {
    logger.error('DATABASE', `Initialization error: ${err.message}`);
    logger.error('DATABASE', `Details: ${err.name}`);
    process.exit(1);
  }
}



// Add process error handlers
process.on('uncaughtException', (error) => {
  logger.error('SYSTEM', `Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('SYSTEM', `Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// Add graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SYSTEM', 'Received SIGTERM. Performing graceful shutdown...');
  await performGracefulShutdown();
});

// Shared graceful shutdown function
async function performGracefulShutdown() {
  try {
    // 1. Stop expiration checks (prevents recursive timer creation)
    try {
      const { stopExpirationChecks } = require('../shared/utils/expirationHandler');
      stopExpirationChecks();
      logger.info('SYSTEM', 'Expiration checks stopped');
    } catch (error) {
      logger.warn('SYSTEM', `Error stopping expiration checks: ${error.message}`);
    }
    
    // 2. Destroy all cron jobs first (prevents new timers from being created)
    try {
      const { destroyAllCronJobs } = require('./scheduler');
      const destroyedCount = destroyAllCronJobs();
      logger.info('SYSTEM', `Destroyed ${destroyedCount} cron jobs`);
    } catch (error) {
      logger.warn('SYSTEM', `Error destroying cron jobs: ${error.message}`);
    }
    
    // 3. Destroy Discord client
    if (client) {
      logger.info('SYSTEM', 'Destroying Discord client...');
      await client.destroy();
    }
    
    // 4. Close all database connections gracefully
    logger.info('SYSTEM', 'Closing database connections...');
    const mongoose = require('mongoose');
    
    // Close main mongoose connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    // Close additional database connections
    try {
      const DatabaseConnectionManager = require('../shared/database/connectionManager');
      await DatabaseConnectionManager.closeAllConnections();
    } catch (error) {
      logger.warn('SYSTEM', `Error closing additional database connections: ${error.message}`);
    }
    
    // 5. Clear all caches
    try {
      const { inventoryCache, characterListCache, characterDataCache, spiritOrbCache } = require('../shared/utils/cache');
      [inventoryCache, characterListCache, characterDataCache, spiritOrbCache].forEach(cache => {
        if (cache && typeof cache.clear === 'function') {
          cache.clear();
          if (cache.stopCleanup && typeof cache.stopCleanup === 'function') {
            cache.stopCleanup();
          }
        }
      });
      logger.info('SYSTEM', 'All caches cleared');
    } catch (error) {
      logger.warn('SYSTEM', `Error clearing caches: ${error.message}`);
    }
    
    // 6. Stop memory monitor
    try {
      const { getMemoryMonitor } = require('../shared/utils/memoryMonitor');
      const memoryMonitor = getMemoryMonitor();
      if (memoryMonitor) {
        memoryMonitor.stop();
        logger.info('SYSTEM', 'Memory monitor stopped');
      }
    } catch (error) {
      logger.warn('SYSTEM', `Error stopping memory monitor: ${error.message}`);
    }
    
    logger.success('SYSTEM', 'Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('SYSTEM', `Error during graceful shutdown: ${error.message}`);
    process.exit(1);
  }
}

// Also handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', async () => {
  logger.info('SYSTEM', 'Received SIGINT. Performing graceful shutdown...');
  await performGracefulShutdown();
});

// ----------------------------------------------------------------------------
// ──────────────────── Client Setup and Event Binding ───────────────────────
// ----------------------------------------------------------------------------
async function initializeClient() {
  try {
    // Apply Railway-specific optimizations
    try {
      const { configureRailwayOptimizations, setupRailwayMemoryMonitoring } = require('../shared/utils/railwayOptimizations');
      configureRailwayOptimizations();
      setupRailwayMemoryMonitoring();
    } catch (error) {
      logger.warn('SYSTEM', `Could not apply Railway optimizations: ${error.message}`);
    }
    
    // Initialize memory monitoring
    const memoryMonitor = getMemoryMonitor({
      enabled: true,
      logInterval: 5 * 60 * 1000, // 5 minutes
      warningThreshold: 500 * 1024 * 1024, // 500MB
      criticalThreshold: 1000 * 1024 * 1024 // 1GB
    });
    logger.info('SYSTEM', 'Memory monitoring initialized');
    
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
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
      ],
    });

    // Add error handler for Discord client
    client.on('error', error => {
      logger.error('SYSTEM', 'Discord client error');
      process.exit(1);
    });

    // Add error handler for Discord connection
    client.on('disconnect', () => {
      logger.warn('SYSTEM', 'Discord client disconnected');
      process.exit(1);
    });

    // --------------------------------------------------------------------------
    // HTTP Server Error Handling (for Railway health checks and HTTP connections)
    // --------------------------------------------------------------------------
    // Handle HTTP parse errors from malformed client requests or premature disconnections
    // These errors are common and shouldn't crash the bot
    const http = require('http');
    const originalCreateServer = http.createServer;
    http.createServer = function(...args) {
      const server = originalCreateServer.apply(this, args);
      
      // Handle client errors (malformed requests, premature disconnections, parse errors)
      server.on('clientError', (err, socket) => {
        // Handle parse errors gracefully (malformed HTTP requests)
        if (err.message && err.message.includes('Parse Error')) {
          logger.warn('HTTP', `Client parse error (malformed request): ${err.message}`);
          // End the socket gracefully with proper HTTP response
          if (socket && !socket.destroyed) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
          }
          return;
        }
        
        // Handle other client errors (premature disconnections, etc.)
        if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || 
            err.message && (err.message.includes('socket hang up') || 
                           err.message.includes('premature close'))) {
          logger.warn('HTTP', `Client connection error (disconnected): ${err.message || err.code}`);
          // Don't try to write to a closed socket
          return;
        }
        
        // Log other client errors
        logger.warn('HTTP', `Client error: ${err.message || err.code || 'Unknown'}`);
        if (socket && !socket.destroyed) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
      });
      
      // Handle server errors (don't crash on server errors)
      server.on('error', (err) => {
        // Only log server errors - Railway will handle restarts if needed
        logger.error('HTTP', `Server error: ${err.message || err.code || 'Unknown'}`);
      });
      
      return server;
    };

    // Handle unhandled rejections that might be HTTP-related
    process.on('unhandledRejection', (reason, promise) => {
      if (reason && typeof reason === 'object') {
        // Check if it's an HTTP parse error
        if (reason.message && reason.message.includes('Parse Error')) {
          logger.warn('HTTP', `Unhandled HTTP parse error: ${reason.message}`);
          // Don't crash on parse errors - they're from client requests
          return;
        }
        
        // Check if it's a connection error
        if (reason.code === 'ECONNRESET' || reason.code === 'EPIPE' || 
            reason.message && (reason.message.includes('socket hang up') || 
                               reason.message.includes('premature close'))) {
          logger.warn('HTTP', `Connection error (non-fatal): ${reason.message || reason.code}`);
          // These are common and non-fatal
          return;
        }
      }
      
      // Log other unhandled rejections for debugging
      logger.error('SYSTEM', `Unhandled rejection: ${reason}`);
    });

    module.exports = { client };

    // Import command handlers
    const commandHandler = require("./handlers/commandHandler");
    commandHandler(client);

    client.once("ready", async () => {
      initializeErrorHandler(logErrorToTrello, client);
      initializeErrorTracking(client);
    });

    client.once("ready", async () => {
      console.clear();

      // Display ASCII art banner
      figlet.text(
        "Tinglebot 2.0",
        {
          font: "Slant",
          horizontalLayout: "default",
          verticalLayout: "default",
        },
        async (err, data) => {
          if (err) return;

          // Display banner
          console.log('\n');
          console.log('╔══════════════════════════════════════════════════════════════╗');
          console.log(data);
          console.log('╚══════════════════════════════════════════════════════════════╝');
          console.log('\n');
          
          logger.separator('─', 60);
          logger.section('🚀 INITIALIZATION COMPLETE');
          logger.success('SYSTEM', 'Bot is online and ready');
          logger.separator('─', 60);
          console.log('\n');

          try {
            // Register commands with Discord
            await registerCommands(client);
            
            // Initialize core systems
            initializeReactionHandler(client);
            initializeReactionRolesHandler(client);
            
            // Initialize role count channels system
            const { initializeRoleCountChannels } = require('./modules/roleCountChannelsModule');
            initializeRoleCountChannels(client);
            
            // Initialize random encounters system (before scheduler to avoid log mixing)
            const { initializeRandomEncounterBot } = require('./scripts/randomMonsterEncounters');
            initializeRandomEncounterBot(client);
            
            logBloodMoonStatus();
            initializeScheduler(client);
            startExpirationChecks(client);
            
            console.log('\n');
            logger.separator('═', 60);
            logger.success('SYSTEM', '✨ All systems operational - Ready to serve!');
            logger.separator('═', 60);
            console.log('\n');
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
            logger.error('COMMAND', 'Command execution error');
            
            // Check if it's a webhook token error
            if (error.code === 50027) {
              logger.warn('COMMAND', 'Webhook token expired, sending error as regular message');
              try {
                await interaction.channel.send('❌ The command took too long to complete. Please try again.');
              } catch (sendError) {
                logger.error('COMMAND', 'Failed to send fallback error message');
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
                logger.error('COMMAND', 'Failed to send fallback error message');
              }
            }
          }
        } else if (interaction.isButton()) {
          await handleComponentInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
          logger.info('INTERACTION', `🔄 Processing select menu interaction: ${interaction.customId}`);
          
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
              try {
                if (!interaction.responded && interaction.isRepliable()) {
                  await interaction.respond([]);
                }
              } catch (respondError) {
                if (respondError.code !== 10062) {
                  console.error(`[index.js]: Error responding to autocomplete:`, respondError);
                }
              }
            }
          } else {
            try {
              await handleAutocomplete(interaction);
            } catch (error) {
              handleError(error, "index.js", {
                commandName: interaction.commandName,
                userTag: interaction.user?.tag,
                userId: interaction.user?.id,
                operation: 'autocomplete_handler'
              });
              console.error(
                `[index.js]: ❌ Error in handleAutocomplete for '${interaction.commandName}':`,
                error
              );
              try {
                if (!interaction.responded && interaction.isRepliable()) {
                  await interaction.respond([]);
                }
              } catch (respondError) {
                if (respondError.code !== 10062) {
                  console.error(`[index.js]: Error responding to autocomplete:`, respondError);
                }
              }
            }
          }
        } else if (interaction.isModalSubmit()) {
          const { handleModalSubmission } = require("./handlers/modalHandler");
          await handleModalSubmission(interaction);
        } else {
          logger.warn('INTERACTION', `Unhandled interaction type: ${interaction.type}`);
        }
      } catch (error) {
        handleError(error, "index.js", {
          commandName: interaction?.commandName || 'Unknown',
          userTag: interaction?.user?.tag || 'Unknown',
          userId: interaction?.user?.id || 'Unknown',
          interactionType: interaction?.type || 'Unknown'
        });
        logger.error('INTERACTION', 'Interaction error');
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
    // RP Quest Post Tracking
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      
      // Check if this is an RP thread
      if (message.channel.isThread()) {
        try {
          const { handleRPPostTracking } = require('./modules/rpQuestTrackingModule');
          await handleRPPostTracking(message);
        } catch (error) {
          console.error("[index.js]: Error tracking RP post:", error);
        }
      }
    });

    // --------------------------------------------------------------------------
    // Leveling System - XP Tracking
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      
      try {
        // Handle XP tracking for leveling system
        const { handleXP } = require('./modules/levelingModule');
        await handleXP(message);
        
        // Handle existing message tracking
        const { trackLastMessage } = require('../shared/utils/messageUtils');
        await trackLastMessage(message);
      } catch (error) {
        console.error("[index.js]: Error handling XP tracking:", error);
      }
    });

    // --------------------------------------------------------------------------
    // Welcome Message System
    // --------------------------------------------------------------------------
    client.on("guildMemberAdd", async (member) => {
      try {
        // Create welcome embed
        const { EmbedBuilder } = require('discord.js');
        
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle(`🌱 Welcome to ${member.guild.name}, ${member.user.username}!`)
          .setDescription(`We're glad to have you here! Roots of the Wild is a Zelda-inspired RP where your OCs help shape the world.`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .addFields(
            {
              name: '🗺️ **Start Here**',
              value: '• React to the **rules** channel to get the Traveler role\n• Post your intro in the **intro** channel to get full access\n• Come hang out in **gossip-stone** chat\n• Questions? DM Roots.Admin#9069 or post in **faq-and-suggestions**',
              inline: false
            },
            {
              name: '⏳ **24 Hour Timer**',
              value: 'You have **24 hours** to post your intro in the intro channel. After that, you\'ll be automatically removed to make space for others. Make sure to react to the rules first!',
              inline: false
            },
            {
              name: '⏳ **Two Week Timer**',
              value: 'You have **2 weeks** to submit a character application. After that, you\'ll be removed to make space for others. Apps don\'t need to be perfect—just started!',
              inline: false
            },
            {
              name: '📜 **Quick Rules**',
              value: '• 18+ server only\n• NSFW belongs in designated channels\n• No godmodding or metagaming\n• Respect pronouns & fellow members\n• Avoid heavy real-world topics (check trigger list)\n• Use "Windfish says No" to end upsetting convos\n• No AI art in apps or official submissions',
              inline: false
            },
            {
              name: '🔗 **Full Rules + Site**',
              value: 'https://www.rootsofthewild.com/',
              inline: false
            }
          )
          .setFooter({
            text: 'Take Courage. • Be Wise. • Nurture Power. • 🌿 Welcome to Roots!',
            icon_url: client.user.displayAvatarURL()
          })
          .setTimestamp();

        // Send welcome message as DM
        await member.send({ embeds: [welcomeEmbed] });
        
        console.log(`[index.js]: 🌱 Welcome message sent to ${member.user.tag} (${member.id})`);
        
      } catch (error) {
        console.error(`[index.js]: ❌ Error sending welcome message to ${member.user.tag}:`, error);
        // If DM fails, we could send to a welcome channel instead
        // For now, just log the error
      }
    });

    // --------------------------------------------------------------------------
    // Intro Detection and Verified Role Assignment
    // --------------------------------------------------------------------------
    const INTRO_CHANNEL_ID = '795200689918836736';
    const VERIFIED_ROLE_ID = '1460099245347700962';
    const TRAVELER_ROLE_ID = '788137818135330837';
    
    // ------------------- Validate Intro Format -------------------
    // Validates that an intro message contains required Name and Age fields
    function validateIntroFormat(message) {
      const content = message.content;
      const errors = [];
      
      // Check for Name field - flexible with or without markdown, brackets, and case
      // Matches: **[Name:]**, **Name:**, Name:, name:, etc.
      // Simplified: just look for "Name:" (case insensitive), optionally preceded/followed by ** and brackets
      const namePattern = /\*\*\[?Name:\]?\*\*|Name:/i;
      const nameMatch = content.match(namePattern);
      
      if (!nameMatch) {
        errors.push('Name');
      } else {
        // Check if there's actual content after the Name field
        const nameIndex = nameMatch.index + nameMatch[0].length;
        const afterName = content.substring(nameIndex);
        
        // Look for the next line or field marker, or end of content
        // Extract content up to next field marker or new line
        const nextFieldMatch = afterName.match(/\n|(?:\*\*\[?)?(?:Age|Pronouns|Character|RP|Favored|Timezone|Other):/i);
        const nameContent = nextFieldMatch 
          ? afterName.substring(0, nextFieldMatch.index).trim()
          : afterName.trim();
        
        // Remove markdown formatting and check for actual content
        const cleanedName = nameContent.replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        if (!cleanedName || cleanedName.length === 0) {
          errors.push('Name (field exists but is empty)');
        }
      }
      
      // Check for Age field - flexible with or without markdown, brackets, and case
      // Matches: **[Age:]**, **Age:**, Age:, age:, etc.
      // Simplified: just look for "Age:" (case insensitive), optionally preceded/followed by ** and brackets
      const agePattern = /\*\*\[?Age:\]?\*\*|Age:/i;
      const ageMatch = content.match(agePattern);
      
      if (!ageMatch) {
        errors.push('Age');
      } else {
        // Check if there's actual content after the Age field
        const ageIndex = ageMatch.index + ageMatch[0].length;
        const afterAge = content.substring(ageIndex);
        
        // Look for the next line or field marker, or end of content
        // Extract content up to next field marker or new line
        const nextFieldMatch = afterAge.match(/\n|(?:\*\*\[?)?(?:Name|Pronouns|Character|RP|Favored|Timezone|Other):/i);
        const ageContent = nextFieldMatch 
          ? afterAge.substring(0, nextFieldMatch.index).trim()
          : afterAge.trim();
        
        // Remove markdown formatting and check for actual content
        const cleanedAge = ageContent.replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        if (!cleanedAge || cleanedAge.length === 0) {
          errors.push('Age (field exists but is empty)');
        }
      }
      
      return {
        valid: errors.length === 0,
        errors: errors
      };
    }
    
    client.on("messageCreate", async (message) => {
      try {
        // Only process messages in intro channel
        if (message.channelId !== INTRO_CHANNEL_ID) return;
        
        console.log(`[index.js]: 📝 Message detected in intro channel from ${message.author.tag}`);
        
        // Skip bot messages
        if (message.author.bot) {
          console.log(`[index.js]: ⏭️  Skipping bot message`);
          return;
        }
        
        // Ensure we have the member object
        if (!message.guild) {
          console.log(`[index.js]: ⚠️  No guild found for message`);
          return;
        }
        
        let member = message.member;
        if (!member) {
          // Try to fetch the member
          try {
            member = await message.guild.members.fetch(message.author.id);
            console.log(`[index.js]: ✅ Fetched member ${message.author.tag}`);
          } catch (fetchError) {
            console.error(`[index.js]: ❌ Could not fetch member ${message.author.tag}:`, fetchError);
            return;
          }
        }
        
        // Check if user already has Verified role
        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
          console.log(`[index.js]: ⏭️  User ${message.author.tag} already has Verified role`);
          return; // Already verified
        }
        
        // Check if user has Traveler role (they should have this to post)
        if (!member.roles.cache.has(TRAVELER_ROLE_ID)) {
          console.log(`[index.js]: ⚠️  User ${message.author.tag} posted in intro without Traveler role`);
          return;
        }
        
        console.log(`[index.js]: 🔍 Processing intro post for ${message.author.tag}...`);
        
        // Validate intro format before assigning role
        const validation = validateIntroFormat(message);
        if (!validation.valid) {
          console.log(`[index.js]: ❌ Intro validation failed for ${message.author.tag}. Missing: ${validation.errors.join(', ')}`);
          
          // Build error message
          const missingFields = validation.errors.filter(e => !e.includes('(field exists but is empty)')).join(' and ');
          const emptyFields = validation.errors.filter(e => e.includes('(field exists but is empty)')).map(e => e.replace(' (field exists but is empty)', '')).join(' and ');
          
          let errorMessage = '❌ **Intro Rejected — Missing Required Fields!**\n\n';
          if (missingFields) {
            errorMessage += `Your intro is missing the following required field${missingFields.includes(' and ') ? 's' : ''}: **${missingFields}**\n\n`;
          }
          if (emptyFields) {
            errorMessage += `The following field${emptyFields.includes(' and ') ? 's' : ''} ${emptyFields.includes(' and ') ? 'are' : 'is'} empty: **${emptyFields}**. Please add content after the field label.\n\n`;
          }
          
          errorMessage += 'Your intro must include at least:\n';
          errorMessage += '• `**[Name:]**` (with your name/nickname)\n';
          errorMessage += '• `**[Age:]**` (with your age)\n\n';
          errorMessage += '> 📌 Check the pinned template in this channel for the full format!\n\n';
          errorMessage += 'Please update your intro and try again.';
          
          const reply = await message.reply(errorMessage);
          
          // Auto-delete both the error reply and the user's message after 30 seconds
          setTimeout(async () => {
            try {
              await reply.delete();
              await message.delete();
            } catch (deleteError) {
              // Messages may already be deleted, that's okay
              console.log(`[index.js]: ⚠️  Could not delete intro rejection message(s): ${deleteError.message}`);
            }
          }, 30000);
          
          return;
        }
        
        console.log(`[index.js]: ✅ Intro validation passed for ${message.author.tag}`);
        
        // Get Verified role and assign it
        const verifiedRole = message.guild.roles.cache.get(VERIFIED_ROLE_ID);
        if (!verifiedRole) {
          console.error(`[index.js]: ❌ Verified role not found (ID: ${VERIFIED_ROLE_ID})`);
          return;
        }
        
        // Add Verified role
        await member.roles.add(verifiedRole);
        console.log(`[index.js]: ✅ Added Verified role to ${message.author.tag} after intro post`);
        
        // React to the intro message with blue checkmark emoji
        try {
          await message.react('☑️'); // Blue ballot box with check
          console.log(`[index.js]: ✅ Reacted to intro message for ${message.author.tag}`);
        } catch (reactError) {
          console.log(`[index.js]: ⚠️  Could not react to intro message: ${reactError.message}`);
        }
        
        // Track intro post in database
        const User = require('../shared/models/UserModel');
        const userDoc = await User.getOrCreateUser(message.author.id);
        userDoc.introPostedAt = new Date();
        await userDoc.save();
        console.log(`[index.js]: ✅ Saved intro timestamp to database for ${message.author.tag}`);
        
        // Send confirmation DM
        try {
          const { EmbedBuilder } = require('discord.js');
          const confirmEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Intro Posted!')
            .setDescription(`Thanks for posting your intro! You now have full access to the server.`)
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setTimestamp();
          
          await message.author.send({ embeds: [confirmEmbed] });
          console.log(`[index.js]: ✅ Sent confirmation DM to ${message.author.tag}`);
        } catch (error) {
          // DM might be disabled, that's okay
          console.log(`[index.js]: ⚠️  Could not send intro confirmation DM to ${message.author.tag} (DMs may be disabled)`);
        }
        
      } catch (error) {
        console.error(`[index.js]: ❌ Error handling intro post:`, error);
        console.error(`[index.js]: Error stack:`, error.stack);
      }
    });

    // --------------------------------------------------------------------------
    // Raid Thread Slow Mode Management
    // --------------------------------------------------------------------------
    // Enable slow mode on raid and wave threads when they're created
    client.on("threadCreate", async (thread) => {
      try {
        // Check if this thread is associated with a raid or wave (thread name contains indicators)
        const threadName = thread.name.toLowerCase();
        const isWaveThread = threadName.includes('🌊') || threadName.includes('wave');
        const isRaidThread = threadName.includes('🛡️') || threadName.includes('raid');
        
        if (isWaveThread) {
          // Enable 20-second slow mode on wave threads
          await thread.setRateLimitPerUser(20);
          console.log(`[index.js]: ⏰ Enabled 20-second slow mode on wave thread: ${thread.name} (${thread.id})`);
        } else if (isRaidThread) {
          // Enable 10-second slow mode on raid threads
          await thread.setRateLimitPerUser(10);
          console.log(`[index.js]: ⏰ Enabled 10-second slow mode on raid thread: ${thread.name} (${thread.id})`);
        }
      } catch (error) {
        console.error(`[index.js]: ❌ Error enabling slow mode on thread:`, error);
      }
    });

    // --------------------------------------------------------------------------
    // User Data Cleanup on Server Leave
    // --------------------------------------------------------------------------
    // Delete all user data when they leave the server
    client.on("guildMemberRemove", async (member) => {
      try {
        const discordId = member.user.id;
        const username = member.user.tag;
        
        logger.info('CLEANUP', `User ${username} (${discordId}) left the server. Starting data cleanup...`);
        
        // Import necessary models
        const User = require('../shared/models/UserModel');
        const Character = require('../shared/models/CharacterModel');
        const ModCharacter = require('../shared/models/ModCharacterModel');
        const Pet = require('../shared/models/PetModel');
        const Mount = require('../shared/models/MountModel');
        const Quest = require('../shared/models/QuestModel');
        const Party = require('../shared/models/PartyModel');
        const MinigameModel = require('../shared/models/MinigameModel');
        const RuuGame = require('../shared/models/RuuGameModel');
        const StealStats = require('../shared/models/StealStatsModel');
        const BlightRollHistory = require('../shared/models/BlightRollHistoryModel');
        const ApprovedSubmission = require('../shared/models/ApprovedSubmissionModel');
        const Raid = require('../shared/models/RaidModel');
        
        // For vending cleanup, we'll use the vending connection directly
        const { connectToVending } = require('../shared/database/db');
        const vendingConnection = await connectToVending();
        
        // Get all characters for this user (needed for cascading deletes)
        const characters = await Character.find({ userId: discordId });
        const characterIds = characters.map(char => char._id);
        const characterNames = characters.map(char => char.name);
        
        // Get all mod characters for this user
        const modCharacters = await ModCharacter.find({ userId: discordId });
        const modCharacterIds = modCharacters.map(char => char._id);
        const modCharacterNames = modCharacters.map(char => char.name);
        
        // Combine all character IDs and names
        const allCharacterIds = [...characterIds, ...modCharacterIds];
        const allCharacterNames = [...characterNames, ...modCharacterNames];
        
        // Delete data from all collections
        const deletionResults = {};
        
        // 1. Delete user data
        const userResult = await User.deleteMany({ discordId: discordId });
        deletionResults.users = userResult.deletedCount;
        
        // 2. Delete characters
        const characterResult = await Character.deleteMany({ userId: discordId });
        deletionResults.characters = characterResult.deletedCount;
        
        // 3. Delete mod characters
        const modCharacterResult = await ModCharacter.deleteMany({ userId: discordId });
        deletionResults.modCharacters = modCharacterResult.deletedCount;
        
        // 4. Delete inventories (for all characters)
        // Import deleteCharacterInventoryCollection function
        const { deleteCharacterInventoryCollection } = require('../shared/database/db');
        let inventoryCollectionsDeleted = 0;
        if (allCharacterNames.length > 0) {
          for (const characterName of allCharacterNames) {
            try {
              // Each character has their own inventory collection
              await deleteCharacterInventoryCollection(characterName);
              inventoryCollectionsDeleted++;
            } catch (inventoryError) {
              // Collection might not exist, which is fine
              if (inventoryError.code !== 26) { // Ignore "namespace not found" error
                console.error(`[index.js]: ⚠️ Error deleting inventory collection for ${characterName}:`, inventoryError.message);
              }
            }
          }
          deletionResults.inventoryItems = inventoryCollectionsDeleted;
        } else {
          deletionResults.inventoryItems = 0;
        }
        
        // 5. Delete vending inventories (by character names)
        let vendingItemsDeleted = 0;
        if (allCharacterNames.length > 0) {
          for (const characterName of allCharacterNames) {
            try {
              // Each character has their own vending collection
              const vendingCollection = vendingConnection.collection(characterName.toLowerCase());
              const vendingResult = await vendingCollection.deleteMany({});
              vendingItemsDeleted += vendingResult.deletedCount;
            } catch (vendingError) {
              console.error(`[index.js]: ⚠️ Error deleting vending items for ${characterName}:`, vendingError.message);
            }
          }
          deletionResults.vendingItems = vendingItemsDeleted;
        } else {
          deletionResults.vendingItems = 0;
        }
        
        // 6. Delete pets
        const petResult = await Pet.deleteMany({ discordId: discordId });
        deletionResults.pets = petResult.deletedCount;
        
        // 7. Delete mounts
        const mountResult = await Mount.deleteMany({ discordId: discordId });
        deletionResults.mounts = mountResult.deletedCount;
        
        // 8. Remove user from active quests
        const questUpdateResult = await Quest.updateMany(
          { 'party.userId': discordId },
          { $pull: { party: { userId: discordId } } }
        );
        deletionResults.questsUpdated = questUpdateResult.modifiedCount;
        
        // 9. Remove user from parties or delete if they're the leader
        // First, delete parties where user is the leader
        const partyDeleteResult = await Party.deleteMany({ leaderId: discordId });
        deletionResults.partiesDeleted = partyDeleteResult.deletedCount;
        
        // Then remove user from other parties
        const partyUpdateResult = await Party.updateMany(
          { 'characters.userId': discordId },
          { $pull: { characters: { userId: discordId } } }
        );
        deletionResults.partiesUpdated = partyUpdateResult.modifiedCount;
        
        // Finally, delete parties that have no characters left
        const emptyPartyDeleteResult = await Party.deleteMany({ 
          characters: { $size: 0 } 
        });
        deletionResults.emptyPartiesDeleted = emptyPartyDeleteResult.deletedCount;
        
        // 10. Delete minigame data
        const minigameResult = await MinigameModel.updateMany(
          {},
          { $pull: { leaderboard: { discordId: discordId } } }
        );
        deletionResults.minigameEntriesRemoved = minigameResult.modifiedCount;
        
        // 11. Delete Ruu Game data
        const ruuGameResult = await RuuGame.updateMany(
          {},
          { $pull: { leaderboard: { discordId: discordId } } }
        );
        deletionResults.ruuGameEntriesRemoved = ruuGameResult.modifiedCount;
        
        // 12. Delete steal stats (by characterId)
        let stealStatsResult = { deletedCount: 0 };
        if (allCharacterIds.length > 0) {
          stealStatsResult = await StealStats.deleteMany({ 
            characterId: { $in: allCharacterIds }
          });
        }
        deletionResults.stealStats = stealStatsResult.deletedCount;
        
        // 13. Delete blight roll history
        const blightRollResult = await BlightRollHistory.deleteMany({ userId: discordId });
        deletionResults.blightRolls = blightRollResult.deletedCount;
        
        // 14. Delete temporary data associated with this user
        const tempDataResult = await TempData.deleteMany({
          $or: [
            { 'data.userId': discordId },
            { 'data.discordId': discordId },
            { 'data.participants.userId': discordId }
          ]
        });
        deletionResults.tempData = tempDataResult.deletedCount;
        
        // 15. Delete approved submissions by this user
        const approvedSubmissionResult = await ApprovedSubmission.deleteMany({ userId: discordId });
        deletionResults.approvedSubmissions = approvedSubmissionResult.deletedCount;
        
        // 16. Remove user from active raids or delete raids they're in
        const raidUpdateResult = await Raid.updateMany(
          { 'participants.userId': discordId },
          { $pull: { participants: { userId: discordId } } }
        );
        deletionResults.raidsUpdated = raidUpdateResult.modifiedCount;
        
        // Delete raids that have no participants left
        const emptyRaidDeleteResult = await Raid.deleteMany({ 
          participants: { $size: 0 } 
        });
        deletionResults.emptyRaidsDeleted = emptyRaidDeleteResult.deletedCount;
        
        // Log summary of deletions
        logger.success('CLEANUP', `Data cleanup completed for ${username} (${discordId}): Users: ${deletionResults.users}, Characters: ${deletionResults.characters}, Inventory: ${deletionResults.inventoryItems}, Pets: ${deletionResults.pets}, Mounts: ${deletionResults.mounts}`);
        
      } catch (error) {
        logger.error('CLEANUP', `Error during user data cleanup for ${member.user.tag}`);
        handleError(error, 'index.js', {
          operation: 'guildMemberRemove',
          userId: member.user.id,
          username: member.user.tag
        });
      }
    });

    // --------------------------------------------------------------------------
    // HTTP Healthcheck Server (for Railway auto-restart on high memory)
    // --------------------------------------------------------------------------
    // Note: http is already required above for error handling
    const healthcheckServer = http.createServer((req, res) => {
      // Only respond to healthcheck endpoint
      if (req.url === '/health' || req.url === '/healthcheck') {
        try {
          const memoryMonitor = getMemoryMonitor();
          if (!memoryMonitor) {
            // If memory monitor not available, return healthy
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy', message: 'Memory monitor not available' }));
            return;
          }
          
          const stats = memoryMonitor.getMemoryStats();
          const allTimers = Array.from(memoryMonitor.activeTimers?.values() || []);
          const nodeCronTimers = allTimers.filter(t => t.isNodeCron);
          const nodeCronCount = nodeCronTimers.length;
          
          // Memory thresholds (in bytes)
          const MEMORY_WARNING_THRESHOLD = 800 * 1024 * 1024; // 800 MB
          const MEMORY_CRITICAL_THRESHOLD = 1000 * 1024 * 1024; // 1 GB
          const TIMER_CRITICAL_THRESHOLD = 300000; // 300k timers
          
          const isMemoryCritical = stats.rss > MEMORY_CRITICAL_THRESHOLD;
          const isMemoryWarning = stats.rss > MEMORY_WARNING_THRESHOLD;
          const isTimerCritical = nodeCronCount > TIMER_CRITICAL_THRESHOLD;
          
          // Return unhealthy status if memory or timers exceed critical thresholds
          // This will cause Railway to restart the service
          if (isMemoryCritical || isTimerCritical) {
            logger.error('HEALTHCHECK', `Healthcheck FAILED - Memory: ${(stats.rss / 1024 / 1024).toFixed(2)} MB, Node-cron timers: ${nodeCronCount.toLocaleString()}`);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'unhealthy',
              reason: isMemoryCritical ? 'high_memory' : 'high_timers',
              memory_mb: (stats.rss / 1024 / 1024).toFixed(2),
              node_cron_timers: nodeCronCount,
              heap_used_mb: (stats.heapUsed / 1024 / 1024).toFixed(2)
            }));
            return;
          }
          
          // Return warning status if approaching limits
          if (isMemoryWarning) {
            logger.warn('HEALTHCHECK', `Healthcheck WARNING - Memory: ${(stats.rss / 1024 / 1024).toFixed(2)} MB`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'healthy',
              warning: 'high_memory',
              memory_mb: (stats.rss / 1024 / 1024).toFixed(2),
              node_cron_timers: nodeCronCount
            }));
            return;
          }
          
          // Healthy status
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            memory_mb: (stats.rss / 1024 / 1024).toFixed(2),
            heap_used_mb: (stats.heapUsed / 1024 / 1024).toFixed(2),
            node_cron_timers: nodeCronCount
          }));
        } catch (error) {
          logger.error('HEALTHCHECK', `Error in healthcheck: ${error.message}`);
          // On error, return unhealthy to trigger restart
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'unhealthy', error: error.message }));
        }
      } else {
        // 404 for other paths
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'not_found' }));
      }
    });
    
    healthcheckServer.listen(port, '0.0.0.0', () => {
      logger.info('HEALTHCHECK', `Healthcheck server listening on port ${port}`);
      logger.info('HEALTHCHECK', 'Healthcheck endpoint: /health or /healthcheck');
      logger.info('HEALTHCHECK', 'Returns 503 (unhealthy) when memory > 1GB or node-cron timers > 300k');
    });
    
    healthcheckServer.on('error', (error) => {
      logger.error('HEALTHCHECK', `Healthcheck server error: ${error.message}`);
      // Don't exit - bot can still run without healthcheck
    });

    // --------------------------------------------------------------------------
    // Start the Bot
    // --------------------------------------------------------------------------
    try {
      logger.info('SYSTEM', 'Attempting to login to Discord...');
      await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
      logger.error('SYSTEM', 'Failed to login to Discord');
      if (error.code === 'TokenInvalid') {
        logger.error('SYSTEM', 'Invalid Discord token. Please check your DISCORD_TOKEN environment variable.');
      }
      process.exit(1);
    }
  } catch (error) {
    logger.error('SYSTEM', 'Fatal error during initialization');
    process.exit(1);
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Brief description: Logging and utilities.
// ============================================================================
async function registerCommands(client) {
  try {
    logger.info('COMMANDS', 'Registering commands with Discord...');
    
    // Check required environment variables
    if (!process.env.DISCORD_TOKEN) {
      logger.error('COMMANDS', 'DISCORD_TOKEN is not set in environment variables');
      return;
    }
    
    if (!process.env.CLIENT_ID) {
      logger.error('COMMANDS', 'CLIENT_ID is not set in environment variables');
      return;
    }
    
    if (!process.env.GUILD_ID) {
      logger.error('COMMANDS', 'GUILD_ID is not set in environment variables');
      return;
    }
    
    // Collect all commands from client.commands
    const commands = [];
    const failedCommands = [];
    
    for (const [name, command] of client.commands) {
      if (command.data) {
        try {
          const commandData = command.data.toJSON();
          // Validate that the command data is valid
          if (commandData && typeof commandData === 'object') {
            commands.push(commandData);
          } else {
            failedCommands.push({ name, reason: 'Invalid command data structure' });
            logger.warn('COMMANDS', `Command "${name}" has invalid data structure, skipping...`);
          }
        } catch (jsonError) {
          failedCommands.push({ name, reason: jsonError.message });
          logger.error('COMMANDS', `Error converting command "${name}" to JSON: ${jsonError.message}`);
          logger.error('COMMANDS', `Command "${name}" stack: ${jsonError.stack}`);
        }
      } else {
        failedCommands.push({ name, reason: 'Missing data property' });
        logger.warn('COMMANDS', `Command "${name}" is missing data property, skipping...`);
      }
    }
    
    if (failedCommands.length > 0) {
      logger.warn('COMMANDS', `${failedCommands.length} command(s) failed to load: ${failedCommands.map(c => `${c.name} (${c.reason})`).join(', ')}`);
    }
    
    if (commands.length === 0) {
      logger.warn('COMMANDS', 'No commands found to register');
      return;
    }
    
    logger.info('COMMANDS', `Registering ${commands.length} commands...`);
    
    // Validate commands array before sending
    if (!Array.isArray(commands)) {
      logger.error('COMMANDS', 'Commands array is invalid');
      return;
    }
    
    // Register commands with Discord
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    
    logger.success('COMMANDS', `Successfully registered ${commands.length} commands with Discord`);
  } catch (error) {
    logger.error('COMMANDS', `Error registering commands: ${error.message}`);
    if (error.code === 50001) {
      logger.error('COMMANDS', 'Missing Access: Make sure the bot is in the guild and has proper permissions.');
    } else if (error.code === 10004) {
      logger.error('COMMANDS', 'Unknown Guild: The guild ID is invalid or the bot is not in this guild.');
    }
    // Don't throw - allow bot to continue even if command registration fails
  }
}

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
    logger.info('BLOODMOON', `Blood Moon Active (${hyruleanDate})`);
  }
}

initializeClient();
