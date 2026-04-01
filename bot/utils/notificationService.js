/* ============================================================================
 * Notification Service
 * Purpose: Sends Discord DMs to users based on their notification preferences
 * ============================================================================ */

const User = require('../models/UserModel');
const logger = require('./logger');

/**
 * Sends a Discord DM to a user with retry logic
 * @param {string} userId - Discord user ID
 * @param {object} embed - Discord embed object
 * @param {number} retries - Number of retries remaining (default: 2)
 * @returns {Promise<boolean>} - Whether the DM was sent successfully
 */
async function sendDiscordDM(userId, embed, retries = 2) {
  try {
    const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
    
    if (!DISCORD_BOT_TOKEN) {
      logger.error('DISCORD_TOKEN not configured', null, 'notificationService');
      return false;
    }

    // Step 1: Create a DM channel with the user
    const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: userId
      })
    });

    if (!dmChannelResponse.ok) {
      const errorData = await dmChannelResponse.json();
      // Don't retry on user-not-found or DM disabled errors (50007)
      if (errorData.code === 50007 || errorData.code === 10007) {
        logger.warn(`Cannot send DM to user ${userId}: ${errorData.message || 'User has DMs disabled or not found'}`, 'notificationService');
        return false;
      }
      
      // Retry on other errors
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return sendDiscordDM(userId, embed, retries - 1);
      }
      
      logger.warn(`Failed to create DM channel: ${errorData.message || 'Unknown error'} (User: ${userId})`, 'notificationService');
      return false;
    }

    const dmChannel = await dmChannelResponse.json();

    // Step 2: Send the message to the DM channel
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!messageResponse.ok) {
      const errorData = await messageResponse.json();
      // Don't retry on user-not-found or DM disabled errors
      if (errorData.code === 50007 || errorData.code === 10007) {
        logger.warn(`Cannot send DM to user ${userId}: ${errorData.message || 'User has DMs disabled or not found'}`, 'notificationService');
        return false;
      }
      
      // Retry on other errors
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return sendDiscordDM(userId, embed, retries - 1);
      }
      
      logger.warn(`Failed to send DM: ${errorData.message || 'Unknown error'} (User: ${userId})`, 'notificationService');
      return false;
    }

    logger.success(`Sent notification to user ${userId}`, 'notificationService');
    return true;
  } catch (error) {
    // Retry on network errors
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('fetch'))) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return sendDiscordDM(userId, embed, retries - 1);
    }
    
    logger.error(`Error sending DM to user ${userId}`, error, 'notificationService');
    return false;
  }
}

