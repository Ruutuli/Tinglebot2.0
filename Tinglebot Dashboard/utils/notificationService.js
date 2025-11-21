/* ============================================================================
 * Notification Service
 * Purpose: Sends Discord DMs to users based on their notification preferences
 * ============================================================================ */

const User = require('../models/UserModel');
const logger = require('./logger');

/**
 * Sends a Discord DM to a user
 * @param {string} userId - Discord user ID
 * @param {object} embed - Discord embed object
 * @returns {Promise<boolean>} - Whether the DM was sent successfully
 */
async function sendDiscordDM(userId, embed) {
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
      logger.warn(`Failed to send DM: ${errorData.message || 'Unknown error'} (User: ${userId})`, 'notificationService');
      return false;
    }

    logger.success(`Sent notification to user ${userId}`, 'notificationService');
    return true;
  } catch (error) {
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
 * Sends Daily Reset reminders to users who have enabled this notification
 * @returns {Promise<object>} - Stats about notifications sent
 */
async function sendDailyResetReminders() {
  try {
    logger.custom('⏰', 'Sending Daily Reset reminders...', '\x1b[36m', 'notificationService');
    
    // Find all users who have Daily Reset reminders enabled
    const users = await User.find({ 'settings.dailyResetReminders': true });
    
    logger.info(`Found ${users.length} users with Daily Reset reminders enabled`, 'notificationService');
    
    const embed = {
      title: '⏰ Daily Reset Reminder!',
      description: 'Your daily stamina has been restored! Time to roll and explore the world of Hyrule!',
      color: 0x00A3DA, // Tinglebot blue
      fields: [
        {
          name: '🎲 Daily Roll',
          value: 'Use `/roll` to see what the day brings!',
          inline: false
        },
        {
          name: '⚡ Stamina Restored',
          value: 'Your stamina is back to full - adventure awaits!',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Roots of the Wild • Daily Reset'
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

    logger.success(`Daily Reset reminders sent: ${successCount} successful, ${failCount} failed`, 'notificationService');
    
    return {
      total: users.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('Error sending Daily Reset reminders', error, 'notificationService');
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

    const weatherType = weatherData.type || 'Special Weather';
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
      dailyResetReminders: {
        emoji: '⏰',
        title: 'Daily Reset Reminders Enabled!',
        description: 'You will now receive reminders about daily resets and stamina recovery.',
        details: 'Never miss your daily roll or stamina refresh again!'
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
  sendDailyResetReminders,
  sendWeatherNotifications,
  sendCharacterOfWeekNotifications,
  sendNotificationEnabledConfirmation
};

