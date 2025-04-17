// ------------------- Imports -------------------
// Discord.js Imports
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// Utility Imports
const { getCommonEmbedSettings, formatItemDetails, getArticleForItem, DEFAULT_IMAGE_URL, jobActions } = require('./embedUtils');
const { isValidImageUrl } = require('../utils/validation');
const { getNoEncounterMessage, typeActionMap, generateGatherFlavorText, generateCraftingFlavorText  } = require('../modules/flavorTextModule');
const { capitalizeWords, capitalize, capitalizeFirstLetter } = require('../modules/formattingModule');
const { getVillageColorByName } = require('../modules/locationsModule'); // Import from locationsModule.js
const { getLastDebugValues } = require('../modules/buffModule');

// Model Imports
const { monsterMapping } = require('../models/MonsterModel');
const ItemModel = require('../models/ItemModel');
const Character = require('../models/CharacterModel');

// ------------------- Function to create crafting embed -------------------
const createCraftingEmbed = async (item, character, flavorText, materialsUsed, quantity, staminaCost, remainingStamina) => {
    const action = jobActions[character.job] || "crafted";

    // Ensure `quantity` is properly handled
    const itemQuantityText = ` x${quantity}`;
    
    // Determine if the character is visiting a different village
    const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
    const locationPrefix = isVisiting
        ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`
        : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(character.job)}`;

    const embedTitle = `${locationPrefix}: ${character.name} ${action} ${item.itemName}${itemQuantityText}`;

    // Determine the job for flavor text (use job voucher job if active)
    const jobForFlavorText = character.jobVoucher ? character.jobVoucherJob : character.job;

    // Generate crafting-specific flavor text based on the job
    const craftingFlavorText = generateCraftingFlavorText(jobForFlavorText);

    // Add a message if a job voucher is active
    const jobVoucherMessage = character.jobVoucher
        ? `🎫 **Job Voucher activated for ${character.name} to perform the job ${jobForFlavorText}.**\n\n`
        : '';

    // Combine crafting flavor text with the optional custom flavor text
    const combinedFlavorText = flavorText
        ? `${jobVoucherMessage}${craftingFlavorText}\n\n🌟 **Custom Flavor Text:** ${flavorText}`
        : `${jobVoucherMessage}${craftingFlavorText}`;

    // Format materials with their actual emojis
    const DEFAULT_EMOJI = ':small_blue_diamond:';
    let craftingMaterialText = 'No materials used or invalid data format.';
    if (Array.isArray(materialsUsed) && materialsUsed.length > 0) {
        const formattedMaterials = await Promise.all(
            materialsUsed.map(async (material) => {
                const materialItem = await ItemModel.findOne({ itemName: material.itemName }).select('emoji');
                const emoji = materialItem?.emoji || DEFAULT_EMOJI;
                return formatItemDetails(material.itemName, material.quantity, emoji);
            })
        );

        // Ensure materials list does not exceed 1024 characters
        craftingMaterialText = formattedMaterials.join('\n');
        if (craftingMaterialText.length > 1024) {
            const splitMaterials = [];
            let chunk = "";

            formattedMaterials.forEach((line) => {
                if ((chunk + line + "\n").length > 1024) {
                    splitMaterials.push(chunk.trim());
                    chunk = "";
                }
                chunk += line + "\n";
            });
            if (chunk) splitMaterials.push(chunk.trim());

            craftingMaterialText = splitMaterials;
        }
    }

    // Dynamically fetch updated stamina to ensure accuracy
    const latestCharacter = await Character.findById(character._id);
    const updatedStamina = latestCharacter ? latestCharacter.currentStamina : remainingStamina;

    // Create the crafting embed
    const embed = new EmbedBuilder()
        .setColor('#AA926A') // Amber for crafting
        .setTitle(embedTitle)
        .setDescription(combinedFlavorText) // Add job-specific flavor text and job voucher message in the description
        .setAuthor({
            name: `${character.name} 🔗`,
            iconURL: character.icon || DEFAULT_IMAGE_URL,
            url: character.inventory || ''
        })
        .addFields(
            // Handle materials as either a single field or multiple if truncated
            ...(Array.isArray(craftingMaterialText)
                ? craftingMaterialText.map((chunk, index) => ({
                    name: `📜 **__Materials Used__** (Part ${index + 1})`,
                    value: chunk,
                    inline: false
                }))
                : [{ name: '📜 **__Materials Used__**', value: craftingMaterialText, inline: false }]),
            { name: '⚡ **__Stamina Cost__**', value: `> ${staminaCost}`, inline: true },
            { name: '💚 **__Remaining Stamina__**', value: `> ${updatedStamina}`, inline: true }
        );

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
            { name: 'Collaboration', value: submissionData.collab 
            ? `Tokens will be split equally with ${submissionData.collab}.` 
            : 'No collaborator added.', inline: false },
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
                name: 'Collab Total Each',
                value: submissionData.collab
                    ? `${Math.floor(submissionData.finalTokenAmount / 2) || 0} Tokens`
                    : 'N/A',
                inline: true,
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

    // Generate flavor text
    const flavorText = generateGatherFlavorText(randomItem.type[0]);

    // Determine visiting status
    const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
    const locationPrefix = isVisiting
        ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`
        : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(character.job)}`;

    const embedColor = getVillageColorByName(character.currentVillage) || settings.color || '#000000';

    // Define village-specific footer images
    const villageImages = {
        Inariko: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
        Rudania: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
        Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png"
    };

    const villageImage = villageImages[capitalizeWords(character.currentVillage)] || DEFAULT_IMAGE_URL;

    // Validate and set thumbnail
    const thumbnailUrl = isValidImageUrl(randomItem.image) ? randomItem.image : DEFAULT_IMAGE_URL;

    return new EmbedBuilder()
        .setTitle(`${locationPrefix}: ${character.name} ${action} ${article} ${randomItem.itemName}!`)
        .setDescription(flavorText)
        .setColor(embedColor)
        .setAuthor({ name: `${character.name} 🔗`, iconURL: character.icon || DEFAULT_IMAGE_URL, url: character.inventory || '' })
        .setThumbnail(thumbnailUrl)
        .setImage(villageImage); // Use the village-specific image
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
const createMonsterEncounterEmbed = (
    character,
    monster,
    outcomeMessage,
    heartsRemaining,
    lootItem,
    isBloodMoon = false
) => {
    const { initialRandomValue, adjustedRandomValue } = getLastDebugValues();
    const settings = getCommonEmbedSettings(character) || {};
    const nameMapping = monster.nameMapping || monster.name;
    const monsterDetails = monsterMapping[nameMapping.replace(/\s+/g, '')] || { name: monster.name, image: 'https://via.placeholder.com/100x100' };

    const authorIconURL = settings.author?.iconURL || 'https://via.placeholder.com/100x100';

    const koMessage = heartsRemaining === 0 ? '\n> 💥 **KO! You have been defeated and can’t continue!**' : '';

    const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
    const locationPrefix = isVisiting
        ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`
        : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(character.job)}`;

    const embedColor = getVillageColorByName(character.currentVillage) || '#000000';

    const villageImages = {
        Inariko: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
        Rudania: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
        Vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png"
    };

    const villageImage = villageImages[capitalizeWords(character.currentVillage)] || 'https://via.placeholder.com/100x100';

    const embed = new EmbedBuilder()
        .setColor(isBloodMoon ? '#FF4500' : embedColor)
        .setTitle(
            `${locationPrefix}: ${character.name} encountered a ${monsterDetails.name || monster.name}!`
        )
        .setAuthor({ name: `${character.name} 🔗`, iconURL: authorIconURL, url: settings.author?.url || '' })
        .addFields(
            { name: '__❤️ Hearts__', value: `> ${heartsRemaining !== undefined ? heartsRemaining : 'Unknown'}/${character.maxHearts !== undefined ? character.maxHearts : 'Unknown'}`, inline: false },
            { name: '🔹 __Outcome__', value: `> ${outcomeMessage || 'No outcome specified.'}${koMessage}`, inline: false }
        )
        .setFooter({ 
            text: `Tier: ${monster.tier}${isBloodMoon ? ' 🔴 Blood Moon Encounter' : ''}`, 
            iconURL: authorIconURL 
        })
        .setImage(villageImage);

    if (lootItem) {
        embed.addFields({ name: '💥 __Loot__', value: `${formatItemDetails(lootItem.itemName, lootItem.quantity, lootItem.emoji)}`, inline: false });
    }

    if (initialRandomValue !== null && adjustedRandomValue !== null) {
        embed.addFields({
            name: '__🎲 Dice Roll__',
            value: `> \`${initialRandomValue} -> ${adjustedRandomValue}\``,
            inline: false,
        });
    }

    if (isValidImageUrl(monsterDetails.image)) {
        embed.setThumbnail(monsterDetails.image);
    } else {
        embed.setThumbnail('https://via.placeholder.com/100x100');
    }

    return embed;
};


// ------------------- Function to create no encounter embed -------------------
const createNoEncounterEmbed = (character, isBloodMoon = false) => {
    const settings = getCommonEmbedSettings(character);

    // Pass the character's current village to get a specific no encounter message
    const noEncounterMessage = getNoEncounterMessage(character.currentVillage);

    // Determine visiting status
    const isVisiting = character.homeVillage.toLowerCase() !== character.currentVillage.toLowerCase();
    const locationPrefix = isVisiting
        ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`
        : `${capitalizeWords(character.currentVillage)} ${capitalizeWords(character.job)}`;

    // Determine embed color based on visiting status and Blood Moon
    const embedColor = isBloodMoon
        ? '#FF4500'
        : isVisiting
            ? getVillageColorByName(character.currentVillage) || '#000000'
            : settings.color || '#000000';

    // Define village-specific footer images
    const villageImages = {
        inariko: "https://storage.googleapis.com/tinglebot/Graphics/Inariko-Footer.png",
        rudania: "https://storage.googleapis.com/tinglebot/Graphics/Rudania-Footer.png",
        vhintl: "https://storage.googleapis.com/tinglebot/Graphics/Vhintl-Footer.png",
    };

    // Select the appropriate footer image for the current village
    const villageImage = villageImages[character.currentVillage.toLowerCase()] || 'https://via.placeholder.com/100x100';

    // Build author options only with valid strings
    const authorOptions = { name: `${character.name} 🔗` };
    if (settings.author && typeof settings.author.iconURL === 'string') {
        authorOptions.iconURL = settings.author.iconURL;
    }
    if (settings.author && typeof settings.author.url === 'string') {
        authorOptions.url = settings.author.url;
    }

    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(
            `${locationPrefix}: ${character.name} encountered no monsters.`
        )
        .setAuthor(authorOptions)
        .addFields({ name: '🔹 __Outcome__', value: `> ${noEncounterMessage}`, inline: false })
        .setImage(villageImage)
        .setFooter({ text: isBloodMoon ? '🔴 The Blood Moon rises... but nothing stirs in the shadows.' : 'Better luck next time!' });
};



// ------------------- Function to create KO embed -------------------
const createKOEmbed = (character) => {
    const settings = getCommonEmbedSettings(character);

    // Determine if the character is visiting
    const isVisiting = character.homeVillage !== character.currentVillage;
    const locationPrefix = isVisiting
        ? `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)} is visiting ${capitalizeWords(character.currentVillage)}`
        : `${capitalizeWords(character.homeVillage)} ${capitalizeWords(character.job)}`;

    return new EmbedBuilder()
        .setColor('#FF0000') // Set to red
        .setAuthor({
            name: `${character.name} 🔗`,
            iconURL: settings.author.iconURL,
            url: settings.author.url
        })
        .setTitle(`💥 ${locationPrefix}: ${character.name} is KO'd!`)
        .setDescription(
            `> KO status can only be healed by fairies or Healers.\n` +
            `> Use </itemheal:1306176789755858979> or </heal request:1306176789755858977> to heal your character.`
        )
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png'); // Updated image URL
};


