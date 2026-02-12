// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ============================================================================
// ---- Database Services ----
// ============================================================================
const { fetchCharacterByName, fetchCharacterById, getOrCreateToken, updateTokenBalance, VILLAGE_BANNERS } = require('@/database/db');

// ============================================================================
// ---- Utility Functions ----
// ============================================================================
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('@/utils/inventoryUtils');
const { recoverHearts, recoverStamina } = require('../../modules/characterStatsModule');

// ============================================================================
// ---- Database Models ----
// ============================================================================
const ItemModel = require('@/models/ItemModel');
const { Village, VILLAGE_CONFIG, DEFAULT_TOKEN_REQUIREMENTS } = require('@/models/VillageModel');
const UserModel = require('@/models/UserModel');
const { initializeVillages, updateVillageStatus } = require('../../modules/villageModule');

// ============================================================================
// ---- Constants ----
// ============================================================================
const VILLAGE_IMAGES = {
    Rudania: {
        main: 'https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_red_bottom.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_rudania_.png',
        banner: VILLAGE_BANNERS.Rudania,
    },
    Inariko: {
        main: 'https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_blue_bottom.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_inariko_.png',
        banner: VILLAGE_BANNERS.Inariko,
    },
    Vhintl: {
        main: 'https://storage.googleapis.com/tinglebot/Graphics/ROTW_border_green_bottom.png',
        thumbnail: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20village%20crest_vhintl_.png',
        banner: VILLAGE_BANNERS.Vhintl,
    },
};

const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const COOLDOWN_ENABLED = true;
const DONATION_ITEM_PERCENT = 0.10; // Max 10% of items needed per donation
const DONATION_TOKEN_PERCENT = 0.05; // Max 5% of tokens needed per donation

// Donation cooldown resets every Sunday at midnight EST (05:00 UTC)
// ------------------- Function: getCurrentDonationWeekStart -------------------
// Returns timestamp of the Sunday midnight EST (05:00 UTC) that started the current week
function getCurrentDonationWeekStart() {
    const now = new Date();
    const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0));
    if (now < rollover) {
        rollover.setUTCDate(rollover.getUTCDate() - 1);
    }
    rollover.setUTCDate(rollover.getUTCDate() - rollover.getUTCDay());
    return rollover.getTime();
}

// ------------------- Function: getNextDonationReset -------------------
// Returns Date of next Sunday midnight EST when cooldowns reset
function getNextDonationReset() {
    return new Date(getCurrentDonationWeekStart() + 7 * 24 * 60 * 60 * 1000);
}

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: getContributorItemTotal -------------------
// Safely sums contributor items (handles Mongoose Map and plain object)
function getContributorItemTotal(items) {
    if (!items) return 0;
    if (items instanceof Map) {
        return [...items.values()].reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    }
    return Object.values(items).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

// ------------------- Function: getContributorItemEntries -------------------
// Safely gets [itemName, qty] entries (handles Mongoose Map and plain object)
function getContributorItemEntries(items) {
    if (!items) return [];
    if (items instanceof Map) {
        return [...items.entries()].map(([k, v]) => [String(k), Number(v) || 0]);
    }
    return Object.entries(items).map(([k, v]) => [String(k), Number(v) || 0]);
}

// ------------------- Function: isValidContributorKey -------------------
// Filters out MongoDB path-style keys (e.g. contributors.$.items)
function isValidContributorKey(key) {
    if (typeof key !== 'string' || !key) return false;
    if (key.includes('$') || key.includes('[object Object]')) return false;
    return true;
}

// ------------------- Function: validateVillageChannel -------------------
// Validates that the command is being used in the correct town hall channel
function validateVillageChannel(villageName, interaction) {
    const testingChannelId = '1391812848099004578';
    const isTestingChannel = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;
    
    const villageChannelMap = {
        'Rudania': process.env.RUDANIA_TOWNHALL,
        'Inariko': process.env.INARIKO_TOWNHALL,
        'Vhintl': process.env.VHINTL_TOWNHALL
    };
    
    const allowedChannel = villageChannelMap[villageName];
    if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
        const channelMention = allowedChannel ? `<#${allowedChannel}>` : 'the village town hall';
        return { 
            valid: false, 
            error: `❌ **This command can only be used in ${channelMention}.**` 
        };
    }
    
    return { valid: true };
}

// ------------------- Function: formatMaterials -------------------
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

// ------------------- Function: formatProgress -------------------
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

// ------------------- Function: getTokensPerHP -------------------
// Token cost per 1 HP for village repair by level
// Level 1: 100 tokens/HP | Level 2: 150 tokens/HP | Level 3: 166 tokens/HP
function getTokensPerHP(villageLevel) {
    const tokensPerHP = { 1: 100, 2: 150, 3: 166 };
    return tokensPerHP[villageLevel] ?? 100;
}

// ------------------- Function: processContribution -------------------
// Handles the contribution of items or tokens for village upgrades
async function processContribution(village, interaction, type, itemName, qty, characterName) {
    try {
        if (type === 'Items') {
            return await processItemContribution(village, interaction, itemName, qty, characterName);
        } else if (type === 'Tokens') {
            return await processTokenContribution(village, interaction, qty, characterName);
        }
        return { success: false, message: '❌ **Invalid contribution type.**' };
    } catch (error) {
        handleInteractionError(error, 'village.js');
        console.error('[processContribution] Error:', error);
        return { success: false, message: '❌ **An error occurred while processing your contribution.**' };
    }
}

