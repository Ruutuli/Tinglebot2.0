// ============================================================================
// ------------------- Secret Santa Command -------------------
// Roots-themed Secret Santa art gift exchange command
// ============================================================================

// Standard Library Imports
const path = require('path');

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { connectToTinglebot } = require('@/shared/database/db');
const {
  loadSecretSantaData,
  saveParticipant,
  getParticipant,
  removeParticipant,
  updateSettings,
  setTempSignupData,
  getTempSignupData,
  matchParticipants,
  approveMatches,
  getPendingMatches,
  sendAssignmentDMs,
  isBlacklisted
} = require('../../modules/secretSantaModule');

// Utility Imports
const { uploadSubmissionImage } = require('@/shared/utils/uploadUtils.js');
const { createArtSubmissionEmbed } = require('../../embeds/embeds.js');
const { generateUniqueId } = require('@/shared/utils/uniqueIdUtils.js');
const { handleInteractionError } = require('@/shared/utils/globalErrorHandler.js');

// Model Imports
const ApprovedSubmission = require('@/shared/models/ApprovedSubmissionModel');
const User = require('@/shared/models/UserModel');

// Admin role ID from questAnnouncements.js
const MOD_ROLE_ID = '606128760655183882';
const { SecretSantaParticipant } = require('@/shared/models/SecretSantaModel');
const logger = require('@/shared/utils/logger');

