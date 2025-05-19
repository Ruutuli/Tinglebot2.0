// ============================================================================
// ---- Imports ----
// ============================================================================

// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Local Module Imports -------------------
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByName, getCharacterInventoryCollection, fetchItemRarityByName } = require('../../database/db');
const { removeItemInventoryDatabase, addItemInventoryDatabase } = require('../../utils/inventoryUtils');
const { getNPCItems, NPCs } = require('../../modules/stealingNPCSModule');
const { authorizeSheets, appendSheetData, isValidGoogleSheetsUrl, extractSpreadsheetId, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const ItemModel = require('../../models/ItemModel');
const { fetchActiveBoost } = require('../../utils/boostingUtils');

// ============================================================================
// ---- Constants ----
// ============================================================================

// ------------------- System Constants -------------------
const STEAL_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
const STREAK_BONUS = 0.05; // 5% bonus per streak
const MAX_STREAK = 5; // Maximum streak bonus
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
const userCooldowns = new Map(); // Track user cooldowns
const stealStreaks = new Map(); // Track successful steal streaks
const stealProtection = new Map(); // Track protection after being stolen from
const STEAL_STATS = new Map(); // Track steal statistics

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
    const successField = `d99 => ${roll} = ${isSuccess ? 'Success!' : 'Failure!'}`;
    
    const embed = createBaseEmbed(isSuccess ? '💰 Item Stolen!' : '💢 Failed Steal Attempt!', isSuccess ? '#AA926A' : '#ff0000')
        .setDescription(`[${thiefCharacter.name}](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) ${isSuccess ? 'successfully stole from' : 'tried to steal from'} ${isNPC ? targetCharacter : `[${targetCharacter.name}](${targetCharacter.inventory || targetCharacter.inventoryLink})`}`)
        .addFields(
            { name: '__Item__', value: `> **${itemEmoji} ${item.itemName}**${isSuccess ? ` x**${quantity}**` : ''}`, inline: false },
            { name: '__Roll__', value: `> **${successField}**`, inline: false },
            { name: '__Item Rarity__', value: `> **${item.tier.toUpperCase()}**`, inline: false }
        )
        .setThumbnail(isNPC ? 'https://i.pinimg.com/736x/3b/fb/7b/3bfb7bd4ea33b017d58d289e130d487a.jpg' : targetCharacter.icon)
        .setAuthor({ name: thiefCharacter.name, iconURL: thiefCharacter.icon })
        .setFooter({ text: isSuccess ? 'Steal successful!' : 'Steal attempt failed!', iconURL: isNPC ? null : targetCharacter.icon })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

    if (isSuccess && !isNPC) {
        embed.addFields({ name: '__Flavor__', value: `> **${item.flavorText || 'Nothing impressive today.'}**`, inline: false });
    }

    return embed;
}

// ------------------- Steal System Functions -------------------
function calculateStreakBonus(streak) {
    return Math.min(streak * STREAK_BONUS, MAX_STREAK * STREAK_BONUS);
}

function calculateCooldown(itemRarity, streak) {
    const baseCooldown = STEAL_COOLDOWN;
    const rarityMultiplier = RARITY_COOLDOWN_MULTIPLIERS[itemRarity] || 1;
    const streakReduction = calculateStreakBonus(streak);
    
    return Math.floor(baseCooldown * rarityMultiplier * (1 - streakReduction));
}

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
function updateStealStats(userId, success, itemRarity) {
    if (!STEAL_STATS.has(userId)) {
        STEAL_STATS.set(userId, {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0
            }
        });
    }
    
    const stats = STEAL_STATS.get(userId);
    stats.totalAttempts++;
    if (success) {
        stats.successfulSteals++;
        stats.itemsByRarity[itemRarity]++;
    } else {
        stats.failedSteals++;
    }
}

