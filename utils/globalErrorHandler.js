// ============================================================================
// ------------------- Error Handling -------------------
// Global error capturing and logging to Discord and Trello.
// ============================================================================
const { EmbedBuilder } = require('discord.js');
const dbConfig = require('../config/database');
const { trackDatabaseError, isDatabaseError } = require('./errorTracking');

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
  INTERACTION_REPLY: 'interaction_reply',
  INTERACTION_FOLLOWUP: 'interaction_followup',
  CONSOLE_ONLY: 'console_only',
  RETURN_ERROR: 'return_error',
  THROW_ERROR: 'throw_error'
};

// ------------------- Standard Error Context -------------------
function createErrorContext(source, context = {}) {
  return {
    source: source || 'Unknown Source',
    timestamp: new Date().toISOString(),
    ...context
  };
}

// ------------------- Handle Errors -------------------
// Captures, formats, and sends errors to both Trello and Discord.
async function handleError(error, source = "Unknown Source", context = {}) {
  const message = error?.stack || error?.message || String(error) || 'Unknown error occurred';
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  // ---- Extra context for Mongo/network errors ----
  let extraInfo = "";
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
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`❌ Error Detected in ${source}`)
        .addFields(
          { name: "🧠 Command Used", value: context.commandName || "Unknown", inline: false },
          { name: "🙋 User", value: context.userTag ? `${context.userTag} (${context.userId})` : "Unknown", inline: false },
          { name: "📦 Options", value: context.options ? `\`\`\`json\n${JSON.stringify(context.options, null, 2)}\n\`\`\`` : "None" },
          { name: "📝 Error Message", value: `\`\`\`\n${message.slice(0, 1000)}\n\`\`\`` || "No error message available" },
          ...(extraInfo ? [{ name: "🌐 Context", value: extraInfo }] : []),
          { name: "🔗 Trello Link", value: trelloLink ? trelloLink : "No Trello card available." }
        )
        .setTimestamp();

      try {
        // Create user mention content
        let mentionContent = "";
        if (context.userId) {
          mentionContent = `**HEY! <@${context.userId}>!** 🚨\n\nWhatever you're doing is causing an error! Please stop using the command and submit a bug report!\n\n**Error:** ${error.message || 'Unknown error occurred'}`;
        } else {
          mentionContent = `**HEY! @everyone!** 🚨\n\nWe are not sure who or what is causing this error, but we ask that members stop using commands until Ruu can check what is wrong!\n\n**Error:** ${error.message || 'Unknown error occurred'}`;
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
}

// ------------------- Unified Error Handler for Interactions -------------------
async function handleInteractionError(error, interaction, context = {}) {
  const errorContext = createErrorContext(context.source || 'interaction', {
    commandName: context.commandName || interaction?.commandName || 'unknown',
    userTag: interaction?.user?.tag || 'unknown',
    userId: interaction?.user?.id || 'unknown',
    ...context
  });

  // Log error with global handler
  await handleError(error, errorContext.source, errorContext);

  // Determine response type
  const responseType = context.responseType || ERROR_RESPONSE_TYPES.INTERACTION_REPLY;
  const errorMessage = context.errorMessage || '❌ **An error occurred while processing your request. Please try again later.**';

  try {
    switch (responseType) {
      case ERROR_RESPONSE_TYPES.INTERACTION_REPLY:
        if (!interaction.replied && !interaction.deferred) {
          return await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.INTERACTION_FOLLOWUP:
        if (interaction.replied || interaction.deferred) {
          return await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
        break;
      
      case ERROR_RESPONSE_TYPES.CONSOLE_ONLY:
        // Only log, no user response
        return;
      
      case ERROR_RESPONSE_TYPES.RETURN_ERROR:
        return { success: false, error: error.message };
      
      case ERROR_RESPONSE_TYPES.THROW_ERROR:
        throw error;
    }
  } catch (replyError) {
    console.error(`[globalErrorHandler]: Failed to send error response:`, replyError);
  }
}

// ------------------- Unified Error Handler for Async Functions -------------------
async function handleAsyncError(error, source, context = {}) {
  const errorContext = createErrorContext(source, context);
  
  // Log error with global handler
  await handleError(error, errorContext.source, errorContext);

  // Determine response type
  const responseType = context.responseType || ERROR_RESPONSE_TYPES.CONSOLE_ONLY;

  switch (responseType) {
    case ERROR_RESPONSE_TYPES.RETURN_ERROR:
      return { success: false, error: error.message };
    
    case ERROR_RESPONSE_TYPES.THROW_ERROR:
      throw error;
    
    case ERROR_RESPONSE_TYPES.CONSOLE_ONLY:
    default:
      return { success: false, error: error.message };
  }
}

// ------------------- Safe Async Wrapper -------------------
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
  handleError,
  handleInteractionError,
  handleAsyncError,
  safeAsync,
  createErrorContext,
  ERROR_RESPONSE_TYPES,
  initializeErrorHandler
};
