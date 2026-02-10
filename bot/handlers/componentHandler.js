// ============================================================================
// ------------------- Combined Component and Button Handler -------------------
// Handles button interactions and component logic like job selection, modals,
// syncing, art submissions, vending view, and mount traits.
// ============================================================================


// =============================================================================
// ------------------- Imports -------------------
// =============================================================================

// ------------------- Standard Libraries -------------------
const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');

// ------------------- Discord.js Components -------------------
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// ------------------- Database Connections -------------------
const {
  connectToTinglebot,
  fetchCharacterById,
  fetchModCharacterById,
  getUserById,
  fetchCharacterByName,
  VILLAGE_BANNERS
} = require('@/database/db');

// ------------------- Database Models -------------------
const ItemModel = require('@/models/ItemModel');
const RuuGame = require('@/models/RuuGameModel');
const Character = require('@/models/CharacterModel');
const { Village } = require('@/models/VillageModel');
const { finalizeBlightApplication, completeBlightHealing } = require('./blightHandler');

// ------------------- Embed and Command Imports -------------------
const {
  createCharacterEmbed,
  createCharacterGearEmbed,
  createArtSubmissionEmbed
} = require('../embeds/embeds.js');

// ------------------- Modules -------------------
const { getGeneralJobsPage, getJobPerk } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');
const { roles } = require('../modules/rolesModule');
const { recoverHearts, recoverStamina } = require('../modules/characterStatsModule');

// ------------------- Handler Imports -------------------
const {
  handleMountComponentInteraction,
  handleRegisterMountModal,
  handleTameInteraction,
  handleTraitPaymentInteraction,
  handleTraitSelection,
  handleUseItemInteraction
} = require('./mountComponentHandler');

const { handleModalSubmission } = require('./modalHandler');
const { syncInventory } = require('../handlers/syncHandler');
const { handleVendingViewVillage, handleSyncButton, handlePouchUpgradeConfirm, handlePouchUpgradeCancel } = require('./vendingHandler');

// ------------------- Utility Functions -------------------
const { 
  saveSubmissionToStorage, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  deleteSubmissionFromStorage,
  findLatestSubmissionIdForUser 
} = require('@/utils/storage');

const {
  calculateTokens,
  generateTokenBreakdown
} = require('@/utils/tokenUtils');

const { canChangeJob } = require('@/utils/validation');

// ============================================================================
// ------------------- RuuGame Configuration -------------------
// Game settings and prize configuration
// =============================================================================
const GAME_CONFIG = {
  TARGET_SCORE: 20,
  DICE_SIDES: 20,
  SESSION_DURATION_HOURS: 24,
  MAX_PLAYERS: 10,
  ROLL_COOLDOWN_SECONDS: 15,
  GLOBAL_COOLDOWN_SECONDS: 5
};

const PRIZES = {
  fairy: {
    name: 'Fairy',
    description: 'A magical fairy companion',
    emoji: '🧚',
    itemName: 'Fairy'
  },
  job_voucher: {
    name: 'Job Voucher',
    description: 'A voucher for a new job opportunity',
    emoji: '📜',
    itemName: 'Job Voucher'
  },
  enduring_elixir: {
    name: 'Enduring Elixir',
    description: 'A powerful elixir that grants endurance',
    emoji: '🧪',
    itemName: 'Enduring Elixir'
  }
};


// =============================================================================
// ------------------- Utility Button Row Functions -------------------
// These functions create pre-defined button rows for interactions.
// =============================================================================

// ------------------- Function: getCancelButtonRow -------------------
// Returns an action row with a ❌ Cancel button.
function getCancelButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger)
  );
}

// ------------------- Function: getConfirmButtonRow -------------------
// Returns an action row with a ✅ Confirm button.
function getConfirmButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Success)
  );
}


// =============================================================================
// ------------------- Button Interaction Handlers -------------------
// These functions handle buttons for sync, cancel, job update, etc.
// =============================================================================

// ------------------- Function: handleButtonInteraction -------------------
// Routes button actions like sync, job-change, view, confirm, etc.
async function handleButtonInteraction(interaction) {
  if (interaction.replied || interaction.deferred) return;

  const [action, characterId, extra] = interaction.customId.split('|');
  const userId = interaction.user.id;

  try {
    switch (action) {
      case 'sync-yes':
        return await handleSyncYes(interaction, characterId);
      case 'sync-no':
        return await handleSyncNo(interaction);
      case 'confirm':
        // Find the latest submission for this user
        const submissionId = await findLatestSubmissionIdForUser(userId);
        if (!submissionId) {
          return interaction.reply({
            content: '❌ **No active submission found. Please start a new submission.**',
            flags: 64
          });
        }
        const submissionData = await retrieveSubmissionFromStorage(submissionId);
        return await handleConfirmation(interaction, userId, submissionData);
      case 'cancel':
        // Find the latest submission for this user
        const cancelSubmissionId = await findLatestSubmissionIdForUser(userId);
        if (!cancelSubmissionId) {
          return interaction.reply({
            content: '❌ **No active submission found. Please start a new submission.**',
            flags: 64
          });
        }
        const cancelData = await retrieveSubmissionFromStorage(cancelSubmissionId);
        return await handleCancel(interaction, userId, cancelData);
      case 'view':
        return await handleViewCharacter(interaction, characterId);
      case 'job-select':
        return await handleJobSelect(interaction, characterId, extra);
      case 'job-page':
        return await handleJobPage(interaction, characterId, extra);
      default:
        console.warn(`[componentHandler.js]: ⚠️ Unhandled button action: ${action}`);
    }
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error handling button (${action}): ${error.message}`);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your action.**',
          flags: 64
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while processing your action.**',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send error response: ${replyError.message}`);
    }
  }
}

// ------------------- Function: handleSyncYes -------------------
// Begins character inventory sync.
async function handleSyncYes(interaction, characterId) {
  try {
    // Try to fetch regular character first, then mod character if not found
    let character = await fetchCharacterById(characterId);
    if (!character) {
      // Try to fetch as mod character
      character = await fetchModCharacterById(characterId);
    }
    
    if (!character) {
      return interaction.reply({ content: '❌ **Character not found in either regular or mod character collections.**', flags: 64 });
    }

    // Check if inventory is already synced
    if (character.inventorySynced) {
      return interaction.update({ 
        content: `❌ **Inventory for ${character.name} has already been synced and cannot be synced again.**`,
        embeds: [],
        components: [] // Remove the buttons
      });
    }

    // Update the message to remove buttons and show starting message
    await interaction.update({
      content: `🔄 Sync has initiated. Please wait...`,
      embeds: [],
      components: [] // Remove the buttons
    });

    // Start the sync process
    await syncInventory(character.name, interaction.user.id, interaction);
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error in handleSyncYes: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ **An error occurred while starting the sync process.**',
        flags: 64
      });
    }
  }
}

// ------------------- Function: handleSyncNo -------------------
// Cancels sync.
async function handleSyncNo(interaction) {
  await interaction.update({ 
    content: '❌ **Sync canceled.**',
    embeds: [],
    components: [] // Remove the buttons
  });
}

// ------------------- Function: handleConfirmation -------------------
// Confirms an art submission and finalizes the process.
async function handleConfirmation(interaction, userId, submissionData) {
  if (!submissionData) {
    return interaction.reply({
      content: '❌ **Submission data not found. Please try again.**',
      ephemeral: true
    });
  }

  try {
    const user = await getUserById(userId);
    
    // Use already calculated token values if they exist
    const totalTokens = submissionData.finalTokenAmount;
    const breakdown = submissionData.tokenCalculation;
    
    if (!totalTokens || !breakdown) {
      throw new Error('Token calculation not found. Please try again.');
    }

    // Update submission data with final calculations
    const updates = {
      embedSent: true
    };

    // Ensure all required fields are present
    const embedData = {
      ...submissionData,
      ...updates,
      userId: submissionData.userId || userId,
      username: submissionData.username || interaction.user.username,
      userAvatar: submissionData.userAvatar || interaction.user.displayAvatarURL(),
    };

    // Create embed and post to channel BEFORE showing success message
    // This way errors are caught before user sees success
    let embed;
    let sentMessage;
    let messageUrl;
    
    try {
      embed = createArtSubmissionEmbed(embedData);
      
      // Post to specific submissions channel
      const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
      if (!submissionsChannel) {
        throw new Error('Submissions channel not found. Please contact a moderator.');
      }
      
      sentMessage = await submissionsChannel.send({ embeds: [embed] });
      
      // Update with message URL
      messageUrl = `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}`;
      await updateSubmissionData(submissionData.submissionId, {
        ...updates,
        messageUrl: messageUrl
      });
    } catch (embedError) {
      // Log detailed error information
      console.error('[componentHandler.js]: ❌ Error creating or posting submission embed:', {
        error: embedError.message,
        stack: embedError.stack,
        submissionId: submissionData.submissionId,
        userId: userId,
        questBonus: submissionData.questBonus,
        questBonusType: typeof submissionData.questBonus
      });
      
      // Provide user-friendly error message
      const errorMessage = embedError.message?.includes('ValidationError') || embedError.message?.includes('Expected a string')
        ? '❌ **An error occurred while formatting your submission. This may be due to invalid data. Please try again or contact a moderator if the issue persists.**'
        : embedError.message?.includes('channel not found')
        ? '❌ **Submissions channel not found. Please contact a moderator.**'
        : '❌ **An error occurred while posting your submission. Please try again or contact a moderator if the issue persists.**';
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: errorMessage,
          components: []
        });
      }
      
      throw embedError; // Re-throw to be caught by outer catch
    }

    // Only show success message after embed is successfully created and posted
    await interaction.update({
      content: '✅ **You have confirmed your submission! Mods will review it shortly.**',
      components: [],
    });

    // Send notification to approval channel
    try {
      const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
      if (approvalChannel?.isTextBased()) {
        // Determine submission type based on available data
        const isWriting = submissionData.category === 'writing' || (!submissionData.fileName && !submissionData.fileUrl);
        const submissionType = isWriting ? 'WRITING' : 'ART';
        const typeEmoji = isWriting ? '📝' : '🎨';
        const typeColor = isWriting ? '#FF6B35' : '#FF0000'; // Orange for writing, red for art
        
        // Calculate token display based on collaboration
        let tokenDisplay = `${totalTokens} tokens`;
        const hasCollaborators = submissionData.collab && ((Array.isArray(submissionData.collab) && submissionData.collab.length > 0) || (typeof submissionData.collab === 'string' && submissionData.collab !== 'N/A'));
        
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const totalParticipants = 1 + collaborators.length;
          const splitTokens = Math.floor(totalTokens / totalParticipants);
          tokenDisplay = `${totalTokens} tokens (${splitTokens} each)`;
        }

        // Build notification fields dynamically
        const notificationFields = [
          { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: false },
          { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          { name: `${typeEmoji} Title`, value: submissionData.title || submissionData.fileName || 'Untitled', inline: false },
          { name: '💰 Token Amount', value: tokenDisplay, inline: false },
          { name: '🆔 Submission ID', value: `\`${submissionData.submissionId}\``, inline: false },
          { name: '🔗 View Submission', value: `[Click Here](${messageUrl})`, inline: false }
        ];

        // Add collaboration field if present
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const collabDisplay = collaborators.join(', ');
          notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: false });
        }

        // Add blight ID if provided
        if (submissionData.blightId && submissionData.blightId !== 'N/A') {
          notificationFields.push({ 
            name: '🩸 Blight Healing ID', 
            value: `\`${submissionData.blightId}\``, 
            inline: false 
          });
        }

        // Add quest/event field if submission is for an HWQ so mods know to use /mod approve
        if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
          notificationFields.push({
            name: '🎯 Quest/Event',
            value: `\`${submissionData.questEvent}\``,
            inline: false
          });
        }

        const notificationEmbed = new EmbedBuilder()
          .setColor(typeColor)
          .setTitle(`${typeEmoji} PENDING ${submissionType} SUBMISSION!`)
          .setDescription('⏳ **Please approve within 24 hours!**')
          .addFields(notificationFields)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: `${submissionType} Submission Approval Required` })
          .setTimestamp();

        const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
        logger.success('SUBMISSION', `✅ Notification sent to approval channel for ${submissionType} submission`);
        
        // Save the pending notification message ID to the submission data
        await updateSubmissionData(submissionData.submissionId, {
          pendingNotificationMessageId: notificationMessage.id
        });
      }
    } catch (notificationError) {
      console.error(`[componentHandler.js]: ❌ Failed to send notification to approval channel:`, notificationError);
      // Don't throw here, just log the error since the submission was already posted
    }

    // Clear Tokens boost after use so it only applies to this one submission (Teacher/Scholar art/writing boost)
    const hadTokenBoost = (submissionData.boostTokenIncrease && submissionData.boostTokenIncrease > 0) ||
      (submissionData.boostFulfillmentTargets && submissionData.boostFulfillmentTargets.length > 0) ||
      (Array.isArray(submissionData.boostMetadata) && submissionData.boostMetadata.some(m => m.targets && m.targets.length > 0));
    if (hadTokenBoost) {
      const { clearBoostAfterUse } = require('../commands/jobs/boosting');
      const { fetchModCharacterByName } = require('@/database/db');
      const namesToClear = Array.isArray(submissionData.boostFulfillmentTargets) && submissionData.boostFulfillmentTargets.length > 0
        ? submissionData.boostFulfillmentTargets
        : (Array.isArray(submissionData.boostMetadata) ? submissionData.boostMetadata.flatMap(m => m.targets || []) : []);
      const seen = new Set();
      for (const characterName of namesToClear) {
        if (!characterName || seen.has(characterName)) continue;
        seen.add(characterName);
        try {
          let character = await fetchCharacterByName(characterName);
          if (!character) character = await fetchModCharacterByName(characterName);
          if (character && character.boostedBy) {
            await clearBoostAfterUse(character, {
              client: interaction.client,
              context: 'art/writing submission confirmed'
            });
            logger.success('SUBMISSION', `✅ Cleared Tokens boost for ${characterName} after submission confirm`);
          }
        } catch (clearErr) {
          console.error(`[componentHandler.js]: ❌ Failed to clear boost for ${characterName}:`, clearErr);
        }
      }
    }

    logger.success('SUBMISSION', `✅ Confirmed submission ${submissionData.submissionId} with ${totalTokens} tokens`);
  } catch (error) {
    // Log detailed error information
    console.error('[componentHandler.js]: ❌ Error in handleConfirmation:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      submissionId: submissionData?.submissionId,
      userId: userId,
      questBonus: submissionData?.questBonus,
      questBonusType: typeof submissionData?.questBonus
    });
    
    try {
      // Provide user-friendly error message based on error type
      let errorMessage = '❌ **An error occurred while confirming your submission. Please try again.**';
      
      if (error.message?.includes('Token calculation not found')) {
        errorMessage = '❌ **Token calculation is missing. Please complete all submission steps and try again.**';
      } else if (error.message?.includes('ValidationError') || error.message?.includes('Expected a string')) {
        errorMessage = '❌ **An error occurred while formatting your submission data. Please try again or contact a moderator if the issue persists.**';
      } else if (error.message?.includes('channel not found')) {
        errorMessage = '❌ **Submissions channel not found. Please contact a moderator.**';
      }
      
      // Only try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send confirmation error response: ${replyError.message}`);
    }
  }
}

