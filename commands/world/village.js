// ------------------- Standard Libraries -------------------
// Used for generating unique identifiers.
const { v4: uuidv4 } = require('uuid');


const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Discord.js Components -------------------
// Used for building slash commands and creating rich embed messages.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');


// ------------------- Database Services -------------------
// Services for database operations related to characters and tokens.
const { fetchCharacterByName, getOrCreateToken, updateTokenBalance } = require('../../database/db');


// ------------------- Utility Functions -------------------
// Helper function for inventory management.
const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');


// ------------------- Database Models -------------------
// Database models for village and item data.
const ItemModel = require('../../models/ItemModel');
const { Village } = require('../../models/VillageModel');


// ------------------- Google Sheets API -------------------
// Utility functions for logging and tracking via Google Sheets.
const { appendSheetData, authorizeSheets, extractSpreadsheetId, safeAppendDataToSheet, } = require('../../utils/googleSheetsUtils');






// ------------------- Helper Functions: Formatting -------------------

// Formats required materials for display with progress bars and quantities.
// Retrieves item details (such as emoji and display name) from the item model.
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

// Creates a visual progress bar to represent current progress relative to a maximum value.
function formatProgress(current, max) {
    if (max <= 0) {
        console.warn(`[village.js:logs] formatProgress: Invalid max value: ${max}`);
        return '`▱▱▱▱▱▱▱▱▱▱` 0/0';
    }

    const progress = Math.max(0, Math.min(10, Math.round((current / max) * 10))); // Clamp between 0 and 10.
    const progressBar = `\`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\``;
    return `${progressBar} ${current}/${max}`;
}



// ------------------- Village Images -------------------
// Stores image URLs for each village for display purposes.
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



