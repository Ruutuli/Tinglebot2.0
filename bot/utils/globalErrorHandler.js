// ============================================================================
// ------------------- Global Error Handling System -------------------
// Unified error handling with Discord logging and database error tracking
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const dbConfig = require('../config/database');
const logger = require('./logger');

// ============================================================================
// ------------------- Configuration & Constants -------------------
// ============================================================================

const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RESET_TIME = 5 * 60 * 1000; // 5 minutes
const ERROR_LOG_CHANNEL_ID = process.env.CONSOLE_LOG_CHANNEL;
const ERROR_LOG_COOLDOWN = 5000; // 5 seconds cooldown between identical errors

const ERROR_RESPONSE_TYPES = {
  REPLY: 'reply',
  FOLLOWUP: 'followup',
  EDIT: 'edit',
  CONSOLE: 'console',
  RETURN: 'return',
  THROW: 'throw'
};

// ============================================================================
// ------------------- State Variables -------------------
// ============================================================================

let consecutiveDatabaseErrors = 0;
let lastErrorTime = null;
let isShuttingDown = false;
let client = null;

// Error deduplication cache - tracks recently logged errors to prevent spam
const errorLogCache = new Map();

// ============================================================================
// ------------------- Error Detection Functions -------------------
// ============================================================================

const DB_ERROR_PATTERNS = [
  'Database connection failed',
  'Cannot read properties of null',
  'MongoNetworkError',
  'ETIMEDOUT',
  'Connect Timeout',
  'SocketError',
  'other side closed',
  'Missing MongoDB URI',
  'inventoriesDb is null'
];

const DISCORD_ERROR_PATTERNS = [
  'HTTPError',
  'Service Unavailable',
  'Rate Limited',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Bad Request',
  'Internal Server Error',
  'Gateway Timeout',
  'Unknown interaction',
  'DiscordAPIError'
];

function isDatabaseError(error) {
  if (!error?.message) return false;
  return DB_ERROR_PATTERNS.some(pattern => 
    error.message.includes(pattern) || 
    error.name === pattern ||
    error.code === pattern
  );
}

function isDiscordAPIError(error) {
  if (!error?.message && !error?.code) return false;
  
  // Check for Discord API error codes
  if (error.code === 10062) return true; // Unknown interaction
  
  return DISCORD_ERROR_PATTERNS.some(pattern => 
    error.message?.includes(pattern) || 
    error.name === pattern ||
    error.code === pattern
  );
}

// Generate a key for error deduplication
function getErrorKey(error, source) {
  // Use a simplified error message for database errors to group similar errors
  if (isDatabaseError(error)) {
    // Group all database connection errors together
    return `db_error:${source}`;
  }
  // For other errors, use message + source
  const message = error?.message || String(error);
  return `${source}:${message.substring(0, 100)}`;
}

// Check if error should be logged (deduplication check)
function shouldLogError(error, source) {
  // Don't log if shutting down
  if (isShuttingDown) {
    return false;
  }
  
  const errorKey = getErrorKey(error, source);
  const lastLogTime = errorLogCache.get(errorKey);
  const now = Date.now();
  
  // If error was logged recently (within cooldown), skip logging
  if (lastLogTime && (now - lastLogTime) < ERROR_LOG_COOLDOWN) {
    return false;
  }
  
  // Update cache with current timestamp
  errorLogCache.set(errorKey, now);
  
  // Clean up old cache entries (older than cooldown * 2)
  setTimeout(() => {
    const entryTime = errorLogCache.get(errorKey);
    if (entryTime && (Date.now() - entryTime) > ERROR_LOG_COOLDOWN * 2) {
      errorLogCache.delete(errorKey);
    }
  }, ERROR_LOG_COOLDOWN * 2);
  
  return true;
}

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================

function initializeErrorHandler(trelloLoggerFunction, discordClient) {
  // trelloLoggerFunction parameter kept for backward compatibility but not used
  client = discordClient;
  logger.success('SYSTEM', 'Error handling system initialized');
}