// ------------------- Function: handleCancel -------------------
// Cancels an art submission and cleans up data.
async function handleCancel(interaction, userId, submissionData) {
  try {
    if (submissionData && submissionData.submissionId) {
      await deleteSubmissionFromStorage(submissionData.submissionId);
    }
    
    await interaction.update({
      content: '🚫 **Submission canceled.** Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error in handleCancel: ${error.message}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while canceling the submission.**',
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while canceling the submission.**',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send cancel error response: ${replyError.message}`);
    }
  }
}

// ------------------- Function: handleViewCharacter -------------------
// Shows a character's profile + gear embed.
async function handleViewCharacter(interaction, characterId) {
  try {
    await connectToTinglebot();
    // Try to fetch regular character first, then mod character if not found
    let character = await fetchCharacterById(characterId);
    if (!character) {
      // Try to fetch as mod character
      character = await fetchModCharacterById(characterId);
    }

    if (!character) {
      console.error(`[componentHandler.js]: Character with ID "${characterId}" not found in either regular or mod character collections.`);
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Character Not Found')
          .setDescription('This character no longer exists or has been deleted.')
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character was deleted\n• Character was removed from the database\n• Character ID is invalid' },
            { name: '💡 Suggestion', value: 'Please try viewing a different character.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp()],
        flags: 64
      });
    }

    const embed = createCharacterEmbed(character);

    const itemNames = [
      character.gearWeapon?.name,
      character.gearShield?.name,
      character.gearArmor?.head?.name,
      character.gearArmor?.chest?.name,
      character.gearArmor?.legs?.name
    ].filter(Boolean);

    const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });
    const getItemDetail = (itemName) => {
      const item = itemDetails.find(i => i.itemName === itemName);
      return item ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]` : 'N/A';
    };

    const gearMap = {
      head: character.gearArmor?.head ? `> ${getItemDetail(character.gearArmor.head.name)}` : '> N/A',
      chest: character.gearArmor?.chest ? `> ${getItemDetail(character.gearArmor.chest.name)}` : '> N/A',
      legs: character.gearArmor?.legs ? `> ${getItemDetail(character.gearArmor.legs.name)}` : '> N/A',
      weapon: character.gearWeapon ? `> ${getItemDetail(character.gearWeapon.name)}` : '> N/A',
      shield: character.gearShield ? `> ${getItemDetail(character.gearShield.name)}` : '> N/A',
    };

    const gearEmbed = createCharacterGearEmbed(character, gearMap, 'all');
          await interaction.reply({ embeds: [embed, gearEmbed], flags: 64 });
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: Error in handleViewCharacter:`, error);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while viewing the character.**\nPlease try again later.',
          flags: 64
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while viewing the character.**\nPlease try again later.',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send view character error response: ${replyError.message}`);
    }
  }
}

// =============================================================================
// ------------------- Job Interaction Handlers -------------------
// These functions handle job selection and pagination for updating a character's job.
// =============================================================================

// ------------------- Function: handleJobSelect -------------------
// Validates and applies job change, updates Discord roles, embeds, and posts a notification.
async function handleJobSelect(interaction, characterId, updatedJob) {
    try {
      await connectToTinglebot();
      // Try to fetch regular character first, then mod character if not found
      let character = await fetchCharacterById(characterId);
      if (!character) {
        // Try to fetch as mod character
        character = await fetchModCharacterById(characterId);
      }
  
      if (!character) {
        console.error(`[componentHandler.js]: Character not found for ID: ${characterId} in either regular or mod character collections`);
        return interaction.reply({ content: '❌ **Character not found.**', flags: 64 });
      }
  
      // Validate job change
      const validationResult = await canChangeJob(character, updatedJob);
      if (!validationResult.valid) {
        console.warn(`[componentHandler.js]: Job validation failed: ${validationResult.message}`);
        // Handle both string messages and embed messages
        const replyOptions = validationResult.message instanceof EmbedBuilder
          ? { embeds: [validationResult.message], flags: 64 }
          : { content: validationResult.message, flags: 64 };
        return interaction.reply(replyOptions);
      }
  
      const previousJob = character.job;
      const member = interaction.member;
  
      // Map job names to their role IDs
      const jobRoleIdMap = {
        'Adventurer': process.env.JOB_ADVENTURER,
        'Artist': process.env.JOB_ARTIST,
        'Bandit': process.env.JOB_BANDIT,
        'Beekeeper': process.env.JOB_BEEKEEPER,
        'Blacksmith': process.env.JOB_BLACKSMITH,
        'Cook': process.env.JOB_COOK,
        'Courier': process.env.JOB_COURIER,
        'Craftsman': process.env.JOB_CRAFTSMAN,
        'Farmer': process.env.JOB_FARMER,
        'Fisherman': process.env.JOB_FISHERMAN,
        'Forager': process.env.JOB_FORAGER,
        'Fortune Teller': process.env.JOB_FORTUNE_TELLER,
        'Graveskeeper': process.env.JOB_GRAVESKEEPER,
        'Guard': process.env.JOB_GUARD,
        'Healer': process.env.JOB_HEALER,
        'Herbalist': process.env.JOB_HERBALIST,
        'Hunter': process.env.JOB_HUNTER,
        'Mask Maker': process.env.JOB_MASK_MAKER,
        'Merchant': process.env.JOB_MERCHANT,
        'Mercenary': process.env.JOB_MERCENARY,
        'Miner': process.env.JOB_MINER,
        'Priest': process.env.JOB_PRIEST,
        'Rancher': process.env.JOB_RANCHER,
        'Researcher': process.env.JOB_RESEARCHER,
        'Scout': process.env.JOB_SCOUT,
        'Scholar': process.env.JOB_SCHOLAR,
        'Shopkeeper': process.env.JOB_SHOPKEEPER,
        'Stablehand': process.env.JOB_STABLEHAND,
        'Teacher': process.env.JOB_TEACHER,
        'Villager': process.env.JOB_VILLAGER,
        'Weaver': process.env.JOB_WEAVER,
        'Witch': process.env.JOB_WITCH,
        'Entertainer': process.env.JOB_ENTERTAINER
      };

      // Map job perks to their IDs
      const jobPerkIdMap = {
        'LOOTING': process.env.JOB_PERK_LOOTING,
        'STEALING': process.env.JOB_PERK_STEALING,
        'ENTERTAINING': process.env.JOB_PERK_ENTERTAINING,
        'DELIVERING': process.env.JOB_PERK_DELIVERING,
        'HEALING': process.env.JOB_PERK_HEALING,
        'GATHERING': process.env.JOB_PERK_GATHERING,
        'CRAFTING': process.env.JOB_PERK_CRAFTING,
        'BOOST': process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING,
        'VENDING': process.env.JOB_PERK_VENDING
      };
  
      // ------------------- Remove old job role -------------------
      const oldJobRoleId = jobRoleIdMap[previousJob];
      if (oldJobRoleId) {
        const guildRole = interaction.guild.roles.cache.get(oldJobRoleId);
        if (guildRole) {
          await member.roles.remove(guildRole);
        } else {
          console.error(`[componentHandler.js]: Old job role ID "${oldJobRoleId}" not found in guild.`);
        }
      }
  
      // ------------------- Add new job role -------------------
      const newJobRoleId = jobRoleIdMap[updatedJob];
      if (newJobRoleId) {
        const guildRole = interaction.guild.roles.cache.get(newJobRoleId);
        if (guildRole) {
          await member.roles.add(guildRole);
        } else {
          console.error(`[componentHandler.js]: New job role ID "${newJobRoleId}" not found in guild.`);
        }
      }
  
      // ------------------- Update perk roles -------------------
      const previousPerks = getJobPerk(previousJob)?.perks || [];
      const newPerks = getJobPerk(updatedJob)?.perks || [];
  
      // Remove previous perk roles
      for (const perk of previousPerks) {
        const perkRoleId = jobPerkIdMap[perk];
        if (perkRoleId) {
          const role = interaction.guild.roles.cache.get(perkRoleId);
          if (role) {
            await member.roles.remove(role);
          } else {
            console.error(`[componentHandler.js]: Old perk role ID "${perkRoleId}" not found.`);
          }
        } else {
          console.error(`[componentHandler.js]: No role ID mapping for old perk "${perk}".`);
        }
      }
  
      // Add new perk roles
      for (const perk of newPerks) {
        const perkRoleId = jobPerkIdMap[perk];
        if (perkRoleId) {
          const role = interaction.guild.roles.cache.get(perkRoleId);
          if (role) {
            await member.roles.add(role);
          } else {
            console.error(`[componentHandler.js]: New perk role ID "${perkRoleId}" not found.`);
          }
        } else {
          console.error(`[componentHandler.js]: No role ID mapping for new perk "${perk}".`);
        }
      }
  
      // ------------------- Update character job and save -------------------
      character.job = updatedJob;
      character.jobPerk = newPerks.join(' / ');
      
      // Update vendorType if changing to/from vendor job
      const isVendorJob = ["merchant", "shopkeeper"].includes(updatedJob.toLowerCase());
      if (isVendorJob) {
        character.vendorType = updatedJob.toLowerCase();
      } else if (character.vendorType) {
        // Clear vendorType if no longer a vendor
        character.vendorType = null;
      }
      
      await character.save();
  
      const embed = createCharacterEmbed(character);
  
      // Update the message with empty components to remove all buttons
      await interaction.update({
        content: `✅ **${character.name}'s job has been updated from ${previousJob} to ${updatedJob}.**`,
        embeds: [embed],
        components: [], // Set components to empty array to remove all buttons
        flags: 64, // 64 is the flag for ephemeral messages
      });

      // If the new job is Shopkeeper or Merchant, show the shop setup guide
      if (updatedJob.toLowerCase() === 'shopkeeper' || updatedJob.toLowerCase() === 'merchant') {
        const shopGuideEmbed = new EmbedBuilder()
          .setTitle('🎪 Setting Up Your Shop')
          .setDescription('Let\'s get your shop up and running! Follow these steps:')
          .addFields(
            { name: '1️⃣ Create Your Shop Sheet', value: 'Create a Google Sheet with these columns:\n`CHARACTER NAME | SLOT | ITEM NAME | STOCK QTY | COST EACH | POINTS SPENT | BOUGHT FROM | TOKEN PRICE | ART PRICE | OTHER PRICE | TRADES OPEN? | DATE`' },
            { name: '2️⃣ Share Your Sheet', value: 'Make sure your sheet is shared with "Anyone with the link can view" permissions.' },
            { name: '3️⃣ Choose Your Pouch', value: 'Select a pouch size:\n• Bronze: +15 slots\n• Silver: +30 slots\n• Gold: +50 slots' },
            { name: '4️⃣ Get Started', value: 'After setup, you can:\n• Add items with `/vending add`\n• Edit your shop with `/vending edit`\n• View your shop with `/vending view`' }
          )
          .setColor('#AA926A')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

        await interaction.followUp({
          embeds: [shopGuideEmbed],
          flags: 64 // 64 is the flag for ephemeral messages
        });
      }
  
      // ------------------- Notify edit log channel -------------------
      const EDIT_NOTIFICATION_CHANNEL_ID = '1319524801408274434';
  
      try {
        const notificationChannel = await interaction.client.channels.fetch(EDIT_NOTIFICATION_CHANNEL_ID);
        if (notificationChannel?.isTextBased()) {
          const log = [
            `📢 **USER EDITED THEIR CHARACTER**`,
            `🌱 **User:** \`${interaction.user.tag}\``,
            `👤 **Character Name:** \`${character.name}\``,
            `🛠️ **Edited Category:** \`Job\``,
            `🔄 **Previous Value:** \`Job: ${previousJob || 'N/A'}\``,
            `✅ **Updated Value:** \`Job: ${updatedJob}\``
          ].join('\n');
  
          await notificationChannel.send(log);
        } else {
          console.error(`[componentHandler.js]: Notification channel not text-based or unavailable.`);
        }
      } catch (err) {
        handleError(err, 'componentHandler.js');
        console.error(`[componentHandler.js]: Error sending update notification`, err);
      }
  
    } catch (error) {
      handleError(error, 'componentHandler.js');
      console.error(`[componentHandler.js]: Error in handleJobSelect`, error);
      await interaction.reply({
        content: '⚠️ **An error occurred while updating the job. Please try again.**',
        flags: 64 // 64 is the flag for ephemeral messages
      });
    }
  }
  
  // ------------------- Function: handleJobPage -------------------
  // Displays paginated list of jobs using buttons.
  async function handleJobPage(interaction, characterId, pageIndexString) {
    try {
      const pageIndex = parseInt(pageIndexString, 10);
  
      if (isNaN(pageIndex) || pageIndex < 1 || pageIndex > 2) {
        return interaction.reply({
          content: '⚠️ **Invalid job page. Please try again.**',
          flags: 64
        });
      }
  
      const jobs = getGeneralJobsPage(pageIndex);
      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return interaction.reply({
          content: '⚠️ **No jobs available on this page.**',
          flags: 64
        });
      }
  
      const jobButtons = jobs.map(job =>
        new ButtonBuilder()
          .setCustomId(`job-select|${characterId}|${job}`)
          .setLabel(job)
          .setStyle(ButtonStyle.Primary)
      );
  
      const rows = [];
      while (jobButtons.length) {
        rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));
      }
  
      const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`job-page|${characterId}|${pageIndex - 1}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
  
        new ButtonBuilder()
          .setCustomId(`job-page|${characterId}|${pageIndex + 1}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex >= 2) // 🔁 Change if dynamic paging added
      );
  
      const embed = new EmbedBuilder()
        .setTitle('General Jobs')
        .setDescription('Select a job from the buttons below:')
        .setColor(getVillageColorByName('General') || '#00CED1');
  
      await interaction.update({
        embeds: [embed],
        components: [...rows, navigationRow],
        flags: 64, // 64 is the flag for ephemeral messages
      });
  
    } catch (error) {
      handleError(error, 'componentHandler.js');
      console.error(`[componentHandler.js]: Error in handleJobPage`, error);
      await interaction.reply({
        content: '⚠️ **An error occurred while navigating job pages. Please try again.**',
        flags: 64 // 64 is the flag for ephemeral messages
      });
    }
  }
  
// =============================================================================
// ------------------- RuuGame Button Handlers -------------------
// Handles button interactions for the RuuGame dice rolling game
// =============================================================================

// =============================================================================
// ------------------- RuuGame Component Handler -------------------
// Handles RuuGame button interactions and game logic.
// =============================================================================

