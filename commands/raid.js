// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Local service and module imports
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { fetchMonsterByName } = require('../database/monsterService');
const { processBattle } = require('../modules/damageModule');
const { storeBattleProgress, getBattleProgressById } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');
const { processLoot } = require('../modules/lootModule');
const {
  createMonsterEncounterEmbed,
  createNoEncounterEmbed,
  createKOEmbed,
} = require('../embeds/mechanicEmbeds');

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

      // ------------------- Fetch the Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character || !character.name) {
          console.log("[ERROR] Character not found.");
          await interaction.editReply('❌ **Character not found.**');
          return;
      }

      if (!character.inventorySynced) {
          console.log("[ERROR] Inventory not synced.");
          await interaction.editReply({
              content: `❌ **You cannot use the raid command because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup> and then </syncinventory> commands to initialize the inventory.**`,
              ephemeral: true,
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
      const battleProgress = await getBattleProgressById(battleId);
      if (!battleProgress) {
          console.log("[ERROR] Raid not found.");
          await interaction.editReply(`❌ **No raid found with ID \`${battleId}\`.**`);
          return;
      }

      const currentMonster = await fetchMonsterByName(battleProgress.monster);
      if (!currentMonster) {
          console.log("[ERROR] Monster not found.");
          await interaction.editReply('❌ **The monster in this raid could not be found.**');
          return;
      }

      // ------------------- Check for Existing User Entry -------------------
      const existingUserCharacter = battleProgress.characters.find(
        (char) => char.userId === userId && char.name !== characterName
    );
    
    if (existingUserCharacter) {
        console.log(`[ERROR] User ${userId} already has a character (${existingUserCharacter.name}) in the raid.`);
        await interaction.editReply(
            `❌ **You already have a character ("${existingUserCharacter.name}") in this raid. You cannot join with another character.**`
        );
        return;
    }

      // ------------------- Generate a Random Dice Roll -------------------
      const originalRoll = Math.floor(Math.random() * 100) + 1;

      try {
          // ------------------- Process the Battle -------------------
          const battleOutcome = await processBattle(character, currentMonster, battleId, originalRoll, interaction);

          if (!battleOutcome || typeof battleOutcome !== 'object') {
              console.error('[ERROR] Invalid battle outcome.');
              await interaction.editReply('⚠️ **An error occurred during the battle.**');
              return;
          }

          // Ensure battleResult is defined, with a fallback value
          const {
              result: battleResult = 'No result available.', // Fallback message for undefined results
              adjustedRandomValue = originalRoll,
              attackSuccess = false,
              defenseSuccess = false
          } = battleOutcome;

          const buffEffect = adjustedRandomValue - originalRoll || 0;
          let buffMessage = '';

          if (attackSuccess || defenseSuccess) {
              const buffSource = attackSuccess ? 'weapon' : 'armor';
              buffMessage = `🛡️ **Your ${buffSource} helped!**\n\n`;
          }

        // ------------------- Create Embed -------------------
          const updatedBattleProgress = await getBattleProgressById(battleId);
          const monsterHeartsCurrent = updatedBattleProgress.monsterHearts.current || 0;
          const monsterHeartsMax = updatedBattleProgress.monsterHearts.max;

          const monsterData = monsterMapping[currentMonster.nameMapping] || {};
          const monsterImage = monsterData.image || currentMonster.image || 'https://via.placeholder.com/150'; // Fallback image

          console.log(`[EMBED LOG] Creating battle embed for ${character.name}'s turn.`);

          const embed = new EmbedBuilder()
              .setAuthor({ 
                  name: `${character.name}'s Turn!`, 
                  iconURL: character.icon || 'https://via.placeholder.com/50' // Fallback icon if character icon is missing 
              })
              .setTitle(`⚔️ **Battle Continues!**`)
              .setDescription(
                  `${battleResult}\n${buffMessage}\n` +
                  `📢 **Commands to Engage:**\n` +
                  `> 🔥 **Continue the Raid:** Use </raid:1319247998412132384> \n` +
                  `> 💊 **Heal During Raid:** Use </item:1306176789755858979> \n`
              )
              .addFields(
                  { name: `💙 __Monster Hearts__`, value: `> ${monsterHeartsCurrent} / ${monsterHeartsMax}`, inline: false },
                  { name: `❤️ __${character.name} Hearts__`, value: `> ${character.currentHearts} / ${character.maxHearts}`, inline: false },
                  { name: `🎲 __Dice Roll__`, value: `> ${originalRoll} -> ${adjustedRandomValue}`, inline: false },
                  { 
                      name: `🔢 __Battle ID__`, 
                      value: `\`\`\`${battleId}\`\`\``, 
                      inline: false 
                  },
                  { name: `📜 __Turn Order__`, value: updatedBattleProgress.characters.map((char) => `> ${char.name}`).join('\n'), inline: false }
              )
              .setThumbnail(monsterImage.startsWith('http') ? monsterImage : 'https://via.placeholder.com/150') // Ensure valid thumbnail
              .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Main image
              .setFooter({ text: "⚠️ Act Quickly! You have 10 minutes to complete this raid!" })
              .setColor('#FF4500');

          // Add thumbnail if the monster image is valid
          if (monsterImage && monsterImage.startsWith('http')) {
              embed.setThumbnail(monsterImage);
          }

          // Post the embed
          await interaction.editReply({ embeds: [embed] });

          // Check if monster is defeated
          if (updatedBattleProgress.monsterHearts.current <= 0) {
              await processLoot(updatedBattleProgress, currentMonster, interaction, battleId);
          }
      } catch (error) {
          console.error('[ERROR] Error during battle processing:', error);
          await interaction.editReply('⚠️ **An error occurred during the battle.**');
      }
  } catch (error) {
      console.error('[ERROR] Error executing command:', error);
      await interaction.editReply('⚠️ **An error occurred.**');
  }
},

};