// ------------------- Slash Command Definition and Execution -------------------
// This module defines the "village" slash command with its subcommands (view and upgrade)
// and contains the logic for executing each subcommand.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('village')
        .setDescription('Manage and view village information')
        // ------------------- Subcommand: View Village -------------------
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
                        ))
        )
        // ------------------- Subcommand: Upgrade Village -------------------
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
        // Retrieve subcommand and input options.
        const subcommand = interaction.options.getSubcommand();
        const villageName = interaction.options.getString('name');
        const type = interaction.options.getString('type');
        const itemName = interaction.options.getString('itemname');
        const qty = interaction.options.getInteger('qty');
        const characterName = interaction.options.getString('charactername'); // Character donating items (if applicable)

        try {
            console.log(`[village.js:logs] execute: Handling subcommand "${subcommand}" for village "${villageName}"`);

            if (!villageName) {
                return interaction.reply({ content: '❌ **Village name is required.**', ephemeral: true });
            }

            // Fetch the village details from the database.
            const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
            if (!village) {
                console.warn(`[village.js:logs] execute: Village "${villageName}" not found.`);
                return interaction.reply({ content: `❌ **Village "${villageName}" not found.**`, ephemeral: true });
            }

            // ------------------- Subcommand: View -------------------
            if (subcommand === 'view') {
                const nextLevel = village.level + 1;
                const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;

                // Determine tokens required for the next level.
                const tokensNeeded = village.tokenRequirements instanceof Map
                    ? village.tokenRequirements.get(nextLevel.toString()) || 0
                    : village.tokenRequirements?.[nextLevel.toString()] || 0;

                console.log(`[village.js:logs] execute (view): Tokens needed for level ${nextLevel}: ${tokensNeeded}`);

                // Filter and map the required materials for the next level.
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

                // Format materials and progress bars.
                const formattedMaterials = await formatMaterials(requiredMaterials, materials);
                const healthBar = formatProgress(village.health, village.levelHealth.get(village.level.toString()) || 100);
                const tokenBar = formatProgress(village.currentTokens || 0, tokensNeeded || 1);

                // Build the embed for village details.
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
                        { name: '📦 **__Materials Needed__**', value: formattedMaterials.join('\n'), inline: false }
                    )
                    .setColor(village.color)
                    .setThumbnail(villageImages[villageName]?.thumbnail || '')
                    .setImage(villageImages[villageName]?.main || '');

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // ------------------- Subcommand: Upgrade -------------------
            if (subcommand === 'upgrade') {
                const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
                const validMaterialKeys = Object.keys(materials).filter(key => !key.startsWith('$'));
                
                console.log(`[village.js:logs] execute (upgrade): Valid material keys: ${validMaterialKeys}`);
                console.log(`[village.js:logs] execute (upgrade): Normalizing item name: "${itemName}"`);

                if (type === 'Items' && !itemName) {
                    return interaction.reply({ content: '❌ **Item name is required when upgrading by items.**', ephemeral: true });
                }

                if (type === 'Items' && !characterName) {
                    return interaction.reply({ content: '❌ **Character name is required for item donations.**', ephemeral: true });
                }

                const nextLevel = village.level + 1;

                if (type === 'Items') {
                    // Find the matching material key based on the provided item name.
                    const matchedKey = validMaterialKeys.find(key => key.toLowerCase() === itemName.trim().toLowerCase());
                    console.log(`[village.js:logs] execute (upgrade): Matched key: "${matchedKey}"`);

                    if (!matchedKey) {
                        return interaction.reply({ content: '❌ **Invalid item name. Please try again.**', ephemeral: true });
                    }

                    // Extract the core item name (ignoring any extra annotations).
                    const coreItemName = matchedKey.split('(')[0].trim();
                    console.log(`[village.js:logs] execute (upgrade): Core material name: "${coreItemName}"`);

                    const itemKey = coreItemName;
                    if (!village.materials.has(itemKey)) {
                        village.materials.set(itemKey, { current: 0, required: {} });
                    }

                    const material = village.materials.get(itemKey);
                    const current = material.current || 0;
                    const required = material.required || {};
                    const remaining = Math.max(0, (required[nextLevel] || 0) - (current + qty));

                    // Update village material while preserving required values.
                    village.materials.set(itemKey, { current: current + qty, required });
                    await village.save();

                    // Deduct the item from the character's inventory.
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

                    // Log the donation to Google Sheets if the character's inventory tracker exists.
                    if (donatingCharacter.inventory) {
                        const spreadsheetId = extractSpreadsheetId(donatingCharacter.inventory);
                        const auth = await authorizeSheets();
                        const formattedDateTime = new Date().toISOString();
                        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                        // Retrieve item details for logging.
                        const itemDetails = await ItemModel.findOne({ itemName: { $regex: `^${coreItemName}$`, $options: 'i' } });
                        const category = itemDetails?.category?.join(', ') || '';
                        const typeDetails = itemDetails?.type?.join(', ') || '';
                        const subtype = itemDetails?.subtype?.join(', ') || '';

                        const inventoryRow = [
                            donatingCharacter.name,             // Character Name
                            coreItemName,                      // Item Name
                            `-${qty}`,                         // Quantity (negative for donation)
                            category,                          // Category
                            typeDetails,                       // Type
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

                        await safeAppendDataToSheet(spreadsheetId, auth.name, 'loggedInventory!A2:N', [inventoryRow]);
                        console.log(`[village.js:logs] execute (upgrade): Logged donation to Google Sheets for character "${characterName}" to village "${villageName}"`);
                    }

                    // Retrieve emoji and display name for the donated item.
                    const item = await ItemModel.findOne({ itemName: { $regex: `^${itemKey}$`, $options: 'i' } });
                    const emoji = item?.emoji || ':grey_question:';
                    const displayName = item?.itemName || itemKey;

                    // Prepare a progress bar for the updated donation status.
                    const progressBar = `\`${'▰'.repeat(Math.round(((current + qty) / required[nextLevel]) * 10))}${'▱'.repeat(10 - Math.round(((current + qty) / required[nextLevel]) * 10))}\``;

                    // Build an embed to confirm the successful donation.
                    const embed = new EmbedBuilder()
                        .setTitle(`${village.name} (Level ${village.level})`)
                        .setDescription(
                            `🎉 **${characterName}** has donated **${displayName} x ${qty}** to upgrade the village!\nUse </village view:1324300899585363968> to check the current status.`
                        )
                        .addFields(
                            { name: '📦 Material Progress', value: `${emoji} ${displayName}\n> ${progressBar} ${current + qty}/${required[nextLevel]}`, inline: true }
                        )
                        .setColor(village.color)
                        .setThumbnail(villageImages[village.name]?.thumbnail || '')
                        .setImage(villageImages[village.name]?.main || '')
                        .setFooter({ text: `${remaining} more "${displayName}" needed for level ${nextLevel}.` });

                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                // ------------------- Upgrade by Tokens -------------------
                else if (type === 'Tokens') {
                    const userId = interaction.user.id;
                    const tokenRecord = await getOrCreateToken(userId);

                    if (tokenRecord.tokens < qty) {
                        return interaction.reply({
                            content: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}`,
                            ephemeral: true,
                        });
                    }

                    const requiredTokens = village.tokenRequirements?.get(nextLevel.toString()) ||
                        village.tokenRequirements[nextLevel.toString()] || 0;
                    const remainingTokens = Math.max(0, requiredTokens - (village.currentTokens + qty));

                    // Deduct tokens from the user.
                    await updateTokenBalance(userId, -qty);
                    console.log(`[village.js:logs] execute (upgrade): Deducted ${qty} tokens from user ${userId}`);

                    // Update the village's token balance.
                    village.currentTokens = (village.currentTokens || 0) + qty;
                    await village.save();
                    console.log(`[village.js:logs] execute (upgrade): Updated tokens for village "${villageName}" to ${village.currentTokens}`);

                    // Log token contribution to Google Sheets if a token tracker is set up.
                    if (tokenRecord.tokenTracker) {
                        const spreadsheetId = extractSpreadsheetId(tokenRecord.tokenTracker);
                        const auth = await authorizeSheets();
                        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                        const tokenRow = [
                            `Village Upgrade - ${villageName}`, // Action
                            interactionUrl,                      // Interaction URL
                            'purchase',                          // Category (note: spelling corrected)
                            'spent',                             // Type
                            `-${qty}`,                           // Amount (negative for tokens spent)
                        ];

                        await safeAppendDataToSheet(spreadsheetId, auth.name, 'loggedTracker!B7:F', [tokenRow]);
                        console.log(`[village.js:logs] execute (upgrade): Logged token contribution to Google Sheets for user ${userId}`);
                    }

                    // Prepare a progress bar for token contribution.
                    let progressBar = '';
                    if (requiredTokens > 0) {
                        const progress = Math.round(((village.currentTokens) / requiredTokens) * 10);
                        progressBar = `\`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\``;
                    } else {
                        progressBar = '`▰▰▰▰▰▰▰▰▰▰`';
                    }

                    // Build an embed to confirm the token donation.
                    const embed = new EmbedBuilder()
                        .setTitle(`${village.name} (Level ${village.level})`)
                        .setDescription(
                            `🎉 **${interaction.user.username}** has contributed **Tokens x ${qty}** towards upgrading the village!\nUse </village view:1324300899585363968> to check the status.`
                        )
                        .addFields(
                            { name: '🪙 Token Progress', value: `> ${progressBar} ${village.currentTokens}/${requiredTokens}`, inline: true }
                        )
                        .setColor(village.color)
                        .setThumbnail(villageImages[villageName]?.thumbnail || '')
                        .setImage(villageImages[villageName]?.main || '')
                        .setFooter({ text: `${remainingTokens} more tokens needed for level ${nextLevel}.` });

                    return interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    return interaction.reply({ content: '❌ **Invalid upgrade type.**', ephemeral: true });
                }
            }
        } catch (error) {
    handleError(error, 'village.js');

            console.error(`[village.js:error] An error occurred while processing "${subcommand}" for village "${villageName}":`, error);
            return interaction.reply({ content: '❌ **An error occurred while processing your request.**', ephemeral: true });
        }
    },
};
