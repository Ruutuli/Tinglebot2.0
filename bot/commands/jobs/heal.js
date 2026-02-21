// ------------------- Import necessary modules -------------------
// Group imports into standard libraries, third-party, and local modules
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { 
  fetchCharacterByName, 
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
  fetchModCharacterByName
} = require('@/database/db.js');
const { capitalizeFirstLetter } = require('../../modules/formattingModule.js');
const { useStamina, recoverHearts } = require('../../modules/characterStatsModule.js');
const { 
  saveHealingRequestToStorage, 
  retrieveHealingRequestFromStorage, 
  deleteHealingRequestFromStorage,
  cleanupExpiredHealingRequests
} = require('@/utils/storage.js');
const { createHealEmbed } = require('../../embeds/embeds.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule.js');
const { handleTradeItemAutocomplete } = require('../../handlers/autocompleteHandler.js');
const { checkInventorySync } = require('@/utils/characterUtils');
const { generateUniqueId } = require('@/utils/uniqueIdUtils.js');
const { 
  applyHealingBoost, 
  applyHealingStaminaBoost, 
  applyPostHealingBoosts,
  applyScholarHealingBoost,
  getCharacterBoostStatus
} = require('../../modules/boostIntegration');
const { applyBoostEffect, boostingEffects } = require('../../modules/boostingModule');
const { 
  retrieveBoostingRequestFromTempDataByCharacter,
  isBoostActive,
  clearBoostAfterUse
} = require('./boosting');
const logger = require('@/utils/logger');

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: createErrorEmbed -------------------
// Creates a styled error embed for user-friendly error messages (ID: 2959553)
function createErrorEmbed(title, description, fields = [], footer = null) {
  const embed = new EmbedBuilder()
    .setColor('#FF6B6B') // Red color for errors
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png'); // Border image per user preference

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
    const now = new Date();
    
    // Check if debuff has actually expired
    if (debuffEndDate <= now) {
      // Debuff has expired, clear it
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();
      return { hasDebuff: false };
    }
    
    // Use the original endDate timestamp directly for Discord display
    const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    
    // Create embed for debuff error
    const debuffEmbed = createErrorEmbed(
      'Debuff Active',
      `**${character.name}** is currently affected by a debuff and cannot receive healing.`,
      [
        {
          name: '🕒 Debuff Expires',
          value: `<t:${unixTimestamp}:D> (<t:${unixTimestamp}:R>)`,
          inline: false
        },
        {
          name: '💡 __What You Can Do__',
          value: `> • Wait until the debuff expires\n> • Find a **boosted Healer** to remove the debuff during healing`,
          inline: false
        }
      ],
      'Debuff System'
    );
    
    return {
      hasDebuff: true,
      message: debuffEmbed
    };
  }
  return { hasDebuff: false };
}

// ---- Function: checkVillageMatch ----
// Checks if two characters are in the same village
function checkVillageMatch(character1, character2, skipVillageCheck = false) {
  if (character1.currentVillage.toLowerCase() !== character2.currentVillage.toLowerCase() && !skipVillageCheck) {
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
    const errorEmbed = createErrorEmbed(
      'Insufficient Stamina',
      `**${character.name}** only has **${character.currentStamina}** stamina and cannot heal your requested **${requiredStamina}** hearts.`,
      [
        {
          name: '😴 __Current Stamina__',
          value: `> ${character.currentStamina}/${character.maxStamina}`,
          inline: true
        },
        {
          name: '❤️ __Hearts Requested__',
          value: `> ${requiredStamina}`,
          inline: true
        },
        {
          name: '💡 __What You Can Do__',
          value: `> • Wait for **${character.name}** to rest and recover stamina\n> • Request fewer hearts to heal\n> • Find another healer with more stamina`,
          inline: false
        }
      ],
      'Come back later when the healer has rested!'
    );
    
    return {
      hasEnough: false,
      message: errorEmbed
    };
  }
  return { hasEnough: true };
}

