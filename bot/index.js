// Auto-deployed via GitHub Actions

// ============================================================================
// ------------------- Environment Setup -------------------
// ============================================================================
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables - try root .env first, then bot/.env as fallback
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const botEnvPath = path.resolve(__dirname, '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(botEnvPath)) {
  dotenv.config({ path: botEnvPath });
}

// ------------------- Path Aliases ------------------
// Alias @/ to bot root for clean imports
require('module-alias/register');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname));

const port = process.env.PORT || 5001;

// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const http = require('http');
const figlet = require("figlet");

// ============================================================================
// ------------------- Discord.js Components -------------------
// ============================================================================
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder } = require("discord.js");

// ============================================================================
// ------------------- Database Connections -------------------
// ============================================================================
const DatabaseConnectionManager = require('./database/connectionManager');
const { connectToTinglebot, connectToInventories, getTokenBalance, updateTokenBalance } = require('./database/db');
const TempData = require('./models/TempDataModel');

// ============================================================================
// ------------------- Handlers -------------------
// ============================================================================
const { handleAutocomplete } = require("./handlers/autocompleteHandler");
const { handleComponentInteraction } = require("./handlers/componentHandler");
const { handleSelectMenuInteraction } = require("./handlers/selectMenuHandler");
const { handleInteraction, initializeReactionHandler } = require('./handlers/interactionHandler');
const { initializeReactionRolesHandler } = require('./handlers/reactionRolesHandler');

// ============================================================================
// ------------------- Scripts & Modules -------------------
// ============================================================================
const { isBloodMoonDay, renameChannels, revertChannelNames } = require("./scripts/bloodmoon");
const { convertToHyruleanDate } = require("./modules/calendarModule");

// ============================================================================
// ------------------- Utils -------------------
// ============================================================================
const logger = require('@/utils/logger');
const { getMemoryMonitor } = require('@/utils/memoryMonitor');
const {
  handleError,
  initializeErrorHandler,
  initializeErrorTracking,
} = require('@/utils/globalErrorHandler');


// ============================================================================
// ------------------- Main Initialization -------------------
// ============================================================================
let client;

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- isBotMessage ------------------
// Checks if message is from a bot
function isBotMessage(message) {
  return message.author.bot;
}

// ------------------- isGuildMessage ------------------
// Validates message has guild context
function isGuildMessage(message) {
  return !!message.guild;
}

// ------------------- handleChannelMessage ------------------
// Generic handler for channel-specific message processing
async function handleChannelMessage(message, channelId, handler) {
  if (message.channelId !== channelId) return;
  if (isBotMessage(message)) return;
  await handler(message);
}

// ------------------- sendErrorResponse ------------------
// Standardized error response for interactions
async function sendErrorResponse(interaction, error) {
  const errorMessage = { content: 'There was an error while executing this command!', flags: [4096] };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  } catch (responseError) {
    logger.error('COMMAND', `[index.js]❌ Failed to send error response: ${responseError.message}`);
    // Final fallback - send as regular message
    try {
      await interaction.channel.send('❌ There was an error while executing this command!');
    } catch (sendError) {
      logger.error('COMMAND', `[index.js]❌ Failed to send fallback error message`);
    }
  }
}

// ============================================================================
// ------------------- Process Event Handlers -------------------
// ============================================================================

// ------------------- Suppress Circular Dependency Warnings ------------------
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
    return;
  }
  logger.warn('SYSTEM', `${warning.name}: ${warning.message}`);
});

// ============================================================================
// ------------------- Database Initialization -------------------
// ============================================================================