// Track processed interactions to prevent double processing
const processedInteractions = new Set();

// ------------------- Function: handleRuuGameRoll -------------------
// Handles roll dice button clicks
async function handleRuuGameRoll(interaction) {
  const interactionId = `${interaction.id}_${interaction.user.id}`;
  
  // IMMEDIATELY mark this interaction as being processed to prevent race conditions
  if (processedInteractions.has(interactionId)) {
    console.log(`[RuuGame Component] Interaction ${interactionId} already processed, skipping`);
    return;
  }
  
  // Check if interaction is already replied/deferred
  if (interaction.replied || interaction.deferred) {
    console.log(`[RuuGame Component] Interaction ${interactionId} already replied/deferred, skipping`);
    return;
  }
  
  // Mark this interaction as being processed IMMEDIATELY
  processedInteractions.add(interactionId);
  
  // Clean up old processed interactions (keep only last 1000)
  if (processedInteractions.size > 1000) {
    const entries = Array.from(processedInteractions);
    processedInteractions.clear();
    entries.slice(-500).forEach(id => processedInteractions.add(id));
  }
  
  let hasDeferred = false;
  
  // Double-check interaction state after marking as processed
  if (interaction.replied || interaction.deferred) {
    console.log(`[RuuGame Component] Interaction ${interactionId} became replied/deferred after marking, removing from processed and skipping`);
    processedInteractions.delete(interactionId);
    return;
  }
  
  try {
    const sessionId = interaction.customId.replace('ruugame_roll_', '');
    const userId = interaction.user.id;
    
    // Use findOneAndUpdate with optimistic concurrency control and retry logic
    let session = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        // Find the session with optimistic locking
        session = await RuuGame.findOne({
          sessionId: sessionId,
          expiresAt: { $gt: new Date() }
        });
        
        if (!session) {
          await interaction.reply({
            content: '❌ No active session found.',
            flags: 64
          });
          return;
        }
        
        // Check if game is already finished (double-check to prevent late rolls)
        if (session.status === 'finished') {
          await interaction.reply({
            content: '❌ This game has already ended!',
            flags: 64
          });
          return;
        }
        
        // Additional check: if there's already a winner, don't allow more rolls
        if (session.winner && session.winner !== null) {
          await interaction.reply({
            content: '❌ This game already has a winner!',
            flags: 64
          });
          return;
        }
        
        // Check if session is in a valid state for rolling
        if (session.status !== 'waiting' && session.status !== 'active') {
          await interaction.reply({
            content: '❌ This game is not in a valid state for rolling.',
            flags: 64
          });
          return;
        }
        
        // Find player in the game or auto-join them
        let player = session.players.find(p => p.discordId === userId);
        if (!player) {
          // Auto-join the player
          if (session.players.length >= GAME_CONFIG.MAX_PLAYERS) {
            await interaction.reply({
              content: '❌ This game is full!',
              flags: 64
            });
            return;
          }
          
          player = {
            discordId: userId,
            username: interaction.user.username,
            lastRoll: null,
            lastRollTime: null
          };
          session.players.push(player);
        }
        
        // Check global cooldown BEFORE deferring
        const now = new Date();
        if (session.lastGlobalRollTime && (now - session.lastGlobalRollTime) < (GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000)) {
          const remainingSeconds = Math.ceil((GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000 - (now - session.lastGlobalRollTime)) / 1000);
          
          try {
            // Send ephemeral cooldown message using reply
            await interaction.reply({
              content: `⏰ Please wait ${remainingSeconds} seconds before anyone can roll again.`,
              flags: 64
            });
          } catch (error) {
            console.error(`[RuuGame Component] Failed to send cooldown message:`, error);
          }
          return;
        }
        
        // Check individual player cooldown
        if (player.lastRollTime && (now - player.lastRollTime) < (GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000)) {
          const remainingSeconds = Math.ceil((GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000 - (now - player.lastRollTime)) / 1000);
          
          try {
            // Send ephemeral cooldown message using reply
            await interaction.reply({
              content: `⏰ Please wait ${remainingSeconds} seconds before rolling again.`,
              flags: 64
            });
          } catch (error) {
            console.error(`[RuuGame Component] Failed to send cooldown message:`, error);
          }
          return;
        }
        
        // Only defer the interaction if we're actually going to process the roll
        try {
          // Double-check interaction state before deferring
          if (interaction.replied || interaction.deferred) {
            console.log(`[RuuGame Component] Interaction ${interactionId} became replied/deferred before deferring, cleaning up and skipping`);
            processedInteractions.delete(interactionId);
            return;
          }
          
          await interaction.deferReply({ flags: 0 });
          hasDeferred = true;
        } catch (deferError) {
          console.error(`[RuuGame Component] Failed to defer reply for interaction ${interactionId}:`, deferError);
          // If defer fails, the interaction might have been handled by another thread
          processedInteractions.delete(interactionId);
          return;
        }
        
        // CRITICAL: Reload session state right before rolling to get latest winner status
        // This prevents race conditions where someone wins between the initial check and the roll
        const latestSession = await RuuGame.findById(session._id);
        if (latestSession) {
          session = latestSession;
        }
        
        // Final check: ensure session is still valid before rolling
        if (session.status === 'finished' || (session.winner && session.winner !== null)) {
          await interaction.editReply({
            content: '❌ This game has already ended!',
            components: []
          });
          return;
        }
        
        // Double-check that the player exists in the updated session
        // If they were auto-joined before reload, they need to be added again
        let currentPlayer = session.players.find(p => p.discordId === userId);
        if (!currentPlayer) {
          // Player was auto-joined before reload but not saved - add them now
          if (session.players.length >= GAME_CONFIG.MAX_PLAYERS) {
            await interaction.editReply({
              content: '❌ This game is full!',
              components: []
            });
            return;
          }
          
          // Add player to the session
          currentPlayer = {
            discordId: userId,
            username: interaction.user.username,
            lastRoll: null,
            lastRollTime: null
          };
          session.players.push(currentPlayer);
          
          // Save the player addition to the database
          try {
            await RuuGame.findOneAndUpdate(
              { _id: session._id },
              { $set: { players: session.players } },
              { new: true, runValidators: true }
            );
          } catch (saveError) {
            console.error('[RuuGame Component] Failed to save player join:', saveError);
            await interaction.editReply({
              content: '❌ Failed to join the game. Please try again.',
              components: []
            });
            return;
          }
        }
        
        // Update player reference to use the latest session's player data
        player = currentPlayer;
        
        // Roll the dice
        const roll = Math.floor(Math.random() * GAME_CONFIG.DICE_SIDES) + 1;
        player.lastRoll = roll;
        player.lastRollTime = now;
        session.lastGlobalRollTime = now; // Set global cooldown for all players

        let gameEnded = false;
        let prizeCharacter = null; // Track which character received the prize
        let pityPrizeCharacter = null; // Track which character received the pity prize
        
        // Check for pity prize (roll of 1)
        if (roll === 1) {
          console.log(`[RuuGame Component] Pity prize! User ${userId} rolled ${roll} - awarding Mock Fairy`);
          pityPrizeCharacter = await awardRuuGamePityPrize(session, userId, interaction);
        }
        
        if (roll === GAME_CONFIG.TARGET_SCORE) {
          console.log(`[RuuGame Component] Winner detected! User ${userId} rolled ${roll}`);
          console.log(`[RuuGame Component] Before setting winner - Session status: ${session.status}, winner: ${session.winner}`);
          gameEnded = true;

          // STEP 1: Post winner embed immediately to prevent further button clicks
          const immediateWinnerEmbed = await createRuuGameEmbed(
            session,
            '🎉 WINNER!',
            interaction.user,
            null,
            roll
          );
          immediateWinnerEmbed.setTitle(
            `🎲 RuuGame - ${interaction.user.username} rolled a ${roll} and WON!`
          );
          
          await interaction.editReply({
            embeds: [immediateWinnerEmbed],
            components: [] // Remove buttons immediately
          });

          // STEP 2: Persist winner state to database BEFORE awarding prize
          let winnerPersisted = false;
          let persistRetryCount = 0;
          const maxPersistRetries = 3;
          
          while (!winnerPersisted && persistRetryCount < maxPersistRetries) {
            try {
              const winnerPersist = await RuuGame.findOneAndUpdate(
                {
                  _id: session._id,
                  __v: session.__v,
                  status: { $ne: 'finished' },
                  winner: null
                },
                {
                  $set: {
                    status: 'finished',
                    winner: userId,
                    winningScore: roll,
                    players: session.players
                  },
                  $inc: { __v: 1 }
                },
                { new: true, runValidators: true }
              );

              if (winnerPersist) {
                session = winnerPersist;
                winnerPersisted = true;
                console.log(`[RuuGame Component] Winner state persisted - Session status: ${session.status}, winner: ${session.winner}`);
              } else {
                // Check if another process already finished the game
                const latestSession = await RuuGame.findById(session._id);
                if (latestSession && latestSession.status === 'finished') {
                  session = latestSession;
                  winnerPersisted = true;
                  console.log(`[RuuGame Component] Session already finished by another process - Status: ${session.status}, winner: ${session.winner}`);
                } else {
                  // Version conflict or other issue - retry
                  persistRetryCount++;
                  console.log(`[RuuGame Component] Winner persistence failed, retry ${persistRetryCount}/${maxPersistRetries}`);
                  if (persistRetryCount < maxPersistRetries) {
                    // Reload session to get latest version
                    session = await RuuGame.findById(session._id);
                    await new Promise(resolve => setTimeout(resolve, 100 * persistRetryCount));
                  }
                }
              }
            } catch (persistError) {
              console.error(`[RuuGame Component] Failed to persist winner (attempt ${persistRetryCount + 1}):`, persistError);
              persistRetryCount++;
              if (persistRetryCount < maxPersistRetries) {
                // Reload session to get latest version
                session = await RuuGame.findById(session._id);
                await new Promise(resolve => setTimeout(resolve, 100 * persistRetryCount));
              }
            }
          }
          
          // If we couldn't persist the winner after all retries, abort the game
          if (!winnerPersisted) {
            console.error('[RuuGame Component] Failed to persist winner after all retries - aborting game');
            await interaction.editReply({
              content: '❌ Error: Could not properly end the game. Please contact an administrator.',
              components: []
            });
            return;
          }
          
          // Double-check the session state before proceeding
          console.log(`[RuuGame Component] Session state before prize awarding - Status: ${session.status}, winner: ${session.winner}`);

          // STEP 3: Award prize AFTER winner state is persisted
          try {
            console.log(`[RuuGame Component] Awarding prize to user ${userId}`);
            console.log(`[RuuGame Component] Before awardRuuGamePrize - Session status: ${session.status}, winner: ${session.winner}`);
            prizeCharacter = await awardRuuGamePrize(session, userId, interaction);
            console.log(`[RuuGame Component] After awardRuuGamePrize - Session status: ${session.status}, winner: ${session.winner}`);

            // Persist prize-claimed metadata if set
            try {
              const prizeUpdate = await RuuGame.findOneAndUpdate(
                { _id: session._id },
                {
                  $set: {
                    prizeClaimed: session.prizeClaimed,
                    prizeClaimedBy: session.prizeClaimedBy,
                    prizeClaimedAt: session.prizeClaimedAt
                  }
                },
                { new: true, runValidators: true }
              );
              if (prizeUpdate) {
                session = prizeUpdate;
                console.log(`[RuuGame Component] Prize metadata persisted - Session status: ${session.status}, winner: ${session.winner}`);
              }
            } catch (prizePersistError) {
              console.error('[RuuGame Component] Failed to persist prize claim data:', prizePersistError);
            }
            
            // Update the embed with prize information if successful
            if (prizeCharacter) {
              console.log(`[RuuGame Component] Creating final winner embed - Session status: ${session.status}, winner: ${session.winner}`);
              const finalWinnerEmbed = await createRuuGameEmbed(
                session,
                '🎉 WINNER!',
                interaction.user,
                prizeCharacter,
                roll
              );
              finalWinnerEmbed.setTitle(
                `🎲 RuuGame - ${interaction.user.username} rolled a ${roll} and WON!`
              );
              
              await interaction.editReply({
                embeds: [finalWinnerEmbed],
                components: []
              });
            }
          } catch (error) {
            console.error('Error auto-awarding prize:', error);
            // Don't fail the game if prize awarding fails
            session.prizeClaimed = false;
            session.prizeClaimedBy = null;
            session.prizeClaimedAt = null;
          }
        } else if (session.status === 'waiting') {
          session.status = 'active';
        }

        // Skip final update if game is already finished (winner case)
        if (!gameEnded) {
          // Use findOneAndUpdate with optimistic concurrency control
          console.log(`[RuuGame Component] Before findOneAndUpdate - Session ${session.sessionId} status: ${session.status}, winner: ${session.winner}`);
          
          // Prepare the update data
          const updateData = {
            players: session.players,
            status: session.status,
            winner: session.winner,
            winningScore: session.winningScore,
            prizeClaimed: session.prizeClaimed,
            prizeClaimedBy: session.prizeClaimedBy,
            prizeClaimedAt: session.prizeClaimedAt,
            lastGlobalRollTime: session.lastGlobalRollTime
          };
          
          // Remove undefined values to prevent MongoDB errors
          Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) {
              delete updateData[key];
            }
          });
          
          const updateResult = await RuuGame.findOneAndUpdate(
            { 
              _id: session._id,
              __v: session.__v, // Optimistic locking using version
              status: { $ne: 'finished' }
            },
            {
              $set: updateData,
              $inc: { __v: 1 } // Increment version
            },
            { 
              new: true, // Return the updated document
              runValidators: true
            }
          );
          
          if (updateResult) {
            console.log(`[RuuGame Component] After findOneAndUpdate - Session ${updateResult.sessionId} status: ${updateResult.status}, winner: ${updateResult.winner}`);
            // Successfully updated - use the updated session
            session = updateResult;
          } else {
            console.log(`[RuuGame Component] findOneAndUpdate returned null - version conflict or session not found`);
            // Check if the session was finished by another process; if so, inform user and stop
            try {
              const latestSession = await RuuGame.findById(session._id);
              if (latestSession && latestSession.status === 'finished') {
                const endedEmbed = await createRuuGameEmbed(latestSession, 'Game Ended');
                if (hasDeferred) {
                  await interaction.editReply({
                    embeds: [endedEmbed],
                    components: []
                  });
                } else if (!interaction.replied && !interaction.deferred) {
                  await interaction.reply({
                    embeds: [endedEmbed],
                    components: [],
                    flags: 64
                  });
                }
                break; // Stop retrying; game is over
              }
            } catch (checkError) {
              console.error('[RuuGame Component] Failed checking latest session after version conflict:', checkError);
            }
            // Version conflict - retry
            retryCount++;
            if (retryCount >= maxRetries) {
              throw new Error('Failed to update session after multiple retries due to concurrent modifications');
            }
            // Wait a bit before retrying to reduce contention
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            continue; // Retry the loop
          }
        } else {
          console.log(`[RuuGame Component] Skipping final update - game already finished`);
        }

        // Only send response if this wasn't a winning roll (winner response already sent)
        if (!gameEnded) {
          const embed = await createRuuGameEmbed(session, 'Roll Result!', interaction.user, prizeCharacter, roll, pityPrizeCharacter);
          embed.setTitle(`🎲 RuuGame - ${interaction.user.username} rolled a ${roll}!`);
          
          // Randomly show GIF when rolling a 1 (30% chance)
          if (roll === 1 && Math.random() < 0.3) {
            embed.setImage('https://images-ext-1.discordapp.net/external/bRvP_21VaPFCTUfg1OE85vzIkv42UvzI5kgzgh8n8s4/https/media.tenor.com/Z_9PoTuClMIAAAPo/game-over-guardian.mp4');
          }
          
          let buttons = createRuuGameButtons(sessionId);

          await interaction.editReply({
            embeds: [embed],
            components: [buttons]
          });
        }
        
        // Send prize notification if awarded (for non-winning rolls)
        if (prizeCharacter && session.prizeClaimed && !gameEnded) {
          // Prize embed removed - already handled in main embed
        }
        
        // Success - break out of retry loop
        break;
        
      } catch (error) {
        if (error.name === 'VersionError' || error.message.includes('No matching document found')) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error('Failed to update session after multiple retries due to concurrent modifications');
          }
          // Wait a bit before retrying to reduce contention
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          continue;
        } else {
          // Non-version error - rethrow
          throw error;
        }
      }
    }

  } catch (error) {
    console.error(`[RuuGame Component] Error in handleRuuGameRoll:`, error);
    
    handleError(error, 'componentHandler.js');
    
    // Only try to reply if we haven't already deferred and the interaction hasn't been responded to
    if (!hasDeferred && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '❌ An error occurred while rolling.',
          flags: 64
        });
      } catch (replyError) {
        console.error(`[RuuGame Component] Failed to send error response:`, replyError);
      }
    } else if (hasDeferred) {
      try {
        await interaction.editReply({
          content: '❌ An error occurred while rolling.'
        });
      } catch (replyError) {
        console.error(`[RuuGame Component] Failed to send error edit response:`, replyError);
      }
    }
  } finally {
    // Always clean up the processed interaction
    processedInteractions.delete(interactionId);
  }
}

