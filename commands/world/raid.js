// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByName } = require('../../database/db');
const { startRaid, joinRaid, processRaidTurn, checkRaidExpiration, createOrUpdateRaidThread } = require('../../modules/raidModule');
const Character = require('../../models/CharacterModel');

// ============================================================================
// ---- Command Definition ----
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Join and participate in a raid')
    .addStringOption(option =>
      option
        .setName('raidid')
        .setDescription('The ID of the raid to join')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ============================================================================
  // ---- Command Execution ----
  // ============================================================================
  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Get command options
      const raidId = interaction.options.getString('raidid');
      const characterName = interaction.options.getString('charactername');

      // Fetch and validate character
      const character = await fetchCharacterByName(characterName);
      if (!character) {
        return interaction.editReply({
          content: `❌ Character "${characterName}" not found. Please check the spelling and try again.`,
          ephemeral: true
        });
      }

      // Check if character belongs to user
      if (character.userId !== interaction.user.id) {
        return interaction.editReply({
          content: '❌ You can only use your own characters in raids.',
          ephemeral: true
        });
      }

      // Check if character is KO'd
      if (character.ko) {
        return interaction.editReply({
          content: `❌ ${character.name} is KO'd and cannot participate in raids.`,
          ephemeral: true
        });
      }

      // Check raid expiration
      const raidData = await checkRaidExpiration(raidId);
      if (!raidData) {
        return interaction.editReply({
          content: `❌ Raid ${raidId} not found.`,
          ephemeral: true
        });
      }

      if (raidData.status !== 'active') {
        return interaction.editReply({
          content: `❌ This raid is no longer active. Status: ${raidData.status}`,
          ephemeral: true
        });
      }

      // Try to join the raid if not already participating
      let updatedRaidData = raidData;
      const existingParticipant = raidData.participants.find(p => p.characterId === character._id);
      
      if (!existingParticipant) {
        const joinResult = await joinRaid(character, raidId);
        updatedRaidData = joinResult.raidData;
      }

      // Always use updatedRaidData for processRaidTurn
      const turnResult = await processRaidTurn(character, raidId, interaction, updatedRaidData);
      
      // Format the response
      const response = [
        `🎲 **${character.name}'s Turn in Raid ${raidId}**`,
        `Monster: ${updatedRaidData.monster.name} (Tier ${updatedRaidData.monster.tier})`,
        `Monster HP: ${updatedRaidData.monster.hearts.current}/${updatedRaidData.monster.hearts.max}`,
        `Damage Dealt: ${turnResult.battleResult.hearts}`,
        `Total Damage: ${turnResult.participant.damage}`,
        `\n${updatedRaidData.progress}`
      ].join('\n');

      return interaction.editReply(response);

    } catch (error) {
      handleError(error, 'raid.js');
      console.error(`[raid.js]: ❌ Error processing raid command:`, error);
      
      const errorMessage = error.message || 'An unexpected error occurred';
      return interaction.editReply({
        content: `❌ Error: ${errorMessage}`,
        ephemeral: true
      });
    }
  },

}