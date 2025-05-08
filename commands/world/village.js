// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ---- Discord.js Components ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ============================================================================
// ---- Database Services ----
// ============================================================================
const { fetchCharacterByName, getOrCreateToken, updateTokenBalance } = require('../../database/db');

// ============================================================================
// ---- Utility Functions ----
// ============================================================================
const { handleError } = require('../../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');
const { appendSheetData, authorizeSheets, extractSpreadsheetId, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');

// ============================================================================
// ---- Database Models ----
// ============================================================================
const ItemModel = require('../../models/ItemModel');
const { Village } = require('../../models/VillageModel');
const { initializeVillages } = require('../../modules/villageModule');

// ============================================================================
// ---- Constants ----
// ============================================================================
const VILLAGE_IMAGES = {
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

const COOLDOWN_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ---- Function: formatMaterials ----
// Formats required materials for display with progress bars and quantities
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

// ---- Function: formatProgress ----
// Creates a visual progress bar to represent current progress relative to a maximum value
function formatProgress(current, max) {
    if (max <= 0) {
        console.warn(`[village.js] formatProgress: Invalid max value: ${max}`);
        return '`▱▱▱▱▱▱▱▱▱▱` 0/0';
    }

    const progress = Math.max(0, Math.min(10, Math.round((current / max) * 10))); // Clamp between 0 and 10.
    const progressBar = `\`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\``;
    return `${progressBar} ${current}/${max}`;
}

// ---- Function: processContribution ----
// Handles the contribution of items or tokens for village upgrades
async function processContribution(village, interaction, type, itemName, qty, characterName) {
    try {
        if (type === 'Items') {
            return await processItemContribution(village, interaction, itemName, qty, characterName);
        } else if (type === 'Tokens') {
            return await processTokenContribution(village, interaction, qty);
        }
        return { success: false, message: '❌ **Invalid contribution type.**' };
    } catch (error) {
        handleError(error, 'village.js');
        console.error('[processContribution] Error:', error);
        return { success: false, message: '❌ **An error occurred while processing your contribution.**' };
    }
}

// ---- Function: processItemContribution ----
// Handles the contribution of items for village upgrades
async function processItemContribution(village, interaction, itemName, qty, characterName) {
    if (!itemName || !characterName) {
        return { success: false, message: '❌ **Item name and character name are required for item donations.**' };
    }

    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const matchedKey = Object.keys(materials).find(key => key.toLowerCase() === itemName.trim().toLowerCase());

    if (!matchedKey) {
        return { success: false, message: '❌ **Invalid item name. Please try again.**' };
    }

    const nextLevel = village.level + 1;
    const material = materials[matchedKey];
    const required = material.required[nextLevel] || 0;
    const current = material.current || 0;

    if (current + qty > required) {
        return { success: false, message: `❌ **Cannot contribute more than required. Need ${required - current} more.**` };
    }

    // Deduct items from character
    const donatingCharacter = await fetchCharacterByName(characterName);
    if (!donatingCharacter) {
        return { success: false, message: `❌ **Character "${characterName}" not found.**` };
    }

    const removed = await removeItemInventoryDatabase(donatingCharacter._id, matchedKey, qty, interaction);
    if (!removed) {
        return { success: false, message: `❌ **Failed to remove items from ${characterName}'s inventory.**` };
    }

    // Update village materials
    material.current = current + qty;
    village.materials.set(matchedKey, material);

    // Update contributor tracking
    const contributorKey = donatingCharacter._id.toString();
    const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
    contributorData.items[matchedKey] = (contributorData.items[matchedKey] || 0) + qty;
    village.contributors.set(contributorKey, contributorData);

    // Check for level up
    const leveledUp = await checkAndHandleVillageLevelUp(village);
    if (leveledUp) {
        // Update vending tier and discount
        village.vendingTier = village.level;
        village.vendingDiscount = village.level === 2 ? 10 : village.level === 3 ? 20 : 0;
    }

    await village.save();

    // Generate embed
    const item = await ItemModel.findOne({ itemName: { $regex: `^${matchedKey}$`, $options: 'i' } });
    const emoji = item?.emoji || ':grey_question:';
    const displayName = item?.itemName || matchedKey;
    const progressBar = `\`${'▰'.repeat(Math.round(((current + qty) / required) * 10))}${'▱'.repeat(10 - Math.round(((current + qty) / required) * 10))}\``;

    const embed = new EmbedBuilder()
        .setTitle(`${village.name} (Level ${village.level})`)
        .setDescription(
            leveledUp
                ? `🎉 **${characterName}** has donated **${displayName} x ${qty}** to upgrade the village!\n\n` +
                  `🌟 **The village has reached level ${village.level}!**\n` +
                  `Use </village view:1324300899585363968> to check the new requirements.`
                : `🎉 **${characterName}** has donated **${displayName} x ${qty}** to upgrade the village!\n` +
                  `Use </village view:1324300899585363968> to check the current status.`
        )
        .addFields(
            { name: '📦 Material Progress', value: `${emoji} ${displayName}\n> ${progressBar} ${current + qty}/${required}`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || '')
        .setImage(VILLAGE_IMAGES[village.name]?.main || '');

    return { success: true, embed };
}

// ---- Function: processTokenContribution ----
// Handles the contribution of tokens for village upgrades
async function processTokenContribution(village, interaction, qty) {
    const userId = interaction.user.id;
    const tokenRecord = await getOrCreateToken(userId);

    if (tokenRecord.tokens < qty) {
        return { success: false, message: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}` };
    }

    const nextLevel = village.level + 1;
    const requiredTokens = village.tokenRequirements.get(nextLevel.toString()) || 0;
    const currentTokens = village.currentTokens || 0;

    if (currentTokens + qty > requiredTokens) {
        return { success: false, message: `❌ **Cannot contribute more than required. Need ${requiredTokens - currentTokens} more tokens.**` };
    }

    // Deduct tokens
    await updateTokenBalance(userId, -qty);

    // Update village tokens
    village.currentTokens = currentTokens + qty;

    // Update contributor tracking
    const contributorKey = userId;
    const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
    contributorData.tokens += qty;
    village.contributors.set(contributorKey, contributorData);

    // Check for level up
    const leveledUp = await checkAndHandleVillageLevelUp(village);
    if (leveledUp) {
        // Update vending tier and discount
        village.vendingTier = village.level;
        village.vendingDiscount = village.level === 2 ? 10 : village.level === 3 ? 20 : 0;
    }

    await village.save();

    // Generate embed
    const progressBar = `\`${'▰'.repeat(Math.round(((currentTokens + qty) / requiredTokens) * 10))}${'▱'.repeat(10 - Math.round(((currentTokens + qty) / requiredTokens) * 10))}\``;

    const embed = new EmbedBuilder()
        .setTitle(`${village.name} (Level ${village.level})`)
        .setDescription(
            leveledUp
                ? `🎉 **${interaction.user.username}** has contributed **Tokens x ${qty}** towards upgrading the village!\n\n` +
                  `🌟 **The village has reached level ${village.level}!**\n` +
                  `Use </village view:1324300899585363968> to check the new requirements.`
                : `🎉 **${interaction.user.username}** has contributed **Tokens x ${qty}** towards upgrading the village!\n` +
                  `Use </village view:1324300899585363968> to check the status.`
        )
        .addFields(
            { name: '🪙 Token Progress', value: `> ${progressBar} ${currentTokens + qty}/${requiredTokens}`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || '')
        .setImage(VILLAGE_IMAGES[village.name]?.main || '');

    return { success: true, embed };
}

// ---- Function: processRepair ----
// Handles the repair of a damaged village
async function processRepair(village, interaction, type, itemName, qty, characterName) {
    try {
        const lostResources = village.lostResources instanceof Map ? Object.fromEntries(village.lostResources) : village.lostResources;
        const repairProgress = village.repairProgress instanceof Map ? Object.fromEntries(village.repairProgress) : village.repairProgress;

        if (type === 'Items') {
            return await processItemRepair(village, interaction, itemName, qty, characterName, lostResources, repairProgress);
        } else if (type === 'Tokens') {
            return await processTokenRepair(village, interaction, qty, lostResources, repairProgress);
        }
        return { success: false, message: '❌ **Invalid contribution type.**' };
    } catch (error) {
        handleError(error, 'village.js');
        console.error('[processRepair] Error:', error);
        return { success: false, message: '❌ **An error occurred while processing your repair contribution.**' };
    }
}

// ---- Function: processItemRepair ----
// Handles the repair of a village using items
async function processItemRepair(village, interaction, itemName, qty, characterName, lostResources, repairProgress) {
    if (!itemName || !characterName) {
        return { success: false, message: '❌ **Item name and character name are required for item donations.**' };
    }

    const matchedKey = Object.keys(lostResources).find(key => key.toLowerCase() === itemName.trim().toLowerCase());
    if (!matchedKey) {
        return { success: false, message: '❌ **This item is not needed for repair.**' };
    }

    const lostAmount = lostResources[matchedKey] || 0;
    const currentProgress = repairProgress[matchedKey] || 0;

    if (currentProgress + qty > lostAmount) {
        return { success: false, message: `❌ **Cannot contribute more than lost. Need ${lostAmount - currentProgress} more.**` };
    }

    // Deduct items from character
    const donatingCharacter = await fetchCharacterByName(characterName);
    if (!donatingCharacter) {
        return { success: false, message: `❌ **Character "${characterName}" not found.**` };
    }

    const removed = await removeItemInventoryDatabase(donatingCharacter._id, matchedKey, qty, interaction);
    if (!removed) {
        return { success: false, message: `❌ **Failed to remove items from ${characterName}'s inventory.**` };
    }

    // Update repair progress
    repairProgress[matchedKey] = currentProgress + qty;
    village.repairProgress.set(matchedKey, repairProgress[matchedKey]);

    // Calculate health recovery
    const maxHealth = village.levelHealth.get(village.level.toString()) || 100;
    const healthRecovery = Math.floor((qty / lostAmount) * maxHealth);
    village.health = Math.min(maxHealth, village.health + healthRecovery);

    // Check if repair is complete
    const isComplete = Object.entries(lostResources).every(([key, amount]) => (repairProgress[key] || 0) >= amount);
    if (isComplete) {
        village.status = 'upgradable';
        village.health = maxHealth;
        village.lostResources = new Map();
        village.repairProgress = new Map();
    }

    await village.save();

    // Generate embed
    const item = await ItemModel.findOne({ itemName: { $regex: `^${matchedKey}$`, $options: 'i' } });
    const emoji = item?.emoji || ':grey_question:';
    const displayName = item?.itemName || matchedKey;
    const progressBar = `\`${'▰'.repeat(Math.round(((currentProgress + qty) / lostAmount) * 10))}${'▱'.repeat(10 - Math.round(((currentProgress + qty) / lostAmount) * 10))}\``;

    const embed = new EmbedBuilder()
        .setTitle(`${village.name} (Level ${village.level})`)
        .setDescription(
            isComplete
                ? `🎉 **${characterName}** has completed the village repair!\n\n` +
                  `🌟 **The village is now fully restored!**\n` +
                  `Use </village view:1324300899585363968> to check the current status.`
                : `🎉 **${characterName}** has contributed **${displayName} x ${qty}** to repair the village!\n` +
                  `Use </village view:1324300899585363968> to check the repair status.`
        )
        .addFields(
            { name: '📦 Repair Progress', value: `${emoji} ${displayName}\n> ${progressBar} ${currentProgress + qty}/${lostAmount}`, inline: true },
            { name: '❤️ Health Recovery', value: `> +${healthRecovery} HP (${village.health}/${maxHealth})`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || '')
        .setImage(VILLAGE_IMAGES[village.name]?.main || '');

    return { success: true, embed };
}

// ---- Function: processTokenRepair ----
// Handles the repair of a village using tokens
async function processTokenRepair(village, interaction, qty, lostResources, repairProgress) {
    const userId = interaction.user.id;
    const tokenRecord = await getOrCreateToken(userId);

    if (tokenRecord.tokens < qty) {
        return { success: false, message: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}` };
    }

    const lostTokens = lostResources.tokens || 0;
    const currentProgress = repairProgress.tokens || 0;

    if (currentProgress + qty > lostTokens) {
        return { success: false, message: `❌ **Cannot contribute more than lost. Need ${lostTokens - currentProgress} more tokens.**` };
    }

    // Deduct tokens
    await updateTokenBalance(userId, -qty);

    // Update repair progress
    repairProgress.tokens = currentProgress + qty;
    village.repairProgress.set('tokens', repairProgress.tokens);

    // Calculate health recovery
    const maxHealth = village.levelHealth.get(village.level.toString()) || 100;
    const healthRecovery = Math.floor((qty / lostTokens) * maxHealth);
    village.health = Math.min(maxHealth, village.health + healthRecovery);

    // Check if repair is complete
    const isComplete = Object.entries(lostResources).every(([key, amount]) => (repairProgress[key] || 0) >= amount);
    if (isComplete) {
        village.status = 'upgradable';
        village.health = maxHealth;
        village.lostResources = new Map();
        village.repairProgress = new Map();
    }

    await village.save();

    // Generate embed
    const progressBar = `\`${'▰'.repeat(Math.round(((currentProgress + qty) / lostTokens) * 10))}${'▱'.repeat(10 - Math.round(((currentProgress + qty) / lostTokens) * 10))}\``;

    const embed = new EmbedBuilder()
        .setTitle(`${village.name} (Level ${village.level})`)
        .setDescription(
            isComplete
                ? `🎉 **${interaction.user.username}** has completed the village repair!\n\n` +
                  `🌟 **The village is now fully restored!**\n` +
                  `Use </village view:1324300899585363968> to check the current status.`
                : `🎉 **${interaction.user.username}** has contributed **Tokens x ${qty}** to repair the village!\n` +
                  `Use </village view:1324300899585363968> to check the repair status.`
        )
        .addFields(
            { name: '🪙 Token Progress', value: `> ${progressBar} ${currentProgress + qty}/${lostTokens}`, inline: true },
            { name: '❤️ Health Recovery', value: `> +${healthRecovery} HP (${village.health}/${maxHealth})`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || '')
        .setImage(VILLAGE_IMAGES[village.name]?.main || '');

    return { success: true, embed };
}

// ---- Function: generateProgressEmbed ----
// Generates an embed showing village upgrade or repair progress
async function generateProgressEmbed(village) {
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const nextLevel = village.level + 1;
    const requiredTokens = village.tokenRequirements.get(nextLevel.toString()) || 0;

    // Format materials progress
    const formattedMaterials = await formatMaterials(
        Object.fromEntries(
            Object.entries(materials).filter(([key, value]) => {
                const required = value.required?.[nextLevel];
                return required !== undefined && required > 0;
            }).map(([key, value]) => [key, value.required[nextLevel]])
        ),
        materials
    );

    // Format token progress
    const tokenBar = formatProgress(village.currentTokens || 0, requiredTokens);

    // Get top contributors
    const contributors = village.contributors instanceof Map ? Object.fromEntries(village.contributors) : village.contributors;
    const topContributors = Object.entries(contributors)
        .map(([userId, data]) => ({
            userId,
            total: (data.tokens || 0) + Object.values(data.items || {}).reduce((sum, qty) => sum + qty, 0)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

    // Format contributors list
    const contributorsList = topContributors.length > 0
        ? topContributors.map((contrib, index) => `${['🥇', '🥈', '🥉'][index]} <@${contrib.userId}>: ${contrib.total} total contributions`)
        : ['No contributions yet'];

    // Build the embed
    const embed = new EmbedBuilder()
        .setTitle(`${village.name} Progress (Level ${village.level})`)
        .addFields(
            { name: '🪙 **__Tokens Progress__**', value: `> ${tokenBar}`, inline: false },
            { name: '📦 **__Materials Progress__**', value: formattedMaterials.join('\n'), inline: false },
            { name: '👥 **__Top Contributors__**', value: contributorsList.join('\n'), inline: false }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || '')
        .setImage(VILLAGE_IMAGES[village.name]?.main || '');

    return embed;
}

// ---- Function: checkAndHandleVillageLevelUp ----
// Checks if a village can level up and handles the level up process
async function checkAndHandleVillageLevelUp(village) {
    const nextLevel = village.level + 1;
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const requiredTokens = village.tokenRequirements.get(nextLevel.toString()) || 0;
    
    // Check if all materials are met for next level
    const allMaterialsMet = Object.entries(materials).every(([key, value]) => {
        if (key.startsWith('$')) return true; // Skip special keys
        const required = value.required?.[nextLevel] || 0;
        return value.current >= required;
    });

    // Check if tokens are met for next level
    const tokensMet = village.currentTokens >= requiredTokens;

    // If both materials and tokens are met, level up the village
    if (allMaterialsMet && tokensMet) {
        village.level = nextLevel;
        village.health = village.levelHealth.get(nextLevel.toString()) || 100;
        
        // Reset current tokens and materials for the new level
        village.currentTokens = 0;
        Object.entries(materials).forEach(([key, value]) => {
            if (!key.startsWith('$')) {
                value.current = 0;
            }
        });
        
        // Update vending tier and discount
        village.vendingTier = nextLevel;
        village.vendingDiscount = nextLevel === 2 ? 10 : nextLevel === 3 ? 20 : 0;

        // Update status
        village.status = nextLevel >= 3 ? 'max' : 'upgradable';
        
        await village.save();
        return true;
    }
    
    return false;
}

// ============================================================================
// ---- Command Definition ----
// ============================================================================
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
        )
        // ------------------- Subcommand: Repair Village -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('repair')
                .setDescription('Repair a damaged village')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the village to repair')
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
                        .setDescription('Repair using Items or Tokens')
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
        )
        // ------------------- Subcommand: Progress -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('progress')
                .setDescription('View village upgrade or repair progress')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the village')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Rudania', value: 'Rudania' },
                            { name: 'Inariko', value: 'Inariko' },
                            { name: 'Vhintl', value: 'Vhintl' }
                        ))
        ),

    // ============================================================================
    // ---- Command Execution ----
    // ============================================================================
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const villageName = interaction.options.getString('name');
        const type = interaction.options.getString('type');
        const itemName = interaction.options.getString('itemname');
        const qty = interaction.options.getInteger('qty');
        const characterName = interaction.options.getString('charactername');

        try {
            console.log(`[village.js] execute: Handling subcommand "${subcommand}" for village "${villageName}"`);

            if (!villageName) {
                return interaction.reply({ content: '❌ **Village name is required.**', ephemeral: true });
            }

            // Initialize villages if they don't exist
            await initializeVillages();

            // Fetch the village details from the database
            const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
            if (!village) {
                console.warn(`[village.js] execute: Village "${villageName}" not found after initialization.`);
                return interaction.reply({ content: `❌ **Village "${villageName}" not found.**`, ephemeral: true });
            }

            // ------------------- Subcommand: View -------------------
            if (subcommand === 'view') {
                const nextLevel = village.level + 1;
                const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;

                // Get raid protection status
                const raidProtection = village.raidProtection.get(village.level.toString()) || false;
                const bloodMoonProtection = village.bloodMoonProtection.get(village.level.toString()) || false;

                // Get vending tier and discount
                const vendingTier = village.vendingTier;
                const vendingDiscount = village.vendingDiscount;

                // Format protection status
                let protectionStatus = '';
                if (bloodMoonProtection) {
                    protectionStatus = '🛡️ **Immune to all raids**';
                } else if (raidProtection) {
                    protectionStatus = '🛡️ **Protected from random raids**';
                } else {
                    protectionStatus = '⚠️ **Vulnerable to all raids**';
                }

                // Format vending status
                let vendingStatus = '';
                if (vendingTier === 3) {
                    vendingStatus = '🛍️ **Rare stock unlocked (-20% cost)**';
                } else if (vendingTier === 2) {
                    vendingStatus = '🛍️ **Mid-tier stock unlocked (-10% cost)**';
                } else {
                    vendingStatus = '🛍️ **Basic stock only**';
                }

                // Format village status
                let statusMessage = '';
                if (village.status === 'max') {
                    statusMessage = '🌟 **Max level reached**';
                } else if (village.status === 'damaged') {
                    statusMessage = '⚠️ **Damaged - Needs repair**';
                } else {
                    statusMessage = '📈 **Upgradable**';
                }

                // Get next level requirements
                const requiredTokens = village.tokenRequirements.get(nextLevel.toString()) || 0;
                const currentTokens = village.currentTokens || 0;
                const tokenProgress = formatProgress(currentTokens, requiredTokens);

                // Format materials requirements for next level
                const materialsForNextLevel = await formatMaterials(
                    Object.fromEntries(
                        Object.entries(materials).filter(([key, value]) => {
                            const required = value.required?.[nextLevel];
                            return required !== undefined && required > 0;
                        }).map(([key, value]) => [key, value.required[nextLevel]])
                    ),
                    materials
                );

                // Build the embed
                const embed = new EmbedBuilder()
                    .setTitle(`${village.name} (Level ${village.level})`)
                    .addFields(
                        { name: '🌟 **__Level__**', value: `> ${village.level}/3`, inline: true },
                        { name: '❤️ **__Health__**', value: `> ${formatProgress(village.health, village.levelHealth.get(village.level.toString()) || 100)}`, inline: false },
                        { name: '🛡️ **__Protection__**', value: `> ${protectionStatus}`, inline: false },
                        { name: '🛍️ **__Vending__**', value: `> ${vendingStatus}`, inline: false },
                        { name: '📊 **__Status__**', value: `> ${statusMessage}`, inline: false }
                    )
                    .setColor(village.color)
                    .setThumbnail(VILLAGE_IMAGES[villageName]?.thumbnail || '')
                    .setImage(VILLAGE_IMAGES[villageName]?.main || '');

                // Add next level requirements if not at max level
                if (village.level < 3) {
                    embed.addFields(
                        { name: `📈 **__Requirements for Level ${nextLevel}__**`, value: '> The following items are needed to upgrade:', inline: false },
                        { name: '🪙 **__Tokens__**', value: `> ${tokenProgress}`, inline: false },
                        { name: '📦 **__Materials__**', value: materialsForNextLevel.join('\n'), inline: false }
                    );
                }

                return interaction.reply({ embeds: [embed] });
            }

            // ------------------- Subcommand: Upgrade -------------------
            if (subcommand === 'upgrade') {
                // Check if village is at max level
                if (village.level >= 3) {
                    return interaction.reply({ content: '❌ **This village has reached maximum level.**', ephemeral: true });
                }

                // Check if village is damaged
                if (village.status === 'damaged') {
                    return interaction.reply({ content: '❌ **This village needs to be repaired before upgrading.**', ephemeral: true });
                }

                // Check cooldown
                const cooldownKey = `${interaction.user.id}_${type}_${itemName || 'tokens'}`;
                const cooldownTime = village.cooldowns.get(cooldownKey);
                if (cooldownTime && cooldownTime > new Date()) {
                    const remainingTime = Math.ceil((cooldownTime - new Date()) / 1000 / 60); // Convert to minutes
                    return interaction.reply({ content: `⏳ **Please wait ${remainingTime} minutes before contributing again.**`, ephemeral: true });
                }

                // Process upgrade contribution
                const result = await processContribution(village, interaction, type, itemName, qty, characterName);
                if (!result.success) {
                    return interaction.reply({ content: result.message, ephemeral: true });
                }

                // Set cooldown (1 hour)
                village.cooldowns.set(cooldownKey, new Date(Date.now() + COOLDOWN_DURATION));
                await village.save();

                return interaction.reply({ embeds: [result.embed], ephemeral: true });
            }

            // ------------------- Subcommand: Repair -------------------
            if (subcommand === 'repair') {
                // Check if village needs repair
                if (village.status !== 'damaged') {
                    return interaction.reply({ content: '❌ **This village does not need repair.**', ephemeral: true });
                }

                // Check cooldown
                const cooldownKey = `${interaction.user.id}_${type}_${itemName || 'tokens'}_repair`;
                const cooldownTime = village.cooldowns.get(cooldownKey);
                if (cooldownTime && cooldownTime > new Date()) {
                    const remainingTime = Math.ceil((cooldownTime - new Date()) / 1000 / 60); // Convert to minutes
                    return interaction.reply({ content: `⏳ **Please wait ${remainingTime} minutes before contributing to repair again.**`, ephemeral: true });
                }

                // Process repair contribution
                const result = await processRepair(village, interaction, type, itemName, qty, characterName);
                if (!result.success) {
                    return interaction.reply({ content: result.message, ephemeral: true });
                }

                // Set cooldown (1 hour)
                village.cooldowns.set(cooldownKey, new Date(Date.now() + COOLDOWN_DURATION));
                await village.save();

                return interaction.reply({ embeds: [result.embed], ephemeral: true });
            }

            // ------------------- Subcommand: Progress -------------------
            if (subcommand === 'progress') {
                const embed = await generateProgressEmbed(village);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

        } catch (error) {
            handleError(error, 'village.js');
            console.error(`[village.js] An error occurred while processing "${subcommand}" for village "${villageName}":`, error);
            return interaction.reply({ content: '❌ **An error occurred while processing your request.**', ephemeral: true });
        }
    },
};