// ------------------- Function: createRuuGameEmbed -------------------
// Creates an embed showing game information
async function createRuuGameEmbed(session, title, userWhoRolled = null, prizeCharacter = null, roll = null, pityPrizeCharacter = null) {
  console.log(`[createRuuGameEmbed] Creating embed - Session status: ${session.status}, winner: ${session.winner}, prizeCharacter: ${prizeCharacter?.name || 'None'}`);
  
  // Fetch the actual item emoji from ItemModel
  const itemDetails = await ItemModel.findOne({ itemName: PRIZES[session.prizeType].itemName }).select('emoji');
  const itemEmoji = itemDetails?.emoji || PRIZES[session.prizeType].emoji; // Fallback to hardcoded emoji if not found
  
  const prize = PRIZES[session.prizeType];
  const embed = new EmbedBuilder()
    .setTitle(`🎲 RuuGame - ${title}`)
    .setDescription(`**Roll a 20 to win a ${itemEmoji} ${prize.name}!**\n\n*Only members with set up characters can join!*\n*Prize will be added to a random character's inventory!*`)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setColor(getRuuGameStatusColor(session.status))
    .setTimestamp();
  
  // Add user avatar as thumbnail if we have a user who rolled
  if (userWhoRolled) {
    embed.setThumbnail(userWhoRolled.displayAvatarURL({ dynamic: true }));
  }
  
  // Add game info in a cleaner format
  embed.addFields(
    { name: '📋 Game Info', value: `**Session:** ${session.sessionId}\n**Status:** ${session.status.charAt(0).toUpperCase() + session.status.slice(1)}\n**Players:** ${session.players.length}`, inline: false }
  );
  
  // Add roll result with emojis if we have a roll
  if (roll !== null) {
    const rollEmojis = getRollEmojis(roll);
    let rollValue = `${rollEmojis}`;
    
    // Add pity prize information if someone rolled a 1
    if (roll === 1 && pityPrizeCharacter) {
      rollValue += `\n\n🎁 **Pity Prize!** Mock Fairy added to **${pityPrizeCharacter.name}**'s inventory!`;
    }
    
    embed.addFields(
      { name: '🎲 Roll Result', value: rollValue, inline: false }
    );
  }
  
  if (session.winner) {
    console.log(`[createRuuGameEmbed] Adding winner field - Winner: ${session.winner}, Winning Score: ${session.winningScore}, Prize Character: ${prizeCharacter?.name || 'None'}, Prize Claimed: ${session.prizeClaimed}`);
    const winner = session.players.find(p => p.discordId === session.winner);
    
    // Handle case where winner isn't in players array (shouldn't happen, but safety check)
    const winnerUsername = winner?.username || `User <@${session.winner}>`;
    let winnerValue = `**${winnerUsername}** rolled a perfect **${session.winningScore}**!`;
    
    // Add prize information if we have character details
    if (prizeCharacter && session.prizeClaimed) {
      winnerValue += `\n\n🎁 **Prize Awarded:** ${itemEmoji} ${prize.name} added to **${prizeCharacter.name}**'s inventory!`;
      winnerValue += `\n📦 **Inventory Link:** [View ${prizeCharacter.name}'s Inventory](${prizeCharacter.inventory})`;
    }
    
    embed.addFields({ 
      name: '🏆 Winner!', 
      value: winnerValue, 
      inline: false 
    });
  } else {
    console.log(`[createRuuGameEmbed] No winner yet - Session status: ${session.status}`);
  }
  
  return embed;
}

// ------------------- Function: getRollEmojis -------------------
// Returns emoji representation of the rolled number
function getRollEmojis(roll) {
  const emojiMap = {
    1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣',
    6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟',
    11: '1️⃣1️⃣', 12: '1️⃣2️⃣', 13: '1️⃣3️⃣', 14: '1️⃣4️⃣', 15: '1️⃣5️⃣',
    16: '1️⃣6️⃣', 17: '1️⃣7️⃣', 18: '1️⃣8️⃣', 19: '1️⃣9️⃣', 20: '2️⃣0️⃣'
  };
  return emojiMap[roll] || roll.toString();
}

// ------------------- Function: createRuuGameButtons -------------------
// Creates action buttons for the game
function createRuuGameButtons(sessionId) {
  const rollButton = new ButtonBuilder()
    .setCustomId(`ruugame_roll_${sessionId}`)
    .setLabel('Roll d20')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🎲');
  
  const buttons = new ActionRowBuilder()
    .addComponents(rollButton);
  
  return buttons;
}

// ------------------- Function: getRuuGameStatusColor -------------------
// Returns appropriate color for game status
function getRuuGameStatusColor(status) {
  switch (status) {
    case 'waiting': return '#ffff00'; // Yellow
    case 'active': return '#00ff00'; // Green
    case 'finished': return '#ff0000'; // Red
    default: return '#0099ff'; // Blue
  }
}

// ------------------- Function: awardRuuGamePrize -------------------
// Shared function to award prizes to RuuGame winners
async function awardRuuGamePrize(session, userId, interaction) {
  try {
    const characters = await Character.find({ userId: userId });
    if (characters.length > 0) {
      const randomCharacter = characters[Math.floor(Math.random() * characters.length)];
      const prize = PRIZES[session.prizeType];

      // Fetch the actual item emoji from ItemModel
      const itemDetails = await ItemModel.findOne({ itemName: prize.itemName }).select('emoji');
      const itemEmoji = itemDetails?.emoji || '🎁'; // Fallback emoji if not found

      // Add item to random character's inventory using inventory utilities
      const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
      await addItemInventoryDatabase(
        randomCharacter._id,
        prize.itemName,
        1,
        interaction,
        'RuuGame Win'
      );

      console.log(`[RuuGame Component] Before setting prize claimed - Session status: ${session.status}, winner: ${session.winner}`);
      session.prizeClaimed = true;
      session.prizeClaimedBy = randomCharacter.name;
      session.prizeClaimedAt = new Date();
      console.log(`[RuuGame Component] After setting prize claimed - Session status: ${session.status}, winner: ${session.winner}`);

      return randomCharacter; // Return the character for embed display
    }
  } catch (error) {
    console.error('Error auto-awarding prize:', error);
    // Don't fail the game if prize awarding fails
    session.prizeClaimed = false;
    session.prizeClaimedBy = null;
    session.prizeClaimedAt = null;
  }
  return null;
}

// ------------------- Function: awardRuuGamePityPrize -------------------
// Awards Mock Fairy pity prize to players who roll a 1
async function awardRuuGamePityPrize(session, userId, interaction) {
  try {
    const characters = await Character.find({ userId: userId });
    if (characters.length > 0) {
      const randomCharacter = characters[Math.floor(Math.random() * characters.length)];

      // Fetch the Mock Fairy item emoji from ItemModel
      const itemDetails = await ItemModel.findOne({ itemName: 'Mock Fairy' }).select('emoji');
      const itemEmoji = itemDetails?.emoji || '🧚‍♀️'; // Fallback emoji if not found

      // Add Mock Fairy to random character's inventory using inventory utilities
      const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');
      await addItemInventoryDatabase(
        randomCharacter._id,
        'Mock Fairy',
        1,
        interaction,
        'RuuGame Pity Prize'
      );

      console.log(`[RuuGame Component] Mock Fairy awarded to ${randomCharacter.name} for rolling 1`);
      return randomCharacter; // Return the character for embed display
    }
  } catch (error) {
    console.error('Error awarding pity prize:', error);
    // Don't fail the game if pity prize awarding fails
  }
  return null;
}

// =============================================================================
// ------------------- Minigame Button Handlers -------------------
// Handles button interactions for minigames
// =============================================================================

// ------------------- Function: handleMinigameJoin -------------------
// Handles join game button clicks for minigames
async function handleMinigameJoin(interaction) {
  try {
    const sessionId = interaction.customId.replace('minigame_join_', '');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    console.log(`[MINIGAME COMPONENT JOIN] ${username} (${userId}) attempting to join session ${sessionId} via button`);
    
    // Find the minigame session
    const Minigame = require('@/models/MinigameModel');
    const session = await Minigame.findOne({ sessionId: sessionId });
    
    if (!session) {
      console.log(`[MINIGAME COMPONENT JOIN] ${username} failed - session not found: ${sessionId}`);
      return await interaction.reply({
        content: '❌ Game session not found or has expired.',
        flags: 64
      });
    }
    
    console.log(`[MINIGAME COMPONENT JOIN] ${username} session found - Status: ${session.status}, Players: ${session.players.length}`);
    
    // Check if player already joined
    const alreadyJoined = session.players.find(p => p.discordId === userId);
    if (alreadyJoined) {
      console.log(`[MINIGAME COMPONENT JOIN] ${username} failed - already joined`);
      return await interaction.reply({
        content: '✅ You\'re already in the game!',
        flags: 64
      });
    }
    
    // Add player to game - Critical section with race condition protection
    console.log(`[MINIGAME COMPONENT JOIN] ${username} adding to game - Players before: ${session.players.length}`);
    
    // Double-check for duplicates right before adding (race condition protection)
    const duplicateCheck = session.players.find(p => p.discordId === userId);
    if (duplicateCheck) {
      console.log(`[MINIGAME COMPONENT JOIN] ${username} race condition detected - player already joined during processing`);
      return await interaction.reply({
        content: '✅ You\'re already in the game!',
        flags: 64
      });
    }
    
    session.players.push({
      discordId: userId,
      username: username,
      joinedAt: new Date()
    });
    console.log(`[MINIGAME COMPONENT JOIN] ${username} added to players array - Players after: ${session.players.length}`);
    
    session.markModified('players');
    
    try {
      await session.save();
      console.log(`[MINIGAME COMPONENT JOIN] ${username} session saved successfully`);
    } catch (error) {
      console.error(`[MINIGAME COMPONENT JOIN] ${username} failed to save session:`, error);
      return await interaction.reply({
        content: `❌ Failed to join the game. Please try again.`,
        flags: 64
      });
    }
    
    await interaction.reply({
      content: `🎮 **${username}** joined the game!`,
      flags: 64
    });
    console.log(`[MINIGAME COMPONENT JOIN] ${username} join completed successfully`);
    
    // Check if we have 6 players and should auto-start (separate message)
    if (session.players.length === 6 && session.status === 'waiting') {
      console.log(`[MINIGAME COMPONENT JOIN] ${username} triggering auto-start - 6 players reached for session ${session.sessionId}`);
      
      // Auto-start the game
      const { spawnAliens } = require('../modules/minigameModule');
      const playerCount = session.gameData.turnOrder.length || session.players.length;
      console.log(`[MINIGAME COMPONENT JOIN] ${username} spawning aliens for auto-start - Player count: ${playerCount}`);
      const spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
      console.log(`[MINIGAME COMPONENT JOIN] ${username} aliens spawned: ${spawnResult.spawnCount} aliens`);
      
      // Update session status
      session.gameData.currentRound = 1;
      session.status = 'active';
      console.log(`[MINIGAME COMPONENT JOIN] ${username} session status updated to active`);
      
      session.markModified('gameData');
      session.markModified('gameData.aliens');
      session.markModified('gameData.turnOrder');
      session.markModified('gameData.currentTurnIndex');
      
      try {
        await session.save();
        console.log(`[MINIGAME COMPONENT JOIN] ${username} auto-start session saved successfully`);
      } catch (error) {
        console.error(`[MINIGAME COMPONENT JOIN] ${username} failed to save auto-start session:`, error);
        return await interaction.followUp({
          content: `❌ Failed to auto-start the game. Please try again.`,
          flags: 64
        });
      }
      
      // Get first player in turn order for mention
      const firstPlayer = session.gameData.turnOrder[0];
      const firstPlayerMention = firstPlayer ? `<@${firstPlayer.discordId}>` : '';
      console.log(`[MINIGAME COMPONENT JOIN] ${username} first player: ${firstPlayer?.username || 'None'}`);
      
      // Post auto-start as follow-up message
      await interaction.followUp({
        content: `🎮 **Game Auto-Started!** ${spawnResult.message}\n\n🎯 ${firstPlayerMention}, it's your turn! Use </minigame theycame-roll:1413815457118556201> to attack aliens!`,
        flags: 64
      });
      console.log(`[MINIGAME COMPONENT JOIN] ${username} auto-start process completed successfully`);
    }
    
  } catch (error) {
    handleError(error, 'componentHandler.js', {
      action: 'minigame_join',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });
    
    await interaction.reply({
      content: '❌ An error occurred while joining the game.',
      flags: 64
    });
  }
}

