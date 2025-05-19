// ============================================================================
// ---- Imports ----
// ============================================================================

// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Local Module Imports -------------------
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByName, getCharacterInventoryCollection, fetchItemRarityByName } = require('../../database/db');
const { removeItemInventoryDatabase, addItemInventoryDatabase, syncToInventoryDatabase } = require('../../utils/inventoryUtils');
const { getNPCItems, NPCs } = require('../../modules/stealingNPCSModule');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../utils/validation');
const ItemModel = require('../../models/ItemModel');
const { fetchActiveBoost } = require('../../utils/boostingUtils');
const Character = require('../../models/CharacterModel');
const { hasPerk, getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');

// Add StealStats model
const StealStats = require('../../models/StealStatsModel');

// ============================================================================
// ---- Constants ----
// ============================================================================

// ------------------- System Constants -------------------
// const STEAL_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
// const STREAK_BONUS = 0.05; // 5% bonus per streak
// const MAX_STREAK = 5; // Maximum streak bonus
const PROTECTION_DURATION = 30 * 60 * 1000; // 30 minutes protection

// ------------------- Rarity Constants -------------------
const RARITY_COOLDOWN_MULTIPLIERS = {
    common: 1,
    uncommon: 1.5,
    rare: 2
};

const RARITY_WEIGHTS = {
    '1': 20, '2': 18, '3': 15, '4': 13, '5': 11, '6': 9, '7': 7, '8': 5, '9': 2, '10': 1
};

const FAILURE_CHANCES = {
    common: 10,
    uncommon: 50,
    rare: 80
};

// ------------------- Error Messages -------------------
const ERROR_MESSAGES = {
    CHARACTER_NOT_FOUND: '❌ **Character not found.**',
    INVENTORY_NOT_SYNCED: '❌ **Inventory is not set up yet.** Use </testinventorysetup:ID> then </syncinventory:ID> to initialize.',
    IN_JAIL: '⛔ **You are currently in jail and cannot steal!**',
    PROTECTED: '🛡️ **This character is currently protected from theft!**',
    COOLDOWN: '⏰ **Please wait {time} seconds before attempting to steal again.**',
    NO_ITEMS: '❌ **No items available to steal!**',
    INVALID_TARGET: '❌ **Invalid target selected!**'
};

// ------------------- NPC Data -------------------
const NPC_NAME_MAPPING = {
    'Hank': 'Hank',
    'Sue': 'Sue',
    'Lukan': 'Lukan',
    'Myti': 'Myti',
    'Cree': 'Cree',
    'Cece': 'Cece',
    'Walton': 'Walton',
    'Jengo': 'Jengo',
    'Jasz': 'Jasz',
    'Lecia': 'Lecia',
    'Tye': 'Tye',
    'Lil Tim': 'Lil Tim'
};

// ============================================================================
// ---- State Management ----
// ============================================================================

// ------------------- User State Tracking -------------------
// const userCooldowns = new Map(); // Track user cooldowns
const stealStreaks = new Map(); // Track successful steal streaks
const stealProtection = new Map(); // Track protection after being stolen from

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Helper Function: Apply Fallback Logic -------------------
// Returns fallback items for a given inventory list and fallback tier.
async function applyFallbackLogic(inventoryList, fallbackTier, fetchRarityFn) {
    let fallbackItems = [];
    for (const itemName of inventoryList) {
        const itemRarity = await fetchRarityFn(itemName);
        if (itemRarity) {
            if (fallbackTier === 'uncommon' && itemRarity >= 5 && itemRarity <= 7) {
                fallbackItems.push({ itemName, itemRarity, tier: 'uncommon', weight: RARITY_WEIGHTS[itemRarity] });
            } else if (fallbackTier === 'common' && itemRarity >= 1 && itemRarity <= 4) {
                fallbackItems.push({ itemName, itemRarity, tier: 'common', weight: RARITY_WEIGHTS[itemRarity] });
            }
        }
    }
    return fallbackItems;
}

// ------------------- Helper Function: Get Final Fallback Items -------------------
// Returns any available fallback items from the inventory.
async function getFinalFallbackItems(inventoryList, fetchRarityFn) {
    let finalFallbackItems = [];
    for (const itemName of inventoryList) {
        const itemRarity = await fetchRarityFn(itemName);
        if (itemRarity) {
            let tier = 'common';
            if (itemRarity >= 8) tier = 'rare';
            else if (itemRarity >= 5) tier = 'uncommon';
            finalFallbackItems.push({ itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] });
        }
    }
    return finalFallbackItems;
}

// ------------------- Character Validation -------------------
async function validateCharacter(characterName, userId, requireInventorySync = false) {
    const character = await fetchCharacterByName(characterName);
    if (!character) {
        return { valid: false, error: ERROR_MESSAGES.CHARACTER_NOT_FOUND };
    }
    
    if (userId && character.userId !== userId) {
        return { valid: false, error: '❌ **You can only perform this action with your own characters.**' };
    }
    
    if (requireInventorySync && !character.inventorySynced) {
        return { valid: false, error: ERROR_MESSAGES.INVENTORY_NOT_SYNCED };
    }
    
    return { valid: true, character };
}

// ------------------- Embed Creation -------------------
function createBaseEmbed(title, color = '#AA926A') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();
}

