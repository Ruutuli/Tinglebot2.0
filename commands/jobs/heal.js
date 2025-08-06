// ------------------- Import necessary modules -------------------
// Group imports into standard libraries, third-party, and local modules
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { fetchCharacterByName, fetchCharacterByNameAndUserId } = require('../../database/db.js');
const { capitalizeFirstLetter } = require('../../modules/formattingModule.js');
const { useStamina, recoverHearts } = require('../../modules/characterStatsModule.js');
const { 
  saveHealingRequestToStorage, 
  retrieveHealingRequestFromStorage, 
  deleteHealingRequestFromStorage,
  cleanupExpiredHealingRequests
} = require('../../utils/storage.js');
const { createHealEmbed } = require('../../embeds/embeds.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule.js');
const { handleTradeItemAutocomplete } = require('../../handlers/autocompleteHandler.js');
const { checkInventorySync } = require('../../utils/characterUtils');
const { generateUniqueId } = require('../../utils/uniqueIdUtils.js');
const { applyBoostEffect, getBoostEffect, getBoostEffectByCharacter } = require('../../modules/boostingModule.js');

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: createErrorEmbed -------------------
// Creates a styled error embed for user-friendly error messages (ID: 2959553)
function createErrorEmbed(title, description, fields = [], footer = null) {
  const { EmbedBuilder } = require('discord.js');
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B6B') // Red color for errors
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();

  // Add fields if provided
  if (fields.length > 0) {
    embed.addFields(fields);
  }

  // Add footer if provided
  if (footer) {
    embed.setFooter({ text: footer });
  }

  return embed;
}

// ---- Function: getHealingJobs ----
// Returns list of jobs that can perform healing
function getHealingJobs() {
  return ['healer']; // Easy to extend later by adding more jobs
}

// ---- Function: validateHealingJob ----
// Validates if a character can perform healing based on their job
function validateHealingJob(character) {
  const healingJobs = getHealingJobs();
  const job = character.jobVoucher && character.jobVoucherJob
    ? character.jobVoucherJob
    : character.job;

  if (!job) {
    return {
      valid: false,
      message: `❌ **Error:** ${character.name} has no job assigned.`
    };
  }

  if (!healingJobs.includes(job.toLowerCase())) {
    return {
      valid: false,
      message: getJobVoucherErrorMessage('MISSING_SKILLS', {
        characterName: character.name,
        jobName: job
      }).message
    };
  }

  return { valid: true };
}

// ---- Function: checkDebuff ----
// Checks if a character has an active debuff and returns appropriate message
async function checkDebuff(character) {
  if (character.debuff?.active) {
    const debuffEndDate = new Date(character.debuff.endDate);
    
    // Use the original endDate timestamp directly for Discord display
    const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    
    return {
      hasDebuff: true,
      message: `❌ **Error:** Healing cannot be requested because **${character.name}** is currently affected by a debuff. Please wait until the debuff expires.\n🕒 **Debuff Expires:** <t:${unixTimestamp}:D>`
    };
  }
  return { hasDebuff: false };
}

// ---- Function: checkVillageMatch ----
// Checks if two characters are in the same village
function checkVillageMatch(character1, character2) {
  if (character1.currentVillage.toLowerCase() !== character2.currentVillage.toLowerCase()) {
    return {
      match: false,
      message: `❌ **Village Mismatch**\n\nHealing request cannot be created because **${character1.name}** is in **${capitalizeFirstLetter(character1.currentVillage)}**, while **${character2.name}** is in **${capitalizeFirstLetter(character2.currentVillage)}**. Both must be in the same village.\n\n💡 **Travel Tip:** Use </travel:1379850586987430009> to travel between villages and access characters in different locations!`
    };
  }
  return { match: true };
}

// ---- Function: checkStamina ----
// Checks if a character has enough stamina for healing
function checkStamina(character, requiredStamina) {
  if (character.currentStamina < requiredStamina) {
    return {
      hasEnough: false,
      message: `😴 **Oops!** **${character.name}** only has **${character.currentStamina}** stamina and cannot heal your requested **${requiredStamina}** hearts. Come back later when **${character.name}** has rested!`
    };
  }
  return { hasEnough: true };
}

