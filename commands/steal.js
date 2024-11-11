// ------------------- Imports and module setup -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchCharacterByName } = require('../database/characterService');
const { fetchItemsByIds, fetchItemRarityByName } = require('../database/itemService');
const { removeItemInventoryDatabase, addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { getNPCItems } = require('../modules/stealingNPCSModule');

// ------------------- NPC Short Name to Full Name Mapping -------------------
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
    'Lil Tim': 'Lil Tim' // Clarified as a cucco, not a person
};

// ------------------- Rarity weight mappings -------------------
const rarityWeights = {
    '1': 20, '2': 18, '3': 15, '4': 13, '5': 11, '6': 9, '7': 7, '8': 5, '9': 2, '10': 1
};

// ------------------- Success/Fail chances based on rarity -------------------
const successChances = {
    common: 90,   // 90% success for common items
    uncommon: 50, // 50/50 for uncommon items
    rare: 20      // 20% chance for rare items
};

// ------------------- Slash Command Builder Setup -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Steal an item from another character or NPC.')
        .addStringOption(option =>
            option.setName('charactername')
                .setDescription('The name of the character attempting to steal')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('targettype')
                .setDescription('The type of target (player or npc)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('target')
                .setDescription('The name of the target character or NPC to steal from')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('rarity')
                .setDescription('The rarity of the item to steal')
                .setRequired(true)
                .setAutocomplete(true)),

    // ------------------- Autocomplete for NPC names -------------------
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        // Filter NPC names based on user input
        const filtered = Object.keys(npcNameMapping).filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));

        // Send filtered response for autocomplete
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice }))
        );
    },

    // ------------------- Main Execute Function -------------------
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const characterName = interaction.options.getString('charactername');
            const targetType = interaction.options.getString('targettype'); // New target type parameter
            const targetName = interaction.options.getString('target');
            const raritySelection = interaction.options.getString('rarity').toLowerCase();

            // ------------------- Fetch the thief character -------------------
            const thiefCharacter = await fetchCharacterByName(characterName);
            if (!thiefCharacter) {
                return interaction.editReply({ content: '❌ Thief character not found.', ephemeral: true });
            }

            // ------------------- Handle NPC stealing -------------------
            if (targetType === 'npc') {
                const mappedNPCName = npcNameMapping[targetName]; // Use the mapping directly
                if (mappedNPCName) {
                    console.log(`Target NPC found: ${mappedNPCName}`);

                    // Fetch NPC items directly
                    const npcInventory = getNPCItems(mappedNPCName);
                    console.log(`NPC Inventory for ${mappedNPCName}:`, npcInventory);

                    // Filter items by rarity and log each item's rarity
                    const filteredItems = [];
                    for (const itemName of npcInventory) {
                        const itemRarity = await fetchItemRarityByName(itemName);
                        console.log(`Item: ${itemName}, Rarity: ${itemRarity}`);
                        if (itemRarity && raritySelection === 'common' && itemRarity >= 1 && itemRarity <= 4) {
                            filteredItems.push({ itemName, itemRarity }); // Store as object
                        } else if (itemRarity && raritySelection === 'uncommon' && itemRarity >= 5 && itemRarity <= 7) {
                            filteredItems.push({ itemName, itemRarity }); // Store as object
                        } else if (itemRarity && raritySelection === 'rare' && itemRarity >= 8 && itemRarity <= 10) {
                            filteredItems.push({ itemName, itemRarity }); // Store as object
                        }
                    }
                    console.log(`Filtered items for ${raritySelection} rarity:`, filteredItems);

                    if (!filteredItems.length) {
                        console.log(`No items of ${raritySelection} rarity found for ${mappedNPCName}`);
                        return interaction.editReply({ content: `❌ No items of ${raritySelection} rarity found for **${targetName}**.`, ephemeral: true });
                    }

                    // Random item selection based on rarity weight
                    const selectedItem = getRandomItemByWeight(filteredItems);
                    console.log(`Selected item:`, selectedItem);

                    // Random chance logic based on rarity
                    const successRoll = Math.random() * 100;
                    const successThreshold = successChances[selectedItem.itemRarity.toString()]; // Use itemRarity property
                    console.log(`Success roll: ${successRoll}, Success threshold: ${successThreshold}`);

                    if (successRoll > successThreshold) {
                        return interaction.editReply({ content: `❌ Failed to steal from **${targetName}**. Better luck next time!`, ephemeral: true });
                    }

                    // Determine quantity to steal
                    let quantityToSteal = determineStealQuantity(selectedItem);
                    console.log(`Quantity to steal: ${quantityToSteal}`);

                    // Log the steal action and update the NPC's inventory
                    await removeItemInventoryDatabase(mappedNPCName, selectedItem.itemName, quantityToSteal, interaction);
                    await addItemInventoryDatabase(thiefCharacter._id, selectedItem.itemName, quantityToSteal, interaction);

                    // Send success response with embedded message
                    return sendNPCStealEmbed(interaction, thiefCharacter, mappedNPCName, selectedItem.itemName, quantityToSteal);
                } else {
                    return interaction.editReply({ content: `❌ NPC **${targetName}** not found.`, ephemeral: true });
                }
            }

            // ------------------- Handle Player Character stealing -------------------
            const targetCharacter = await fetchCharacterByName(targetName);
            if (!targetCharacter) {
                return interaction.editReply({ content: '❌ Target character not found.', ephemeral: true });
            }

            // ------------------- Jail check for thief character -------------------
            if (thiefCharacter.inJail) {
                return interaction.editReply({ content: `🚔 **${thiefCharacter.name}** is in jail and cannot steal!`, ephemeral: true });
            }

            // ------------------- Check if the target can be stolen from -------------------
            if (!targetCharacter.canBeStolenFrom) {
                return interaction.editReply({ content: `⚠️ **${targetCharacter.name}** cannot be stolen from.`, ephemeral: true });
            }

            // ------------------- Fetch and filter items by rarity -------------------
            const filteredItems = await getFilteredItemsByRarity(targetCharacter, raritySelection);
            if (!filteredItems.length) {
                return interaction.editReply({ content: `❌ No items of ${raritySelection} rarity found in **${targetCharacter.name}'s** inventory.`, ephemeral: true });
            }

            // ------------------- Random item selection logic -------------------
            const selectedItem = getRandomItemByWeight(filteredItems);
            const successRoll = Math.random() * 100;
            const successThreshold = successChances[selectedItem.tier];

            // ------------------- Steal success or failure handling -------------------
            if (successRoll > successThreshold) {
                return handleFailedSteal(interaction, thiefCharacter, targetCharacter, selectedItem);
            } else {
                return handleSuccessfulSteal(interaction, thiefCharacter, targetCharacter, selectedItem);
            }
        } catch (error) {
            console.error('Error executing /steal command:', error);
            await interaction.editReply({ content: '❌ An error occurred while processing the steal attempt.', ephemeral: true });
        }
    },
};

