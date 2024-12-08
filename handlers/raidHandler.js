// ------------------- Import Dependencies -------------------
const { EmbedBuilder } = require('discord.js');
const { storeBattleProgress, generateBattleId } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');

// ------------------- Function to Trigger a Raid -------------------
async function triggerRaid(character, monster, interaction, threadId, isBloodMoon) {
  console.log(`[DEBUG] triggerRaid called with threadId: ${threadId}`);

  // ------------------- Define Monster Hearts -------------------
  const monsterHearts = {
      max: monster.hearts,
      current: monster.hearts,
  };

  // ------------------- Generate Battle ID -------------------
  const battleId = generateBattleId();
  console.log(`[DEBUG] Battle ID generated: ${battleId}`);

  // ------------------- Create Embed -------------------
  const monsterData = monsterMapping[monster.nameMapping] || {};
  const monsterImage = monsterData.image || monster.image;

  const embed = new EmbedBuilder()
      .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
      .setDescription(`**Monster**: ${monster.name} (Tier ${monster.tier})`)
      .addFields(
          { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
          { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false }
      )
      .setAuthor({ name: character.name, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({
          text: `Use /raid id:${battleId} charactername: to join or continue the raid!\nUse /itemheal charactername: to heal during the raid!`
      })
      .setColor(isBloodMoon ? '#FF4500' : '#FF0000');

  if (monsterImage && monsterImage.startsWith('http')) {
      embed.setThumbnail(monsterImage);
  }

  let thread;
  try {
      if (!threadId) {
          console.log(`[DEBUG] No threadId provided. Sending embed and attempting to create a thread.`);

          const emoji = isBloodMoon ? '🔴' : '🛡️';
          const threadName = `${emoji} ${character.currentVillage || 'Unknown Village'} - ${monster.name} (Tier ${monster.tier})`;

          // Replace the deferred reply with the embed
          await interaction.editReply({ embeds: [embed] });

          // Create a thread from the reply message
          thread = await interaction.fetchReply().then(message =>
              message.startThread({
                  name: threadName,
                  autoArchiveDuration: 1440,
                  reason: `Raid initiated for ${character.name} against ${monster.name}`,
              })
          );

          threadId = thread.id; // Update threadId with the new thread's ID
          console.log(`[RAID] New thread created: ${thread.name} with ID: ${threadId}`);

          // Ping the user who initiated the raid
          await thread.send(`<@${interaction.user.id}> has initiated a raid! Prepare to face ${monster.name} (Tier ${monster.tier}).`);
      } else {
          console.log(`[DEBUG] Using existing threadId: ${threadId}`);
          thread = interaction.guild.channels.cache.get(threadId);

          if (!thread) {
              console.error(`[RAID] Thread with ID "${threadId}" could not be found.`);
              await interaction.followUp(`❌ **Unable to locate the raid thread. Please try again later.**`);
              return;
          }

          // Send the embed to the existing thread
          console.log(`[DEBUG] Sending embed to existing thread: ${thread.name}`);
          await thread.send({ embeds: [embed] });
      }
  } catch (error) {
      console.error(`[RAID] Failed during thread handling: ${error.message}`);
      await interaction.followUp(`❌ **Unable to create or update a thread for the raid. Please try again later.**`);
      return;
  }

  // ------------------- Store Battle Progress -------------------
  try {
      await storeBattleProgress(
          battleId,
          character,
          monster,
          monster.tier,
          monsterHearts,
          threadId,
          isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Player turn next.'
      );

      console.log(`[RAID] Raid successfully triggered for monster "${monster.name}" (Tier ${monster.tier}) by character "${character.name}"`);
      return battleId;
  } catch (error) {
      console.error(`[RAID] Failed to trigger raid:`, error);
      await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
  }
}


// ------------------- Export Function -------------------
module.exports = { triggerRaid };
