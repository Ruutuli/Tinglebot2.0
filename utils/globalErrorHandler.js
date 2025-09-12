// ============================================================================
// ------------------- Error Handling -------------------
// Global error capturing and logging to Discord and Trello.
//
// USAGE EXAMPLES:
// 
// 1. Basic error handling (console only):
//    await handleError(error, 'myFile.js');
//
// 2. Interaction error with reply:
//    await handleError(error, 'myFile.js', {
//      interaction: interaction,
//      responseType: ERROR_RESPONSE_TYPES.REPLY,
//      errorMessage: 'Custom error message'
//    });
//
// 3. Using convenience wrappers:
//    await handleInteractionError(error, interaction, { source: 'myFile.js' });
//    await handleAsyncError(error, 'myFile.js', { responseType: ERROR_RESPONSE_TYPES.RETURN });
//
// 4. Safe async wrapper:
//    const safeFunction = safeAsync(myAsyncFunction, { source: 'myFile.js' });
//    const result = await safeFunction(args);
// ============================================================================
const { EmbedBuilder } = require('discord.js');
const dbConfig = require('../config/database');
const { trackDatabaseError, isDatabaseError, isDiscordAPIError } = require('./errorTracking');

// ------------------- Standard Libraries -------------------
const ERROR_LOG_CHANNEL_ID = process.env.CONSOLE_LOG_CHANNEL;

// ------------------- Variables -------------------
let trelloLogger = null;
let client = null;

// ------------------- Initialize Error Handler -------------------
// Sets up Trello logging function and Discord client.
function initializeErrorHandler(trelloLoggerFunction, discordClient) {
  trelloLogger = trelloLoggerFunction;
  client = discordClient;
}

// ------------------- Error Response Types -------------------
const ERROR_RESPONSE_TYPES = {
  REPLY: 'reply',           // For interaction.reply()
  FOLLOWUP: 'followup',     // For interaction.followUp()
  EDIT: 'edit',             // For interaction.editReply()
  CONSOLE: 'console',       // Console only, no user response
  RETURN: 'return',         // Return error object
  THROW: 'throw'            // Re-throw error
};

// ------------------- Standard Error Context -------------------
function createErrorContext(source, context = {}) {
  return {
    source: source || 'Unknown Source',
    timestamp: new Date().toISOString(),
    ...context
  };
}

