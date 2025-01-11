// exploringEmbeds.js
const { EmbedBuilder } = require('discord.js');
const { getCharacterItems, formatCharacterItems, calculateTotalHeartsAndStamina } = require('../modules/exploreModule');
const { monsterMapping } = require('../models/MonsterModel');


const regionColors = {
    'eldin': '#FF0000',
    'lanayru': '#0000FF',
    'faron': '#008000',
    'central_hyrule': '#00FFFF',
    'gerudo': '#FFA500',
    'hebra': '#800080'
};

const regionImages = {
    'eldin': 'https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png',
    'lanayru': 'https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png',
    'faron': 'https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png',
    'central_hyrule': 'https://storage.googleapis.com/tinglebot/Graphics/Central-Hyrule-Region.png',
    'gerudo': 'https://storage.googleapis.com/tinglebot/Graphics/Gerudo-Region.png',
    'hebra': 'https://storage.googleapis.com/tinglebot/Graphics/Hebra-Region.png'
};

const createExplorationItemEmbed = (party, character, item, expeditionId, location, totalHearts, totalStamina, itemsCarried) => {
    const embed = new EmbedBuilder()
        .setTitle(`🗺️ **Expedition: ${character.name} Found an Item!**`)
        .setDescription(`✨ **${character.name || "Adventurer"}** discovered ${item.emoji || ''} **${item.itemName}** during exploration!\n\n`)
        .setColor(regionColors[party.region] || '#00ff99')
        .setThumbnail(item.image || 'https://via.placeholder.com/100x100')
        .setImage(regionImages[party.region] || 'https://via.placeholder.com/100x100') // Dynamically set region-specific image
        .addFields(
            { name: '🆔 **__Expedition ID__**', value: expeditionId, inline: true },
            { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
            { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: false },
            { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: false },
            { name: '🔹 **__Items Carried__**', value: itemsCarried || 'None', inline: false }
        )
    return embed;
};

const createExplorationMonsterEmbed = (party, character, monster, expeditionId, location, totalHearts, totalStamina, itemsCarried) => {
    // Fallback to Monster Mapping for Image if not directly provided
    const monsterImage = monster.image || monsterMapping[monster.nameMapping]?.image || 'https://via.placeholder.com/100x100';

    const embed = new EmbedBuilder()
        .setTitle(`🗺️ **Expedition: ${character.name} Encountered a Monster!**`)
        .setDescription(`**${character.name || "Adventurer"}** encountered ${monster.emoji || ''} **${monster.name || "Unknown Monster"}** during exploration!`)
        .setColor(regionColors[party.region] || '#00ff99')
        .setThumbnail(monsterImage) // Set monster image dynamically
        .setImage(regionImages[party.region] || 'https://via.placeholder.com/100x100') // Region-specific image
        .addFields(
            { name: '🆔 **__Expedition ID__**', value: expeditionId || 'Unknown', inline: true },
            { name: '📍 **__Current Location__**', value: location || "Unknown Location", inline: true },
            { name: '❤️ **__Party Hearts__**', value: `${totalHearts}`, inline: false },
            { name: '🟩 **__Party Stamina__**', value: `${totalStamina}`, inline: false },
            { name: '🔹 **__Items Carried__**', value: itemsCarried || 'None', inline: false }
        )
    return embed;
};


module.exports = {
    createExplorationItemEmbed,
    createExplorationMonsterEmbed
};