// ------------------- Function: handleMinigameStatus -------------------
// Handles view status button clicks for minigames
async function handleMinigameStatus(interaction) {
  try {
    const sessionId = interaction.customId.replace('minigame_status_', '');
    
    // Find the minigame session
    const Minigame = require('@/models/MinigameModel');
    const session = await Minigame.findOne({ sessionId: sessionId });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Game session not found or has expired.',
        flags: 64
      });
    }
    
    // Import the minigame module to create the embed
    const { getAlienDefenseGameStatus } = require('../modules/minigameModule');
    
    // Create status embed based on game type
    let embed;
    if (session.gameType === 'theycame') {
      const status = getAlienDefenseGameStatus(session.gameData);
      
      embed = new EmbedBuilder()
        .setTitle(`👽 They Came for the Cows - Game Status`)
        .setDescription('Current game status and progress')
        .setColor(0x00ff00)
        .setTimestamp()
        .addFields(
          { name: '📊 Game Progress', value: status.gameProgress, inline: true },
          { name: '👥 Players', value: session.players.length.toString(), inline: true },
          { name: '🐄 Animals Saved', value: status.villageAnimals.toString(), inline: true },
          { name: '👾 Active Aliens', value: `Outer: ${status.ringStatus.outerRing} | Middle: ${status.ringStatus.middleRing} | Inner: ${status.ringStatus.innerRing}`, inline: false },
          { name: '💀 Defeated Aliens', value: status.defeatedAliens.toString(), inline: true },
          { name: '🚨 Animals Lost', value: status.animalsLost.toString(), inline: true }
        );
    } else {
      embed = new EmbedBuilder()
        .setTitle('🎮 Minigame Status')
        .setDescription('Unknown game type')
        .setColor(0x808080);
    }
    
    await interaction.reply({
      embeds: [embed],
      flags: 64
    });
    
  } catch (error) {
    handleError(error, 'componentHandler.js', {
      action: 'minigame_status',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });
    
    await interaction.reply({
      content: '❌ An error occurred while fetching game status.',
      flags: 64
    });
  }
}

// =============================================================================
// ------------------- Component Interaction Handler -------------------
// Routes all customId interactions.
// =============================================================================

// ------------------- Function: handleComponentInteraction -------------------
// Delegates interaction based on customId prefix.
async function handleComponentInteraction(interaction) {
  const [action] = interaction.customId.split('|');

  try {
    // Handle shop navigation buttons first
    if (interaction.customId.startsWith('shop-')) {
      // These buttons are handled by their own collectors in the shop view
      return;
    }

    // Handle RuuGame buttons
    if (interaction.customId.startsWith('ruugame_')) {
      // Check if this interaction has already been processed
      const interactionId = `${interaction.id}_${interaction.user.id}`;
      if (processedInteractions.has(interactionId)) {
        console.log(`[ComponentHandler] RuuGame interaction ${interactionId} already processed, skipping`);
        return;
      }
      
      if (interaction.customId.startsWith('ruugame_roll_')) {
        return await handleRuuGameRoll(interaction);
      }
    }

    // Handle Chest buttons
    if (interaction.customId.startsWith('chest_claim_')) {
      return await handleChestClaim(interaction);
    }

    // Handle Minigame buttons
    if (interaction.customId.startsWith('minigame_')) {
      if (interaction.customId.startsWith('minigame_join_')) {
        return await handleMinigameJoin(interaction);
      } else if (interaction.customId.startsWith('minigame_status_')) {
        return await handleMinigameStatus(interaction);
      }
    }

    if ([
      'sync-yes',
      'sync-no',
      'confirm',
      'cancel',
      'view',
      'job-select',
      'job-page'
    ].includes(action)) {
      return await handleButtonInteraction(interaction);
    }

    if (['sneak', 'distract', 'corner', 'rush', 'glide'].includes(action)) {
      return await handleMountComponentInteraction(interaction);
    }

    if (action === 'tame') return await handleTameInteraction(interaction);
    if (action === 'use-item') return await handleUseItemInteraction(interaction);
    if (action === 'pay-traits') return await handleTraitPaymentInteraction(interaction);
    if (action === 'trait-select') return await handleTraitSelection(interaction);
    if (action === 'register-mount') return await handleRegisterMountModal(interaction);
    if (interaction.isModalSubmit()) return await handleModalSubmission(interaction);

    if (action === 'vending_view') {
      const [, villageKey] = interaction.customId.split('|');
      return await handleVendingViewVillage(interaction, villageKey);
    }

    if (interaction.customId.startsWith('vending_view_')) {
      const villageKey = interaction.customId.replace('vending_view_', '');
      return await handleVendingViewVillage(interaction, villageKey);
    }

    if (interaction.customId.startsWith('vending_sync_')) {
      return await handleSyncButton(interaction);
    }

    // Handle pouch upgrade buttons
    if (interaction.customId.startsWith('confirm_pouch_upgrade_')) {
      return await handlePouchUpgradeConfirm(interaction);
    }

    if (interaction.customId === 'cancel_pouch_upgrade' || interaction.customId.startsWith('cancel_pouch_upgrade_')) {
      return await handlePouchUpgradeCancel(interaction);
    }

    // Handle rest spot buttons
    if (interaction.customId.startsWith('restSpot_')) {
      return await handleRestSpotChoice(interaction);
    }

    // Handle crafting material selection
    if (interaction.customId.startsWith('crafting-material|')) {
      return await handleCraftingMaterialSelection(interaction);
    }

    // Handle crafting cancel
    if (interaction.customId.startsWith('crafting-cancel|')) {
      return await handleCraftingCancel(interaction);
    }

  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Failed to handle component: ${error.message}`);
    
    try {
      // Only try to reply if the interaction hasn't been handled yet
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your interaction.**',
          flags: 64
        });
      } else if (interaction.replied) {
        // Try followUp if already replied
        await interaction.followUp({
          content: '❌ **An error occurred while processing your interaction.**',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send component error response: ${replyError.message}`);
    }
  } finally {
    // Clean up any RuuGame interactions that might have been processed
    if (interaction.customId.startsWith('ruugame_')) {
      const interactionId = `${interaction.id}_${interaction.user.id}`;
      if (processedInteractions.has(interactionId)) {
        processedInteractions.delete(interactionId);
      }
    }
  }
}

// =============================================================================
// ------------------- Rest Spot Handler -------------------
// =============================================================================

// ------------------- Function: handleRestSpotChoice -------------------
// Handles rest spot button choice for Level 3 villages
async function handleRestSpotChoice(interaction) {
  try {
    if (!interaction.isButton()) {
      return;
    }

    // Parse custom ID: restSpot_${villageName}_${characterId}_${choiceType}
    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
      return interaction.reply({
        content: '❌ **Invalid rest spot interaction.**',
        flags: 64
      });
    }

    const villageName = parts[1]; // Rudania, Inariko, or Vhintl
    const characterId = parts[2];
    const choiceType = parts[3]; // stamina or hearts

    // Verify the character belongs to the user
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return interaction.reply({
        content: '❌ **Character not found.**',
        flags: 64
      });
    }

    if (character.userId !== interaction.user.id) {
      return interaction.reply({
        content: '❌ **This rest spot choice is not for your character.**',
        flags: 64
      });
    }

    // Fetch village to verify level
    const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
    if (!village) {
      return interaction.reply({
        content: `❌ **Village "${villageName}" not found.**`,
        flags: 64
      });
    }

    if (village.level < 3) {
      return interaction.reply({
        content: '❌ **This choice is only available in Level 3 villages.**',
        flags: 64
      });
    }

    // Check cooldown (reuse logic from village.js)
    const now = new Date();
    const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0)); // 8am EST
    if (now < rollover) {
      rollover.setUTCDate(rollover.getUTCDate() - 1);
    }

    const cooldownKey = `restSpot_${villageName}`;
    const lastUse = character.dailyRoll?.get(cooldownKey);
    if (lastUse) {
      const lastUseDate = new Date(lastUse);
      if (lastUseDate >= rollover) {
        return interaction.reply({
          content: '❌ **You have already used the rest spot today. Cooldown resets at 8am EST.**',
          flags: 64
        });
      }
    }

    // Apply healing based on choice (50% chance)
    const success = Math.random() < 0.5;
    let restored = 0;
    let restoreType = '';
    let restoreEmoji = '';

    if (choiceType === 'stamina') {
      if (character.currentStamina >= character.maxStamina) {
        return interaction.reply({
          content: '❌ **You are already at full stamina.**',
          flags: 64
        });
      }
      if (success) {
        restored = 1;
        restoreType = 'stamina';
        restoreEmoji = '🟩';
        await recoverStamina(character._id, restored);
      }
    } else if (choiceType === 'hearts') {
      if (character.currentHearts >= character.maxHearts) {
        return interaction.reply({
          content: '❌ **You are already at full hearts.**',
          flags: 64
        });
      }
      if (success) {
        restored = 2;
        restoreType = 'hearts';
        restoreEmoji = '❤️';
        const maxRestore = character.maxHearts - character.currentHearts;
        const actualRestore = Math.min(restored, maxRestore);
        await recoverHearts(character._id, actualRestore);
        restored = actualRestore;
      }
    } else {
      return interaction.reply({
        content: '❌ **Invalid choice type.**',
        flags: 64
      });
    }

    // Update cooldown
    if (!character.dailyRoll) {
      character.dailyRoll = new Map();
    }
    character.dailyRoll.set(cooldownKey, new Date().toISOString());
    character.markModified('dailyRoll'); // Required for Mongoose to track Map changes
    await character.save();

    // ------------------- Level 3 Rest Spot Special Effects -------------------
    // Debuff Removal: Level 3 rest spots automatically remove active debuffs
    let debuffRemoved = false;
    if (character.debuff?.active) {
      character.debuff.active = false;
      character.debuff.endDate = null;
      debuffRemoved = true;
      await character.save();
    }

    // Blight Blessing: 25% chance to reduce blight stage by 1 or completely heal it
    let blightBlessingResult = null;
    if (character.blighted && character.blightStage > 0) {
      const blessingRoll = Math.random();
      if (blessingRoll < 0.25) {
        // 25% chance triggered - decide between reduce stage or full heal (50/50)
        const healOrReduce = Math.random();
        if (healOrReduce < 0.5 || character.blightStage === 1) {
          // Full heal (or stage 1 -> 0)
          try {
            const { client } = require('../index.js');
            await completeBlightHealing(character, interaction, client);
            blightBlessingResult = { type: 'healed', stage: 0 };
          } catch (healError) {
            console.error(`[componentHandler.js]: ❌ Error in completeBlightHealing: ${healError.message}`);
            // Fallback: manually set blight to false
            character.blighted = false;
            character.blightStage = 0;
            character.blightEffects = {
              rollMultiplier: 1.0,
              noMonsters: false,
              noGathering: false
            };
            await character.save();
            blightBlessingResult = { type: 'healed', stage: 0 };
          }
        } else {
          // Reduce stage by 1
          const previousStage = character.blightStage;
          character.blightStage -= 1;
          
          // Update blight effects based on new stage
          character.blightEffects = {
            rollMultiplier: character.blightStage === 2 ? 1.5 : 1.0,
            noMonsters: character.blightStage >= 3,
            noGathering: character.blightStage >= 4
          };
          
          // If stage reached 0, fully remove blight using completeBlightHealing for proper cleanup
          if (character.blightStage === 0) {
            try {
              const { client } = require('../index.js');
              await completeBlightHealing(character, interaction, client);
              blightBlessingResult = { type: 'healed', stage: 0 };
            } catch (healError) {
              console.error(`[componentHandler.js]: ❌ Error in completeBlightHealing after stage reduction: ${healError.message}`);
              // Fallback: manually set blight to false
              character.blighted = false;
              character.blightedAt = null;
              await character.save();
              blightBlessingResult = { type: 'healed', stage: 0 };
            }
          } else {
            blightBlessingResult = { type: 'reduced', previousStage, newStage: character.blightStage };
            await character.save();
          }
        }
      }
    }

    // Get theme and images
    const VILLAGE_IMAGES = {
      Rudania: {
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_rudania_.png',
        banner: VILLAGE_BANNERS.Rudania,
      },
      Inariko: {
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_inariko_.png',
        banner: VILLAGE_BANNERS.Inariko,
      },
      Vhintl: {
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_vhintl_.png',
        banner: VILLAGE_BANNERS.Vhintl,
      },
    };

    const themes = {
      'Rudania': { emoji: '🔥', name: 'Hot Springs', description: 'natural geothermal pools' },
      'Inariko': { emoji: '💧', name: 'Cleansing Pool', description: 'purifying water source' },
      'Vhintl': { emoji: '🍃', name: 'Sacred Grove', description: 'restorative forest clearing' }
    };
    const theme = themes[villageName] || themes['Rudania'];

    // Refresh character to get updated values
    const updatedCharacter = await fetchCharacterById(characterId);

    // Build description with all effects
    let description = success
      ? `**${updatedCharacter.name}** rests in the ${theme.description}...\n\n` +
        `${restoreEmoji} **+${restored} ${restoreType} restored!**\n` +
        `**Current ${restoreType === 'stamina' ? 'Stamina' : 'Hearts'}:** ${restoreType === 'stamina' ? updatedCharacter.currentStamina : updatedCharacter.currentHearts}/${restoreType === 'stamina' ? updatedCharacter.maxStamina : updatedCharacter.maxHearts}`
      : `**${updatedCharacter.name}** rests in the ${theme.description}, but the restorative energies don't respond this time...\n\n` +
        `❌ **No restoration occurred (50% chance failed).**`;

    // Add debuff removal message
    if (debuffRemoved) {
      description += `\n\n💧 **The sacred waters cleanse all afflictions.**\n✅ **Debuff removed!**`;
    }

    // Add blight blessing message
    if (blightBlessingResult) {
      if (blightBlessingResult.type === 'healed') {
        description += `\n\n✨ **The dragon/oracle has blessed this place.**\n🩹 **Blight fully healed!** Your character is no longer blighted.`;
      } else if (blightBlessingResult.type === 'reduced') {
        description += `\n\n✨ **The dragon/oracle has blessed this place.**\n📉 **Blight stage reduced!** Stage ${blightBlessingResult.previousStage} → Stage ${blightBlessingResult.newStage}`;
      }
    }

    description += `\n\n*You can use the rest spot again tomorrow at 8am EST.*`;

    // Create response embed
    const embed = new EmbedBuilder()
      .setTitle(`${theme.emoji} ${villageName} ${theme.name}`)
      .setDescription(description)
      .setColor(village.color)
      .setThumbnail(VILLAGE_IMAGES[villageName]?.thumbnail || '')
      .setImage(VILLAGE_IMAGES[villageName]?.banner || 'https://storage.googleapis.com/tinglebot/Graphics/border.png');

    return interaction.update({ embeds: [embed], components: [] });
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error in handleRestSpotChoice: ${error.message}`);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your rest spot choice.**',
          flags: 64
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while processing your rest spot choice.**',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send rest spot error response: ${replyError.message}`);
    }
  }
}

