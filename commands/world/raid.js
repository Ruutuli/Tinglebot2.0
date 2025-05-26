// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../../utils/characterUtils.js');
// Local service and module imports
const { fetchCharacterByNameAndUserId, fetchMonsterByName } = require('../../database/db.js');
const { processBattle } = require('../../modules/encounterModule.js');
const { 
    getRaidProgressById, 
    updateRaidProgress,
    checkRaidExpiration
} = require('../../modules/raidModule.js');
const { saveBattleProgressToStorage } = require('../../utils/storage.js');
const { monsterMapping } = require('../../models/MonsterModel.js');
const { processLoot } = require('../../modules/lootModule.js');
const {
  createKOEmbed,
} = require('../../embeds/embeds.js');
const { generateDamageMessage, generateVictoryMessage } = require('../../modules/flavorTextModule.js');

// ------------------- Command Setup -------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Join or process an ongoing raid to fight a powerful monster.')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Raid ID to check progress or join')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)),

// ------------------- Main Execution Function -------------------
async execute(interaction) {
  try {
      // ------------------- Defer the Reply -------------------
      await interaction.deferReply();

      // Extract options from the interaction
      const battleId = interaction.options.getString('id');
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // Validate battle ID format
      if (!battleId.match(/^[RP]\d{6}$/)) {
          console.error(`[ERROR] Invalid battle ID format: ${battleId}`);
          await interaction.editReply('❌ **Invalid battle ID format. Battle IDs should be in the format of a single letter (R or P) followed by 6 digits (e.g., R123456).**');
          return;
      }

      // ------------------- Fetch the Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character || !character.name) {
          console.log("[ERROR] Character not found.");
          await interaction.editReply('❌ **Character not found.**');
          return;
      }

      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          content: error.message,
          ephemeral: true
        });
        return;
      }

      if (character.currentHearts <= 0 || character.ko) {
          console.log(`[ERROR] Character ${character.name} is KO'd.`);

          const koEmbed = createKOEmbed(character);
          await interaction.editReply({
              content: `❌ **${character.name} is KO'd and cannot take any further actions.**`,
              embeds: [koEmbed], // Add KO embed here
          });

          return;
      }

      // ------------------- Retrieve Existing Raid Progress -------------------
      const battleProgress = await getRaidProgressById(battleId);
      if (!battleProgress) {
          console.error(`[ERROR] No battle progress found for Battle ID: ${battleId}`);
          await interaction.editReply('❌ **An error occurred during the battle: Battle progress not found.**');
          return;
      }

      // Check if raid has expired using the new function
      const isExpired = await checkRaidExpiration(battleId);
      if (isExpired) {
          console.log(`[raid.js]: ⚠️ Raid ${battleId} has expired`);
          await interaction.editReply('❌ **This raid has ended. You cannot join or continue an expired raid.**');
          return;
      }

      // Check if character is in the correct village
      if (character.currentVillage !== battleProgress.villageId) {
          console.log(`[raid.js]: ⚠️ Character ${character.name} is not in the raid's village. Current: ${character.currentVillage}, Required: ${battleProgress.villageId}`);
          await interaction.editReply(`❌ **You must be in ${battleProgress.villageId} to participate in this raid.**`);
          return;
      }

      // ------------------- Check for Existing User Entry -------------------
      const existingUserCharacter = battleProgress.participants.find(
        (p) => p.userId === userId && p.characterName && p.characterName.toLowerCase() === characterName.toLowerCase()
      );
    
      if (existingUserCharacter) {
          console.log(`[ERROR] User ${userId} already has a character (${existingUserCharacter.characterName}) in the raid.`);
          await interaction.editReply(
              `❌ **You already have a character ("${existingUserCharacter.characterName}") in this raid. You cannot join with another character.**`
          );
          return;
      }

      // Add character to participants if not already present
      if (!battleProgress.participants.some(p => p.userId === userId && p.characterName && p.characterName.toLowerCase() === characterName.toLowerCase())) {
          battleProgress.participants.push({
              userId: userId,
              characterName: characterName,
              damage: 0,
              joinedAt: new Date()
          });
          await saveBattleProgressToStorage(battleId, battleProgress);
      }

      // ------------------- Generate a Random Dice Roll -------------------
      const originalRoll = Math.floor(Math.random() * 100) + 1;
      const adjustedRandomValue = originalRoll;

      // ------------------- Process Battle -------------------
      const battleResult = await processBattle(character, battleProgress.monster, battleId, adjustedRandomValue, interaction);
      
      if (!battleResult) {
          console.error(`[raid.js]: ❌ Battle processing failed for ${battleId}`);
          await interaction.editReply('❌ **An error occurred during the battle: Battle processing failed.**');
          return;
      }

      // ------------------- Create Embed -------------------
      console.log(`[raid.js]: 🔄 Creating battle embed for ${character.name}'s turn`);

      const monsterData = monsterMapping[battleProgress.monster.nameMapping] || {};
      const monsterImage = monsterData.image || battleProgress.monster.image || 'https://via.placeholder.com/150';

      // Generate flavor text based on the battle result
      const flavorText = battleResult.isVictory ? 
          generateVictoryMessage(adjustedRandomValue) : 
          generateDamageMessage(battleResult.hearts || 1);

      // Get monster hearts from battle result
      const monsterHearts = battleResult.monsterHearts || battleProgress.monster.hearts;
      const currentHearts = typeof monsterHearts === 'object' ? monsterHearts.current : monsterHearts;
      const maxHearts = typeof monsterHearts === 'object' ? monsterHearts.max : monsterHearts;

      const embed = new EmbedBuilder()
          .setAuthor({ 
              name: `${character.name}'s Turn!`, 
              iconURL: character.icon || 'https://via.placeholder.com/50'
          })
          .setTitle(`⚔️ **Battle Continues!**`)
          .setDescription(
              `${flavorText}\n${battleResult.buffMessage || ''}\n` +
              `📢 **Commands to Engage:**\n` +
              `> </raid:1372378305021607979> to join or continue the raid!\n` +
              `> </item:1372378304773881879> to heal during the raid!`
          )
          .addFields(
              { name: `💙 __Monster Hearts__`, value: `> ${currentHearts} / ${maxHearts}`, inline: false },
              { name: `❤️ __${character.name} Hearts__`, value: `> ${character.currentHearts} / ${character.maxHearts}`, inline: false },
              { name: `🎲 __Dice Roll__`, value: `> ${adjustedRandomValue}`, inline: false },
              { 
                  name: `🔢 __Battle ID__`, 
                  value: `\`\`\`${battleId}\`\`\``, 
                  inline: false 
              },
              { name: `📜 __Participants__`, value: battleProgress.participants.map((p) => `> ${p.characterName}`).join('\n'), inline: false }
          )
          .setThumbnail(monsterImage.startsWith('http') ? monsterImage : 'https://via.placeholder.com/150')
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: "⚠️ Act Quickly! You have 10 minutes to complete this raid!" });

      await interaction.editReply({ embeds: [embed] });

  } catch (error) {
      handleError(error, 'raid.js');
      console.error('[ERROR] Error executing command:', error);
      await interaction.editReply('❌ **An error occurred while processing your command.**');
  }
}

};
