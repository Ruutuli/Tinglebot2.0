// ------------------- Import necessary modules -------------------
const { recoverHearts, useStamina, useHearts, updateCurrentHearts, handleKO } = require('../modules/characterStatsModule');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { fetchAllItems, fetchItemsByMonster } = require('../database/itemService');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { v4: uuidv4 } = require('uuid');
const { EmbedBuilder } = require('discord.js');
const { createWeightedItemList, calculateFinalValue } = require('../modules/rngModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule');
const { createMonsterEncounterEmbed, createKOEmbed } = require('../embeds/mechanicEmbeds');

// ------------------- Handles travel interaction -------------------
// This function handles all travel-related interactions, including fighting, gathering, fleeing, etc.
async function handleTravelInteraction(interaction, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog) {
    try {
        if (interaction.isButton) {
            await interaction.deferUpdate(); // Ensure the interaction is deferred to avoid timeout errors
        } else {
            await interaction.deferReply();
        }

        const customId = interaction.customId;
        let decision = '';
        let outcomeMessage = '';
        const tier = monster ? monster.tier : null;

        let heartsLost = 0;
        let heartsGained = 0;
        let staminaLost = 0;

        // Handle different travel choices based on customId
        if (customId === 'recover') {
            if (character.currentStamina >= 1 && character.currentHearts < character.maxHearts) {
                await recoverHearts(character._id, 1);
                character.currentHearts = Math.min(character.currentHearts + 1, character.maxHearts);
                await useStamina(character._id, 1);
                decision = `💖 ${character.name} recovered a heart.`;
                outcomeMessage = `${character.name} decided to recover a heart (-1 stamina) / (+1 heart)`;
                heartsGained = 1;
                staminaLost = 1;
            }
        } else if (customId === 'gather') {
            // Handle gathering resources
            const items = await fetchAllItems();
            const availableItems = items.filter(item => item[currentPath]);
            if (availableItems.length > 0) {
                const weightedItems = createWeightedItemList(availableItems);
                const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
                await addItemInventoryDatabase(character._id, randomItem.itemName, 1, randomItem.category.join(', '), randomItem.type.join(', '), interaction);

                // Sync the gathered item with Google Sheets
                const inventoryLink = character.inventory || character.inventoryLink;
                if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
                    const spreadsheetId = extractSpreadsheetId(inventoryLink);
                    const auth = await authorizeSheets();
                    const range = 'loggedInventory!A2:M';
                    const uniqueSyncId = uuidv4();
                    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                    const values = [[
                        character.name,                    // Character Name
                        randomItem.itemName,               // Item Name
                        (randomItem.quantity || 1).toString(),    // Quantity
                        randomItem.category.join(', '),    // Category
                        randomItem.type.join(', '),        // Type
                        randomItem.subtype || '',          // Subtype
                        'Gathered',                        // Obtain method
                        character.job,                     // Job
                        '',                                // Perk
                        character.currentVillage,          // Location
                        interactionUrl,                    // Link
                        formattedDateTime,                 // Date/Time
                        uniqueSyncId                       // Synced ID
                    ]];

                    await appendSheetData(auth, spreadsheetId, range, values);
                }

                const itemEmoji = randomItem.emoji || ''; // Use the item's emoji if available
                await useStamina(character._id, 1);
                character.currentStamina -= 1;
                decision = `🌿 ${character.name} gathered resources and found a ${itemEmoji} ${randomItem.itemName}.`;
                outcomeMessage = `${character.name} gathered resources and found ${itemEmoji} ${randomItem.itemName} (-1 stamina)`;
                staminaLost = 1;
            } else {
                decision = `No resources found to gather on this path.`;
                outcomeMessage = `Tingle tried to gather resources but found nothing.`;
            }
        } else if (customId === 'do_nothing') {
            decision = `✨ ${character.name} did nothing.`;
            outcomeMessage = `${character.name} decided not to do anything today and just made camp.`;
          } else if (customId === 'fight') {
            // Handle fight logic
            const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

            const encounterOutcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

            if (encounterOutcome.result === 'KO') {
                const embed = createKOEmbed(character);
                await interaction.followUp({ embeds: [embed] });
                decision = `KO'd during the fight.`;
                outcomeMessage = `💀 ${character.name} was KO'd during the fight and wakes up in their origin village with 0 hearts and 0 stamina.`;
                heartsLost = character.currentHearts;
                staminaLost = character.currentStamina;
                character.currentHearts = 0;
                character.currentStamina = 0;
                await updateCurrentHearts(character._id, character.currentHearts);
                await useStamina(character._id, character.currentStamina);
                await handleKO(character._id);
            } else {
                await useHearts(character._id, encounterOutcome.hearts);
                character.currentHearts = Math.max(0, character.currentHearts - encounterOutcome.hearts);
                heartsLost = encounterOutcome.hearts;
                if (encounterOutcome.result === 'Win!/Loot') {
                    const items = await fetchItemsByMonster(monster.name);
                    const weightedItems = createWeightedItemList(items, adjustedRandomValue);
                    const lootedItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

                    // Special logic for Chuchus
                    if (monster.name.includes("Chuchu")) {
                        const jellyType = monster.name.includes("Ice") ? 'White Chuchu Jelly'
                            : monster.name.includes("Fire") ? 'Red Chuchu Jelly'
                                : monster.name.includes("Electric") ? 'Yellow Chuchu Jelly'
                                    : 'Chuchu Jelly';
                        const quantity = monster.name.includes("Large") ? 3
                            : monster.name.includes("Medium") ? 2
                                : 1;
                        lootedItem.itemName = jellyType;
                        lootedItem.quantity = quantity;
                    } else {
                        lootedItem.quantity = 1;
                    }

                    await addItemInventoryDatabase(character._id, lootedItem.itemName, lootedItem.quantity, lootedItem.category.join(', '), lootedItem.type.join(', '), interaction);

                    // Sync looted item with Google Sheets
                    const inventoryLink = character.inventory || character.inventoryLink;
                    if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
                        const spreadsheetId = extractSpreadsheetId(inventoryLink);
                        const auth = await authorizeSheets();
                        const range = 'loggedInventory!A2:M';
                        const uniqueSyncId = uuidv4();
                        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                        const values = [[
                            character.name,                    // Character Name
                            lootedItem.itemName,               // Item Name
                            (lootedItem.quantity || 1).toString(),    // Quantity
                            lootedItem.category.join(', '),    // Category
                            lootedItem.type.join(', '),        // Type
                            lootedItem.subtype || '',          // Subtype
                            'Looted',                          // Obtain method
                            character.job,                     // Job
                            '',                                // Perk
                            character.currentVillage,          // Location
                            interactionUrl,                    // Link
                            formattedDateTime,                 // Date/Time
                            uniqueSyncId                       // Synced ID
                        ]];

                        await appendSheetData(auth, spreadsheetId, range, values);
                    }

                    const itemEmoji = lootedItem.emoji || ''; // Use the item's emoji if available
                    outcomeMessage = generateVictoryMessage(adjustedRandomValue, defenseSuccess, attackSuccess) + ` ${character.name} looted a ${itemEmoji} ${lootedItem.itemName}.`;
                    decision = `⚔️ Fought the monster and won! Looted ${itemEmoji} ${lootedItem.itemName}.`;
                } else {
                    decision = `⚔️ Fought the monster and lost ${encounterOutcome.hearts} hearts.`;
                    outcomeMessage = generateDamageMessage(encounterOutcome.hearts);
                }
            }
        } else if (customId === 'flee') {
            // Handle flee logic
            decision = `💨 Fled from the monster.`;
            outcomeMessage = `${character.name} fled from ${monster.name}.`;
        }

        // Validate hearts to prevent NaN errors
        if (isNaN(character.currentHearts)) {
            console.error(`character.currentHearts is NaN. Setting to 0. Character: ${character.name}`);
            character.currentHearts = 0;
        }

        let description = '';
        if (customId === 'recover' || customId === 'gather' || customId === 'do_nothing') {
            description = `Tingle is traveling\n🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${outcomeMessage}`;
        } else if (customId === 'fight' || customId === 'flee') {
            description = `Tingle encountered a ${monster.name}! What will you do?`;
        }

        description += `\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;

        // Update the encounter embed
        const embedData = encounterMessage.embeds[0].toJSON();
        const updatedEmbed = new EmbedBuilder(embedData)
            .setDescription(description);

        // Only add outcome field for monster encounters
        if (customId === 'fight' || customId === 'flee') {
            if (!updatedEmbed.data.fields) {
                updatedEmbed.data.fields = [];
            }

            const outcomeField = updatedEmbed.data.fields.find(field => field.name === '🔹 __Outcome__');
            if (outcomeField) {
                outcomeField.value = outcomeMessage;
            } else {
                updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
            }

            if (tier !== null) {
                updatedEmbed.setFooter({ text: `Tier: ${tier}` });
            }
        }

        await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });

        // Update the travel log
        if (heartsLost > 0 || heartsGained > 0 || staminaLost > 0) {
            let logSummary = '';
            if (heartsLost > 0) logSummary += `- Lost ${heartsLost} Hearts\n`;
            if (heartsGained > 0) logSummary += `- Gained ${heartsGained} Hearts\n`;
            if (staminaLost > 0) logSummary += `- Lost ${staminaLost} Stamina\n`;
            travelLog.push(logSummary.trim());
        }

        return decision;
    } catch (error) {
        console.error(`❌ Error during travel interaction handling: ${error.message}`, error);
        throw error;
    }
}

module.exports = { handleTravelInteraction };