// ---- Function: validateCharacters ----
// Validates both characters for healing request
async function validateCharacters(characterToHeal, healerCharacter, heartsToHeal, interaction = null) {
  // Check if character is fully healed (currentHearts >= maxHearts)
  if (characterToHeal.currentHearts >= characterToHeal.maxHearts && healerCharacter) {
    // Check if healer has Teacher boost (which can give temporary hearts beyond max)
    // Must check BOTH the character's boostedBy field AND TempData to ensure boost is truly active
    const { isBoostActive, retrieveBoostingRequestFromTempDataByCharacter } = require('./boosting');
    const { fetchCharacterByName } = require('@/database/db');
    
    // First check if character has boostedBy set (required for boost to be active)
    if (!healerCharacter.boostedBy) {
      const errorEmbed = createErrorEmbed(
        'Character Fully Healed',
        `**${characterToHeal.name}** is already at full health (${characterToHeal.currentHearts}/${characterToHeal.maxHearts} hearts).`,
        [
          {
            name: '💡 __Tip__',
            value: `> There's no need to heal a fully healed character unless they have a Teacher boost that can provide temporary hearts.`,
            inline: false
          }
        ],
        'Character is already at full health'
      );
      return { 
        valid: false, 
        message: errorEmbed
      };
    }
    
    // Check if boost is active in TempData
    const hasTeacherBoost = await isBoostActive(healerCharacter.name, 'Healers');
    
    if (hasTeacherBoost) {
      // Get the booster info to check if it's a Teacher
      const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(healerCharacter.name);
      if (activeBoost && activeBoost.status === 'accepted' && activeBoost.boostExpiresAt && Date.now() <= activeBoost.boostExpiresAt) {
        const booster = await fetchCharacterByName(activeBoost.boostingCharacter);
        // If healer has Teacher boost, allow healing - will add temporary hearts
        if (booster && (booster.job === 'Teacher' || activeBoost.boosterJob === 'Teacher')) {
          logger.info('HEAL', `Allowing healing of fully healed ${characterToHeal.name} because healer ${healerCharacter.name} has Teacher boost (will add temporary hearts)`);
        } else {
          // Has boost but not Teacher - block healing fully healed character
          const errorEmbed = createErrorEmbed(
            'Character Fully Healed',
            `**${characterToHeal.name}** is already at full health (${characterToHeal.currentHearts}/${characterToHeal.maxHearts} hearts).`,
            [
              {
                name: '💡 __Tip__',
                value: `> There's no need to heal a fully healed character unless they have a Teacher boost that can provide temporary hearts.`,
                inline: false
              }
            ],
            'Character is already at full health'
          );
          return { 
            valid: false, 
            message: errorEmbed
          };
        }
      } else {
        // Boost expired or invalid - block healing fully healed character
        const errorEmbed = createErrorEmbed(
          'Character Fully Healed',
          `**${characterToHeal.name}** is already at full health (${characterToHeal.currentHearts}/${characterToHeal.maxHearts} hearts).`,
          [
            {
              name: '💡 __Tip__',
              value: `> There's no need to heal a fully healed character.`,
              inline: false
            }
          ],
          'Character is already at full health'
        );
        return { 
          valid: false, 
          message: errorEmbed
        };
      }
    } else {
      // No active boost - block healing fully healed character
      const errorEmbed = createErrorEmbed(
        'Character Fully Healed',
        `**${characterToHeal.name}** is already at full health (${characterToHeal.currentHearts}/${characterToHeal.maxHearts} hearts).`,
        [
          {
            name: '💡 __Tip__',
            value: `> There's no need to heal a fully healed character unless they have a Teacher boost that can provide temporary hearts.`,
            inline: false
          }
        ],
        'Character is already at full health'
      );
      return { 
        valid: false, 
        message: errorEmbed
      };
    }
  }
  
  // Check debuffs on target character
  const targetDebuff = await checkDebuff(characterToHeal);
  if (targetDebuff.hasDebuff) {
    // Debuffed characters can ONLY be healed by boosted healers
    // Check if HEALER has ANY active boost (regardless of category or job)
    if (!healerCharacter) {
      // No healer character provided - can't heal debuffed character
      return { valid: false, message: targetDebuff.message };
    }
    
    const { getBoosterInfo } = require('../../modules/boostIntegration');
    
    // Check if HEALER has any active boost
    const boosterInfo = await getBoosterInfo(healerCharacter.name);
    
    if (boosterInfo) {
      // Healer has an active boost - allow healing to proceed
      // The debuff removal will happen during the healing process
      logger.info('HEAL', `Allowing healing of debuffed ${characterToHeal.name} because healer ${healerCharacter.name} has an active boost from ${boosterInfo.name} (${boosterInfo.job})`);
      // Continue past debuff check - healing is allowed
    } else {
      // No boost on healer - block healing debuffed character
      return { valid: false, message: targetDebuff.message };
    }
  }

  if (healerCharacter) {
    const healerDebuff = await checkDebuff(healerCharacter);
    if (healerDebuff.hasDebuff) {
      return { valid: false, message: healerDebuff.message };
    }

    // Check if we're in the testing channel (or a thread in it) to skip village restrictions
    const testingChannelId = '1391812848099004578';
    const isTestingChannel = interaction && (interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId);

    // Check village match (skip for testing channel)
    const villageCheck = checkVillageMatch(characterToHeal, healerCharacter, isTestingChannel);
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
// (no longer required, but kept for compatibility)
async function handleInventorySync(characters, interaction) {
  await Promise.all(characters.map(char => checkInventorySync(char)));
  return true;
}

// ---- Function: handleInteractionErrorResponse ----
// Standardizes error handling and response
async function handleInteractionErrorResponse(error, interaction, context) {
  handleInteractionError(error, 'heal.js');
  logger.error('COMMAND', `Error during ${context}: ${error.message}`);
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
      characterToHeal = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
    }
    
    let healerCharacter = null;
    if (healerName) {
      healerCharacter = await fetchCharacterByName(healerName);
      
      // If not found as regular character, try as mod character
      if (!healerCharacter) {
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
    const validation = await validateCharacters(characterToHeal, healerCharacter, heartsToHeal, interaction);
    if (!validation.valid) {
      if (typeof validation.message === 'object' && validation.message.data) {
        // It's an embed
        await interaction.editReply({ embeds: [validation.message] });
      } else {
        // It's a string
        await interaction.editReply(validation.message);
      }
      return;
    }

    // Check inventory sync
    const characters = [characterToHeal, ...(healerCharacter ? [healerCharacter] : [])];
    if (!await handleInventorySync(characters, interaction)) return;

    // Create and save the healing request
    const healingRequestId = generateUniqueId('H');
    const embed = await createHealEmbed(
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
      logger.error('SYSTEM', 'JOB_PERK_HEALING environment variable not set');
    }
    
    let sentMessage;
    
    if (healerName) {
      // Specific healer request - send embed and user ping separately
      // Send embed via interaction.followUp() and user ping via channel.send()
      // This approach works because channel.send() properly handles user mentions
      sentMessage = await interaction.followUp({
        embeds: [embed],
      });
      
      const channel = interaction.channel;
      if (channel) {
        await channel.send({ 
          content: `🔔 <@${healerCharacter.userId}>, **${characterToHeal.name}** is requesting healing from **${healerName}**!` 
        });
      }
    } else {
      // General healing request - ping the healing role
      const finalRoleId = healingRoleId || '1083191610478698547';
      let pingContent = `🔔 <@&${finalRoleId}> Healing request for any eligible healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**!`;
      
      // Send embed via interaction.followUp() and role ping via channel.send()
      // This approach works because channel.send() properly handles role mentions
      sentMessage = await interaction.followUp({
        embeds: [embed],
      });
      
      const channel = interaction.channel;
      if (channel) {
        await channel.send({ content: pingContent });
      }
    }

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
      logger.success('HEAL', `Healing request saved successfully with ID: ${healingRequestId}`);
    } catch (error) {
      logger.error('HEAL', `Failed to save healing request: ${error.message}`);
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
    await handleInteractionErrorResponse(error, interaction, 'creating the healing request');
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
      healerCharacter = await fetchModCharacterByNameAndUserId(healerName, interaction.user.id);
    }
    
    if (!healerCharacter) {
      logger.error('CHARACTER', `Invalid healer character "${healerName}"`);
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
    const validation = await validateCharacters(characterToHeal, healerCharacter, healingRequest.heartsToHeal, interaction);
    if (!validation.valid) {
      if (typeof validation.message === 'object' && validation.message.data) {
        // It's an embed
        await interaction.editReply({ embeds: [validation.message] });
      } else {
        // It's a string
        await interaction.editReply(validation.message);
      }
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

    // ============================================================================
    // ------------------- Process Healing with Boosting -------------------
    // ============================================================================
    let heartsToHeal = healingRequest.heartsToHeal;
    let staminaCost = healingRequest.heartsToHeal;
    
    // Check if patient was KO'd before healing (needed for Entertainer boost)
    const wasKO = characterToHeal.currentHearts === 0 || characterToHeal.ko;
    
    // ============================================================================
    // ------------------- Apply Pre-Healing Boosts -------------------
    // ============================================================================
    
    // Fortune Teller: Predictive Healing (50% less stamina cost)
    staminaCost = await applyHealingStaminaBoost(healerCharacter.name, staminaCost);
    
    // Entertainer: Song of Healing (+1 bonus heart when reviving from KO)
    heartsToHeal = await applyHealingBoost(healerCharacter.name, heartsToHeal, wasKO);
    if (wasKO && heartsToHeal > healingRequest.heartsToHeal) {
      logger.info('BOOST', `Entertainer boost - Song of Healing (+1 bonus heart for KO revival)`);
    }
    
    // ============================================================================
    // ------------------- Execute Healing -------------------
    // ============================================================================
    const staminaResult = await useStamina(healerCharacter._id, staminaCost);
    if (staminaResult.exhausted) {
      const errorEmbed = createErrorEmbed(
        'Not Enough Stamina',
        `**${healerCharacter.name}** doesn't have enough stamina to perform this healing. They need at least **${staminaCost}** stamina.`,
        [
          {
            name: '💡 __What You Can Do__',
            value: `> • Have the healer recover stamina before fulfilling the request\n> • Use items or rest to restore stamina`,
            inline: false
          }
        ],
        'Healing costs stamina; the healer must have enough before starting.'
      );
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }
    const allowOneOverflow = wasKO && heartsToHeal > healingRequest.heartsToHeal; // Entertainer Song of Healing +1
    await recoverHearts(characterToHeal._id, heartsToHeal, healerCharacter._id, allowOneOverflow);

    // ============================================================================
    // ------------------- Apply Post-Healing Boosts -------------------
    // ============================================================================
    
    // Refresh characters after stamina/hearts updates to get accurate values
    const healerAfterStaminaUse = await fetchCharacterByName(healerCharacter.name);
    const recipientAfterHealing = await fetchCharacterByName(characterToHeal.name);
    
    // Check if patient had a debuff before applying post-healing boosts
    const hadDebuff = characterToHeal.debuff?.active || false;
    
    // Any boosted healer can remove debuffs
    const postHealingResult = await applyPostHealingBoosts(healerCharacter.name, characterToHeal.name);
    let debuffRemoved = false;
    if (postHealingResult && postHealingResult.debuffRemoved) {
      debuffRemoved = true;
      if (postHealingResult.type === 'Priest') {
        logger.info('BOOST', `Priest boost - Spiritual Cleanse (debuff removed from ${characterToHeal.name})`);
      } else {
        logger.info('BOOST', `Boosted healer removed debuff from ${characterToHeal.name}`);
      }
    }
    
    // Scholar: Efficient Recovery (+1 stamina to both healer and recipient)
    // Capture stamina before Scholar boost (after stamina cost has been applied)
    // Use refreshed values - these are accurate after useStamina was called
    if (!healerAfterStaminaUse || !recipientAfterHealing) {
      throw new Error('Failed to refresh characters after stamina/hearts update');
    }
    const healerStaminaBefore = healerAfterStaminaUse.currentStamina;
    const recipientStaminaBefore = recipientAfterHealing.currentStamina;
    
    const scholarResult = await applyScholarHealingBoost(healerCharacter.name, characterToHeal.name);
    let scholarStaminaInfo = null;
    if (scholarResult) {
      // Refresh characters to get updated stamina values after boost
      const refreshedHealer = await fetchCharacterByName(healerCharacter.name);
      const refreshedRecipient = await fetchCharacterByName(characterToHeal.name);
      
      // Capture stamina after Scholar boost (use refreshed values)
      const healerStaminaAfter = refreshedHealer?.currentStamina ?? scholarResult.healer?.currentStamina ?? healerStaminaBefore;
      const recipientStaminaAfter = refreshedRecipient?.currentStamina ?? scholarResult.recipient?.currentStamina ?? recipientStaminaBefore;
      
      scholarStaminaInfo = {
        healerBefore: healerStaminaBefore,
        healerAfter: healerStaminaAfter,
        healerMax: refreshedHealer?.maxStamina ?? healerAfterStaminaUse?.maxStamina ?? healerCharacter.maxStamina,
        recipientBefore: recipientStaminaBefore,
        recipientAfter: recipientStaminaAfter,
        recipientMax: refreshedRecipient?.maxStamina ?? recipientAfterHealing?.maxStamina ?? characterToHeal.maxStamina
      };
      logger.info('BOOST', `Scholar boost - Efficient Recovery (+1 stamina to both ${healerCharacter.name} [${healerStaminaBefore}/${scholarStaminaInfo.healerMax} → ${healerStaminaAfter}/${scholarStaminaInfo.healerMax}] and ${characterToHeal.name} [${recipientStaminaBefore}/${scholarStaminaInfo.recipientMax} → ${recipientStaminaAfter}/${scholarStaminaInfo.recipientMax}])`);
    }
    
    // Teacher: Temporary Fortitude (+2 temporary hearts)
    // Check if healer has Teacher boost
    let teacherTempHeartsInfo = null;
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(healerCharacter.name);
    
    if (activeBoost && activeBoost.status === 'accepted') {
      const currentTime = Date.now();
      if (!activeBoost.boostExpiresAt || currentTime <= activeBoost.boostExpiresAt) {
        const boosterChar = await fetchCharacterByName(activeBoost.boostingCharacter);
        if (boosterChar && boosterChar.job === 'Teacher') {
          // Refresh patient to get current state after healing
          const refreshedPatient = await fetchCharacterByName(characterToHeal.name);
          if (refreshedPatient) {
            const heartsBefore = refreshedPatient.currentHearts;
            const maxHearts = refreshedPatient.maxHearts;
            
            // Apply Teacher boost - add +2 temporary hearts directly to currentHearts
            // Initialize tempHearts if undefined
            if (refreshedPatient.tempHearts === undefined) {
              refreshedPatient.tempHearts = 0;
            }
            refreshedPatient.tempHearts += 2;
            refreshedPatient.currentHearts += 2; // Add directly to currentHearts (can exceed maxHearts)
            
            await refreshedPatient.save();
            
            const heartsAfter = refreshedPatient.currentHearts;
            const tempHearts = refreshedPatient.tempHearts || 0;
            teacherTempHeartsInfo = {
              heartsBefore,
              heartsAfter,
              maxHearts,
              tempHearts
            };
            logger.info('BOOST', `Teacher boost - Temporary Fortitude (+2 temp hearts to ${refreshedPatient.name}: ${heartsBefore}/${maxHearts} → ${heartsAfter}/${maxHearts} with ${tempHearts} temp hearts)`);
          }
        }
      }
    }
    
    // ============================================================================
    // ------------------- Capture Boost Info Before Clearing -------------------
    // ============================================================================
    // Capture boost info BEFORE clearing it (needed for embed display)
    let capturedBoostInfo = null;
    if (healerCharacter.boostedBy) {
      try {
        const boostStatus = await getCharacterBoostStatus(healerCharacter.name);
        if (boostStatus && boostStatus.category === 'Healers') {
          // Get boost description from boostingEffects
          const boostDescription = boostingEffects[boostStatus.boosterJob]?.['Healers']?.description || null;
          capturedBoostInfo = {
            boosterJob: boostStatus.boosterJob,
            boosterName: boostStatus.boosterName,
            boostName: boostStatus.boostName,
            category: boostStatus.category,
            boostDescription: boostDescription,
            debuffRemoved: debuffRemoved, // Track if debuff was removed by Priest boost
            scholarStaminaInfo: scholarStaminaInfo, // Track stamina recovery from Scholar boost
            teacherTempHeartsInfo: teacherTempHeartsInfo // Track temporary hearts from Teacher boost
          };
        }
      } catch (error) {
        logger.warn('BOOST', `Failed to capture boost info: ${error.message}`);
      }
    }
    
    // ============================================================================
    // ------------------- Consume Healer Boost After Use -------------------
    // ============================================================================
    // Check TempData directly since boostedBy field may be out of sync
    const activeHealerBoost = await retrieveBoostingRequestFromTempDataByCharacter(healerCharacter.name);
    const hasActiveHealerBoost = activeHealerBoost && 
      activeHealerBoost.status === 'accepted' && 
      activeHealerBoost.category === 'Healers';
    
    if (healerCharacter.boostedBy || hasActiveHealerBoost) {
      await clearBoostAfterUse(healerCharacter, {
        client: interaction.client,
        context: 'healing'
      });
    }

    // Deactivate job voucher if needed
    if (healerCharacter.jobVoucher && !voucherResult.skipVoucher) {
      const deactivationResult = await deactivateJobVoucher(healerCharacter._id, { afterUse: true });
      if (!deactivationResult.success) {
        logger.error('JOB', `Failed to deactivate job voucher for ${healerCharacter.name}`);
      }
    }

    // Update request status
    healingRequest.status = 'fulfilled';
    await saveHealingRequestToStorage(requestId, healingRequest);
    await deleteHealingRequestFromStorage(requestId);
    logger.success('HEAL', `Deleted fulfilled healing request ${requestId}`);

    // Update original request message
    const channel = interaction.channel;
    let originalMessageUpdated = false;
    try {
      const originalMessage = await channel.messages.fetch(healingRequest.messageId);
      if (originalMessage) {
        const updatedEmbed = await createHealEmbed(
          healerCharacter,
          characterToHeal,
          heartsToHeal,
          healingRequest.paymentOffered,
          healingRequest.healingRequestId,
          true,
          undefined,
          false,
          healingRequest.heartsToHeal, // original requested amount
          staminaCost, // stamina cost
          capturedBoostInfo // boost info
        );
        await originalMessage.edit({ embeds: [updatedEmbed] });
        originalMessageUpdated = true;
      }
    } catch (error) {
      // Log the error but don't fail the entire operation
      logger.warn('INTERACTION', `Could not update original message ${healingRequest.messageId}: ${error.message}`);
    }

    // Notify requester
    const originalRequesterId = healingRequest.requesterUserId;
    const pingMessage = `🔔 <@${originalRequesterId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;

    const embed = await createHealEmbed(
      healerCharacter,
      characterToHeal,
      heartsToHeal,
      healingRequest.paymentOffered,
      healingRequest.healingRequestId,
      true,
      undefined,
      false,
      healingRequest.heartsToHeal, // original requested amount
      staminaCost, // stamina cost
      capturedBoostInfo, // boost info
      originalRequesterId // userId for notification
    );

    // Send embed with ping message in content (embeds can't ping users)
    let finalPingMessage = pingMessage;
    if (!originalMessageUpdated) {
      finalPingMessage += `\n\nℹ️ **Note:** The original healing request message could not be updated (it may have been deleted).`;
    }
    
    await interaction.followUp({
      content: finalPingMessage,
      embeds: [embed],
    });
  } catch (error) {
    await handleInteractionErrorResponse(error, interaction, 'fulfilling the healing request');
  }
}

// ============================================================================
// ---- Direct Healing Subcommand Functions ----
// ============================================================================

// ---- Function: handleDirectHealing ----
// Handles direct healing without requiring a request/fulfill flow
async function handleDirectHealing(interaction, healerName, targetCharacterName, heartsToHeal) {
  try {
    // Fetch and validate healer character
    let healerCharacter = await fetchCharacterByNameAndUserId(healerName, interaction.user.id);
    
    // If not found as regular character, try as mod character
    if (!healerCharacter) {
      healerCharacter = await fetchModCharacterByNameAndUserId(healerName, interaction.user.id);
    }
    
    if (!healerCharacter) {
      logger.error('CHARACTER', `Invalid healer character "${healerName}"`);
      const errorEmbed = createErrorEmbed(
        'Healer Ownership Required',
        `> You do not own the healer character **${healerName}**.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> You can only perform healing with characters that you own.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Use a different character that you own\n> • Check the character name spelling\n> • Make sure you own this character`,
            inline: false
          }
        ],
        'Only character owners can use their characters to perform healing.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Fetch target character (can be owned by anyone)
    let characterToHeal = await fetchCharacterByName(targetCharacterName);
    
    // If not found as regular character, try as mod character
    // Note: For mod characters, we need to fetch differently since we don't have the target user ID
    // We'll just try to find the character by name first (which works for regular characters)
    if (!characterToHeal) {
      // Could be a mod character, but we can't search without user ID
      // Regular fetchCharacterByName should work for most cases
      const errorEmbed = createErrorEmbed(
        'Target Character Not Found',
        `> The character to be healed, **${targetCharacterName}**, could not be found.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> The character may have been deleted or the name may be incorrect.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Check the character name spelling\n> • Make sure the character exists\n> • Use the autocomplete feature`,
            inline: false
          }
        ],
        'The character to be healed must exist and be accessible.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Prevent self-healing (healing your own characters)
    if (healerCharacter.userId === characterToHeal.userId) {
      const errorEmbed = createErrorEmbed(
        'Self-Healing Not Allowed',
        `> You cannot heal your own character. Direct healing must be used to heal other players' characters.`,
        [
          {
            name: '🔍 __Why This Happened__',
            value: `> Both **${healerCharacter.name}** and **${characterToHeal.name}** belong to the same user.`,
            inline: false
          },
          {
            name: '💡 __What You Can Do__',
            value: `> • Use healing items from your inventory\n> • Ask another player to heal your character`,
            inline: false
          }
        ],
        'Direct healing is intended for healing other players\' characters.'
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Validate characters and jobs
    const validation = await validateCharacters(characterToHeal, healerCharacter, heartsToHeal, interaction);
    if (!validation.valid) {
      if (typeof validation.message === 'object' && validation.message.data) {
        // It's an embed
        await interaction.editReply({ embeds: [validation.message] });
      } else {
        // It's a string
        await interaction.editReply(validation.message);
      }
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

    // ============================================================================
    // ------------------- Process Healing with Boosting -------------------
    // ============================================================================
    let finalHeartsToHeal = heartsToHeal;
    let staminaCost = heartsToHeal;
    const originalHeartsRequested = heartsToHeal; // Store original for embed display
    
    // Check if patient was KO'd before healing (needed for Entertainer boost)
    const wasKO = characterToHeal.currentHearts === 0 || characterToHeal.ko;
    
    // ============================================================================
    // ------------------- Apply Pre-Healing Boosts -------------------
    // ============================================================================
    
    // Fortune Teller: Predictive Healing (50% less stamina cost)
    staminaCost = await applyHealingStaminaBoost(healerCharacter.name, staminaCost);
    
    // Entertainer: Song of Healing (+1 bonus heart when reviving from KO)
    finalHeartsToHeal = await applyHealingBoost(healerCharacter.name, finalHeartsToHeal, wasKO);
    if (wasKO && finalHeartsToHeal > heartsToHeal) {
      logger.info('BOOST', `Entertainer boost - Song of Healing (+1 bonus heart for KO revival)`);
    }
    
    // ============================================================================
    // ------------------- Execute Healing -------------------
    // ============================================================================
    const staminaResult = await useStamina(healerCharacter._id, staminaCost);
    if (staminaResult.exhausted) {
      const errorEmbed = createErrorEmbed(
        'Not Enough Stamina',
        `**${healerCharacter.name}** doesn't have enough stamina to perform this healing. They need at least **${staminaCost}** stamina.`,
        [
          {
            name: '💡 __What You Can Do__',
            value: `> • Have the healer recover stamina before fulfilling the request\n> • Use items or rest to restore stamina`,
            inline: false
          }
        ],
        'Healing costs stamina; the healer must have enough before starting.'
      );
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }
    const allowOneOverflowHealAid = wasKO && finalHeartsToHeal > heartsToHeal; // Entertainer Song of Healing +1
    await recoverHearts(characterToHeal._id, finalHeartsToHeal, healerCharacter._id, allowOneOverflowHealAid);

    // ============================================================================
    // ------------------- Apply Post-Healing Boosts -------------------
    // ============================================================================
    
    // Refresh characters after stamina/hearts updates to get accurate values
    const healerAfterStaminaUse = await fetchCharacterByName(healerCharacter.name);
    const recipientAfterHealing = await fetchCharacterByName(characterToHeal.name);
    
    // Check if patient had a debuff before applying post-healing boosts
    const hadDebuff = characterToHeal.debuff?.active || false;
    
    // Any boosted healer can remove debuffs
    const postHealingResult = await applyPostHealingBoosts(healerCharacter.name, characterToHeal.name);
    let debuffRemoved = false;
    if (postHealingResult && postHealingResult.debuffRemoved) {
      debuffRemoved = true;
      if (postHealingResult.type === 'Priest') {
        logger.info('BOOST', `Priest boost - Spiritual Cleanse (debuff removed from ${characterToHeal.name})`);
      } else {
        logger.info('BOOST', `Boosted healer removed debuff from ${characterToHeal.name}`);
      }
    }
    
    // Scholar: Efficient Recovery (+1 stamina to both healer and recipient)
    // Capture stamina before Scholar boost (after stamina cost has been applied)
    // Use refreshed values - these are accurate after useStamina was called
    if (!healerAfterStaminaUse || !recipientAfterHealing) {
      throw new Error('Failed to refresh characters after stamina/hearts update');
    }
    const healerStaminaBefore = healerAfterStaminaUse.currentStamina;
    const recipientStaminaBefore = recipientAfterHealing.currentStamina;
    
    const scholarResult = await applyScholarHealingBoost(healerCharacter.name, characterToHeal.name);
    let scholarStaminaInfo = null;
    if (scholarResult) {
      // Refresh characters to get updated stamina values after boost
      const refreshedHealer = await fetchCharacterByName(healerCharacter.name);
      const refreshedRecipient = await fetchCharacterByName(characterToHeal.name);
      
      // Capture stamina after Scholar boost (use refreshed values)
      const healerStaminaAfter = refreshedHealer?.currentStamina ?? scholarResult.healer?.currentStamina ?? healerStaminaBefore;
      const recipientStaminaAfter = refreshedRecipient?.currentStamina ?? scholarResult.recipient?.currentStamina ?? recipientStaminaBefore;
      
      scholarStaminaInfo = {
        healerBefore: healerStaminaBefore,
        healerAfter: healerStaminaAfter,
        healerMax: refreshedHealer?.maxStamina ?? healerAfterStaminaUse?.maxStamina ?? healerCharacter.maxStamina,
        recipientBefore: recipientStaminaBefore,
        recipientAfter: recipientStaminaAfter,
        recipientMax: refreshedRecipient?.maxStamina ?? recipientAfterHealing?.maxStamina ?? characterToHeal.maxStamina
      };
      logger.info('BOOST', `Scholar boost - Efficient Recovery (+1 stamina to both ${healerCharacter.name} [${healerStaminaBefore}/${scholarStaminaInfo.healerMax} → ${healerStaminaAfter}/${scholarStaminaInfo.healerMax}] and ${characterToHeal.name} [${recipientStaminaBefore}/${scholarStaminaInfo.recipientMax} → ${recipientStaminaAfter}/${scholarStaminaInfo.recipientMax}])`);
    }
    
    // Teacher: Temporary Fortitude (+2 temporary hearts)
    // Check if healer has Teacher boost
    let teacherTempHeartsInfo = null;
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(healerCharacter.name);
    
    if (activeBoost && activeBoost.status === 'accepted') {
      const currentTime = Date.now();
      if (!activeBoost.boostExpiresAt || currentTime <= activeBoost.boostExpiresAt) {
        const boosterChar = await fetchCharacterByName(activeBoost.boostingCharacter);
        if (boosterChar && boosterChar.job === 'Teacher') {
          // Refresh patient to get current state after healing
          const refreshedPatient = await fetchCharacterByName(characterToHeal.name);
          if (refreshedPatient) {
            const heartsBefore = refreshedPatient.currentHearts;
            const maxHearts = refreshedPatient.maxHearts;
            
            // Apply Teacher boost - add +2 temporary hearts directly to currentHearts
            // Initialize tempHearts if undefined
            if (refreshedPatient.tempHearts === undefined) {
              refreshedPatient.tempHearts = 0;
            }
            refreshedPatient.tempHearts += 2;
            refreshedPatient.currentHearts += 2; // Add directly to currentHearts (can exceed maxHearts)
            
            await refreshedPatient.save();
            
            const heartsAfter = refreshedPatient.currentHearts;
            const tempHearts = refreshedPatient.tempHearts || 0;
            teacherTempHeartsInfo = {
              heartsBefore,
              heartsAfter,
              maxHearts,
              tempHearts
            };
            logger.info('BOOST', `Teacher boost - Temporary Fortitude (+2 temp hearts to ${refreshedPatient.name}: ${heartsBefore}/${maxHearts} → ${heartsAfter}/${maxHearts} with ${tempHearts} temp hearts)`);
          }
        }
      }
    }
    
    // ============================================================================
    // ------------------- Capture Boost Info Before Clearing -------------------
    // ============================================================================
    // Capture boost info BEFORE clearing it (needed for embed display)
    let capturedBoostInfo = null;
    if (healerCharacter.boostedBy) {
      try {
        const boostStatus = await getCharacterBoostStatus(healerCharacter.name);
        if (boostStatus && boostStatus.category === 'Healers') {
          // Get boost description from boostingEffects
          const boostDescription = boostingEffects[boostStatus.boosterJob]?.['Healers']?.description || null;
          capturedBoostInfo = {
            boosterJob: boostStatus.boosterJob,
            boosterName: boostStatus.boosterName,
            boostName: boostStatus.boostName,
            category: boostStatus.category,
            boostDescription: boostDescription,
            debuffRemoved: debuffRemoved, // Track if debuff was removed by Priest boost
            scholarStaminaInfo: scholarStaminaInfo, // Track stamina recovery from Scholar boost
            teacherTempHeartsInfo: teacherTempHeartsInfo // Track temporary hearts from Teacher boost
          };
        }
      } catch (error) {
        logger.warn('BOOST', `Failed to capture boost info: ${error.message}`);
      }
    }
    
    // ============================================================================
    // ------------------- Consume Healer Boost After Use -------------------
    // ============================================================================
    // Check TempData directly since boostedBy field may be out of sync
    const activeHealerBoostDirect = await retrieveBoostingRequestFromTempDataByCharacter(healerCharacter.name);
    const hasActiveHealerBoostDirect = activeHealerBoostDirect && 
      activeHealerBoostDirect.status === 'accepted' && 
      activeHealerBoostDirect.category === 'Healers';
    
    if (healerCharacter.boostedBy || hasActiveHealerBoostDirect) {
      await clearBoostAfterUse(healerCharacter, {
        client: interaction.client,
        context: 'healing'
      });
    }

    // Deactivate job voucher if needed
    if (healerCharacter.jobVoucher && !voucherResult.skipVoucher) {
      const deactivationResult = await deactivateJobVoucher(healerCharacter._id, { afterUse: true });
      if (!deactivationResult.success) {
        logger.error('JOB', `Failed to deactivate job voucher for ${healerCharacter.name}`);
      }
    }

    // Notify both parties
    const targetUserId = characterToHeal.userId;
    let message = `🔔 <@${targetUserId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;

    const embed = await createHealEmbed(
      healerCharacter,
      characterToHeal,
      finalHeartsToHeal,
      'No payment specified',
      null,
      true,
      undefined,
      true, // isDirectHealing = true
      originalHeartsRequested, // original requested amount
      staminaCost, // stamina cost
      capturedBoostInfo, // boost info
      targetUserId // userId for notification
    );

    await interaction.editReply({ content: message, embeds: [embed] });
    logger.success('HEAL', `${healerCharacter.name} directly healed ${characterToHeal.name} for ${finalHeartsToHeal} hearts`);
  } catch (error) {
    await handleInteractionErrorResponse(error, interaction, 'performing direct healing');
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
        .setName('aid')
        .setDescription('Provide healing aid to another character directly')
        .addStringOption(option =>
          option
            .setName('healername')
            .setDescription('The name of the character performing the healing')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('target')
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
    )
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
    try {
      const subcommand = interaction.options.getSubcommand();
      await interaction.deferReply();

      if (subcommand === 'aid') {
        const healerName = interaction.options.getString('healername');
        const targetCharacterName = interaction.options.getString('target');
        const heartsToHeal = interaction.options.getInteger('hearts');

        await handleDirectHealing(interaction, healerName, targetCharacterName, heartsToHeal);
      } else if (subcommand === 'request') {
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
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'heal.js',
        subcommand: interaction.options?.getSubcommand()
      });
    }
  }
};