/**
 * Sends Blood Moon alerts to users who have enabled this notification
 * @param {object} bloodMoonData - Information about the Blood Moon event
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendBloodMoonAlerts(bloodMoonData = {}) {
  try {
    logger.custom('🌑', 'Sending Blood Moon alerts...', '\x1b[35m', 'notificationService');
    
    // Find all users who have Blood Moon alerts enabled
    const users = await User.find({ 'settings.bloodMoonAlerts': true });
    
    logger.info(`Found ${users.length} users with Blood Moon alerts enabled`, 'notificationService');
    
    const embed = {
      title: '🌑 Blood Moon Alert!',
      description: bloodMoonData.description || 'A Blood Moon is rising tonight! Prepare yourself, adventurer!',
      color: 0x8B0000, // Dark red
      fields: bloodMoonData.fields || [],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Blood Moon Event'
      }
    };

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const success = await sendDiscordDM(user.discordId, embed);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.success(`Blood Moon alerts sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Blood Moon alerts', error, 'notificationService');
    throw error;
  }
}

/**
 * Sends Weather notifications to users who have enabled this notification
 * @param {object} weatherData - Information about the weather event
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendWeatherNotifications(weatherData = {}) {
  try {
    logger.custom('🌦️', 'Sending Weather notifications...', '\x1b[34m', 'notificationService');
    
    // Find all users who have Weather notifications enabled
    const users = await User.find({ 'settings.weatherNotifications': true });
    
    logger.info(`Found ${users.length} users with Weather notifications enabled`, 'notificationService');
    
    const weatherEmojis = {
      'blightrain': '☠️',
      'blizzard': '❄️',
      'cinderstorm': '🔥',
      'cloudy': '☁️',
      'drought': '🌵',
      'fairycircle': '🧚',
      'flowerbloom': '🌸',
      'fog': '🌫️',
      'hail': '🧊',
      'heatlightning': '⚡',
      'jubilee': '🎉',
      'meteorshower': '☄️',
      'rain': '🌧️',
      'rainbow': '🌈',
      'rockslide': '🪨',
      'sleet': '🌨️',
      'snow': '❄️',
      'thundersnow': '⛈️',
      'thunderstorm': '⛈️'
    };

    let weatherType = weatherData.type || 'Special Weather';
    // Ensure weatherType is a string (extract label if it's an object)
    if (typeof weatherType !== 'string') {
      weatherType = weatherType?.label || String(weatherType) || 'Special Weather';
    }
    const emoji = weatherEmojis[weatherType.toLowerCase()] || '🌦️';
    
    const embed = {
      title: `${emoji} Special Weather Alert!`,
      description: weatherData.description || `${weatherType} is happening now!`,
      color: 0x87CEEB, // Sky blue
      fields: weatherData.fields || [
        {
          name: '🗺️ Location',
          value: weatherData.village || 'All Villages',
          inline: true
        },
        {
          name: '⏱️ Duration',
          value: weatherData.duration || 'Until next weather cycle',
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Weather Event'
      }
    };

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const success = await sendDiscordDM(user.discordId, embed);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.success(`Weather notifications sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Weather notifications', error, 'notificationService');
    throw error;
  }
}

/**
 * Sends Character of the Week notifications to users who have enabled this notification
 * @param {object} characterData - Information about the featured character
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendCharacterOfWeekNotifications(characterData = {}) {
  try {
    logger.custom('⭐', 'Sending Character of the Week notifications...', '\x1b[33m', 'notificationService');
    
    // Find all users who have Character of Week notifications enabled
    const users = await User.find({ 'settings.characterWeekUpdates': true });
    
    logger.info(`Found ${users.length} users with Character of Week notifications enabled`, 'notificationService');
    
    const embed = {
      title: '⭐ Character of the Week!',
      description: characterData.description || `${characterData.name || 'A new character'} is now the Character of the Week!`,
      color: 0xFFD700, // Gold
      fields: characterData.fields || [],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Character of the Week'
      }
    };

    // Add thumbnail if character icon is provided
    if (characterData.icon) {
      embed.thumbnail = {
        url: characterData.icon
      };
    }

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const success = await sendDiscordDM(user.discordId, embed);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.success(`Character of Week notifications sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Character of Week notifications', error, 'notificationService');
    throw error;
  }
}

/**
 * Sends Blight Call notifications to users who have enabled this notification
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendBlightCallNotifications() {
  try {
    logger.custom('📢', 'Sending Blight Call notifications...', '\x1b[35m', 'notificationService');
    
    // Find all users who have Blight Call notifications enabled
    const users = await User.find({ 'settings.blightCallNotifications': true });
    
    logger.info(`Found ${users.length} users with Blight Call notifications enabled`, 'notificationService');
    
    const embed = {
      title: '📢 Blight Roll Call Reminder!',
      description: 'The daily Blight roll call will begin in **15 minutes** at 8:00 PM Eastern (US)!',
      color: 0xAD1457, // Blight pink/magenta
      fields: [
        {
          name: '⏰ Time Remaining',
          value: '15 minutes until the Blight roll call',
          inline: false
        },
        {
          name: '🎲 Command',
          value: 'Use `/blight roll character_name` when the call starts!',
          inline: false
        },
        {
          name: '⚠️ Important',
          value: 'If you miss a roll, your character will automatically progress to the next Blight stage.',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Blight Roll Call'
      }
    };

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        // Validate user exists and has discordId
        if (!user || !user.discordId) {
          logger.warn(`Skipping invalid user in Blight Call notifications`, 'notificationService');
          failCount++;
          continue;
        }
        
        const success = await sendDiscordDM(user.discordId, embed);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error sending Blight Call notification to user ${user?.discordId || 'unknown'}`, error, 'notificationService');
        failCount++;
      }
    }

    logger.success(`Blight Call notifications sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Blight Call notifications', error, 'notificationService');
    throw error;
  }
}

/**
 * Sends Debuff End notification to a specific user when their character's debuff expires
 * @param {string} userId - Discord user ID
 * @param {object} characterData - Information about the character whose debuff expired
 * @returns {Promise<boolean>} - Whether the DM was sent successfully
 */
