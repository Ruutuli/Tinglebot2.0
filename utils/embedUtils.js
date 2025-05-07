const { EmbedBuilder } = require('discord.js');
const { getMountEmoji, getMountThumbnail } = require('../modules/mountModule');

// Create an embed for mount encounters
function createMountEncounterEmbed(encounter) {
    const mountEmoji = getMountEmoji(encounter.mountType);
    const mountThumbnail = getMountThumbnail(encounter.mountType);

    return new EmbedBuilder()
        .setTitle(`${mountEmoji} Mount Encounter!`)
        .setDescription(
            `A **${encounter.rarity}** mount has appeared!\n\n` +
            `**Mount Details:**\n` +
            `> **Species:** ${encounter.mountType}\n` +
            `> **Level:** ${encounter.mountLevel}\n` +
            `> **Stamina:** ${encounter.mountStamina}\n` +
            `> **Environment:** ${encounter.environment}\n` +
            `> **Village:** ${encounter.village}\n\n` +
            `React with 🎲 to join the encounter!`
        )
        .setColor(encounter.rarity === 'Rare' ? 0xFFD700 : 0xAA926A)
        .setThumbnail(mountThumbnail)
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ 
            text: encounter.isMonthly ? 
                '🎉 Monthly Mount Encounter' : 
                '🐎 Random Mount Encounter',
            iconURL: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        })
        .setTimestamp();
}

module.exports = {
    createMountEncounterEmbed
}; 