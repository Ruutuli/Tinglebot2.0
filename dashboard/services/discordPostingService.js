// ============================================================================
// ------------------- Discord Posting Service -------------------
// Handles posting OC applications to Discord admin channels/threads
// ============================================================================

const logger = require('../utils/logger');
const Character = require('../models/CharacterModel');
const CharacterModeration = require('../models/CharacterModerationModel');
const { STATUS } = require('../utils/statusConstants');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
// Use the specific channel ID for OC application reviews (964342870796537909)
const ADMIN_REVIEW_CHANNEL_ID = process.env.ADMIN_REVIEW_CHANNEL_ID || process.env.CHARACTER_CREATION_CHANNEL_ID || '964342870796537909';
const ADMIN_REVIEW_THREAD_ID = process.env.ADMIN_REVIEW_THREAD_ID; // Optional

/**
 * Post application to admin review channel/thread
 * @param {Object} character - Character document
 * @returns {Promise<Object>} - Discord message and thread info
 */
async function postApplicationToAdminChannel(character) {
  try {
    console.log('[DISCORD_POSTING] Starting postApplicationToAdminChannel');
    console.log('[DISCORD_POSTING] Character:', {
      name: character?.name,
      id: character?._id?.toString(),
      userId: character?.userId,
      status: character?.status
    });
    console.log('[DISCORD_POSTING] Channel config:', {
      ADMIN_REVIEW_CHANNEL_ID,
      ADMIN_REVIEW_THREAD_ID,
      DISCORD_TOKEN: DISCORD_TOKEN ? 'SET' : 'NOT SET'
    });
    
    logger.info('DISCORD_POSTING', `Attempting to post character application: ${character?.name || 'Unknown'} (ID: ${character?._id || 'Unknown'})`);
    
    if (!DISCORD_TOKEN) {
      logger.warn('DISCORD_POSTING', 'DISCORD_TOKEN not configured, skipping Discord post');
      console.error('[DISCORD_POSTING] ERROR: DISCORD_TOKEN not configured');
      return null;
    }
    
    if (!character) {
      logger.error('DISCORD_POSTING', 'Character object is null or undefined');
      console.error('[DISCORD_POSTING] ERROR: Character object is null or undefined');
      return null;
    }
    
    if (!character._id) {
      logger.error('DISCORD_POSTING', 'Character ID is missing');
      console.error('[DISCORD_POSTING] ERROR: Character ID is missing');
      return null;
    }
    
    logger.info('DISCORD_POSTING', `Using channel ID: ${ADMIN_REVIEW_CHANNEL_ID}, thread ID: ${ADMIN_REVIEW_THREAD_ID || 'none'}`);
    console.log('[DISCORD_POSTING] Using channel ID:', ADMIN_REVIEW_CHANNEL_ID);

    // Check if this is a resubmission (has existing Discord message)
    const isResubmission = !!character.discordMessageId;
    const applicationVersion = character.applicationVersion || 1;
    
    console.log('[DISCORD_POSTING] Resubmission check:', {
      isResubmission,
      discordMessageId: character.discordMessageId,
      discordThreadId: character.discordThreadId,
      applicationVersion
    });

    // Get vote counts
    const approveCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: STATUS.NEEDS_CHANGES
    });

    // Helper functions for formatting
    const capitalize = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const capitalizeFirstLetter = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const convertCmToFeetInches = (heightInCm) => {
      const totalInches = heightInCm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `${feet}' ${inches}"`;
    };

    const getVillageEmoji = (village) => {
      const emojiMap = {
        'inariko': '🌊',
        'rudania': '🔥',
        'vhintl': '🌿'
      };
      return emojiMap[village?.toLowerCase()] || '';
    };

    const heightInFeetInches = character.height ? convertCmToFeetInches(character.height) : 'N/A';
    const homeVillageEmoji = getVillageEmoji(character.homeVillage);
    const currentVillageEmoji = getVillageEmoji(character.currentVillage);

    // Build gear info
    const gearInfo = [];
    if (character.gearWeapon?.name) {
      gearInfo.push(`🗡️ **Weapon:** ${character.gearWeapon.name}`);
    }
    if (character.gearShield?.name) {
      gearInfo.push(`🛡️ **Shield:** ${character.gearShield.name}`);
    }
    if (character.gearArmor?.chest?.name) {
      gearInfo.push(`👕 **Chest:** ${character.gearArmor.chest.name}`);
    }
    if (character.gearArmor?.legs?.name) {
      gearInfo.push(`👖 **Legs:** ${character.gearArmor.legs.name}`);
    }
    const gearText = gearInfo.length > 0 ? gearInfo.join('\n') : 'None selected';

    // Generate OC page URL
    const ocPageSlug = character.publicSlug || character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const dashboardUrl = (process.env.DASHBOARD_URL || 'https://tinglebot.xyz').replace(/\/+$/, '');
    const ocPageUrl = `${dashboardUrl}/ocs/${ocPageSlug}`;
    const moderationUrl = `${dashboardUrl}/character-moderation`;

    // Fetch Discord user to get username
    let ownerField = '';
    if (character.userId) {
      try {
        const userResponse = await fetch(`https://discord.com/api/v10/users/${character.userId}`, {
          headers: {
            'Authorization': `Bot ${DISCORD_TOKEN}`
          }
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const username = userData.username || 'Unknown';
          ownerField = `\n**Owner:** @${username}`;
        } else {
          // Fallback to user ID mention if fetch fails
          ownerField = `\n**Owner:** <@${character.userId}>`;
        }
      } catch (error) {
        console.error('[DISCORD_POSTING] Error fetching user:', error);
        // Fallback to user ID mention if fetch fails
        ownerField = `\n**Owner:** <@${character.userId}>`;
      }
    }

    // Create embed
    const embed = {
      title: `✨ OC Application Review: ${character.name} (v${applicationVersion})`,
      description: isResubmission ? `Application has been updated and is pending review.` : `A new character application is pending review.`,
      color: 0xFFA500, // Orange for pending
      thumbnail: {
        url: character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      image: character.appArt ? {
        url: character.appArt
      } : undefined,
      fields: [
        {
          name: '👤 Character Information',
          value: `**Name:** ${character.name}\n**Pronouns:** ${character.pronouns}\n**Age:** ${character.age}\n**Height:** ${character.height} cm (${heightInFeetInches})${ownerField}`,
          inline: false
        },
        {
          name: '🏘️ Location & Job',
          value: `**Race:** ${capitalize(character.race)}\n**Home Village:** ${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}\n**Job:** ${capitalizeFirstLetter(character.job)}`,
          inline: false
        },
        {
          name: '❤️ Stats',
          value: `**Hearts:** ${character.currentHearts}/${character.maxHearts}\n**Stamina:** ${character.currentStamina}/${character.maxStamina}\n**Attack:** ${character.attack || 0}\n**Defense:** ${character.defense || 0}`,
          inline: false
        },
        {
          name: '⚔️ Starting Gear',
          value: gearText || 'None selected',
          inline: false
        },
        {
          name: '📊 Vote Status',
          value: `✅ **Approves:** ${approveCount}/4\n⚠️ **Needs Changes:** ${needsChangesCount}`,
          inline: false
        },
        {
          name: '🔗 Links',
          value: `[📋 View OC Page](${ocPageUrl})\n[⚖️ Review in Moderation Panel](${moderationUrl})`,
          inline: false
        }
      ],
      footer: {
        text: `Application v${applicationVersion} • Submitted: ${character.submittedAt ? new Date(character.submittedAt).toLocaleDateString() : 'N/A'}`
      },
      timestamp: new Date().toISOString()
    };

    // Determine target channel (use existing thread if resubmission, otherwise use configured thread/channel)
    let targetChannelId = isResubmission 
      ? (character.discordThreadId || ADMIN_REVIEW_CHANNEL_ID)
      : (ADMIN_REVIEW_THREAD_ID || ADMIN_REVIEW_CHANNEL_ID);
    
    let messageResponse;
    let messageData;

    // If resubmission, update existing embed and post notification
    if (isResubmission && character.discordMessageId) {
      console.log('[DISCORD_POSTING] Updating existing embed for resubmission. Message ID:', character.discordMessageId);
      logger.info('DISCORD_POSTING', `Updating existing embed for ${character.name} (v${applicationVersion})`);
      
      // If we have a thread ID, use it; otherwise try to get the channel from the message
      // First, try to fetch the message to determine its channel
      let actualChannelId = targetChannelId;
      if (character.discordThreadId) {
        actualChannelId = character.discordThreadId;
        console.log('[DISCORD_POSTING] Using stored thread ID:', actualChannelId);
      } else {
        // Try to get the channel from the message
        try {
          const getMessageResponse = await fetch(`https://discord.com/api/v10/channels/${ADMIN_REVIEW_CHANNEL_ID}/messages/${character.discordMessageId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bot ${DISCORD_TOKEN}`
            }
          });
          
          if (getMessageResponse.ok) {
            const msgData = await getMessageResponse.json();
            // The message response doesn't include channel_id, but we know it's in ADMIN_REVIEW_CHANNEL_ID
            actualChannelId = ADMIN_REVIEW_CHANNEL_ID;
            console.log('[DISCORD_POSTING] Message found in channel:', actualChannelId);
          } else {
            // If message not found in channel, it might be in a thread
            console.log('[DISCORD_POSTING] Message not found in main channel, using stored channel ID');
            actualChannelId = ADMIN_REVIEW_CHANNEL_ID;
          }
        } catch (err) {
          console.error('[DISCORD_POSTING] Error fetching message:', err);
          actualChannelId = ADMIN_REVIEW_CHANNEL_ID;
        }
      }
      
      targetChannelId = actualChannelId;
      console.log('[DISCORD_POSTING] Final target channel ID for update:', targetChannelId);
      
      // Update the existing embed
      messageResponse = await fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages/${character.discordMessageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [embed]
        })
      });

      console.log('[DISCORD_POSTING] Update response status:', messageResponse.status, messageResponse.statusText);
      
      if (!messageResponse.ok) {
        const errorText = await messageResponse.text();
        logger.error('DISCORD_POSTING', `Failed to update application embed: ${messageResponse.status} - ${errorText}`);
        console.error('[DISCORD_POSTING] Full error details:', {
          status: messageResponse.status,
          statusText: messageResponse.statusText,
          error: errorText,
          channelId: targetChannelId,
          messageId: character.discordMessageId,
          characterName: character.name
        });
        return null;
      }

      messageData = await messageResponse.json();
      console.log('[DISCORD_POSTING] Successfully updated embed!');
      
      // Post a simple notification message - ALWAYS post this for resubmissions
      const notificationMessage = `🔄 **${character.name}** app has an update! (v${applicationVersion})`;
      console.log('[DISCORD_POSTING] Attempting to post notification message to channel:', targetChannelId);
      console.log('[DISCORD_POSTING] Notification message content:', notificationMessage);
      
      try {
        const notificationResponse = await fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: notificationMessage
          })
        });

        console.log('[DISCORD_POSTING] Notification response status:', notificationResponse.status, notificationResponse.statusText);

        if (notificationResponse.ok) {
          const notificationData = await notificationResponse.json();
          logger.info('DISCORD_POSTING', `Posted update notification for ${character.name}`);
          console.log('[DISCORD_POSTING] ✅ Posted update notification successfully. Message ID:', notificationData.id);
        } else {
          const errorText = await notificationResponse.text();
          logger.error('DISCORD_POSTING', `Failed to post update notification: ${notificationResponse.status} - ${errorText}`);
          console.error('[DISCORD_POSTING] ❌ Failed to post notification. Error details:', {
            status: notificationResponse.status,
            statusText: notificationResponse.statusText,
            error: errorText,
            channelId: targetChannelId,
            characterName: character.name
          });
          // Don't throw - we still updated the embed successfully
        }
      } catch (notificationError) {
        logger.error('DISCORD_POSTING', `Exception while posting notification: ${notificationError.message}`);
        console.error('[DISCORD_POSTING] Exception posting notification:', notificationError);
        // Don't throw - we still updated the embed successfully
      }

      logger.success('DISCORD_POSTING', `Application embed updated on Discord: ${character.name} (v${applicationVersion})`);
      console.log('[DISCORD_POSTING] Resubmission handling complete');
      
      return {
        messageId: character.discordMessageId,
        threadId: character.discordThreadId || null,
        channelId: targetChannelId
      };
    }

    // New submission - post new embed
    if (ADMIN_REVIEW_THREAD_ID) {
      console.log('[DISCORD_POSTING] Posting to thread:', ADMIN_REVIEW_THREAD_ID);
      // Post to thread (no user mention in content to avoid pinging)
      messageResponse = await fetch(`https://discord.com/api/v10/channels/${ADMIN_REVIEW_THREAD_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [embed]
        })
      });
      targetChannelId = ADMIN_REVIEW_THREAD_ID;
    } else {
      // Post to channel (no user mention in content to avoid pinging)
      console.log('[DISCORD_POSTING] Posting to channel:', ADMIN_REVIEW_CHANNEL_ID);
      messageResponse = await fetch(`https://discord.com/api/v10/channels/${ADMIN_REVIEW_CHANNEL_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [embed]
        })
      });
    }

    console.log('[DISCORD_POSTING] Response status:', messageResponse.status, messageResponse.statusText);
    
    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      logger.error('DISCORD_POSTING', `Failed to post application to Discord: ${messageResponse.status} - ${errorText}`);
      logger.error('DISCORD_POSTING', `Channel ID used: ${targetChannelId}, User ID: ${character.userId || 'missing'}`);
      console.error('[DISCORD_POSTING] Full error details:', {
        status: messageResponse.status,
        statusText: messageResponse.statusText,
        error: errorText,
        channelId: targetChannelId,
        userId: character.userId,
        characterName: character.name
      });
      return null;
    }

    messageData = await messageResponse.json();
    console.log('[DISCORD_POSTING] Success! Message ID:', messageData.id);
    
    // Update character with Discord message/thread IDs
    // Check if character is a Mongoose document or plain object
    if (character.save && typeof character.save === 'function') {
      character.discordMessageId = messageData.id;
      if (ADMIN_REVIEW_THREAD_ID) {
        character.discordThreadId = ADMIN_REVIEW_THREAD_ID;
      }
      await character.save();
    } else {
      // If it's a plain object, update via model
      const Character = require('../models/CharacterModel');
      await Character.updateOne(
        { _id: character._id },
        { 
          $set: { 
            discordMessageId: messageData.id,
            ...(ADMIN_REVIEW_THREAD_ID && { discordThreadId: ADMIN_REVIEW_THREAD_ID })
          }
        }
      );
    }

    logger.success('DISCORD_POSTING', `Application posted to Discord: ${character.name} (v${applicationVersion})`);
    console.log('[DISCORD_POSTING] Successfully posted to Discord');
    
    return {
      messageId: messageData.id,
      threadId: ADMIN_REVIEW_THREAD_ID || null,
      channelId: targetChannelId
    };
  } catch (error) {
    logger.error('DISCORD_POSTING', 'Error posting application to Discord', error);
    console.error('[DISCORD_POSTING] Exception caught:', error);
    console.error('[DISCORD_POSTING] Error stack:', error.stack);
    return null;
  }
}

