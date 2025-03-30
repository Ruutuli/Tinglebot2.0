// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ------------------- Local Module Imports -------------------
const { fetchCharacterByName, getCharacterInventoryCollection } = require('../database/characterService');
const { fetchItemsByIds, fetchItemRarityByName } = require('../database/itemService');
const { removeItemInventoryDatabase, addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { getNPCItems, NPCs } = require('../modules/stealingNPCSModule');
const { authorizeSheets, appendSheetData, isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const ItemModel = require('../models/ItemModel');

// ------------------- NPC Short Name to Full Name Mapping -------------------
// Maps shorthand NPC names to their full names.
const npcNameMapping = {
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

// ------------------- Rarity Weight Mappings -------------------
// Maps numeric rarity values to weights for random selection.
const rarityWeights = {
    '1': 20, '2': 18, '3': 15, '4': 13, '5': 11, '6': 9, '7': 7, '8': 5, '9': 2, '10': 1
};

// ------------------- Failure Chances Based on Tier -------------------
// A roll that is less than or equal to this value will be considered a failure.
// For example, for common items: failure if roll <= 10 (i.e. 1–10 fail, 11–99 succeed).
const failureChances = {
    common: 10,
    uncommon: 50,
    rare: 80
};

// ------------------- Success/Failure Chances Based on Tier -------------------
// Defines the percentage chance of a successful steal based on item tier.
const successChances = {
    common: 90,
    uncommon: 50,
    rare: 20
};

// ------------------- Slash Command Builder Setup -------------------
// Defines the /steal command options.
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
                .setAutocomplete(true)),

    // ------------------- Autocomplete for NPC Names -------------------
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase().trim();
            // Minimal logging for performance
            if (!npcNameMapping || Object.keys(npcNameMapping).length === 0) {
                return await interaction.respond([]);
            }
            const filteredNPCs = Object.keys(npcNameMapping)
                .filter(npc => npc.toLowerCase().includes(focusedValue))
                .slice(0, 25);
            await interaction.respond(filteredNPCs.map(npc => ({ name: npc, value: npc })));
        } catch (error) {
            console.error('[steal.js]: Error in autocomplete:', error);
            await interaction.respond([]);
        }
    },

    // ------------------- Main Execute Function -------------------
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });
        try {
            // ------------------- Retrieve Command Options -------------------
            const characterName = interaction.options.getString('charactername');
            const targetType = interaction.options.getString('targettype');
            const targetName = interaction.options.getString('target');
            const raritySelection = interaction.options.getString('rarity').toLowerCase();

            // ------------------- Fetch Thief Character -------------------
            const thiefCharacter = await fetchCharacterByName(characterName);
            if (!thiefCharacter) {
                return interaction.editReply({ content: '❌ **Thief character not found.**', ephemeral: true });
            }
            if (!thiefCharacter.inventorySynced) {
                return interaction.editReply({
                    content: `❌ **"${thiefCharacter.name}"'s inventory is not set up yet.** Use </testinventorysetup:ID> then </syncinventory:ID> to initialize.`,
                    ephemeral: true
                });
            }

            // ------------------- Handle NPC Stealing -------------------
            if (targetType === 'npc') {
                const mappedNPCName = npcNameMapping[targetName];
                if (mappedNPCName) {
                    // Fetch NPC's inventory (in-memory) and fetch item rarities concurrently.
                    const npcInventory = getNPCItems(mappedNPCName);
                    // Use Promise.all to get rarity for each item concurrently.
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
                            return { itemName, itemRarity, tier, weight: rarityWeights[itemRarity] };
                        })
                        .filter(item => item.tier === raritySelection);
                    
                    // ------------------- Fallback Logic for NPC Items -------------------
                    if (!filteredItems.length) {
                        let fallbackTier = (raritySelection === 'rare') ? 'uncommon' : (raritySelection === 'uncommon') ? 'common' : null;
                        if (fallbackTier) {
                            console.warn('[steal.js]: No items of requested rarity found; falling back to', fallbackTier);
                            let fallbackItems = await applyFallbackLogic(npcInventory, fallbackTier, fetchItemRarityByName);
                            if (fallbackItems.length > 0) {
                                filteredItems = fallbackItems;
                            } else {
                                let finalFallbackItems = await getFinalFallbackItems(npcInventory, fetchItemRarityByName);
                                if (finalFallbackItems.length > 0) {
                                    filteredItems = finalFallbackItems;
                                } else {
                                    return interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**`, ephemeral: true });

                                }
                            }
                        } else {
                            let finalFallbackItems = await getFinalFallbackItems(npcInventory, fetchItemRarityByName);
                            if (finalFallbackItems.length > 0) {
                                filteredItems = finalFallbackItems;
                            } else {
                                return interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**`, ephemeral: true });

                            }
                        }
                    }

                    const selectedItem = getRandomItemByWeight(filteredItems);
                    const roll = Math.floor(Math.random() * 99) + 1; // d99 roll
                    const failureThreshold = failureChances[selectedItem.tier]; // Failure threshold (e.g. 10 for common)
                    console.log(`[steal.js]: NPC Roll: ${roll}, Failure Threshold: ${failureThreshold} (roll <= threshold means failure)`);
                    if (roll <= failureThreshold) {
                        return interaction.editReply({ 
                            content: `❌ **Failed to steal from ${targetName}.** (Roll: ${roll} ≤ ${failureThreshold}) Better luck next time!`, 
                            ephemeral: true 
                        });
                    }
                    const quantityToSteal = determineStealQuantity(selectedItem);
                    // Remove the stolen item from NPC's in-memory inventory.
                    const npcItemIndex = npcInventory.indexOf(selectedItem.itemName);
                    if (npcItemIndex > -1) npcInventory.splice(npcItemIndex, 1);
                    else console.error('[steal.js]: NPC item not found.');
                    await addItemInventoryDatabase(thiefCharacter._id, selectedItem.itemName, quantityToSteal, interaction);

                    // ------------------- Log to Google Sheets for NPC -------------------
                    const thiefInventoryLink = thiefCharacter.inventory || thiefCharacter.inventoryLink;
                    if (isValidGoogleSheetsUrl(thiefInventoryLink)) {
                        const thiefSpreadsheetId = extractSpreadsheetId(thiefInventoryLink);
                        const auth = await authorizeSheets();
                        const range = 'loggedInventory!A2:M';
                        const uniqueSyncId = uuidv4();
                        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
                        // Get flavor text from the NPC module.
                        const npcFlavor = (NPCs[mappedNPCName] && NPCs[mappedNPCName].flavorText) || '';
                        const logValues = [[
                            thiefCharacter.name,
                            selectedItem.itemName,
                            quantityToSteal.toString(),
                            '', '', '',
                            `Stolen from NPC ${mappedNPCName}`,
                            thiefCharacter.job,
                            '',
                            thiefCharacter.currentVillage,
                            interactionUrl,
                            formattedDateTime,
                            uniqueSyncId
                        ]];                        
                        await appendSheetData(auth, thiefSpreadsheetId, range, logValues);
                    }

                    // ------------------- Send NPC Success Embed -------------------
                    return sendNPCStealEmbed(interaction, thiefCharacter, mappedNPCName, selectedItem.itemName, quantityToSteal, selectedItem, roll, failureThreshold);
                }
            }

            // ------------------- Handle Player Character Stealing -------------------
            const targetCharacter = await fetchCharacterByName(targetName);
            if (!targetCharacter) return interaction.editReply({ content: '❌ **Target character not found.**', ephemeral: true });
            if (thiefCharacter.inJail) return interaction.editReply({ content: `**${thiefCharacter.name}** is in jail for 24 hours and cannot steal!`, ephemeral: true });
            if (!targetCharacter.canBeStolenFrom) return interaction.editReply({ content: `⚠️ **${targetCharacter.name}** cannot be stolen from.`, ephemeral: true });
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
            const failureThresholdPlayer = failureChances[selectedItemPlayer.tier];
            console.log(`[steal.js]: Player Roll: ${rollPlayer}, Failure Threshold: ${failureThresholdPlayer} (roll <= threshold means failure)`);
            if (rollPlayer <= failureThresholdPlayer) {
                return handleFailedSteal(interaction, thiefCharacter, targetCharacter, selectedItemPlayer, rollPlayer, failureThresholdPlayer);
            } else {
                return handleSuccessfulSteal(interaction, thiefCharacter, targetCharacter, selectedItemPlayer, rollPlayer, failureThresholdPlayer);
            }
            
            
        } catch (error) {
            console.error('[steal.js]: Error executing /steal command:', error);
            await interaction.editReply({ content: '❌ **An error occurred while processing the steal attempt.**', ephemeral: true });
        }
    },
};