const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('secretsanta')
    .setDescription('🎁 Roots Secret Santa - Art gift exchange')
    
    // ------------------- User Commands -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('signup')
        .setDescription('Sign up for Roots Secret Santa')
        .addStringOption(option =>
          option
            .setName('substitute')
            .setDescription('Will you be a substitute artist?')
            .setRequired(true)
            .addChoices(
              { name: 'No', value: 'no' },
              { name: 'Yes', value: 'yes' },
              { name: 'Only Substitute', value: 'only_sub' }
            )
        )
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your signup information')
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit your signup information')
        .addStringOption(option =>
          option
            .setName('substitute')
            .setDescription('Update your substitute artist status')
            .setRequired(false)
            .addChoices(
              { name: 'No', value: 'no' },
              { name: 'Yes', value: 'yes' },
              { name: 'Only Substitute', value: 'only_sub' }
            )
        )
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('withdraw')
        .setDescription('Withdraw from Roots Secret Santa')
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('View event information and deadlines')
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('submit')
        .setDescription('Submit your Secret Santa gift art')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('Your Secret Santa gift art file')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your submission (optional)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    try {
      await connectToTinglebot();
      const subcommand = interaction.options.getSubcommand();

      // User commands
      if (subcommand === 'signup') {
        await handleSignup(interaction);
      } else if (subcommand === 'view') {
        await handleView(interaction);
      } else if (subcommand === 'edit') {
        await handleEdit(interaction);
      } else if (subcommand === 'withdraw') {
        await handleWithdraw(interaction);
      } else if (subcommand === 'info') {
        await handleInfo(interaction);
      } else if (subcommand === 'submit') {
        await handleSubmit(interaction);
      }
    } catch (error) {
      logger.error('SECRET_SANTA', `Error in secretsanta command: ${error.message}`, error);
      await interaction.reply({
        content: '❌ There was an error processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};

// ============================================================================
// ------------------- User Command Handlers -------------------
// ============================================================================

// ------------------- Function: handleSignup -------------------
async function handleSignup(interaction) {
  const data = await loadSecretSantaData();
  
  // Check if user is blacklisted
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
    
    return await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  
  // Check if signups are open
  if (!data.settings.signupsOpen) {
    return await interaction.reply({
      content: '❌ Signups are currently closed for Roots Secret Santa.',
      ephemeral: true
    });
  }
  
  // Check if deadline has passed
  const now = new Date();
  if (now >= data.settings.signupDeadline) {
    return await interaction.reply({
      content: '❌ The signup deadline has passed.',
      ephemeral: true
    });
  }
  
  // Check if already signed up
  const existing = await getParticipant(interaction.user.id);
  if (existing) {
    return await interaction.reply({
      content: '❌ You are already signed up! Use `/secretsanta edit` to update your information.',
      ephemeral: true
    });
  }
  
  // Get substitute value from command option
  const isSubstitute = interaction.options.getString('substitute');
  
  // Store temporary data with substitute status
  await setTempSignupData(interaction.user.id, {
    isSubstitute: isSubstitute
  });
  
  // Show the signup modal directly
  const { createSignupModal } = require('../../handlers/secretSantaHandler');
  const modal = createSignupModal(false);
  await interaction.showModal(modal);
}

// ------------------- Function: handleView -------------------
async function handleView(interaction) {
  const participant = await getParticipant(interaction.user.id);
  
  if (!participant) {
    return await interaction.reply({
      content: '❌ You are not signed up for Roots Secret Santa. Use `/secretsanta signup` to sign up.',
      ephemeral: true
    });
  }
  
  const embed = new EmbedBuilder()
    .setTitle('🎁 Your Roots Secret Santa Signup')
    .setImage(BORDER_IMAGE)
    .setColor(0x00AE86)
    .addFields(
      { name: '👤 Discord Name', value: participant.discordName, inline: false },
      { name: '🔄 Substitute Artist', value: participant.isSubstitute === 'yes' ? 'Yes' : participant.isSubstitute === 'only_sub' ? 'Only Substitute' : 'No', inline: false },
      { name: '🔗 Character Links', value: participant.characterLinks && participant.characterLinks.length > 0 ? participant.characterLinks.join('\n') : '*None*', inline: false }
    )
    .setTimestamp();
  
  if (participant.preferredCharacterRequests) {
    embed.addFields({ name: '✨ Preferred Character Requests', value: participant.preferredCharacterRequests, inline: false });
  }
  
  if (participant.otherCharacterRequests) {
    embed.addFields({ name: '💭 Other Character Requests', value: participant.otherCharacterRequests, inline: false });
  }
  
  if (participant.contentToAvoid) {
    embed.addFields({ name: '⚠️ Content to Avoid', value: participant.contentToAvoid, inline: false });
  }
  
  if (participant.membersToAvoid && participant.membersToAvoid.length > 0) {
    embed.addFields({ name: '🚫 Members to Avoid', value: participant.membersToAvoid.join('\n'), inline: false });
  }
  
  if (participant.otherNotes) {
    embed.addFields({ name: '💬 Final Thoughts', value: participant.otherNotes, inline: false });
  }
  
  if (participant.matchedWith) {
    const giftee = await getParticipant(participant.matchedWith);
    embed.addFields({ 
      name: '🎯 Your Assignment', 
      value: giftee ? `You are drawing for **${giftee.discordName}**` : 'Assignment found but giftee data not available',
      inline: false 
    });
  }
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ------------------- Function: handleEdit -------------------
async function handleEdit(interaction) {
  const participant = await getParticipant(interaction.user.id);
  
  if (!participant) {
    return await interaction.reply({
      content: '❌ You are not signed up. Use `/secretsanta signup` to sign up first.',
      ephemeral: true
    });
  }
  
  // Check if matches have been made
  const data = await loadSecretSantaData();
  if (data.settings.matched) {
    return await interaction.reply({
      content: '❌ Matches have already been made. You cannot edit your signup now.',
      ephemeral: true
    });
  }
  
  // Get substitute option if provided
  const substituteOption = interaction.options.getString('substitute');
  
  // If substitute option is provided, update it and show modal
  if (substituteOption) {
    await saveParticipant({
      ...participant,
      isSubstitute: substituteOption
    });
    
    // Show the edit modal
    const { createSignupModal } = require('../../handlers/secretSantaHandler');
    const modal = createSignupModal(true);
    await interaction.showModal(modal);
    return;
  }
  
  // If no substitute option, just show the edit modal
  const { createSignupModal } = require('../../handlers/secretSantaHandler');
  const modal = createSignupModal(true);
  await interaction.showModal(modal);
}

// ------------------- Function: handleWithdraw -------------------
async function handleWithdraw(interaction) {
  const participant = await getParticipant(interaction.user.id);
  
  if (!participant) {
    return await interaction.reply({
      content: '❌ You are not signed up for Roots Secret Santa.',
      ephemeral: true
    });
  }
  
  // Check if matches have been made
  const data = await loadSecretSantaData();
  if (data.settings.matched) {
    return await interaction.reply({
      content: '❌ Matches have already been made. Please contact a moderator to withdraw.',
      ephemeral: true
    });
  }
  
  await removeParticipant(interaction.user.id);
  
  await interaction.reply({
    content: '✅ You have been withdrawn from Roots Secret Santa.',
    ephemeral: true
  });
}

// ------------------- Function: handleInfo -------------------
async function handleInfo(interaction) {
  const data = await loadSecretSantaData();
  const participantCount = data.participants.filter(p => p.isSubstitute !== 'only_sub').length;
  const substituteCount = data.participants.filter(p => p.isSubstitute === 'yes' || p.isSubstitute === 'only_sub').length;
  
  const signupDeadline = new Date(data.settings.signupDeadline);
  const submissionDeadline = new Date(data.settings.submissionDeadline);
  
  const embed = new EmbedBuilder()
    .setTitle('🎁 Roots Secret Santa - Event Information')
    .setDescription('Sign up using `/secretsanta signup` to tell your Secret Santa what you would like to receive as an art gift! You will receive a DM with your giftee\'s information when matches are made. Don\'t tell anyone who you are drawing for, it\'s a secret!')
    .setImage(BORDER_IMAGE)
    .setColor(0x00AE86)
    .addFields(
      { 
        name: '📅 Important Dates', 
        value: `**Signup Deadline:** <t:${Math.floor(signupDeadline.getTime() / 1000)}:F>\n**Submission Deadline:** <t:${Math.floor(submissionDeadline.getTime() / 1000)}:F>\n\nSend your gift art between **December 24th** and **January 14th at 11:59 PM EST**!\n\nIf you won't be able to make the deadline, inform us by the **first week of January**, or else you will be put on the Naughty list and won't be allowed to participate next year!`,
        inline: false 
      },
      { 
        name: '🎨 Gift Requirements', 
        value: 'Gift art should be at least one requested character, lined with flat colors. Whether it\'s full body or bust, background or none, is up to you and whatever your giftee requests. Intentional stylization is acceptable too!',
        inline: false 
      },
      { 
        name: '📊 Current Status', 
        value: `**Signups:** ${data.settings.signupsOpen ? '✅ Open' : '❌ Closed'}\n**Participants:** ${participantCount}\n**Substitute Artists:** ${substituteCount}\n**Matched:** ${data.settings.matched ? '✅ Yes' : '❌ No'}`,
        inline: false 
      }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ------------------- Function: handleSubmit -------------------
async function handleSubmit(interaction) {
  try {
    // Check if interaction is still valid before deferring
    if (interaction.replied || interaction.deferred) {
      logger.warn('SECRET_SANTA', 'Interaction already replied/deferred in handleSubmit');
      return;
    }
    
    try {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    } catch (deferError) {
      // Handle expired interactions gracefully
      if (deferError.code === 10062) {
        logger.warn('SECRET_SANTA', 'Interaction expired in handleSubmit (10062)');
        // Try to send ephemeral reply if possible
        try {
          await interaction.reply({
            content: '❌ **This interaction has expired.** Please run the command again.',
            ephemeral: true
          });
        } catch (replyError) {
          // If reply also fails, interaction is definitely expired - ignore
          logger.debug('SECRET_SANTA', 'Could not send expiration message, interaction fully expired');
        }
        return;
      }
      // Re-throw other errors
      throw deferError;
    }

    const user = interaction.user;
    
    // Check if user is signed up
    const participant = await getParticipant(user.id);
    if (!participant) {
      return await interaction.editReply({
        content: '❌ You are not signed up for Roots Secret Santa. Use `/secretsanta signup` to sign up first.',
        ephemeral: true
      });
    }

    // Check if user has already submitted
    if (participant.hasCompleted) {
      return await interaction.editReply({
        content: '❌ You have already submitted your Secret Santa gift. You can only submit once per year.',
        ephemeral: true
      });
    }

    // Check if deadline has passed
    const data = await loadSecretSantaData();
    const now = new Date();
    const submissionDeadline = new Date(data.settings.submissionDeadline);
    
    if (now > submissionDeadline) {
      // Add user to blacklist for next year
      const currentBlacklist = data.settings.blacklistedUsers || [];
      const userIdentifier = user.username || user.id;
      
      if (!currentBlacklist.includes(userIdentifier) && !currentBlacklist.includes(user.id)) {
        await updateSettings({
          blacklistedUsers: [...currentBlacklist, userIdentifier]
        });
        logger.info('SECRET_SANTA', `Added ${userIdentifier} to blacklist for submitting after deadline`);
      }
      
      return await interaction.editReply({
        content: `❌ **The submission deadline has passed!**\n\nThe deadline was **January 14th, 11:59 PM EST**. You have been added to the naughty list and will not be able to participate in next year's Secret Santa.`,
        ephemeral: true
      });
    }

    const attachedFile = interaction.options.getAttachment('file');
    const title = interaction.options.getString('title')?.trim() || attachedFile.name;

    // Check if a file is attached
    if (!attachedFile) {
      return await interaction.editReply({ content: '❌ **No file attached. Please try again.**' });
    }

    const fileName = path.basename(attachedFile.name);
    const discordImageUrl = attachedFile.url;

    // Upload the image to Google Drive or cloud storage
    const googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);

    // Post the embed publicly in the submissions channel
    const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
    const submissionId = generateUniqueId('A');
    const embed = createArtSubmissionEmbed({
      submissionId,
      title,
      fileName,
      category: 'art',
      userId: user.id,
      username: user.username,
      userAvatar: user.displayAvatarURL({ dynamic: true }),
      fileUrl: googleImageUrl,
      finalTokenAmount: 0,
      tokenCalculation: 'No tokens - Display only',
      baseSelections: [],
      baseCounts: new Map(),
      typeMultiplierSelections: [],
      typeMultiplierCounts: new Map(),
      productMultiplierValue: null,
      addOnsApplied: [],
      specialWorksApplied: [],
      collab: [],
      blightId: null,
      taggedCharacters: [],
      questEvent: 'N/A',
      questBonus: 'N/A'
    });
    const sentMessage = await submissionsChannel.send({ embeds: [embed] });

    // Create submission data for auto-approval with message URL
    const submissionData = {
      submissionId,
      title,
      fileName,
      category: 'art',
      userId: user.id,
      username: user.username,
      userAvatar: user.displayAvatarURL({ dynamic: true }),
      fileUrl: googleImageUrl,
      messageUrl: `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}`,
      finalTokenAmount: 0, // No tokens
      tokenCalculation: 'No tokens - Display only',
      baseSelections: [],
      baseCounts: new Map(),
      typeMultiplierSelections: [],
      typeMultiplierCounts: new Map(),
      productMultiplierValue: null,
      addOnsApplied: [],
      specialWorksApplied: [],
      collab: [],
      blightId: null,
      taggedCharacters: [],
      questEvent: 'N/A',
      questBonus: 'N/A',
      approvedBy: 'System (Secret Santa)',
      approvedAt: new Date(),
      approvalMessageId: null,
      pendingNotificationMessageId: null,
      submittedAt: new Date()
    };

    // Save directly to approved submissions database
    const approvedSubmission = new ApprovedSubmission(submissionData);
    await approvedSubmission.save();

    // Update participant status
    await connectToTinglebot();
    await SecretSantaParticipant.updateOne(
      { userId: user.id },
      { 
        $set: { 
          hasCompleted: true,
          safeForNextYear: true
        }
      }
    );

    // Record quest completion
    const userData = await User.findOne({ discordId: user.id });
    if (userData) {
      const currentYear = new Date().getFullYear();
      const questId = `SECRET_SANTA_${currentYear}`;
      
      await userData.recordQuestCompletion({
        questId: questId,
        questType: 'Art',
        questTitle: 'Secret Santa Submission',
        completedAt: new Date(),
        rewardedAt: new Date(),
        tokensEarned: 0,
        itemsEarned: [],
        rewardSource: 'immediate'
      });
    }

    await interaction.editReply({
      content: '🎨 **Your Secret Santa gift submission has been posted!**\n\n✅ You have been marked as completed and are safe for next year.\n✅ This completion counts as 1 quest.\n\n**Note:** If you want tokens for this submission, please submit normally using `/submit art`.',
      ephemeral: true,
    });

  } catch (error) {
    handleInteractionError(error, 'secretsanta.js');
    logger.error('SECRET_SANTA', `Error in handleSubmit: ${error.message}`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
    } else {
      await interaction.reply({ content: '❌ **Error processing your submission. Please try again later.**', ephemeral: true });
    }
  }
}

// ============================================================================
// ------------------- Admin Command Handlers -------------------
// ============================================================================

// ------------------- Function: handleMatch -------------------
async function handleMatch(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    // Use editReply if already deferred, otherwise reply
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  // Defer if not already deferred (for standalone use)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const result = await matchParticipants(interaction.client, false);
  
  if (result.success) {
    // Get data to show stats
    const data = await loadSecretSantaData();
    const participants = data.participants.filter(p =>
      p &&
      p.userId &&
      p.isSubstitute !== 'only_sub' &&
      Array.isArray(p.characterLinks) &&
      p.characterLinks.length > 0
    );
    const substitutes = data.participants.filter(p => 
      p && (p.isSubstitute === 'yes' || p.isSubstitute === 'only_sub')
    );
    
    // Build match preview list
    let matchList = '';
    for (let index = 0; index < result.matches.length; index++) {
      const match = result.matches[index];
      const santa = await getParticipant(match.santaId);
      const giftee = await getParticipant(match.gifteeId);
      const santaName = santa?.discordName || match.santaId;
      const gifteeName = giftee?.discordName || match.gifteeId;
      
      matchList += `**${santaName}** → **${gifteeName}**\n`;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Matches Generated!')
      .setDescription(`**${result.matches.length} matches** have been generated and are pending approval.`)
      .setImage(BORDER_IMAGE)
      .setColor(0x00AE86)
      .addFields(
        { 
          name: '🎁 Match Assignments', 
          value: matchList || '*No matches*', 
          inline: false 
        },
        { 
          name: '📊 Matching Statistics', 
          value: `**Participants Matched:** ${result.matches.length}\n**Total Participants:** ${participants.length}\n**Substitutes Available:** ${substitutes.length}\n**Unmatched:** ${result.unmatched?.length || 0}`, 
          inline: false 
        },
        { 
          name: '🔍 Matching Logic', 
          value: `• Randomly shuffled all participants\n• Avoided self-matches\n• Respected "members to avoid" lists\n• Used fallback matching if needed\n• Ensured no duplicate assignments`, 
          inline: false 
        },
        { 
          name: '📝 Next Steps', 
          value: `Use \`/mod-secretsanta approve\` to approve and send matches via DM.`, 
          inline: false 
        }
      )
      .setTimestamp();
    
    if (result.unmatched && result.unmatched.length > 0) {
      let warningText = `**${result.unmatched.length} participant(s) could not be matched:**\n\n`;
      
      if (result.unmatchedDetails && result.unmatchedDetails.length > 0) {
        result.unmatchedDetails.forEach((detail, index) => {
          warningText += `**${detail.participant}**\n`;
          warningText += `• ${detail.reason}\n`;
          if (index < result.unmatchedDetails.length - 1) {
            warningText += '\n';
          }
        });
      } else {
        // Fallback if details aren't available
        result.unmatched.forEach((participant, index) => {
          warningText += `• **${participant.discordName || participant.username || participant.userId}**\n`;
        });
      }
      
      warningText += '\nYou may need to manually adjust matches using `/mod-secretsanta editmatch`.';
      
      embed.addFields({
        name: '⚠️ Unmatched Participants',
        value: warningText,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({
      content: `❌ ${result.message || 'Failed to generate matches.'}`
    });
  }
}

// ------------------- Function: handlePreview -------------------
async function handlePreview(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const pendingMatches = await getPendingMatches();
  
  if (pendingMatches.length === 0) {
    return await interaction.editReply({
      content: '❌ No pending matches found. Use `/mod secretsanta match` to generate matches.'
    });
  }
  
  let matchList = '';
  for (const match of pendingMatches) {
    const santa = await getParticipant(match.santaId);
    const giftee = await getParticipant(match.gifteeId);
    matchList += `**${santa?.discordName || match.santaId}** → **${giftee?.discordName || match.gifteeId}**\n`;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('🔍 Pending Matches Preview')
    .setDescription(matchList || '*No matches*')
    .setImage(BORDER_IMAGE)
    .setColor(0x00AE86)
    .setFooter({ text: `Total: ${pendingMatches.length} matches` })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// ------------------- Function: handleApprove -------------------
async function handleApprove(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const pendingMatches = await getPendingMatches();
  
  if (pendingMatches.length === 0) {
    return await interaction.editReply({
      content: '❌ No pending matches to approve. Use `/mod secretsanta match` to generate matches first.'
    });
  }
  
  await approveMatches();
  await sendAssignmentDMs(interaction.client);
  
  await interaction.editReply({
    content: `✅ Approved ${pendingMatches.length} matches and sent assignment DMs to all participants.`
  });
}

// ------------------- Function: handleSettings -------------------
async function handleSettings(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const action = interaction.options.getString('action');
  const dateString = interaction.options.getString('date');
  
  let updateData = {};
  
  if (action === 'open') {
    updateData.signupsOpen = true;
  } else if (action === 'close') {
    updateData.signupsOpen = false;
  } else if (action === 'signup_deadline' || action === 'submission_deadline') {
    if (!dateString) {
      return await interaction.reply({
        content: '❌ Please provide a date in YYYY-MM-DD format.',
        ephemeral: true
      });
    }
    
    const date = new Date(dateString + 'T23:59:59');
    if (isNaN(date.getTime())) {
      return await interaction.reply({
        content: '❌ Invalid date format. Please use YYYY-MM-DD.',
        ephemeral: true
      });
    }
    
    if (action === 'signup_deadline') {
      updateData.signupDeadline = date;
    } else {
      updateData.submissionDeadline = date;
    }
  }
  
  await updateSettings(updateData);
  
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      content: `✅ Settings updated successfully.`
    });
  } else {
    await interaction.reply({
      content: `✅ Settings updated successfully.`,
      ephemeral: true
    });
  }
}

// ------------------- Function: handleParticipants -------------------
async function handleParticipants(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const data = await loadSecretSantaData();
  const participants = data.participants.filter(p => p.isSubstitute !== 'only_sub');
  const substitutes = data.participants.filter(p => p.isSubstitute === 'yes' || p.isSubstitute === 'only_sub');
  
  // Separate participants by completion status
  const completed = participants.filter(p => p.hasCompleted === true);
  const notCompleted = participants.filter(p => p.hasCompleted !== true);
  
  let completedList = completed.length > 0 
    ? completed.map(p => `✅ ${p.discordName}${p.isSubstitute === 'yes' ? ' (Sub)' : ''}`).join('\n')
    : '*None completed*';
  let notCompletedList = notCompleted.length > 0
    ? notCompleted.map(p => `❌ ${p.discordName}${p.isSubstitute === 'yes' ? ' (Sub)' : ''}`).join('\n')
    : '*All completed!*';
  let substituteList = substitutes.length > 0
    ? substitutes.map(p => `${p.discordName}${p.isSubstitute === 'only_sub' ? ' (Only Sub)' : ''}`).join('\n')
    : '*None*';
  
  const embed = new EmbedBuilder()
    .setTitle('📊 Roots Secret Santa Participants')
    .setImage(BORDER_IMAGE)
    .setColor(0x00AE86)
    .addFields(
      { name: `✅ Completed (${completed.length}/${participants.length})`, value: completedList.substring(0, 1024), inline: false },
      { name: `❌ Not Completed (${notCompleted.length}/${participants.length})`, value: notCompletedList.substring(0, 1024), inline: false },
      { name: `🔄 Substitute Artists (${substitutes.length})`, value: substituteList.substring(0, 1024), inline: false }
    )
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

// ------------------- Function: handleEditMatch -------------------
async function handleEditMatch(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const santaUser = interaction.options.getUser('santa');
  const gifteeUser = interaction.options.getUser('giftee');
  
  const { SecretSantaMatch } = require('@/shared/models/SecretSantaModel');
  await connectToTinglebot();
  
  // Remove existing matches for this santa
  await SecretSantaMatch.deleteMany({ santaId: santaUser.id });
  
  // Create new match
  await SecretSantaMatch.create({
    santaId: santaUser.id,
    gifteeId: gifteeUser.id,
    isPending: false
  });
  
  // Update participant
  await SecretSantaParticipant.updateOne(
    { userId: santaUser.id },
    { $set: { matchedWith: gifteeUser.id } }
  );
  
  await interaction.editReply({
    content: `✅ Match updated: **${santaUser.displayName}** → **${gifteeUser.displayName}**`
  });
}

// ------------------- Function: handleBlacklist -------------------
async function handleBlacklist(interaction) {
  // Check admin permissions - must have Mod role
  if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: '❌ You do not have permission to use this command. Only admins can use this.'
      });
    }
    return await interaction.reply({
      content: '❌ You do not have permission to use this command. Only admins can use this.',
      ephemeral: true
    });
  }
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  const action = interaction.options.getString('action');
  const username = interaction.options.getString('username');
  const data = await loadSecretSantaData();
  const currentBlacklist = data.settings.blacklistedUsers || [];
  
  if (action === 'view') {
    const defaultBlacklist = ['bogoro', 'ellowwell'];
    const allBlacklisted = [...defaultBlacklist, ...currentBlacklist];
    
    const embed = new EmbedBuilder()
      .setTitle('🚫 Secret Santa Blacklist')
      .setImage(BORDER_IMAGE)
      .setColor(0x00AE86)
      .addFields({
        name: 'Blacklisted Users',
        value: allBlacklisted.length > 0 ? allBlacklisted.map(u => `• ${u}`).join('\n') : '*None*',
        inline: false
      })
      .addFields({
        name: '📝 Note',
        value: 'Default blacklist (bogoro, ellowwell) cannot be removed via command.',
        inline: false
      })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  if (!username) {
    return await interaction.editReply({
      content: '❌ Please provide a username or user ID.'
    });
  }
  
  if (action === 'add') {
    if (currentBlacklist.includes(username)) {
      return await interaction.editReply({
        content: `❌ **${username}** is already blacklisted.`
      });
    }
    
    await updateSettings({
      blacklistedUsers: [...currentBlacklist, username]
    });
    
    await interaction.editReply({
      content: `✅ Added **${username}** to the blacklist.`
    });
  } else if (action === 'remove') {
    if (!currentBlacklist.includes(username)) {
      return await interaction.editReply({
        content: `❌ **${username}** is not in the blacklist.`
      });
    }
    
    const newBlacklist = currentBlacklist.filter(u => u !== username);
    await updateSettings({
      blacklistedUsers: newBlacklist
    });
    
    await interaction.editReply({
      content: `✅ Removed **${username}** from the blacklist.`
    });
  }
}

// Export admin handlers for use in mod.js
module.exports.handleMatch = handleMatch;
module.exports.handlePreview = handlePreview;
module.exports.handleApprove = handleApprove;
module.exports.handleSettings = handleSettings;
module.exports.handleParticipants = handleParticipants;
module.exports.handleEditMatch = handleEditMatch;
module.exports.handleBlacklist = handleBlacklist;

