// =========================================================================
// ------------------- Interaction Response Utilities -------------------
// =========================================================================
// Utilities for safely handling Discord interaction responses, especially for long-running operations

// ------------------- Helpers ------------------
// Internal helper utilities for DRY behavior
function getEphemeralFlags(ephemeral) {
  return ephemeral ? [4096] : [];
}

async function sendFallbackToChannel(interaction, content) {
  try {
    await interaction.channel.send({ content, ephemeral: false });
    return true;
  } catch (sendError) {
    console.error('[interactionUtils]: Failed to send fallback message:', sendError);
    return false;
  }
}

// ------------------- safeInteractionResponse ------------------
// Safely sends a response to a Discord interaction, with fallbacks for expired webhook tokens
async function safeInteractionResponse(interaction, options = {}) {
  const { content, ephemeral = true, fallbackToChannel = true } = options;
  
  try {
    // Check if interaction is still valid
    if (!interaction.replied && !interaction.deferred) {
      console.warn('[interactionUtils]: Interaction has expired');
      if (fallbackToChannel) {
        return await sendFallbackToChannel(interaction, content);
      }
      return false;
    }
    
    // Try to edit the reply
    await interaction.editReply({ content, flags: getEphemeralFlags(ephemeral) });
    return true;
  } catch (error) {
    console.error('[interactionUtils]: Error sending interaction response:', error);
    
    // If it's a webhook token error, try fallback
    if (error.code === 50027 && fallbackToChannel) {
      return await sendFallbackToChannel(interaction, content);
    }
    
    return false;
  }
}

// ------------------- safeFollowUp ------------------
// Safely sends a follow-up message to a Discord interaction
async function safeFollowUp(interaction, options = {}) {
  const { content, ephemeral = true, fallbackToChannel = true } = options;
  
  try {
    await interaction.followUp({ content, flags: getEphemeralFlags(ephemeral) });
    return true;
  } catch (error) {
    console.error('[interactionUtils]: Error sending follow-up:', error);
    
    // If it's a webhook token error, try fallback
    if (error.code === 50027 && fallbackToChannel) {
      return await sendFallbackToChannel(interaction, content);
    }
    
    return false;
  }
}

// ------------------- safeSendLongMessage ------------------
// Safely sends multiple messages to a Discord interaction, handling chunking and fallbacks
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
              await sendFallbackToChannel(interaction, chunk);
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
            await sendFallbackToChannel(interaction, chunks[j]);
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

// ------------------- splitMessage ------------------
// Splits a message into chunks of specified maximum length
function splitMessage(text, maxLength = 2000) {
  const lines = text.split('\n');
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    if (chunk.length + line.length + 1 > maxLength) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk += chunk.length === 0 ? line : ('\n' + line);
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