function initializeErrorTracking(discordClient) {
  // Error tracking is already initialized through initializeErrorHandler
  // This function exists for backward compatibility
  logger.success('SYSTEM', 'Error tracking system initialized');
}

// ============================================================================
// ------------------- Database Error Tracking -------------------
// ============================================================================

async function trackDatabaseError(error, source = "Unknown") {
  if (isShuttingDown) {
    logger.warn('SYSTEM', 'Skipping error tracking - shutdown in progress');
    return;
  }
  
  const now = Date.now();
  
  // Reset counter if enough time has passed
  if (lastErrorTime && (now - lastErrorTime) > ERROR_RESET_TIME) {
    consecutiveDatabaseErrors = 0;
    console.log("[globalErrorHandler.js]: 🔄 Error counter reset due to time gap");
  }
  
  consecutiveDatabaseErrors++;
  lastErrorTime = now;
  
  console.log(`[globalErrorHandler.js]: 📊 Database error #${consecutiveDatabaseErrors} detected in ${source}`);
  
  if (consecutiveDatabaseErrors >= MAX_CONSECUTIVE_ERRORS) {
    await handleCriticalErrorThreshold(error, source);
  }
}

function resetErrorCounter() {
  consecutiveDatabaseErrors = 0;
  lastErrorTime = null;
  logger.success('SYSTEM', 'Error counter reset');
}

// ============================================================================
// ------------------- Critical Error Handling -------------------
// ============================================================================

async function handleCriticalErrorThreshold(error, source) {
  if (isShuttingDown) {
    console.log("[globalErrorHandler.js]: ⚠️ Shutdown already in progress, skipping duplicate shutdown");
    return;
  }
  
  isShuttingDown = true;
  
  console.error(`[globalErrorHandler.js]: 🚨 CRITICAL: ${consecutiveDatabaseErrors} consecutive database errors detected!`);
  console.error(`[globalErrorHandler.js]: 🚨 Shutting down bot to prevent further damage...`);
  console.error(`[globalErrorHandler.js]: 🚨 FORCING BOT SHUTDOWN NOW... (Railway will restart automatically)`);
  
  // Send notification but don't wait for it - exit immediately to stop error spam
  sendCriticalErrorNotification(error, source).catch(() => {
    // Ignore notification errors during shutdown
  });
  
  // Exit immediately - Railway will detect the exit and restart the service
  // Setting exit code first ensures Railway sees it as a failure (which triggers restart)
  process.exitCode = 1;
  process.exit(1);
}

async function sendCriticalErrorNotification(error, source) {
  if (!client) {
    console.error("[globalErrorHandler.js]: ❌ No Discord client available for notification");
    return;
  }
  
  const consoleChannelId = process.env.CONSOLE_LOG_CHANNEL;
  if (!consoleChannelId) {
    console.error("[globalErrorHandler.js]: ❌ CONSOLE_LOG_CHANNEL not configured");
    return;
  }
  
  try {
    const consoleChannel = client.channels.cache.get(consoleChannelId);
    if (!consoleChannel) {
      console.error("[globalErrorHandler.js]: ❌ Console logging channel not found");
      return;
    }
    
    const criticalEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle("🚨 CRITICAL ERROR THRESHOLD REACHED 🚨")
      .setDescription(`The bot is experiencing critical database connection issues and will be shut down immediately!`)
      .addFields(
        { name: "📊 Consecutive Errors", value: `${consecutiveDatabaseErrors}`, inline: true },
        { name: "⏰ Time Window", value: `${ERROR_RESET_TIME / 1000 / 60} minutes`, inline: true },
        { name: "🔍 Last Error Source", value: source, inline: true },
        { name: "📝 Error Message", value: `\`\`\`\n${error.message || 'Unknown error'}\n\`\`\``, inline: false },
        { name: "🛑 Action Taken", value: "Bot shutdown initiated to prevent further damage", inline: false },
        { name: "⏰ Timestamp", value: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }), inline: false }
      )
      .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
      .setTimestamp();
    
    await consoleChannel.send({ 
      embeds: [criticalEmbed]
    });
    
    console.log("[globalErrorHandler.js]: ✅ Critical error notification sent to console channel");
    
  } catch (notificationError) {
    console.error("[globalErrorHandler.js]: ❌ Failed to send critical error notification:", notificationError);
  }
}