// ------------------- Unified Error Handler -------------------
// Single function to handle all error types with consistent logging and response handling.
async function handleError(error, source = "Unknown Source", context = {}) {
  const message = error?.stack || error?.message || String(error) || 'Unknown error occurred';
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  // ---- Extra context for Discord API errors ----
  let extraInfo = "";
  if (
    error?.name === "HTTPError" ||
    (error?.message && error.message.includes('Service Unavailable')) ||
    (error?.message && error.message.includes('HTTPError'))
  ) {
    extraInfo += `\n🤖 **Discord API Error Details:**\n`;
    extraInfo += `• Error Type: ${error.name || 'HTTPError'}\n`;
    if (error.message?.includes('Service Unavailable')) {
      extraInfo += `• Issue: Discord API is temporarily unavailable\n`;
      extraInfo += `• Recommendation: This is usually a temporary Discord issue\n`;
    }
    if (context.commandName) extraInfo += `• Command: ${context.commandName}\n`;
    if (context.userId && context.userId !== 'unknown') extraInfo += `• User ID: ${context.userId}\n`;
    if (context.characterName && context.characterName !== 'unknown') extraInfo += `• Character: ${context.characterName}\n`;
  }
  
  // ---- Extra context for Mongo/network errors ----
  if (
    error?.name === "MongoNetworkError" ||
    error?.code === 'ETIMEDOUT' ||
    (error?.message && error.message.includes('ETIMEDOUT')) ||
    (error?.message && error.message.includes('Connect Timeout')) ||
    error?.name === "SocketError" ||
    (error?.message && error.message.includes('other side closed'))
  ) {
    // Try to extract host/port from error message
    let hostPortMatch = message.match(/([\d.]+):(\d+)/);
    let host = hostPortMatch ? hostPortMatch[1] : undefined;
    let port = hostPortMatch ? hostPortMatch[2] : undefined;
    // Redact password in connection string
    const redact = (str) => str ? str.replace(/(mongodb(?:\+srv)?:\/\/)(.*:.*)@(.*)/, '$1[REDACTED]@$3') : '';
    extraInfo += `\n🌐 **Network Error Details:**\n`;
    if (error?.name === "SocketError") extraInfo += `• Error Type: SocketError\n`;
    if (error?.message?.includes('other side closed')) extraInfo += `• Issue: Connection closed by remote server\n`;
    if (host) extraInfo += `• Host: ${host}\n`;
    if (port) extraInfo += `• Port: ${port}\n`;
    if (process.env.MONGODB_TINGLEBOT_URI) extraInfo += `• Tinglebot URI: ${redact(process.env.MONGODB_TINGLEBOT_URI)}\n`;
    if (dbConfig.inventories) extraInfo += `• Inventories URI: ${redact(dbConfig.inventories)}\n`;
    if (process.env.NODE_ENV) extraInfo += `• Node Env: ${process.env.NODE_ENV}\n`;
    if (context.options) extraInfo += `• Command Options: ${JSON.stringify(context.options)}\n`;
  }

  // ---- Extra context for Google Sheets errors ----
  if (error?.message?.includes('Unable to parse range') || error?.message?.includes('Google Sheets API')) {
    extraInfo += `\n📊 **Google Sheets Error Details:**\n`;
    if (context.characterName) extraInfo += `• Character: ${context.characterName}\n`;
    if (context.spreadsheetId) extraInfo += `• Spreadsheet ID: ${context.spreadsheetId}\n`;
    if (context.range) extraInfo += `• Range: ${context.range}\n`;
    if (context.sheetType) extraInfo += `• Sheet Type: ${context.sheetType}\n`;
    if (context.options) extraInfo += `• Command Options: ${JSON.stringify(context.options)}\n`;
  }

  const logBlock = `
[ERROR] ${source} - ${timestamp}
${context.commandName ? `Command Used: ${context.commandName}` : ""}
${context.userTag ? `User: ${context.userTag}` : ""}
${extraInfo ? `Context: ${extraInfo}` : ""}
Error: ${message}
`;

  console.error(logBlock);

  // Track database errors for shutdown threshold
  if (isDatabaseError(error)) {
    await trackDatabaseError(error, source);
  }
  
  // Log Discord API errors but don't track them for shutdown (they're usually temporary)
  if (isDiscordAPIError(error)) {
    console.log(`[globalErrorHandler.js]: 🤖 Discord API error detected: ${error.message}`);
  }

  let trelloLink = null;

  // ------------------- Trello Logging -------------------
  if (trelloLogger) {
    let trelloContent = `**Error Message:**\n\`\`\`${message}\`\`\`\n`;
    trelloContent += `**File:** ${source}\n`;
    trelloContent += `**Time:** ${timestamp}\n`;
    if (extraInfo) trelloContent += `**Context:**\n${extraInfo}\n`;

    if (context.commandName) trelloContent += `**Command Used:** ${context.commandName}\n`;
    if (context.userTag) trelloContent += `**User:** ${context.userTag} (${context.userId})\n`;
    if (context.options) trelloContent += `**Options:**\n\`\`\`${JSON.stringify(context.options)}\`\`\`\n`;

    try {
      trelloLink = await trelloLogger(trelloContent, source);
    } catch (err) {
      console.error(`[globalErrorHandler.js]: ❌ Failed to create Trello card: ${err.message}`);
    }
  }

  // ------------------- Discord Error Channel Logging -------------------
  if (client && client.channels?.cache.has(ERROR_LOG_CHANNEL_ID)) {
    const errorChannel = client.channels.cache.get(ERROR_LOG_CHANNEL_ID);

    if (errorChannel) {
      // Determine embed title and color based on error type
      const isDiscordError = isDiscordAPIError(error);
      const embedTitle = isDiscordError ? `🤖 Discord API Issue in ${source}` : `❌ Error Detected in ${source}`;
      const embedColor = isDiscordError ? 0xFFA500 : 0xFF0000; // Orange for Discord errors, Red for other errors

      const errorEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(embedTitle)
        .addFields(
          { name: "🧠 Command Used", value: context.commandName && context.commandName !== 'unknown' ? context.commandName : "unknown", inline: false },
          { name: "🙋 User", value: context.userTag && context.userTag !== 'unknown' ? `${context.userTag} (${context.userId})` : "unknown (unknown)", inline: false },
          { name: "📦 Options", value: context.options ? `\`\`\`json\n${JSON.stringify(context.options, null, 2)}\n\`\`\`` : "None" },
          { name: "📝 Error Message", value: `\`\`\`\n${message.slice(0, 1000)}\n\`\`\`` || "No error message available" },
          ...(isDiscordError ? [{ name: "🤖 Error Type", value: "**Discord API Issue** - This is not a bot problem. Discord's servers are experiencing issues." }] : []),
          ...(extraInfo ? [{ name: "🌐 Context", value: extraInfo }] : []),
          { name: "🔗 Trello Link", value: trelloLink ? trelloLink : "No Trello card available." }
        )
        .setTimestamp();

      try {
        // Create user mention content
        let mentionContent = "";
        if (context.userId && context.userId !== 'unknown') {
          // Check if this is a Discord API error
          if (isDiscordAPIError(error)) {
            mentionContent = `HEY! <@${context.userId}>! 🤖\n\n**This is a Discord API issue, not your fault!**\n\nDiscord's servers are experiencing problems right now. Please wait a few minutes and try your command again. This is not caused by our bot or anything you did wrong.\n\nError: ${error.message || 'Discord API Error'}`;
          } else {
            mentionContent = `HEY! <@${context.userId}>! 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\nError: ${error.message || 'Unknown error occurred'}`;
          }
        } else {
          // Check if this is a Discord API error for unknown users
          if (isDiscordAPIError(error)) {
            mentionContent = `HEY! @everyone! 🤖\n\n**Discord API is currently experiencing issues!**\n\nThis is not a bot problem - Discord's servers are having trouble. Please wait a few minutes before trying commands again.`;
          } else {
            mentionContent = `HEY! @everyone! 🚨\n\nWe are not sure who or what is causing this error, but we ask that members stop using commands until Ruu can check what is wrong!`;
          }
        }
        
        await errorChannel.send({ 
          content: mentionContent,
          embeds: [errorEmbed] 
        });
      } catch (sendError) {
        console.error(`[globalErrorHandler.js]: ❌ Failed to send error to Discord channel: ${sendError.message}`);
      }
    }
  }

  // ------------------- Handle Response Based on Type -------------------
  const responseType = context.responseType || ERROR_RESPONSE_TYPES.CONSOLE;
  const errorMessage = context.errorMessage || '❌ **An error occurred while processing your request. Please try again later.**';
  const interaction = context.interaction;

  try {
    switch (responseType) {
      case ERROR_RESPONSE_TYPES.REPLY:
        if (interaction && !interaction.replied && !interaction.deferred) {
          return await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.FOLLOWUP:
        if (interaction && (interaction.replied || interaction.deferred)) {
          return await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.EDIT:
        if (interaction && (interaction.replied || interaction.deferred)) {
          return await interaction.editReply({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.CONSOLE:
        // Only log, no user response
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

// ------------------- Convenience Wrappers -------------------
// These functions provide backward compatibility and convenience for common use cases.

// For interaction-based errors (replaces handleInteractionError)
async function handleInteractionError(error, interaction, context = {}) {
  const errorContext = {
    ...context,
    interaction: interaction,
    commandName: context.commandName || interaction?.commandName || 'unknown',
    userTag: context.userTag || interaction?.user?.tag || 'unknown',
    userId: context.userId || interaction?.user?.id || 'unknown',
    characterName: context.characterName || 'unknown',
    options: interaction?.options?.data || context.options,
    subcommand: interaction?.options?.getSubcommand() || context.subcommand,
    responseType: context.responseType || ERROR_RESPONSE_TYPES.REPLY
  };
  
  return await handleError(error, context.source || 'interaction', errorContext);
}

// For async function errors (replaces handleAsyncError)
async function handleAsyncError(error, source, context = {}) {
  const errorContext = {
    ...context,
    responseType: context.responseType || ERROR_RESPONSE_TYPES.CONSOLE
  };
  
  return await handleError(error, source, errorContext);
}

// Safe async wrapper for functions
function safeAsync(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return await handleAsyncError(error, context.source || fn.name, context);
    }
  };
}

module.exports = {
  // Main unified error handler
  handleError,
  
  // Convenience wrappers for backward compatibility
  handleInteractionError,
  handleAsyncError,
  safeAsync,
  
  // Utilities
  createErrorContext,
  ERROR_RESPONSE_TYPES,
  initializeErrorHandler
};
