// ------------------- Imports -------------------
// Discord.js Imports
const { EmbedBuilder } = require('discord.js');

// Utility Imports
const { getCommonEmbedSettings, formatItemDetails, getArticleForItem, DEFAULT_IMAGE_URL, jobActions } = require('./embedUtils');
const { isValidImageUrl } = require('../utils/validation');
const { getNoEncounterMessage, typeActionMap } = require('../modules/flavorTextModule');
const { capitalizeWords } = require('../modules/formattingModule');

// Model Imports
const { monsterMapping } = require('../models/MonsterModel');
const ItemModel = require('../models/ItemModel');

// ------------------- Function to create crafting embed -------------------
const createCraftingEmbed = async (item, character, flavorText, materialsUsed, quantity, staminaCost, remainingStamina) => {
    const action = jobActions[character.job] || "crafted";

    // Debugging: Log the inputs
    console.log('Debug: Quantity in createCraftingEmbed:', quantity);
    console.log('Debug: Materials used in createCraftingEmbed:', materialsUsed);

    // Ensure `quantity` is properly handled
    const itemQuantityText = ` x${quantity}`;
    const embedTitle = `${character.name} from ${character.currentVillage}: ${action} ${item.itemName}${itemQuantityText}`;

    // Handle flavor text (optional)
    const flavorTextField = flavorText ? { name: '🌟 **Flavor Text**', value: flavorText, inline: false } : null;

    // Format materials with their actual emojis
    const DEFAULT_EMOJI = ':small_blue_diamond:';
    let craftingMaterialText = 'No materials used or invalid data format.';
    if (Array.isArray(materialsUsed) && materialsUsed.length > 0) {
        craftingMaterialText = await Promise.all(
            materialsUsed.map(async (material) => {
                // Fetch the emoji from the database if available
                const materialItem = await ItemModel.findOne({ itemName: material.itemName }).select('emoji');
                const emoji = materialItem?.emoji || DEFAULT_EMOJI;
                return formatItemDetails(material.itemName, material.quantity, emoji);
            })
        ).then(results => results.join('\n'));
    }

    // Create the crafting embed
    const embed = new EmbedBuilder()
        .setColor('#AA926A') // Amber for crafting
        .setTitle(embedTitle)
        .setAuthor({
            name: `${character.name} 🔗`,
            iconURL: character.icon || DEFAULT_IMAGE_URL,
            url: character.inventory || ''
        })
        .addFields(
            { name: '📜 **__Materials Used__**', value: craftingMaterialText, inline: false },
            { name: '⚡ **__Stamina Cost__**', value: `> ${staminaCost}`, inline: true },
            { name: '💚 **__Remaining Stamina__**', value: `> ${remainingStamina}`, inline: true }
        );

    // Add flavor text if present
    if (flavorTextField) {
        embed.addFields(flavorTextField);
    }

    // Add a thumbnail and footer
    embed.setThumbnail(item.image || DEFAULT_IMAGE_URL)
        .setImage(DEFAULT_IMAGE_URL)
        .setFooter({
            text: `${character.name} successfully ${action} this item!`,
            iconURL: character.icon || DEFAULT_IMAGE_URL
        });

    return embed;
};


// ------------------- Function to create Writing Submission embed -------------------
const createWritingSubmissionEmbed = (submissionData) => {
    return new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`📚 ${submissionData.title}`)
        .setAuthor({ 
            name: `Submitted by: ${submissionData.username}`, 
            iconURL: submissionData.userAvatar || 'https://via.placeholder.com/128' 
        })
        .addFields(
            { name: 'Submission ID', value: `\`${submissionData.submissionId}\``, inline: false },
            { name: 'Member', value: `<@${submissionData.userId}>`, inline: true },
            { name: 'Word Count', value: `${submissionData.wordCount}`, inline: true },
            { name: 'Token Total', value: `${submissionData.finalTokenAmount} Tokens`, inline: true },
            { name: 'Submission Link', value: `[View Submission](${submissionData.link})`, inline: true },
            { name: 'Token Tracker Link', value: submissionData.tokenTracker ? `[Token Tracker](${submissionData.tokenTracker})` : 'N/A', inline: true, },
            { name: 'Description', value: submissionData.description, inline: false }

        )
        .setImage(DEFAULT_IMAGE_URL)
        .setTimestamp()
        .setFooter({ text: 'Writing Submission System' });
};