// ---- Function: validateCharacters ----
// Validates both characters for healing request
async function validateCharacters(characterToHeal, healerCharacter, heartsToHeal) {
  // Check debuffs
  const targetDebuff = await checkDebuff(characterToHeal);
  if (targetDebuff.hasDebuff) {
    return { valid: false, message: targetDebuff.message };
  }

  if (healerCharacter) {
    const healerDebuff = await checkDebuff(healerCharacter);
    if (healerDebuff.hasDebuff) {
      return { valid: false, message: healerDebuff.message };
    }

    // Check village match
    const villageCheck = checkVillageMatch(characterToHeal, healerCharacter);
    if (!villageCheck.match) {
      return { valid: false, message: villageCheck.message };
    }

    // Check stamina
    const staminaCheck = checkStamina(healerCharacter, heartsToHeal);
    if (!staminaCheck.hasEnough) {
      return { valid: false, message: staminaCheck.message };
    }
  }

  return { valid: true };
}

// ---- Function: handleInventorySync ----
// Handles inventory sync for multiple characters
async function handleInventorySync(characters, interaction) {
  try {
    await Promise.all(characters.map(char => checkInventorySync(char)));
  } catch (error) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000,
        title: '❌ Inventory Sync Required',
        description: error.message,
        fields: [
          {
            name: '📝 How to Fix',
            value: '1. Use </inventory test:1370788960267272302> to test your inventory\n2. Use </inventory sync:1370788960267272302> to sync your inventory'
          }
        ],
        footer: {
          text: 'Inventory System'
        }
      }],
      ephemeral: true
    });
    return false;
  }
  return true;
}

// ---- Function: handleErrorResponse ----
// Standardizes error handling and response
async function handleErrorResponse(error, interaction, context) {
  handleError(error, 'heal.js');
  console.error(`[heal.js]: ❌ Error during ${context}: ${error.message}`);
  await interaction.editReply(`❌ **Error:** An issue occurred while ${context}.`);
}

// ---- Function: createHealingRequestData ----
// Creates standardized healing request data object
function createHealingRequestData(characterToHeal, healerCharacter, heartsToHeal, paymentOffered, healingRequestId, interaction, sentMessage) {
  return {
    healingRequestId,
    characterRequesting: characterToHeal.name,
    characterRequestingId: characterToHeal._id,
    village: characterToHeal.currentVillage,
    heartsToHeal,
    paymentOffered,
    healerName: healerCharacter?.name || null,
    healerId: healerCharacter?._id || null,
    requesterUserId: interaction.user.id,
    status: 'pending',
    timestamp: Date.now(),
    messageId: sentMessage.id,
    channelId: interaction.channelId
  };
}

// ============================================================================
// ---- Request Subcommand Functions ----
// ============================================================================

