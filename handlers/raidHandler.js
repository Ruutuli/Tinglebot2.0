// ------------------- Import Dependencies -------------------
const { EmbedBuilder } = require('discord.js');
const { storeBattleProgress, generateBattleId, deleteBattleProgressById } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');
const { updateVillageHealth, getVillageInfo } = require('../modules/villageModule');
const { capitalizeFirstLetter } = require('../modules/locationsModule');

// ------------------- Function to Trigger a Raid -------------------
async function triggerRaid(character, monster, interaction, threadId, isBloodMoon) {

  // ------------------- Define Monster Hearts -------------------
  const monsterHearts = {
      max: monster.hearts,
      current: monster.hearts,
  };

  // ------------------- Generate Battle ID -------------------
  const battleId = generateBattleId();

  // ------------------- Create Embed -------------------
  const monsterData = monsterMapping[monster.nameMapping] || {};
  const monsterImage = monsterData.image || monster.image;

  const embed = new EmbedBuilder()
  .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
  .setDescription(
    `Use </raid:1315149690634768405> id:${battleId} to join or continue the raid!\n
    Use </itemheal:1306176789755858979> to heal during the raid!`
    
)
  .addFields(
      { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
      { name: `__${character.name} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
      { name: `__Battle ID__`, value: `\`${battleId}\``, inline: false } // Add backticks to make it a code block
    )
  .setAuthor({ name: character.name, iconURL: character.icon })
  .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
  .setFooter({
      text: `You have 10 minutes to complete this raid!`
  })
  .setColor(isBloodMoon ? '#FF4500' : '#FF0000');


  if (monsterImage && monsterImage.startsWith('http')) {
      embed.setThumbnail(monsterImage);
  }

  let thread;
  try {
      if (!threadId) {

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

          // Ping the user who initiated the raid
          await thread.send(`<@${interaction.user.id}> has initiated a raid! Prepare to face ${monster.name} (Tier ${monster.tier}).`);
      } else {
          thread = interaction.guild.channels.cache.get(threadId);

          if (!thread) {
              await interaction.followUp(`❌ **Unable to locate the raid thread. Please try again later.**`);
              return;
          }

          // Send the embed to the existing thread
          await thread.send({ embeds: [embed] });
      }
  } catch (error) {
      await interaction.followUp(`❌ **Unable to create or update a thread for the raid. Please try again later.**`);
      return;
  }

  // ------------------- Helper Function -------------------
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ------------------- Function to Apply Damage After Timer -------------------
function applyVillageDamage(threadId, villageName, battleId, interaction) {

    const damageAmount = 10; // Arbitrary damage value
    const capitalizedVillageName = capitalizeFirstLetter(villageName);

    updateVillageHealth(villageName, -damageAmount)
        .then(async () => {

            const guild = interaction.guild; // Ensure interaction.guild is used directly
            const thread = guild.channels.cache.get(threadId);

            if (thread) {
                // Retrieve additional village information
                const villageInfo = await getVillageInfo(villageName); // Assuming this function returns village details
                const villageLevel = villageInfo ? villageInfo.level : "Unknown";

                const failureEmbed = new EmbedBuilder()
                .setTitle(`❌ The Raid Has Failed!`)
                .setDescription(
                    `The village **${capitalizedVillageName}** was overwhelmed by an attack from **${monster.name}** and has taken **${damageAmount}** damage!\n\n` +
                    `**${capitalizedVillageName}** is currently at **level ${villageLevel}**.`
                )
                .setImage(monster.image || 'https://pm1.aminoapps.com/6485/abe8c0c1f74bcc7eab0542eb1358f51be08c8beb_00.jpg')
                .setColor('#FF0000')
                .setFooter({ text: "Better luck next time!" });
            

                // Log the embed object for debugging

                // Send the embed to the thread
                thread.send({ embeds: [failureEmbed] })

                    .catch(err => {

                    });

                // Archive the thread
                thread.setArchived(true)

            } else {

            }

            // Log the failure to the console


            // Delete the raid from battleProgress.json

            deleteBattleProgressById(battleId)

        })
        .catch(err => {
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

        // Start a 30-second (for testing) or 30-minute timer
        const timerDuration = 10 * 60 * 1000; // 10 minutes
        setTimeout(() => {
            applyVillageDamage(threadId, character.currentVillage || "Unknown Village", battleId, interaction);
        }, timerDuration); 
     

        return battleId;
    } catch (error) {
        await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
    }
}

// ------------------- Export Function -------------------
module.exports = { triggerRaid };