// ============================================================================
// ------------------- Main Error Handler -------------------
// ============================================================================

function buildErrorContext(error, context) {
  let extraInfo = "";
  
  // Discord API errors
  if (isDiscordAPIError(error)) {
    extraInfo += `\n🤖 **Discord API Error Details:**\n`;
    extraInfo += `• Error Type: ${error.name || 'HTTPError'}\n`;
    extraInfo += `• Error Code: ${error.code || 'Unknown'}\n`;
    
    if (error.code === 10062) {
      extraInfo += `• Issue: Interaction has expired (Discord interactions expire after 15 minutes)\n`;
      extraInfo += `• Recommendation: User should restart the command - this is normal behavior\n`;
    } else if (error.message?.includes('Service Unavailable')) {
      extraInfo += `• Issue: Discord API is temporarily unavailable\n`;
      extraInfo += `• Recommendation: This is usually a temporary Discord issue\n`;
    }
    
    if (context.commandName && context.commandName !== 'unknown') extraInfo += `• Command: ${context.commandName}\n`;
    if (context.userId && context.userId !== 'unknown') extraInfo += `• User ID: ${context.userId}\n`;
    if (context.characterName && context.characterName !== 'unknown') extraInfo += `• Character: ${context.characterName}\n`;
  }
  
  // Database/Network errors - simplified context to reduce verbosity
  if (isDatabaseError(error)) {
    extraInfo += `\n🌐 **Database Connection Error**\n`;
    if (error?.message?.includes('inventoriesDb is null')) {
      extraInfo += `• Issue: Database connection not established\n`;
    } else if (error?.message?.includes('Cannot read properties of null')) {
      extraInfo += `• Issue: Database connection lost\n`;
    } else if (error?.message) {
      // Only show error message, not all the URI details
      extraInfo += `• Error: ${error.message.substring(0, 200)}\n`;
    }
  }

  // Google Sheets errors
  if (error?.message?.includes('Unable to parse range') || error?.message?.includes('Google Sheets API')) {
    extraInfo += `\n📊 **Google Sheets Error Details:**\n`;
    if (context.characterName) extraInfo += `• Character: ${context.characterName}\n`;
    if (context.spreadsheetId) extraInfo += `• Spreadsheet ID: ${context.spreadsheetId}\n`;
    if (context.range) extraInfo += `• Range: ${context.range}\n`;
    if (context.sheetType) extraInfo += `• Sheet Type: ${context.sheetType}\n`;
    if (context.options) extraInfo += `• Command Options: ${JSON.stringify(context.options)}\n`;
  }
  
  return extraInfo;
}


async function handleDiscordLogging(error, source, context, extraInfo, message) {
  if (!client || !client.channels?.cache.has(ERROR_LOG_CHANNEL_ID)) return;
  
  const errorChannel = client.channels.cache.get(ERROR_LOG_CHANNEL_ID);
  if (!errorChannel) return;

  const isDiscordError = isDiscordAPIError(error);
  const embedTitle = isDiscordError ? `🤖 Discord API Issue in ${source}` : `❌ Error Detected in ${source}`;
  const embedColor = isDiscordError ? 0xFFA500 : 0xFF0000;

  const errorEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(embedTitle)
    .addFields(
      { name: "🧠 Command Used", value: context.commandName && context.commandName !== 'unknown' ? context.commandName : "unknown", inline: false },
      { name: "🙋 User", value: context.userTag && context.userTag !== 'unknown' ? `${context.userTag} (${context.userId})` : "unknown (unknown)", inline: false },
      { name: "📦 Options", value: context.options ? `\`\`\`json\n${JSON.stringify(context.options, null, 2)}\n\`\`\`` : "None" },
      { name: "📝 Error Message", value: `\`\`\`\n${message.slice(0, 1000)}\n\`\`\`` || "No error message available" },
      ...(isDiscordError ? [{ name: "🤖 Error Type", value: "**Discord API Issue** - This is not a bot problem. Discord's servers are experiencing issues." }] : []),
      ...(extraInfo ? [{ name: "🌐 Context", value: extraInfo }] : [])
    )
    .setTimestamp();

  try {
    const mentionContent = buildMentionContent(error, context);
    await errorChannel.send({ 
      content: mentionContent,
      embeds: [errorEmbed] 
    });
  } catch (sendError) {
    console.error(`[globalErrorHandler.js]: ❌ Failed to send error to Discord channel: ${sendError.message}`);
  }
}

