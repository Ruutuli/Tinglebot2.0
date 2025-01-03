// ------------------- Import necessary modules -------------------

// Standard library imports

// Third-party library imports
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Local modules and database models
const { Village } = require('../models/VillageModel');
const ItemModel = require('../models/ItemModel');
const { fetchCharactersByUserId, getCharacterInventoryCollection, fetchCharacterByName } = require('../database/characterService');
const { handleVillageMaterialsAutocomplete } = require('../handlers/autocompleteHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { appendSheetData, authorizeSheets, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const { getOrCreateToken, updateTokenBalance } = require('../database/tokenService'); // Token services

// ------------------- Helper Functions -------------------

// Validates if required items or tokens are sufficient for upgrading
async function canUpgradeByItems(village, itemName, qty, nextLevel) {
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const normalizedItemName = Object.keys(materials).find(
        key => key.toLowerCase() === itemName.trim().toLowerCase()
    );

    if (!normalizedItemName) {
        console.warn(`[canUpgradeByItems] Item "${itemName}" not found in village materials.`);
        return { success: false, message: `Item "${itemName}" not found.` };
    }

    const material = materials[normalizedItemName];
    const required = material.required[nextLevel];
    if (required === undefined) {
        console.warn(`[canUpgradeByItems] Item "${normalizedItemName}" not required for level ${nextLevel}.`);
        return { success: false, message: `Item "${itemName}" is not required for level ${nextLevel}.` };
    }

    const current = material.current || 0;
    console.log(`[canUpgradeByItems] Item "${normalizedItemName}": Current = ${current}, Required = ${required}, Adding = ${qty}`);

    if (current + qty >= required) {
        return { success: true };
    } else {
        return {
            success: false,
            message: `❌ **Insufficient items for upgrade.** ${required - (current + qty)} more "${normalizedItemName}" needed.`,
        };
    }
}






async function canUpgradeByTokens(village, tokens, nextLevel) {
    const requiredTokens = village.tokenRequirements[nextLevel.toString()] || 0;
    return (village.currentTokens + tokens) >= requiredTokens;
}

// Updates the materials or tokens for a village
async function updateVillageResources(village, type, itemName, qty, nextLevel) {
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const normalizedItemName = Object.keys(materials).find(
        key => key.toLowerCase() === itemName.trim().toLowerCase()
    );

    if (type === 'Items' && normalizedItemName) {
        const material = village.materials[normalizedItemName];
        material.current = (material.current || 0) + qty;
        console.log(`[updateVillageResources] Updated "${normalizedItemName}" to ${material.current}`);
    } else if (type === 'Tokens') {
        village.currentTokens = (village.currentTokens || 0) + qty;
        console.log(`[updateVillageResources] Updated tokens to ${village.currentTokens}`);
    }

    await village.save();
    return village;
}





// ------------------- Helper function to format materials -------------------
// Formats required materials for display with progress bars and quantities.
async function formatMaterials(requiredMaterials, villageMaterials) {
    const formattedMaterials = [];
    for (const [name, requiredQty] of Object.entries(requiredMaterials)) {
        const normalizedName = Object.keys(villageMaterials).find(
            key => key.toLowerCase() === name.toLowerCase()
        ) || name;
        const item = await ItemModel.findOne({ itemName: { $regex: `^${normalizedName}$`, $options: 'i' } });
        const emoji = item?.emoji || ':grey_question:';
        const displayName = item?.itemName || normalizedName;
        const currentQty = villageMaterials[normalizedName]?.current || 0;
        const progressBar = `\`${'▰'.repeat(Math.round((currentQty / requiredQty) * 10))}${'▱'.repeat(10 - Math.round((currentQty / requiredQty) * 10))}\``;
        formattedMaterials.push(`${emoji} **${displayName}**\n> ${progressBar} ${currentQty}/${requiredQty}`);
    }
    return formattedMaterials;
}

// ------------------- Helper function to format progress -------------------
// Creates a visual progress bar to represent current progress against a maximum value.
function formatProgress(current, max) {
    if (max <= 0) {
        console.warn(`[formatProgress] Invalid max value: ${max}`);
        return '`▱▱▱▱▱▱▱▱▱▱` 0/0'; // Handle edge case of max <= 0
    }

    const progress = Math.max(0, Math.min(10, Math.round((current / max) * 10))); // Clamp between 0 and 10
    const progressBar = `\`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\``;
    return `${progressBar} ${current}/${max}`;
}


// ------------------- Assign images for each village -------------------
const villageImages = {
    Rudania: {
        main: 'https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20red.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_rudania_.png',
    },
    Inariko: {
        main: 'https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20blue.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_inariko_.png',
    },
    Vhintl: {
        main: 'https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20GREEN.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_vhintl_.png',
    },
};

// ------------------- Slash command definition -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('village')
        .setDescription('Manage and view village information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View details of a village')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the village')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Rudania', value: 'Rudania' },
                            { name: 'Inariko', value: 'Inariko' },
                            { name: 'Vhintl', value: 'Vhintl' }
                        )))
                        .addSubcommand(subcommand =>
                            subcommand
                                .setName('upgrade')
                                .setDescription('Upgrade a village')
                                .addStringOption(option =>
                                    option.setName('name')
                                        .setDescription('Name of the village to upgrade')
                                        .setRequired(true)
                                        .addChoices(
                                            { name: 'Rudania', value: 'Rudania' },
                                            { name: 'Inariko', value: 'Inariko' },
                                            { name: 'Vhintl', value: 'Vhintl' }
                                        ))
                                        .addStringOption(option =>
                                            option.setName('charactername')
                                                .setDescription('Name of the character donating items')
                                                .setRequired(true)
                                                .setAutocomplete(true))
                                .addStringOption(option =>
                                    option.setName('type')
                                        .setDescription('Upgrade using Items or Tokens')
                                        .setRequired(true)
                                        .addChoices(
                                            { name: 'Items', value: 'Items' },
                                            { name: 'Tokens', value: 'Tokens' }
                                        ))
                                .addIntegerOption(option =>
                                    option.setName('qty')
                                        .setDescription('Quantity of items or tokens to contribute')
                                        .setRequired(true))
                                .addStringOption(option =>
                                    option.setName('itemname')
                                        .setDescription('Name of the item to use (if using Items)')
                                        .setRequired(false)
                                        .setAutocomplete(true))
),

