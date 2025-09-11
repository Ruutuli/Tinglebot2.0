// ============================================================================
// ------------------- Error Tracking System -------------------
// Tracks consecutive database errors and shuts down bot after threshold
// ============================================================================

const { EmbedBuilder } = require('discord.js');

// ------------------- Error Tracking Variables -------------------
let consecutiveDatabaseErrors = 0;
let lastErrorTime = null;
let isShuttingDown = false;
let client = null;

// Configuration
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RESET_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

// ------------------- Initialize Error Tracking -------------------
function initializeErrorTracking(discordClient) {
  client = discordClient;
  console.log("[errorTracking.js]: ✅ Error tracking system initialized");
}

// ------------------- Track Database Error -------------------
async function trackDatabaseError(error, source = "Unknown") {
  const now = Date.now();
  
  // Reset counter if enough time has passed since last error
  if (lastErrorTime && (now - lastErrorTime) > ERROR_RESET_TIME) {
    consecutiveDatabaseErrors = 0;
    console.log("[errorTracking.js]: 🔄 Error counter reset due to time gap");
  }
  
  // Increment error counter
  consecutiveDatabaseErrors++;
  lastErrorTime = now;
  
  console.log(`[errorTracking.js]: 📊 Database error #${consecutiveDatabaseErrors} detected in ${source}`);
  
  // Check if we've hit the threshold
  if (consecutiveDatabaseErrors >= MAX_CONSECUTIVE_ERRORS) {
    await handleCriticalErrorThreshold(error, source);
  }
}

// ------------------- Reset Error Counter -------------------
function resetErrorCounter() {
  consecutiveDatabaseErrors = 0;
  lastErrorTime = null;
  console.log("[errorTracking.js]: ✅ Error counter reset");
}

// ------------------- Handle Critical Error Threshold -------------------
async function handleCriticalErrorThreshold(error, source) {
  if (isShuttingDown) {
    console.log("[errorTracking.js]: ⚠️ Shutdown already in progress, skipping duplicate shutdown");
    return;
  }
  
  isShuttingDown = true;
  
  console.error(`[errorTracking.js]: 🚨 CRITICAL: ${consecutiveDatabaseErrors} consecutive database errors detected!`);
  console.error(`[errorTracking.js]: 🚨 Shutting down bot to prevent further damage...`);
  
  // Send @everyone notification to console logging channel
  await sendCriticalErrorNotification(error, source);
  
  // Wait a moment for the notification to be sent
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Shutdown the bot
  process.exit(1);
}

// ------------------- Send Critical Error Notification -------------------
async function sendCriticalErrorNotification(error, source) {
  if (!client) {
    console.error("[errorTracking.js]: ❌ No Discord client available for notification");
    return;
  }
  
  const consoleChannelId = process.env.CONSOLE_LOG_CHANNEL;
  if (!consoleChannelId) {
    console.error("[errorTracking.js]: ❌ CONSOLE_LOG_CHANNEL not configured");
    return;
  }
  
  try {
    const consoleChannel = client.channels.cache.get(consoleChannelId);
    if (!consoleChannel) {
      console.error("[errorTracking.js]: ❌ Console logging channel not found");
      return;
    }
    
    const criticalEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle("🚨 CRITICAL ERROR THRESHOLD REACHED 🚨")
      .setDescription(`**@everyone** - The bot is experiencing critical database connection issues and will be shut down immediately!`)
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
      content: "@everyone",
      embeds: [criticalEmbed]
    });
    
    console.log("[errorTracking.js]: ✅ Critical error notification sent to console channel");
    
  } catch (notificationError) {
    console.error("[errorTracking.js]: ❌ Failed to send critical error notification:", notificationError);
  }
}

// ------------------- Get Error Stats -------------------
function getErrorStats() {
  return {
    consecutiveErrors: consecutiveDatabaseErrors,
    lastErrorTime: lastErrorTime,
    isShuttingDown: isShuttingDown,
    maxErrors: MAX_CONSECUTIVE_ERRORS,
    resetTime: ERROR_RESET_TIME
  };
}

// ------------------- Check if Database Error -------------------
function isDatabaseError(error) {
  if (!error || !error.message) return false;
  
  const dbErrorPatterns = [
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
  
  return dbErrorPatterns.some(pattern => 
    error.message.includes(pattern) || 
    error.name === pattern ||
    error.code === pattern
  );
}

module.exports = {
  initializeErrorTracking,
  trackDatabaseError,
  resetErrorCounter,
  getErrorStats,
  isDatabaseError
};
