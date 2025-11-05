// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Discord.js Components -------------------
const {
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');

// ------------------- Database Connections -------------------
const { connectToTinglebot } = require('../../database/db');

// ------------------- Secret Santa Admin Handlers -------------------
const {
  handleMatch,
  handlePreview,
  handleApprove,
  handleSettings,
  handleParticipants,
  handleEditMatch,
  handleBlacklist
} = require('../utility/secretsanta');

// ------------------- Utility Functions -------------------
const { handleInteractionError } = require('../../utils/globalErrorHandler');

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

const modSecretSantaCommand = new SlashCommandBuilder()
  .setName('mod-secretsanta')
  .setDescription('🎁 Manage Roots Secret Santa event')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)

  // ------------------- Subcommand: match -------------------
  .addSubcommand(sub =>
    sub
      .setName('match')
      .setDescription('Generate matches (pending approval)')
  )

  // ------------------- Subcommand: preview -------------------
  .addSubcommand(sub =>
    sub
      .setName('preview')
      .setDescription('Preview pending matches')
  )

  // ------------------- Subcommand: approve -------------------
  .addSubcommand(sub =>
    sub
      .setName('approve')
      .setDescription('Approve and send matches via DM')
  )

  // ------------------- Subcommand: settings -------------------
  .addSubcommand(sub =>
    sub
      .setName('settings')
      .setDescription('Update deadlines and signup status')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('What to update')
          .setRequired(true)
          .addChoices(
            { name: 'Open Signups', value: 'open' },
            { name: 'Close Signups', value: 'close' },
            { name: 'Set Signup Deadline', value: 'signup_deadline' },
            { name: 'Set Submission Deadline', value: 'submission_deadline' }
          )
      )
      .addStringOption(option =>
        option
          .setName('date')
          .setDescription('Date in YYYY-MM-DD format (for deadline updates)')
          .setRequired(false)
      )
  )

  // ------------------- Subcommand: participants -------------------
  .addSubcommand(sub =>
    sub
      .setName('participants')
      .setDescription('View all participants')
  )

  // ------------------- Subcommand: editmatch -------------------
  .addSubcommand(sub =>
    sub
      .setName('editmatch')
      .setDescription('Manually edit a match')
      .addUserOption(option =>
        option
          .setName('santa')
          .setDescription('The Secret Santa')
          .setRequired(true)
      )
      .addUserOption(option =>
        option
          .setName('giftee')
          .setDescription('The giftee')
          .setRequired(true)
      )
  )

  // ------------------- Subcommand: blacklist -------------------
  .addSubcommand(sub =>
    sub
      .setName('blacklist')
      .setDescription('Manage blacklist')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('What to do')
          .setRequired(true)
          .addChoices(
            { name: 'Add User', value: 'add' },
            { name: 'Remove User', value: 'remove' },
            { name: 'View Blacklist', value: 'view' }
          )
      )
      .addStringOption(option =>
        option
          .setName('username')
          .setDescription('Username or user ID to add/remove (required for add/remove)')
          .setRequired(false)
      )
  );

// ============================================================================
// ------------------- Execute Command Handler -------------------
// ============================================================================

async function execute(interaction) {
  try {
    await connectToTinglebot();

    // Defer reply for secretsanta commands (handlers will handle permission checks)
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (deferError) {
      console.error('[mod-secretsanta.js]: Failed to defer reply:', deferError);
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'match') {
      return await handleMatch(interaction);
    } else if (subcommand === 'preview') {
      return await handlePreview(interaction);
    } else if (subcommand === 'approve') {
      return await handleApprove(interaction);
    } else if (subcommand === 'settings') {
      return await handleSettings(interaction);
    } else if (subcommand === 'participants') {
      return await handleParticipants(interaction);
    } else if (subcommand === 'editmatch') {
      return await handleEditMatch(interaction);
    } else if (subcommand === 'blacklist') {
      return await handleBlacklist(interaction);
    } else {
      return await interaction.editReply({
        content: '❌ Unknown Secret Santa subcommand.'
      });
    }
  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-secretsanta.js',
      subcommand: interaction.options?.getSubcommand()
    });
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  data: modSecretSantaCommand,
  execute
};