/**
 * Update application embed with current vote counts
 * @param {string} messageId - Discord message ID
 * @param {Object} character - Character document
 * @returns {Promise<boolean>} - Success status
 */
async function updateApplicationEmbed(messageId, character) {
  try {
    if (!DISCORD_TOKEN || !messageId) {
      return false;
    }

    // Get vote counts
    const applicationVersion = character.applicationVersion || 1;
    const approveCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: STATUS.NEEDS_CHANGES
    });

    // Determine channel ID (thread or channel)
    const channelId = character.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;

    // Get existing message
    const getMessageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!getMessageResponse.ok) {
      logger.warn('DISCORD_POSTING', `Could not fetch message ${messageId} for update`);
      return false;
    }

    const existingMessage = await getMessageResponse.json();
    const existingEmbed = existingMessage.embeds?.[0];

    if (!existingEmbed) {
      logger.warn('DISCORD_POSTING', `Message ${messageId} has no embed to update`);
      return false;
    }

    // Update vote status field
    const updatedFields = existingEmbed.fields.map(field => {
      if (field.name === '📊 Vote Status') {
        return {
          name: '📊 Vote Status',
          value: `✅ **Approves:** ${approveCount}/4\n⚠️ **Needs Changes:** ${needsChangesCount}`,
          inline: false
        };
      }
      return field;
    });

    // Update embed
    const updatedEmbed = {
      ...existingEmbed,
      fields: updatedFields
    };

    // Patch message
    const patchResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [updatedEmbed]
      })
    });

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      logger.error('DISCORD_POSTING', `Failed to update embed: ${patchResponse.status} - ${errorText}`);
      return false;
    }

    logger.info('DISCORD_POSTING', `Updated application embed for ${character.name}`);
    return true;
  } catch (error) {
    logger.error('DISCORD_POSTING', 'Error updating application embed', error);
    return false;
  }
}

