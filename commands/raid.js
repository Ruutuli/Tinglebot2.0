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
    console.log("[DEBUG] Command execution started.");

    // ------------------- Defer the Reply -------------------
    await interaction.deferReply();
    console.log("[DEBUG] Reply deferred.");

    // Extract options from the interaction
    const battleId = interaction.options.getString('id');
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;

    console.log(`[DEBUG] Received inputs - Battle ID: ${battleId}, Character Name: ${characterName}, User ID: ${userId}`);

    // ------------------- Fetch the Character -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character || !character.name) {
      console.log("[ERROR] Character not found.");
      await interaction.editReply('❌ **Character not found.**');
      return;
    }

    console.log(`[DEBUG] Fetched character: ${character.name}`);

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
      await interaction.editReply(`❌ **${character.name} is KO'd and cannot take any further actions.**`);
      return;
    }

    console.log("[DEBUG] Character is valid and ready.");

    // ------------------- Retrieve Existing Raid Progress -------------------
    const battleProgress = await getBattleProgressById(battleId);
    if (!battleProgress) {
      console.log("[ERROR] Raid not found.");
      await interaction.editReply(`❌ **No raid found with ID \`${battleId}\`.**`);
      return;
    }

    console.log("[DEBUG] Fetched raid progress:", battleProgress);

    const currentMonster = await fetchMonsterByName(battleProgress.monster);
    if (!currentMonster) {
      console.log("[ERROR] Monster not found.");
      await interaction.editReply('❌ **The monster in this raid could not be found.**');
      return;
    }

    console.log(`[DEBUG] Fetched monster: ${currentMonster.name}`);

    // ------------------- Generate a Random Dice Roll -------------------
    const originalRoll = Math.floor(Math.random() * 100) + 1;
    console.log(`[DEBUG] Dice roll generated: ${originalRoll}`);

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
    
      console.log(`[DEBUG] Battle result: ${battleResult}`);
      console.log(`[DEBUG] Buff message: ${buffMessage}`);
      
      // ------------------- Create Embed -------------------
      const updatedBattleProgress = await getBattleProgressById(battleId);
      const monsterHeartsCurrent = updatedBattleProgress.monsterHearts.current || 0;
      const monsterHeartsMax = updatedBattleProgress.monsterHearts.max;
    
      const monsterData = monsterMapping[currentMonster.nameMapping] || {};
const monsterImage = monsterData.image || currentMonster.image || null; // Ensure monsterImage is defined

console.log(`[DEBUG] Monster image: ${monsterImage}`);

const embed = new EmbedBuilder()
  .setTitle(`${character.name}'s Turn!`)
  .setDescription(
    `${battleResult}\n${buffMessage}\n\n` +
    `Use </raid:1315149690634768405> id:${battleId} to join or continue the raid!\n` +
    `Use </itemheal:1306176789755858979> to heal during the raid!`
  )
  .addFields(
    { name: `__Monster Hearts__`, value: `💙 ${monsterHeartsCurrent}/${monsterHeartsMax}`, inline: false },
    { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
    { name: '__Dice Roll__', value: `🎲 ${originalRoll} -> ${adjustedRandomValue}`, inline: false },
    { name: `__Battle ID__`, value: `\`${battleId}\``, inline: false },
    { name: '__Turn Order__', value: updatedBattleProgress.characters.join('\n'), inline: false }
  )
  .setAuthor({ name: character.name, iconURL: character.icon })
  .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Main image
  .setFooter({ text: "You have 10 minutes to complete this raid!" })
  .setColor('#FF0000');

// Add thumbnail if the monster image is valid
if (monsterImage && monsterImage.startsWith('http')) {
  embed.setThumbnail(monsterImage);
}

// Post the embed
await interaction.editReply({ embeds: [embed] });
console.log('[DEBUG] Embed posted successfully.');
    
      // Check if monster is defeated
      if (updatedBattleProgress.monsterHearts.current <= 0) {
        console.log('[DEBUG] Monster defeated.');
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
