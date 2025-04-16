// ------------------- Import necessary modules and functions -------------------
const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { getCommonEmbedSettings, formatItemDetails } = require('../embeds/embedUtils');
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');
const { monsterMapping } = require('../models/MonsterModel');
const { isValidImageUrl } = require('../utils/validation');

const DEFAULT_IMAGE_URL = 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png';
const PATH_IMAGES = {
    pathOfScarletLeaves: 'https://storage.googleapis.com/tinglebot/psl.png',
    leafDewWay: 'https://storage.googleapis.com/tinglebot/ldw.png'
};

const villageEmojis = {
    rudania: '<:rudania:899492917452890142>',
    inariko: '<:inariko:899493009073274920>',
    vhintl: '<:vhintl:899492879205007450>',
};

const pathEmojis = {
    pathOfScarletLeaves: '🍂',
    leafDewWay: '🥬'
};

// ------------------- Create embed for monster encounter -------------------
const createMonsterEncounterEmbed = (character, monster, outcomeMessage, heartsRemaining, lootItem, day, totalTravelDuration, pathEmoji, currentPath) => {
    const settings = getCommonEmbedSettings(character);

    const nameMapping = monster.nameMapping || monster.name;
    const normalizedMapping = nameMapping.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
        index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    ).replace(/\s+/g, '');

    const monsterDetails = monsterMapping[normalizedMapping] || { name: monster.name, image: 'https://via.placeholder.com/100x100' };

    const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`**${character.name}** encountered a ${monsterDetails.name || monster.name}!`)
        .setAuthor({
            name: `🗺️ Day ${day}/${totalTravelDuration} of travel on ${pathEmoji} ${capitalizeFirstLetter(currentPath.replace(/([a-z])([A-Z])/g, '$1 $2'))}`,
            iconURL: character.icon,
        })
        .setDescription(`**❤️ Hearts: ${character.currentHearts}/${character.maxHearts}**\n**🟩 Stamina: ${character.currentStamina}/${character.maxStamina}**`)
        .addFields({ name: '🔹 __Outcome__', value: `> ${outcomeMessage}`, inline: false })
        .setFooter({ text: `Tier: ${monster.tier}` })
        .setImage(PATH_IMAGES[currentPath] || settings.image.url);

    if (lootItem) {
        embed.addFields({ name: '💥 __Loot__', value: `${formatItemDetails(lootItem.itemName, lootItem.quantity, lootItem.emoji)}`, inline: false });
    }

    if (isValidImageUrl(monsterDetails.image)) {
        embed.setThumbnail(monsterDetails.image);
    } else {
        embed.setThumbnail('https://via.placeholder.com/100x100');
    }

    return embed;
};

// ------------------- Create embed for initial travel announcement -------------------
const createInitialTravelEmbed = (character, startingVillage, destination, paths, totalTravelDuration) => {
    const startEmoji = villageEmojis[startingVillage.toLowerCase()] || '';
    const destEmoji = villageEmojis[destination.toLowerCase()] || '';

    return new EmbedBuilder()
        .setTitle(`**${character.name}** is traveling from ${startEmoji} **${capitalizeFirstLetter(startingVillage)}** to ${destEmoji} **${capitalizeFirstLetter(destination)}**.`)
        .setDescription(`**Travel Path:** ${paths.map(path => `${pathEmojis[path]} ${capitalizeWords(path.replace(/([a-z])([A-Z])/g, '$1 $2'))}`).join(', ')}\n**Total Travel Duration:** ${totalTravelDuration} days\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`)
        .setColor('#AA926A')
        .setAuthor({ name: 'Travel Announcement', iconURL: character.icon })
        .setImage(DEFAULT_IMAGE_URL)
        .setTimestamp();
};

// ------------------- Create embed for traveling status -------------------
const createTravelingEmbed = (character) => {
    return new EmbedBuilder()
        .setDescription(`**${character.name} is traveling** <a:loading:1260369094151114852>`)
        .setImage(DEFAULT_IMAGE_URL)
        .setColor('#AA926A')
        .setTimestamp();
};

// ------------------- Create embed for a safe travel day -------------------
const createSafeTravelDayEmbed = (character, day, totalTravelDuration, pathEmoji, currentPath) => {
    const description = `🌸 **It's a nice and safe day of traveling.** What do you want to do next?\n- ❤️ Recover a heart (costs 1 stamina)\n- 🌿 Gather (costs 1 stamina)\n- 💤 Do nothing (move onto the next day)`;

    return new EmbedBuilder()
        .setAuthor({
            name: `🗺️ Day ${day}/${totalTravelDuration} of travel on ${pathEmoji} ${capitalizeWords(currentPath.replace(/([a-z])([A-Z])/g, '$1 $2'))}`,
            iconURL: character.icon,
        })
        .setTitle(`**${character.name}** is traveling`)
        .setDescription(`${description}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`)
        .setColor('#AA926A')
        .setImage(PATH_IMAGES[currentPath] || DEFAULT_IMAGE_URL)
        .setTimestamp();
};

// ------------------- Create embed for stopping in Inariko -------------------
const createStopInInarikoEmbed = (character, nextChannelId) => {
    return new EmbedBuilder()
        .setTitle(`🛑 **${character.name}** stopped in Inariko`)
        .setDescription(`**${character.name}** stopped in Inariko to rest and gather supplies.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}\n\n🔔 Please move over to <#${nextChannelId}> to continue the journey!`)
        .setColor('#AA926A')
        .setImage(DEFAULT_IMAGE_URL)
        .setTimestamp();
};

// ------------------- Create embed for final travel announcement -------------------
const createFinalTravelEmbed = (character, destination, paths, totalTravelDuration, travelLog) => {
    const destEmoji = villageEmojis[destination.toLowerCase()] || '';

    // Clean and format the travel log
    const cleanedLog = travelLog
    .filter(entry => entry && !entry.match(/^Lost \d+ (Stamina|Heart)/i))
    .map(entry => entry.trim()) // Ensure each entry is cleanly trimmed
    .join('\n\n'); // Add an extra line break between entries


    return new EmbedBuilder()
        .setTitle(`✅ ${character.name} has arrived at ${destEmoji} ${capitalizeFirstLetter(destination)}!`)
        .setDescription(
            `**Travel Path:** ${paths.map(path => 
                `${pathEmojis[path]} ${capitalizeWords(path.replace(/([a-z])([A-Z])/g, '$1 $2'))}`
            ).join(', ')}\n` +
            `**Total Travel Duration:** ${totalTravelDuration} days\n` +
            `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
            `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
        )
        .addFields({
            name: '📖 Travel Log',
            value: cleanedLog || 'No significant events occurred during the journey.',
        })
        .setColor('#AA926A')
        .setAuthor({ name: 'Travel Summary', iconURL: character.icon })
        .setImage(DEFAULT_IMAGE_URL)
        .setTimestamp();
};




// ------------------- Export the functions -------------------
module.exports = {
    villageEmojis,
    pathEmojis,
    createMonsterEncounterEmbed,
    createInitialTravelEmbed,
    createTravelingEmbed,
    createSafeTravelDayEmbed,
    createStopInInarikoEmbed,
    createFinalTravelEmbed,
};

