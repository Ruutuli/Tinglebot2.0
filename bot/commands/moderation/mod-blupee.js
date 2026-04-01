// ============================================================================
// Mod: Blupee minigame — spawn appearances in town halls / test channel
// ============================================================================

const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { connectToTinglebot } = require('@/database/db');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const {
  postBlupeeSpawn,
  getBlupeeStatusSnapshot,
  BLUPEE_AUTO_SPAWNS_PER_DAY,
  getBlupeeStateKeyForDiscordChannel,
  TEST_CHANNEL_ID
} = require('../../modules/blupeeModule');

const modBlupeeCommand = new SlashCommandBuilder()
  .setName('mod-blupee')
  .setDescription('✨ Spawn or inspect the Blupee seasonal minigame')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('spawn')
      .setDescription('Post a Blupee in this channel or a chosen channel')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Text channel (defaults to current channel)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName('status').setDescription('Show Blupee config and spawn state for a channel')
  );

async function execute(interaction) {
  try {
    await connectToTinglebot();

    const sub = interaction.options.getSubcommand();

    if (sub === 'spawn') {
      await interaction.deferReply({ ephemeral: true });

      const channelOpt = interaction.options.getChannel('channel');
      let target = channelOpt || null;
      let forcedVillage = null;

      // If no explicit channel is provided, use the dedicated test channel while in test mode
      // but still pick a random village label for validation testing.
      if (!target) {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.editReply({
            content: '❌ Cannot auto-select test channel (missing guild context).'
          });
        }
        const fetched = await guild.channels.fetch(TEST_CHANNEL_ID).catch(() => null);
        if (!fetched || !fetched.isTextBased()) {
          return interaction.editReply({
            content: `❌ Could not fetch a valid text channel for test channel ${TEST_CHANNEL_ID}.`
          });
        }
        target = fetched;
        const villages = ['Rudania', 'Inariko', 'Vhintl'];
        forcedVillage = villages[Math.floor(Math.random() * villages.length)];
      } else if (!target || !target.isTextBased()) {
        return interaction.editReply({
          content: '❌ Choose a text channel.'
        });
      }

      try {
        const { message, stateKey, sessionId, threadId } = await postBlupeeSpawn(target, { forcedVillage });
        const villageSuffix = forcedVillage ? ` · village **${forcedVillage}**` : '';
        const guildId = target.guildId;
        const threadJump =
          guildId && threadId
            ? ` · [Jump to thread](https://discord.com/channels/${guildId}/${threadId})`
            : '';
        return interaction.editReply({
          content: `✅ Blupee spawned in ${target} (${stateKey})${villageSuffix} · session \`${sessionId}\`${threadJump} · [Jump to message](${message.url})`
        });
      } catch (err) {
        handleInteractionError(err, 'mod-blupee.js', {
          commandName: 'mod-blupee spawn',
          userId: interaction.user.id
        });
        return interaction.editReply({
          content: `❌ Could not post spawn: ${err.message || err}`
        });
      }
    }

    if (sub === 'status') {
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.channel;
      const stateKey = getBlupeeStateKeyForDiscordChannel(channel);
      const snap = await getBlupeeStatusSnapshot(stateKey);
      const lines = [
        `**April auto-spawn (UTC):** ${BLUPEE_AUTO_SPAWNS_PER_DAY} random times/day per town hall (April only)`,
        `**Test channel ID:** \`${TEST_CHANNEL_ID}\` (this channel matches: ${channel.id === TEST_CHANNEL_ID || channel.parentId === TEST_CHANNEL_ID ? 'yes' : 'no'})`,
        '**Rupees:** internal tally only (no inventory item)',
        `**State key (this context):** \`${stateKey}\``,
        `**Active spawn doc:** ${snap.active ? 'yes' : 'no'}`,
        snap.active
          ? `**Spawn:** session \`${snap.sessionId || 'unknown'}\` · message \`${snap.messageId || 'virtual'}\` · virtual: ${snap.virtual ? 'yes' : 'no'}`
          : '**Spawn:** none'
      ];
      return interaction.editReply({ content: lines.join('\n') });
    }
  } catch (error) {
    await handleInteractionError(error, interaction, { source: 'mod-blupee.js' });
  }
}

module.exports = {
  data: modBlupeeCommand,
  execute
};
