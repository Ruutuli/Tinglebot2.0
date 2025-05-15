// ============================================================================
// ------------------- Error Handling -------------------
// Global error capturing and logging to Discord and Trello.
// ============================================================================
const { EmbedBuilder } = require('discord.js');

// ------------------- Standard Libraries -------------------
const ERROR_LOG_CHANNEL_ID = process.env.ERROR_LOG_CHANNEL_ID || "1365790477747486730";

// ------------------- Variables -------------------
let trelloLogger = null;
let client = null;

// ------------------- Initialize Error Handler -------------------
// Sets up Trello logging function and Discord client.
function initializeErrorHandler(trelloLoggerFunction, discordClient) {
  trelloLogger = trelloLoggerFunction;
  client = discordClient;
}

// ------------------- Handle Errors -------------------
// Captures, formats, and sends errors to both Trello and Discord.
async function handleError(error, source = "Unknown Source", context = {}) {
  const message = error?.stack || error?.message || String(error);
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  // ---- Extra context for Mongo/network errors ----
  let extraInfo = "";
  if (
    error?.name === "MongoNetworkError" ||
    error?.code === 'ETIMEDOUT' ||
    (error?.message && error.message.includes('ETIMEDOUT')) ||
    (error?.message && error.message.includes('Connect Timeout'))
  ) {
    // Try to extract host/port from error message
    let hostPortMatch = message.match(/([\d.]+):(\d+)/);
    let host = hostPortMatch ? hostPortMatch[1] : undefined;
    let port = hostPortMatch ? hostPortMatch[2] : undefined;
    // Redact password in connection string
    const redact = (str) => str ? str.replace(/(mongodb(?:\+srv)?:\/\/)(.*:.*)@(.*)/, '$1[REDACTED]@$3') : '';
    extraInfo += `\n🌐 **Mongo/Network Error Details:**\n`;
    if (host) extraInfo += `• Host: ${host}\n`;
    if (port) extraInfo += `• Port: ${port}\n`;
    if (process.env.MONGODB_TINGLEBOT_URI) extraInfo += `• Tinglebot URI: ${redact(process.env.MONGODB_TINGLEBOT_URI)}\n`;
    if (process.env.MONGODB_INVENTORIES_URI) extraInfo += `• Inventories URI: ${redact(process.env.MONGODB_INVENTORIES_URI)}\n`;
    if (process.env.NODE_ENV) extraInfo += `• Node Env: ${process.env.NODE_ENV}\n`;
    if (context.options) extraInfo += `• Command Options: ${JSON.stringify(context.options)}\n`;
  }

  const logBlock = `
[ERROR] ${source} - ${timestamp}
${context.commandName ? `Command: ${context.commandName}` : ""}
${context.userTag ? `User: ${context.userTag}` : ""}
${extraInfo ? `Context: ${extraInfo}` : ""}
Error: ${message}
`;

  console.error(logBlock);

  let trelloLink = null;

  // ------------------- Trello Logging -------------------
  if (trelloLogger) {
    let trelloContent = `**Error Message:**\n\`\`\`${message}\`\`\`\n`;
    trelloContent += `**File:** ${source}\n`;
    trelloContent += `**Time:** ${timestamp}\n`;
    if (extraInfo) trelloContent += `**Network/DB Context:**\n${extraInfo}\n`;

    if (context.commandName) trelloContent += `**Command:** ${context.commandName}\n`;
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
          { name: "🧠 Command", value: context.commandName || "Unknown", inline: false },
          { name: "🙋 User", value: context.userTag ? `${context.userTag} (${context.userId})` : "Unknown", inline: false },
          { name: "📦 Options", value: context.options ? `\`\`\`json\n${JSON.stringify(context.options, null, 2)}\n\`\`\`` : "None" },
          { name: "📝 Error Message", value: `\`\`\`\n${message.slice(0, 1000)}\n\`\`\`` },
          ...(extraInfo ? [{ name: "🌐 Network/DB Context", value: extraInfo }] : []),
          { name: "🔗 Trello Link", value: trelloLink ? trelloLink : "No Trello card available." }
        )
        .setTimestamp();

      errorChannel.send({ embeds: [errorEmbed] }).catch(console.error);
    }
  }
}

module.exports = {
  initializeErrorHandler,
  handleError
};
