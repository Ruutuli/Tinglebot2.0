// ------------------- Import necessary modules and functions -------------------
const { EmbedBuilder } = require('discord.js');
const { getCommonEmbedSettings, formatItemDetails, DEFAULT_IMAGE_URL } = require('./embedUtils');
const { capitalize, capitalizeFirstLetter } = require('../modules/formattingModule');
const { convertCmToFeetInches } = require('../utils/validation');

// ------------------- Create Character Embed -------------------
// Creates a detailed character embed showing key character information
const createCharacterEmbed = (character) => {
    const settings = getCommonEmbedSettings(character);
    const heightInFeetInches = character.height ? convertCmToFeetInches(character.height) : 'N/A';

    const embed = new EmbedBuilder()
        .setTitle(`${character.name} | ${capitalize(character.race)} | ${capitalizeFirstLetter(character.homeVillage)} | ${capitalizeFirstLetter(character.job)}`)
        .addFields(
            { name: '👤 __Name__', value: `> ${character.name}`, inline: true },
            { name: '🔹 __Pronouns__', value: `> ${character.pronouns}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🔹 __Age__', value: `> ${character.age ? character.age.toString() : 'N/A'}`, inline: true },
            { name: '🔹 __Height__', value: `> ${character.height ? `${character.height} cm | ${heightInFeetInches}` : 'N/A'}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '❤️ __Hearts__', value: `> ${character.currentHearts}/${character.maxHearts}`, inline: true },
            { name: '🟩 __Stamina__', value: `> ${character.currentStamina}/${character.maxStamina}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🔹 __Race__', value: `> ${capitalize(character.race)}`, inline: true },
            { name: '🔹 __Village__', value: `> ${capitalizeFirstLetter(character.homeVillage)}`, inline: true },
            { name: '🔹 __Job__', value: `> ${capitalizeFirstLetter(character.job)}`, inline: true },
            { name: '📦 __Inventory__', value: `> [Google Sheets](${character.inventory})`, inline: false },
            { name: '🔗 __Application Link__', value: `> [Link](${character.appLink})`, inline: false }
        )
        .setColor(settings.color)
        .setThumbnail(character.icon)
        .setFooter({ text: 'Character details' })
        .setImage(DEFAULT_IMAGE_URL);

    return embed;
};

// ------------------- Create Simple Character Embed -------------------
// Creates a basic embed with limited character info and a custom description
const createSimpleCharacterEmbed = (character, description) => {
    const settings = getCommonEmbedSettings(character);

    const embed = new EmbedBuilder()
        .addFields(
            { name: '👤 __Name__', value: character.name, inline: true },
            { name: '🔹 __Pronouns__', value: character.pronouns, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '❤️ __Hearts__', value: `${character.currentHearts}/${character.maxHearts}`, inline: true },
            { name: '🟩 __Stamina__', value: `${character.currentStamina}/${character.maxStamina}`, inline: true }
        )
        .setColor(settings.color)
        .setThumbnail(character.icon)
        .setDescription(description)
        .setTimestamp()
        .setImage(DEFAULT_IMAGE_URL);

    return embed;
};

// ------------------- Create Character Gear Embed -------------------
// Displays character's gear (weapon, armor, shield) with attack and defense stats
const createCharacterGearEmbed = (character, gearMap, type, unequippedMessage = '') => {
    const settings = getCommonEmbedSettings(character);
    const gearEmojis = {
        head: '🪖',
        chest: '👕',
        legs: '👖',
        weapon: '🗡️',
        shield: '🛡️',
    };

    let totalDefense = 0;
    if (character.gearArmor) {
        totalDefense += character.gearArmor.head?.stats?.get('modifierHearts') || 0;
        totalDefense += character.gearArmor.chest?.stats?.get('modifierHearts') || 0;
        totalDefense += character.gearArmor.legs?.stats?.get('modifierHearts') || 0;
    }
    totalDefense += character.gearShield?.stats?.get('modifierHearts') || 0;

    let totalAttack = character.gearWeapon?.stats?.get('modifierHearts') || 0;

    const embed = new EmbedBuilder()
        .setColor(settings.color || '#0099ff')
        .setTitle(`${character.name}'s Equipment - 🗡️ ATK +${totalAttack} | 🛡️ DEF +${totalDefense}`)
        .addFields(
            { name: `__${gearEmojis.head} Head__`, value: gearMap.head || '> N/A', inline: true },
            { name: `__${gearEmojis.chest} Chest__`, value: gearMap.chest || '> N/A', inline: true },
            { name: `__${gearEmojis.legs} Legs__`, value: gearMap.legs || '> N/A', inline: true },
            { name: `__${gearEmojis.weapon} Weapon__`, value: gearMap.weapon || '> N/A', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: `__${gearEmojis.shield} Shield__`, value: gearMap.shield || '> N/A', inline: true }
        )
        .setFooter({ text: unequippedMessage ? `${unequippedMessage}\nGear type: ${type}` : `Gear type: ${type}` })
        .setTimestamp()
        .setImage(DEFAULT_IMAGE_URL);

    return embed;
};

// ------------------- Export the functions -------------------
module.exports = {
    createCharacterEmbed,
    createSimpleCharacterEmbed,
    createCharacterGearEmbed,
};

