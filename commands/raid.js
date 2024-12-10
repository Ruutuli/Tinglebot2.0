// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { fetchMonsterByName } = require('../database/monsterService');
const { processBattle } = require('../modules/damageModule');
const { storeBattleProgress, getBattleProgressById } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');
const { processLoot } = require('../modules/lootModule'); // Import loot module

// ------------------- Command Setup for Slash Command -------------------
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
      await interaction.deferReply(); // Ensure the interaction doesn't time out
      const battleId = interaction.options.getString('id'); // Get the battleId from the interaction
      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      // ------------------- Fetch Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character || !character.name) {
        await interaction.editReply('❌ **Character not found.**');
        return;
      }

      // Check if the character's inventory has been synced
if (!character.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot use the raid command because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}


      // ------------------- Handle KO'd Characters -------------------
      if (character.currentHearts <= 0 || character.ko) {
        await interaction.editReply(`❌ **${character.name} is KO'd and cannot take any further actions.**`);
        return;
      }

      // ------------------- Retrieve Existing Raid Progress -------------------
      let battleProgress = await getBattleProgressById(battleId);

      if (!battleProgress) {
        await interaction.editReply(`❌ **No raid found with ID \`${battleId}\`.**`);
        return;
      }

      const currentMonster = await fetchMonsterByName(battleProgress.monster);
      if (!currentMonster) {
        await interaction.editReply('❌ **The monster in this raid could not be found.**');
        return;
      }

      // ------------------- Process Buff Effect and Battle Result -------------------
      const originalRoll = Math.floor(Math.random() * 100) + 1; // Generate the random roll (1 to 100)

      try {
        // Call processBattle and ensure that it returns a valid object
        let battleOutcome = await processBattle(character, currentMonster, battleId, originalRoll, interaction);

        // Ensure battleOutcome is always defined
        if (!battleOutcome || typeof battleOutcome !== 'object') {
          console.error('Error: battleOutcome is undefined or invalid.');
          await interaction.editReply('⚠️ **An error occurred during the battle.**');
          return;
        }

        // Ensure all necessary fields have default values in case of missing properties
        let { result: battleResult = 'No result', adjustedRandomValue = originalRoll, attackSuccess = false, defenseSuccess = false } = battleOutcome;

        // Log the battle outcome for debugging
        console.log('Battle Outcome:', battleOutcome);

        // Continue with the rest of the logic
        const buffEffect = adjustedRandomValue - originalRoll || 0;
        console.log(`Original Dice Roll: ${originalRoll}, Adjusted Random Value: ${adjustedRandomValue}, Buff Effect: ${buffEffect}`);

        let diceRollMessage = `🎲 ${originalRoll} -> ${adjustedRandomValue}`;

        let buffMessage = '';
        if (attackSuccess || defenseSuccess) {
          const buffSource = attackSuccess ? 'weapon' : 'armor';
          buffMessage = `🛡️ **Your ${buffSource} helped!**\n\n`;
        }

        // Retrieve updated battle progress after processing the battle
        const updatedBattleProgress = await getBattleProgressById(battleId);
        const monsterHeartsCurrent = updatedBattleProgress.monsterHearts.current || 0;
        const monsterHeartsMax = updatedBattleProgress.monsterHearts.max;

        const updatedMonsterData = monsterMapping[currentMonster.nameMapping] || {};
        const updatedMonsterImage = updatedMonsterData.image || currentMonster.image;

      // ------------------- Create Embed for Battle Result -------------------
      const embed = new EmbedBuilder()
      .setTitle(`${character.name}'s Turn!`)
      .setDescription(`${battleResult}\n${buffMessage || ''}`)
      .addFields(
          { name: `__Monster Hearts__`, value: `💙 ${monsterHeartsCurrent}/${monsterHeartsMax}`, inline: false },
          { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
          { name: '__Dice Roll__', value: diceRollMessage, inline: false },
          { name: `__Battle ID__`, value: `\`${battleId}\``, inline: false }, // Add backticks to make it a code block
          {
              name: '__Turn Order__',
              value: updatedBattleProgress.characters.join('\n'), // Turn order of characters in the battle displayed on new lines
              inline: false
          }
      )
      .setAuthor({ name: character.name, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Restore default image
      .setFooter({
          text: `Use /raid id:${battleId} charactername: to join or continue the battle!\nUse /itemheal charactername: to heal during the battle!`
      })
      .setColor('#FF0000');
  

      // Set monster image as thumbnail
      if (updatedMonsterImage && updatedMonsterImage.startsWith('http')) {
          embed.setThumbnail(updatedMonsterImage);
      }

      // Determine the next character in the turn order
      const currentIndex = updatedBattleProgress.characters.indexOf(character.name);
      const nextIndex = (currentIndex + 1) % updatedBattleProgress.characters.length; // Loop back to the first character if at the end
      const nextCharacterName = updatedBattleProgress.characters[nextIndex];

      // Fetch user ID of the next character (assuming you have a way to map character names to user IDs)
      const nextCharacter = await fetchCharacterByNameAndUserId(nextCharacterName, interaction.user.id); // Update this if your logic differs

      // Send embed with a message tagging the next character
      await interaction.editReply({ embeds: [embed], content: `<@${nextCharacter.userId}> **${nextCharacter.name} is next!**` });

      // ------------------- Process Battle Conclusion -------------------
      console.log('Checking if monster hearts are 0 or lower...');
      if (updatedBattleProgress.monsterHearts.current <= 0) { // Make sure you're using the updated value
          console.log('Monster hearts are 0 or lower. Monster defeated, triggering loot handling...');

          // Trigger loot handling for all characters
          await processLoot(updatedBattleProgress, currentMonster, interaction, battleId);

          return; // End the function after loot is processed
      }

      console.log('Monster hearts are greater than 0. Continuing battle...');

      } catch (error) {
        console.error('Error during battle:', error);
        await interaction.editReply('⚠️ **An error occurred during the battle.**');
      }
    } catch (error) {
      console.error('Error executing command:', error);
      await interaction.editReply('⚠️ **An error occurred.**');
    }
  },
};