async function createStealResultEmbed(thiefCharacter, targetCharacter, item, quantity, roll, failureThreshold, isSuccess, isNPC = false) {
    const itemEmoji = item.emoji || await getItemEmoji(item.itemName);
    const successField = `Roll: **${roll}** / 99 = ${isSuccess ? '✅ Success!' : '❌ Failure!'}`;
    
    // Get NPC flavor text if it's an NPC
    let npcFlavorText = '';
    if (isNPC) {
        const npcName = typeof targetCharacter === 'string' ? targetCharacter : targetCharacter.name;
        const npcData = NPCs[npcName];
        if (npcData && npcData.flavorText) {
            npcFlavorText = `*${npcData.flavorText}*`;
        } else {
            npcFlavorText = `*${npcName} ${isSuccess ? 'didn\'t notice you taking' : 'caught you trying to take'} something...*`;
        }
    }
    
    const embed = createBaseEmbed(isSuccess ? '💰 Item Stolen!' : '💢 Failed Steal!', isSuccess ? '#AA926A' : '#ff0000')
        .setDescription(`${npcFlavorText}\n\n[**${thiefCharacter.name}**](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) ${isSuccess ? 'successfully stole from' : 'tried to steal from'} ${isNPC ? targetCharacter : `[**${targetCharacter.name}**](${targetCharacter.inventory || targetCharacter.inventoryLink})`}`)
        .addFields(
            { name: '📦 Item', value: `> **${itemEmoji} ${item.itemName}**${isSuccess ? ` x**${quantity}**` : ''}`, inline: false },
            { name: '🎲 Roll', value: `> ${successField}`, inline: false },
            { name: '✨ Rarity', value: `> **${item.tier.toUpperCase()}**`, inline: false }
        )
        .setThumbnail(isNPC ? 'https://i.pinimg.com/736x/3b/fb/7b/3bfb7bd4ea33b017d58d289e130d487a.jpg' : targetCharacter.icon)
        .setAuthor({ 
            name: `${thiefCharacter.name} the ${thiefCharacter.job ? thiefCharacter.job.charAt(0).toUpperCase() + thiefCharacter.job.slice(1).toLowerCase() : 'No Job'}`, 
            iconURL: thiefCharacter.icon 
        })
        .setFooter({ 
            text: isSuccess ? 'Steal successful!' : 'Steal failed!', 
            iconURL: isNPC ? null : targetCharacter.icon 
        });

    if (isSuccess) {
        embed.setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
    }

    return embed;
}

// ------------------- Steal System Functions -------------------
// function calculateStreakBonus(streak) {
//     return Math.min(streak * STREAK_BONUS, MAX_STREAK * STREAK_BONUS);
// }

// function calculateCooldown(itemRarity, streak) {
//     const baseCooldown = STEAL_COOLDOWN;
//     const rarityMultiplier = RARITY_COOLDOWN_MULTIPLIERS[itemRarity] || 1;
//     const streakReduction = calculateStreakBonus(streak);
//     
//     return Math.floor(baseCooldown * rarityMultiplier * (1 - streakReduction));
// }

function checkAndUpdateProtection(targetId) {
    const protectionEnd = stealProtection.get(targetId);
    if (protectionEnd && Date.now() < protectionEnd) {
        return true;
    }
    return false;
}

function setProtection(targetId) {
    stealProtection.set(targetId, Date.now() + PROTECTION_DURATION);
}

// ------------------- Statistics Functions -------------------
async function updateStealStats(characterId, success, itemRarity, victimCharacter = null) {
    try {
        let stats = await StealStats.findOne({ characterId });
        
        if (!stats) {
            stats = new StealStats({
                characterId,
                totalAttempts: 0,
                successfulSteals: 0,
                failedSteals: 0,
                itemsByRarity: {
                    common: 0,
                    uncommon: 0,
                    rare: 0
                },
                victims: []
            });
        }
        
        stats.totalAttempts++;
        if (success) {
            stats.successfulSteals++;
            stats.itemsByRarity[itemRarity]++;
            
            // Update victim tracking if this was a successful steal
            if (victimCharacter) {
                const victimIndex = stats.victims.findIndex(v => 
                    v.characterId.toString() === victimCharacter._id.toString()
                );
                
                if (victimIndex === -1) {
                    // Add new victim
                    stats.victims.push({
                        characterId: victimCharacter._id,
                        characterName: victimCharacter.name,
                        count: 1
                    });
                } else {
                    // Increment existing victim count
                    stats.victims[victimIndex].count++;
                }
            }
        } else {
            stats.failedSteals++;
        }
        
        await stats.save();
    } catch (error) {
        console.error('[steal.js]: Error updating steal stats:', error);
    }
}

async function getStealStats(characterId) {
    try {
        const stats = await StealStats.findOne({ characterId }) || {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0
            },
            victims: []
        };
        
        const successRate = stats.totalAttempts > 0 
            ? ((stats.successfulSteals / stats.totalAttempts) * 100).toFixed(1)
            : 0;
            
        return {
            ...stats.toObject(),
            successRate
        };
    } catch (error) {
        console.error('[steal.js]: Error getting steal stats:', error);
        return {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            successRate: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0
            },
            victims: []
        };
    }
}

