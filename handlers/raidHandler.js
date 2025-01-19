// ------------------- Import Dependencies -------------------
const { EmbedBuilder } = require('discord.js');
const { storeBattleProgress, generateBattleId, deleteBattleProgressById } = require('../modules/combatModule');
const { monsterMapping } = require('../models/MonsterModel');
const { updateVillageHealth, getVillageInfo } = require('../modules/villageModule');
const { capitalizeFirstLetter } = require('../modules/locationsModule');
const { damageVillage, applyVillageDamage } = require('../modules/villageModule'); 

// ------------------- Function to Trigger a Raid -------------------
async function triggerRaid(character, monster, interaction, threadId, isBloodMoon) {
    // ------------------- Define Monster Hearts -------------------
    const monsterHearts = {
        max: monster.hearts,
        current: monster.hearts,
    };

    let battleId; // Declare battleId to be assigned later

    // ------------------- Store Battle Progress and Generate Battle ID -------------------
    try {
        battleId = await storeBattleProgress(
            character,
            monster,
            monster.tier,
            monsterHearts,
            isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Player turn next.'
        );

        console.log(`[triggerRaid] Battle ID generated and stored: ${battleId}`);
    } catch (error) {
        console.error(`[triggerRaid] Failed to store battle progress: ${error.message}`);
        await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
        return;
    }

    // ------------------- Create Embed -------------------
    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;

    const embed = new EmbedBuilder()
        .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
        .setDescription(
            `Use </raid:1315149690634768405> id:${battleId} to join or continue the raid!\n
            Use </item:1325543365441228800> to heal during the raid!`
        )
        .addFields(
            { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
            { name: `__${character.name || 'Unknown Adventurer'} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
            { name: `__Battle ID__`, value: `\`\`\`${battleId}\`\`\``, inline: false }
        )
        .setAuthor({
            name: character.name || 'Unknown Adventurer',
            iconURL: character.icon || 'https://via.placeholder.com/100',
        })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: `You have 10 minutes to complete this raid!` })
        .setColor(isBloodMoon ? '#FF4500' : '#FF0000');

    if (monsterImage && monsterImage.startsWith('http')) {
        embed.setThumbnail(monsterImage);
    }

    // ------------------- Create or Update Thread -------------------
    let thread;
    try {
        if (!threadId) {
            const emoji = isBloodMoon ? '🔴' : '🛡️';
            const threadName = `${emoji} ${character.currentVillage || 'Unknown Village'} - ${monster.name} (Tier ${monster.tier})`;

            await interaction.editReply({ embeds: [embed] });

            thread = await interaction.fetchReply().then((message) =>
                message.startThread({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    reason: `Raid initiated for ${character.name} against ${monster.name}`,
                })
            );

            threadId = thread.id; // Update threadId with the new thread's ID

            await thread.send(`<@${interaction.user.id}> has initiated a raid! Prepare to face ${monster.name} (Tier ${monster.tier}).`);
        } else {
            thread = interaction.guild.channels.cache.get(threadId);

            if (!thread) {
                console.error(`[triggerRaid] Thread not found for ID: ${threadId}`);
                await interaction.followUp(`❌ **Unable to locate the raid thread. Please try again later.**`);
                return;
            }

            await thread.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(`[triggerRaid] Error creating/updating thread: ${error.message}`);
        await interaction.followUp(`❌ **Unable to create or update a thread for the raid. Please try again later.**`);
        return;
    }

    // ------------------- Helper Function -------------------
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // ------------------- Store Battle Progress -------------------
try {
    const battleId = await storeBattleProgress(
        character,
        monster,
        monster.tier,
        monsterHearts,
        isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Player turn next.'
    );

    const timerDuration = 10 * 60 * 1000; // 10 minutes
    console.log(`[Timer LOG] Timer set for ${timerDuration / 1000} seconds.`);

    setTimeout(async () => {
        console.log(`[Timer LOG] Timer expired. Calling applyVillageDamage function.`);
        try {
            const villageName = character.currentVillage || "Unknown Village"; // Ensure a fallback
            await applyVillageDamage(villageName, monster, thread);
            console.log(`[Timer LOG] applyVillageDamage function executed successfully.`);
        } catch (error) {
            console.error(`[Timer LOG] Error during applyVillageDamage execution:`, error);
        }
    }, timerDuration);

    return battleId; // Return the battleId from storeBattleProgress
} catch (error) {
    await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
 }
}

// ------------------- Export Function -------------------
module.exports = { triggerRaid };
