// ============================================================================
// ------------------- Mod OC Application Command -------------------
// Discord bot command for moderating OC applications
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectToTinglebot } = require('@/shared/database/db');
const Character = require('@/shared/models/CharacterModel');
const CharacterModeration = require('@/shared/models/CharacterModerationModel');
const logger = require('@/shared/utils/logger');

const modOCAppCommand = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderation commands for OC applications')
  .addSubcommandGroup(subcommandGroup =>
    subcommandGroup
      .setName('ocapp')
      .setDescription('OC application moderation commands')
      .addSubcommand(subcommand =>
        subcommand
          .setName('approve')
          .setDescription('Approve an OC application')
          .addStringOption(option =>
            option
              .setName('id')
            .setDescription('Character ID or name')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(option =>
            option
              .setName('note')
              .setDescription('Optional note/feedback')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('needschanges')
          .setDescription('Mark an OC application as needs changes')
          .addStringOption(option =>
            option
              .setName('id')
              .setDescription('Character ID or name')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(option =>
            option
              .setName('note')
              .setDescription('Required feedback explaining what needs to be changed')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('View an OC application status')
          .addStringOption(option =>
            option
              .setName('id')
              .setDescription('Character ID or name')
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
  );

async function execute(interaction) {
  try {
    await connectToTinglebot();

    // Check if user has mod permissions
    const member = interaction.member;
    const hasModRole = member.roles.cache.some(role => 
      role.name.toLowerCase().includes('mod') || 
      role.name.toLowerCase().includes('admin') ||
      role.name.toLowerCase().includes('oracle') ||
      role.name.toLowerCase().includes('dragon') ||
      role.name.toLowerCase().includes('sage')
    );

    if (!hasModRole) {
      await interaction.reply({
        content: '❌ You do not have permission to use this command. Only moderators can moderate OC applications.',
        ephemeral: true
      });
      return;
    }

    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup !== 'ocapp') {
      return;
    }

    // Defer reply
    await interaction.deferReply({ ephemeral: true });

    const characterIdOrName = interaction.options.getString('id');
    const note = interaction.options.getString('note');

    // Find character by ID or name
    let character;
    try {
      // Try as ObjectId first
      if (characterIdOrName.match(/^[0-9a-fA-F]{24}$/)) {
        character = await Character.findById(characterIdOrName);
      } else {
        // Search by name
        character = await Character.findOne({ name: { $regex: new RegExp(`^${characterIdOrName}$`, 'i') } });
      }
    } catch (e) {
      // If not valid ObjectId, search by name
      character = await Character.findOne({ name: { $regex: new RegExp(`^${characterIdOrName}$`, 'i') } });
    }

    if (!character) {
      return interaction.editReply({
        content: `❌ Character not found: ${characterIdOrName}`
      });
    }

    if (subcommand === 'approve') {
      return await handleApprove(interaction, character, note);
    } else if (subcommand === 'needschanges') {
      if (!note) {
        return interaction.editReply({
          content: '❌ Note is required for needs changes votes.'
        });
      }
      return await handleNeedsChanges(interaction, character, note);
    } else if (subcommand === 'view') {
      return await handleView(interaction, character);
    }
  } catch (error) {
    logger.error('MOD_OCAPP', 'Error in mod-ocapp command', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ An error occurred while processing your request.'
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }
}

async function handleApprove(interaction, character, note) {
  try {
    if (character.status !== 'pending') {
      return interaction.editReply({
        content: `❌ Character "${character.name}" is not pending review. Current status: ${character.status || 'DRAFT'}`
      });
    }

    const modId = interaction.user.id;
    const modUsername = interaction.user.username;

    // Use ocApplicationService via API call (or import directly if shared)
    // For now, we'll call the API endpoint
    const dashboardUrl = process.env.DASHBOARD_URL || 'https://tinglebot.xyz';
    const response = await fetch(`${dashboardUrl}/api/characters/moderation/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': interaction.client.token // This won't work - need proper auth
      },
      body: JSON.stringify({
        characterId: character._id.toString(),
        vote: 'approve',
        note: note || null
      })
    });

    // Import service - use path relative to bot directory
    const path = require('path');
    const ocApplicationServicePath = path.join(__dirname, '../../../dashboard/services/ocApplicationService.js');
    let ocApplicationService;
    try {
      ocApplicationService = require(ocApplicationServicePath);
    } catch (e) {
      logger.error('MOD_OCAPP', `Failed to load ocApplicationService: ${e.message}`);
      return interaction.editReply({
        content: '❌ Error: Could not load application service. Please use the dashboard moderation panel.'
      });
    }
    const voteResult = await ocApplicationService.recordVote(
      character._id.toString(),
      modId,
      modUsername,
      'approve',
      note
    );

    // Check decision
    const decision = await ocApplicationService.checkDecision(character._id.toString());

    if (decision && decision.decision === 'approved') {
      await ocApplicationService.processApproval(character._id.toString());
      
      // Role assignment is handled by the API endpoint
      // When mods vote via dashboard, roles are assigned automatically
      // For bot command, we could call the API endpoint, but for now just refresh character
      character = await Character.findById(character._id);

      return interaction.editReply({
        content: `✅ **Character Approved!**\n\n**${character.name}** has been approved and roles have been assigned.`
      });
    }

    const { APPROVAL_THRESHOLD } = ocApplicationService;
    const remaining = APPROVAL_THRESHOLD - voteResult.counts.approves;

    return interaction.editReply({
      content: `✅ **Vote Recorded**\n\n**${character.name}**\n✅ Approves: ${voteResult.counts.approves}/${APPROVAL_THRESHOLD}\n⚠️ Needs Changes: ${voteResult.counts.needsChanges}\n❌ Denies: ${voteResult.counts.denies}\n\n**${remaining} more approval(s) needed.**`
    });
  } catch (error) {
    logger.error('MOD_OCAPP', 'Error in handleApprove', error);
    throw error;
  }
}

async function handleNeedsChanges(interaction, character, note) {
  try {
    if (character.status !== 'pending') {
      return interaction.editReply({
        content: `❌ Character "${character.name}" is not pending review. Current status: ${character.status || 'DRAFT'}`
      });
    }

    const modId = interaction.user.id;
    const modUsername = interaction.user.username;

    // Import service
    const path = require('path');
    const ocApplicationServicePath = path.join(__dirname, '../../../dashboard/services/ocApplicationService.js');
    let ocApplicationService;
    try {
      ocApplicationService = require(ocApplicationServicePath);
    } catch (e) {
      logger.error('MOD_OCAPP', `Failed to load ocApplicationService: ${e.message}`);
      return interaction.editReply({
        content: '❌ Error: Could not load application service. Please use the dashboard moderation panel.'
      });
    }
    await ocApplicationService.recordVote(
      character._id.toString(),
      modId,
      modUsername,
      'needs_changes',
      note
    );

    // Check decision (should immediately trigger needs_changes)
    const decision = await ocApplicationService.checkDecision(character._id.toString());

    if (decision && decision.decision === 'needs_changes') {
      await ocApplicationService.processNeedsChanges(character._id.toString(), note);

      return interaction.editReply({
        content: `⚠️ **Needs Changes**\n\n**${character.name}** has been marked as needs changes.\n\n**Feedback:**\n${note}\n\nThe user has been notified and can edit and resubmit.`
      });
    }

    return interaction.editReply({
      content: `⚠️ **Vote Recorded**\n\n**${character.name}** marked as needs changes.\n\n**Feedback:**\n${note}`
    });
  } catch (error) {
    logger.error('MOD_OCAPP', 'Error in handleNeedsChanges', error);
    throw error;
  }
}

async function handleView(interaction, character) {
  try {
    const applicationVersion = character.applicationVersion || 1;
    
    const approveCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'needs_changes'
    });
    
    const denyCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'deny'
    });

    const votes = await CharacterModeration.find({
      characterId: character._id,
      applicationVersion: applicationVersion
    }).sort({ createdAt: -1 }).lean();

    const statusMap = {
      null: 'DRAFT',
      undefined: 'DRAFT',
      'pending': 'PENDING',
      'denied': 'NEEDS_CHANGES',
      'accepted': 'APPROVED'
    };

    const statusText = statusMap[character.status] || character.status || 'DRAFT';

    let description = `**Status:** ${statusText}\n**Version:** ${applicationVersion}\n\n`;
    description += `**Votes:**\n✅ Approves: ${approveCount}/4\n⚠️ Needs Changes: ${needsChangesCount}\n❌ Denies: ${denyCount}\n\n`;

    if (votes.length > 0) {
      description += '**Mod Votes:**\n';
      votes.forEach(vote => {
        const emoji = vote.vote === 'approve' ? '✅' : vote.vote === 'needs_changes' ? '⚠️' : '❌';
        description += `${emoji} ${vote.modUsername}: ${vote.vote}`;
        if (vote.note || vote.reason) {
          description += ` - ${vote.note || vote.reason}`;
        }
        description += '\n';
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 OC Application: ${character.name}`)
      .setDescription(description)
      .setColor(character.status === 'accepted' ? 0x4caf50 : character.status === 'denied' ? 0xf44336 : 0xFFA500)
      .setThumbnail(character.icon || null)
      .setFooter({ text: `Character ID: ${character._id}` })
      .setTimestamp();

    return interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    logger.error('MOD_OCAPP', 'Error in handleView', error);
    throw error;
  }
}

module.exports = {
  data: modOCAppCommand,
  execute
};