// =============================================================================
// ------------------- Crafting Material Selection Handlers -------------------
// =============================================================================

// ------------------- Function: handleCraftingMaterialSelection -------------------
// Handles user selection of materials for crafting
async function handleCraftingMaterialSelection(interaction) {
  try {
    if (!interaction.isStringSelectMenu()) return;

    const [, selectionId] = interaction.customId.split('|');
    console.log(`[componentHandler.js] [CRFT] handleCraftingMaterialSelection called - selectionId: ${selectionId}, User: ${interaction.user.tag}`);
    const TempData = require('@/models/TempDataModel');
    const craftingState = await TempData.findByTypeAndKey('craftingMaterialSelection', selectionId);

    if (!craftingState || !craftingState.data) {
      console.log(`[componentHandler.js] [CRFT] ❌ Crafting material selection state NOT FOUND - selectionId: ${selectionId}, State exists: ${!!craftingState}`);
      return interaction.reply({
        content: '❌ **Crafting selection expired or not found. Please start crafting again.**',
        flags: 64
      });
    }
    console.log(`[componentHandler.js] [CRFT] ✅ Crafting material selection state found - selectionId: ${selectionId}, Material: ${craftingState.data.materialName}, Required: ${craftingState.data.requiredQuantity}, Selected so far: ${craftingState.data.selectedCount || 0}`);

    const state = craftingState.data;
    
    // Verify user matches
    if (state.userId !== interaction.user.id) {
      return interaction.reply({
        content: '❌ **This selection is not for you.**',
        flags: 64
      });
    }

    const selectedValues = interaction.values;
    if (!selectedValues || selectedValues.length === 0) {
      return interaction.reply({
        content: '❌ **Please select at least one item.**',
        flags: 64
      });
    }

    // Sequential selection: user selects one item at a time (1/3, 2/3, 3/3, etc.)
    if (selectedValues.length !== 1) {
      return interaction.reply({
        content: '❌ **Please select exactly one item.**',
        flags: 64
      });
    }

    const selectedValue = selectedValues[0];
    const [itemId, itemName, itemQuantity] = selectedValue.split('|');
    
    // Validate parsed values
    if (!itemId || !itemName || !itemQuantity) {
      return interaction.reply({
        content: '❌ **Invalid selection. Please try again.**',
        flags: 64
      });
    }
    
    const qty = parseInt(itemQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return interaction.reply({
        content: '❌ **Invalid quantity. Please try again.**',
        flags: 64
      });
    }

    // Initialize selectedCount and selectedItemsSoFar if not present (for backward compatibility)
    if (typeof state.selectedCount === 'undefined') {
      state.selectedCount = 0;
      state.selectedItemsSoFar = [];
    }

    // Add this selection to the list
    state.selectedCount += 1;
    state.selectedItemsSoFar.push({
      itemId,
      itemName,
      quantity: qty,
      value: selectedValue
    });

    // Get fresh inventory to update available items
    const { fetchCharacterById, getCharacterInventoryCollection } = require('@/database/db');
    const character = await fetchCharacterById(state.characterId);
    
    if (!character) {
      return interaction.reply({
        content: '❌ **Character not found.**',
        flags: 64
      });
    }

    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventory = await inventoryCollection.find().toArray();

    // Count how many times each item was selected
    const selectionCounts = new Map();
    state.selectedItemsSoFar.forEach(sel => {
      const key = sel.itemId || sel.itemName;
      selectionCounts.set(key, (selectionCounts.get(key) || 0) + 1);
    });

    // Rebuild availableItems from fresh inventory instead of decrementing from cached state
    // This ensures the display accurately reflects what's in the database
    const generalCategories = require('@/models/GeneralItemCategories');
    const isGeneralCategory = generalCategories[state.materialName];
    
    let filteredInventoryItems = [];
    if (isGeneralCategory) {
      // Filter inventory items that match the general category
      filteredInventoryItems = inventory.filter(item => {
        const categoryItems = generalCategories[state.materialName];
        return categoryItems && categoryItems.includes(item.itemName);
      });
    } else {
      // Filter inventory items that match the exact material name
      filteredInventoryItems = inventory.filter(item => 
        item.itemName.toLowerCase() === state.materialName.toLowerCase()
      );
    }

    // Build updated availableItems from fresh inventory, accounting for selections
    const updatedAvailableItems = filteredInventoryItems
      .map(invItem => {
        const itemId = invItem._id.toString();
        const itemName = invItem.itemName;
        const dbQuantity = typeof invItem.quantity === 'number' 
          ? (isNaN(invItem.quantity) ? 0 : invItem.quantity)
          : (invItem.quantity !== null && invItem.quantity !== undefined 
            ? (isNaN(parseInt(invItem.quantity, 10)) ? 0 : parseInt(invItem.quantity, 10))
            : 0);
        
        // Count how many times this specific item was selected
        const timesSelected = selectionCounts.get(itemId) || 0;
        
        // Calculate available quantity: database quantity minus selections
        const availableQty = Math.max(0, dbQuantity - timesSelected);
        
        return {
          _id: itemId,
          itemName: itemName,
          quantity: availableQty
        };
      })
      .filter(item => item.quantity > 0); // Remove items with 0 quantity

    // Check if we need more selections
    const stillNeeded = state.requiredQuantity - state.selectedCount;
    
    if (stillNeeded > 0) {
      // More items needed - show next selection screen
      const progressText = `${state.selectedCount + 1}/${state.requiredQuantity}`;
      
      // Update state
      state.availableItems = updatedAvailableItems;
      state.inventory = inventory.map(item => ({
        _id: item._id.toString(),
        itemName: item.itemName,
        quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity, 10) || 0
      }));

      await TempData.findOneAndUpdate(
        { type: 'craftingMaterialSelection', key: state.selectionId },
        {
          $set: {
            'data.selectedCount': state.selectedCount,
            'data.selectedItemsSoFar': state.selectedItemsSoFar,
            'data.availableItems': updatedAvailableItems,
            'data.inventory': state.inventory
          }
        },
        { new: true }
      );

      // Create next selection menu
      const { createMaterialSelectionMenu } = require('@/utils/inventoryUtils');
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
      
      const selectMenu = createMaterialSelectionMenu(
        state.materialName, 
        updatedAvailableItems, 
        state.requiredQuantity, 
        `crafting-material|${state.selectionId}|${state.materialName}`,
        state.selectedCount
      );
      
      const categoryDescription = isGeneralCategory
        ? `Please select an item for **${state.materialName}** ${progressText}\n\n**Required:** ${state.requiredQuantity} total\n**Selected so far:** ${state.selectedCount} (${state.selectedItemsSoFar.map(s => s.itemName).join(', ')})\n**Still needed:** ${stillNeeded}`
        : `Please select an item for **${state.materialName}** ${progressText}\n\n**Required:** ${state.requiredQuantity} total\n**Selected so far:** ${state.selectedCount}\n**Still needed:** ${stillNeeded}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00CED1)
        .setTitle(`📦 Select Materials ${progressText}`)
        .setDescription(categoryDescription)
        .setFooter({ text: `Select one item (${state.selectedCount + 1} of ${state.requiredQuantity})` })
        .setTimestamp();

      const cancelButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`crafting-cancel|${state.selectionId}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.update({
        embeds: [embed],
        components: [selectMenu, cancelButton]
      });
      
      return; // Wait for next selection
    }

    // All items selected - process and continue
    // Update the message to show processing, removing the embed and components
    console.log(`[componentHandler.js] [CRFT] All items selected for ${state.materialName} - Ready to process, selectionId: ${selectionId}`);
    await interaction.update({
      content: `✅ **Selected all ${state.requiredQuantity} items for ${state.materialName}. Processing...**`,
      embeds: [],
      components: []
    });

    // Fetch the message reference so we can edit it later
    const processingMessage = await interaction.fetchReply();

    // CHECK CRAFTING STATE VALIDITY BEFORE PROCESSING MATERIALS
    // This prevents materials from being consumed if the crafting state has expired
    // Use craftingContinueSelectionId if available, otherwise use selectionId
    const stateCheckId = state.craftingContinueSelectionId || selectionId;
    console.log(`[componentHandler.js] [CRFT] First state check - selectionId: ${selectionId}, craftingContinueSelectionId: ${state.craftingContinueSelectionId}, stateCheckId: ${stateCheckId}, Character: ${character.name}, Material: ${state.materialName}`);
    const craftingContinueState = await TempData.findByTypeAndKey('craftingContinue', stateCheckId);
    if (!craftingContinueState || !craftingContinueState.data) {
      console.log(`[componentHandler.js] [CRFT] ❌ FIRST CHECK FAILED - stateCheckId: ${stateCheckId}, State exists: ${!!craftingContinueState}, Has data: ${!!(craftingContinueState?.data)}`);
      if (craftingContinueState) {
        console.log(`[componentHandler.js] [CRFT] State details - expiresAt: ${craftingContinueState.expiresAt}, current time: ${new Date()}, expired: ${new Date(craftingContinueState.expiresAt) < new Date()}`);
      }
      return interaction.followUp({
        content: '❌ **Crafting state expired. Please start crafting again.**',
        flags: 64
      });
    }
    console.log(`[componentHandler.js] [CRFT] ✅ FIRST CHECK PASSED - stateCheckId: ${stateCheckId}, ExpiresAt: ${craftingContinueState.expiresAt}, CurrentTime: ${new Date()}`);

    // Process all selected items
    const { continueProcessMaterials, addItemInventoryDatabase } = require('@/utils/inventoryUtils');
    
    // Update state with fresh inventory - ensure quantities are numbers
    state.inventory = inventory.map(item => ({
      _id: item._id.toString(),
      itemName: item.itemName,
      quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity, 10) || 0
    }));

    // Convert selectedItemsSoFar to format expected by continueProcessMaterials
    const selectedItems = state.selectedItemsSoFar.map(sel => sel.value);
    console.log(`[componentHandler.js] [CRFT] Calling continueProcessMaterials - ${selectedItems.length} selected items, selectionId: ${selectionId}`);
    const result = await continueProcessMaterials(interaction, character, selectedItems, craftingState);
    console.log(`[componentHandler.js] [CRFT] continueProcessMaterials returned - type: ${typeof result}, status: ${result?.status}, isArray: ${Array.isArray(result)}`);

    if (result === 'canceled') {
      console.log(`[componentHandler.js] [CRFT] Crafting canceled by continueProcessMaterials`);
      return interaction.followUp({
        content: '❌ **Crafting canceled due to insufficient materials.**',
        flags: 64
      });
    }

    // Handle expired state - materials should not have been removed due to validation in continueProcessMaterials
    if (result && typeof result === 'object' && result.status === 'expired') {
      console.log(`[componentHandler.js] [CRFT] ❌ EXPIRED STATUS from continueProcessMaterials - selectionId: ${result.selectionId}`);
      return interaction.followUp({
        content: '❌ **Crafting state expired. Please start crafting again.**',
        flags: 64
      });
    }

    if (result && typeof result === 'object' && result.status === 'pending') {
      // More materials need selection - already handled in continueProcessMaterials
      return;
    }

    // DEFENSIVE CHECK: Verify state is still valid after material processing
    // This handles edge cases where state expires during material processing
    console.log(`[componentHandler.js] [CRFT] Second state check (defensive) - selectionId: ${selectionId}, stateCheckId: ${stateCheckId}`);
    const verifyState = await TempData.findByTypeAndKey('craftingContinue', stateCheckId);
    if (!verifyState || !verifyState.data) {
      console.log(`[componentHandler.js] [CRFT] ❌ SECOND CHECK FAILED - selectionId: ${selectionId}, State exists: ${!!verifyState}, Has data: ${!!(verifyState?.data)}`);
      if (verifyState) {
        console.log(`[componentHandler.js] [CRFT] State details - expiresAt: ${verifyState.expiresAt}, current time: ${new Date()}, expired: ${new Date(verifyState.expiresAt) < new Date()}`);
      }
      // State expired during processing - refund all consumed materials
      if (Array.isArray(result) && result.length > 0) {
        console.log(`[componentHandler.js] [CRFT] Refunding ${result.length} materials`);
        for (const mat of result) {
          await addItemInventoryDatabase(character._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund - State Expired');
        }
      }
      return interaction.followUp({
        content: '❌ **Crafting state expired during processing. Materials have been refunded. Please start crafting again.**',
        flags: 64
      });
    }
    console.log(`[componentHandler.js] [CRFT] ✅ SECOND CHECK PASSED - selectionId: ${selectionId}, ExpiresAt: ${verifyState.expiresAt}`);

    // All materials processed - continue with crafting
    // Delete the material selection state
    await TempData.findOneAndDelete({ type: 'craftingMaterialSelection', key: selectionId });

    // Use the verified state data (using stateCheckId to get the correct craftingContinue state)
    const continueData = verifyState.data;
    
    // Continue the crafting process, passing the message to edit
    await continueCraftingProcess(interaction, character, result, continueData, processingMessage);

    // Delete the continuation state
    await TempData.findOneAndDelete({ type: 'craftingContinue', key: selectionId });

  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error handling crafting material selection: ${error.message}`);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your selection.**',
          flags: 64
        });
      } else {
        await interaction.followUp({
          content: '❌ **An error occurred while processing your selection.**',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send error response: ${replyError.message}`);
    }
  }
}

