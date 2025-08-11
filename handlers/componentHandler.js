// ============================================================================
// ------------------- Combined Component and Button Handler -------------------
// Handles button interactions and component logic like job selection, modals,
// syncing, art submissions, vending view, and mount traits.
// ============================================================================


// =============================================================================
// ------------------- Imports -------------------
// =============================================================================

// ------------------- Standard Libraries -------------------
const { handleError } = require('../utils/globalErrorHandler');

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
  getUserById
} = require('../database/db');

// ------------------- Database Models -------------------
const ItemModel = require('../models/ItemModel');
const RuuGame = require('../models/RuuGameModel');
const Character = require('../models/CharacterModel');

// ------------------- Embed and Command Imports -------------------
const {
  createCharacterEmbed,
  createCharacterGearEmbed,
  createArtSubmissionEmbed
} = require('../embeds/embeds');

// ------------------- Modules -------------------
const { getGeneralJobsPage, getJobPerk } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');
const { roles } = require('../modules/rolesModule');

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
const { handleVendingViewVillage, handleSyncButton } = require('./vendingHandler');

// ------------------- Utility Functions -------------------
const { 
  saveSubmissionToStorage, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  deleteSubmissionFromStorage,
  findLatestSubmissionIdForUser 
} = require('../utils/storage');

const {
  calculateTokens,
  generateTokenBreakdown
} = require('../utils/tokenUtils');

const { canChangeJob } = require('../utils/validation');