// ------------------- Function to create Art Submission embed -------------------
const createArtSubmissionEmbed = (submissionData, user, tokenCalculation) => {
    return new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`🎨 ${submissionData.title || submissionData.fileName}`) // Use title or default to file name
        .setAuthor({ 
            name: `Submitted by: ${submissionData.username}`, 
            iconURL: submissionData.userAvatar || 'https://via.placeholder.com/128' 
        })
        .addFields(
            { name: 'Submission ID', value: `\`${submissionData.submissionId || 'N/A'}\``, inline: false },
            { name: 'Art Title', value: submissionData.title || submissionData.fileName, inline: false }, // Add title field
            { name: 'Member', value: `<@${submissionData.userId || 'unknown'}>`, inline: true },
            { name: 'Upload Link', value: submissionData.fileUrl ? `[View Uploaded Image](${submissionData.fileUrl})` : 'N/A', inline: true },
            { 
                name: 'Token Tracker Link', 
                value: user?.tokenTracker ? `[Token Tracker](${user.tokenTracker})` : 'N/A', 
                inline: true 
            },
            { 
                name: 'Quest/Event', 
                value: submissionData.questEvent || 'N/A', 
                inline: true 
            },
            { 
                name: 'Quest/Event Bonus', 
                value: submissionData.questBonus || 'N/A', 
                inline: true 
            },
            { 
                name: 'Token Total', 
                value: `${submissionData.finalTokenAmount || 0} Tokens`, 
                inline: true 
            },
            { 
                name: 'Token Calculation', 
                value: tokenCalculation || 'N/A', 
                inline: false 
            }
        )
        .setImage(submissionData.fileUrl || null)
        .setTimestamp()
        .setFooter({ text: 'Art Submission System' });
};