// ------------------- Function: processItemContribution -------------------
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
    const current = material.current || 0;
    // Use VILLAGE_CONFIG max as base for percentage (not database)
    const configMaterials = VILLAGE_CONFIG[village.name]?.materials || {};
    const configKey = Object.keys(configMaterials).find(k => k.toLowerCase() === matchedKey.toLowerCase());
    const requiredMax = configKey ? (configMaterials[configKey]?.required?.[nextLevel] ?? material.required?.[nextLevel] ?? 0) : (material.required?.[nextLevel] ?? 0);

    if (current + qty > requiredMax) {
        return { success: false, message: `❌ **Cannot contribute more than required. Need ${requiredMax - current} more.**` };
    }

    // Cap qty at 10% of max required per donation (always use max, not remaining)
    const maxPerDonation = Math.max(1, Math.ceil(requiredMax * DONATION_ITEM_PERCENT));
    const remainingNeeded = requiredMax - current;
    if (qty > Math.min(maxPerDonation, remainingNeeded)) {
        const allowed = Math.min(maxPerDonation, remainingNeeded);
        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ Maximum Donation Exceeded')
            .setDescription(
                `The maximum donation per contribution is **${allowed}** (10% of required).\n\n` +
                `Please donate **${allowed}** or fewer.`
            )
            .setFooter({ text: 'Item contributions are capped at 10% of required per donation' });
        return { success: false, message: `❌ **Maximum donation per contribution is ${allowed} (10% of required).**`, embed };
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
    // Mark the Map as modified so Mongoose detects the change
    village.markModified('materials');

    // Update contributor tracking
    const contributorKey = donatingCharacter._id.toString();
    const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
    contributorData.items[matchedKey] = (contributorData.items[matchedKey] || 0) + qty;
    contributorData.lastDonatedAt = new Date();
    village.contributors.set(contributorKey, contributorData);
    village.markModified('contributors');

    // Check for level up
    const leveledUp = await checkAndHandleVillageLevelUp(village, interaction?.client);
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
    const progressBar = `\`${'▰'.repeat(Math.round(((current + qty) / requiredMax) * 10))}${'▱'.repeat(10 - Math.round(((current + qty) / requiredMax) * 10))}\``;

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
            { name: '📦 Material Progress', value: `${emoji} ${displayName}\n> ${progressBar} ${current + qty}/${requiredMax}`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

    return { success: true, embed };
}

// ------------------- Function: processTokenContribution -------------------
// Handles the contribution of tokens for village upgrades
async function processTokenContribution(village, interaction, qty, characterName) {
    if (!characterName) {
        return { success: false, message: '❌ **Character name is required for token donations.**' };
    }

    // Fetch character to get character ID for tracking
    const donatingCharacter = await fetchCharacterByName(characterName);
    if (!donatingCharacter) {
        return { success: false, message: `❌ **Character "${characterName}" not found.**` };
    }

    const userId = interaction.user.id;
    const tokenRecord = await getOrCreateToken(userId);
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

    if (tokenRecord.tokens < qty) {
        return { success: false, message: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}` };
    }

    const nextLevel = village.level + 1;
    // Use VillageModel defaults as base for percentage (not database)
    const requiredTokensMax = DEFAULT_TOKEN_REQUIREMENTS[nextLevel] ?? 0;
    const currentTokens = village.currentTokens || 0;

    if (currentTokens + qty > requiredTokensMax) {
        return { success: false, message: `❌ **Cannot contribute more than required. Need ${requiredTokensMax - currentTokens} more tokens.**` };
    }

    // Cap qty at 5% of max required per donation (always use max, not remaining)
    const maxPerDonation = Math.max(1, Math.ceil(requiredTokensMax * DONATION_TOKEN_PERCENT));
    const remainingNeeded = requiredTokensMax - currentTokens;
    if (qty > Math.min(maxPerDonation, remainingNeeded)) {
        const allowed = Math.min(maxPerDonation, remainingNeeded);
        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ Maximum Donation Exceeded')
            .setDescription(
                `The maximum donation per contribution is **${allowed} tokens** (5% of required).\n\n` +
                `Please donate **${allowed}** tokens or fewer.`
            )
            .setFooter({ text: 'Token contributions are capped at 5% of required per donation' });
        return { success: false, message: `❌ **Maximum donation per contribution is ${allowed} tokens (5% of required).**`, embed };
    }

    // Deduct tokens from user balance
    const balanceBefore = tokenRecord.tokens;
    const newBalance = await updateTokenBalance(userId, -qty, {
        category: 'village',
        description: `Village contribution (${village.name}) Tokens x${qty} by ${characterName}`,
        link: interactionUrl
    });
    console.log(`[processTokenContribution] Deducted ${qty} tokens from user ${userId}. Balance: ${balanceBefore} → ${newBalance}`);

    // Update village tokens
    village.currentTokens = currentTokens + qty;

    // Update contributor tracking by CHARACTER ID (not user ID)
    const contributorKey = donatingCharacter._id.toString();
    const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
    contributorData.tokens += qty;
    contributorData.lastDonatedAt = new Date();
    village.contributors.set(contributorKey, contributorData);
    village.markModified('contributors');

    // Check for level up
    const leveledUp = await checkAndHandleVillageLevelUp(village, interaction?.client);
    if (leveledUp) {
        // Update vending tier and discount
        village.vendingTier = village.level;
        village.vendingDiscount = village.level === 2 ? 10 : village.level === 3 ? 20 : 0;
    }

    await village.save();

    // Generate embed
    const progressBar = `\`${'▰'.repeat(Math.round(((currentTokens + qty) / requiredTokensMax) * 10))}${'▱'.repeat(10 - Math.round(((currentTokens + qty) / requiredTokensMax) * 10))}\``;

    const embed = new EmbedBuilder()
        .setTitle(`${village.name} (Level ${village.level})`)
        .setDescription(
            leveledUp
                ? `🎉 **${characterName}** has contributed **Tokens x ${qty}** towards upgrading the village!\n\n` +
                  `🌟 **The village has reached level ${village.level}!**\n` +
                  `Use </village view:1324300899585363968> to check the new requirements.`
                : `🎉 **${characterName}** has contributed **Tokens x ${qty}** towards upgrading the village!\n` +
                  `Use </village view:1324300899585363968> to check the status.`
        )
        .addFields(
            { name: '🪙 Token Progress', value: `> ${progressBar} ${currentTokens + qty}/${requiredTokensMax}`, inline: true }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

    return { success: true, embed };
}

// ------------------- Function: processImprove -------------------
// Handles combined repair and upgrade contributions
async function processImprove(village, interaction, type, itemName, qty, characterName) {
    try {
        const maxHealth = village.levelHealth instanceof Map 
            ? village.levelHealth.get(village.level.toString()) 
            : village.levelHealth[village.level.toString()] || 100;
        
        const isDamaged = village.health < maxHealth;
        const canUpgrade = village.status !== 'damaged' && village.level < 3;
        
        // If village is damaged and tokens are being donated, apply to repair first
        if (isDamaged && type === 'Tokens') {
            const hpNeeded = maxHealth - village.health;
            const tokensPerHP = getTokensPerHP(village.level);

            // Cap qty at 5% of upgrade requirement only (never limit by HP/repair cost)
            const requiredTokensForCap = village.level < 3
                ? (DEFAULT_TOKEN_REQUIREMENTS[village.level + 1] ?? 0)
                : (DEFAULT_TOKEN_REQUIREMENTS[3] ?? 0);
            const maxPerDonation = Math.max(1, Math.ceil(requiredTokensForCap * DONATION_TOKEN_PERCENT));
            if (qty > maxPerDonation) {
                const embed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('❌ Maximum Donation Exceeded')
                    .setDescription(
                        `The maximum donation per contribution is **${maxPerDonation} tokens** (5% of required).\n\n` +
                        `Please donate **${maxPerDonation}** tokens or fewer.`
                    )
                    .setFooter({ text: 'Token contributions are capped at 5% of required per donation' });
                return { success: false, message: `❌ **Maximum donation per contribution is ${maxPerDonation} tokens (5% of required).**`, embed };
            }

            // Calculate how much HP can be restored
            // HP_restored = tokens_contributed / (village_level × 50)
            const hpRestored = Math.floor(qty / tokensPerHP);
            const actualHpRestored = Math.min(hpRestored, hpNeeded);
            const tokensForRepair = actualHpRestored * tokensPerHP;
            const maxTokensNeeded = hpNeeded * tokensPerHP;
            const tokensRemaining = qty - tokensForRepair;
            
            // Apply repair
            if (tokensForRepair > 0) {
                if (!characterName) {
                    return { success: false, message: '❌ **Character name is required for token donations.**' };
                }

                // Fetch character to get character ID for tracking
                const donatingCharacter = await fetchCharacterByName(characterName);
                if (!donatingCharacter) {
                    return { success: false, message: `❌ **Character "${characterName}" not found.**` };
                }

                const userId = interaction.user.id;
                const tokenRecord = await getOrCreateToken(userId);
                
                // Check if user has enough tokens for the full contribution
                if (tokenRecord.tokens < qty) {
                    return { success: false, message: `❌ **You do not have enough tokens.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}` };
                }
                
                // Deduct full amount upfront from user balance
                const balanceBefore = tokenRecord.tokens;
                const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
                const newBalance = await updateTokenBalance(userId, -qty, {
                    category: 'village',
                    description: `Village repair/upgrade (${village.name}) Tokens x${qty} by ${characterName}`,
                    link: interactionUrl
                });
                console.log(`[processImprove] Deducted ${qty} tokens from user ${userId} for repair. Balance: ${balanceBefore} → ${newBalance}`);
                village.health = Math.min(maxHealth, village.health + actualHpRestored);
                
                // Update contributor tracking by CHARACTER ID (not user ID)
                const contributorKey = donatingCharacter._id.toString();
                const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
                contributorData.tokens = (contributorData.tokens || 0) + tokensForRepair;
                contributorData.lastDonatedAt = new Date();
                village.contributors.set(contributorKey, contributorData);
                village.markModified('contributors');
                
                // Tokens used for repair also count toward upgrade total
                if (village.level < 3) {
                    const requiredForNext = DEFAULT_TOKEN_REQUIREMENTS[village.level + 1] ?? 0;
                    const currentTotal = village.currentTokens || 0;
                    village.currentTokens = Math.min(requiredForNext, currentTotal + tokensForRepair);
                }
                
                // Update status
                updateVillageStatus(village);
                
                // If repair is complete and there are remaining tokens, apply to upgrade
                const repairComplete = village.health >= maxHealth;
                const canUpgradeNow = repairComplete && village.level < 3;
                if (repairComplete && tokensRemaining > 0 && canUpgradeNow) {
                    // Apply remaining tokens to upgrade (tokens already deducted, just update village)
                    const nextLevel = village.level + 1;
                    const requiredTokens = DEFAULT_TOKEN_REQUIREMENTS[nextLevel] ?? 0;
                    const currentTokens = village.currentTokens || 0;
                    
                    if (currentTokens + tokensRemaining > requiredTokens) {
                        // Can't contribute more than needed
                        const actualTokensToAdd = requiredTokens - currentTokens;
                        village.currentTokens = requiredTokens;
                        
                        // Update contributor tracking by CHARACTER ID (not user ID)
                        const contributorKey = donatingCharacter._id.toString();
                        const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
                        contributorData.tokens = (contributorData.tokens || 0) + actualTokensToAdd;
                        contributorData.lastDonatedAt = new Date();
                        village.contributors.set(contributorKey, contributorData);
                        village.markModified('contributors');
                        
                        // Refund excess tokens
                        if (tokensRemaining > actualTokensToAdd) {
                            await updateTokenBalance(interaction.user.id, tokensRemaining - actualTokensToAdd, {
                                category: 'village',
                                description: `Village refund (${village.name}) Excess tokens`,
                                link: interactionUrl
                            });
                        }
                    } else {
                        village.currentTokens = currentTokens + tokensRemaining;
                        
                        // Update contributor tracking by CHARACTER ID (not user ID)
                        const contributorKey = donatingCharacter._id.toString();
                        const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
                        contributorData.tokens = (contributorData.tokens || 0) + tokensRemaining;
                        contributorData.lastDonatedAt = new Date();
                        village.contributors.set(contributorKey, contributorData);
                        village.markModified('contributors');
                    }
                    
                    // Check for level up
                    const leveledUp = await checkAndHandleVillageLevelUp(village, interaction?.client);
                    if (leveledUp) {
                        village.vendingTier = village.level;
                        village.vendingDiscount = village.level === 2 ? 10 : village.level === 3 ? 20 : 0;
                    }
                    
                    await village.save();
                    
                    // Generate embed
                    const tokenProgress = formatProgress(village.currentTokens, requiredTokens);
                    const embed = new EmbedBuilder()
                        .setTitle(`${village.name} (Level ${village.level})`)
                        .setDescription(
                            `🎉 **${characterName}** has contributed **${tokensForRepair} tokens** to repair and **${tokensRemaining} tokens** to upgrade the village!` +
                            (leveledUp ? `\n\n🌟 **The village has reached level ${village.level}!**` : '')
                        )
                        .addFields(
                            { name: '❤️ **Repair**', value: `> +${actualHpRestored} HP (${village.health}/${maxHealth})`, inline: true },
                            { name: '🪙 **Upgrade Progress**', value: `> ${tokenProgress}`, inline: true }
                        )
                        .setColor(village.color)
                        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
                        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);
                    
                    return { success: true, embed };
                }
                
                // If repair is complete but can't upgrade, refund remaining tokens
                if (repairComplete && tokensRemaining > 0 && !canUpgradeNow) {
                    await updateTokenBalance(interaction.user.id, tokensRemaining, {
                        category: 'village',
                        description: `Village refund (${village.name}) Max level`,
                        link: interactionUrl
                    });
                }
                
                await village.save();
                
                // Generate embed for repair only
                const hpProgress = formatProgress(village.health, maxHealth);
                const embed = new EmbedBuilder()
                    .setTitle(`${village.name} (Level ${village.level})`)
                    .setDescription(
                        repairComplete
                            ? `🎉 **${characterName}** has completed the village repair!` +
                              (tokensRemaining > 0 && canUpgradeNow 
                                  ? `\n\n💰 **${tokensRemaining} tokens** were also contributed toward upgrades!`
                                  : tokensRemaining > 0
                                  ? `\n\n💰 **${tokensRemaining} tokens** were refunded (village is at max level).`
                                  : '')
                            : `🎉 **${characterName}** has contributed **${tokensForRepair} tokens** to repair the village!`
                    )
                    .addFields(
                        { name: '❤️ **Health Recovery**', value: `> +${actualHpRestored} HP\n> ${hpProgress}`, inline: true },
                        { name: '🪙 **Tokens Used**', value: `> ${tokensForRepair} tokens`, inline: true }
                    )
                    .setColor(village.color)
                    .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
                    .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);
                
                if (!repairComplete && maxTokensNeeded - tokensForRepair > 0) {
                    embed.addFields(
                        { name: '💰 **Remaining Cost**', value: `> ${maxTokensNeeded - tokensForRepair} tokens needed to fully repair`, inline: false }
                    );
                }
                
                return { success: true, embed };
            }
        }
        
        // If village is not damaged (or after repair), apply to upgrade
        if (!isDamaged || (isDamaged && type === 'Items')) {
            if (village.status === 'damaged' && type === 'Items') {
                return { success: false, message: '❌ **This village needs to be repaired before materials can be contributed.** Please use tokens to repair first.' };
            }
            
            // Process upgrade contribution
            const result = await processContribution(village, interaction, type, itemName, qty, characterName);
            if (!result.success) {
                return result;
            }
            
            // Check for level up
            const leveledUp = await checkAndHandleVillageLevelUp(village, interaction?.client);
            if (leveledUp) {
                village.vendingTier = village.level;
                village.vendingDiscount = village.level === 2 ? 10 : village.level === 3 ? 20 : 0;
                await village.save();
                
                // Update the embed to show level up
                result.embed.setDescription(
                    result.embed.data.description?.replace(
                        /Use.*to check.*status\./,
                        `🌟 **The village has reached level ${village.level}!**\nUse </village view:1324300899585363968> to check the new requirements.`
                    ) || `🌟 **The village has reached level ${village.level}!**`
                );
            }
            
            return result;
        }
        
        return { success: false, message: '❌ **Invalid contribution type for current village state.**' };
    } catch (error) {
        handleInteractionError(error, 'village.js');
        console.error('[processImprove] Error:', error);
        return { success: false, message: '❌ **An error occurred while processing your contribution.**' };
    }
}

// ------------------- Function: processRepair -------------------
// Handles the repair of a damaged village using tokens only
async function processRepair(village, interaction, qty, characterName) {
    try {
        if (!characterName) {
            return { success: false, message: '❌ **Character name is required for token donations.**' };
        }

        // Fetch character to get character ID for tracking
        const donatingCharacter = await fetchCharacterByName(characterName);
        if (!donatingCharacter) {
            return { success: false, message: `❌ **Character "${characterName}" not found.**` };
        }

        const userId = interaction.user.id;
        const tokenRecord = await getOrCreateToken(userId);

        if (tokenRecord.tokens < qty) {
            return { success: false, message: `❌ **You do not have enough tokens to contribute.** Current Balance: ${tokenRecord.tokens}, Required: ${qty}` };
        }

        // Get max health for current level
        const maxHealth = village.levelHealth instanceof Map 
            ? village.levelHealth.get(village.level.toString()) 
            : village.levelHealth[village.level.toString()] || 100;
        
        // Calculate HP needed
        const hpNeeded = maxHealth - village.health;

        if (hpNeeded <= 0) {
            return { success: false, message: '❌ **This village is already at full health.**' };
        }

        // Cap qty at 5% of upgrade requirement only (never limit by HP/repair cost)
        const requiredTokensForCap = village.level < 3
            ? (DEFAULT_TOKEN_REQUIREMENTS[village.level + 1] ?? 0)
            : (DEFAULT_TOKEN_REQUIREMENTS[3] ?? 0);
        const maxPerDonation = Math.max(1, Math.ceil(requiredTokensForCap * DONATION_TOKEN_PERCENT));
        if (qty > maxPerDonation) {
            const embed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('❌ Maximum Donation Exceeded')
                .setDescription(
                    `The maximum donation per contribution is **${maxPerDonation} tokens** (5% of required).\n\n` +
                    `Please donate **${maxPerDonation}** tokens or fewer.`
                )
                .setFooter({ text: 'Token contributions are capped at 5% of required per donation' });
            return { success: false, message: `❌ **Maximum donation per contribution is ${maxPerDonation} tokens (5% of required).**`, embed };
        }

        const tokensPerHP = getTokensPerHP(village.level);

        // Calculate HP that can be restored with the tokens provided
        // HP_restored = tokens_contributed / (village_level × 50)
        const hpRestored = Math.floor(qty / tokensPerHP);
        
        if (hpRestored <= 0) {
            return { success: false, message: `❌ **Insufficient tokens. You need at least ${tokensPerHP} tokens to restore 1 HP at level ${village.level}.**` };
        }

        // Cap HP restoration to what's needed
        const actualHpRestored = Math.min(hpRestored, hpNeeded);
        const actualTokensUsed = actualHpRestored * tokensPerHP;

        // Deduct tokens
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        await updateTokenBalance(userId, -actualTokensUsed, {
            category: 'village',
            description: `Village repair (${village.name}) Tokens x${actualTokensUsed} by ${characterName}`,
            link: interactionUrl
        });

        // Update village HP
        village.health = Math.min(maxHealth, village.health + actualHpRestored);

        // Update contributor tracking by CHARACTER ID (not user ID)
        const contributorKey = donatingCharacter._id.toString();
        const contributorData = village.contributors.get(contributorKey) || { items: {}, tokens: 0 };
        contributorData.tokens = (contributorData.tokens || 0) + actualTokensUsed;
        contributorData.lastDonatedAt = new Date();
        village.contributors.set(contributorKey, contributorData);
        village.markModified('contributors');

        // Check if repair is complete (HP at 100%)
        const isComplete = village.health >= maxHealth;
        // Update status (will be 'upgradable' if HP is full, 'damaged' if not)
        updateVillageStatus(village);

        await village.save();

        // Generate embed
        const hpProgress = formatProgress(village.health, maxHealth);
        const maxTokensNeeded = hpNeeded * tokensPerHP;
        const tokensRemaining = maxTokensNeeded - actualTokensUsed;

        // Use character name for display
        const displayName = characterName;

        const embed = new EmbedBuilder()
            .setTitle(`${village.name} (Level ${village.level})`)
            .setDescription(
                isComplete
                    ? `🎉 **${displayName}** has completed the village repair!\n\n` +
                      `🌟 **The village is now fully restored!**\n` +
                      `Use </village view:1324300899585363968> to check the current status.`
                    : `🎉 **${displayName}** has contributed **${actualTokensUsed} tokens** to repair the village!\n` +
                      `Use </village view:1324300899585363968> to check the repair status.`
            )
            .addFields(
                { name: '❤️ **Health Recovery**', value: `> +${actualHpRestored} HP\n> ${hpProgress}`, inline: true },
                { name: '🪙 **Tokens Used**', value: `> ${actualTokensUsed} tokens`, inline: true }
            )
            .setColor(village.color)
            .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
            .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

        if (!isComplete && tokensRemaining > 0) {
            embed.addFields(
                { name: '💰 **Remaining Cost**', value: `> ${tokensRemaining} tokens needed to fully repair`, inline: false }
            );
        }

        return { success: true, embed };
    } catch (error) {
        handleInteractionError(error, 'village.js');
        console.error('[processRepair] Error:', error);
        return { success: false, message: '❌ **An error occurred while processing your repair contribution.**' };
    }
}

// ------------------- Function: generateProgressEmbed -------------------
// Generates an embed showing village upgrade or repair progress
async function generateProgressEmbed(village) {
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    const nextLevel = village.level + 1;
    
    // Get token requirements (cumulative)
    const requiredTokens = village.tokenRequirements instanceof Map 
        ? village.tokenRequirements.get(nextLevel.toString()) 
        : village.tokenRequirements[nextLevel.toString()] || 0;

    // Format materials progress (cumulative system)
    // Show all materials that have requirements for the next level
    const materialsForNextLevel = Object.entries(materials)
        .filter(([key, value]) => {
            if (key.startsWith('$')) return false; // Skip special keys
            const required = value.required?.[nextLevel];
            return required !== undefined && required > 0;
        })
        .map(([key, value]) => {
            const required = value.required[nextLevel]; // Cumulative requirement for next level
            const current = value.current || 0; // Current cumulative amount
            return { key, required, current };
        })
        .sort((a, b) => b.required - a.required); // Sort by requirement amount (descending)

    // Format materials for display
    const formattedMaterials = [];
    for (const { key, required, current } of materialsForNextLevel) {
        const item = await ItemModel.findOne({ itemName: { $regex: `^${key}$`, $options: 'i' } });
        const emoji = item?.emoji || ':grey_question:';
        const displayName = item?.itemName || key;
        const progressBar = `\`${'▰'.repeat(Math.round((current / required) * 10))}${'▱'.repeat(10 - Math.round((current / required) * 10))}\``;
        formattedMaterials.push(`${emoji} **${displayName}**\n> ${progressBar} ${current}/${required}`);
    }

    // Format token progress
    const tokenBar = formatProgress(village.currentTokens || 0, requiredTokens);

    // Get top contributors (by CHARACTER ID now, not user ID)
    const contributors = village.contributors instanceof Map ? Object.fromEntries(village.contributors) : village.contributors;
    const topContributors = await Promise.all(
        Object.entries(contributors || {})
            .filter(([characterId]) => isValidContributorKey(characterId))
            .map(async ([characterId, data]) => {
                const tokens = Number(data?.tokens) || 0;
                const itemTotal = getContributorItemTotal(data?.items);
                const total = tokens + itemTotal;
                // Fetch character to get name
                const character = await fetchCharacterById(characterId);
                const characterName = character ? character.name : `Character ${characterId.substring(0, 8)}...`;
                return {
                    characterId,
                    characterName,
                    total: Number(total)
                };
            })
    );
    
    // Sort by total and take top 3
    topContributors.sort((a, b) => b.total - a.total);
    const top3 = topContributors.slice(0, 3);

    // Format contributors list
    const contributorsList = top3.length > 0
        ? top3.map((contrib, index) => `${['🥇', '🥈', '🥉'][index]} **${contrib.characterName}**: ${contrib.total} total contributions`)
        : ['No contributions yet'];

    // Build the embed
    const embed = new EmbedBuilder()
        .setTitle(`${village.name} Progress (Level ${village.level})`)
        .setDescription(village.level < 3 
            ? `📈 **Progress toward Level ${nextLevel}**\n*Materials are cumulative - contributions carry forward to the next level.*`
            : `🌟 **Village is at maximum level!**`)
        .addFields(
            { name: '🪙 **__Tokens Progress__**', value: `> ${tokenBar}`, inline: false }
        )
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

    // Add materials field only if not at max level
    if (village.level < 3 && formattedMaterials.length > 0) {
        embed.addFields(
            { name: '📦 **__Materials Progress__**', value: formattedMaterials.join('\n'), inline: false }
        );
    }

    // Add contributors field
    embed.addFields(
        { name: '👥 **__Top Contributors__**', value: contributorsList.join('\n'), inline: false }
    );

    return embed;
}

// ------------------- Function: generateContributorsEmbed -------------------
// Generates an embed showing all contributors to a village with their detailed contributions
async function generateContributorsEmbed(village) {
    // Get all contributors (by CHARACTER ID)
    const contributors = village.contributors instanceof Map ? Object.fromEntries(village.contributors) : village.contributors;
    
    if (!contributors || Object.keys(contributors).length === 0) {
        const embed = new EmbedBuilder()
            .setTitle(`${village.name} Contributors`)
            .setDescription('📭 **No contributions yet.**\nBe the first to contribute to this village!')
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);
        return embed;
    }

    // Process all contributors
    const contributorList = await Promise.all(
        Object.entries(contributors || {})
            .filter(([characterId]) => isValidContributorKey(characterId))
            .map(async ([characterId, data]) => {
                const character = await fetchCharacterById(characterId);
                const characterName = character ? character.name : `Character ${characterId.substring(0, 8)}...`;
                
                const tokens = Number(data?.tokens) || 0;
                const itemEntries = getContributorItemEntries(data?.items);
                const itemContributions = itemEntries
                    .filter(([_, qty]) => qty > 0)
                    .map(([itemName, qty]) => ({ itemName, qty }));
                
                const totalItems = getContributorItemTotal(data?.items);
                const totalContributions = tokens + totalItems;
                const lastDonatedAt = data.lastDonatedAt ? new Date(data.lastDonatedAt) : null;
                
                return {
                    characterName,
                    tokens,
                    itemContributions,
                    totalItems,
                    totalContributions,
                    lastDonatedAt
                };
            })
    );
    
    // Sort by total contributions (descending)
    contributorList.sort((a, b) => b.totalContributions - a.totalContributions);
    
    // Build contributor details
    const contributorDetails = [];
    for (let i = 0; i < contributorList.length; i++) {
        const contrib = contributorList[i];
        const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
        
        let details = `${rankEmoji} **${contrib.characterName}**\n`;
        details += `   Total: ${contrib.totalContributions} contributions\n`;
        if (contrib.lastDonatedAt) {
            details += `   📅 Last donated: ${contrib.lastDonatedAt.toLocaleDateString('en-US', { dateStyle: 'medium' })}\n`;
        }
        if (contrib.tokens > 0) {
            details += `   🪙 Tokens: ${contrib.tokens.toLocaleString()}\n`;
        }
        
        if (contrib.itemContributions.length > 0) {
            // Get item emojis and format item contributions
            const itemDetails = await Promise.all(
                contrib.itemContributions.map(async ({ itemName, qty }) => {
                    const item = await ItemModel.findOne({ itemName: { $regex: `^${itemName}$`, $options: 'i' } });
                    const emoji = item?.emoji || '📦';
                    return `${emoji} ${itemName}: ${qty}`;
                })
            );
            
            // Limit item display to avoid embed field length issues
            const maxItems = 5;
            if (contrib.itemContributions.length > maxItems) {
                const shown = itemDetails.slice(0, maxItems).join(', ');
                const remaining = contrib.itemContributions.length - maxItems;
                details += `   📦 Items: ${shown} (+${remaining} more)\n`;
            } else {
                details += `   📦 Items: ${itemDetails.join(', ')}\n`;
            }
        }
        
        contributorDetails.push(details);
    }
    
    // Split into multiple fields if needed (Discord field value limit is 1024 characters)
    const fields = [];
    let currentField = '';
    
    for (const detail of contributorDetails) {
        if (currentField.length + detail.length > 1000) {
            fields.push({ name: '👥 **Contributors**', value: currentField.trim(), inline: false });
            currentField = detail;
        } else {
            currentField += (currentField ? '\n\n' : '') + detail;
        }
    }
    
    if (currentField) {
        fields.push({ name: '👥 **Contributors**', value: currentField.trim(), inline: false });
    }
    
    // Build the embed
    const embed = new EmbedBuilder()
        .setTitle(`${village.name} Contributors`)
        .setDescription(`📊 **Total Contributors:** ${contributorList.length}\n\nView all contributions to ${village.name}!`)
        .setColor(village.color)
        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);
    
    // Add all fields
    for (const field of fields) {
        embed.addFields(field);
    }
    
    return embed;
}

