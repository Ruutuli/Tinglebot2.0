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

  const logBlock = `
=================== [ERROR LOG - ${source}] ===================
🕒 Time: ${timestamp}
📄 File: ${source}
${context.commandName ? `💻 Command: ${context.commandName}` : ""}
${context.userTag ? `🙋 User: ${context.userTag} (${context.userId})` : ""}
${context.options ? `📦 Options: ${JSON.stringify(context.options)}` : ""}

❌ Error:
${message}
===============================================================
`;

  console.error(logBlock);

  let trelloLink = null;

  // ------------------- Trello Logging -------------------
  if (trelloLogger) {
    let trelloContent = `**Error Message:**\n\`\`\`${message}\`\`\`\n`;
    trelloContent += `**File:** ${source}\n`;
    trelloContent += `**Time:** ${timestamp}\n`;

    if (context.commandName) trelloContent += `**Command:** ${context.commandName}\n`;
    if (context.userTag) trelloContent += `**User:** ${context.userTag} (${context.userId})\n`;
    if (context.options) trelloContent += `**Options:**\n\`\`\`${JSON.stringify(context.options)}\`\`\`\n`;

    try {
      trelloLink = await trelloLogger(trelloContent, source);
    } catch (err) {
      console.error("[globalErrorHandler.js]: Failed to create Trello card:", err.message);
    }
  }

// ------------------- Discord Error Channel Logging -------------------
if (client && client.channels?.cache.has(ERROR_LOG_CHANNEL_ID)) {
  const errorChannel = client.channels.cache.get(ERROR_LOG_CHANNEL_ID);

  if (errorChannel) {
    const { EmbedBuilder } = require("discord.js");

    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`❌ Error Detected in ${source}`)
      .addFields(
        { name: "🧠 Command", value: context.commandName || "Unknown", inline: false },
        { name: "🙋 User", value: context.userTag ? `${context.userTag} (${context.userId})` : "Unknown", inline: false },
        { name: "📦 Options", value: context.options ? `\`\`\`json\n${JSON.stringify(context.options, null, 2)}\n\`\`\`` : "None" },
        { name: "📝 Error Message", value: `\`\`\`\n${message.slice(0, 1000)}\n\`\`\`` },
        { name: "🔗 Trello Link", value: trelloLink ? trelloLink : "No Trello card available." }
      )
      .setTimestamp();

    errorChannel.send({ embeds: [errorEmbed] }).catch(console.error);
  }
}
}

// ------------------- Exports -------------------
module.exports = { handleError, initializeErrorHandler };