// ------------------- initializeDatabases ------------------
// Connects to databases and performs initial cleanup
async function initializeDatabases() {
  try {
    logger.info('DATABASE', 'Initializing database connections...');
    
    // Add timeout to database connections (increased to 60 seconds)
    const connectionTimeout = setTimeout(() => {
      logger.error('DATABASE', 'Connection timeout after 60 seconds');
      process.exit(1);
    }, 60000);

    // Use new connection manager for initialization
    await DatabaseConnectionManager.initialize();
    
    clearTimeout(connectionTimeout);
    logger.success('DATABASE', 'All databases connected');
    
    // Clean up temp data entries without expiration dates (TTL handles expiresAt automatically)
    const noExpirationResult = await TempData.deleteMany({ expiresAt: { $exists: false } });
    
    // Clean up special boosting status cases (TTL handles basic expiresAt expiry)
    // Only handle: status 'expired' and fulfilled boosts with expired boostExpiresAt
    const boostingCleanupResult = await TempData.deleteMany({
      type: 'boosting',
      $or: [
        { 'data.status': 'expired' },
        { 'data.status': 'fulfilled', 'data.boostExpiresAt': { $lt: Date.now() } }
      ]
    });
    
    // Log cleanup summary only if there were items cleaned
    // Note: TTL index automatically deletes documents with expired expiresAt (~60s intervals)
    const totalCleaned = noExpirationResult.deletedCount + boostingCleanupResult.deletedCount;
    if (totalCleaned > 0) {
      logger.info('CLEANUP', `Cleaned ${totalCleaned} temp data entries (TTL handles expiresAt automatically)`);
    }
    
    // Fix questBonus type issues (convert numeric questBonus to string)
    try {
      const ApprovedSubmission = require('@/models/ApprovedSubmissionModel');
      
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
        logger.info('CLEANUP', `Fixed ${approvedFixedCount + tempFixedCount} questBonus type issues`);
      }
    } catch (questBonusError) {
      logger.warn('CLEANUP', `Error fixing questBonus types: ${questBonusError.message}`);
      // Don't fail initialization if cleanup fails
    }
  } catch (err) {
    logger.error('DATABASE', `Initialization error: ${err.message}`);
    logger.error('DATABASE', `Details: ${err.name}`);
    process.exit(1);
  }
}



// ------------------- Uncaught Exception Handler ------------------
process.on('uncaughtException', (error) => {
  logger.error('SYSTEM', `Uncaught Exception: ${error.message}`);
  process.exit(1);
});