function buildMentionContent(error, context) {
  const isDiscordError = isDiscordAPIError(error);
  
  if (context.userId && context.userId !== 'unknown') {
    if (isDiscordError) {
      if (error.code === 10062) {
        return `HEY! <@${context.userId}>! ⏰\n\n**Your interaction has expired!**\n\nDiscord interactions automatically expire after 15 minutes of inactivity. This is normal behavior - just run your command again to continue!\n\nError: ${error.message || 'Interaction expired'}`;
      } else {
        return `HEY! <@${context.userId}>! 🤖\n\n**This is a Discord API issue, not your fault!**\n\nDiscord's servers are experiencing problems right now. Please wait a few minutes and try your command again. This is not caused by our bot or anything you did wrong.\n\nError: ${error.message || 'Discord API Error'}`;
      }
    } else {
      return `HEY! <@${context.userId}>! 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\nError: ${error.message || 'Unknown error occurred'}`;
    }
  } else {
    if (isDiscordError) {
      if (error.code === 10062) {
        return `⏰ **Interaction timeouts are normal!** Discord interactions expire after 15 minutes. If you see this error, just restart your command - it's not a bug!`;
      } else {
        return `🤖 **Discord API is currently experiencing issues!** This is not a bot problem - Discord's servers are having trouble. Please wait a few minutes before trying commands again.`;
      }
    } else {
      return `🚨 **An error occurred.** Ruu has been notified and will look into it.`;
    }
  }
}

