// ============================================================================
// 🌤️ Scheduled Weather Posting
// Handles daily weather updates in townhall channels at 8am
// ============================================================================

const { Client } = require('discord.js');
const weatherHandler = require('./weatherHandler');

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================
const TOWNHALL_CHANNELS = {
  Rudania: 'rudania-townhall',
  Inariko: 'inariko-townhall',
  Vhintl: 'vhintl-townhall'
};

// ============================================================================
// ------------------- Weather Posting Functions -------------------
// ============================================================================

// ---- Function: formatWeatherMessage ----
// Creates a formatted Discord message for weather updates
function formatWeatherMessage(village, weather) {
  const { temperature, wind, precipitation, special } = weather;
  
  let message = `## 🌤️ Daily Weather Report for ${village}\n\n`;
  message += `**Temperature:** ${temperature.emoji} ${temperature.label}\n`;
  message += `**Wind:** ${wind.emoji} ${wind.label}\n`;
  message += `**Conditions:** ${precipitation.emoji} ${precipitation.label}\n`;
  
  if (special) {
    message += `**Special:** ${special.emoji} ${special.label}\n`;
  }
  
  return message;
}

// ---- Function: postWeatherUpdate ----
// Posts weather updates to all townhall channels
async function postWeatherUpdate(client) {
  try {
    console.log('[scheduledWeather.js]: Starting daily weather update...');
    
    const villages = Object.keys(TOWNHALL_CHANNELS);
    const currentSeason = getCurrentSeason(); // You'll need to implement this based on your season system
    
    for (const village of villages) {
      try {
        // Get weather simulation
        const weather = weatherHandler.simulateWeightedWeather(village, currentSeason);
        
        // Find townhall channel
        const channelName = TOWNHALL_CHANNELS[village];
        const channel = client.channels.cache.find(ch => ch.name === channelName);
        
        if (!channel) {
          console.error(`[scheduledWeather.js]: Could not find channel: ${channelName}`);
          continue;
        }
        
        // Format and send message
        const message = formatWeatherMessage(village, weather);
        await channel.send(message);
        
        console.log(`[scheduledWeather.js]: Posted weather update for ${village}`);
      } catch (error) {
        console.error(`[scheduledWeather.js]: Error posting weather for ${village}:`, error);
      }
    }
    
    console.log('[scheduledWeather.js]: Completed daily weather update');
  } catch (error) {
    console.error('[scheduledWeather.js]: Error in weather update process:', error);
  }
}

// ============================================================================
// ------------------- Scheduler Setup -------------------
// ============================================================================

// ---- Function: setupWeatherScheduler ----
// Sets up the daily weather posting schedule
function setupWeatherScheduler(client) {
  // Calculate time until next 8am
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);
  
  if (now >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const timeUntilNext = nextRun - now;
  
  // Schedule first run
  setTimeout(() => {
    postWeatherUpdate(client);
    
    // Schedule subsequent runs every 24 hours
    setInterval(() => {
      postWeatherUpdate(client);
    }, 24 * 60 * 60 * 1000);
  }, timeUntilNext);
  
  console.log(`[scheduledWeather.js]: Weather scheduler initialized. Next update in ${timeUntilNext / 1000 / 60} minutes`);
}

// ---- Function: getCurrentSeason ----
// Determines the current season based on date
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Autumn';
  return 'Winter';
}

module.exports = {
  setupWeatherScheduler,
  postWeatherUpdate
}; 