// ------------------- Helper Function: Get Item Emoji -------------------
// Retrieves the emoji for a given item name from the database.
async function getItemEmoji(itemName) {
    const item = await ItemModel.findOne({ itemName: new RegExp(`^${itemName}$`, 'i') }).select('emoji').exec();
    return item && item.emoji ? item.emoji : '';
}

// ------------------- Helper Function: Filter Items by Rarity -------------------
// Filters items based on their tier.
function filterItemsByRarity(items, raritySelection) {
    return items.filter(item => item.tier === raritySelection);
}

// ------------------- Helper Function: Determine Steal Quantity -------------------
// Determines quantity based on item's tier.
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

// ------------------- Updated Helper Function: Send NPC Steal Embed -------------------
// Sends a success embed for an NPC steal with enhanced information, including the roll outcome.
async function sendNPCStealEmbed(interaction, thiefCharacter, targetName, stolenItem, quantity, selectedItem, successRoll, failureThreshold) {
    // Compute the success rate as the complement of the failure threshold.
    const successRate = 100 - failureThreshold;
    // Build the success field string using the roll and outcome.
    const successField = `d99 => ${successRoll} = Success!`;
    
    // Fetch the item emoji from the database if not already present.
    const itemEmoji = selectedItem.emoji || await getItemEmoji(selectedItem.itemName);
    
    // Get flavor text from the NPC data.
    const npcFlavor = (NPCs[targetName] && NPCs[targetName].flavorText) || '';
    
    // Build the embed description using the thief's inventory link.
    const embedDescription = `[${thiefCharacter.name}](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) successfully stole from ${targetName}.\n\n${npcFlavor}`;
    
    // Build the success embed.
    const embed = new EmbedBuilder()
        .setColor('#AA926A') // Gold color
        .setTitle('💰 Item Stolen from NPC!')
        .setDescription(embedDescription)
        .addFields(
            { name: '__Stolen Item__', value: `> **${itemEmoji} ${stolenItem}** x**${quantity}**`, inline: false },
            { name: '__Success__', value: `> **${successField}**`, inline: false },
            { name: '__Item Rarity__', value: `> **${selectedItem.tier.toUpperCase()}**`, inline: false }
        )
        .setThumbnail('https://i.pinimg.com/736x/3b/fb/7b/3bfb7bd4ea33b017d58d289e130d487a.jpg') // Blank thumbnail placeholder
        .setAuthor({ name: thiefCharacter.name, iconURL: thiefCharacter.icon })
        .setFooter({ text: 'NPC theft successful!' })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setTimestamp();
    
    // Log detailed roll information for debugging.
    console.log(`[steal.js]: NPC Embed Debug -> Tier: ${selectedItem.tier}, Failure Threshold: ${failureThreshold}, Roll: ${successRoll}, Success Rate: ${successRate}%`);
    
    await interaction.editReply({ embeds: [embed], ephemeral: false });
}

