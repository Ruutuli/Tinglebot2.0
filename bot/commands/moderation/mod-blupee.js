// ============================================================================
// Mod: Blupee minigame — spawn appearances in town halls / test channel
// ============================================================================

const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { connectToTinglebot } = require('@/database/db');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const {
  postBlupeeSpawn,
  getBlupeeStatusSnapshot,
  isBlupeeGloballyEnabled,
  isBlupeeAutoSpawnEnabled,
  BLUPEE_AUTO_SPAWNS_PER_DAY,
  testChannelRequiresSpawn,
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

      const target = interaction.options.getChannel('channel') || interaction.channel;
      if (!target || !target.isTextBased()) {
        return interaction.editReply({
          content: '❌ Choose a text channel or run this command in a text channel.'
        });
      }

      try {
        const { message, stateKey } = await postBlupeeSpawn(target);
        return interaction.editReply({
          content: `✅ Blupee spawned in ${target} (${stateKey}). [Jump to message](${message.url})`
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
        `**BLUPEE_ENABLED:** ${isBlupeeGloballyEnabled() ? 'true' : 'false'}`,
        `**April auto-spawn (UTC):** ${isBlupeeAutoSpawnEnabled() ? `on — ${BLUPEE_AUTO_SPAWNS_PER_DAY} random times/day per town hall` : 'off (needs BLUPEE_ENABLED; set BLUPEE_AUTO_SPAWN=false to disable only auto)'}`,
        `**Test channel ID:** \`${TEST_CHANNEL_ID}\` (this channel matches: ${channel.id === TEST_CHANNEL_ID || channel.parentId === TEST_CHANNEL_ID ? 'yes' : 'no'})`,
        `**BLUPEE_TEST_REQUIRE_SPAWN:** ${testChannelRequiresSpawn() ? 'true' : 'false'} (legacy; real spawn always required)`,
        '**Rupees:** internal tally only (no inventory item)',
        `**State key (this context):** \`${stateKey}\``,
        `**Active spawn doc:** ${snap.active ? 'yes' : 'no'}`,
        snap.active
          ? `**Spawn:** message \`${snap.messageId || 'virtual'}\` · virtual: ${snap.virtual ? 'yes' : 'no'}`
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