// ------------------- Function: sendLevelUpAnnouncement -------------------
// Sends an announcement embed to the town hall channel when a village levels up
async function sendLevelUpAnnouncement(village, client) {
    if (!client) {
        console.log('[sendLevelUpAnnouncement] No client provided, skipping announcement');
        return;
    }

    try {
        const villageChannelMap = {
            'Rudania': process.env.RUDANIA_TOWNHALL,
            'Inariko': process.env.INARIKO_TOWNHALL,
            'Vhintl': process.env.VHINTL_TOWNHALL
        };
        const targetChannelId = villageChannelMap[village.name] || null;
        if (!targetChannelId) {
            console.log(`[sendLevelUpAnnouncement] No town hall channel configured for ${village.name}, skipping announcement`);
            return;
        }
        const announcementChannel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (!announcementChannel) {
            console.error(`[sendLevelUpAnnouncement] Could not find channel ${targetChannelId} for level-up announcement`);
            return;
        }

        // Get max health for the new level
        const maxHealth = village.levelHealth instanceof Map 
            ? village.levelHealth.get(village.level.toString()) 
            : village.levelHealth[village.level.toString()] || 100;

        // Format vending status based on new level
        let vendingStatus = '';
        if (village.level === 3) {
            vendingStatus = '🛍️ **Rare stock unlocked (-20% cost)**';
        } else if (village.level === 2) {
            vendingStatus = '🛍️ **Mid-tier stock unlocked (-10% cost)**';
        } else {
            vendingStatus = '🛍️ **Basic stock only**';
        }

        // Create announcement embed
        const announcementEmbed = new EmbedBuilder()
            .setTitle(`🌟 ${village.name} is now Level ${village.level}!`)
            .setDescription(
                `🎉 **Congratulations!** The village has successfully upgraded!\n\n` +
                `**New Level:** ${village.level}/3\n` +
                `**Health:** ${village.health}/${maxHealth} HP\n` +
                `${vendingStatus}\n\n` +
                `Use </village view:1324300899585363968> to check the new requirements.`
            )
            .setColor(village.color)
            .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
            .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE)
            .setTimestamp();

        await announcementChannel.send({ embeds: [announcementEmbed] });
        console.log(`[sendLevelUpAnnouncement] ✅ Posted level-up announcement to channel ${targetChannelId} for ${village.name}`);
    } catch (error) {
        console.error('[sendLevelUpAnnouncement] Error posting level-up announcement:', error);
        // Don't fail the level-up process if announcement fails
    }
}

