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
  getUserById
} = require('../database/db');

// ------------------- Database Models -------------------
const ItemModel = require('../models/ItemModel');

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
  deleteSubmissionFromStorage,
  saveSubmissionToStorage,
  submissionStore
} = require('../utils/storage');

const {
  calculateTokens,
  generateTokenBreakdown
} = require('../utils/tokenUtils');

const { canChangeJob } = require('../utils/validation');


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
        const submissionData = submissionStore.get(userId);
        return await handleConfirmation(interaction, userId, submissionData);
      case 'cancel':
        const cancelData = submissionStore.get(userId);
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

    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your action.**',
        ephemeral: true,
      });
    }
  }
}

// ------------------- Function: handleSyncYes -------------------
// Begins character inventory sync.
async function handleSyncYes(interaction, characterId) {
  try {
    const character = await fetchCharacterById(characterId);
    if (!character) {
      return interaction.reply({ content: '❌ **Character not found.**', ephemeral: true });
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
        ephemeral: true 
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
// Confirms an art submission and posts embed.
async function handleConfirmation(interaction, userId, submissionData) {
  if (!submissionData) {
    return interaction.reply({
      content: '❌ **Submission data not found. Please try again.**',
      ephemeral: true,
    });
  }

  const user = await getUserById(userId);
  const { totalTokens } = calculateTokens(submissionData);
  const breakdown = generateTokenBreakdown({ ...submissionData, finalTokenAmount: totalTokens });

  await interaction.update({
    content: '✅ **You have confirmed your submission! Mods will review it shortly.**',
    components: [],
  });

  if (!submissionData.embedSent) {
    const embed = createArtSubmissionEmbed(submissionData, user, breakdown);
    const sentMessage = await interaction.channel.send({ embeds: [embed] });
    submissionData.messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
    submissionStore.set(userId, submissionData);
    saveSubmissionToStorage(submissionData.submissionId, submissionData);
  }

  submissionStore.delete(userId);
}

// ------------------- Function: handleCancel -------------------
// Cancels submission and removes stored data.
async function handleCancel(interaction, userId, submissionData) {
  if (submissionData?.submissionId) {
    deleteSubmissionFromStorage(submissionData.submissionId);
  }

  submissionStore.delete(userId);

  await interaction.update({
    content: '❌ **Your submission has been canceled.**',
    components: [],
  });
}

// ------------------- Function: handleViewCharacter -------------------
// Shows a character's profile + gear embed.
async function handleViewCharacter(interaction, characterId) {
  try {
    await connectToTinglebot();
    const character = await fetchCharacterById(characterId);

    if (!character) {
      console.error(`[componentHandler.js]: Character with ID "${characterId}" not found.`);
      return interaction.reply({ 
        content: '❌ **This character no longer exists or has been deleted.**\nPlease try viewing a different character.', 
        ephemeral: true 
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
    await interaction.reply({ embeds: [embed, gearEmbed], ephemeral: true });
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: Error in handleViewCharacter:`, error);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while viewing the character.**\nPlease try again later.',
        ephemeral: true
      });
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
      const character = await fetchCharacterById(characterId);
  
      if (!character) {
        console.error(`[componentHandler.js]: Character not found for ID: ${characterId}`);
        return interaction.reply({ content: '❌ **Character not found.**', ephemeral: true });
      }
  
      // Validate job change
      const validationResult = await canChangeJob(character, updatedJob);
      if (!validationResult.valid) {
        console.warn(`[componentHandler.js]: Job validation failed: ${validationResult.message}`);
        return interaction.reply({ content: validationResult.message, ephemeral: true });
      }
  
      const previousJob = character.job;
      const member = interaction.member;
  
      // ------------------- Remove old job role -------------------
      const oldJobRole = roles.Jobs.find(r => r.name === `Job: ${previousJob}`);
      if (oldJobRole) {
        const guildRole = interaction.guild.roles.cache.find(r => r.name === oldJobRole.name);
        if (guildRole) {
          await member.roles.remove(guildRole);
        } else {
          console.error(`[componentHandler.js]: Old job role "${oldJobRole.name}" not found in guild.`);
        }
      }
  
      // ------------------- Add new job role -------------------
      const newJobRole = roles.Jobs.find(r => r.name === `Job: ${updatedJob}`);
      if (newJobRole) {
        const guildRole = interaction.guild.roles.cache.find(r => r.name === newJobRole.name);
        if (guildRole) {
          await member.roles.add(guildRole);
        } else {
          console.error(`[componentHandler.js]: New job role "${newJobRole.name}" not found in guild.`);
        }
      }
  
      // ------------------- Update perk roles -------------------
      const previousPerks = getJobPerk(previousJob)?.perks || [];
      const newPerks = getJobPerk(updatedJob)?.perks || [];
  
      // Remove previous perk roles
      for (const perk of previousPerks) {
        const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
        if (perkRole) {
          const role = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
          if (role) {
            await member.roles.remove(role);
          } else {
            console.error(`[componentHandler.js]: Old perk role "${perkRole.name}" not found.`);
          }
        } else {
          console.error(`[componentHandler.js]: No role mapping for old perk "${perk}".`);
        }
      }
  
      // Add new perk roles
      for (const perk of newPerks) {
        const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
        if (perkRole) {
          const role = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
          if (role) {
            await member.roles.add(role);
          } else {
            console.error(`[componentHandler.js]: New perk role "${perkRole.name}" not found.`);
          }
        } else {
          console.error(`[componentHandler.js]: No role mapping for new perk "${perk}".`);
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
        ephemeral: true,
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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

        await interaction.followUp({
          embeds: [shopGuideEmbed],
          ephemeral: true
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
        ephemeral: true,
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
          ephemeral: true,
        });
      }
  
      const jobs = getGeneralJobsPage(pageIndex);
      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return interaction.reply({
          content: '⚠️ **No jobs available on this page.**',
          ephemeral: true,
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
        ephemeral: true,
      });
  
    } catch (error) {
      handleError(error, 'componentHandler.js');
      console.error(`[componentHandler.js]: Error in handleJobPage`, error);
      await interaction.reply({
        content: '⚠️ **An error occurred while navigating job pages. Please try again.**',
        ephemeral: true,
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

    console.warn(`[componentHandler.js]: ⚠️ Unhandled component interaction: ${interaction.customId}`);
  } catch (error) {
    handleError(error, 'componentHandler.js');
    console.error(`[componentHandler.js]: ❌ Failed to handle component: ${error.message}`);
  }
}


// =============================================================================
// ------------------- Exports -------------------
// =============================================================================

module.exports = {
  handleComponentInteraction,
  handleButtonInteraction,
  getCancelButtonRow,
  getConfirmButtonRow
};