// ------------------- Function to create heal embed -------------------
const createHealEmbed = (healerCharacter, characterToHeal, heartsToHeal, paymentOffered, healingRequestId, isFulfilled = false) => {
    if (!characterToHeal) {
        throw new Error('Character to heal is required.');
    }

    const healerName = healerCharacter?.name || 'Any available healer';
    const healerIcon = healerCharacter?.icon || DEFAULT_IMAGE_URL;

    const settings = healerCharacter ? getCommonEmbedSettings(healerCharacter) : { color: '#AA926A' }; // Default color if no healer

    const embed = new EmbedBuilder()
        .setColor(settings.color)
        .setAuthor({
            name: `${characterToHeal.name} 🔗`,
            iconURL: characterToHeal.icon || DEFAULT_IMAGE_URL,
            url: characterToHeal.inventory || '',
        })
        .setTitle('✬ Healing Request ✬')
        .setDescription(
            isFulfilled
                ? `✅ This healing request has been fulfilled by **${healerName}**.`
                : healerCharacter
                    ? `**${characterToHeal.name}** is requesting healing services from **${healerName}**!`
                    : `**${characterToHeal.name}** is requesting healing! Healing request for any available healer in **${capitalizeFirstLetter(characterToHeal.currentVillage)}**.`
        );

    // Always include village, hearts, and payment fields
    embed.addFields(
        { name: '__📍 Village__', value: `> ${capitalizeFirstLetter(characterToHeal.currentVillage)}`, inline: true },
        { name: '__❤️ Hearts to Heal__', value: `> ${heartsToHeal}`, inline: true },
        { name: '__💰 Payment Offered__', value: `> ${paymentOffered || 'None'}`, inline: false }
    );

    // Add specific fields based on request status
    if (isFulfilled) {
        embed.addFields({
            name: '__✅ Status__',
            value: `> This request has been fulfilled by **${healerName}**.`,
            inline: false,
        });
    } else {
        embed.addFields(
            {
                name: '__💡 Payment Instructions__',
                value: `> _User will need to use </gift:1306176789755858976> to transfer payment to the healer._`,
                inline: false,
            },
            {
                name: '__🩹 Healing Instructions__',
                value: `> Healers, please use </heal fulfill:1306176789755858977> to heal **${characterToHeal.name}**!`,
                inline: false,
            },
            {
                name: '__🆔 Request ID__',
                value: `> \`${healingRequestId}\``,
                inline: false,
            },
            {
                name: '__❌ Cancel Request__',
                value: `> _If you no longer want this request fulfilled, react with a ❌._`,
                inline: false,
            }
        );
    }

    embed.setImage(DEFAULT_IMAGE_URL).setFooter({
        text: isFulfilled
            ? 'Healing process successfully completed.'
            : 'This request expires 24 hours from now.',
        iconURL: healerCharacter ? healerIcon : null,
    });

    return embed;
};