// ------------------- Function: checkAndHandleVillageLevelUp -------------------
// Checks if a village can level up and handles the level up process
// Exported for use in mod.js and other modules
// client: Optional Discord client for sending announcements
async function checkAndHandleVillageLevelUp(village, client = null) {
    // Don't check if already at max level
    if (village.level >= 3) {
        console.log(`[checkAndHandleVillageLevelUp] Village ${village.name} is already at max level ${village.level}, skipping check`);
        return false;
    }
    
    const nextLevel = village.level + 1;
    const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;
    // Use VillageModel defaults (not database)
    const requiredTokens = DEFAULT_TOKEN_REQUIREMENTS[nextLevel] ?? 0;

    console.log(`[checkAndHandleVillageLevelUp] Checking ${village.name} (Level ${village.level}) for level up to ${nextLevel}`);
    console.log(`[checkAndHandleVillageLevelUp] Required tokens: ${requiredTokens}, Current tokens: ${village.currentTokens || 0}`);
    
    // Check if all materials are met for next level (use VILLAGE_CONFIG for required amounts)
    const configMaterials = VILLAGE_CONFIG[village.name]?.materials || {};
    const materialChecks = [];
    const materialsWithRequirements = Object.entries(configMaterials).filter(([key]) => {
        const required = configMaterials[key]?.required?.[nextLevel] || 0;
        return required > 0;
    });

    const allMaterialsMet = materialsWithRequirements.length === 0 || materialsWithRequirements.every(([key]) => {
        const required = configMaterials[key]?.required?.[nextLevel] || 0;
        const current = (materials[key]?.current ?? 0);
        const met = current >= required;
        materialChecks.push({ key, required, current, met });
        return met;
    });
    
    console.log(`[checkAndHandleVillageLevelUp] Materials with requirements for level ${nextLevel}: ${materialsWithRequirements.length}`);
    if (materialChecks.length > 0) {
        console.log(`[checkAndHandleVillageLevelUp] Materials check:`, materialChecks.map(m => `${m.key}: ${m.current}/${m.required} (${m.met ? '✓' : '✗'})`).join(', '));
    }
    console.log(`[checkAndHandleVillageLevelUp] All materials met: ${allMaterialsMet}`);

    // Check if tokens are met for next level
    const tokensMet = (village.currentTokens || 0) >= requiredTokens;
    console.log(`[checkAndHandleVillageLevelUp] Tokens met: ${tokensMet} (${village.currentTokens || 0}/${requiredTokens})`);

    // If both materials and tokens are met, level up the village
    if (allMaterialsMet && tokensMet) {
        console.log(`[checkAndHandleVillageLevelUp] ✅ All requirements met! Leveling up ${village.name} from ${village.level} to ${nextLevel}`);
        
        village.level = nextLevel;
        
        // Set HP to full max for the new level
        const newMaxHealth = village.levelHealth instanceof Map 
            ? village.levelHealth.get(nextLevel.toString()) 
            : village.levelHealth[nextLevel.toString()] || 100;
        village.health = newMaxHealth;
        
        console.log(`[checkAndHandleVillageLevelUp] Set HP to ${newMaxHealth} for level ${nextLevel}`);
        
        // Reset current tokens only (materials carry forward in cumulative system)
        village.currentTokens = 0;
        console.log(`[checkAndHandleVillageLevelUp] Reset tokens to 0 (materials persist)`);
        
        // Update materials Map (materials persist, don't reset)
        for (const [key, value] of Object.entries(materials)) {
            if (!key.startsWith('$')) {
                village.materials.set(key, value);
            }
        }
        
        // Update vending tier and discount
        village.vendingTier = nextLevel;
        village.vendingDiscount = nextLevel === 2 ? 10 : nextLevel === 3 ? 20 : 0;
        console.log(`[checkAndHandleVillageLevelUp] Updated vending tier to ${nextLevel}, discount to ${village.vendingDiscount}%`);

        // Update status using helper function
        updateVillageStatus(village);
        
        await village.save();
        console.log(`[checkAndHandleVillageLevelUp] ✅ Successfully leveled up ${village.name} to level ${nextLevel}!`);
        
        // Send announcement to town hall channel
        await sendLevelUpAnnouncement(village, client);
        
        return true;
    }
    
    console.log(`[checkAndHandleVillageLevelUp] ❌ Requirements not met - materials: ${allMaterialsMet}, tokens: ${tokensMet}`);
    return false;
}

