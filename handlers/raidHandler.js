// ------------------- Import Dependencies -------------------
const { EmbedBuilder } = require('discord.js');
const { storeBattleProgress, generateBattleId, deleteBattleProgressById } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');
const { updateVillageHealth, getVillageInfo } = require('../modules/villageModule');
const { capitalizeFirstLetter } = require('../modules/locationsModule');

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

  // ------------------- Helper Function -------------------
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ------------------- Function to Apply Damage After Timer -------------------
function applyVillageDamage(threadId, villageName, battleId, interaction) {
    console.log(`[RAID] The raid timer expired for thread ID: ${threadId}. Applying damage to village: ${villageName}.`);

    const damageAmount = 10; // Arbitrary damage value
    const capitalizedVillageName = capitalizeFirstLetter(villageName);

    console.log(`[RAID] Attempting to apply ${damageAmount} damage to village: ${capitalizedVillageName}.`);

    updateVillageHealth(villageName, -damageAmount)
        .then(async () => {
            console.log(`[RAID] Successfully applied ${damageAmount} damage to village: ${capitalizedVillageName}.`);

            const guild = interaction.guild; // Ensure interaction.guild is used directly
            console.log(`[DEBUG] Attempting to fetch thread with ID: ${threadId}`);
            const thread = guild.channels.cache.get(threadId);
            console.log(`[DEBUG] Fetched thread: ${thread ? thread.name : 'Thread not found'}`);

            if (thread) {
                // Retrieve additional village information
                const villageInfo = await getVillageInfo(villageName); // Assuming this function returns village details
                const villageLevel = villageInfo ? villageInfo.level : "Unknown";

                const failureEmbed = new EmbedBuilder()
                    .setTitle(`❌ The Raid Has Failed!`)
                    .setDescription(
                        `The village **${capitalizedVillageName}** was overwhelmed by an attack from **Blue-Maned Lynel** and has taken **${damageAmount}** damage!\n\n` +
                        `**${capitalizedVillageName}** is currently at **level ${villageLevel}**.`
                    )
                    .setImage('https://pm1.aminoapps.com/6485/abe8c0c1f74bcc7eab0542eb1358f51be08c8beb_00.jpg')
                    .setColor('#FF0000')
                    .setFooter({ text: "Better luck next time!" });

                // Log the embed object for debugging
                console.log(`[DEBUG] Failure embed object:`, failureEmbed.toJSON());

                // Send the embed to the thread
                thread.send({ embeds: [failureEmbed] })
                    .then(() => console.log(`[RAID] Failure embed sent to thread ID: ${threadId}.`))
                    .catch(err => {
                        console.error(`[RAID] Failed to send failure embed to thread ID: ${threadId}.`, err);
                        console.error(`[DEBUG] Check bot permissions or embed structure.`);
                    });

                // Archive the thread
                thread.setArchived(true)
                    .then(() => console.log(`[RAID] Thread ID: ${threadId} successfully archived.`))
                    .catch(err => console.error(`[RAID] Failed to archive thread ID: ${threadId}.`, err));
            } else {
                console.error(`[RAID] Could not find thread with ID: ${threadId}.`);
            }

            // Log the failure to the console
            console.log(`[RAID] Raid failed for Battle ID: ${battleId}, Village: ${capitalizedVillageName}`);

            // Delete the raid from battleProgress.json
            console.log(`[RAID] Deleting battle progress for ID: ${battleId}`);
            deleteBattleProgressById(battleId)
                .then(() => console.log(`[RAID] Battle progress deleted for ID: ${battleId}`))
                .catch(err => console.error(`[RAID] Error deleting battle progress for ID: ${battleId}`, err));
        })
        .catch(err => {
            console.error(`[RAID] Failed to apply ${damageAmount} damage to village: ${capitalizedVillageName}.`, err);
        });
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

        // Start a 30-second (for testing) or 30-minute timer
        const timerDuration = 30 * 1000; // 30 seconds for testing
        setTimeout(() => {
            applyVillageDamage(threadId, character.currentVillage || "Unknown Village", battleId, interaction);
        }, timerDuration);
     

        return battleId;
    } catch (error) {
        console.error(`[RAID] Failed to trigger raid:`, error);
        await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
    }
}

// ------------------- Export Function -------------------
module.exports = { triggerRaid };