// ------------------- Function to create gather embed -------------------
const createGatherEmbed = (character, randomItem) => {
    const settings = getCommonEmbedSettings(character);
    const action = typeActionMap[randomItem.type[0]]?.action || 'found';
    const article = getArticleForItem(randomItem.itemName);
    const itemColor = settings.color;

    return new EmbedBuilder()
        .setTitle(`${capitalizeWords(character.homeVillage)} ${character.job}: ${character.name} ${action} ${article} ${randomItem.itemName}!`)
        .setColor(itemColor)
        .setAuthor({ name: `${character.name} 🔗`, iconURL: character.icon, url: character.inventory })
        .setThumbnail(randomItem.image)
        .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Function to create transfer embed -------------------
const createTransferEmbed = (fromCharacter, toCharacter, items, interactionUrl, fromCharacterIcon, toCharacterIcon) => {
    const fromSettings = getCommonEmbedSettings(fromCharacter);
    const toSettings = getCommonEmbedSettings(toCharacter);

    const formattedItems = items.map(({ itemName, quantity, itemIcon }) => 
        `${formatItemDetails(String(itemName), quantity, itemIcon)}`
    ).join('\n');

    return new EmbedBuilder()
        .setColor(fromSettings.color)
        .setAuthor({ name: `${fromCharacter.name} 🔗`, iconURL: fromSettings.author.iconURL, url: fromSettings.author.url })
        .setTitle('✬ Item Transfer ✬')
        .setDescription(`**${fromCharacter.name}** ➡️ **${toCharacter.name}**`)
        .addFields({ name: '__Items__', value: formattedItems, inline: false })
        .setFooter({ text: toCharacter.name, iconURL: toCharacterIcon })
        .setImage(fromSettings.image.url);
};

// ------------------- Function to create gift embed -------------------
const createGiftEmbed = (fromCharacter, toCharacter, items, fromInventoryLink, toInventoryLink, fromCharacterIcon, toCharacterIcon) => {
    const fromSettings = getCommonEmbedSettings(fromCharacter);
    const formattedItems = items.map(({ itemName, quantity, itemIcon }) => 
        `${formatItemDetails(itemName, quantity, itemIcon)}`
    ).join('\n');

    return new EmbedBuilder()
        .setColor(fromSettings.color)
        .setAuthor({ name: `${fromCharacter.name} 🔗`, iconURL: fromSettings.author.iconURL, url: fromSettings.author.url })
        .setTitle('✬ Gift ✬')
        .setDescription(`**${fromCharacter.name}** ➡️ **[${toCharacter.name}](${toInventoryLink})🔗**`)
        .addFields({ name: '__Items__', value: formattedItems, inline: false })
        .setFooter({ text: toCharacter.name, iconURL: toCharacterIcon })
        .setImage(fromSettings.image.url);
};

// ------------------- Function to create trade embed -------------------
const createTradeEmbed = async (fromCharacter, toCharacter, fromItems, toItems, interactionUrl, fromCharacterIcon, toCharacterIcon) => {
    const settingsFrom = getCommonEmbedSettings(fromCharacter);
    const fromItemsDescription = fromItems.map(item => `**${item.emoji} ${item.name} x ${item.quantity}**`).join('\n');
    const toItemsDescription = toItems.length > 0 ? toItems.map(item => `**${item.emoji} ${item.name} x ${item.quantity}**`).join('\n') : 'No items offered';

    return new EmbedBuilder()
        .setColor(settingsFrom.color)
        .setTitle('✬ Trade ✬')
        .setAuthor({ name: `${fromCharacter.name} 🔗`, iconURL: settingsFrom.author.iconURL, url: settingsFrom.author.url })
        .setDescription(`Both users must confirm the trade by using the **/trade** command with the provided trade ID.`)
        .addFields(
            { name: `__${fromCharacter.name} offers__`, value: fromItemsDescription || 'No items offered', inline: true },
            { name: `__${toCharacter.name} offers__`, value: toItemsDescription || 'No items offered', inline: true }
        )
        .setFooter({ text: toCharacter.name, iconURL: toCharacter.icon })
        .setImage(settingsFrom.image.url);
};

// ------------------- Function to create monster encounter embed -------------------
const createMonsterEncounterEmbed = (character, monster, outcomeMessage, heartsRemaining, lootItem, isBloodMoon = false) => {
    const settings = getCommonEmbedSettings(character);
    const nameMapping = monster.nameMapping || monster.name;
    const monsterDetails = monsterMapping[nameMapping.replace(/\s+/g, '')] || { name: monster.name, image: 'https://via.placeholder.com/100x100' };

            const embed = new EmbedBuilder()
            .setColor(isBloodMoon ? '#FF4500' : settings.color)
            .setTitle(
                `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)}: ${character.name} encountered a ${monsterDetails.name || monster.name}!`
            )
            .setAuthor({ name: `${character.name} 🔗`, iconURL: settings.author.iconURL, url: settings.author.url })
            .addFields(
                { name: '__❤️ Hearts__', value: `> ${heartsRemaining}/${character.maxHearts}`, inline: false },
                { name: '🔹 __Outcome__', value: `> ${outcomeMessage}`, inline: false }
            )
            .setFooter({ text: isBloodMoon ? '🔴 The Blood Moon rises... luckily you didn’t run into anything stronger.' : '' })
            .setImage(settings.image.url);

        if (lootItem) {
            embed.addFields({ name: '💥 __Loot__', value: `${formatItemDetails(lootItem.itemName, lootItem.quantity, lootItem.emoji)}`, inline: false });
        }

        if (isValidImageUrl(monsterDetails.image)) {
            embed.setThumbnail(monsterDetails.image);
        }

        return embed;
};


// ------------------- Function to create no encounter embed -------------------
const createNoEncounterEmbed = (character, isBloodMoon = false) => {
    const settings = getCommonEmbedSettings(character);
    const noEncounterMessage = getNoEncounterMessage(); // Retain normal no-encounter message

    return new EmbedBuilder()
        .setColor(isBloodMoon ? '#FF4500' : settings.color) // Fiery red for Blood Moon
        .setTitle(
            `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)}: ${character.name} encountered no monsters.`
        )
        .setAuthor({ name: `${character.name} 🔗`, iconURL: settings.author.iconURL, url: settings.author.url })
        .addFields({ name: '🔹 __Outcome__', value: `> ${noEncounterMessage}`, inline: false })
        .setImage(settings.image.url)
        .setFooter({ text: isBloodMoon ? '🔴 The Blood Moon rises... but nothing stirs in the shadows.' : 'Better luck next time!' });
};



// ------------------- Function to create KO embed -------------------
const createKOEmbed = (character) => {
    const settings = getCommonEmbedSettings(character);

    return new EmbedBuilder()
        .setColor('#FF0000')
        .setAuthor({ name: `${character.name} 🔗`, iconURL: settings.author.iconURL, url: settings.author.url })
        .setTitle(`💥 ${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)}: ${character.name} is KO'd!`);
};

// ------------------- Function to create heal embed -------------------
const createHealEmbed = (healerCharacter, characterToHeal) => {
    const settings = getCommonEmbedSettings(healerCharacter);

    return new EmbedBuilder()
        .setColor(settings.color)
        .setAuthor({ name: `${healerCharacter.name} 🔗`, iconURL: settings.author.iconURL, url: settings.author.url })
        .setTitle('✬ Healing Request ✬')
        .setDescription(`Healing request for ${characterToHeal.name}! ${healerCharacter.name} is ready to offer healing services.`);
};

// ------------------- Function to update heal embed -------------------
const updateHealEmbed = (embed, healerCharacter, characterToHeal, heartsToHeal) => {
    const newHearts = Math.min(characterToHeal.currentHearts + heartsToHeal, characterToHeal.maxHearts);
    const newStamina = healerCharacter.currentStamina - heartsToHeal;

    embed.setDescription(`${healerCharacter.name} has accepted the healing request and healed ${characterToHeal.name}.`);
    embed.data.fields = embed.data.fields.filter(field => 
        field.name !== '👩‍⚕️ __Healer__' && field.name !== '🟩 __Healer Stamina__'
    );

    embed.addFields(
        { name: '👩‍⚕️ __Healer__', value: healerCharacter.name, inline: true },
        { name: '🟩 __Healer Stamina__', value: `${newStamina}`, inline: true }
    );

    return embed;
};

// ------------------- Utility functions -------------------
const aggregateItems = (items) => {
    // Example implementation for aggregating items
    // You can further define how the items are aggregated here
    return items.reduce((acc, item) => {
        acc[item.name] = (acc[item.name] || 0) + item.quantity;
        return acc;
    }, {});
};

const formatMaterialsList = (materials) => {
    return materials.map(material => `${material.name} x${material.quantity}`).join(', ');
};

module.exports = {
    createArtSubmissionEmbed,
    createWritingSubmissionEmbed,
    createGatherEmbed,
    createTransferEmbed,
    createGiftEmbed,
    createTradeEmbed,
    createMonsterEncounterEmbed,
    createNoEncounterEmbed,
    createKOEmbed,
    createHealEmbed,
    updateHealEmbed,
    aggregateItems,
    formatMaterialsList,
    createCraftingEmbed
};