// ------------------- Helper Function: Filter Items by Rarity -------------------
function filterItemsByRarity(items, raritySelection) {
    return items.filter(item => item.tier === raritySelection);
}

// ------------------- Helper Function: Determine Steal Quantity -------------------
function determineStealQuantity(item) {
    let quantityToSteal = 1;

    if (item.tier === 'common') {
        quantityToSteal = Math.min(item.quantity, Math.floor(Math.random() * 3) + 1);
    } else if (item.tier === 'uncommon') {
        quantityToSteal = Math.min(item.quantity, Math.floor(Math.random() * 2) + 1);
    } else if (item.tier === 'rare') {
        quantityToSteal = 1; // Rare items: only 1 can be stolen
    }

    return quantityToSteal;
}

// ------------------- Helper Function: Send NPC Steal Embed -------------------
async function sendNPCStealEmbed(interaction, thiefCharacter, targetName, stolenItem, quantity) {
    const embed = new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('💰 Item Stolen from NPC!')
        .setDescription(`**${thiefCharacter.name}** successfully stole from **${targetName}**.`)
        .addFields(
            { name: 'Stolen Item', value: `${stolenItem} x${quantity}`, inline: false }
        )
        .setAuthor({ name: `${thiefCharacter.name}`, iconURL: thiefCharacter.icon })
        .setFooter({ text: 'NPC theft successful!' })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed],
        ephemeral: false
    });
}

// ------------------- Helper Function: Get Random Item by Weight -------------------
function getRandomItemByWeight(items) {
    const totalWeight = items.reduce((acc, item) => acc + rarityWeights[item.itemRarity], 0); // Use itemRarity for weight
    let randomValue = Math.random() * totalWeight;

    // Select an item based on weight
    for (const item of items) {
        randomValue -= rarityWeights[item.itemRarity]; // Use itemRarity for weight
        if (randomValue <= 0) {
            return item; // Return the selected item
        }
    }
    return null; // Return null if no item is selected (this shouldn't happen)
}

