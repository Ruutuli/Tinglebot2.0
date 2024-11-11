// exploringEmbeds.js
const { EmbedBuilder } = require('discord.js');
const { getCharacterItems, formatCharacterItems, calculateTotalHeartsAndStamina } = require('../modules/exploreModule');

const regionColors = {
    'eldin': '#FF0000',
    'lanayru': '#0000FF',
    'faron': '#008000',
    'central_hyrule': '#00FFFF',
    'gerudo': '#FFA500',
    'hebra': '#800080'
};
const regionImage = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';

const createExplorationItemEmbed = (party, character, item, expeditionId, location, totalHearts, totalStamina, itemsCarried) => {
    const embed = new EmbedBuilder()
        .setTitle(`🗺️ **Expedition in ${party.region.charAt(0).toUpperCase() + party.region.slice(1)}!**`)
        .setColor(regionColors[party.region] || '#00ff99')
        .setImage(regionImage)
        .setDescription(`**${character.name || "Adventurer"}** found an item during exploration! 🎒`)
        .addFields(
            { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
            { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
            { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
            { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
            { name: '🔹 **__Items Carried__**', value: itemsCarried, inline: false },
            { name: 'Item Found', value: item?.itemName || "Unknown Item", inline: true }
        )
        .setFooter({ text: '🧭 Adventure awaits!' });
    return embed;
};

const createExplorationMonsterEmbed = (party, character, monster, expeditionId, location, totalHearts, totalStamina, itemsCarried) => {
    const embed = new EmbedBuilder()
        .setTitle(`🗺️ **Expedition in ${party.region.charAt(0).toUpperCase() + party.region.slice(1)}!**`)
        .setColor(regionColors[party.region] || '#00ff99')
        .setImage(regionImage)
        .setDescription(`**${character.name || "Adventurer"}** encountered a monster! 👾`)
        .addFields(
            { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
            { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
            { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: true },
            { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: true },
            { name: '🔹 **__Items Carried__**', value: itemsCarried, inline: false },
            { name: 'Monster Encountered', value: monster?.name || "Unknown Monster", inline: true }
        )
        .setFooter({ text: '🧭 Adventure awaits!' });
    return embed;
};

module.exports = {
    createExplorationItemEmbed,
    createExplorationMonsterEmbed
};
