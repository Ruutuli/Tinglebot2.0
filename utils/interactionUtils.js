// ------------------- Interaction Response Utilities -------------------
// Utilities for safely handling Discord interaction responses, especially for long-running operations

/**
 * Safely sends a response to a Discord interaction, with fallbacks for expired webhook tokens
 * @param {Discord.Interaction} interaction - The Discord interaction object
 * @param {Object} options - Response options
 * @param {string} options.content - The message content
 * @param {boolean} options.ephemeral - Whether the message should be ephemeral
 * @param {boolean} options.fallbackToChannel - Whether to send as channel message if interaction fails
 * @returns {Promise<boolean>} - Whether the response was sent successfully
 */
async function safeInteractionResponse(interaction, options = {}) {
  const { content, ephemeral = true, fallbackToChannel = true } = options;
  
  try {
    // Check if interaction is still valid
    if (!interaction.replied && !interaction.deferred) {
      console.warn('[interactionUtils]: Interaction has expired');
      if (fallbackToChannel) {
        await interaction.channel.send({ content, ephemeral: false });
        return true;
      }
      return false;
    }
    
    // Try to edit the reply
    await interaction.editReply({ content, flags: ephemeral ? [4096] : [] });
    return true;
  } catch (error) {
    console.error('[interactionUtils]: Error sending interaction response:', error);
    
    // If it's a webhook token error, try fallback
    if (error.code === 50027 && fallbackToChannel) {
      try {
        await interaction.channel.send({ content, ephemeral: false });
        return true;
      } catch (sendError) {
        console.error('[interactionUtils]: Failed to send fallback message:', sendError);
        return false;
      }
    }
    
    return false;
  }
}

/**
 * Safely sends a follow-up message to a Discord interaction
 * @param {Discord.Interaction} interaction - The Discord interaction object
 * @param {Object} options - Response options
 * @param {string} options.content - The message content
 * @param {boolean} options.ephemeral - Whether the message should be ephemeral
 * @param {boolean} options.fallbackToChannel - Whether to send as channel message if followUp fails
 * @returns {Promise<boolean>} - Whether the follow-up was sent successfully
 */
async function safeFollowUp(interaction, options = {}) {
  const { content, ephemeral = true, fallbackToChannel = true } = options;
  
  try {
    await interaction.followUp({ content, flags: ephemeral ? [4096] : [] });
    return true;
  } catch (error) {
    console.error('[interactionUtils]: Error sending follow-up:', error);
    
    // If it's a webhook token error, try fallback
    if (error.code === 50027 && fallbackToChannel) {
      try {
        await interaction.channel.send({ content, ephemeral: false });
        return true;
      } catch (sendError) {
        console.error('[interactionUtils]: Failed to send fallback message:', sendError);
        return false;
      }
    }
    
    return false;
  }
}

/**
 * Safely sends multiple messages to a Discord interaction, handling chunking and fallbacks
 * @param {Discord.Interaction} interaction - The Discord interaction object
 * @param {string} content - The full content to send
 * @param {Object} options - Response options
 * @param {number} options.maxLength - Maximum length per message (default: 2000)
 * @param {boolean} options.ephemeral - Whether messages should be ephemeral
 * @param {boolean} options.fallbackToChannel - Whether to send as channel messages if interaction fails
 * @returns {Promise<boolean>} - Whether all messages were sent successfully
 */
async function safeSendLongMessage(interaction, content, options = {}) {
  const { maxLength = 2000, ephemeral = true, fallbackToChannel = true } = options;
  
  // Split content into chunks
  const chunks = splitMessage(content, maxLength);
  
  try {
    // Send first chunk as editReply
    if (chunks.length > 0) {
      const success = await safeInteractionResponse(interaction, {
        content: chunks[0],
        ephemeral,
        fallbackToChannel
      });
      
      if (!success) {
        // If first response failed, send all chunks as channel messages
        if (fallbackToChannel) {
          for (const chunk of chunks) {
            await interaction.channel.send({ content: chunk, ephemeral: false });
          }
          return true;
        }
        return false;
      }
      
      // Send remaining chunks as follow-ups
      for (let i = 1; i < chunks.length; i++) {
        const success = await safeFollowUp(interaction, {
          content: chunks[i],
          ephemeral,
          fallbackToChannel
        });
        
        if (!success && fallbackToChannel) {
          // If followUp failed, send remaining chunks as channel messages
          for (let j = i; j < chunks.length; j++) {
            await interaction.channel.send({ content: chunks[j], ephemeral: false });
          }
          return true;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[interactionUtils]: Error in safeSendLongMessage:', error);
    return false;
  }
}

/**
 * Splits a message into chunks of specified maximum length
 * @param {string} text - The text to split
 * @param {number} maxLength - Maximum length per chunk
 * @returns {string[]} - Array of text chunks
 */
function splitMessage(text, maxLength = 2000) {
  const lines = text.split("\n");
  const chunks = [];
  let chunk = "";

  for (const line of lines) {
    if (chunk.length + line.length + 1 > maxLength) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk += "\n" + line;
    }
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

module.exports = {
  safeInteractionResponse,
  safeFollowUp,
  safeSendLongMessage,
  splitMessage
}; 