// ------------------- Helper Function: Get Filtered Items by Rarity -------------------
async function getFilteredItemsByRarity(targetCharacter, raritySelection) {
    const targetInventory = await getCharacterInventoryCollection(targetCharacter.name);
    const items = await targetInventory.find({ characterId: targetCharacter._id }).toArray();
    const itemIds = items.map(item => item.itemId);
    const dbItems = await fetchItemsByIds(itemIds);

    return items.map(item => {
        const dbItem = dbItems.find(dbItem => dbItem._id.toString() === item.itemId.toString());
        const rarity = dbItem?.itemRarity || 1;
        const weight = rarityWeights[rarity] || 1;
        let tier = 'common';
        if (rarity >= 8) tier = 'rare';
        else if (rarity >= 5) tier = 'uncommon';
        return { ...item, weight, tier, itemRarity: rarity };
    }).filter(item => item.tier === raritySelection);
}

// ------------------- Helper Function: Handle Failed Steal Attempt -------------------
async function handleFailedSteal(interaction, thiefCharacter, targetCharacter, selectedItem) {
    thiefCharacter.failedStealAttempts += 1;

    if (thiefCharacter.failedStealAttempts >= 3) {
        thiefCharacter.inJail = true;
        thiefCharacter.jailReleaseTime = new Date(Date.now() + 1 * 60 * 60 * 1000); // Jail for 1 hour
        await thiefCharacter.save();
        return interaction.editReply({
            content: `🚔 **${thiefCharacter.name}** failed 3 times and is now in jail for 1 hour!`,
            ephemeral: true
        });
    }

    await thiefCharacter.save();

    const failEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('💢 Failed Steal Attempt!')
        .setDescription(`**${thiefCharacter.name}** tried to steal from **${targetCharacter.name}** but failed!`)
        .addFields(
            { name: 'Attempted to Steal', value: `${selectedItem.itemName}`, inline: false },
            { name: 'Outcome', value: 'Looks like your fingers weren’t fast enough this time...', inline: false }
        )
        .setAuthor({ name: `${thiefCharacter.name}`, iconURL: thiefCharacter.icon })
        .setFooter({ text: 'Steal attempt failed!', iconURL: targetCharacter.icon })
        .setTimestamp();

    return interaction.editReply({
        content: `❌ **Steal failed!** This is failure #${thiefCharacter.failedStealAttempts}.`,
        embeds: [failEmbed],
        ephemeral: false
    });
}

// ------------------- Helper Function: Handle Successful Steal Attempt -------------------
async function handleSuccessfulSteal(interaction, thiefCharacter, targetCharacter, selectedItem) {
    let quantityToSteal = determineStealQuantity(selectedItem);
    let flavorText = 'Nothing impressive today.';

    if (selectedItem.tier === 'common') {
        flavorText = 'Nothing impressive today.';
    } else if (selectedItem.tier === 'uncommon') {
        flavorText = 'Ooo not bad! This will be useful.';
    } else if (selectedItem.tier === 'rare') {
        flavorText = "What a find! You really scored with today's steal!";
    }

    await removeItemInventoryDatabase(targetCharacter._id, selectedItem.itemName, quantityToSteal, interaction);
    await addItemInventoryDatabase(thiefCharacter._id, selectedItem.itemName, quantityToSteal, interaction);

    const successEmbed = new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('💰 Item Stolen!')
        .setDescription(`**[${thiefCharacter.name}](${thiefCharacter.inventory})** successfully stole from **[${targetCharacter.name}](${targetCharacter.inventory})**.`)
        .addFields(
            { name: 'Stolen Item', value: `${selectedItem.itemName} x${quantityToSteal}`, inline: false },
            { name: 'Flavor Text', value: `${flavorText}`, inline: false }
        )
        .setAuthor({ name: `${thiefCharacter.name}`, iconURL: thiefCharacter.icon })
        .setFooter({ text: 'Inventory theft successful!', iconURL: targetCharacter.icon })
        .setTimestamp();

    await interaction.editReply({
        content: `Hey! <@${targetCharacter.userId}>! Your character **${targetCharacter.name}** was stolen from!`,
        embeds: [successEmbed],
        ephemeral: false
    });
}