// ============================================================================
// ---- Rest Spot Helper Functions ----
// ============================================================================

// ------------------- Function: getRestSpotCooldownKey -------------------
// Returns the dailyRoll Map key for a village's rest spot cooldown
function getRestSpotCooldownKey(villageName) {
    return `restSpot_${villageName}`;
}

// ------------------- Function: canUseRestSpot -------------------
// Checks if a character can use the rest spot (cooldown check)
// Returns { canUse: boolean, reason?: string }
function canUseRestSpot(character, villageName) {
    const now = new Date();
    // Compute the most recent 13:00 UTC (8am EST) rollover
    const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));
    if (now < rollover) {
        // If before today's 13:00 UTC, use yesterday's 13:00 UTC
        rollover.setUTCDate(rollover.getUTCDate() - 1);
    }

    const cooldownKey = getRestSpotCooldownKey(villageName);
    const lastUse = character.dailyRoll?.get(cooldownKey);

    if (!lastUse) {
        return { canUse: true };
    }

    const lastUseDate = new Date(lastUse);
    if (lastUseDate >= rollover) {
        // Calculate time until next reset
        const nextReset = new Date(rollover);
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
        const hoursUntilReset = Math.ceil((nextReset - now) / (1000 * 60 * 60));
        return { 
            canUse: false, 
            reason: `You've already used the rest spot today. Cooldown resets in ${hoursUntilReset} hour(s) at 8am EST.` 
        };
    }

    return { canUse: true };
}

