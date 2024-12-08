// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { getMonstersAboveTier, fetchMonsterByName } = require('../database/monsterService');
const { processBattle } = require('../modules/damageModule');
const { storeBattleProgress, getBattleProgressById, generateBattleId } = require('../modules/combatModule');
const { calculateAttackBuff, calculateDefenseBuff } = require('../modules/buffModule');
const { monsterMapping } = require('../models/MonsterModel');
const { processLoot } = require('../modules/lootModule'); // Import loot module

// ------------------- Command Setup for Slash Command -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Test a monster battle for characters with tier 5 monsters or higher')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Battle ID to check progress or join')
        .setRequired(false)),

// ------------------- Main Execution Function -------------------
async execute(interaction) {
  try {
    await interaction.deferReply();  // Ensure the interaction doesn't time out
    console.log('Interaction deferred. Is this interaction still active?', interaction.deferred);

    const battleId = interaction.options.getString('id');  // Get the battleId from the interaction (if it exists)
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;

    // Fetch character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character || !character.name) {
      await interaction.editReply('❌ **Character not found.**');
      return;
    }

    // Handle KO'd characters
    if (character.currentHearts <= 0 || character.ko) {
      await interaction.editReply(`❌ **${character.name} is KO'd and cannot take any further actions.**`);
      return;
    }

    // ------------------- If no battle ID, start a new battle -------------------
    if (!battleId) {
      const monster = await getMonstersAboveTier(5);
      if (!monster || !monster.name) {
        await interaction.editReply('❌ **No valid monster found.**');
        return;
      }

      // Generate a new battle ID
      const newBattleId = generateBattleId();
      const monsterHearts = {
        max: monster.hearts,
        current: monster.hearts
      };

      // Store the new battle progress
      await storeBattleProgress(newBattleId, character, monster, monster.tier, monsterHearts, 'Battle initiated! Player turn next.');


      // Retrieve the monster image from the monsterMapping, if available
      const monsterData = monsterMapping[monster.nameMapping] || {};
      const monsterImage = monsterData.image || monster.image;

// Create an embed with flavor text, monster image as thumbnail, and default image
const embed = new EmbedBuilder()
  .setTitle(`🛡️ **Battle initiated!**`)
  .setDescription(`**Monster**: ${monster.name} (Tier ${monster.tier})`)
  .addFields(
    { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
    { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false }
  )
  .setAuthor({ name: character.name, iconURL: character.icon })  // Character icon as the author icon
  .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')  // Restore default image
  .setFooter({
    text: `Use /test id:${newBattleId} charactername: to join or continue the battle!\nUse /itemheal charactername: to heal during the battle!`
  })
  .setColor('#FF0000');

if (monsterImage && monsterImage.startsWith('http')) {
  embed.setThumbnail(monsterImage);  // Set the monster's image as a thumbnail
}

await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Retrieve existing battle progress
    let battleProgress = await getBattleProgressById(battleId);

    if (!battleProgress) {
      await interaction.editReply(`❌ **No battle found with ID \`${battleId}\`.**`);
      return;
    }

    const currentMonster = await fetchMonsterByName(battleProgress.monster);
    if (!currentMonster) {
      await interaction.editReply('❌ **The monster in this battle could not be found.**');
      return;
    }

    // ------------------- Process Buff Effect and Battle Result -------------------
    const originalRoll = Math.floor(Math.random() * 100) + 1;  // Generate the random roll (1 to 100)

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

      // Create embed for battle result
      const embed = new EmbedBuilder()
      .setTitle(`${character.name}'s Turn!`)
      .setDescription(`${battleResult}\n${buffMessage || ''}`)
      .addFields(
        { name: `__Monster Hearts__`, value: `💙 ${monsterHeartsCurrent}/${monsterHeartsMax}`, inline: false },
        { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
        { name: '__Dice Roll__', value: diceRollMessage, inline: false },
        {
          name: '__Turn Order__', 
          value: updatedBattleProgress.characters.join('\n'),  // Turn order of characters in the battle displayed on new lines
          inline: false
        }
      )
      .setAuthor({ name: character.name, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')  // Restore default image
      .setFooter({
        text: `Use /test id:${battleId} charactername: to join or continue the battle!\nUse /itemheal charactername: to heal during the battle!`
      })
      .setColor('#FF0000');
    
    // Set monster image as thumbnail
    if (updatedMonsterImage && updatedMonsterImage.startsWith('http')) {
      embed.setThumbnail(updatedMonsterImage);
    }
    
    await interaction.editReply({ embeds: [embed], content: '' });

      // ------------------- Process Battle Conclusion -------------------
      console.log('Checking if monster hearts are 0 or lower...');
      if (updatedBattleProgress.monsterHearts.current <= 0) {  // Make sure you're using the updated value
        console.log('Monster hearts are 0 or lower. Monster defeated, triggering loot handling...');
      
        // Trigger loot handling for all characters
        await processLoot(updatedBattleProgress, currentMonster, interaction, battleId);
      
        return;  // End the function after loot is processed
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