// ============================================================================
// ------------------- RuuGame Configuration -------------------
// Game settings and prize configuration
// =============================================================================
const GAME_CONFIG = {
  TARGET_SCORE: 20,
  DICE_SIDES: 20,
  SESSION_DURATION_HOURS: 24,
  MAX_PLAYERS: 10,
  ROLL_COOLDOWN_SECONDS: 10
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

    // First update the interaction
    await interaction.update({
      content: '✅ **You have confirmed your submission! Mods will review it shortly.**',
      components: [],
    });

    // Ensure all required fields are present
    const embedData = {
      ...submissionData,
      ...updates,
      userId: submissionData.userId || userId,
      username: submissionData.username || interaction.user.username,
      userAvatar: submissionData.userAvatar || interaction.user.displayAvatarURL(),
    };

    const embed = createArtSubmissionEmbed(embedData, user);
    // Post to specific submissions channel
    const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
    const sentMessage = await submissionsChannel.send({ embeds: [embed] });
    
    // Update with message URL
    const messageUrl = `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}`;
    await updateSubmissionData(submissionData.submissionId, {
      ...updates,
      messageUrl: messageUrl
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
        if (submissionData.collab && submissionData.collab !== 'N/A') {
          const splitTokens = Math.floor(totalTokens / 2);
          tokenDisplay = `${totalTokens} tokens (${splitTokens} each)`;
        }

        // Build notification fields dynamically
        const notificationFields = [
          { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: `${typeEmoji} Title`, value: submissionData.title || submissionData.fileName || 'Untitled', inline: true },
          { name: '💰 Token Amount', value: tokenDisplay, inline: true },
          { name: '🆔 Submission ID', value: `\`${submissionData.submissionId}\``, inline: true },
          { name: '🔗 View Submission', value: `[Click Here](${messageUrl})`, inline: true }
        ];

        // Add collaboration field if present
        if (submissionData.collab && submissionData.collab !== 'N/A') {
          const collabDisplay = submissionData.collab.startsWith('<@') && submissionData.collab.endsWith('>') ? submissionData.collab : `@${submissionData.collab}`;
          notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: true });
        }

        // Add blight ID if provided
        if (submissionData.blightId && submissionData.blightId !== 'N/A') {
          notificationFields.push({ 
            name: '🩸 Blight Healing ID', 
            value: `\`${submissionData.blightId}\``, 
            inline: true 
          });
        }

        const notificationEmbed = new EmbedBuilder()
          .setColor(typeColor)
          .setTitle(`${typeEmoji} PENDING ${submissionType} SUBMISSION!`)
          .setDescription('⏳ **Please approve within 24 hours!**')
          .addFields(notificationFields)
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: `${submissionType} Submission Approval Required` })
          .setTimestamp();

        const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
        console.log(`[componentHandler.js]: ✅ Notification sent to approval channel for ${submissionType} submission`);
        
        // Save the pending notification message ID to the submission data
        await updateSubmissionData(submissionData.submissionId, {
          pendingNotificationMessageId: notificationMessage.id
        });
      }
    } catch (notificationError) {
      console.error(`[componentHandler.js]: ❌ Failed to send notification to approval channel:`, notificationError);
      // Don't throw here, just log the error since the submission was already posted
    }

    console.log(`[componentHandler.js]: ✅ Confirmed submission ${submissionData.submissionId} with ${totalTokens} tokens`);
  } catch (error) {
    console.error('Error in handleConfirmation:', error);
    try {
      // Only try to reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while confirming your submission. Please try again.**',
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while confirming your submission. Please try again.**',
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
        return interaction.reply({ content: validationResult.message, flags: 64 });
      }
  
      const previousJob = character.job;
      const member = interaction.member;
  
      // Map job names to their role IDs
      const jobRoleIdMap = {
        'Scout': process.env.JOB_SCOUT,
        'Merchant': process.env.JOB_MERCHANT,
        'Shopkeeper': process.env.JOB_SHOPKEEPER,
        // Add other job role IDs here
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
        'BOOSTING': process.env.JOB_PERK_BOOSTING,
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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

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
        
        // Check cooldown BEFORE deferring
        const now = new Date();
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
        
        // Roll the dice
        const roll = Math.floor(Math.random() * GAME_CONFIG.DICE_SIDES) + 1;
        player.lastRoll = roll;
        player.lastRollTime = now;

        let gameEnded = false;
        let prizeCharacter = null; // Track which character received the prize
        
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
              console.log(`[RuuGame Component] Winner state persisted - Session status: ${session.status}, winner: ${session.winner}`);
            } else {
              // If another process already finished it, load latest
              session = await RuuGame.findById(session._id);
              console.log(`[RuuGame Component] Session already finished by another process - Status: ${session.status}, winner: ${session.winner}`);
            }
            
            // Double-check the session state before proceeding
            console.log(`[RuuGame Component] Session state before prize awarding - Status: ${session.status}, winner: ${session.winner}`);
          } catch (persistError) {
            console.error('[RuuGame Component] Failed to persist winner immediately:', persistError);
            // Continue with prize awarding even if persistence fails
          }

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
            prizeClaimedAt: session.prizeClaimedAt
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
          const embed = await createRuuGameEmbed(session, 'Roll Result!', interaction.user, prizeCharacter, roll);
          embed.setTitle(`🎲 RuuGame - ${interaction.user.username} rolled a ${roll}!`);
          
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
async function createRuuGameEmbed(session, title, userWhoRolled = null, prizeCharacter = null, roll = null) {
  console.log(`[createRuuGameEmbed] Creating embed - Session status: ${session.status}, winner: ${session.winner}, prizeCharacter: ${prizeCharacter?.name || 'None'}`);
  
  // Fetch the actual item emoji from ItemModel
  const itemDetails = await ItemModel.findOne({ itemName: PRIZES[session.prizeType].itemName }).select('emoji');
  const itemEmoji = itemDetails?.emoji || PRIZES[session.prizeType].emoji; // Fallback to hardcoded emoji if not found
  
  const prize = PRIZES[session.prizeType];
  const embed = new EmbedBuilder()
    .setTitle(`🎲 RuuGame - ${title}`)
    .setDescription(`**Roll a 20 to win a ${itemEmoji} ${prize.name}!**\n\n*Only members with set up characters can join!*\n*Prize will be added to a random character's inventory!*`)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
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
    embed.addFields(
      { name: '🎲 Roll Result', value: `${rollEmojis}`, inline: false }
    );
  }
  
  if (session.winner) {
    console.log(`[createRuuGameEmbed] Adding winner field - Winner: ${session.winner}, Winning Score: ${session.winningScore}, Prize Character: ${prizeCharacter?.name || 'None'}, Prize Claimed: ${session.prizeClaimed}`);
    const winner = session.players.find(p => p.discordId === session.winner);
    let winnerValue = `**${winner.username}** rolled a perfect **${session.winningScore}**!`;
    
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
    const characters = await Character.find({ userId: userId, inventorySynced: true });
    if (characters.length > 0) {
      const randomCharacter = characters[Math.floor(Math.random() * characters.length)];
      const prize = PRIZES[session.prizeType];

      // Fetch the actual item emoji from ItemModel
      const itemDetails = await ItemModel.findOne({ itemName: prize.itemName }).select('emoji');
      const itemEmoji = itemDetails?.emoji || '🎁'; // Fallback emoji if not found

      // Add item to random character's inventory using inventory utilities
      const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
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
  awardRuuGamePrize
};