/**
 * Post resubmission update to Discord thread
 * @param {Object} character - Character document
 * @returns {Promise<boolean>} - Success status
 */
async function postResubmissionUpdate(character) {
  try {
    if (!DISCORD_TOKEN) {
      return false;
    }

    const channelId = character.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;
    if (!channelId) {
      logger.warn('DISCORD_POSTING', `No channel/thread ID for resubmission update: ${character.name}`);
      return false;
    }

    const embed = {
      title: `🔄 Application Resubmitted: ${character.name}`,
      description: `Application has been resubmitted as **version ${character.applicationVersion}**.\n\nPlease review the updated application.`,
      color: 0x00A3DA, // Tinglebot blue
      footer: {
        text: `Resubmitted: ${new Date().toLocaleDateString()}`
      },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('DISCORD_POSTING', `Failed to post resubmission update: ${response.status} - ${errorText}`);
      return false;
    }

    logger.success('DISCORD_POSTING', `Posted resubmission update for ${character.name} (v${character.applicationVersion})`);
    return true;
  } catch (error) {
    logger.error('DISCORD_POSTING', 'Error posting resubmission update', error);
    return false;
  }
}

/**
 * Post character creation notification to Discord (legacy function for resubmissions)
 * @param {Object} character - Character document
 * @param {Object} user - User document
 * @param {Object} reqUser - Request user object
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<void>}
 */