// ---- Function: handleHealingRequest ----
// Handles the creation of a healing request
async function handleHealingRequest(interaction, characterName, heartsToHeal, paymentOffered, healerName) {
  try {
    let characterToHeal = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    
    // If not found as regular character, try as mod character
    if (!characterToHeal) {
      const { fetchModCharacterByNameAndUserId } = require('../../database/db');
      characterToHeal = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
    }
    
    let healerCharacter = null;
    if (healerName) {
      healerCharacter = await fetchCharacterByName(healerName);
      
      // If not found as regular character, try as mod character
      if (!healerCharacter) {
        const { fetchModCharacterByNameAndUserId } = require('../../database/db');
        healerCharacter = await fetchModCharacterByNameAndUserId(healerName, interaction.user.id);
      }
    }

    // Ensure the character exists and belongs to the user
    if (!characterToHeal) {
      const errorEmbed = createErrorEmbed(
        'Character Not Found',
        `> The character **${characterName}** does not belong to you or could not be found.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> You can only request healing for characters that you own.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Check the character name spelling\n> • Make sure you own this character\n> • Try using the autocomplete feature`,
            inline: false
          }
        ],
        'Only character owners can request healing for their characters.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Check if healer exists if specified
    if (healerName && !healerCharacter) {
      const errorEmbed = createErrorEmbed(
        'Healer Not Found',
        `> The healer character **${healerName}** does not exist or could not be found.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The specified healer character may not exist or may have been deleted.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Check the healer name spelling\n> • Try requesting without specifying a healer\n> • Ask the healer to confirm their character name`,
            inline: false
          }
        ],
        'You can leave the healer field empty to allow any available healer to fulfill your request.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Validate characters
    const validation = await validateCharacters(characterToHeal, healerCharacter, heartsToHeal);
    if (!validation.valid) {
      await interaction.editReply(validation.message);
      return;
    }

    // Check inventory sync
    const characters = [characterToHeal, ...(healerCharacter ? [healerCharacter] : [])];
    if (!await handleInventorySync(characters, interaction)) return;

    // Create and save the healing request
    const healingRequestId = generateUniqueId('H');
    const embed = createHealEmbed(
      healerCharacter,
      characterToHeal,
      heartsToHeal,
      paymentOffered,
      healingRequestId,
      false
    );

    // Send the embed and save the message ID
    const healingRoleId = process.env.JOB_PERK_HEALING;
    if (!healingRoleId) {
      console.error('[heal.js]: ❌ JOB_PERK_HEALING environment variable not set');
    }
    
    const sentMessage = await interaction.followUp({
      content: healerName
        ? `🔔 <@${healerCharacter.userId}>, **${characterToHeal.name}** is requesting healing from **${healerName}**!`
        : `🔔 <@&${healingRoleId || '1083191610478698547'}>, Healing request for any eligible healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**!`,
      embeds: [embed],
    });

    const healingRequestData = createHealingRequestData(
      characterToHeal,
      healerCharacter,
      heartsToHeal,
      paymentOffered,
      healingRequestId,
      interaction,
      sentMessage
    );

    try {
      await saveHealingRequestToStorage(healingRequestId, healingRequestData);
      console.log(`[heal.js]: ✅ Healing request saved successfully with ID: ${healingRequestId}`);
    } catch (error) {
      console.error(`[heal.js]: ❌ Failed to save healing request: ${error.message}`);
      const errorEmbed = createErrorEmbed(
        'Save Failed',
        `> Failed to save your healing request. Please try again.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> There was a temporary issue with the system while saving your request.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Try creating the healing request again\n> • Wait a moment and try again\n> • Contact support if the issue persists`,
            inline: false
          }
        ],
        'This is usually a temporary issue that resolves quickly.'
      );
      
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  } catch (error) {
    await handleErrorResponse(error, interaction, 'creating the healing request');
  }
}

// ============================================================================
// ---- Fulfill Subcommand Functions ----
// ============================================================================

// ---- Function: handleJobVoucher ----
// Handles job voucher validation and activation
async function handleJobVoucher(healerCharacter, interaction) {
  if (!healerCharacter.jobVoucher) return { success: true };

  const voucherCheck = await validateJobVoucher(healerCharacter, healerCharacter.jobVoucherJob || healerCharacter.job);
  if (voucherCheck.skipVoucher) return { success: true };
  if (!voucherCheck.success) {
    await interaction.editReply({
      content: voucherCheck.message,
      ephemeral: true,
    });
    return { success: false };
  }

  const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
  if (!itemSuccess) {
    await interaction.editReply({
      content: itemError,
      ephemeral: true,
    });
    return { success: false };
  }

  const activationResult = await activateJobVoucher(
    healerCharacter,
    healerCharacter.jobVoucherJob || healerCharacter.job,
    jobVoucherItem,
    1,
    interaction
  );

  if (!activationResult.success) {
    await interaction.editReply({
      content: activationResult.message,
      ephemeral: true,
    });
    return { success: false };
  }

  if (activationResult.message) {
    await interaction.followUp({
      content: activationResult.message,
      ephemeral: true,
    });
  }

  return { success: true, skipVoucher: false };
}

