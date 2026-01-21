// ============================================================================
// ------------------- Secret Santa Handler -------------------
// Handles select menus and modals for Roots Secret Santa
// ============================================================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { connectToTinglebot } = require('@/shared/database/db');
const {
  setTempSignupData,
  getTempSignupData,
  saveParticipant,
  getParticipant,
  loadSecretSantaData,
  isBlacklisted
} = require('../modules/secretSantaModule');
const logger = require('@/shared/utils/logger');

const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

// ============================================================================
// ------------------- Select Menu Handler -------------------
// ============================================================================

async function handleSecretSantaSelectMenu(interaction) {
  const customId = interaction.customId;
  
  if (customId === 'secretsanta_substitute_select') {
    await handleSubstituteSelect(interaction);
  }
}

// ------------------- Function: handleSubstituteSelect -------------------
async function handleSubstituteSelect(interaction) {
  const isSubstitute = interaction.values[0];
  
  // Check if user is blacklisted (even for substitutes)
  const blacklisted = await isBlacklisted(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayName || interaction.user.username
  );
  
  if (blacklisted) {
    const embed = new EmbedBuilder()
      .setTitle('🎅❌ On the Naughty List!')
      .setDescription('**Sorry, you\'re on the naughty list this year!**\n\nYou can\'t join! **Roots Santa says no!!!!** 🎁🚫')
      .setImage(BORDER_IMAGE)
      .setColor(0xFF0000)
      .setTimestamp();
    
    return await interaction.update({
      embeds: [embed],
      components: []
    });
  }
  
  // Store temporary data
  await setTempSignupData(interaction.user.id, {
    isSubstitute: isSubstitute
  });
  
  // Show the signup modal
  const modal = createSignupModal();
  await interaction.showModal(modal);
}

// ============================================================================
// ------------------- Modal Handler -------------------
// ============================================================================

async function handleSecretSantaModal(interaction) {
  const customId = interaction.customId;
  
  if (customId === 'secretsanta_signup_modal' || customId === 'secretsanta_edit_modal') {
    await handleSignupModalSubmit(interaction);
  }
}