// ------------------- Item Management Functions -------------------
async function getItemEmoji(itemName) {
    try {
        const item = await ItemModel.findOne({ itemName: new RegExp(`^${itemName}$`, 'i') }).select('emoji').exec();
        if (item && item.emoji) {
            return item.emoji;
        }
        const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${itemName}$`, 'i') }).select('type category').exec();
        if (itemDetails) {
            if (itemDetails.type?.includes('Weapon')) return '⚔️';
            if (itemDetails.type?.includes('Armor')) return '🛡️';
            if (itemDetails.category?.includes('Material')) return '📦';
            if (itemDetails.category?.includes('Food')) return '🍖';
            if (itemDetails.category?.includes('Potion')) return '🧪';
        }
        return '📦';
    } catch (error) {
        console.error('[steal.js]: Error getting item emoji:', error);
        return '📦';
    }
}

function determineStealQuantity(item) {
    const availableQuantity = item.quantity !== undefined ? item.quantity : 1;
    let quantityToSteal = 1;
    if (item.tier === 'common') {
        quantityToSteal = Math.min(availableQuantity, Math.floor(Math.random() * 3) + 1);
    } else if (item.tier === 'uncommon') {
        quantityToSteal = Math.min(availableQuantity, Math.floor(Math.random() * 2) + 1);
    } else if (item.tier === 'rare') {
        quantityToSteal = 1;
    }
    return quantityToSteal;
}

function getRandomItemByWeight(items) {
    const totalWeight = items.reduce(
        (acc, item) => acc + (item.weight !== undefined ? item.weight : RARITY_WEIGHTS[item.itemRarity]),
        0
    );
    let randomValue = Math.random() * totalWeight;
    for (const item of items) {
        const currentWeight = item.weight !== undefined ? item.weight : RARITY_WEIGHTS[item.itemRarity];
        randomValue -= currentWeight;
        if (randomValue <= 0) return item;
    }
    return null;
}

// ============================================================================
// ---- Command Definition ----
// ============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Steal an item from another character or NPC.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('commit')
                .setDescription('Commit a theft from another character or NPC.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('targettype')
                        .setDescription('Choose NPC or Player as target')
                        .setRequired(true)
                        .addChoices(
                            { name: 'NPC', value: 'npc' },
                            { name: 'Player', value: 'player' }
                        ))
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('Target character or NPC name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('Rarity of the item to steal')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle whether your character can be stolen from.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Whether to allow stealing from this character')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('jailtime')
                .setDescription('Check remaining jail time for your character.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your stealing statistics.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true))),

    // ============================================================================
    // ---- Command Handlers ----
    // ============================================================================

    // ------------------- Main Execute Handler -------------------
    async execute(interaction) {
        console.log('[steal.js]: 🔄 Starting steal command execution');
        await interaction.deferReply({ ephemeral: false });
        try {
            const subcommand = interaction.options.getSubcommand();
            console.log('[steal.js]: 📝 Subcommand:', subcommand);

            // Handle commit subcommand
            if (subcommand === 'commit') {
                const targetType = interaction.options.getString('targettype');
                const targetName = interaction.options.getString('target');
                const raritySelection = interaction.options.getString('rarity').toLowerCase();
                const characterName = interaction.options.getString('charactername');
                
                console.log('[steal.js]: 📊 Command parameters:', {
                    targetType,
                    targetName,
                    raritySelection,
                    characterName
                });

                // Validate thief character first
                console.log('[steal.js]: 🔍 Validating thief character:', characterName);
                const { valid: thiefValid, error: thiefError, character: thiefCharacter } = 
                    await validateCharacter(characterName, interaction.user.id, true);
                if (!thiefValid) {
                    console.log('[steal.js]: ❌ Thief validation failed:', thiefError);
                    return interaction.editReply({ content: thiefError, ephemeral: true });
                }
                console.log('[steal.js]: ✅ Thief character validated:', thiefCharacter.name);

                // Initialize job variable early
                let job = (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) ? thiefCharacter.jobVoucherJob : thiefCharacter.job;

                // Check for job voucher and validate it
                let voucherCheck = { success: true, skipVoucher: false }; // Initialize with default values
                if (thiefCharacter.jobVoucher) {
                    console.log(`[steal.js]: 🎫 Validating job voucher for ${thiefCharacter.name}`);
                    voucherCheck = await validateJobVoucher(thiefCharacter, job, 'STEALING');

                    if (voucherCheck.skipVoucher) {
                        console.log(`[steal.js]: ✅ ${thiefCharacter.name} already has job "${job}" - skipping voucher`);
                        // No activation needed
                    } else if (!voucherCheck.success) {
                        console.error(`[steal.js]: ❌ Voucher validation failed: ${voucherCheck.message}`);
                        await interaction.editReply({
                            content: voucherCheck.message,
                            ephemeral: true,
                        });
                        return;
                    } else {
                        console.log(`[steal.js]: 🎫 Activating job voucher for ${thiefCharacter.name}`);
                        const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
                        if (!itemSuccess) {
                            await interaction.editReply({ content: itemError, ephemeral: true });
                            return;
                        }
                        const activationResult = await activateJobVoucher(thiefCharacter, job, jobVoucherItem, 1, interaction);
                        if (!activationResult.success) {
                            await interaction.editReply({
                                content: activationResult.message,
                                ephemeral: true,
                            });
                            return;
                        }
                    }
                }

                // Check if thief's inventory is set up
                if (!thiefCharacter.inventorySynced) {
                    console.log('[steal.js]: ❌ Thief inventory not synced');
                    return interaction.editReply({ 
                        content: '❌ **Your inventory is not set up yet.** Use </testinventorysetup:ID> then </syncinventory:ID> to initialize.', 
                        ephemeral: true 
                    });
                }

                // Check if thief has a valid inventory URL
                const thiefInventoryLink = thiefCharacter.inventory || thiefCharacter.inventoryLink;
                if (typeof thiefInventoryLink !== 'string' || !isValidGoogleSheetsUrl(thiefInventoryLink)) {
                    console.log('[steal.js]: ❌ Invalid thief inventory URL');
                    return interaction.editReply({ 
                        content: `❌ **Invalid Google Sheets URL for "${thiefCharacter.name}".**`, 
                        ephemeral: true 
                    });
                }

                // Check if thief is in jail
                console.log('[steal.js]: 🔍 Checking jail status for:', thiefCharacter.name);
                if (thiefCharacter.inJail) {
                    // Check if jail time is up
                    if (thiefCharacter.jailReleaseTime && Date.now() >= thiefCharacter.jailReleaseTime.getTime()) {
                        console.log('[steal.js]: ✅ Jail time completed, releasing character');
                        thiefCharacter.inJail = false;
                        thiefCharacter.jailReleaseTime = null;
                        await thiefCharacter.save();
                    } else {
                        console.log('[steal.js]: ❌ Character is in jail');
                        const releaseTime = thiefCharacter.jailReleaseTime.getTime();
                        const jailEmbed = createBaseEmbed('⛔ In Jail!', '#ff0000')
                            .setDescription(`**${thiefCharacter.name}** is currently serving time in jail for failed steal attempts.`)
                            .addFields(
                                { name: '⏰ Time Remaining', value: `<t:${Math.floor(releaseTime / 1000)}:R>`, inline: false },
                                { name: '🕒 Release Time', value: `<t:${Math.floor(releaseTime / 1000)}:F>`, inline: false }
                            )
                            .setThumbnail(thiefCharacter.icon)
                            .setFooter({ 
                                text: 'You will be automatically released when your time is up.', 
                                iconURL: thiefCharacter.icon 
                            });
                        
                        return interaction.editReply({ 
                            embeds: [jailEmbed], 
                            ephemeral: false 
                        });
                    }
                }
                console.log('[steal.js]: ✅ Character is not in jail');

                // Get current streak
                const currentStreak = stealStreaks.get(interaction.user.id) || 0;
                console.log('[steal.js]: 📊 Current steal streak:', currentStreak);

                // Handle NPC stealing
                if (targetType === 'npc') {
                    console.log('[steal.js]: 🎯 Processing NPC steal attempt');
                    const mappedNPCName = NPC_NAME_MAPPING[targetName];
                    if (!mappedNPCName) {
                        return interaction.editReply({ content: ERROR_MESSAGES.INVALID_TARGET, ephemeral: true });
                    }

                    const npcInventory = getNPCItems(mappedNPCName);
                    const itemsWithRarity = await Promise.all(npcInventory.map(async itemName => {
                        const itemRarity = await fetchItemRarityByName(itemName);
                        return { itemName, itemRarity };
                    }));

                    let filteredItems = itemsWithRarity
                        .filter(({ itemRarity }) => itemRarity)
                        .map(({ itemName, itemRarity }) => {
                            let tier = 'common';
                            if (itemRarity >= 8) tier = 'rare';
                            else if (itemRarity >= 5) tier = 'uncommon';
                            return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                        })
                        .filter(item => item.tier === raritySelection);

                    console.log('[steal.js]: 📊 Filtered NPC items by rarity:', {
                        requestedRarity: raritySelection,
                        availableItems: filteredItems.map(item => ({
                            name: item.itemName,
                            rarity: item.itemRarity,
                            tier: item.tier
                        }))
                    });

                    if (!filteredItems.length) {
                        console.log('[steal.js]: ⚠️ No items of selected rarity, trying fallback tiers');
                        let fallbackTier = (raritySelection === 'rare') ? 'uncommon' : (raritySelection === 'uncommon') ? 'common' : null;
                        if (fallbackTier) {
                            console.log('[steal.js]: 🔄 Using fallback tier:', fallbackTier);
                            filteredItems = itemsWithRarity
                                .filter(({ itemRarity }) => itemRarity)
                                .map(({ itemName, itemRarity }) => {
                                    let tier = 'common';
                                    if (itemRarity >= 8) tier = 'rare';
                                    else if (itemRarity >= 5) tier = 'uncommon';
                                    return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                                })
                                .filter(item => item.tier === fallbackTier);
                        }
                        
                        // If still no items, get any available items
                        if (!filteredItems.length) {
                            console.log('[steal.js]: ⚠️ No fallback items, getting any available items');
                            filteredItems = itemsWithRarity
                                .filter(({ itemRarity }) => itemRarity)
                                .map(({ itemName, itemRarity }) => {
                                    let tier = 'common';
                                    if (itemRarity >= 8) tier = 'rare';
                                    else if (itemRarity >= 5) tier = 'uncommon';
                                    return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                                });
                        }
                    }

                    if (!filteredItems.length) {
                        console.log('[steal.js]: ❌ No items available to steal');
                        return interaction.editReply({ content: ERROR_MESSAGES.NO_ITEMS, ephemeral: true });
                    }

                    console.log('[steal.js]: 🎲 Selecting random item by weight');
                    const selectedItem = getRandomItemByWeight(filteredItems);
                    console.log('[steal.js]: 📊 Selected item:', {
                        name: selectedItem.itemName,
                        rarity: selectedItem.itemRarity,
                        tier: selectedItem.tier
                    });

                    const roll = Math.floor(Math.random() * 99) + 1;
                    const failureThreshold = FAILURE_CHANCES[selectedItem.tier];
                    const isSuccess = roll > failureThreshold;

                    if (isSuccess) {
                        const quantity = determineStealQuantity(selectedItem);
                        stealStreaks.set(interaction.user.id, currentStreak + 1);
                        await updateStealStats(thiefCharacter._id, true, selectedItem.tier);
                        
                        const npcItemIndex = npcInventory.indexOf(selectedItem.itemName);
                        if (npcItemIndex > -1) npcInventory.splice(npcItemIndex, 1);
                        
                        const stolenItem = {
                            itemName: selectedItem.itemName,
                            quantity: quantity,
                            obtain: `Stolen from NPC ${mappedNPCName}`,
                            date: new Date()
                        };
                        
                        await syncToInventoryDatabase(thiefCharacter, stolenItem, interaction);
                        
                        const embed = await createStealResultEmbed(thiefCharacter, mappedNPCName, selectedItem, quantity, roll, failureThreshold, true, true);
                        
                        // Add fallback message if the selected item's tier is different from requested rarity
                        if (selectedItem.tier !== raritySelection) {
                            let fallbackMessage = '';
                            if (raritySelection === 'rare') {
                                fallbackMessage = '⚠️ No rare items found! But you did find something else...';
                            } else if (raritySelection === 'uncommon') {
                                fallbackMessage = '⚠️ No uncommon items found! But you did find something else...';
                            }
                            embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
                        }
                        
                        // ------------------- Deactivate Job Voucher -------------------
                        if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                            const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                            if (!deactivationResult.success) {
                                console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                            } else {
                                console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                            }
                        }
                        
                        return interaction.editReply({ embeds: [embed], ephemeral: false });
                    } else {
                        stealStreaks.set(interaction.user.id, 0);
                        await updateStealStats(thiefCharacter._id, false, selectedItem.tier);
                        
                        // Increment failed steal attempts
                        console.log('[steal.js]: 📊 Updating failed steal attempts');
                        thiefCharacter.failedStealAttempts = (thiefCharacter.failedStealAttempts || 0) + 1;
                        
                        // Check if character should go to jail (3 failed attempts)
                        if (thiefCharacter.failedStealAttempts >= 3) {
                            console.log('[steal.js]: ⛔ Sending character to jail');
                            thiefCharacter.inJail = true;
                            thiefCharacter.jailReleaseTime = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
                            thiefCharacter.failedStealAttempts = 0; // Reset counter
                            
                            await thiefCharacter.save();
                            
                            const jailEmbed = createBaseEmbed('⛔ Sent to Jail!', '#ff0000')
                                .setDescription(`**${thiefCharacter.name}** has been sent to jail for 30 minutes due to 3 failed steal attempts!`)
                                .addFields(
                                    { name: 'Release Time', value: `<t:${Math.floor(thiefCharacter.jailReleaseTime.getTime() / 1000)}:R>`, inline: false }
                                )
                                .setThumbnail(thiefCharacter.icon);
                            
                            // ------------------- Deactivate Job Voucher -------------------
                            if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                                const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                                if (!deactivationResult.success) {
                                    console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                                } else {
                                    console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                                }
                            }
                            
                            return interaction.editReply({
                                embeds: [jailEmbed],
                                ephemeral: false
                            });
                        }
                        
                        await thiefCharacter.save();
                        
                        // Create failure embed
                        console.log('[steal.js]: 🎨 Creating failure embed');
                        const embed = await createStealResultEmbed(thiefCharacter, mappedNPCName, selectedItem, 0, roll, failureThreshold, false, true);
                        
                        // Add fallback message if the selected item's tier is different from requested rarity
                        if (selectedItem.tier !== raritySelection) {
                            let fallbackMessage = '';
                            if (raritySelection === 'rare') {
                                fallbackMessage = '⚠️ No rare items found! But you did find something else...';
                            } else if (raritySelection === 'uncommon') {
                                fallbackMessage = '⚠️ No uncommon items found! But you did find something else...';
                            }
                            embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
                        }

                        // Add failed attempts warning
                        const attemptsLeft = 3 - thiefCharacter.failedStealAttempts;
                        let warningMessage = '';
                        if (attemptsLeft === 2) {
                            warningMessage = '⚠️ **Warning:** One more failed attempt and you\'ll be sent to jail!';
                        } else if (attemptsLeft === 1) {
                            warningMessage = '⚠️ **Final Warning:** This is your last attempt before jail time!';
                        }
                        
                        if (warningMessage) {
                            embed.addFields({ 
                                name: '⚠️ Failed Attempts', 
                                value: `${warningMessage}\nYou have ${attemptsLeft}/3 attempts remaining before jail time!`, 
                                inline: false 
                            });
                        } else {
                            embed.addFields({ 
                                name: '⚠️ Failed Attempts', 
                                value: `You have ${attemptsLeft}/3 attempts remaining before jail time!`, 
                                inline: false 
                            });
                        }
                        
                        // ------------------- Deactivate Job Voucher -------------------
                        if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                            const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                            if (!deactivationResult.success) {
                                console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                            } else {
                                console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                            }
                        }
                        
                        await interaction.editReply({
                            embeds: [embed],
                            ephemeral: false
                        });
                    }
                }

                // Handle player stealing
                if (targetType === 'player') {
                    console.log('[steal.js]: 🎯 Processing player steal attempt');
                    console.log('[steal.js]: 🔍 Validating target character:', targetName);
                    const { valid: targetValid, error: targetError, character: targetCharacter } = 
                        await validateCharacter(targetName, null);
                    if (!targetValid) {
                        console.log('[steal.js]: ❌ Target validation failed:', targetError);
                        return interaction.editReply({ content: targetError, ephemeral: true });
                    }
                    console.log('[steal.js]: ✅ Target character validated:', targetCharacter.name);

                    // Check if target's inventory is set up
                    if (!targetCharacter.inventorySynced) {
                        console.log('[steal.js]: ❌ Target inventory not synced');
                        return interaction.editReply({ 
                            content: `❌ **${targetCharacter.name}'s inventory is not set up yet.** They need to use </testinventorysetup:ID> then </syncinventory:ID> to initialize.`, 
                            ephemeral: true 
                        });
                    }

                    // Check if target has a valid inventory URL
                    const targetInventoryLink = targetCharacter.inventory || targetCharacter.inventoryLink;
                    if (typeof targetInventoryLink !== 'string' || !isValidGoogleSheetsUrl(targetInventoryLink)) {
                        console.log('[steal.js]: ❌ Invalid target inventory URL');
                        return interaction.editReply({ 
                            content: `❌ **Invalid Google Sheets URL for "${targetCharacter.name}".**`, 
                            ephemeral: true 
                        });
                    }

                    // Check if characters are in the same village
                    if (thiefCharacter.currentVillage !== targetCharacter.currentVillage) {
                        console.log('[steal.js]: ❌ Characters in different villages');
                        return interaction.editReply({ 
                            content: `❌ **You can only steal from characters in the same village!**\n📍 **Your Location:** ${thiefCharacter.currentVillage}\n📍 **Target Location:** ${targetCharacter.currentVillage}`, 
                            ephemeral: true 
                        });
                    }

                    console.log('[steal.js]: 🔍 Checking protection status for:', targetCharacter.name);
                    if (checkAndUpdateProtection(targetCharacter._id)) {
                        console.log('[steal.js]: ❌ Target is protected');
                        return interaction.editReply({ content: ERROR_MESSAGES.PROTECTED, ephemeral: true });
                    }
                    console.log('[steal.js]: ✅ Target is not protected');

                    console.log('[steal.js]: 🔍 Checking steal permission for:', targetCharacter.name);
                    if (!targetCharacter.canBeStolenFrom) {
                        console.log('[steal.js]: ❌ Target cannot be stolen from');
                        return interaction.editReply({ content: `⚠️ **${targetCharacter.name}** cannot be stolen from.`, ephemeral: true });
                    }
                    console.log('[steal.js]: ✅ Target can be stolen from');

                    // Get target's inventory
                    console.log('[steal.js]: 📦 Fetching target inventory for:', targetCharacter.name);
                    const targetInventoryCollection = await getCharacterInventoryCollection(targetCharacter.name);
                    const inventoryEntries = await targetInventoryCollection.find({ characterId: targetCharacter._id }).toArray();
                    const rawItemNames = inventoryEntries.map(entry => entry.itemName);
                    console.log('[steal.js]: 📊 Found items in target inventory:', rawItemNames.length);

                    // Exclude items that are currently equipped
                    console.log('[steal.js]: 🔍 Checking equipped items');
                    const equippedItems = [
                        targetCharacter.gearWeapon?.name,
                        targetCharacter.gearShield?.name,
                        targetCharacter.gearArmor?.head?.name,
                        targetCharacter.gearArmor?.chest?.name,
                        targetCharacter.gearArmor?.legs?.name,
                    ].filter(Boolean);
                    console.log('[steal.js]: 📊 Equipped items:', equippedItems);

                    // Get items with their rarities
                    console.log('[steal.js]: 🔍 Fetching item rarities');
                    let itemsWithRarity = await Promise.all(
                        rawItemNames
                            .filter(itemName => !equippedItems.includes(itemName))
                            .map(async itemName => {
                                const itemRarity = await fetchItemRarityByName(itemName);
                                return { itemName, itemRarity };
                            })
                    );
                    console.log('[steal.js]: 📊 Items with rarity:', itemsWithRarity.length);

                    // Filter items by selected rarity
                    console.log('[steal.js]: 🔍 Filtering items by rarity:', raritySelection);
                    let filteredItemsPlayer = itemsWithRarity
                        .filter(({ itemRarity }) => itemRarity)
                        .map(({ itemName, itemRarity }) => {
                            let tier = 'common';
                            if (itemRarity >= 8) tier = 'rare';
                            else if (itemRarity >= 5) tier = 'uncommon';
                            return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                        })
                        .filter(item => item.tier === raritySelection);
                    console.log('[steal.js]: 📊 Filtered items:', filteredItemsPlayer.length);

                    // If no items of selected rarity, try fallback tiers
                    if (!filteredItemsPlayer.length) {
                        console.log('[steal.js]: ⚠️ No items of selected rarity, trying fallback tiers');
                        let fallbackTier = (raritySelection === 'rare') ? 'uncommon' : (raritySelection === 'uncommon') ? 'common' : null;
                        if (fallbackTier) {
                            console.log('[steal.js]: 🔄 Using fallback tier:', fallbackTier);
                            filteredItemsPlayer = itemsWithRarity
                                .filter(({ itemRarity }) => itemRarity)
                                .map(({ itemName, itemRarity }) => {
                                    let tier = 'common';
                                    if (itemRarity >= 8) tier = 'rare';
                                    else if (itemRarity >= 5) tier = 'uncommon';
                                    return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                                })
                                .filter(item => item.tier === fallbackTier);
                        }
                        
                        // If still no items, get any available items
                        if (!filteredItemsPlayer.length) {
                            console.log('[steal.js]: ⚠️ No fallback items, getting any available items');
                            filteredItemsPlayer = itemsWithRarity
                                .filter(({ itemRarity }) => itemRarity)
                                .map(({ itemName, itemRarity }) => {
                                    let tier = 'common';
                                    if (itemRarity >= 8) tier = 'rare';
                                    else if (itemRarity >= 5) tier = 'uncommon';
                                    return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
                                });
                        }
                    }

                    if (!filteredItemsPlayer.length) {
                        console.log('[steal.js]: ❌ No items available to steal');
                        return interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**`, ephemeral: true });
                    }

                    console.log('[steal.js]: 🎲 Selecting random item by weight');
                    const selectedItemPlayer = getRandomItemByWeight(filteredItemsPlayer);
                    console.log('[steal.js]: 📊 Selected item:', selectedItemPlayer);

                    console.log('[steal.js]: 🎲 Rolling for steal attempt');
                    const rollPlayer = Math.floor(Math.random() * 99) + 1;
                    const failureThresholdPlayer = FAILURE_CHANCES[selectedItemPlayer.tier];
                    const success = rollPlayer > failureThresholdPlayer;
                    console.log('[steal.js]: 📊 Roll result:', { roll: rollPlayer, threshold: failureThresholdPlayer, success });

                    // Update streak and stats on success/failure
                    if (success) {
                        console.log('[steal.js]: ✅ Steal successful, updating stats and streak');
                        stealStreaks.set(interaction.user.id, currentStreak + 1);
                        await updateStealStats(thiefCharacter._id, true, selectedItemPlayer.tier, targetCharacter);
                        setProtection(targetCharacter._id);

                        // Remove item from target's inventory and add to thief's inventory
                        const quantityToSteal = determineStealQuantity(selectedItemPlayer);
                        console.log('[steal.js]: 📦 Quantity to steal:', quantityToSteal);
                        
                        // Create items for sync
                        const stolenItem = {
                            itemName: selectedItemPlayer.itemName,
                            quantity: quantityToSteal,
                            obtain: `Stolen from ${targetCharacter.name}`,
                            date: new Date()
                        };
                        
                        const removedItem = {
                            itemName: selectedItemPlayer.itemName,
                            quantity: -quantityToSteal,
                            obtain: `Item stolen by ${thiefCharacter.name}`,
                            date: new Date()
                        };

                        console.log('[steal.js]: 🔄 Syncing inventory changes');
                        // Sync both changes
                        await syncToInventoryDatabase(targetCharacter, removedItem, interaction);
                        await syncToInventoryDatabase(thiefCharacter, stolenItem, interaction);

                        // Create success embed
                        console.log('[steal.js]: 🎨 Creating success embed');
                        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItemPlayer, quantityToSteal, rollPlayer, failureThresholdPlayer, success);
                        
                        // Add fallback message if the selected item's tier is different from requested rarity
                        if (selectedItemPlayer.tier !== raritySelection) {
                            let fallbackMessage = '';
                            if (raritySelection === 'rare') {
                                fallbackMessage = '⚠️ No rare items found! But you did find something else...';
                            } else if (raritySelection === 'uncommon') {
                                fallbackMessage = '⚠️ No uncommon items found! But you did find something else...';
                            }
                            embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
                        }

                        // ------------------- Deactivate Job Voucher -------------------
                        if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                            const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                            if (!deactivationResult.success) {
                                console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                            } else {
                                console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                            }
                        }

                        await interaction.editReply({
                            content: success ? `Hey! <@${targetCharacter.userId}>! Your character **${targetCharacter.name}** was stolen from!` : null,
                            embeds: [embed],
                            ephemeral: false
                        });
                    } else {
                        console.log('[steal.js]: ❌ Steal failed, resetting streak');
                        stealStreaks.set(interaction.user.id, 0);
                        await updateStealStats(thiefCharacter._id, false, selectedItemPlayer.tier);
                        
                        // Increment failed steal attempts
                        console.log('[steal.js]: 📊 Updating failed steal attempts');
                        thiefCharacter.failedStealAttempts = (thiefCharacter.failedStealAttempts || 0) + 1;
                        
                        // Check if character should go to jail (3 failed attempts)
                        if (thiefCharacter.failedStealAttempts >= 3) {
                            console.log('[steal.js]: ⛔ Sending character to jail');
                            thiefCharacter.inJail = true;
                            thiefCharacter.jailReleaseTime = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
                            thiefCharacter.failedStealAttempts = 0; // Reset counter
                            
                            await thiefCharacter.save();
                            
                            const jailEmbed = createBaseEmbed('⛔ Sent to Jail!', '#ff0000')
                                .setDescription(`**${thiefCharacter.name}** has been sent to jail for 30 minutes due to 3 failed steal attempts!`)
                                .addFields(
                                    { name: 'Release Time', value: `<t:${Math.floor(thiefCharacter.jailReleaseTime.getTime() / 1000)}:R>`, inline: false }
                                )
                                .setThumbnail(thiefCharacter.icon);
                            
                            // ------------------- Deactivate Job Voucher -------------------
                            if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                                const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                                if (!deactivationResult.success) {
                                    console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                                } else {
                                    console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                                }
                            }
                            
                            return interaction.editReply({
                                embeds: [jailEmbed],
                                ephemeral: false
                            });
                        }
                        
                        await thiefCharacter.save();
                        
                        // Create failure embed
                        console.log('[steal.js]: 🎨 Creating failure embed');
                        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItemPlayer, 0, rollPlayer, failureThresholdPlayer, false);
                        
                        // Add fallback message if the selected item's tier is different from requested rarity
                        if (selectedItemPlayer.tier !== raritySelection) {
                            let fallbackMessage = '';
                            if (raritySelection === 'rare') {
                                fallbackMessage = '⚠️ No rare items found! But you did find something else...';
                            } else if (raritySelection === 'uncommon') {
                                fallbackMessage = '⚠️ No uncommon items found! But you did find something else...';
                            }
                            embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
                        }

                        // Add failed attempts warning
                        const attemptsLeft = 3 - thiefCharacter.failedStealAttempts;
                        let warningMessage = '';
                        if (attemptsLeft === 2) {
                            warningMessage = '⚠️ **Warning:** One more failed attempt and you\'ll be sent to jail!';
                        } else if (attemptsLeft === 1) {
                            warningMessage = '⚠️ **Final Warning:** This is your last attempt before jail time!';
                        }
                        
                        if (warningMessage) {
                            embed.addFields({ 
                                name: '⚠️ Failed Attempts', 
                                value: `${warningMessage}\nYou have ${attemptsLeft}/3 attempts remaining before jail time!`, 
                                inline: false 
                            });
                        } else {
                            embed.addFields({ 
                                name: '⚠️ Failed Attempts', 
                                value: `You have ${attemptsLeft}/3 attempts remaining before jail time!`, 
                                inline: false 
                            });
                        }
                        
                        // ------------------- Deactivate Job Voucher -------------------
                        if (thiefCharacter.jobVoucher && !voucherCheck?.skipVoucher) {
                            const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                            if (!deactivationResult.success) {
                                console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
                            } else {
                                console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
                            }
                        }
                        
                        await interaction.editReply({
                            embeds: [embed],
                            ephemeral: false
                        });
                    }
                }
            }

            // Handle other subcommands
            if (subcommand === 'toggle') {
                const characterName = interaction.options.getString('charactername');
                const enabled = interaction.options.getBoolean('enabled');

                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    return interaction.editReply({ content: error, ephemeral: true });
                }

                character.canBeStolenFrom = enabled;
                await character.save();

                const embed = createBaseEmbed('🔒 Steal Permissions Updated', enabled ? '#00ff00' : '#ff0000')
                    .setDescription(`Steal permissions for **${character.name}** have been ${enabled ? 'enabled' : 'disabled'}.`)
                    .addFields(
                        { name: 'Status', value: enabled ? '✅ Can be stolen from' : '❌ Cannot be stolen from', inline: false }
                    )
                    .setThumbnail(character.icon);

                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === 'jailtime') {
                const characterName = interaction.options.getString('charactername');
                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    return interaction.editReply({ content: error, ephemeral: true });
                }

                if (!character.inJail) {
                    return interaction.editReply({ content: `✅ **${character.name}** is not in jail.`, ephemeral: true });
                }

                const now = Date.now();
                const releaseTime = character.jailReleaseTime.getTime();
                const timeLeft = releaseTime - now;

                if (timeLeft <= 0) {
                    character.inJail = false;
                    character.jailReleaseTime = null;
                    await character.save();
                    return interaction.editReply({ content: `✅ **${character.name}** has been released from jail!`, ephemeral: true });
                }

                const embed = createBaseEmbed('⏰ Jail Time Remaining', '#ff0000')
                    .setDescription(`**${character.name}** is currently in jail.`)
                    .addFields(
                        { name: 'Time Remaining', value: `<t:${Math.floor(releaseTime / 1000)}:R>`, inline: false },
                        { name: 'Release Time', value: `<t:${Math.floor(releaseTime / 1000)}:F>`, inline: false }
                    )
                    .setThumbnail(character.icon);

                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === 'stats') {
                const characterName = interaction.options.getString('charactername');
                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    return interaction.editReply({ content: error, ephemeral: true });
                }

                const stats = await getStealStats(character._id);
                
                // Sort victims by count
                const sortedVictims = stats.victims.sort((a, b) => b.count - a.count);
                const victimsList = sortedVictims.length > 0 
                    ? sortedVictims.map(v => `**${v.characterName}**: ${v.count} time${v.count > 1 ? 's' : ''}`).join('\n')
                    : 'No successful steals yet';
                
                const embed = createBaseEmbed('📊 Steal Statistics')
                    .setDescription(`Statistics for **${character.name}** the ${character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'No Job'}`)
                    .addFields(
                        { name: '🎯 Total Attempts', value: stats.totalAttempts.toString(), inline: true },
                        { name: '✅ Successful Steals', value: stats.successfulSteals.toString(), inline: true },
                        { name: '❌ Failed Steals', value: stats.failedSteals.toString(), inline: true },
                        { name: '📈 Success Rate', value: `${stats.successRate}%`, inline: true },
                        { name: '✨ Items by Rarity', value: 
                            `Common: ${stats.itemsByRarity.common}\n` +
                            `Uncommon: ${stats.itemsByRarity.uncommon}\n` +
                            `Rare: ${stats.itemsByRarity.rare}`, inline: false },
                        { name: '👥 Victims', value: victimsList, inline: false }
                    );
                
                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            handleError(error, 'steal.js');
            console.error('[steal.js]: Error executing command:', error);
            await interaction.editReply({ content: '❌ **An error occurred while processing the command.**', ephemeral: true });
        }
    },
};