// ------------------- Function to create HEALED  embed -------------------
const createHealingEmbed = (healerCharacter, characterToHeal, heartsHealed, staminaRecovered, healingRequestId) => {
    if (!characterToHeal || !healerCharacter) {
        throw new Error('Both healer and character to heal are required.');
    }

    // Healer and character details
    const healerName = healerCharacter.name || 'Unknown Healer';
    const characterName = characterToHeal.name || 'Unknown Character';
    const healerIcon = healerCharacter.icon || DEFAULT_IMAGE_URL;
    const characterIcon = characterToHeal.icon || DEFAULT_IMAGE_URL;

    // Calculate new hearts and stamina values
    const newHearts = Math.min(characterToHeal.currentHearts + heartsHealed, characterToHeal.maxHearts);
    const newStamina = Math.min(healerCharacter.currentStamina - staminaRecovered, healerCharacter.maxStamina);

    return new EmbedBuilder()
        .setColor('#59A914') // Green healing color
        .setTitle('✬ Healing Completed ✬')
        .setDescription(`**${healerName}** successfully healed **${characterName}**!`)
        .addFields(
            {
                name: `${characterName} has been healed!`,
                value: `❤️ Healed: **${heartsHealed} hearts**\n` +
                       `❤️ Hearts: **${characterToHeal.currentHearts}/${characterToHeal.maxHearts} → ${newHearts}/${characterToHeal.maxHearts}**`,
                inline: false,
            },
            {
                name: `${healerName} used their skills to heal`,
                value: `🟩 Stamina Used: **${staminaRecovered}**\n` +
                       `🟩 Stamina: **${healerCharacter.currentStamina}/${healerCharacter.maxStamina} → ${newStamina}/${healerCharacter.maxStamina}**`,
                inline: false,
            }
        )
        .setAuthor({
            name: `${characterName} 🔗`,
            iconURL: characterIcon,
            url: characterToHeal.inventory || '',
        })
        .setFooter({
            text: 'Healing process successfully completed.',
            iconURL: healerIcon,
        })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'); // Custom image
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
    aggregateItems,
    formatMaterialsList,
    createCraftingEmbed,
    createHealingEmbed
};