async function handleErrorResponse(error, context) {
  const responseType = context.responseType || ERROR_RESPONSE_TYPES.CONSOLE;
  const errorMessage = context.errorMessage || '❌ **An error occurred while processing your request. Please try again later.**';
  const interaction = context.interaction;

  try {
    switch (responseType) {
      case ERROR_RESPONSE_TYPES.REPLY:
        if (interaction && interaction.isRepliable && !interaction.replied && !interaction.deferred) {
          return await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.FOLLOWUP:
        if (interaction && interaction.followUp && (interaction.replied || interaction.deferred)) {
          return await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.EDIT:
        if (interaction && interaction.editReply && (interaction.replied || interaction.deferred)) {
          return await interaction.editReply({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.CONSOLE:
        return;
      
      case ERROR_RESPONSE_TYPES.RETURN:
        return { success: false, error: error.message };
      
      case ERROR_RESPONSE_TYPES.THROW:
        throw error;
    }
  } catch (replyError) {
    console.error(`[globalErrorHandler]: Failed to send error response:`, replyError);
  }
}

async function handleError(error, source = "Unknown Source", context = {}) {
  // Don't log if shutting down
  if (isShuttingDown) {
    return;
  }
  
  // Skip logging for Discord interaction expiration errors (10062) - these are normal
  if (error?.code === 10062) {
    // Silently ignore - expired interactions are normal Discord behavior
    return;
  }
  
  // Check error deduplication - skip if recently logged
  const shouldLog = shouldLogError(error, source);
  
  const message = error?.stack || error?.message || String(error) || 'Unknown error occurred';
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const extraInfo = buildErrorContext(error, context);

  // Only log full error details if not recently logged (deduplication)
  if (shouldLog) {
    const logBlock = `
[ERROR] ${source} - ${timestamp}
${context.commandName ? `Command Used: ${context.commandName}` : ""}
${context.userTag ? `User: ${context.userTag}` : ""}
${extraInfo ? `Context: ${extraInfo}` : ""}
Error: ${message}
`;

    console.error(logBlock);
  } else {
    // For repeated errors, just log a brief message
    console.error(`[ERROR] ${source} - Repeated error (suppressed for ${ERROR_LOG_COOLDOWN / 1000}s): ${error?.message || 'Unknown error'}`);
  }

  // Always track database errors for shutdown threshold (even if not logging)
  if (isDatabaseError(error)) {
    await trackDatabaseError(error, source);
  }
  
  // Log Discord API errors but don't track them for shutdown
  if (isDiscordAPIError(error) && shouldLog) {
    console.log(`[globalErrorHandler.js]: 🤖 Discord API error detected: ${error.message}`);
  }

  // Discord error channel logging (only if should log)
  if (shouldLog) {
    await handleDiscordLogging(error, source, context, extraInfo, message);
  }

  // Handle response based on type
  await handleErrorResponse(error, context);
}

// ============================================================================
// ------------------- Convenience Wrappers -------------------
// ============================================================================

async function handleInteractionError(error, interaction, context = {}) {
  // Extract command information from interaction
  let commandName = 'unknown';
  if (interaction?.commandName) {
    commandName = interaction.commandName;
  } else if (interaction?.command?.name) {
    commandName = interaction.command.name;
  } else if (context.commandName) {
    commandName = context.commandName;
  }

  // Extract user information from interaction
  let userTag = 'unknown';
  let userId = 'unknown';
  if (interaction?.user) {
    userTag = interaction.user.tag || `${interaction.user.username}#${interaction.user.discriminator}` || 'unknown';
    userId = interaction.user.id || 'unknown';
  } else if (context.userTag && context.userId) {
    userTag = context.userTag;
    userId = context.userId;
  }

  // Safely get subcommand - only if the command has subcommands
  let subcommand = context.subcommand;
  if (interaction?.options) {
    try {
      subcommand = interaction.options.getSubcommand();
    } catch (error) {
      // Command doesn't have subcommands, which is fine
      subcommand = context.subcommand;
    }
  }

  const errorContext = {
    ...context,
    interaction: interaction,
    commandName: commandName,
    userTag: userTag,
    userId: userId,
    characterName: context.characterName || 'unknown',
    options: interaction?.options?.data || context.options,
    subcommand: subcommand,
    responseType: context.responseType || ERROR_RESPONSE_TYPES.REPLY
  };
  
  return await handleError(error, context.source || 'interaction', errorContext);
}

async function handleAsyncError(error, source, context = {}) {
  const errorContext = {
    ...context,
    responseType: context.responseType || ERROR_RESPONSE_TYPES.CONSOLE
  };
  
  return await handleError(error, source, errorContext);
}

function safeAsync(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return await handleAsyncError(error, context.source || fn.name, context);
    }
  };
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

function createErrorContext(source, context = {}) {
  return {
    source: source || 'Unknown Source',
    timestamp: new Date().toISOString(),
    ...context
  };
}

function getErrorStats() {
  return {
    consecutiveErrors: consecutiveDatabaseErrors,
    lastErrorTime: lastErrorTime,
    isShuttingDown: isShuttingDown,
    maxErrors: MAX_CONSECUTIVE_ERRORS,
    resetTime: ERROR_RESET_TIME
  };
}

module.exports = {
  // Main error handler
  handleError,
  
  // Convenience wrappers
  handleInteractionError,
  handleAsyncError,
  safeAsync,
  
  // Database error tracking
  trackDatabaseError,
  resetErrorCounter,
  getErrorStats,
  
  // Error detection
  isDatabaseError,
  isDiscordAPIError,
  
  // Utilities
  createErrorContext,
  ERROR_RESPONSE_TYPES,
  initializeErrorHandler,
  initializeErrorTracking
};