// ------------------- Function: continueCraftingProcess -------------------
// Continues the crafting process after material selection
async function continueCraftingProcess(interaction, character, materialsUsed, continueData, processingMessage = null) {
  try {
    const { 
      addItemInventoryDatabase, 
      removeItemInventoryDatabase 
    } = require('@/utils/inventoryUtils');
    const { 
      checkAndUseStamina 
    } = require('../modules/characterStatsModule');
    const { 
      applyCraftingQuantityBoost 
    } = require('../modules/boostIntegration');
    const { 
      clearBoostAfterUse, 
      getEffectiveJob 
    } = require('../commands/jobs/boosting');
    const { 
      createCraftingEmbed 
    } = require('../embeds/embeds');
    const { 
      fetchCharacterByName, 
      getCharacterInventoryCollection 
    } = require('@/database/db');
    const { 
      activateJobVoucher, 
      deactivateJobVoucher, 
      getJobVoucherErrorMessage 
    } = require('../modules/jobVoucherModule');
    const { info, success, error } = require('@/utils/logger');
    const { MessageFlags, EmbedBuilder } = require('discord.js');

    const freshCharacter = await fetchCharacterById(continueData.characterId);
    if (!freshCharacter) {
      return interaction.followUp({
        content: '❌ **Character not found.**',
        flags: 64
      });
    }

    // ------------------- Teacher Stamina: Booster must have 2nd voucher (used when boosted person crafts) -------------------
    let boosterCharacterForVoucher = null;
    if (continueData.teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
      boosterCharacterForVoucher = await fetchCharacterByName(freshCharacter.boostedBy);
      if (boosterCharacterForVoucher && getEffectiveJob(boosterCharacterForVoucher) === 'Teacher') {
        const boosterInvCollection = await getCharacterInventoryCollection(boosterCharacterForVoucher.name);
        const boosterInv = await boosterInvCollection.find().toArray();
        const boosterVoucherCount = (boosterInv || [])
          .filter(entry => entry.itemName && entry.itemName.trim().toLowerCase() === 'job voucher')
          .reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
        if (boosterVoucherCount < 1) {
          const voucherError = getJobVoucherErrorMessage('BOOSTER_NEEDS_VOUCHER_AT_CRAFT', { boosterName: boosterCharacterForVoucher.name });
          const voucherEmbed = new EmbedBuilder()
            .setTitle(voucherError.title)
            .setDescription(voucherError.description)
            .addFields((voucherError.fields || []).map(f => ({ name: f.name, value: f.value, inline: f.inline })))
            .setColor(voucherError.color || '#FF0000')
            .setTimestamp();
          return interaction.followUp({ embeds: [voucherEmbed], flags: [MessageFlags.Ephemeral] });
        }
      }
    }

    // ------------------- Deduct Stamina -------------------
    let updatedStamina;
    let teacherUpdatedStamina = null;
    try {
      if (continueData.teacherStaminaContribution > 0 && boosterCharacterForVoucher) {
        await removeItemInventoryDatabase(boosterCharacterForVoucher._id, 'Job Voucher', 1, interaction, 'Used for Teacher Crafting boost (2nd voucher, at craft)');
      }
      updatedStamina = await checkAndUseStamina(freshCharacter, continueData.crafterStaminaCost);
      success('CRFT', `Stamina deducted for ${freshCharacter.name} - remaining: ${updatedStamina}`);
      
      if (continueData.teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
          teacherUpdatedStamina = await checkAndUseStamina(boosterCharacter, continueData.teacherStaminaContribution);
          success('CRFT', `Teacher stamina deducted for ${boosterCharacter.name} - remaining: ${teacherUpdatedStamina}`);
        }
      }
    } catch (staminaErr) {
      error('CRFT', `Failed to deduct stamina: ${staminaErr.message}`);
      // Refund materials
      for (const mat of materialsUsed) {
        await addItemInventoryDatabase(freshCharacter._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund');
      }
      if (continueData.teacherStaminaContribution > 0 && boosterCharacterForVoucher) {
        await addItemInventoryDatabase(boosterCharacterForVoucher._id, 'Job Voucher', 1, interaction, 'Teacher crafting boost refund');
      }
      return interaction.followUp({
        content: `⚠️ **Crafting failed due to insufficient stamina. Materials have been refunded.**`,
        flags: [MessageFlags.Ephemeral]
      });
    }

    // ------------------- Calculate Final Crafted Quantity -------------------
    let craftedQuantity = continueData.quantity;
    craftedQuantity = await applyCraftingQuantityBoost(freshCharacter.name, craftedQuantity);

    // ------------------- Send Crafting Embed -------------------
    let embed;
    try {
      const jobForFlavorText = (continueData.jobVoucher && continueData.jobVoucherJob) ? continueData.jobVoucherJob : continueData.job || '';
      const priestBoostActive = continueData.staminaCost < continueData.originalStaminaCost;
      const staminaSavings = priestBoostActive ? continueData.originalStaminaCost - continueData.staminaCost : 0;
      
      let teacherBoostInfo = null;
      if (continueData.teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
          teacherBoostInfo = {
            teacherName: boosterCharacter.name,
            teacherStaminaUsed: continueData.teacherStaminaContribution,
            crafterStaminaUsed: continueData.crafterStaminaCost,
            totalStaminaCost: continueData.staminaCost
          };
        }
      }
      
      embed = await createCraftingEmbed(
        continueData.item, 
        freshCharacter, 
        continueData.flavorText, 
        materialsUsed, 
        craftedQuantity, 
        continueData.crafterStaminaCost, 
        updatedStamina,
        jobForFlavorText, 
        continueData.originalStaminaCost, 
        staminaSavings, 
        continueData.materialSavings, 
        teacherBoostInfo
      );
    } catch (embedError) {
      // Refund stamina
      await checkAndUseStamina(freshCharacter, -continueData.crafterStaminaCost);
      if (continueData.teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
          await checkAndUseStamina(boosterCharacter, -continueData.teacherStaminaContribution);
        }
      }
      // Refund materials
      for (const mat of materialsUsed) {
        await addItemInventoryDatabase(freshCharacter._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund');
      }
      if (continueData.teacherStaminaContribution > 0 && boosterCharacterForVoucher) {
        await addItemInventoryDatabase(boosterCharacterForVoucher._id, 'Job Voucher', 1, interaction, 'Teacher crafting boost refund');
      }
      return interaction.followUp({
        content: '❌ **An error occurred while generating the crafting result. Your materials and stamina have been refunded.**',
        flags: [MessageFlags.Ephemeral]
      });
    }

    // ------------------- Add Crafted Item to Inventory -------------------
    let fortuneTellerBoostTag = null;
    if (freshCharacter.boostedBy) {
      const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
      if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Fortune Teller') {
        fortuneTellerBoostTag = 'Fortune Teller';
      }
    }
    
    const craftedAt = new Date();
    await addItemInventoryDatabase(freshCharacter._id, continueData.itemName, craftedQuantity, interaction, 'Crafting', craftedAt, fortuneTellerBoostTag);

    // ------------------- Clear Boost After Use -------------------
    await clearBoostAfterUse(freshCharacter, {
      client: interaction.client,
      context: 'crafting'
    });

    // Update the processing message to show final result, removing any embeds
    // We edit the same message that was updated earlier to avoid creating duplicates
    const successMessage = `✅ **Crafting complete! Successfully crafted ${continueData.quantity} "${continueData.itemName}".**`;
    if (processingMessage) {
      try {
        // Edit the message to show completion, explicitly clearing embeds
        await processingMessage.edit({ 
          content: successMessage,
          embeds: [], // Explicitly remove any existing embeds
          components: [] // Ensure no components remain
        });
      } catch (editError) {
        // If editing fails (e.g., message was deleted), try using interaction.editReply as fallback
        try {
          await interaction.editReply({ 
            content: successMessage,
            embeds: [],
            components: []
          });
        } catch (editReplyError) {
          // Last resort: send as followUp only if both edits fail
          await interaction.followUp({ 
            content: successMessage, 
            flags: [MessageFlags.Ephemeral] 
          });
        }
      }
    } else {
      // Fallback: send new message if no processing message exists
      await interaction.followUp({ 
        content: successMessage, 
        flags: [MessageFlags.Ephemeral] 
      });
    }
    await interaction.followUp({ embeds: [embed], ephemeral: false });

    // ------------------- Activate and Deactivate Job Voucher -------------------
    if (continueData.jobVoucher && continueData.jobVoucherJob) {
      const { fetchJobVoucherItem } = require('../modules/jobVoucherModule');
      const jobVoucherResult = await fetchJobVoucherItem();
      if (jobVoucherResult && jobVoucherResult.success) {
        const activationResult = await activateJobVoucher(freshCharacter, continueData.jobVoucherJob, jobVoucherResult.item, 1, interaction);
        if (activationResult.success) {
          await deactivateJobVoucher(freshCharacter._id, { afterUse: true });
        }
      }
    }
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error continuing crafting process: ${error.message}`);
    await interaction.followUp({
      content: '❌ **An error occurred while completing the crafting process.**',
      flags: 64
    });
  }
}

// ------------------- Function: handleCraftingCancel -------------------
// Handles cancellation of crafting material selection
async function handleCraftingCancel(interaction) {
  try {
    const [, selectionId] = interaction.customId.split('|');
    const TempData = require('@/models/TempDataModel');
    
    await TempData.findOneAndDelete({ type: 'craftingMaterialSelection', key: selectionId });

    await interaction.update({
      content: '❌ **Crafting canceled.**',
      components: []
    });
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Error handling crafting cancel: ${error.message}`);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **Crafting canceled.**',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error(`[componentHandler.js]: ❌ Failed to send cancel response: ${replyError.message}`);
    }
  }
}

// =============================================================================
// ------------------- Chest Claim Handler -------------------
// =============================================================================

