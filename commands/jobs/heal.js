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

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

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
    const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    return {
      hasDebuff: true,
      message: `❌ **Error:** Healing cannot be requested because **${character.name}** is currently affected by a debuff. Please wait until the debuff expires.\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`
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
      message: `❌ Healing request cannot be created because **${character1.name}** is in **${capitalizeFirstLetter(character1.currentVillage)}**, while **${character2.name}** is in **${capitalizeFirstLetter(character2.currentVillage)}**. Both must be in the same village.`
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
      content: error.message,
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
    const characterToHeal = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    const healerCharacter = healerName ? await fetchCharacterByName(healerName) : null;

    // Ensure the character exists and belongs to the user
    if (!characterToHeal) {
      await interaction.editReply('❌ **Error:** This character does not belong to you!');
      return;
    }

    // Check if healer exists if specified
    if (healerName && !healerCharacter) {
      await interaction.editReply(`❌ **Error:** The healer character "${healerName}" does not exist!`);
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
    const embed = createHealEmbed(null, characterToHeal, heartsToHeal, paymentOffered, healingRequestId, healerCharacter);

    // Send the embed and save the message ID
    const sentMessage = await interaction.followUp({
      content: healerName
        ? `🔔 <@${healerCharacter.userId}>, **${characterToHeal.name}** is requesting healing from **${healerName}**!`
        : `🔔 @Job Perk: Healing, Healing request for any eligible healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**!`,
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
      await interaction.followUp({
        content: '❌ **Error:** Failed to save healing request. Please try again.',
        ephemeral: true
      });
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
      await interaction.editReply(`❌ **Error:** No healing request found with ID **${requestId}**.`);
      return;
    }

    // Check request expiration
    const requestAge = Date.now() - healingRequest.timestamp;
    if (requestAge > 24 * 60 * 60 * 1000) {
      await interaction.editReply(`❌ **Error:** Healing request **${requestId}** has expired. Please request healing again.`);
      await deleteHealingRequestFromStorage(requestId);
      return;
    }

    if (healingRequest.status !== 'pending') {
      await interaction.editReply(
        `❌ **Error:** Healing request **${requestId}** has already been fulfilled or expired.`
      );
      return;
    }

    // Check if request was directed to a specific healer
    if (healingRequest.healerName && healingRequest.healerName.toLowerCase() !== healerName.toLowerCase()) {
      await interaction.editReply(
        `❌ **Error:** This healing request was specifically directed to **${healingRequest.healerName}**. Only the requested healer can fulfill this request.`
      );
      return;
    }

    // Check if request was cancelled
    if (healingRequest.status === 'cancelled') {
      await interaction.editReply('❌ **Error:** This healing request was cancelled by the requester and cannot be fulfilled.');
      return;
    }

    // Fetch and validate characters
    const healerCharacter = await fetchCharacterByNameAndUserId(healerName, interaction.user.id);
    if (!healerCharacter) {
      console.error(`[heal.js]: ❌ Invalid healer character "${healerName}"`);
      await interaction.editReply(`❌ **Error:** You do not own the healer character "${healerName}"!`);
      return;
    }

    const characterToHeal = await fetchCharacterByName(healingRequest.characterRequesting);
    if (!characterToHeal) {
      await interaction.editReply(
        `❌ **Error:** The character to be healed, **${healingRequest.characterRequesting}**, could not be found.`
      );
      return;
    }

    // Prevent self-healing or healing your own characters
    if (healerCharacter.userId === characterToHeal.userId) {
      await interaction.editReply('❌ **Error:** You cannot fulfill a healing request for your own character.');
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

    // Process healing
    await useStamina(healerCharacter._id, healingRequest.heartsToHeal);
    await recoverHearts(characterToHeal._id, healingRequest.heartsToHeal, healerCharacter._id);

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
    }

    // Notify requester
    const originalRequesterId = healingRequest.requesterUserId;
    const message = `<@${originalRequesterId}>, your character **${characterToHeal.name}** has been healed by **${healerCharacter.name}**!`;

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