async function postCharacterCreationToDiscord(character, user, reqUser, req = null) {
  try {
    const CHARACTER_CREATION_CHANNEL_ID = ADMIN_REVIEW_CHANNEL_ID;
    
    if (!DISCORD_TOKEN) {
      logger.warn('DISCORD_POSTING', 'DISCORD_TOKEN not configured, skipping Discord post');
      return;
    }

    // Helper functions for formatting
    const capitalize = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const capitalizeFirstLetter = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const convertCmToFeetInches = (heightInCm) => {
      const totalInches = heightInCm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `${feet}' ${inches}"`;
    };

    // Get village emoji (simple mapping)
    const getVillageEmoji = (village) => {
      const emojiMap = {
        'inariko': '🌊',
        'rudania': '🔥',
        'vhintl': '🌿'
      };
      return emojiMap[village?.toLowerCase()] || '';
    };

    const heightInFeetInches = character.height ? convertCmToFeetInches(character.height) : 'N/A';
    const homeVillageEmoji = getVillageEmoji(character.homeVillage);
    const currentVillageEmoji = getVillageEmoji(character.currentVillage);

    // Build gear info
    const gearInfo = [];
    if (character.gearWeapon?.name) {
      gearInfo.push(`🗡️ **Weapon:** ${character.gearWeapon.name}`);
    }
    if (character.gearShield?.name) {
      gearInfo.push(`🛡️ **Shield:** ${character.gearShield.name}`);
    }
    if (character.gearArmor?.chest?.name) {
      gearInfo.push(`👕 **Chest:** ${character.gearArmor.chest.name}`);
    }
    if (character.gearArmor?.legs?.name) {
      gearInfo.push(`👖 **Legs:** ${character.gearArmor.legs.name}`);
    }
    const gearText = gearInfo.length > 0 ? gearInfo.join('\n') : 'None selected';

    // Get base URL for moderation link - use tinglebot.xyz
    const moderationUrl = 'https://tinglebot.xyz/character-moderation';

    // Get user's Discord avatar URL (for mention)
    const userDiscordId = reqUser?.discordId || user?.discordId || character.userId;
    const userAvatar = reqUser?.avatar || user?.avatar;
    const userAvatarUrl = userAvatar 
      ? `https://cdn.discordapp.com/avatars/${userDiscordId}/${userAvatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userDiscordId) || 0) % 5}.png`;

    // Get character page URL
    const characterPageUrl = `https://tinglebot.xyz/ocs/${encodeURIComponent(character.name)}`;

    // Create embed with improved styling - cleaner layout
    const embed = {
      title: `✨ New Character Created: ${character.name}`,
      description: `A new character has been submitted and is awaiting moderation review.`,
      color: 0xFFA500, // Orange for pending status
      thumbnail: {
        url: character.icon || userAvatarUrl || 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      image: {
        url: character.appArt || character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      fields: [
        {
          name: '👤 Character Information',
          value: `**Name:** ${character.name}\n**Pronouns:** ${character.pronouns}\n**Age:** ${character.age}\n**Height:** ${character.height} cm (${heightInFeetInches})`,
          inline: false
        },
        {
          name: '🏘️ Location & Job',
          value: `**Race:** ${capitalize(character.race)}\n**Home Village:** ${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}\n**Job:** ${capitalizeFirstLetter(character.job)}`,
          inline: false
        },
        {
          name: '❤️ Stats',
          value: `**Hearts:** ${character.currentHearts}/${character.maxHearts}\n**Stamina:** ${character.currentStamina}/${character.maxStamina}\n**Attack:** ${character.attack || 0}\n**Defense:** ${character.defense || 0}`,
          inline: false
        },
        {
          name: '⚔️ Starting Gear',
          value: gearText || 'None selected',
          inline: false
        },
        {
          name: '🔗 Links',
          value: `[📋 View Application](${characterPageUrl})\n[⚖️ Review in Moderation Panel](${moderationUrl})`,
          inline: false
        }
      ],
      footer: {
        text: `Created by ${reqUser?.username || user?.username || 'Unknown'} • Status: Pending Review`
      },
      timestamp: new Date().toISOString()
    };

    // Post to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${CHARACTER_CREATION_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      logger.error('DISCORD_POSTING', `Failed to post character creation to Discord: ${discordResponse.status} - ${errorText}`);
      return;
    }

    logger.success('DISCORD_POSTING', `Character creation posted to Discord: ${character.name}`);
  } catch (error) {
    logger.error('DISCORD_POSTING', 'Error posting character creation to Discord', error);
    // Don't throw - Discord posting failure shouldn't break character creation
  }
}

module.exports = {
  postApplicationToAdminChannel,
  updateApplicationEmbed,
  postResubmissionUpdate,
  postCharacterCreationToDiscord
};
