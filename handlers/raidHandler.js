const { EmbedBuilder } = require('discord.js');
const { storeBattleProgress, generateBattleId } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');

async function triggerRaid(character, monster, interaction) {
  try {
    const battleId = generateBattleId();

    // Define monster hearts for the raid
    const monsterHearts = {
      max: monster.hearts,
      current: monster.hearts
    };

    // Store the new battle progress
    await storeBattleProgress(
      battleId,
      character, // Character object
      monster, // Monster object
      monster.tier, // Monster tier
      monsterHearts, // Monster hearts
      'Raid initiated! Player turn next.'
    );

    // Retrieve monster image
    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;

    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`🛡️ **Raid initiated!**`)
      .setDescription(`**Monster**: ${monster.name} (Tier ${monster.tier})`)
      .addFields(
        { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
        { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false }
      )
      .setAuthor({ name: character.name, iconURL: character.icon }) // Character icon as the author icon
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Default image
      .setFooter({
        text: `Use /raid id:${battleId} charactername: to join or continue the raid!\nUse /itemheal charactername: to heal during the raid!`
      })
      .setColor('#FF0000');

    // Only set the thumbnail if the image URL is valid
    if (monsterImage && monsterImage.startsWith('http')) {
      embed.setThumbnail(monsterImage);
    }

    // Send the embed to Discord
    await interaction.followUp({ embeds: [embed] });

    console.log(`[RAID] Raid successfully triggered for monster "${monster.name}" (Tier ${monster.tier}) by character "${character.name}"`);
    return battleId;
  } catch (error) {
    console.error(`[RAID] Failed to trigger raid:`, error);
    await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
  }
}

module.exports = { triggerRaid };