// ------------------- Function: updateRestSpotCooldown -------------------
// Updates the rest spot cooldown for a character
async function updateRestSpotCooldown(character, villageName) {
    try {
        if (!character.dailyRoll) {
            character.dailyRoll = new Map();
        }
        const cooldownKey = getRestSpotCooldownKey(villageName);
        character.dailyRoll.set(cooldownKey, new Date().toISOString());
        character.markModified('dailyRoll'); // Required for Mongoose to track Map changes
        await character.save();
    } catch (error) {
        console.error(`[updateRestSpotCooldown] Error updating cooldown for ${character.name} in ${villageName}:`, error);
        throw error;
    }
}

// ------------------- Function: validateRestSpotRequirements -------------------
// Validates all requirements for using a rest spot
// Returns { valid: boolean, error?: string }
async function validateRestSpotRequirements(character, village, interaction) {
    // Check if character is KO'd
    if (character.ko) {
        return { valid: false, error: '❌ **You cannot use the rest spot while KO\'d. You need a Healer to revive you first.**' };
    }

    // Check if character is in the correct village
    const characterVillage = character.currentVillage?.toLowerCase()?.trim();
    const targetVillage = village.name.toLowerCase().trim();
    if (characterVillage !== targetVillage) {
        return { 
            valid: false, 
            error: `❌ **You must be physically located in ${village.name} to use its rest spot. Current location: ${character.currentVillage || 'Unknown'}.**` 
        };
    }

    // Check if command is used in the correct channel
    const testingChannelId = '1391812848099004578';
    const isTestingChannel = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;
    
    const villageChannelMap = {
        'Rudania': process.env.RUDANIA_TOWNHALL,
        'Inariko': process.env.INARIKO_TOWNHALL,
        'Vhintl': process.env.VHINTL_TOWNHALL
    };
    
    const allowedChannel = villageChannelMap[village.name];
    if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
        const channelMention = allowedChannel ? `<#${allowedChannel}>` : 'the village town hall';
        return { 
            valid: false, 
            error: `❌ **This command can only be used in ${channelMention}.**` 
        };
    }

    // Check village level
    if (village.level < 2) {
        return { 
            valid: false, 
            error: `❌ **Rest spots are only available in Level 2+ villages. ${village.name} is currently Level ${village.level}.**` 
        };
    }

    // Check if character is at full health/stamina
    if (village.level === 2) {
        if (character.currentHearts >= character.maxHearts) {
            return { 
                valid: false, 
                error: `❌ **You are already at full hearts (${character.currentHearts}/${character.maxHearts}). The rest spot cannot restore more.**` 
            };
        }
    } else if (village.level === 3) {
        if (character.currentHearts >= character.maxHearts && character.currentStamina >= character.maxStamina) {
            return { 
                valid: false, 
                error: `❌ **You are already at full hearts and stamina. The rest spot cannot restore more.**` 
            };
        }
    }

    // Check cooldown
    const cooldownCheck = canUseRestSpot(character, village.name);
    if (!cooldownCheck.canUse) {
        return { valid: false, error: `❌ **${cooldownCheck.reason}**` };
    }

    return { valid: true };
}