// ------------------- Command Execution -------------------
async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const villageName = interaction.options.getString('name');
    const type = interaction.options.getString('type');
    const itemName = interaction.options.getString('itemname');
    const qty = interaction.options.getInteger('qty');
    const characterName = interaction.options.getString('charactername'); // New character name option

    try {
        console.log(`[village.js:logs] Handling ${subcommand} for village: ${villageName}`);

        if (!villageName) {
            return interaction.reply({ content: '❌ **Village name is required.**', ephemeral: true });
        }

        // Fetch the village details
        const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });

        if (!village) {
            console.warn(`[village.js:logs] Village "${villageName}" not found.`);
            return interaction.reply({ content: `❌ **Village "${villageName}" not found.**`, ephemeral: true });
        }

        if (subcommand === 'view') {
            const nextLevel = village.level + 1;
            const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;

            // Define tokens needed for the next level
            const tokensNeeded = village.tokenRequirements instanceof Map
                ? village.tokenRequirements.get(nextLevel.toString()) || 0
                : village.tokenRequirements?.[nextLevel.toString()] || 0;

            console.log(`[village.js:debug] Tokens needed for level ${nextLevel}: ${tokensNeeded}`);

            const requiredMaterials = Object.fromEntries(
                Object.entries(materials || {}).filter(([key, material]) => {
                    const originalKey = Object.keys(materials).find(k => k.toLowerCase() === key.toLowerCase()) || key;
                    const correctMaterial = materials[originalKey];
                    const isRequired = correctMaterial?.required?.[nextLevel] !== undefined;
                    const hasCurrentQty = correctMaterial?.current !== undefined;
                    return isRequired && hasCurrentQty;
                }).map(([key]) => {
                    const originalKey = Object.keys(materials).find(k => k.toLowerCase() === key.toLowerCase()) || key;
                    const correctMaterial = materials[originalKey];
                    return [originalKey, correctMaterial.required[nextLevel]];
                })
            );

            const formattedMaterials = await formatMaterials(requiredMaterials, materials);

            const healthBar = formatProgress(
                village.health,
                village.levelHealth.get(village.level.toString()) || 100
            );
            const tokenBar = formatProgress(
                village.currentTokens || 0,
                tokensNeeded || 1
            );

            // ------------------- Embed Section -------------------
            const embed = new EmbedBuilder()
                .setTitle(`${village.name} (Level ${village.level})`)
                .addFields(
                    { name: '🌟 **__Level__**', value: `> ${village.level}`, inline: true },
                    { name: '❤️ **__Health__**', value: `> ${healthBar}`, inline: false },
                    {
                        name: '🪙 **__Tokens Needed__**',
                        value: tokensNeeded > 0 ? `> ${tokenBar}` : 'No tokens needed for the next level.',
                        inline: false,
                    },
                    {
                        name: '📦 **__Materials Needed__**',
                        value: formattedMaterials.join('\n'),
                        inline: false,
                    }
                )
                .setColor(village.color)
                .setThumbnail(villageImages[villageName]?.thumbnail || '')
                .setImage(villageImages[villageName]?.main || '');

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (subcommand === 'upgrade') {
            const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
            const validMaterialKeys = Object.keys(materials).filter(key => !key.startsWith('$'));
            const characterName = interaction.options.getString('charactername'); // New charactername input
        
            console.log(`[execute] Valid material keys: ${validMaterialKeys}`);
            console.log(`[execute] Attempting to normalize item name: "${itemName}"`);
        
            if (type === 'Items' && !itemName) {
                return interaction.reply({ content: '❌ **Item name is required when upgrading by items.**', ephemeral: true });
            }
        
            if (type === 'Items' && !characterName) {
                return interaction.reply({ content: '❌ **Character name is required for item donations.**', ephemeral: true });
            }
        
            const nextLevel = village.level + 1;
        
            if (type === 'Items') {
                // Match the correct key
                const matchedKey = validMaterialKeys.find(key => key.toLowerCase() === itemName.trim().toLowerCase());
                console.log(`[execute] Matched key: "${matchedKey}"`);
        
                if (!matchedKey) {
                    return interaction.reply({ content: '❌ **Invalid item name. Please try again.**', ephemeral: true });
                }
        
                const coreItemName = matchedKey.split('(')[0].trim();
                console.log(`[execute] Core material name: "${coreItemName}"`);
        
                const itemKey = coreItemName;
        
                if (!village.materials.has(itemKey)) {
                    village.materials.set(itemKey, { current: 0, required: {} });
                }
        
                const material = village.materials.get(itemKey);
                const current = material.current || 0;
                const required = material.required || {};
                const remaining = Math.max(0, (required[nextLevel] || 0) - (current + qty));
        
                // Update only the current value, preserving the required field
                village.materials.set(itemKey, { current: current + qty, required });
        
                // Save the updated village
                await village.save();
        
                // Deduct the item from the character's inventory
                const donatingCharacter = await fetchCharacterByName(characterName);
                if (!donatingCharacter) {
                    return interaction.reply({ content: `❌ **Character "${characterName}" not found.**`, ephemeral: true });
                }
        
                const removed = await removeItemInventoryDatabase(donatingCharacter._id, coreItemName, qty, interaction);
                if (!removed) {
                    return interaction.reply({
                        content: `❌ **Failed to remove "${coreItemName}" from ${characterName}'s inventory. Insufficient quantity or item not found.**`,
                        ephemeral: true,
                    });
                }
        
                // Log to Google Sheets
                if (donatingCharacter.inventory) {
                    const spreadsheetId = extractSpreadsheetId(donatingCharacter.inventory);
                    const auth = await authorizeSheets();
                    const formattedDateTime = new Date().toISOString();
                    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        
                    // Fetch item details
                    const itemDetails = await ItemModel.findOne({ itemName: { $regex: `^${coreItemName}$`, $options: 'i' } });
                    const category = itemDetails?.category?.join(', ') || '';
                    const type = itemDetails?.type?.join(', ') || '';
                    const subtype = itemDetails?.subtype?.join(', ') || '';
        
                    const inventoryRow = [
                        donatingCharacter.name,             // Character Name
                        coreItemName,                      // Item Name
                        `-${qty}`,                         // Quantity (negative for donation)
                        category,                          // Category
                        type,                              // Type
                        subtype,                           // Subtype
                        `Donation to ${villageName}`,      // Action (with village name)
                        donatingCharacter.job,             // Character Job
                        '',                                // Reserved for future use
                        donatingCharacter.currentVillage,  // Current Village
                        villageName,                       // Target Village
                        interactionUrl,                    // Interaction URL
                        formattedDateTime,                 // Timestamp
                        uuidv4(),                          // Unique Identifier
                    ];
        
                    await appendSheetData(auth, spreadsheetId, 'loggedInventory!A2:N', [inventoryRow]);
                    console.log(`[village.js:logs] Logged donation to Google Sheet for character: "${characterName}" to village: "${villageName}"`);
                }
        
                // Get emoji and item display name
                const item = await ItemModel.findOne({ itemName: { $regex: `^${itemKey}$`, $options: 'i' } });
                const emoji = item?.emoji || ':grey_question:';
                const displayName = item?.itemName || itemKey;
        
                // Prepare the progress bar
                const progressBar = `\`${'▰'.repeat(Math.round(((current + qty) / required[nextLevel]) * 10))}${'▱'.repeat(10 - Math.round(((current + qty) / required[nextLevel]) * 10))}\``;
        
                // Prepare the embed
                const embed = new EmbedBuilder()
                    .setTitle(`${village.name} (Level ${village.level})`)
                    .setDescription(
                        `${characterName} has donated **${displayName} x ${qty}** to the village's upgrade!\nTo view the status of the villages, use </village view:1324300899585363968>`
                    )
                    .addFields(
                        { name: '📦 Material Progress', value: `${emoji} ${displayName}\n> ${progressBar} ${current + qty}/${required[nextLevel]}`, inline: true }
                    )
                    .setColor(village.color)
                    .setThumbnail(villageImages[village.name]?.thumbnail || '')
                    .setImage(villageImages[village.name]?.main || '')
                    .setFooter({ text: `${remaining} more "${displayName}" needed for level ${nextLevel}.` });
        
                // Reply with the embed
                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (type === 'Tokens') {
                const userId = interaction.user.id;
                const tokenRecord = await getOrCreateToken(userId);
            
                if (tokenRecord.tokens < qty) {
                    return interaction.reply({
                        content: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}`,
                        ephemeral: true,
                    });
                }
            
                const requiredTokens = village.tokenRequirements?.get(nextLevel.toString()) || village.tokenRequirements[nextLevel.toString()] || 0;
                const remainingTokens = Math.max(0, requiredTokens - (village.currentTokens + qty));
            
                // Deduct tokens from user
                await updateTokenBalance(userId, -qty);
                console.log(`[village.js:logs] Deducted ${qty} tokens from user: ${userId}`);
            
                // Update village tokens
                village.currentTokens = (village.currentTokens || 0) + qty;
                await village.save();
                console.log(`[village.js:logs] Updated tokens for village "${villageName}" to ${village.currentTokens}`);
            
                // Log to user's Google Sheets tracker
                if (tokenRecord.tokenTracker) {
                    const spreadsheetId = extractSpreadsheetId(tokenRecord.tokenTracker);
                    const auth = await authorizeSheets();
                    const formattedDateTime = new Date().toISOString();
                    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            
                    const tokenRow = [
                        `Village Upgrade - ${villageName}`, // Action
                        interactionUrl,                   // Link
                        'purcahse',                       // Category
                        'spent',                          // Type
                        `-${qty}`,                        // Amount (negative for spent tokens)
                    ];
            
                    await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', [tokenRow]);
                    console.log(`[village.js:logs] Logged token contribution to Google Sheets for user: ${userId}`);
                }
            
                // Prepare the progress bar
                let progressBar = '';
                if (requiredTokens > 0) {
                    const progress = Math.round(((village.currentTokens) / requiredTokens) * 10);
                    progressBar = `\`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\``;
                } else {
                    progressBar = '`▰▰▰▰▰▰▰▰▰▰`'; // Fully filled bar for completed levels
                }
            
                // Prepare embed
                const embed = new EmbedBuilder()
                    .setTitle(`${village.name} (Level ${village.level})`)
                    .setDescription(
                        `${interaction.user.username} has contributed **Tokens x ${qty}** to the village's upgrade!\n\nTo view the status of the villages, use </village view:1324300899585363968>.`
                    )
                    .addFields(
                        { name: '🪙 Token Progress', value: `> ${progressBar} ${village.currentTokens}/${requiredTokens}`, inline: true }
                    )
                    .setColor(village.color)
                    .setThumbnail(villageImages[villageName]?.thumbnail || '')
                    .setImage(villageImages[villageName]?.main || '')
                    .setFooter({ text: `${remainingTokens} more tokens needed for level ${nextLevel}.` });
            
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            


             else {
                return interaction.reply({ content: '❌ **Invalid upgrade type.**', ephemeral: true });
            }
                
}
        
        
    } catch (error) {
        console.error(`[village.js:error] An error occurred while processing ${subcommand} for "${villageName}":`, error);
        return interaction.reply({ content: '❌ **An error occurred while processing your request.**', ephemeral: true });
    }
  },
};