// ------------------- Helper Function: Handle Successful Steal Attempt -------------------
// Processes a successful steal from a player, updates inventories, logs to sheets, and sends an enhanced embed.
async function handleSuccessfulSteal(interaction, thiefCharacter, targetCharacter, selectedItem, successRoll, successThreshold) {
    const quantityToSteal = determineStealQuantity(selectedItem);
    let flavorText = 'Nothing impressive today.';
    if (selectedItem.tier === 'common') {
        flavorText = 'Nothing impressive today.';
    } else if (selectedItem.tier === 'uncommon') {
        flavorText = 'Ooo not bad! This will be useful.';
    } else if (selectedItem.tier === 'rare') {
        flavorText = "What a find! You really scored with today's steal!";
    }

    // Remove item from target's inventory and add to thief's inventory.
    await removeItemInventoryDatabase(targetCharacter._id, selectedItem.itemName, quantityToSteal, interaction);
    await addItemInventoryDatabase(thiefCharacter._id, selectedItem.itemName, quantityToSteal, interaction);

    // ------------------- Log to Google Sheets for Player -------------------
    const thiefInventoryLink = thiefCharacter.inventory || thiefCharacter.inventoryLink;
    const targetInventoryLink = targetCharacter.inventory || targetCharacter.inventoryLink;
    if (isValidGoogleSheetsUrl(thiefInventoryLink) && isValidGoogleSheetsUrl(targetInventoryLink)) {
        const thiefSpreadsheetId = extractSpreadsheetId(thiefInventoryLink);
        const targetSpreadsheetId = extractSpreadsheetId(targetInventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${selectedItem.itemName}$`, 'i') }).exec();
        const category = itemDetails && itemDetails.category ? (Array.isArray(itemDetails.category) ? itemDetails.category.join(', ') : itemDetails.category) : '';
        const type = itemDetails && itemDetails.type ? (Array.isArray(itemDetails.type) ? itemDetails.type.join(', ') : itemDetails.type) : '';
        const subtype = itemDetails && itemDetails.subtype ? (Array.isArray(itemDetails.subtype) ? itemDetails.subtype.join(', ') : itemDetails.subtype) : '';
        const thiefValues = [[
            thiefCharacter.name,
            selectedItem.itemName,
            quantityToSteal.toString(),
            category,
            type,
            subtype,
            `Stolen from ${targetCharacter.name}`,
            thiefCharacter.job,
            '',
            thiefCharacter.currentVillage,
            interactionUrl,
            formattedDateTime,
            uniqueSyncId
        ]];
        const targetValues = [[
            targetCharacter.name,
            selectedItem.itemName,
            (-quantityToSteal).toString(),
            category,
            type,
            subtype,
            `Item stolen by ${thiefCharacter.name}`,
            targetCharacter.job,
            '',
            targetCharacter.currentVillage,
            interactionUrl,
            formattedDateTime,
            uniqueSyncId
        ]];
        await appendSheetData(auth, thiefSpreadsheetId, range, thiefValues);
        await appendSheetData(auth, targetSpreadsheetId, range, targetValues);
    }

    // ------------------- Create Enhanced Success Embed for Player -------------------
    // Compute the success field using the player's roll.
    const successField = `d99 => ${Math.floor(successRoll)} = Success!`;
    
    // Fetch emoji for the stolen item.
    const itemEmoji = selectedItem.emoji || await getItemEmoji(selectedItem.itemName);
    
    const successEmbed = new EmbedBuilder()
    .setColor('#AA926A')
    .setTitle('💰 Item Stolen!')
    .setDescription(`[${thiefCharacter.name}](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) successfully stole from [${targetCharacter.name}](${targetCharacter.inventory || targetCharacter.inventoryLink}).`)
    .addFields(
        { name: '__Stolen Item__', value: `> **${itemEmoji} ${selectedItem.itemName}** x**${quantityToSteal}**`, inline: false },
        { name: '__Roll__', value: `> **${successField}**`, inline: false },
        { name: '__Item Rarity__', value: `> **${selectedItem.tier.toUpperCase()}**`, inline: false },
        { name: '__Flavor__', value: `> **${flavorText}**`, inline: false }
    )
    .setThumbnail(targetCharacter.icon) // <-- added victim thumbnail
    .setAuthor({ name: thiefCharacter.name, iconURL: thiefCharacter.icon })
    .setFooter({ text: 'Inventory theft successful!', iconURL: targetCharacter.icon })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setTimestamp();

    
    console.log(`[steal.js]: Player Success Embed Debug -> Tier: ${selectedItem.tier}, Failure Threshold: ${successThreshold}, Roll: ${Math.floor(successRoll)}`);
    
    await interaction.editReply({
        content: `Hey! <@${targetCharacter.userId}>! Your character **${targetCharacter.name}** was stolen from!`,
        embeds: [successEmbed],
        ephemeral: false
    });
}

// ------------------- Helper Function: Get Random Item by Weight -------------------
// Selects a random item based on weighted probabilities.
function getRandomItemByWeight(items) {
    const totalWeight = items.reduce(
        (acc, item) => acc + (item.weight !== undefined ? item.weight : rarityWeights[item.itemRarity]),
        0
    );
    let randomValue = Math.random() * totalWeight;
    for (const item of items) {
        const currentWeight = item.weight !== undefined ? item.weight : rarityWeights[item.itemRarity];
        randomValue -= currentWeight;
        if (randomValue <= 0) return item;
    }
    return null;
}

// ------------------- Helper Function: Get Filtered Items by Rarity -------------------
// Retrieves a character's inventory from the database and filters by rarity.
async function getFilteredItemsByRarity(targetCharacter, raritySelection) {
    const targetInventory = await getCharacterInventoryCollection(targetCharacter.name);
    const items = await targetInventory.find({ characterId: targetCharacter._id }).toArray();
    
    if (!items || items.length === 0) {
        console.error(`[getFilteredItemsByRarity] No inventory items found for character "${targetCharacter.name}".`);
        return [];
    }
    
    // Filter out items missing an itemId and log a warning.
    const validItems = items.filter(item => {
        if (!item.itemId) {
            console.error(`[getFilteredItemsByRarity] Inventory item is missing itemId: ${JSON.stringify(item)}`);
            return false;
        }
        return true;
    });
    
    const itemIds = validItems.map(item => item.itemId);
    const dbItems = await fetchItemsByIds(itemIds);
    
    const filtered = validItems.map(item => {
        // Ensure both item.itemId and dbItem._id can be converted to strings
        let dbItem;
        try {
            dbItem = dbItems.find(dbItem => dbItem._id.toString() === item.itemId.toString());
        } catch (err) {
            console.error(`[getFilteredItemsByRarity] Error converting itemId to string for item: ${JSON.stringify(item)} - ${err.message}`);
            return null;
        }
        
        if (!dbItem) {
            console.error(`[getFilteredItemsByRarity] No matching database item found for inventory item with itemId: ${item.itemId}`);
            return null;
        }
        
        const rarity = dbItem.itemRarity || 1;
        const weight = rarityWeights[rarity] || 1;
        let tier = 'common';
        if (rarity >= 8) tier = 'rare';
        else if (rarity >= 5) tier = 'uncommon';
        
        return { ...item, weight, tier, itemRarity: rarity };
    }).filter(item => item && item.tier === raritySelection);
    
    if (filtered.length === 0) {
        console.error(`[getFilteredItemsByRarity] No items of rarity "${raritySelection}" found for character "${targetCharacter.name}". Check that inventory items have valid itemId values.`);
    }
    
    return filtered;
}


// ------------------- Updated Helper Function: Handle Failed Steal Attempt -------------------
// Processes a failed steal attempt, updates the thief's failure count, and sends a detailed failure embed.
async function handleFailedSteal(interaction, thiefCharacter, targetCharacter, selectedItem, roll, failureThreshold) {
    // Increment failure count.
    thiefCharacter.failedStealAttempts += 1;
    
    // Check if failure count has reached 3, then jail the character.
    if (thiefCharacter.failedStealAttempts >= 3) {
        thiefCharacter.inJail = true;
        const jailDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const releaseTime = new Date(Date.now() + jailDuration);
        thiefCharacter.jailReleaseTime = releaseTime;
        await thiefCharacter.save();
        
        const jailEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Townhall Justice')
            .setDescription(`The townhall has finally caught you for crimes of theft! You have been put in jail for 24 hours!`)
            .addFields(
                { name: 'Release Time (EST)', value: `> <t:${Math.floor(releaseTime.getTime() / 1000)}:F>`, inline: false }
            )
            .setThumbnail(thiefCharacter.icon)
            .setImage('https://static.wikia.nocookie.net/zelda_gamepedia_en/images/1/1c/Jail.jpg/revision/latest/scale-to-width-down/1000?cb=20110122024713&format=original')
            .setTimestamp();
        
        return interaction.editReply({
            embeds: [jailEmbed],
            ephemeral: true
        });
    }
    
    await thiefCharacter.save();

    const itemEmoji = selectedItem.emoji || await getItemEmoji(selectedItem.itemName);

const failEmbed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('💢 Failed Steal Attempt!')
    .setDescription(`[${thiefCharacter.name}](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) tried to steal from [${targetCharacter.name}](${targetCharacter.inventory || targetCharacter.inventoryLink}) but was caught red-handed!`)
    .addFields(
        { name: '__Attempted Item__', value: `> **${itemEmoji} ${selectedItem.itemName}**`, inline: false },
        { name: '__Roll__', value: `> d99 => ${roll} = Failure!`, inline: false },
        { name: '__Item Rarity__', value: `> **${selectedItem.tier.toUpperCase()}**`, inline: false },
        { name: '__Failure Count__', value: `> **${thiefCharacter.failedStealAttempts}**`, inline: false }
    )
    .setThumbnail(targetCharacter.icon)
    .setAuthor({ name: thiefCharacter.name, iconURL: thiefCharacter.icon })
    .setFooter({ text: 'Steal attempt failed!', iconURL: targetCharacter.icon })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setTimestamp();
    
return interaction.editReply({
    content: `❌ **Steal failed!** <@${targetCharacter.userId}>, your character was almost a victim of theft!`,
    embeds: [failEmbed],
    ephemeral: false
});
}

// ------------------- Helper Function: Apply Fallback Logic -------------------
// Returns fallback items for a given inventory list and fallback tier.
async function applyFallbackLogic(inventoryList, fallbackTier, fetchRarityFn) {
    let fallbackItems = [];
    for (const itemName of inventoryList) {
        const itemRarity = await fetchRarityFn(itemName);
        if (itemRarity) {
            if (fallbackTier === 'uncommon' && itemRarity >= 5 && itemRarity <= 7) {
                fallbackItems.push({ itemName, itemRarity, tier: 'uncommon', weight: rarityWeights[itemRarity] });
            } else if (fallbackTier === 'common' && itemRarity >= 1 && itemRarity <= 4) {
                fallbackItems.push({ itemName, itemRarity, tier: 'common', weight: rarityWeights[itemRarity] });
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
            finalFallbackItems.push({ itemName, itemRarity, tier, weight: rarityWeights[itemRarity] });
        }
    }
    return finalFallbackItems;
}

// ------------------- End of Module Exports -------------------
// Exports all functionalities related to the /steal command.