async function sendDebuffEndNotification(userId, characterData = {}) {
  try {
    // Check if user has debuff end notifications enabled
    const user = await User.findOne({ discordId: userId });
    if (!user || !user.settings?.debuffEndNotifications) {
      return false; // User doesn't have this notification enabled
    }

    const characterName = characterData.name || 'your character';
    
    const embed = {
      title: '✅ Debuff Ended!',
      description: `**${characterName}**'s debuff has ended! You can now heal them with items or a Healer.`,
      color: 0x00FF00, // Green
      fields: [
        {
          name: '💚 Healing Available',
          value: 'Your character can now receive healing through items or Healers.',
          inline: false
        },
        {
          name: '💊 Use Items',
          value: 'Use healing items or visit a Healer to restore your character\'s hearts.',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Debuff System'
      }
    };

    const success = await sendDiscordDM(userId, embed);
    
    if (success) {
      logger.success(`Sent debuff end notification to user ${userId} for ${characterName}`, 'notificationService');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error sending debuff end notification to user ${userId}`, error, 'notificationService');
    return false;
  }
}

/**
 * Sends Daily Weather notifications to users who have enabled this notification
 * @param {object} weatherData - Information about the daily weather (can contain multiple villages)
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendDailyWeatherNotifications(weatherData = {}) {
  try {
    logger.custom('🌤️', 'Sending Daily Weather notifications...', '\x1b[36m', 'notificationService');
    
    // Find all users who have Daily Weather notifications enabled
    const users = await User.find({ 'settings.dailyWeatherNotifications': true });
    
    logger.info(`Found ${users.length} users with Daily Weather notifications enabled`, 'notificationService');
    
    const weatherEmojis = {
      'blightrain': '☠️',
      'blizzard': '❄️',
      'cinderstorm': '🔥',
      'cloudy': '☁️',
      'drought': '🌵',
      'fairycircle': '🧚',
      'flowerbloom': '🌸',
      'fog': '🌫️',
      'hail': '🧊',
      'heatlightning': '⚡',
      'jubilee': '🎉',
      'meteorshower': '☄️',
      'rain': '🌧️',
      'rainbow': '🌈',
      'rockslide': '🪨',
      'sleet': '🌨️',
      'snow': '❄️',
      'thundersnow': '⛈️',
      'thunderstorm': '⛈️',
      'sunny': '☀️',
      'clear': '☀️'
    };

    // Build weather summary text
    let weatherSummary = 'Daily weather has been updated for all villages!';
    const weatherFields = [];
    
    if (weatherData.villages && Array.isArray(weatherData.villages)) {
      // Multiple villages with weather data
      weatherData.villages.forEach(villageWeather => {
        const village = villageWeather.village || 'Unknown';
        let weatherType = villageWeather.weather || villageWeather.type || 'Clear';
        // Ensure weatherType is a string (extract label if it's an object)
        if (typeof weatherType !== 'string') {
          weatherType = weatherType?.label || String(weatherType) || 'Clear';
        }
        const emoji = weatherEmojis[weatherType.toLowerCase()] || '🌤️';
        weatherFields.push({
          name: `${emoji} ${village}`,
          value: weatherType,
          inline: true
        });
      });
    } else if (weatherData.village && weatherData.type) {
      // Single village
      const emoji = weatherEmojis[weatherData.type.toLowerCase()] || '🌤️';
      weatherFields.push({
        name: `${emoji} ${weatherData.village}`,
        value: weatherData.type,
        inline: true
      });
    }
    
    // If no specific weather data, provide generic message
    if (weatherFields.length === 0) {
      weatherFields.push({
        name: '🌤️ Daily Weather Update',
        value: 'Check your village channels for today\'s weather!',
        inline: false
      });
    }
    
    const embed = {
      title: '🌤️ Daily Weather Update!',
      description: weatherSummary,
      color: 0x87CEEB, // Sky blue
      fields: weatherFields,
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Daily Weather'
      }
    };

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        // Validate user exists and has discordId
        if (!user || !user.discordId) {
          logger.warn(`Skipping invalid user in Daily Weather notifications`, 'notificationService');
          failCount++;
          continue;
        }
        
        const success = await sendDiscordDM(user.discordId, embed);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error sending Daily Weather notification to user ${user?.discordId || 'unknown'}`, error, 'notificationService');
        failCount++;
      }
    }

    logger.success(`Daily Weather notifications sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Daily Weather notifications', error, 'notificationService');
    throw error;
  }
}

/**
 * Sends a confirmation DM when a user enables a notification setting
 * @param {string} userId - Discord user ID
 * @param {string} notificationType - Type of notification enabled
 * @returns {Promise<boolean>} - Whether the DM was sent successfully
 */
async function sendNotificationEnabledConfirmation(userId, notificationType) {
  try {
    const notificationInfo = {
      bloodMoonAlerts: {
        emoji: '🌑',
        title: 'Blood Moon Alerts Enabled!',
        description: 'You will now receive notifications about upcoming Blood Moon events.',
        details: 'Get ready for the Blood Moon and plan your adventures accordingly!'
      },
      weatherNotifications: {
        emoji: '🌦️',
        title: 'Weather Notifications Enabled!',
        description: 'You will now receive notifications about special weather events.',
        details: 'Stay informed about rare weather patterns and special events!'
      },
      characterWeekUpdates: {
        emoji: '⭐',
        title: 'Character of the Week Alerts Enabled!',
        description: 'You will now be notified when the Character of the Week changes.',
        details: 'Be the first to know about featured characters!'
      },
      blightCallNotifications: {
        emoji: '📢',
        title: 'Blight Call Notifications Enabled!',
        description: 'You will now receive reminders 15 minutes before the daily Blight roll call.',
        details: 'Never miss a Blight roll call! You\'ll be notified at 7:45 PM Eastern (US) daily.'
      },
      debuffEndNotifications: {
        emoji: '✅',
        title: 'Debuff End Notifications Enabled!',
        description: 'You will now be notified when your character\'s debuff expires.',
        details: 'Get notified as soon as your character can be healed again!'
      },
      dailyWeatherNotifications: {
        emoji: '🌤️',
        title: 'Daily Weather Notifications Enabled!',
        description: 'You will now receive notifications about daily weather updates at 8 AM EST.',
        details: 'Stay informed about the weather in all villages every day!'
      }
    };

    const info = notificationInfo[notificationType];
    
    if (!info) {
      logger.error(`Unknown notification type: ${notificationType}`, null, 'notificationService');
      return false;
    }

    const embed = {
      title: `${info.emoji} ${info.title}`,
      description: info.description,
      color: 0x00A3DA, // Tinglebot blue
      fields: [
        {
          name: '✅ Notification Active',
          value: info.details,
          inline: false
        },
        {
          name: 'ℹ️ Manage Settings',
          value: 'You can change your notification preferences anytime in the dashboard settings.',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      image: {
        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      footer: {
        text: 'Roots of the Wild • Notification Settings'
      }
    };

    const success = await sendDiscordDM(userId, embed);
    
    if (success) {
      logger.success(`Sent confirmation for ${notificationType} to user ${userId}`, 'notificationService');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error sending notification confirmation to user ${userId}`, error, 'notificationService');
    return false;
  }
}

module.exports = {
  sendDiscordDM,
  sendBloodMoonAlerts,
  sendWeatherNotifications,
  sendCharacterOfWeekNotifications,
  sendBlightCallNotifications,
  sendDebuffEndNotification,
  sendDailyWeatherNotifications,
  sendNotificationEnabledConfirmation
};

