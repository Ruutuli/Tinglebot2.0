// ------------------- raidModule.js -------------------
// This module centralizes raid-related functionality including embed creation,
// timer management, and thread handling for both random encounters and manual raids.
// -----------------------------------------------------------------------------------------

const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { monsterMapping } = require('../models/MonsterModel');
const { applyVillageDamage } = require('./villageModule');
const { capitalizeVillageName } = require('../utils/stringUtils');

// ------------------- Constants -------------------
const RAID_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// ------------------- Create Raid Embed -------------------
function createRaidEmbed(character, monster, battleId, isBloodMoon = false) {
    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;
    const villageName = capitalizeVillageName(character.currentVillage);

    const embed = new EmbedBuilder()
        .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
        .setDescription(
            `Use \`/raid id:${battleId}\` to join or continue the raid!\n` +
            `Use \`/item\` to heal during the raid!`
        )
        .addFields(
            { name: `__Monster Hearts__`, value: `💙 ${monster.hearts}/${monster.hearts}`, inline: false },
            { name: `__${character.name || 'Unknown Adventurer'} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
            { name: `__Battle ID__`, value: `\`\`\`${battleId}\`\`\``, inline: false }
        )
        .setAuthor({
            name: character.name || 'Unknown Adventurer',
            iconURL: character.icon || 'https://via.placeholder.com/100',
        })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: `You have ${RAID_DURATION / 60000} minutes to complete this raid!` })
        .setColor(isBloodMoon ? '#FF4500' : '#FF0000');

    if (monsterImage && monsterImage.startsWith('http')) {
        embed.setThumbnail(monsterImage);
    }

    return embed;
}

// ------------------- Create or Update Raid Thread -------------------
async function createOrUpdateRaidThread(interaction, character, monster, embed, threadId = null, isBloodMoon = false) {
    try {
        let thread;
        if (!threadId) {
            const emoji = isBloodMoon ? '🔴' : '🛡️';
            const villageName = capitalizeVillageName(character.currentVillage);
            const threadName = `${emoji} ${villageName} - ${monster.name} (Tier ${monster.tier})`;
        
            await interaction.editReply({ embeds: [embed] });
        
            thread = await interaction.fetchReply().then((message) =>
                message.startThread({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    reason: `Raid initiated for ${character.name} against ${monster.name}`,
                })
            );
        
            threadId = thread.id;
        
            const safeVillageName = villageName.replace(/\s+/g, '');
            const residentRole = `@${safeVillageName} resident`;
            const visitorRole = `@visiting:${safeVillageName}`;
        
            await thread.send(`👋 <@${interaction.user.id}> has initiated a raid against **${monster.name} (Tier ${monster.tier})**!\n\n${residentRole} ${visitorRole} — come help defend your home!`);
        } else {
            thread = interaction.guild.channels.cache.get(threadId);
            if (!thread) {
                throw new Error(`Thread not found for ID: ${threadId}`);
            }
            await thread.send({ embeds: [embed] });
        }
        return thread;
    } catch (error) {
        handleError(error, 'raidModule.js');
        throw error;
    }
}

// ------------------- Schedule Raid Timer -------------------
function scheduleRaidTimer(villageName, monster, thread) {
    const capitalizedVillageName = capitalizeVillageName(villageName);
    setTimeout(async () => {
        try {
            await applyVillageDamage(capitalizedVillageName, monster, thread);
        } catch (error) {
            handleError(error, 'raidModule.js');
            console.error(`[raidModule.js]: Timer: Error during applyVillageDamage execution:`, error);
        }
    }, RAID_DURATION);
}

module.exports = {
    createRaidEmbed,
    createOrUpdateRaidThread,
    scheduleRaidTimer,
    RAID_DURATION
}; 