// ------------------- Function: handleChestClaim -------------------
// Handles chest item claiming when user clicks the button - rolls d20, awards item on 20
async function handleChestClaim(interaction) {
  try {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const chestId = interaction.customId.replace('chest_claim_', '');
    
    const TempData = require('@/models/TempDataModel');
    const User = require('@/models/UserModel');
    const { addItemInventoryDatabase } = require('@/utils/inventoryUtils');

    // Find chest data FIRST (before deferring)
    const chestDataDoc = await TempData.findByTypeAndKey('temp', `chest_${chestId}`);
    
    if (!chestDataDoc || !chestDataDoc.data) {
      return await interaction.reply({
        content: '❌ Chest not found or has expired.',
        flags: 64,
        ephemeral: true
      });
    }

    let chestData = chestDataDoc.data;

    // Check if chest has expired
    if (new Date() > new Date(chestData.expiresAt)) {
      return await interaction.reply({
        content: '❌ This chest has expired.',
        flags: 64,
        ephemeral: true
      });
    }

    // Check if user already claimed an item (BEFORE cooldown checks - they can't roll at all)
    const userClaim = chestData.claims.find(c => c.userId === userId);
    if (userClaim) {
      return await interaction.reply({
        content: `❌ You have already claimed an item from this chest!\n\n**You received:** ${userClaim.itemName}\n**Added to:** ${userClaim.characterName}'s inventory`,
        flags: 64,
        ephemeral: true
      });
    }

    // Check if all items are claimed
    const allItemsClaimedBefore = chestData.items.every(item => item.claimed);
    if (allItemsClaimedBefore) {
      return await interaction.reply({
        content: '❌ All items from this chest have been claimed.',
        flags: 64,
        ephemeral: true
      });
    }

    // Validate user setup (similar to ruugame)
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return await interaction.reply({
        content: '❌ User not found.',
        flags: 64,
        ephemeral: true
      });
    }

    const characters = await Character.find({ userId: userId });
    if (characters.length === 0) {
      return await interaction.reply({
        content: '❌ You need to have at least one character to claim items.',
        flags: 64,
        ephemeral: true
      });
    }

    // Check cooldowns BEFORE deferring (same as ruugame)
    const now = new Date();
    
    // Initialize cooldown tracking if not present (for backwards compatibility)
    if (!chestData.lastGlobalRollTime) {
      chestData.lastGlobalRollTime = null;
    }
    if (!chestData.playerRollTimes) {
      chestData.playerRollTimes = {};
    }
    
    // Check global cooldown
    if (chestData.lastGlobalRollTime && (now - new Date(chestData.lastGlobalRollTime)) < (GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000)) {
      const remainingSeconds = Math.ceil((GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000 - (now - new Date(chestData.lastGlobalRollTime))) / 1000);
      
      return await interaction.reply({
        content: `⏰ Please wait ${remainingSeconds} seconds before anyone can roll again.`,
        flags: 64,
        ephemeral: true
      });
    }
    
    // Check individual player cooldown
    const playerLastRollTime = chestData.playerRollTimes[userId];
    if (playerLastRollTime && (now - new Date(playerLastRollTime)) < (GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000)) {
      const remainingSeconds = Math.ceil((GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000 - (now - new Date(playerLastRollTime))) / 1000);
      
      return await interaction.reply({
        content: `⏰ Please wait ${remainingSeconds} seconds before rolling again.`,
        flags: 64,
        ephemeral: true
      });
    }

    // Only defer the interaction if we're actually going to process the roll
    await interaction.deferUpdate();

    // Roll d5
    const roll = Math.floor(Math.random() * 5) + 1; // 1-5
    
    // Add roll to history
    if (!chestData.rollHistory) {
      chestData.rollHistory = [];
    }
    chestData.rollHistory.push({
      discordId: userId,
      username: username,
      avatarUrl: interaction.user.displayAvatarURL({ dynamic: true }),
      roll: roll,
      rolledAt: now
    });
    
    // Update cooldown timestamps (same as ruugame)
    chestData.lastGlobalRollTime = now;
    chestData.playerRollTimes[userId] = now;
    
    // Save cooldown updates and roll history to database
    await TempData.findOneAndUpdate(
      { type: 'temp', key: `chest_${chestId}` },
      { $set: { 
        'data.lastGlobalRollTime': chestData.lastGlobalRollTime,
        'data.playerRollTimes': chestData.playerRollTimes,
        'data.rollHistory': chestData.rollHistory
      } }
    );
    
    const itemsRemaining = chestData.items.filter(item => !item.claimed).length;
    let selectedItem = null;
    let randomCharacter = null;
    let itemAwarded = false;
    let blightMessage = null;

    // Only award item if roll is 5
    if (roll === 5) {
      // Reload chest data to get latest state (prevent race conditions)
      const latestChestDataDoc = await TempData.findByTypeAndKey('temp', `chest_${chestId}`);
      if (!latestChestDataDoc || !latestChestDataDoc.data) {
        return await interaction.followUp({
          content: '❌ Chest data not found. Please try again.',
          flags: 64
        });
      }
      
      // Use latest chest data
      const latestChestData = latestChestDataDoc.data;
      
      // Initialize cooldown data in latestChestData if missing (backwards compatibility)
      if (!latestChestData.lastGlobalRollTime) {
        latestChestData.lastGlobalRollTime = null;
      }
      if (!latestChestData.playerRollTimes) {
        latestChestData.playerRollTimes = {};
      }
      if (!latestChestData.rollHistory) {
        latestChestData.rollHistory = [];
      }
      
      // Preserve the roll we just added to chestData
      if (chestData.rollHistory && chestData.rollHistory.length > 0) {
        const latestRoll = chestData.rollHistory[chestData.rollHistory.length - 1];
        // Check if this roll is already in latestChestData
        const rollExists = latestChestData.rollHistory.some(r => 
          r.discordId === latestRoll.discordId && 
          r.roll === latestRoll.roll &&
          Math.abs(new Date(r.rolledAt) - new Date(latestRoll.rolledAt)) < 2000
        );
        if (!rollExists) {
          latestChestData.rollHistory.push(latestRoll);
        }
      }
      
      // Get available items from latest data
      const availableItems = latestChestData.items.filter(item => !item.claimed);
      
      if (availableItems.length === 0) {
        return await interaction.followUp({
          content: '❌ No available items found in chest.',
          flags: 64
        });
      }

      // Randomly select from available items
      selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
      
      // Double-check the selected item is still available (race condition protection)
      const itemInChest = latestChestData.items.find(item => item.index === selectedItem.index);
      if (!itemInChest || itemInChest.claimed) {
        // Item was claimed by someone else, try again with remaining items
        const stillAvailable = latestChestData.items.filter(item => !item.claimed);
        if (stillAvailable.length === 0) {
          return await interaction.followUp({
            content: '❌ That item was just claimed by someone else. No items remaining.',
            flags: 64
          });
        }
        selectedItem = stillAvailable[Math.floor(Math.random() * stillAvailable.length)];
      }
      
      // Select random character
      randomCharacter = characters[Math.floor(Math.random() * characters.length)];

      // Mark item as claimed BEFORE adding to inventory (prevent double claims)
      const itemToClaim = latestChestData.items.find(item => item.index === selectedItem.index);
      if (itemToClaim && !itemToClaim.claimed) {
        itemToClaim.claimed = true;
        itemToClaim.claimedBy = username;
        itemToClaim.claimedByCharacter = randomCharacter.name; // Store character name
        
        latestChestData.claims.push({
          userId: userId,
          username: username,
          characterId: randomCharacter._id.toString(),
          characterName: randomCharacter.name,
          itemIndex: selectedItem.index,
          itemName: selectedItem.itemName
        });

        // Ensure roll history is preserved when updating
        if (!latestChestData.rollHistory) {
          latestChestData.rollHistory = [];
        }
        // Add current roll to history if not already there
        const currentRollInHistory = latestChestData.rollHistory.find(r => 
          r.discordId === userId && 
          Math.abs(new Date(r.rolledAt) - now) < 1000 // Within 1 second
        );
        if (!currentRollInHistory && chestData.rollHistory && chestData.rollHistory.length > 0) {
          const latestRoll = chestData.rollHistory[chestData.rollHistory.length - 1];
          if (latestRoll.discordId === userId && latestRoll.roll === roll) {
            latestChestData.rollHistory.push(latestRoll);
          }
        }
        
        // Update TempData atomically - mark item as claimed
        await TempData.findOneAndUpdate(
          { type: 'temp', key: `chest_${chestId}` },
          { $set: { data: latestChestData } },
          { new: true }
        );
        
        // Now add item to character's inventory
        try {
          await addItemInventoryDatabase(
            randomCharacter._id,
            selectedItem.itemName,
            1,
            interaction,
            'Chest Reward'
          );
          itemAwarded = true;
          
          // ------------------- Blight Chance Check -------------------
          // 1% chance to get blighted from opening a chest
          if (!randomCharacter.blighted && !randomCharacter.isModCharacter && Math.random() < 0.01) {
            try {
              // Use shared finalize helper - each step has its own try/catch for resilience
              const finalizeResult = await finalizeBlightApplication(
                randomCharacter,
                randomCharacter.userId,
                {
                  client: interaction.client,
                  guild: interaction.guild,
                  source: 'opening a chest',
                  alreadySaved: false
                }
              );
              
              console.log(`[componentHandler.js]: ✅ Blight applied to ${randomCharacter.name} (chest blight effect) - Saved: ${finalizeResult.characterSaved}, Role: ${finalizeResult.roleAdded}, User: ${finalizeResult.userFlagSet}, DM: ${finalizeResult.dmSent}`);
              
              blightMessage = 
                "\n\n<:blight_eye:805576955725611058> **Blight Infection!**\n\n" +
                `◈ Oh no... **${randomCharacter.name}** has been **blighted** by something inside the chest! ◈\n\n` +
                "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
                "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
                "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
                "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
              
              console.log(`[componentHandler.js]: 🧿 Character ${randomCharacter.name} was blighted by chest effect`);
              
            } catch (blightError) {
              console.error(`[componentHandler.js]: ❌ Error applying blight to ${randomCharacter.name}:`, blightError);
            }
          }
          
          // Update our local reference, preserving roll history
          chestData = latestChestData;
          // Ensure roll history is preserved
          if (chestData.rollHistory && chestData.rollHistory.length > 0 && latestChestData.rollHistory) {
            // Merge roll histories, keeping all unique rolls
            const mergedHistory = [...latestChestData.rollHistory];
            for (const roll of chestData.rollHistory) {
              const exists = mergedHistory.some(r => 
                r.discordId === roll.discordId && 
                r.roll === roll.roll &&
                Math.abs(new Date(r.rolledAt) - new Date(roll.rolledAt)) < 2000
              );
              if (!exists) {
                mergedHistory.push(roll);
              }
            }
            chestData.rollHistory = mergedHistory.sort((a, b) => new Date(a.rolledAt) - new Date(b.rolledAt));
          } else if (latestChestData.rollHistory) {
            chestData.rollHistory = latestChestData.rollHistory;
          }
        } catch (error) {
          console.error('[Chest] Error adding item to inventory:', error);
          // Rollback: unclaim the item if inventory add failed
          itemToClaim.claimed = false;
          itemToClaim.claimedBy = null;
          itemToClaim.claimedByCharacter = null;
          latestChestData.claims = latestChestData.claims.filter(c => c.userId !== userId);
          await TempData.findOneAndUpdate(
            { type: 'temp', key: `chest_${chestId}` },
            { $set: { data: latestChestData } },
            { new: true }
          );
          return await interaction.followUp({
            content: '❌ Error adding item to inventory. Please try again.',
            flags: 64
          });
        }
      } else {
        // Item was already claimed between our check and now
        return await interaction.followUp({
          content: '❌ That item was just claimed by someone else. Keep rolling!',
          flags: 64
        });
      }
    }

    // Create roll result embed with items list FIRST (like ruugame)
    const remainingAfter = chestData.items.filter(item => !item.claimed).length;
    const rollEmojis = getRollEmojis(roll);
    const rollEmbed = new EmbedBuilder()
      .setTitle(`🎲 Chest - ${username} rolled a ${rollEmojis}!`)
      .setDescription(`**Roll a 5 to claim one of the items!**\n*Item will be added to a random character's inventory!*`)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })) // User's avatar for roll results
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setColor(roll === 5 ? 0x00FF00 : 0xFFD700) // Green for 5, gold for other rolls
      .addFields(
        { 
          name: '📋 Chest Info', 
          value: `**Chest ID:** ${chestId}\n**Items Remaining:** ${remainingAfter}/${chestData.items.length}\n**Expires:** <t:${Math.floor(new Date(chestData.expiresAt).getTime() / 1000)}:R>`, 
          inline: false 
        },
        { 
          name: '🎲 Roll Result', 
          value: roll === 5 && itemAwarded 
            ? `${rollEmojis} 🎉 **Perfect 5!**\n\n🎁 **Item Awarded:** ${selectedItem.emoji} ${selectedItem.itemName}\n👤 **Added to:** ${randomCharacter.name}'s inventory${blightMessage || ''}`
            : `${rollEmojis}\n\n${remainingAfter > 0 ? `Keep rolling! ${remainingAfter} item${remainingAfter !== 1 ? 's' : ''} left!` : 'All items claimed!'}`,
          inline: false
        },
        { 
          name: '🎁 Available Items', 
          value: chestData.items.map(item => 
            item.claimed 
              ? `~~**${item.index}.** ${item.emoji} ${item.itemName}~~ ✅ *Claimed by ${item.claimedBy}* → ${item.claimedByCharacter || 'Unknown'}`
              : `**${item.index}.** ${item.emoji} ${item.itemName}`
          ).join('\n'),
          inline: false
        }
      )
      .setTimestamp(chestData.createdAt);

    // Randomly show GIF when rolling a 1 (30% chance)
    if (roll === 1 && Math.random() < 0.3) {
      rollEmbed.setImage('https://images-ext-1.discordapp.net/external/bRvP_21VaPFCTUfg1OE85vzIkv42UvzI5kgzgh8n8s4/https/media.tenor.com/Z_9PoTuClMIAAAPo/game-over-guardian.mp4');
      console.log(`[Chest] User ${username} (${userId}) rolled 1 on chest ${chestId} - GIF shown!`);
    }

    // Create button for roll result (same as main message)
    const rollResultButton = new ButtonBuilder()
      .setCustomId(`chest_claim_${chestId}`)
      .setLabel('Roll d5')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎲');

    // Disable button if all items are claimed (recalculate after potential updates)
    const allItemsClaimedForResult = chestData.items.every(item => item.claimed);
    if (allItemsClaimedForResult) {
      rollResultButton.setDisabled(true);
    }

    const rollResultButtons = new ActionRowBuilder()
      .addComponents(rollResultButton);

    // Send roll result embed - NEW embed posted every time (public, like ruugame)
    await interaction.followUp({
      embeds: [rollEmbed],
      components: [rollResultButtons]
    });

    // Only update main embed when items are claimed
    if (itemAwarded) {
      const itemsRemainingCount = chestData.items.filter(item => !item.claimed).length;
      
      // Fetch the original message to update it
      const channel = interaction.channel;
      let originalMessage = null;
      try {
        originalMessage = await channel.messages.fetch(chestData.messageId);
      } catch (error) {
        console.error('[Chest] Could not fetch original message:', error);
      }
      
      if (originalMessage) {
        const allItemsClaimed = itemsRemainingCount === 0;
        
        // Create button (disable only if all items are claimed)
        const claimButton = new ButtonBuilder()
          .setCustomId(`chest_claim_${chestId}`)
          .setLabel('Roll d5')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎲');
        
        if (allItemsClaimed) {
          claimButton.setDisabled(true);
          
          // Create special "All items claimed!" embed
          const allClaimedEmbed = new EmbedBuilder()
            .setTitle('🎁 Chest - All Items Claimed!')
            .setDescription('**All items from this chest have been claimed!**\n\n*Thanks for playing!*')
            .setThumbnail('https://static.wikia.nocookie.net/zelda_gamepedia_en/images/0/0f/MM3D_Chest.png/revision/latest/scale-to-width/360?cb=20201125233413')
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setColor(0x00FF00) // Green color
            .addFields(
              { 
                name: '📋 Chest Info', 
                value: `**Chest ID:** ${chestId}\n**Items Remaining:** 0/${chestData.items.length}\n**Expires:** <t:${Math.floor(new Date(chestData.expiresAt).getTime() / 1000)}:R>`, 
                inline: false 
              },
              { 
                name: '🎁 All Items', 
                value: chestData.items.map(item => 
                  `~~**${item.index}.** ${item.emoji} ${item.itemName}~~ ✅ *Claimed by ${item.claimedBy}* → ${item.claimedByCharacter || 'Unknown'}`
                ).join('\n'),
                inline: false
              }
            )
            .setTimestamp(chestData.createdAt)
            .setFooter({ text: 'Thanks for playing!' });
          
          const finalButtons = new ActionRowBuilder()
            .addComponents(claimButton);
          
          // Update main message with "all claimed" embed
          await originalMessage.edit({
            embeds: [allClaimedEmbed],
            components: [finalButtons]
          });
          
          // Create a new follow-up embed for "All Items Claimed!"
          const allClaimedFollowUpEmbed = new EmbedBuilder()
            .setTitle('🎁 ALL ITEMS CLAIMED!')
            .setDescription('**All items from this chest have been claimed! Here\'s who got what!**\n\n*Thanks for playing!*')
            .setThumbnail('https://static.wikia.nocookie.net/zelda_gamepedia_en/images/0/0f/MM3D_Chest.png/revision/latest/scale-to-width/360?cb=20201125233413')
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setColor(0x00FF00) // Green color
            .addFields(
              { 
                name: '📋 Chest Info', 
                value: `**Chest ID:** ${chestId}\n**Items Remaining:** 0/${chestData.items.length}\n**Expires:** <t:${Math.floor(new Date(chestData.expiresAt).getTime() / 1000)}:R>`, 
                inline: false 
              },
              { 
                name: '🎁 All Items - Who Got What!', 
                value: chestData.items.map(item => 
                  `**${item.index}.** ${item.emoji} ${item.itemName} → ✅ *Claimed by ${item.claimedBy}* → ${item.claimedByCharacter || 'Unknown'}`
                ).join('\n'),
                inline: false
              }
            )
            .setTimestamp(chestData.createdAt)
            .setFooter({ text: 'Thanks for playing!' });
          
          // Send new follow-up embed for "All Items Claimed!"
          await interaction.followUp({
            embeds: [allClaimedFollowUpEmbed],
            components: [] // No buttons on the follow-up message
          });
        } else {
          // Update main embed with updated items list (only when item is claimed)
          const mainEmbed = new EmbedBuilder()
            .setTitle('🎁 Chest - Roll a 5 to claim!')
            .setDescription(`**Roll a 5 to claim one of the items!**\n*Item will be added to a random character's inventory!*`)
            .setThumbnail('https://static.wikia.nocookie.net/zelda_gamepedia_en/images/0/0f/MM3D_Chest.png/revision/latest/scale-to-width/360?cb=20201125233413')
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setColor(0xFFD700) // Gold color
            .addFields(
              { 
                name: '📋 Chest Info', 
                value: `**Chest ID:** ${chestId}\n**Items Remaining:** ${itemsRemainingCount}/${chestData.items.length}\n**Expires:** <t:${Math.floor(new Date(chestData.expiresAt).getTime() / 1000)}:R>`, 
                inline: false 
              },
              { 
                name: '🎁 Available Items', 
                value: chestData.items.map(item => 
                  item.claimed 
                    ? `~~**${item.index}.** ${item.emoji} ${item.itemName}~~ ✅ *Claimed by ${item.claimedBy}* → ${item.claimedByCharacter || 'Unknown'}`
                    : `**${item.index}.** ${item.emoji} ${item.itemName}`
                ).join('\n'),
                inline: false
              }
            )
            .setTimestamp(chestData.createdAt);
          
          const buttons = new ActionRowBuilder()
            .addComponents(claimButton);
          
          // Update main message with updated items list
          await originalMessage.edit({
            embeds: [mainEmbed],
            components: [buttons]
          });
        }
      }
    }

    if (itemAwarded) {
      console.log(`[Chest] User ${username} (${userId}) rolled 5 and claimed item ${selectedItem.itemName} from chest ${chestId}`);
    } else {
      console.log(`[Chest] User ${username} (${userId}) rolled ${roll} (not 5) on chest ${chestId}`);
    }
  } catch (error) {
    console.error('[Chest] Error handling chest claim:', error);
    handleError(error, 'componentHandler.js');
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An error occurred while rolling.',
          flags: 64
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while rolling.',
          components: []
        });
      } else {
        await interaction.followUp({
          content: '❌ An error occurred while rolling.',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error('[Chest] Failed to send error response:', replyError);
    }
  }
}

// =============================================================================
// ------------------- Exports -------------------
// =============================================================================

module.exports = {
  handleComponentInteraction,
  handleButtonInteraction,
  getCancelButtonRow,
  getConfirmButtonRow,
  handleRuuGameRoll,
  createRuuGameEmbed,
  createRuuGameButtons,
  getRuuGameStatusColor,
  getRollEmojis,
  GAME_CONFIG,
  PRIZES,
  awardRuuGamePrize,
  handleMinigameJoin,
  handleMinigameStatus
};