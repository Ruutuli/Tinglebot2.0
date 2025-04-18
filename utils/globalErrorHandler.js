// utils/globalErrorHandler.js

const { logErrorToTrello } = require('../scripts/trello');

// Pretty error log formatter for console + Trello
function handleError(error, source = 'Unknown Source', context = {}) {
  const message = error?.stack || error?.message || String(error);

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const logBlock = `
=================== [ERROR LOG - ${source}] ===================
🕒 Time: ${timestamp}
📄 File: ${source}
${context.commandName ? `💻 Command: ${context.commandName}` : ''}
${context.userTag ? `🙋 User: ${context.userTag} (${context.userId})` : ''}
${context.options ? `📦 Options: ${JSON.stringify(context.options)}` : ''}

❌ Error:
${message}
===============================================================
`;

  console.error(logBlock);

  // Build Trello content
  let trelloContent = `**Error Message:**\n\`\`\`${message}\`\`\`\n`;
  trelloContent += `**File:** ${source}\n`;
  trelloContent += `**Time:** ${timestamp}\n`;

  if (context.commandName) trelloContent += `**Command:** ${context.commandName}\n`;
  if (context.userTag) trelloContent += `**User:** ${context.userTag} (${context.userId})\n`;
  if (context.options) trelloContent += `**Options:**\n\`\`\`${JSON.stringify(context.options)}\`\`\`\n`;

  logErrorToTrello(trelloContent, source);
}

module.exports = { handleError };