function getStealStats(userId) {
    const stats = STEAL_STATS.get(userId) || {
        totalAttempts: 0,
        successfulSteals: 0,
        failedSteals: 0,
        itemsByRarity: {
            common: 0,
            uncommon: 0,
            rare: 0
        }
    };
    
    const successRate = stats.totalAttempts > 0 
        ? ((stats.successfulSteals / stats.totalAttempts) * 100).toFixed(1)
        : 0;
        
    return {
        ...stats,
        successRate
    };
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
        .addStringOption(option =>
            option.setName('charactername')
                .setDescription('Your character name (thief)')
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
                .setAutocomplete(true))
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
                .setDescription('View your stealing statistics.')),

    // ============================================================================
    // ---- Command Handlers ----
    // ============================================================================

    // ------------------- Autocomplete Handler -------------------
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase().trim();
            if (!NPC_NAME_MAPPING || Object.keys(NPC_NAME_MAPPING).length === 0) {
                return await interaction.respond([]);
            }
            const filteredNPCs = Object.keys(NPC_NAME_MAPPING)
                .filter(npc => npc.toLowerCase().includes(focusedValue))
                .slice(0, 25);
            await interaction.respond(filteredNPCs.map(npc => ({ name: npc, value: npc })));
        } catch (error) {
            handleError(error, 'steal.js');
            console.error('[steal.js]: Error in autocomplete:', error);
            await interaction.respond([]);
        }
    },

    // ------------------- Main Execute Handler -------------------
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });
        try {
            const subcommand = interaction.options.getSubcommand(false);

            // If no subcommand, handle main steal command
            if (!subcommand) {
                const characterName = interaction.options.getString('charactername');
                const targetType = interaction.options.getString('targettype');
                const targetName = interaction.options.getString('target');
                const raritySelection = interaction.options.getString('rarity').toLowerCase();

                // Validate thief character
                const { valid: thiefValid, error: thiefError, character: thiefCharacter } = 
                    await validateCharacter(characterName, interaction.user.id, true);
                if (!thiefValid) {
                    return interaction.editReply({ content: thiefError, ephemeral: true });
                }

                // Check if thief is in jail
                if (thiefCharacter.inJail) {
                    return interaction.editReply({ content: ERROR_MESSAGES.IN_JAIL, ephemeral: true });
                }

                // Get current streak
                const currentStreak = stealStreaks.get(interaction.user.id) || 0;

                // Handle NPC stealing
                if (targetType === 'npc') {
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

                    if (!filteredItems.length) {
                        let fallbackTier = (raritySelection === 'rare') ? 'uncommon' : (raritySelection === 'uncommon') ? 'common' : null;
                        if (fallbackTier) {
                            filteredItems = await applyFallbackLogic(npcInventory, fallbackTier, fetchItemRarityByName);
                        }
                        if (!filteredItems.length) {
                            filteredItems = await getFinalFallbackItems(npcInventory, fetchItemRarityByName);
                        }
                        if (!filteredItems.length) {
                            return interaction.editReply({ content: ERROR_MESSAGES.NO_ITEMS, ephemeral: true });
                        }
                    }

                    const selectedItem = getRandomItemByWeight(filteredItems);
                    const roll = Math.floor(Math.random() * 99) + 1;
                    const failureThreshold = FAILURE_CHANCES[selectedItem.tier];
                    const isSuccess = roll > failureThreshold;

                    if (isSuccess) {
                        const quantity = determineStealQuantity(selectedItem);
                        stealStreaks.set(interaction.user.id, currentStreak + 1);
                        updateStealStats(interaction.user.id, true, selectedItem.tier);
                        
                        const npcItemIndex = npcInventory.indexOf(selectedItem.itemName);
                        if (npcItemIndex > -1) npcInventory.splice(npcItemIndex, 1);
                        
                        await addItemInventoryDatabase(thiefCharacter._id, selectedItem.itemName, quantity, interaction, `Stolen from NPC ${mappedNPCName}`);
                        
                        const embed = await createStealResultEmbed(thiefCharacter, mappedNPCName, selectedItem, quantity, roll, failureThreshold, true, true);
                        return interaction.editReply({ embeds: [embed], ephemeral: false });
                    } else {
                        stealStreaks.set(interaction.user.id, 0);
                        updateStealStats(interaction.user.id, false, selectedItem.tier);
                        
                        const embed = await createStealResultEmbed(thiefCharacter, mappedNPCName, selectedItem, 0, roll, failureThreshold, false, true);
                        return interaction.editReply({ embeds: [embed], ephemeral: false });
                    }
                }

                // Handle player stealing
                if (targetType === 'player') {
                    const { valid: targetValid, error: targetError, character: targetCharacter } = 
                        await validateCharacter(targetName, null);
                    if (!targetValid) {
                        return interaction.editReply({ content: targetError, ephemeral: true });
                    }

                    if (checkAndUpdateProtection(targetCharacter._id)) {
                        return interaction.editReply({ content: ERROR_MESSAGES.PROTECTED, ephemeral: true });
                    }

                    if (!targetCharacter.canBeStolenFrom) {
                        return interaction.editReply({ content: `⚠️ **${targetCharacter.name}** cannot be stolen from.`, ephemeral: true });
                    }

                    // Exclude items that are currently equipped
                    const equippedItems = [
                        targetCharacter.gearWeapon?.name,
                        targetCharacter.gearShield?.name,
                        targetCharacter.gearArmor?.head?.name,
                        targetCharacter.gearArmor?.chest?.name,
                        targetCharacter.gearArmor?.legs?.name,
                    ].filter(Boolean);

                    filteredItemsPlayer = filteredItemsPlayer.filter(item => !equippedItems.includes(item.itemName));

                    if (!filteredItemsPlayer.length) {
                        let fallbackTier = (raritySelection === 'rare') ? 'uncommon' : (raritySelection === 'uncommon') ? 'common' : null;
                        if (fallbackTier) {
                            const targetInventoryCollection = await getCharacterInventoryCollection(targetCharacter.name);
                            const inventoryEntries = await targetInventoryCollection.find({ characterId: targetCharacter._id }).toArray();
                            const rawItemNames = inventoryEntries.map(entry => entry.itemName);
                            let fallbackItems = await applyFallbackLogic(rawItemNames, fallbackTier, fetchItemRarityByName);
                            if (fallbackItems.length > 0) {
                                filteredItemsPlayer = fallbackItems;
                            } else {
                                let finalFallbackItems = await getFinalFallbackItems(rawItemNames, fetchItemRarityByName);
                                if (finalFallbackItems.length > 0) {
                                    filteredItemsPlayer = finalFallbackItems;
                                } else {
                                    return interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**`, ephemeral: true });
                                }
                            }
                        } else {
                            const targetInventoryCollection = await getCharacterInventoryCollection(targetCharacter.name);
                            const inventoryEntries = await targetInventoryCollection.find({ characterId: targetCharacter._id }).toArray();
                            const rawItemNames = inventoryEntries.map(entry => entry.itemName);
                            let finalFallbackItems = await getFinalFallbackItems(rawItemNames, fetchItemRarityByName);
                            if (finalFallbackItems.length > 0) {
                                filteredItemsPlayer = finalFallbackItems;
                            } else {
                                return interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**`, ephemeral: true });
                            }
                        }
                    }
                    const selectedItemPlayer = getRandomItemByWeight(filteredItemsPlayer);
                    const rollPlayer = Math.floor(Math.random() * 99) + 1; // d99 roll for player branch
                    const failureThresholdPlayer = FAILURE_CHANCES[selectedItemPlayer.tier];
                    const success = rollPlayer <= failureThresholdPlayer;

                    // Update streak and stats on success/failure
                    if (success) {
                        stealStreaks.set(interaction.user.id, currentStreak + 1);
                        updateStealStats(interaction.user.id, true, selectedItemPlayer.tier);
                        setProtection(targetCharacter._id);
                    } else {
                        stealStreaks.set(interaction.user.id, 0);
                        updateStealStats(interaction.user.id, false, selectedItemPlayer.tier);
                    }

                    // Remove item from target's inventory and add to thief's inventory
                    await removeItemInventoryDatabase(targetCharacter._id, selectedItemPlayer.itemName, determineStealQuantity(selectedItemPlayer), interaction, `Item stolen by ${thiefCharacter.name}`);
                    await addItemInventoryDatabase(thiefCharacter._id, selectedItemPlayer.itemName, determineStealQuantity(selectedItemPlayer), interaction, `Stolen from ${targetCharacter.name}`);

                    // Create success embed
                    const successField = `d99 => ${Math.floor(rollPlayer)} = Success!`;
                    const itemEmoji = selectedItemPlayer.emoji || await getItemEmoji(selectedItemPlayer.itemName);
                    
                    const successEmbed = new EmbedBuilder()
                        .setColor('#AA926A')
                        .setTitle('💰 Item Stolen!')
                        .setDescription(`[${thiefCharacter.name}](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) successfully stole from [${targetCharacter.name}](${targetCharacter.inventory || targetCharacter.inventoryLink}).`)
                        .addFields(
                            { name: '__Stolen Item__', value: `> **${itemEmoji} ${selectedItemPlayer.itemName}** x**${determineStealQuantity(selectedItemPlayer)}**`, inline: false },
                            { name: '__Roll__', value: `> **${successField}**`, inline: false },
                            { name: '__Item Rarity__', value: `> **${selectedItemPlayer.tier.toUpperCase()}**`, inline: false },
                            { name: '__Flavor__', value: `> **${selectedItemPlayer.flavorText || 'Nothing impressive today.'}**`, inline: false }
                        )
                        .setThumbnail(targetCharacter.icon)
                        .setAuthor({ name: thiefCharacter.name, iconURL: thiefCharacter.icon })
                        .setFooter({ text: 'Inventory theft successful!', iconURL: targetCharacter.icon })
                        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
                        .setTimestamp();

                    await interaction.editReply({
                        content: `Hey! <@${targetCharacter.userId}>! Your character **${targetCharacter.name}** was stolen from!`,
                        embeds: [successEmbed],
                        ephemeral: false
                    });
                }

                // Calculate new cooldown based on rarity and streak
                const newCooldown = calculateCooldown(raritySelection, currentStreak);
                userCooldowns.set(interaction.user.id, Date.now() + newCooldown);
            }

            // Handle subcommands
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
                const stats = getStealStats(interaction.user.id);
                const embed = createBaseEmbed('📊 Steal Statistics')
                    .setDescription(`Statistics for <@${interaction.user.id}>`)
                    .addFields(
                        { name: 'Total Attempts', value: stats.totalAttempts.toString(), inline: true },
                        { name: 'Successful Steals', value: stats.successfulSteals.toString(), inline: true },
                        { name: 'Failed Steals', value: stats.failedSteals.toString(), inline: true },
                        { name: 'Success Rate', value: `${stats.successRate}%`, inline: true },
                        { name: 'Items by Rarity', value: 
                            `Common: ${stats.itemsByRarity.common}\n` +
                            `Uncommon: ${stats.itemsByRarity.uncommon}\n` +
                            `Rare: ${stats.itemsByRarity.rare}`, inline: false }
                    );
                
                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }

            // ------------------- Deactivate Job Voucher -------------------
            if (thiefCharacter.jobVoucher) {
                const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
                if (!deactivationResult.success) {
                    console.error(`[steal.js]: Failed to deactivate job voucher for ${thiefCharacter.name}`);
                } else {
                    console.error(`[steal.js]: Job voucher deactivated for ${thiefCharacter.name}`);
                }
            }
        } catch (error) {
            handleError(error, 'steal.js');
            console.error('[steal.js]: Error executing command:', error);
            await interaction.editReply({ content: '❌ **An error occurred while processing the command.**', ephemeral: true });
        }
    },
};