// ------------------- Function: handleSignupModalSubmit -------------------
async function handleSignupModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const discordName = interaction.user.displayName || interaction.user.username;
    
    // Get temp data for substitute status
    const tempData = await getTempSignupData(userId);
    const isSubstitute = tempData?.isSubstitute || 'no';
    
    // Get signup data from modal
    const characterLinks = interaction.fields.getTextInputValue('characterLinks');
    const preferredCharacterRequests = interaction.fields.getTextInputValue('preferredCharacterRequests') || '';
    const otherCharacterRequests = interaction.fields.getTextInputValue('otherCharacterRequests') || '';
    const contentToAvoid = interaction.fields.getTextInputValue('contentToAvoid') || '';
    const membersToAvoid = interaction.fields.getTextInputValue('membersToAvoid') || '';
    
    // Parse other notes from otherCharacterRequests field if it contains "Final Thoughts:" separator
    // For simplicity, we'll use otherCharacterRequests as-is and users can add final thoughts there
    const otherNotes = '';
    
    // Parse character links (split by newlines)
    const characterLinksArray = characterLinks
      .split('\n')
      .map(link => link.trim())
      .filter(link => link.length > 0);
    
    if (characterLinksArray.length === 0) {
      return await interaction.editReply({
        content: '❌ Please provide at least one character link.'
      });
    }
    
    // Parse members to avoid (split by newlines or commas)
    const membersToAvoidArray = membersToAvoid
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    // Check if matches have been made (for edits) and if signups are open
    const data = await loadSecretSantaData();
    const existingParticipant = await getParticipant(userId);
    const existing = !!existingParticipant;
    
    // Check if signups are open (allow edits if already signed up)
    if (!data.settings.signupsOpen && !existingParticipant) {
      return await interaction.editReply({
        content: '❌ Signups are currently closed for Roots Secret Santa.'
      });
    }
    
    if (existingParticipant && data.settings.matched) {
      return await interaction.editReply({
        content: '❌ Matches have already been made. You cannot edit your signup now.'
      });
    }
    
    // Save participant
    const participantData = {
      userId,
      username,
      discordName,
      isSubstitute,
      characterLinks: characterLinksArray,
      preferredCharacterRequests: preferredCharacterRequests || undefined,
      otherCharacterRequests: otherCharacterRequests || undefined,
      contentToAvoid: contentToAvoid || undefined,
      membersToAvoid: membersToAvoidArray.length > 0 ? membersToAvoidArray : undefined,
      otherNotes: otherNotes || undefined
    };
    
    await saveParticipant(participantData);
    
    // Send announcement to signup channel if new signup
    if (!existing) {
      await sendSignupAnnouncement(interaction.client, participantData);
    }
    
    // Clean up temp data
    const { TempSignupData } = require('@/shared/models/SecretSantaModel');
    await connectToTinglebot();
    await TempSignupData.deleteOne({ userId });
    
    // Build signup details for ephemeral reply
    const substituteText = participantData.isSubstitute === 'yes' ? 'Yes' : participantData.isSubstitute === 'only_sub' ? 'Only Substitute' : 'No';
    
    // Format character links (truncate if too long)
    let characterLinksText = participantData.characterLinks.join('\n') || '*None*';
    if (characterLinksText.length > 1024) {
      const links = participantData.characterLinks;
      let truncated = '';
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const testText = truncated + (truncated ? '\n' : '') + link;
        if (testText.length > 1024 - 20) {
          truncated += `\n... and ${links.length - i} more`;
          break;
        }
        truncated = testText;
      }
      characterLinksText = truncated;
    }
    
    const fields = [
      { name: '🔄 Substitute Artist', value: substituteText, inline: false },
      { name: '🔗 Character Links', value: characterLinksText, inline: false }
    ];
    
    if (participantData.preferredCharacterRequests) {
      fields.push({ name: '✨ Preferred Character Requests', value: participantData.preferredCharacterRequests.substring(0, 1024) || '*None*', inline: false });
    }
    
    if (participantData.otherCharacterRequests) {
      fields.push({ name: '💭 Other Requests & Final Thoughts', value: participantData.otherCharacterRequests.substring(0, 1024) || '*None*', inline: false });
    }
    
    if (participantData.contentToAvoid) {
      fields.push({ name: '⚠️ Content to Avoid', value: participantData.contentToAvoid.substring(0, 1024) || '*None*', inline: false });
    }
    
    if (participantData.membersToAvoid && participantData.membersToAvoid.length > 0) {
      fields.push({ name: '🚫 Members to Avoid', value: participantData.membersToAvoid.join('\n') || '*None*', inline: false });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(existing ? '✅ Signup Updated!' : '✅ Signup Successful!')
      .setDescription(existing ? 'Your Roots Secret Santa signup has been updated!' : 'You have been signed up for Roots Secret Santa!')
      .setImage(BORDER_IMAGE)
      .setColor(0x00AE86)
      .addFields(...fields)
      .addFields(
        { name: '✏️ Edit Your Signup', value: 'Use `/secretsanta edit` to update your information anytime before matches are made.', inline: false },
        { name: '🎁 What\'s Next?', value: 'Wait for matches to be made! You will receive a DM with your giftee\'s information when matches are approved.', inline: false }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('SECRET_SANTA', `Error in signup modal: ${error.message}`, error);
    await interaction.editReply({
      content: '❌ There was an error processing your signup. Please try again later.'
    });
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: createSignupModal -------------------
function createSignupModal(isEdit = false) {
  const modal = new ModalBuilder()
    .setCustomId(isEdit ? 'secretsanta_edit_modal' : 'secretsanta_signup_modal')
    .setTitle(isEdit ? 'Edit Roots Secret Santa Signup' : 'Roots Secret Santa Signup');
  
  // Character links (required)
  const characterLinksInput = new TextInputBuilder()
    .setCustomId('characterLinks')
    .setLabel('Character Links (Required)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Link character apps you want art of. Most preferred at top. One link per line.')
    .setRequired(true)
    .setMaxLength(2000);
  
  // Preferred character requests
  const preferredRequestsInput = new TextInputBuilder()
    .setCustomId('preferredCharacterRequests')
    .setLabel('Preferred Character Requests (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Special requests for how to draw your Most Preferred character? (Optional)')
    .setRequired(false)
    .setMaxLength(1000);
  
  // Other character requests (includes final thoughts due to 5-field limit)
  const otherRequestsInput = new TextInputBuilder()
    .setCustomId('otherCharacterRequests')
    .setLabel('Other Requests & Final Thoughts (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Requests for other characters or any final thoughts? (Optional)')
    .setRequired(false)
    .setMaxLength(1500);
  
  // Content to avoid
  const contentToAvoidInput = new TextInputBuilder()
    .setCustomId('contentToAvoid')
    .setLabel('Content to Avoid (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Is there anything your Secret Santa should avoid drawing?')
    .setRequired(false)
    .setMaxLength(500);
  
  // Members to avoid
  const membersToAvoidInput = new TextInputBuilder()
    .setCustomId('membersToAvoid')
    .setLabel('Members to Avoid (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Exact Discord usernames (one per line). Must match exactly or matching won\'t work!')
    .setRequired(false)
    .setMaxLength(500);
  
  // Other notes
  const otherNotesInput = new TextInputBuilder()
    .setCustomId('otherNotes')
    .setLabel('Final Thoughts (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Any final thoughts or notes?')
    .setRequired(false)
    .setMaxLength(500);
  
  // Add inputs to modal (Discord modals support up to 5 inputs)
  // We'll combine "Final Thoughts" into "Other Character Requests" field
  modal.addComponents(
    new ActionRowBuilder().addComponents(characterLinksInput),
    new ActionRowBuilder().addComponents(preferredRequestsInput),
    new ActionRowBuilder().addComponents(otherRequestsInput),
    new ActionRowBuilder().addComponents(contentToAvoidInput),
    new ActionRowBuilder().addComponents(membersToAvoidInput)
  );
  
  return modal;
}

// ------------------- Function: sendModNotification -------------------
async function sendModNotification(client, participantData) {
  try {
    // Find mod channel (you may need to adjust this channel ID)
    const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID || '606004354419392513'; // Default mod channel
    
    const channel = await client.channels.fetch(MOD_CHANNEL_ID);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
      .setTitle('🎁 New Roots Secret Santa Signup')
      .setDescription(`**${participantData.discordName}** (${participantData.username}) has signed up!`)
      .setImage(BORDER_IMAGE)
      .setColor(0x00AE86)
      .addFields(
        { name: '🔄 Substitute Artist', value: participantData.isSubstitute === 'yes' ? 'Yes' : participantData.isSubstitute === 'only_sub' ? 'Only Substitute' : 'No', inline: false },
        { name: '🔗 Character Links', value: participantData.characterLinks.length > 0 ? participantData.characterLinks.slice(0, 5).join('\n') + (participantData.characterLinks.length > 5 ? `\n... and ${participantData.characterLinks.length - 5} more` : '') : '*None*', inline: false }
      )
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    // Silently fail if mod channel not found or error
    logger.debug('SECRET_SANTA', `Could not send mod notification: ${error.message}`);
  }
}

// ------------------- Function: sendSignupAnnouncement -------------------
async function sendSignupAnnouncement(client, participantData) {
  try {
    const SIGNUP_CHANNEL_ID = '855628652389335040';
    
    const channel = await client.channels.fetch(SIGNUP_CHANNEL_ID);
    if (!channel) return;
    
    // Get user to fetch avatar
    const user = await client.users.fetch(participantData.userId);
    const avatarURL = user.displayAvatarURL({ dynamic: true, size: 256 });
    
    const embed = new EmbedBuilder()
      .setTitle('🎁 New Secret Santa Signup!')
      .setDescription(`**${participantData.discordName}** has joined!`)
      .setThumbnail(avatarURL)
      .setImage(BORDER_IMAGE)
      .setColor(0x00AE86)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    // Silently fail if channel not found or error
    logger.debug('SECRET_SANTA', `Could not send signup announcement: ${error.message}`);
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  handleSecretSantaSelectMenu,
  handleSecretSantaModal,
  createSignupModal
};

