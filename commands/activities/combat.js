// ============================================================================
// Discord Combat Command - /combat
// This file defines the /combat command with PvP subcommands for challenging 
// and taking turns in combat.
// ============================================================================

// ------------------- Discord.js Components -------------------
// Core Discord.js objects for building commands and message embeds.
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Database Services -------------------
// Services for retrieving character data.
const { fetchCharacterByName, fetchCharacterByNameAndUserId } = require('../../database/characterService');

// ------------------- Modules -------------------
// Combat module functions (alphabetized within this group).
const { getBattleProgressById, startPvPBattle, takePvPTurn, getTotalDefense  } = require('../../modules/combatModule');
const { getGearModLevel } = require('../../modules/gearModule');

// ============================================================================
// /combat Command Definition and Execution
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('combat')
    .setDescription('💥 Engage in PvP or PvE combat!')
    .addSubcommand(sub =>
      sub
        .setName('challenge')
        .setDescription('⚔️ Challenge another character to a PvP duel!')
        .addStringOption(option =>
          option.setName('attacker')
            .setDescription('Your character initiating the duel')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('defender')
            .setDescription('The character you want to fight (must be in the same village)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('attack')
        .setDescription('🎯 Take your turn in an ongoing PvP battle')
        .addStringOption(option =>
          option.setName('attacker')
            .setDescription('Your character taking the turn')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('battleid')
            .setDescription('The battle ID')
            .setRequired(true)
        )
    ),

  // ------------------- Command Execution Logic -------------------
  // Handles both PvP challenge initiation and attack turns.
  async execute(interaction) {
    try {
      await interaction.deferReply();
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;
      const attackerName = interaction.options.getString('attacker');
      const attacker = await fetchCharacterByNameAndUserId(attackerName, userId);

      if (!attacker) {
        return await interaction.editReply(`❌ Character **${attackerName}** was not found or doesn't belong to you.`);
      }

      if (attacker.ko || attacker.currentHearts <= 0) {
        return await interaction.editReply(`💤 **${attacker.name}** is KO’d and cannot fight.`);
      }

      // ------------------- PvP Challenge Subcommand -------------------
      if (subcommand === 'challenge') {
        const defenderName = interaction.options.getString('defender');
        const defender = await fetchCharacterByName(defenderName);

        if (!defender || !defender.name) {
          return await interaction.editReply(`❌ Character **${defenderName}** not found.`);
        }

        if (defender.village !== attacker.village) {
          return await interaction.editReply(`🚫 **${defender.name}** is not in the same village as **${attacker.name}**.`);
        }

        if (defender.ko || defender.currentHearts <= 0) {
          return await interaction.editReply(`💤 **${defender.name}** is KO’d and cannot be attacked.`);
        }

        const battleId = await startPvPBattle(attacker, defender);
        return await interaction.editReply(`⚔️ **${attacker.name}** has challenged **${defender.name}** to a duel!\n🆔 Battle ID: \`${battleId}\``);
      }

      // ------------------- PvP Attack Turn Subcommand -------------------
      if (subcommand === 'attack') {
        const battleId = interaction.options.getString('battleid').trim();
        const battleLog = await takePvPTurn(battleId, attacker, null);
        const updatedBattle = await getBattleProgressById(battleId);

        if (!updatedBattle) {
          console.error(`[combat.js]: ❌ Error - No battle data found after turn for ID: ${battleId}`);
          return await interaction.editReply(`⚠️ Could not load battle data for ID \`${battleId}\`.`);
        }

        if (battleLog.error) {
          return await interaction.editReply(`❌ ${battleLog.error}`);
        }

        const embed = new EmbedBuilder()
        .setTitle(`⚔️ PvP Battle Turn`)
        .setDescription('Turn resolved.')
        .addFields(
          { name: '🆔 Battle ID', value: `\`${battleId}\``, inline: false },
          { name: `❤️ ${attacker.name}`, value: `${attacker.currentHearts} hearts`, inline: true },
          { name: `❤️ ${updatedBattle.characters?.defender?.name || 'Defender'}`, value: `${updatedBattle.characters?.defender?.currentHearts || '?'}`, inline: true },
          { name: '🎲 Roll Breakdown', value: battleLog.message, inline: false },
          { 
            name: '🛡️ Gear Stats', 
            value: `
      **Attacker:**  
      Weapon Mod: **${getGearModLevel(attacker.gearWeapon)}**  
      Armor Defense: **${getTotalDefense(attacker)}**
      
      **Defender:**  
      Armor Defense: **${getTotalDefense(updatedBattle.characters.defender)}**
      Shield Defense: **${updatedBattle.characters.defender.gearShield ? getGearModLevel(updatedBattle.characters.defender.gearShield) : 0}**
            `,
            inline: false 
          }
        )
        .setColor('#ff003c')
        .setFooter({ text: 'Use /combat attack to continue your battle!' });
      

        return await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
    handleError(error, 'combat.js');

      console.error('[combat.js]: ❌ Error in /combat command:', error);
      return await interaction.editReply(`❌ An unexpected error occurred during combat.`);
    }
  }
};