// ------------------- Function: getRestSpotTheme -------------------
// Returns themed information for each village's rest spot
function getRestSpotTheme(villageName) {
    const themes = {
        'Rudania': {
            emoji: '🔥',
            name: 'Hot Springs',
            description: 'natural geothermal pools',
            color: '#FF6B6B'
        },
        'Inariko': {
            emoji: '💧',
            name: 'Cleansing Pool',
            description: 'purifying water source',
            color: '#4ECDC4'
        },
        'Vhintl': {
            emoji: '🍃',
            name: 'Sacred Grove',
            description: 'restorative forest clearing',
            color: '#95E1D3'
        }
    };
    return themes[villageName] || themes['Rudania'];
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
        // ------------------- Subcommand: Donate -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('donate')
                .setDescription('Repair with tokens or contribute materials/tokens for upgrades (auto-upgrades when ready)')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Name of the character donating (required for both Items and Tokens)')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the village to donate to')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Rudania', value: 'Rudania' },
                            { name: 'Inariko', value: 'Inariko' },
                            { name: 'Vhintl', value: 'Vhintl' }
                        ))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Contribute using Items or Tokens')
                        .setRequired(true)
                        .setAutocomplete(true))
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
        // ------------------- Subcommand: Contributors -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('contributors')
                .setDescription('View all contributors to a village')
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
        // ------------------- Subcommand: Rest -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('rest')
                .setDescription('Use the village rest spot to restore hearts or stamina')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Name of the character using the rest spot')
                        .setRequired(true)
                        .setAutocomplete(true))
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
                // Validate channel
                const channelCheck = validateVillageChannel(villageName, interaction);
                if (!channelCheck.valid) {
                    return interaction.reply({ 
                        content: channelCheck.error, 
                        ephemeral: true 
                    });
                }
                
                // Check for auto-level up when viewing (requirements might already be met)
                // This ensures villages auto-level even if requirements were met before viewing
                let villageToDisplay = village;
                if (village.level < 3) {
                    const leveledUp = await checkAndHandleVillageLevelUp(village, interaction?.client);
                    if (leveledUp) {
                        // Reload village to get updated state after level up
                        const updatedVillage = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
                        if (updatedVillage) {
                            villageToDisplay = updatedVillage;
                        }
                    }
                }
                
                const nextLevel = villageToDisplay.level + 1;
                const materials = villageToDisplay.materials instanceof Map ? Object.fromEntries(villageToDisplay.materials) : villageToDisplay.materials;

                // Get vending tier and discount
                const vendingTier = villageToDisplay.vendingTier;
                const vendingDiscount = villageToDisplay.vendingDiscount;

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
                if (villageToDisplay.status === 'max') {
                    statusMessage = '🌟 **Max level reached**';
                } else if (villageToDisplay.status === 'damaged') {
                    statusMessage = '⚠️ **Damaged - Needs repair**';
                } else {
                    statusMessage = '📈 **Upgradable**';
                }

                // Get next level requirements (cumulative system)
                const requiredTokens = villageToDisplay.tokenRequirements instanceof Map 
                    ? villageToDisplay.tokenRequirements.get(nextLevel.toString()) 
                    : villageToDisplay.tokenRequirements[nextLevel.toString()] || 0;
                
                // Log token data for debugging
                const rawCurrentTokens = villageToDisplay.currentTokens;
                console.log(`[village.js] /village view: Village "${villageToDisplay.name}"`);
                console.log(`[village.js]   - Level: ${villageToDisplay.level}`);
                console.log(`[village.js]   - raw currentTokens (from DB):`, rawCurrentTokens);
                console.log(`[village.js]   - typeof rawCurrentTokens:`, typeof rawCurrentTokens);
                console.log(`[village.js]   - requiredTokens for level ${nextLevel}:`, requiredTokens);
                
                const currentTokens = (rawCurrentTokens !== undefined && rawCurrentTokens !== null) 
                    ? Number(rawCurrentTokens) 
                    : 0;
                console.log(`[village.js]   - processed currentTokens:`, currentTokens);
                
                const tokenProgress = formatProgress(currentTokens, requiredTokens);
                const tokensRemaining = Math.max(0, requiredTokens - currentTokens);
                console.log(`[village.js]   - tokenProgress string: "${tokenProgress}"`);
                console.log(`[village.js]   - tokensRemaining:`, tokensRemaining);

                // Format materials requirements for next level (cumulative system)
                // Show all materials that have requirements for the next level
                const materialsForNextLevel = [];
                const materialsList = Object.entries(materials)
                    .filter(([key, value]) => {
                        if (key.startsWith('$')) return false; // Skip special keys
                        const required = value.required?.[nextLevel];
                        return required !== undefined && required > 0;
                    })
                    .map(([key, value]) => {
                        const required = value.required[nextLevel]; // Cumulative requirement for next level
                        const current = value.current || 0; // Current cumulative amount
                        return { key, required, current };
                    })
                    .sort((a, b) => b.required - a.required); // Sort by requirement amount (descending)

                // Format each material for display
                // Show ALL materials required for next level, even if already complete
                // This is important because level-up requires ALL materials AND tokens to be met
                for (const { key, required, current } of materialsList) {
                    const remaining = Math.max(0, required - current);
                    
                    const item = await ItemModel.findOne({ itemName: { $regex: `^${key}$`, $options: 'i' } });
                    const emoji = item?.emoji || ':grey_question:';
                    const displayName = item?.itemName || key;
                    // Calculate progress bar (clamp to 0-10 to handle over-contributed materials)
                    const filledBars = Math.min(10, Math.max(0, Math.round((current / required) * 10)));
                    const emptyBars = Math.max(0, 10 - filledBars);
                    const progressBar = `\`${'▰'.repeat(filledBars)}${'▱'.repeat(emptyBars)}\``;
                    materialsForNextLevel.push(`${emoji} **${displayName}**\n> ${progressBar} ${current}/${required} (${remaining} needed for level ${nextLevel})`);
                }

                // Get top contributors (by CHARACTER ID now, not user ID)
                const contributors = villageToDisplay.contributors instanceof Map ? Object.fromEntries(villageToDisplay.contributors) : villageToDisplay.contributors;
                const topContributors = await Promise.all(
                    Object.entries(contributors || {})
                        .filter(([characterId]) => isValidContributorKey(characterId))
                        .map(async ([characterId, data]) => {
                            const tokens = Number(data?.tokens) || 0;
                            const itemTotal = getContributorItemTotal(data?.items);
                            const total = tokens + itemTotal;
                            // Fetch character to get name
                            const character = await fetchCharacterById(characterId);
                            const characterName = character ? character.name : `Character ${characterId.substring(0, 8)}...`;
                            return {
                                characterId,
                                characterName,
                                total: Number(total)
                            };
                        })
                );
                
                // Sort by total and take top 3
                topContributors.sort((a, b) => b.total - a.total);
                const top3 = topContributors.slice(0, 3);

                // Format contributors list
                const contributorsList = top3.length > 0
                    ? top3.map((contrib, index) => `${['🥇', '🥈', '🥉'][index]} **${contrib.characterName}**: ${contrib.total} total contributions`)
                    : ['No contributions yet'];

                // Build the embed
                const embed = new EmbedBuilder()
                    .setTitle(`${villageToDisplay.name} (Level ${villageToDisplay.level})${villageToDisplay.level > village.level ? ' ⭐ LEVELED UP!' : ''}`)
                    .setDescription(villageToDisplay.level < 3 
                        ? `📈 **Progress toward Level ${nextLevel}**\n*Materials are cumulative - contributions carry forward to the next level.*`
                        : `🌟 **Village is at maximum level!**`)
                    .addFields(
                        { name: '🌟 **__Level__**', value: `> ${villageToDisplay.level}/3`, inline: true },
                        { name: '❤️ **__Health__**', value: `> ${formatProgress(villageToDisplay.health, villageToDisplay.levelHealth.get(villageToDisplay.level.toString()) || 100)}`, inline: false },
                        { name: '🛍️ **__Vending__**', value: `> ${vendingStatus}`, inline: false },
                        { name: '📊 **__Status__**', value: `> ${statusMessage}`, inline: false }
                    )
                    .setColor(villageToDisplay.color)
                    .setThumbnail(VILLAGE_IMAGES[villageName]?.thumbnail || BORDER_IMAGE)
                    .setImage(VILLAGE_IMAGES[villageName]?.banner || BORDER_IMAGE);

                // Add next level requirements if not at max level
                if (villageToDisplay.level < 3) {
                    embed.addFields(
                        { name: '🪙 **__Tokens Progress__**', value: `> ${tokenProgress} (${tokensRemaining.toLocaleString()} needed for level ${nextLevel})`, inline: false }
                    );
                    
                    // Add materials field only if there are materials to show
                    // Split into multiple fields if content exceeds Discord's 1024 character limit
                    if (materialsForNextLevel.length > 0) {
                        const MAX_FIELD_VALUE_LENGTH = 1024;
                        const materialFields = [];
                        let currentChunk = [];
                        let currentLength = 0;

                        for (const material of materialsForNextLevel) {
                            const materialLength = material.length + 1; // +1 for newline
                            
                            // If adding this material would exceed the limit, start a new chunk
                            if (currentLength + materialLength > MAX_FIELD_VALUE_LENGTH && currentChunk.length > 0) {
                                materialFields.push(currentChunk.join('\n'));
                                currentChunk = [];
                                currentLength = 0;
                            }
                            
                            currentChunk.push(material);
                            currentLength += materialLength;
                        }
                        
                        // Add the last chunk if it has content
                        if (currentChunk.length > 0) {
                            materialFields.push(currentChunk.join('\n'));
                        }

                        // Add fields to embed (with numbered names if multiple fields)
                        materialFields.forEach((fieldValue, index) => {
                            const fieldName = materialFields.length > 1
                                ? `📦 **__Materials Progress (${index + 1}/${materialFields.length})__**`
                                : '📦 **__Materials Progress__**';
                            embed.addFields({ name: fieldName, value: fieldValue, inline: false });
                        });
                    }
                }

                // Add contributors field
                embed.addFields(
                    { name: '👥 **__Top Contributors__**', value: contributorsList.join('\n'), inline: false }
                );

                return interaction.reply({ embeds: [embed] });
            }

            // ------------------- Subcommand: Donate -------------------
            if (subcommand === 'donate') {
                // Validate channel
                const channelCheck = validateVillageChannel(villageName, interaction);
                if (!channelCheck.valid) {
                    return interaction.reply({ 
                        content: channelCheck.error, 
                        ephemeral: true 
                    });
                }
                
                // Check if village is at max level
                if (village.level >= 3 && village.status === 'max') {
                    const maxHealth = village.levelHealth instanceof Map 
                        ? village.levelHealth.get(village.level.toString()) 
                        : village.levelHealth[village.level.toString()] || 100;
                    
                    // Still allow repair if damaged
                    if (village.health < maxHealth && type === 'Tokens') {
                        // Allow repair even at max level
                    } else {
                        return interaction.reply({ content: '❌ **This village has reached maximum level and is fully repaired.**', ephemeral: true });
                    }
                }

                // Validate required fields based on type
                if (type === 'Items') {
                    if (!characterName || !itemName) {
                        return interaction.reply({ content: '❌ **Character name and item name are required when contributing items.**', ephemeral: true });
                    }
                } else if (type === 'Tokens') {
                    if (!characterName) {
                        return interaction.reply({ content: '❌ **Character name is required when contributing tokens.**', ephemeral: true });
                    }
                }

                // Validate that character's HOME village matches the target village
                if (characterName) {
                    const donatingCharacter = await fetchCharacterByName(characterName);
                    if (!donatingCharacter) {
                        return interaction.reply({ content: `❌ **Character "${characterName}" not found.**`, ephemeral: true });
                    }
                    
                    const characterHomeVillage = donatingCharacter.homeVillage?.toLowerCase()?.trim();
                    const targetVillage = villageName.toLowerCase().trim();
                    
                    if (characterHomeVillage !== targetVillage) {
                        const homeDisplay = donatingCharacter.homeVillage ? donatingCharacter.homeVillage.charAt(0).toUpperCase() + donatingCharacter.homeVillage.slice(1).toLowerCase() : 'Unknown';
                        const embed = new EmbedBuilder()
                            .setColor('#E74C3C')
                            .setTitle('❌ Cannot Donate to This Village')
                            .setDescription(
                                `**${characterName}**'s home village is **${homeDisplay}**, not **${villageName}**.\n\n` +
                                `Characters can only donate to their **home village**.`
                            )
                            .setFooter({ text: `Target village: ${villageName}` });
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                }

                // Strip emoji from itemName if present (format: <:name:id> or :name:)
                let cleanItemName = itemName || null;
                if (itemName) {
                    // Remove Discord emoji format: <:name:id>
                    cleanItemName = itemName.replace(/<:[^:]+:\d+>/g, '').trim();
                    // Remove standard emoji format: :name:
                    cleanItemName = cleanItemName.replace(/:[^:]+:/g, '').trim();
                    // Remove any remaining whitespace
                    cleanItemName = cleanItemName.trim();
                    // If after cleaning the name is empty, set to null
                    if (!cleanItemName) {
                        cleanItemName = null;
                    }
                }

                // Check cooldown (resets every Sunday at midnight EST)
                // Cooldown is per-user globally (1 donation per week total across all villages)
                // Use UserModel's villageDonationCooldown field for atomic cooldown tracking
                const currentWeekStart = getCurrentDonationWeekStart();
                
                if (COOLDOWN_ENABLED) {
                    // Use atomic findOneAndUpdate to check and set cooldown in one operation
                    // This prevents race conditions where two requests try to donate simultaneously
                    const userUpdateResult = await UserModel.findOneAndUpdate(
                        { 
                            discordId: interaction.user.id,
                            $or: [
                                { villageDonationCooldown: { $exists: false } },
                                { villageDonationCooldown: null },
                                { villageDonationCooldown: { $ne: currentWeekStart } }
                            ]
                        },
                        { 
                            $set: { villageDonationCooldown: currentWeekStart }
                        },
                        { new: true }
                    );
                    
                    // If updateResult is null, it means the user is already on cooldown for this week
                    if (!userUpdateResult) {
                        // Check what the current cooldown is to provide accurate message
                        const user = await UserModel.findOne({ discordId: interaction.user.id });
                        const storedCooldown = user?.villageDonationCooldown;
                        
                        const nextReset = getNextDonationReset();
                        let hoursUntilReset = 0;
                        let minutesUntilReset = 0;
                        let cooldownDescription = '';
                        
                        if (typeof storedCooldown === 'number' && storedCooldown === currentWeekStart) {
                            hoursUntilReset = Math.ceil((nextReset - new Date()) / (1000 * 60 * 60));
                            const daysUntilReset = Math.floor(hoursUntilReset / 24);
                            const remainingHours = hoursUntilReset % 24;
                            
                            if (daysUntilReset > 0) {
                                cooldownDescription = `⏳ **You've already contributed to a village this week.**\n\n` +
                                    `🔄 **Cooldown resets:** ${daysUntilReset} day(s) and ${remainingHours} hour(s)\n` +
                                    `📅 **Reset time:** Sunday at midnight EST`;
                            } else {
                                cooldownDescription = `⏳ **You've already contributed to a village this week.**\n\n` +
                                    `🔄 **Cooldown resets in:** ${hoursUntilReset} hour(s)\n` +
                                    `📅 **Reset time:** Sunday at midnight EST`;
                            }
                        } else if (storedCooldown instanceof Date && storedCooldown > new Date()) {
                            // Legacy: old rolling 7-day cooldown
                            minutesUntilReset = Math.ceil((storedCooldown - new Date()) / 1000 / 60);
                            const legacyHours = Math.floor(minutesUntilReset / 60);
                            const legacyMinutes = minutesUntilReset % 60;
                            
                            if (legacyHours > 0) {
                                cooldownDescription = `⏳ **Please wait before contributing again.**\n\n` +
                                    `🔄 **Cooldown remaining:** ${legacyHours} hour(s) and ${legacyMinutes} minute(s)`;
                            } else {
                                cooldownDescription = `⏳ **Please wait before contributing again.**\n\n` +
                                    `🔄 **Cooldown remaining:** ${legacyMinutes} minute(s)`;
                            }
                        } else {
                            hoursUntilReset = Math.ceil((nextReset - new Date()) / (1000 * 60 * 60));
                            const daysUntilReset = Math.floor(hoursUntilReset / 24);
                            const remainingHours = hoursUntilReset % 24;
                            
                            if (daysUntilReset > 0) {
                                cooldownDescription = `⏳ **You've already contributed to a village this week.**\n\n` +
                                    `🔄 **Cooldown resets:** ${daysUntilReset} day(s) and ${remainingHours} hour(s)\n` +
                                    `📅 **Reset time:** Sunday at midnight EST`;
                            } else {
                                cooldownDescription = `⏳ **You've already contributed to a village this week.**\n\n` +
                                    `🔄 **Cooldown resets in:** ${hoursUntilReset} hour(s)\n` +
                                    `📅 **Reset time:** Sunday at midnight EST`;
                            }
                        }
                        
                        const cooldownEmbed = new EmbedBuilder()
                            .setTitle(`${village.name} (Level ${village.level})`)
                            .setDescription(cooldownDescription)
                            .addFields(
                                { name: '💡 **Tip**', value: `> You can donate once per week total (across all villages).\n> Use </village view:1324300899585363968> to check the current status.`, inline: false }
                            )
                            .setColor(village.color)
                            .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
                            .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);
                        
                        return interaction.reply({ embeds: [cooldownEmbed] });
                    }
                }

                // Process donate contribution (combines repair and upgrade)
                const result = await processImprove(village, interaction, type, cleanItemName, qty, characterName);
                if (!result.success) {
                    // If donation failed, remove the cooldown we just set from UserModel
                    if (COOLDOWN_ENABLED) {
                        await UserModel.findOneAndUpdate(
                            { discordId: interaction.user.id },
                            { $set: { villageDonationCooldown: null } }
                        );
                    }
                    if (result.embed) {
                        return interaction.reply({ embeds: [result.embed], ephemeral: true });
                    }
                    return interaction.reply({ content: result.message, ephemeral: true });
                }

                return interaction.reply({ embeds: [result.embed] });
            }

            // ------------------- Subcommand: Contributors -------------------
            if (subcommand === 'contributors') {
                // Validate channel
                const channelCheck = validateVillageChannel(villageName, interaction);
                if (!channelCheck.valid) {
                    return interaction.reply({ 
                        content: channelCheck.error, 
                        ephemeral: true 
                    });
                }
                
                const contributorsEmbed = await generateContributorsEmbed(village);
                return interaction.reply({ embeds: [contributorsEmbed] });
            }

            // ------------------- Subcommand: Rest -------------------
            if (subcommand === 'rest') {
                const characterName = interaction.options.getString('charactername');
                
                if (!characterName) {
                    return interaction.reply({ content: '❌ **Character name is required.**', ephemeral: true });
                }

                // Fetch character
                const character = await fetchCharacterByName(characterName);
                if (!character) {
                    return interaction.reply({ content: `❌ **Character "${characterName}" not found.**`, ephemeral: true });
                }

                // Validate requirements
                const validation = await validateRestSpotRequirements(character, village, interaction);
                if (!validation.valid) {
                    return interaction.reply({ content: validation.error, ephemeral: true });
                }

                // Process rest spot based on village level
                if (village.level === 2) {
                    // Level 2: Random 1-2 hearts (50/50 chance)
                    const heartsToRestore = Math.random() < 0.5 ? 1 : 2;
                    const maxRestore = character.maxHearts - character.currentHearts;
                    const actualRestore = Math.min(heartsToRestore, maxRestore);

                    await recoverHearts(character._id, actualRestore);
                    await updateRestSpotCooldown(character, village.name);

                    // Refresh character to get updated hearts value
                    const updatedCharacter = await fetchCharacterByName(characterName);

                    const theme = getRestSpotTheme(village.name);
                    const embed = new EmbedBuilder()
                        .setTitle(`${theme.emoji} ${village.name} ${theme.name}`)
                        .setDescription(
                            `**${updatedCharacter.name}** rests in the ${theme.description}...\n\n` +
                            `❤️ **+${actualRestore} heart${actualRestore !== 1 ? 's' : ''} restored!**\n` +
                            `**Current Hearts:** ${updatedCharacter.currentHearts}/${updatedCharacter.maxHearts}\n\n` +
                            `*You can use the rest spot again tomorrow at 8am EST.*`
                        )
                        .setColor(village.color)
                        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
                        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

                    return interaction.reply({ embeds: [embed] });
                } else if (village.level === 3) {
                    // Level 3: Player chooses between 1 stamina or 2 hearts
                    const theme = getRestSpotTheme(village.name);
                    
                    // Check what can be restored
                    const canRestoreHearts = character.currentHearts < character.maxHearts;
                    const canRestoreStamina = character.currentStamina < character.maxStamina;

                    if (!canRestoreHearts && !canRestoreStamina) {
                        return interaction.reply({ 
                            content: '❌ **You are already at full hearts and stamina.**', 
                            ephemeral: true 
                        });
                    }

                    // Create buttons for choice
                    const buttons = new ActionRowBuilder();
                    
                    if (canRestoreStamina) {
                        buttons.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`restSpot_${village.name}_${character._id}_stamina`)
                                .setLabel('Restore 1 Stamina')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🟩')
                        );
                    }
                    
                    if (canRestoreHearts) {
                        buttons.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`restSpot_${village.name}_${character._id}_hearts`)
                                .setLabel('Restore 2 Hearts')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('❤️')
                        );
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`${theme.emoji} ${village.name} ${theme.name}`)
                        .setDescription(
                            `**${character.name}** arrives at the ${theme.description}...\n\n` +
                            `Choose your benefit:\n` +
                            `${canRestoreStamina ? '🟩 **Restore 1 Stamina** (50% chance)\n' : ''}` +
                            `${canRestoreHearts ? '❤️ **Restore 2 Hearts** (50% chance)\n' : ''}\n` +
                            `*Select your choice below. You can use the rest spot again tomorrow at 8am EST.*`
                        )
                        .setColor(village.color)
                        .setThumbnail(VILLAGE_IMAGES[village.name]?.thumbnail || BORDER_IMAGE)
                        .setImage(VILLAGE_IMAGES[village.name]?.banner || BORDER_IMAGE);

                    return interaction.reply({ embeds: [embed], components: [buttons] });
                }
            }


        } catch (error) {
            handleInteractionError(error, 'village.js');
            console.error(`[village.js] An error occurred while processing "${subcommand}" for village "${villageName}":`, error);
            return interaction.reply({ content: '❌ **An error occurred while processing your request.**', ephemeral: true });
        }
    },
    // Export function for use in mod.js and other modules
    checkAndHandleVillageLevelUp
};