// ------------------- Unhandled Rejection Handler ------------------
process.on('unhandledRejection', (reason, promise) => {
  logger.error('SYSTEM', `Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// ------------------- SIGTERM Handler ------------------
process.on('SIGTERM', async () => {
  logger.info('SYSTEM', 'Received SIGTERM. Performing graceful shutdown...');
  await performGracefulShutdown();
});

// ============================================================================
// ------------------- Process Handlers -------------------
// ============================================================================

// ------------------- performGracefulShutdown ------------------
// Handles graceful shutdown of all services
async function performGracefulShutdown() {
  try {
    // 1. Stop Agenda scheduler (unlocks running jobs)
    try {
      const scheduler = require('@/utils/scheduler');
      await scheduler.stopAllTasks();
      logger.info('SYSTEM', 'Scheduler stopped');
    } catch (error) {
      logger.warn('SYSTEM', `Error stopping scheduler: ${error.message}`);
    }
    
    // 2. Destroy Discord client
    if (client) {
      logger.info('SYSTEM', 'Destroying Discord client...');
      await client.destroy();
    }
    
    // 3. Close all database connections gracefully
    logger.info('SYSTEM', 'Closing database connections...');
    try {
      await DatabaseConnectionManager.closeAll();
    } catch (error) {
      logger.warn('SYSTEM', `Error closing database connections: ${error.message}`);
    }
    
    // 4. Stop memory monitor
    try {
      const { getMemoryMonitor } = require('@/utils/memoryMonitor');
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

// ------------------- SIGINT Handler ------------------
process.on('SIGINT', async () => {
  logger.info('SYSTEM', 'Received SIGINT. Performing graceful shutdown...');
  await performGracefulShutdown();
});

// ============================================================================
// ------------------- Client Initialization -------------------
// ============================================================================

// ------------------- initializeClient ------------------
// Sets up Discord client and all event handlers
async function initializeClient() {
  try {
    // ------------------- System Initialization ------------------
    logger.section('System Initialization');
    logger.divider();
    
    // Apply Railway-specific optimizations
    try {
      const { configureRailwayOptimizations, setupRailwayMemoryMonitoring } = require('@/utils/railwayOptimizations');
      configureRailwayOptimizations();
      setupRailwayMemoryMonitoring();
    } catch (error) {
      logger.warn('RAILWAY', `Could not apply Railway optimizations: ${error.message}`);
    }
    
    // Initialize memory monitoring
    const memoryMonitor = getMemoryMonitor({
      enabled: true,
      warningThreshold: 500 * 1024 * 1024, // 500MB
      criticalThreshold: 1000 * 1024 * 1024 // 1GB
    });
    
    logger.divider();
    
    // ------------------- Database Connections ------------------
    logger.section('Database Connections');
    logger.divider();
    
    // Initialize databases
    await initializeDatabases();
    
    logger.divider();
    
    // ------------------- Discord Client Setup ------------------
    logger.section('Discord Client Setup');
    logger.divider();
    
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
    
    logger.info('SYSTEM', 'Discord client created');

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

    // ------------------- HTTP Server Error Handling ------------------
    // Handle HTTP parse errors from malformed client requests or premature disconnections
    // These errors are common and shouldn't crash the bot
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

    // Single ready handler to prevent duplicate initialization
    let readyHandlerExecuted = false;
    client.once("ready", async () => {
      // Guard against duplicate execution
      if (readyHandlerExecuted) {
        logger.error('SYSTEM', '⚠️ CRITICAL: Ready handler already executed! This should never happen.');
        return;
      }
      readyHandlerExecuted = true;

      // Update error handlers with client reference
      initializeErrorHandler(null, client);
      initializeErrorTracking(client);

      // Display banner
      logger.space();
      logger.banner('TINGLEBOT 2.0', 'Discord Bot Service');
      logger.space();
      logger.divider();

      try {
        // ------------------- Command Registration ------------------
        logger.section('Command Registration');
        logger.divider();
        await registerCommands(client);
        // Fetch command IDs for clickable slash mentions (IDs can change on re-register)
        try {
          const guildId = process.env.GUILD_ID;
          if (guildId) {
            const guild = await client.guilds.fetch(guildId);
            const commands = await guild.commands.fetch();
            const { setExploreCommandId, setWaveCommandId, setItemCommandId, setHealCommandId } = require("./embeds/embeds");
            for (const cmd of commands.values()) {
              if (cmd.name === "explore") setExploreCommandId(cmd.id);
              else if (cmd.name === "wave") setWaveCommandId(cmd.id);
              else if (cmd.name === "item") setItemCommandId(cmd.id);
              else if (cmd.name === "heal") setHealCommandId(cmd.id);
            }
            logger.info("COMMANDS", "Command IDs updated for clickable mentions (explore, wave, item, heal)");
          }
        } catch (err) {
          logger.warn("COMMANDS", `Could not fetch command IDs: ${err?.message || err}`);
        }
        logger.divider();
        
        // ------------------- System Modules ------------------
        logger.section('System Modules');
        logger.divider();
        
        // Initialize core systems
        initializeReactionHandler(client);
        initializeReactionRolesHandler(client);
        logger.info('SYSTEM', 'Reaction handlers initialized');
        
        // Initialize role count channels system
        const { initializeRoleCountChannels } = require('./modules/roleCountChannelsModule');
        initializeRoleCountChannels(client);
        
        // Initialize random encounters system
        const { initializeRandomEncounterBot } = require('./scripts/randomMonsterEncounters');
        initializeRandomEncounterBot(client);
        
        // Initialize universal scheduler (Agenda) and register tasks
        const scheduler = require('@/utils/scheduler');
        const { registerScheduledTasks, postUnpostedQuestsOnStartup } = require('./tasks/tasks');
        registerScheduledTasks(scheduler);
        await scheduler.initializeScheduler(client);
        logger.info('SYSTEM', 'Scheduler initialized (daily weather at 8am EST)');
        
        // Post any unposted quests from today on startup
        await postUnpostedQuestsOnStartup(client);
        
        // Check for expired raids on startup
        const { checkRaidExpiration } = require('./modules/raidModule');
        const Raid = require('./models/RaidModel');
        try {
          const activeRaids = await Raid.find({ status: 'active' });
          let expiredCount = 0;
          for (const raid of activeRaids) {
            try {
              const raidBefore = raid.status;
              await checkRaidExpiration(raid.raidId, client);
              const raidAfter = await Raid.findOne({ raidId: raid.raidId });
              if (raidAfter && raidBefore === 'active' && raidAfter.status !== 'active') {
                expiredCount++;
              }
            } catch (err) {
              logger.error('SYSTEM', `Failed to check expired raid ${raid.raidId} on startup: ${err.message}`);
            }
          }
          if (expiredCount > 0) {
            logger.info('SYSTEM', `Checked ${activeRaids.length} active raids on startup, expired ${expiredCount}`);
          } else if (activeRaids.length > 0) {
            logger.info('SYSTEM', `Checked ${activeRaids.length} active raids on startup, all still active`);
          }
        } catch (err) {
          logger.error('SYSTEM', `Error checking expired raids on startup: ${err.message}`);
        }
        
        // Check blood moon status
        logBloodMoonStatus();

        // Sync Blood Moon channel names on startup (handles bot restarts during/after Blood Moon)
        try {
          if (isBloodMoonDay()) {
            await renameChannels(client);
            logger.info('SYSTEM', 'Blood Moon channel names synced (active)');
          } else {
            await revertChannelNames(client);
            logger.info('SYSTEM', 'Blood Moon channel names synced (reverted)');
          }
        } catch (err) {
          logger.error('SYSTEM', `Failed to sync Blood Moon channel names on startup: ${err.message}`);
        }
        
        
        logger.divider();
        
        // ------------------- Ready Status ------------------
        logger.section('Ready Status');
        logger.divider();
        logger.success('SYSTEM', 'Bot is online and ready');
      } catch (error) {
        handleError(error, "index.js", {
          operation: 'initialization'
        });
      }
    });

    // ============================================================================
    // ------------------- Interaction Event Handlers -------------------
    // ============================================================================
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
            logger.error('COMMAND', '[index.js]❌ Command execution error');
            
            // Check if it's a webhook token error
            if (error.code === 50027) {
              logger.warn('COMMAND', '[index.js]⚠️ Webhook token expired, sending error as regular message');
              try {
                await interaction.channel.send('❌ The command took too long to complete. Please try again.');
              } catch (sendError) {
                logger.error('COMMAND', '[index.js]❌ Failed to send fallback error message');
              }
              return;
            }
            
            await sendErrorResponse(interaction, error);
          }
        } else if (interaction.isButton()) {
          await handleComponentInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
          logger.info('INTERACTION', `[index.js]🔄 Processing select menu interaction: ${interaction.customId}`);
          
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
              logger.error('COMMAND', `[index.js]❌ Error in command autocomplete handler for '${interaction.commandName}':`, error.message);
              try {
                if (!interaction.responded && interaction.isRepliable()) {
                  await interaction.respond([]);
                }
              } catch (respondError) {
                if (respondError.code !== 10062) {
                  logger.error('COMMAND', `[index.js]❌ Error responding to autocomplete:`, respondError.message);
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
              logger.error('COMMAND', `[index.js]❌ Error in handleAutocomplete for '${interaction.commandName}':`, error.message);
              try {
                if (!interaction.responded && interaction.isRepliable()) {
                  await interaction.respond([]);
                }
              } catch (respondError) {
                if (respondError.code !== 10062) {
                  logger.error('COMMAND', `[index.js]❌ Error responding to autocomplete:`, respondError.message);
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
        logger.error('INTERACTION', '[index.js]❌ Interaction error');
      }
    });

    // ============================================================================
    // ------------------- Message Event Handlers -------------------
    // ============================================================================


    // ------------------- Wishlist Channel Handler ------------------
    // Shared handler for wishlist and new channel
    async function handleWishlistMessage(message) {
      try {
        await message.react("⭐");
      } catch (err) {
        logger.error('WISHLIST', `[index.js]❌ Failed to react to wishlist message: ${err.message}`);
      }
    }

    // Wishlist Channel
    const WISHLIST_CHANNEL_ID = "1319826690935099463";
    client.on("messageCreate", async (message) => {
      await handleChannelMessage(message, WISHLIST_CHANNEL_ID, handleWishlistMessage);
    });

    // New Channel (uses same handler as wishlist)
    const NEW_CHANNEL_ID = "1381442926667763773";
    client.on("messageCreate", async (message) => {
      await handleChannelMessage(message, NEW_CHANNEL_ID, handleWishlistMessage);
    });

    // ------------------- RP Quest Post Tracking ------------------
    client.on("messageCreate", async (message) => {
      if (isBotMessage(message)) return;
      if (!isGuildMessage(message)) return;
      
      if (message.channel.isThread()) {
        try {
          const { handleRPPostTracking } = require('./modules/rpQuestTrackingModule');
          await handleRPPostTracking(message);
        } catch (error) {
          logger.error('RP_TRACKING', `[index.js]❌ Error tracking RP post: ${error.message}`);
        }
      }
    });

    // ------------------- Leveling System - XP Tracking ------------------
    client.on("messageCreate", async (message) => {
      if (isBotMessage(message)) return;
      if (!isGuildMessage(message)) return;
      
      try {
        const { handleXP } = require('./modules/levelingModule');
        await handleXP(message);
        const { trackLastMessage } = require('@/utils/messageUtils');
        await trackLastMessage(message);
      } catch (error) {
        logger.error('XP_TRACKING', `[index.js]❌ Error handling XP tracking: ${error.message}`);
      }
    });

    // ============================================================================
    // ------------------- Guild Event Handlers -------------------
    // ============================================================================

    // ------------------- Welcome Message System ------------------
    client.on("guildMemberAdd", async (member) => {
      try {
        // ------------------- New Member Welcome Token Bonus ------------------
        try {
          await updateTokenBalance(member.id, 500, {
            category: 'welcome_bonus',
            description: 'New member welcome bonus (500 tokens)'
          });
          logger.info('WELCOME', `[index.js]✅ Granted 500 tokens to new member ${member.user.tag} (${member.id})`);
        } catch (tokenErr) {
          logger.error('WELCOME', `[index.js]❌ Failed to grant welcome tokens to ${member.user.tag}: ${tokenErr.message}`);
        }

        // ------------------- Create Welcome Embed ------------------
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle(`🌱 Welcome to ${member.guild.name}, ${member.user.username}!`)
          .setDescription(`We're glad to have you here! Roots of the Wild is a Zelda-inspired RP where your OCs help shape the world.`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .addFields(
            {
              name: '⚠️ **READ THE WEBSITE — This is Critical!**',
              value: 'Many applications are rejected because members skip the guides. The website has everything you need: the **Character Creation Guide**, **Village + World Lore**, **Group Lore + Timeline**, reservation guide, and application guide. **Please read these before submitting** — it saves everyone time!\n\n🔗 https://www.rootsofthewild.com/',
              inline: false
            },
            {
              name: '📋 **The Joining Process (Steps 1–3)**',
              value: '**Step 1:** React to the **rules** channel to get the Traveler role.\n**Step 2:** Post your intro in **#intro** using the pinned template (required — do within 24hrs!).\n**Step 3:** Read the OC Guide on the website, then make a reservation post in **#roster**.',
              inline: false
            },
            {
              name: '📋 **The Joining Process (Steps 4–6)**',
              value: '**Step 4:** Submit your character via the tinglebot dashboard (Characters > Create Character). You\'ll get feedback or acceptance via DMs.\n**Step 5:** When accepted, post in **#roster** in the required format. A mod will assign the Resident role.\n**Step 6:** Set your nickname: Your Name | OC Name(s)\n\nThat\'s it! Full access. Welcome to Roots! 🎉',
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
            }
          )
          .setFooter({
            text: 'Take Courage. • Be Wise. • Nurture Power. • 🌿 Welcome to Roots!',
            icon_url: client.user.displayAvatarURL()
          })
          .setTimestamp();

        // ------------------- Send Welcome Message ------------------
        await member.send({ embeds: [welcomeEmbed] });
        logger.info('WELCOME', `[index.js]✅ Welcome message sent to ${member.user.tag} (${member.id})`);
      } catch (error) {
        logger.error('WELCOME', `[index.js]❌ Error sending welcome message to ${member.user.tag}: ${error.message}`);
      }
    });

    // ------------------- Intro Detection and Verified Role Assignment ------------------
    const INTRO_CHANNEL_ID = '795200689918836736';
    const VERIFIED_ROLE_ID = '1460099245347700962';
    const TRAVELER_ROLE_ID = '788137818135330837';
    
    // ------------------- validateIntroFormat ------------------
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
        
        logger.info('INTRO', `[index.js]📝 Message detected in intro channel from ${message.author.tag}`);
        
        // Skip bot messages
        if (message.author.bot) {
          logger.info('INTRO', `[index.js]⏭️ Skipping bot message`);
          return;
        }
        
        // Ensure we have the member object
        if (!message.guild) {
          logger.warn('INTRO', `[index.js]⚠️ No guild found for message`);
          return;
        }
        
        let member = message.member;
        if (!member) {
          // Try to fetch the member
          try {
            member = await message.guild.members.fetch(message.author.id);
            logger.info('INTRO', `[index.js]✅ Fetched member ${message.author.tag}`);
          } catch (fetchError) {
            logger.error('INTRO', `[index.js]❌ Could not fetch member ${message.author.tag}: ${fetchError.message}`);
            return;
          }
        }
        
        // Check if user already has Verified role
        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
          logger.info('INTRO', `[index.js]⏭️ User ${message.author.tag} already has Verified role`);
          return; // Already verified
        }
        
        // Check if user has Traveler role (they should have this to post)
        if (!member.roles.cache.has(TRAVELER_ROLE_ID)) {
          logger.warn('INTRO', `[index.js]⚠️ User ${message.author.tag} posted in intro without Traveler role`);
          return;
        }
        
        logger.info('INTRO', `[index.js]🔍 Processing intro post for ${message.author.tag}...`);
        
        // Validate intro format before assigning role
        const validation = validateIntroFormat(message);
        if (!validation.valid) {
          logger.warn('INTRO', `[index.js]❌ Intro validation failed for ${message.author.tag}. Missing: ${validation.errors.join(', ')}`);
          
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
              logger.warn('INTRO', `[index.js]⚠️ Could not delete intro rejection message(s): ${deleteError.message}`);
            }
          }, 30000);
          
          return;
        }
        
        logger.info('INTRO', `[index.js]✅ Intro validation passed for ${message.author.tag}`);
        
        // Get Verified role and assign it
        const verifiedRole = message.guild.roles.cache.get(VERIFIED_ROLE_ID);
        if (!verifiedRole) {
          logger.error('INTRO', `[index.js]❌ Verified role not found (ID: ${VERIFIED_ROLE_ID})`);
          return;
        }
        
        // Add Verified role
        await member.roles.add(verifiedRole);
        logger.info('INTRO', `[index.js]✅ Added Verified role to ${message.author.tag} after intro post`);
        
        // React to the intro message with blue checkmark emoji
        try {
          await message.react('☑️'); // Blue ballot box with check
          logger.info('INTRO', `[index.js]✅ Reacted to intro message for ${message.author.tag}`);
        } catch (reactError) {
          logger.warn('INTRO', `[index.js]⚠️ Could not react to intro message: ${reactError.message}`);
        }
        
        // Track intro post in database
        const User = require('@/models/UserModel');
        const userDoc = await User.getOrCreateUser(message.author.id);
        userDoc.introPostedAt = new Date();
        await userDoc.save();
        logger.info('INTRO', `[index.js]✅ Saved intro timestamp to database for ${message.author.tag}`);
        
        // Send confirmation DM
        try {
          const confirmEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Intro Posted!')
            .setDescription(`Thanks for posting your intro! You now have full access to the server.`)
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setTimestamp();
          
          await message.author.send({ embeds: [confirmEmbed] });
          logger.info('INTRO', `[index.js]✅ Sent confirmation DM to ${message.author.tag}`);
        } catch (error) {
          // DM might be disabled, that's okay
          logger.warn('INTRO', `[index.js]⚠️ Could not send intro confirmation DM to ${message.author.tag} (DMs may be disabled)`);
        }
        
      } catch (error) {
        logger.error('INTRO', `[index.js]❌ Error handling intro post: ${error.message}`);
      }
    });

    // ------------------- Raid Thread Slow Mode Management ------------------
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
          logger.info('THREAD', `[index.js]⏰ Enabled 20-second slow mode on wave thread: ${thread.name} (${thread.id})`);
        } else if (isRaidThread) {
          // Enable 10-second slow mode on raid threads
          await thread.setRateLimitPerUser(10);
          logger.info('THREAD', `[index.js]⏰ Enabled 10-second slow mode on raid thread: ${thread.name} (${thread.id})`);
        }
      } catch (error) {
        logger.error('THREAD', `[index.js]❌ Error enabling slow mode on thread: ${error.message}`);
      }
    });

    // ------------------- User Data Cleanup on Server Leave ------------------
    // Delete all user data when they leave the server
    client.on("guildMemberRemove", async (member) => {
      try {
        const discordId = member.user.id;
        const username = member.user.tag;
        
        logger.info('CLEANUP', `User ${username} (${discordId}) left the server. Starting data cleanup...`);

        // Redistribute leaver's tokens evenly to all Resident members (before any deletions)
        const RESIDENT_ROLE_ID = '788137728943325185';
        let leaverTokens = 0;
        try {
          leaverTokens = await getTokenBalance(discordId);
        } catch (balanceErr) {
          logger.warn('CLEANUP', `[index.js] Could not read token balance for ${discordId}: ${balanceErr.message}`);
        }
        if (leaverTokens > 0) {
          const maxRedistRetries = 3;
          let redistErr;
          for (let attempt = 0; attempt <= maxRedistRetries; attempt++) {
            try {
              await member.guild.members.fetch();
              const residentMembers = member.guild.members.cache.filter(
                m => !m.user.bot && m.roles.cache.has(RESIDENT_ROLE_ID)
              );
              if (residentMembers.size > 0) {
                const perPerson = Math.floor(leaverTokens / residentMembers.size);
                if (perPerson > 0) {
                  const meta = {
                    category: 'member_leave_redistribution',
                    description: `Tokens redistributed from ${username} who left the server`
                  };
                  for (const [recipientId, _m] of residentMembers) {
                    try {
                      await updateTokenBalance(recipientId, perPerson, meta);
                    } catch (recipientErr) {
                      logger.warn('CLEANUP', `[index.js] Failed to credit tokens to ${recipientId}: ${recipientErr.message}`);
                    }
                  }
                  logger.success('CLEANUP', `[index.js] Redistributed ${leaverTokens} tokens from ${discordId} to ${residentMembers.size} Resident(s), ${perPerson} each`);
                } else {
                  logger.info('CLEANUP', `[index.js] Skipped token redistribution: ${leaverTokens} tokens split among ${residentMembers.size} would be 0 per person`);
                }
              } else {
                logger.info('CLEANUP', `[index.js] Skipped token redistribution: no Resident members to receive ${leaverTokens} tokens`);
              }
              redistErr = null;
              break;
            } catch (err) {
              redistErr = err;
              const isRateLimited = /rate limit/i.test(err.message) && /retry after/i.test(err.message);
              const retryAfterMatch = err.message.match(/retry after ([\d.]+) seconds?/i);
              const retryAfterSec = retryAfterMatch ? parseFloat(retryAfterMatch[1]) : 5;
              if (isRateLimited && attempt < maxRedistRetries) {
                logger.info('CLEANUP', `[index.js] Token redistribution rate limited, waiting ${retryAfterSec}s before retry (${attempt + 1}/${maxRedistRetries})`);
                await new Promise((resolve) => setTimeout(resolve, (retryAfterSec + 0.5) * 1000));
              } else {
                break;
              }
            }
          }
          if (redistErr) {
            logger.warn('CLEANUP', `[index.js] Token redistribution failed for ${discordId}: ${redistErr.message}`);
          }
        }
        
        // Import necessary models
        const User = require('@/models/UserModel');
        const Character = require('@/models/CharacterModel');
        const ModCharacter = require('@/models/ModCharacterModel');
        const Pet = require('@/models/PetModel');
        const Mount = require('@/models/MountModel');
        const { Stable, ForSaleMount, ForSalePet } = require('@/models/StableModel');
        const Quest = require('@/models/QuestModel');
        const Party = require('@/models/PartyModel');
        const MinigameModel = require('@/models/MinigameModel');
        const RuuGame = require('@/models/RuuGameModel');
        const StealStats = require('@/models/StealStatsModel');
        const BlightRollHistory = require('@/models/BlightRollHistoryModel');
        const ApprovedSubmission = require('@/models/ApprovedSubmissionModel');
        const Raid = require('@/models/RaidModel');
        const Relationship = require('@/models/RelationshipModel');
        
        // For vending cleanup, we'll use the vending connection directly
        const { connectToVending } = require('@/database/db');
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
        const { deleteCharacterInventoryCollection, transferCharacterInventoryToVillageShops } = require('@/database/db');
        let inventoryCollectionsDeleted = 0;
        if (allCharacterNames.length > 0) {
          for (const characterName of allCharacterNames) {
            try {
              await transferCharacterInventoryToVillageShops(characterName);
            } catch (transferErr) {
              logger.warn('CLEANUP', `[index.js] Failed to transfer inventory to village shops for ${characterName}: ${transferErr.message}`);
            }
            try {
              await deleteCharacterInventoryCollection(characterName);
              inventoryCollectionsDeleted++;
            } catch (inventoryError) {
              if (inventoryError.code !== 26) {
                logger.warn('CLEANUP', `[index.js]⚠️ Error deleting inventory collection for ${characterName}: ${inventoryError.message}`);
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
              logger.warn('CLEANUP', `[index.js]⚠️ Error deleting vending items for ${characterName}: ${vendingError.message}`);
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

        // 7.5. Clean up stable + market listings tied to deleted characters
        // This prevents orphaned storedPets/for-sale entries after a user leaves.
        let stableDeleted = { deletedCount: 0 };
        let forSalePetsDeleted = { deletedCount: 0 };
        let forSaleMountsDeleted = { deletedCount: 0 };
        if (allCharacterIds.length > 0) {
          stableDeleted = await Stable.deleteMany({ characterId: { $in: allCharacterIds } });
          forSalePetsDeleted = await ForSalePet.deleteMany({ characterId: { $in: allCharacterIds } });
          forSaleMountsDeleted = await ForSaleMount.deleteMany({ characterId: { $in: allCharacterIds } });
        }
        deletionResults.stables = stableDeleted.deletedCount;
        deletionResults.forSalePets = forSalePetsDeleted.deletedCount;
        deletionResults.forSaleMounts = forSaleMountsDeleted.deletedCount;
        
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
        
        // 17. Delete relationship entries involving any of this user's characters
        // (both where they are characterId or targetCharacterId)
        let relationshipResult = { deletedCount: 0 };
        if (allCharacterIds.length > 0) {
          relationshipResult = await Relationship.deleteMany({
            $or: [
              { characterId: { $in: allCharacterIds } },
              { targetCharacterId: { $in: allCharacterIds } }
            ]
          });
        }
        deletionResults.relationships = relationshipResult.deletedCount;
        
        // Log summary of deletions
        logger.success('CLEANUP', `Data cleanup completed for ${username} (${discordId}): Users: ${deletionResults.users}, Characters: ${deletionResults.characters}, Inventory: ${deletionResults.inventoryItems}, Pets: ${deletionResults.pets}, Mounts: ${deletionResults.mounts}, Relationships: ${deletionResults.relationships}`);
        
      } catch (error) {
        logger.error('CLEANUP', `Error during user data cleanup for ${member.user.tag}`);
        handleError(error, 'index.js', {
          operation: 'guildMemberRemove',
          userId: member.user.id,
          username: member.user.tag
        });
      }
    });

    logger.divider();
    
    // ──────────────────────────────────────────────────────────────────────────
    // Healthcheck Server
    // ──────────────────────────────────────────────────────────────────────────
    logger.section('Healthcheck Server');
    logger.divider();
    
    // Note: http is already required above for error handling
    const healthcheckServer = http.createServer((req, res) => {
      // Log all healthcheck requests for debugging
      if (req.url === '/health' || req.url === '/healthcheck') {
        logger.info('HEALTHCHECK', `Healthcheck request received from ${req.headers['user-agent'] || 'unknown'}`);
      }
      
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
          
          // Memory thresholds (in bytes)
          const MEMORY_WARNING_THRESHOLD = 800 * 1024 * 1024; // 800 MB
          const MEMORY_CRITICAL_THRESHOLD = 1000 * 1024 * 1024; // 1 GB
          
          const isMemoryCritical = stats.rss > MEMORY_CRITICAL_THRESHOLD;
          const isMemoryWarning = stats.rss > MEMORY_WARNING_THRESHOLD;
          
          // Return unhealthy status if memory exceeds critical threshold
          // This will cause Railway to restart the service
          if (isMemoryCritical) {
            logger.error('HEALTHCHECK', `Healthcheck FAILED - Memory: ${(stats.rss / 1024 / 1024).toFixed(2)} MB`);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'unhealthy',
              reason: 'high_memory',
              memory_mb: (stats.rss / 1024 / 1024).toFixed(2),
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
              memory_mb: (stats.rss / 1024 / 1024).toFixed(2)
            }));
            return;
          }
          
          // Healthy status
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            memory_mb: (stats.rss / 1024 / 1024).toFixed(2),
            heap_used_mb: (stats.heapUsed / 1024 / 1024).toFixed(2)
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
      logger.success('HEALTHCHECK', `Healthcheck server listening on port ${port}`);
      logger.info('HEALTHCHECK', `Healthcheck endpoint: http://0.0.0.0:${port}/health or /healthcheck`);
      logger.info('HEALTHCHECK', 'Returns 503 (unhealthy) when memory > 1GB');
      logger.warn('HEALTHCHECK', 'IMPORTANT: Configure Railway Healthcheck Path to /health in service settings!');
    });
    
    healthcheckServer.on('error', (error) => {
      logger.error('HEALTHCHECK', `Healthcheck server error: ${error.message}`);
      // Don't exit - bot can still run without healthcheck
    });

    logger.divider();
    
    // ------------------- Discord Login ------------------
    logger.section('Discord Login');
    logger.divider();
    
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
// ------------------- Command Registration -------------------
// ============================================================================

// ------------------- registerCommands ------------------
// Registers all bot commands with Discord API
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

// ------------------- logBloodMoonStatus ------------------
// Logs blood moon status if active
function logBloodMoonStatus() {
  try {
    const isBloodMoon = isBloodMoonDay();
    // Only log if it's a blood moon day
    if (isBloodMoon) {
      const hyruleanDate = convertToHyruleanDate(new Date());
      logger.info('BLOODMOON', `Blood Moon Active (${hyruleanDate})`);
    }
  } catch (error) {
      handleError(error, "index.js", {
        operation: 'blood_moon_check'
      });
  }
}

initializeClient();