// ---- Function: handleHealingFulfillment ----
// Handles the fulfillment of a healing request
async function handleHealingFulfillment(interaction, requestId, healerName) {
  try {
    await cleanupExpiredHealingRequests();

    // Retrieve and validate healing request
    const healingRequest = await retrieveHealingRequestFromStorage(requestId);
    if (!healingRequest) {
      const errorEmbed = createErrorEmbed(
        'Request Not Found',
        `> No healing request found with ID **${requestId}**.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The request may have been deleted, expired, or the ID may be incorrect.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Check the request ID carefully\n> • Ask the requester to share the request again\n> • Create a new healing request`,
            inline: false
          }
        ],
        'Healing request IDs are case-sensitive and must be entered exactly as shown.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Check request expiration
    const requestAge = Date.now() - healingRequest.timestamp;
    if (requestAge > 24 * 60 * 60 * 1000) {
      const errorEmbed = createErrorEmbed(
        'Request Expired',
        `> Healing request **${requestId}** has expired and can no longer be fulfilled.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> Healing requests expire after 24 hours to keep the system current and prevent stale requests.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Ask the requester to create a new healing request\n> • Look for other active healing requests to fulfill\n> • Offer your healing services to others`,
            inline: false
          }
        ],
        'Healing requests expire after 24 hours for system maintenance.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      await deleteHealingRequestFromStorage(requestId);
      return;
    }

    if (healingRequest.status !== 'pending') {
      const errorEmbed = createErrorEmbed(
        'Request Already Processed',
        `> Healing request **${requestId}** has already been fulfilled or is no longer available.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> This request may have been fulfilled by another healer or has been processed already.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Look for other active healing requests to fulfill\n> • Ask the requester to create a new request if needed\n> • Offer your healing services to others`,
            inline: false
          }
        ],
        'Each healing request can only be fulfilled once.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Check if request was directed to a specific healer
    if (healingRequest.healerName && healingRequest.healerName.toLowerCase() !== healerName.toLowerCase()) {
      const errorEmbed = createErrorEmbed(
        'Wrong Healer',
        `> This healing request was specifically directed to **${healingRequest.healerName}** and cannot be fulfilled by other healers.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The requester specifically asked for **${healingRequest.healerName}** to fulfill this request.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Look for other healing requests that don't specify a healer\n> • Ask the requester to create a new request without specifying a healer\n> • Offer your healing services to others`,
            inline: false
          }
        ],
        'Some healing requests are directed to specific healers for roleplay or preference reasons.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Check if request was cancelled
    if (healingRequest.status === 'cancelled') {
      const errorEmbed = createErrorEmbed(
        'Request Cancelled',
        `> This healing request was cancelled by the requester and cannot be fulfilled.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The person who created this healing request has cancelled it.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Look for other healing requests to fulfill\n> • Ask the requester to create a new request\n> • Offer your healing services to others`,
            inline: false
          }
        ],
        'Cancelled requests cannot be fulfilled and must be recreated if needed.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Fetch and validate characters
    let healerCharacter = await fetchCharacterByNameAndUserId(healerName, interaction.user.id);
    
    // If not found as regular character, try as mod character
    if (!healerCharacter) {
      const { fetchModCharacterByNameAndUserId } = require('../../database/db');
      healerCharacter = await fetchModCharacterByNameAndUserId(healerName, interaction.user.id);
    }
    
    if (!healerCharacter) {
      console.error(`[heal.js]: ❌ Invalid healer character "${healerName}"`);
      const errorEmbed = createErrorEmbed(
        'Healer Ownership Required',
        `> You do not own the healer character **${healerName}**.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> You can only fulfill healing requests with characters that you own.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Use a different character that you own\n> • Check the character name spelling\n> • Make sure you own this character`,
            inline: false
          }
        ],
        'Only character owners can use their characters to fulfill healing requests.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    let characterToHeal = await fetchCharacterByName(healingRequest.characterRequesting);
    
    // If not found as regular character, try as mod character
    if (!characterToHeal) {
      const { fetchModCharacterByNameAndUserId } = require('../../database/db');
      characterToHeal = await fetchModCharacterByNameAndUserId(healingRequest.characterRequesting, interaction.user.id);
    }
    if (!characterToHeal) {
      const errorEmbed = createErrorEmbed(
        'Target Character Not Found',
        `> The character to be healed, **${healingRequest.characterRequesting}**, could not be found.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The character may have been deleted or the name may be incorrect.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Contact the requester to confirm the character name\n> • Ask them to create a new healing request\n> • Check if the character still exists`,
            inline: false
          }
        ],
        'The character to be healed must exist and be accessible.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Prevent self-healing or healing your own characters
    if (healerCharacter.userId === characterToHeal.userId) {
      const errorEmbed = createErrorEmbed(
        'Self-Healing Not Allowed',
        `> You cannot heal your own character. Healing requests must be fulfilled by other players to maintain game balance and encourage community interaction.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> Both **${healerCharacter.name}** and **${characterToHeal.name}** belong to the same user.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Ask another player to fulfill your healing request\n> • Use healing items from your inventory`,
            inline: false
          }
        ],
        'Healing requests promote community interaction and prevent self-exploitation.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Validate characters and jobs
    const validation = await validateCharacters(characterToHeal, healerCharacter, healingRequest.heartsToHeal);
    if (!validation.valid) {
      await interaction.editReply(validation.message);
      return;
    }

    const jobValidation = validateHealingJob(healerCharacter);
    if (!jobValidation.valid) {
      await interaction.editReply(jobValidation.message);
      return;
    }

    // Check inventory sync
    if (!await handleInventorySync([healerCharacter, characterToHeal], interaction)) return;

    // Handle job voucher
    const voucherResult = await handleJobVoucher(healerCharacter, interaction);
    if (!voucherResult.success) return;

    // Process healing with boosting
    let heartsToHeal = healingRequest.heartsToHeal;
    let staminaCost = healingRequest.heartsToHeal;
    
    // Apply Healers boosts to healing amount and stamina cost
    if (healerCharacter.boostedBy) {
      console.log(`[heal.js] Character ${healerCharacter.name} is boosted by ${healerCharacter.boostedBy} for healing`);
      const boostEffect = await getBoostEffectByCharacter(healerCharacter.boostedBy, 'Healers');
      if (boostEffect) {
        console.log(`[heal.js] Found boost effect for ${healerCharacter.boostedBy}:`, boostEffect);
        
        // Apply boost to healing amount
        const originalHealing = heartsToHeal;
        const boostedHealing = await applyBoostEffect(healerCharacter.boostedBy, 'Healers', heartsToHeal, { healer: healerCharacter, recipient: characterToHeal });
        if (boostedHealing !== heartsToHeal) {
          console.log(`[heal.js] Applied ${healerCharacter.boostedBy} healing boost: ${originalHealing} → ${boostedHealing} hearts`);
          console.log(`[heal.js] Boost effect "${boostEffect.name}" increased healing by ${boostedHealing - originalHealing} hearts`);
          heartsToHeal = boostedHealing;
        } else {
          console.log(`[heal.js] Boost effect "${boostEffect.name}" did not modify healing amount (${originalHealing} hearts)`);
        }
        
        // Apply boost to stamina cost (some boosts might reduce stamina cost)
        const originalStamina = staminaCost;
        const boostedStamina = await applyBoostEffect(healerCharacter.boostedBy, 'Healers', staminaCost, { healer: healerCharacter, recipient: characterToHeal });
        if (boostedStamina !== staminaCost) {
          console.log(`[heal.js] Applied ${healerCharacter.boostedBy} stamina boost: ${originalStamina} → ${boostedStamina} stamina`);
          console.log(`[heal.js] Boost effect "${boostEffect.name}" ${boostedStamina < originalStamina ? 'reduced' : 'increased'} stamina cost by ${Math.abs(boostedStamina - originalStamina)}`);
          staminaCost = boostedStamina;
        } else {
          console.log(`[heal.js] Boost effect "${boostEffect.name}" did not modify stamina cost (${originalStamina} stamina)`);
        }
      } else {
        console.log(`[heal.js] No boost effect found for ${healerCharacter.boostedBy} in Healers category`);
      }
    } else {
      console.log(`[heal.js] Character ${healerCharacter.name} is not boosted for healing`);
    }
    
    await useStamina(healerCharacter._id, staminaCost);
    await recoverHearts(characterToHeal._id, heartsToHeal, healerCharacter._id);
    
    // ------------------- Clear Boost After Use -------------------
    if (healerCharacter.boostedBy) {
      console.log(`[heal.js] Clearing boost for ${healerCharacter.name} after use`);
      healerCharacter.boostedBy = null;
      await healerCharacter.save();
    }

    // Deactivate job voucher if needed
    if (healerCharacter.jobVoucher && !voucherResult.skipVoucher) {
      const deactivationResult = await deactivateJobVoucher(healerCharacter._id);
      if (!deactivationResult.success) {
        console.error(`[heal.js]: ❌ Failed to deactivate job voucher for ${healerCharacter.name}`);
      }
    }

    // Update request status
    healingRequest.status = 'fulfilled';
    await saveHealingRequestToStorage(requestId, healingRequest);
    await deleteHealingRequestFromStorage(requestId);
    console.log(`[heal.js]: ✅ Deleted fulfilled healing request ${requestId}`);

    // Update original request message
    const channel = interaction.channel;
    let originalMessageUpdated = false;
    try {
      const originalMessage = await channel.messages.fetch(healingRequest.messageId);
      if (originalMessage) {
        const updatedEmbed = createHealEmbed(
          healerCharacter,
          characterToHeal,
          healingRequest.heartsToHeal,
          healingRequest.paymentOffered,
          healingRequest.healingRequestId,
          true
        );
        await originalMessage.edit({ embeds: [updatedEmbed] });
        originalMessageUpdated = true;
      }
    } catch (error) {
      // Log the error but don't fail the entire operation
      console.log(`[heal.js]: ⚠️ Could not update original message ${healingRequest.messageId}: ${error.message}`);
    }

    // Notify requester
    const originalRequesterId = healingRequest.requesterUserId;
    let message = `<@${originalRequesterId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;
    
    // Add fallback message if original message couldn't be updated
    if (!originalMessageUpdated) {
      message += `\n\nℹ️ **Note:** The original healing request message could not be updated (it may have been deleted).`;
    }

    const embed = createHealEmbed(
      healerCharacter,
      characterToHeal,
      healingRequest.heartsToHeal,
      healingRequest.paymentOffered,
      healingRequest.healingRequestId,
      true
    );

    await interaction.followUp({ content: message, embeds: [embed] });
  } catch (error) {
    await handleErrorResponse(error, interaction, 'fulfilling the healing request');
  }
}

// ============================================================================
// ---- Main Command Handler ----
// ============================================================================



module.exports = {
  data: new SlashCommandBuilder()
    .setName('heal')
    .setDescription('Handle healing interactions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('request')
        .setDescription('Request healing for a character')
        .addStringOption(option =>
          option
            .setName('charactername')
            .setDescription('The name of the character to be healed')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('hearts')
            .setDescription('Number of hearts to heal')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(option =>
          option
            .setName('payment')
            .setDescription('Describe the payment offered for healing (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('healer')
            .setDescription('The name of the healer being requested (optional)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('fulfill')
        .setDescription('Fulfill a healing request')
        .addStringOption(option =>
          option
            .setName('requestid')
            .setDescription('The ID of the healing request to fulfill')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('healername')
            .setDescription('The name of the character performing the healing')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (subcommand === 'request') {
      const characterName = interaction.options.getString('charactername');
      const heartsToHeal = interaction.options.getInteger('hearts');
      const paymentOffered = interaction.options.getString('payment') || 'No payment specified';
      const healerName = interaction.options.getString('healer');

      await handleHealingRequest(interaction, characterName, heartsToHeal, paymentOffered, healerName);
    } else if (subcommand === 'fulfill') {
      const requestId = interaction.options.getString('requestid');
      const healerName = interaction.options.getString('healername');

      await handleHealingFulfillment(interaction, requestId, healerName);
    }
  }
};