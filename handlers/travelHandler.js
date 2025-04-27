// ------------------- Standard Libraries -------------------
// Third-party libraries such as uuid for generating unique IDs.
const { v4: uuidv4 } = require('uuid');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Discord.js Components -------------------
// Discord.js classes used to build and update embeds.
const { EmbedBuilder } = require('discord.js');

// ------------------- Database Services -------------------
// Service functions that interact with the database for item-related operations.
const { fetchAllItems, fetchItemsByMonster } = require('../database/db');

// ------------------- Embeds -------------------
// Functions to create mechanic-related embed messages.
const { createKOEmbed } = require('../embeds/embeds');

// ------------------- Modules -------------------
// Functions from various modules to handle character stats, RNG, damage, flavor text, and job perks.

// Character stats module: functions to recover hearts, update hearts, use hearts/stamina, and handle KO.
const { recoverHearts, updateCurrentHearts, useHearts, useStamina } = require('../modules/characterStatsModule');

// RNG module: functions to calculate fight values, attempt to flee, and create a weighted list of items.
const { calculateFinalValue, attemptFlee, createWeightedItemList } = require('../modules/rngModule');

// Damage module: function to determine encounter outcome based on fight calculations.
const { getEncounterOutcome } = require('../modules/damageModule');

// Flavor text module: functions to generate damage and victory messages.
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule');

// Jobs module: functions to get job perks and check if a character has a perk.
const { getJobPerk, hasPerk } = require('../modules/jobsModule');


// ------------------- Utility Functions -------------------
// Helper functions for inventory management and Google Sheets integration, plus validation.

// Inventory utility: add an item to the character's inventory in the database.
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');

// Google Sheets utilities: functions for appending data and authorizing access.
const { appendSheetData, authorizeSheets, safeAppendDataToSheet, } = require('../utils/googleSheetsUtils');

// Validation utilities: functions to extract spreadsheet IDs and validate Google Sheets URLs.
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');


// ------------------- Travel Interaction Handler -------------------
// This function handles all travel-related interactions (recover, gather, do nothing, fight, flee)
// by processing the user's button interactions and updating character stats, inventory, and embeds accordingly.
async function handleTravelInteraction(interaction, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog) {
    try {
        // ------------------- Defer Interaction Handling -------------------
        // Ensure that the interaction is deferred to allow asynchronous processing.
        if (interaction.isButton()) {
            await interaction.deferUpdate();
        } else if (interaction.isCommand()) {
            await interaction.deferReply();
        } else {
            throw new Error(`Unsupported interaction type: ${interaction.type}`);
        }

        // ------------------- Set Character Perk Based on Job -------------------
        // Dynamically retrieve and set the character's perk from their job.
        const jobPerk = getJobPerk(character.job);
        character.perk = jobPerk ? jobPerk.perks[0] : undefined;
        console.log(`[travelHandler.js]: Job Perk for ${character.name}: ${character.perk || 'None'}`);

        // ------------------- Initialize Variables -------------------
        const customId = interaction.customId;
        let decision = '';
        let outcomeMessage = '';
        let heartsLost = 0;
        let heartsGained = 0;
        let staminaLost = 0;

        // ------------------- Handle Recover Hearts Action -------------------
// ------------------- Handle Recover Hearts Action -------------------
if (customId === 'recover') {
    console.log(`[travelHandler.js]: Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Recover Hearts`);

    // ------------------- KO Check -------------------
    if (character.ko) {
        const errorMsg = `❌ ${character.name} is KO'd and cannot heal without a healer.`;
        console.error(`[travelHandler.js]: ${errorMsg}`);
        
        await encounterMessage.edit({
            embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON())
                .setDescription(`💀 ${character.name} is knocked out and cannot recover hearts without a healer.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`)],
            components: [] // Remove buttons
        });

        return; // Stop execution
    }

    if (character.currentStamina >= 1 || character.perk === 'DELIVERING') { // Allow action even if DELIVERING perk is active.
        if (character.currentHearts < character.maxHearts) {
            if (character.perk !== 'DELIVERING') { // Deduct stamina only if not preserving via DELIVERING perk.
                await useStamina(character._id, 1);
                character.currentStamina -= 1;
                staminaLost = 1;
            } else {
                console.log(`[travelHandler.js]: Stamina preserved for ${character.name} due to DELIVERING perk`);
            }
            await recoverHearts(character._id, 1);
            character.currentHearts = Math.min(character.currentHearts + 1, character.maxHearts);


                    decision = `💖 ${character.name} recovered a heart. ${character.perk === 'DELIVERING' ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'}`;
                    outcomeMessage = `${character.name} decided to recover a heart ${character.perk === 'DELIVERING' ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'}`;
                } else {
                    decision = `❌ ${character.name} is already at full hearts.`;
                    outcomeMessage = `${character.name} attempted to recover a heart but is already at full hearts.`;
                }
            } else {
                decision = `❌ ${character.name} doesn't have enough stamina to recover a heart.`;
                outcomeMessage = `${character.name} attempted to recover a heart but didn't have enough stamina.`;
            }

            // ------------------- Update Encounter Embed for Recover Action -------------------
            const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            await encounterMessage.edit({
                embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
                components: [] // Remove interaction buttons after action.
            });

        // ------------------- Handle Gather Resources Action -------------------
        } else if (customId === 'gather') {
            console.log(`[travelHandler.js]: Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Gather Resources`);

            // Fetch all items and filter based on the current path.
            const items = await fetchAllItems();
            const availableItems = items.filter(item => item[currentPath]);

            if (availableItems.length > 0) {
                const weightedItems = createWeightedItemList(availableItems);
                const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
                await addItemInventoryDatabase(character._id, randomItem.itemName, 1, randomItem.category.join(', '), randomItem.type.join(', '), interaction);

                // ------------------- Sync Gathered Item with Google Sheets -------------------
                const inventoryLink = character.inventory || character.inventoryLink;
                if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
                    const spreadsheetId = extractSpreadsheetId(inventoryLink);
                    const auth = await authorizeSheets();
                    const range = 'loggedInventory!A2:M';
                    const uniqueSyncId = uuidv4();
                    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                    const values = [[
                        character.name,
                        randomItem.itemName,
                        (randomItem.quantity || 1).toString(),
                        randomItem.category.join(', '),
                        randomItem.type.join(', '),
                        randomItem.subtype || '',
                        'Gathered',
                        character.job,
                        '',
                        character.currentVillage,
                        interactionUrl,
                        formattedDateTime,
                        uniqueSyncId
                    ]];

                    await safeAppendDataToSheet(spreadsheetId, auth.name, range, values);
                }

                // Deduct stamina if the character does not have the DELIVERING perk.
                if (character.perk !== 'DELIVERING') {
                    await useStamina(character._id, 1);
                    character.currentStamina -= 1;
                    staminaLost = 1;
                } else {
                    console.log(`[travelHandler.js]: Stamina preserved for ${character.name} due to DELIVERING perk`);
                    staminaLost = 0;
                }
                const itemEmoji = randomItem.emoji || '';
                decision = `🌿 ${character.name} gathered resources and found a ${itemEmoji} ${randomItem.itemName}. ${staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'}`;
                outcomeMessage = `${character.name} gathered resources and found ${itemEmoji} ${randomItem.itemName} ${staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'}`;
            } else {
                decision = `No resources found to gather on this path.`;
                outcomeMessage = `${character.name} tried to gather resources but found nothing.`;
            }

            // ------------------- Update Encounter Embed for Gather Action -------------------
            const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            await encounterMessage.edit({
                embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
                components: [] // Remove buttons after action.
            });

        // ------------------- Handle Do Nothing Action -------------------
        } else if (customId === 'do_nothing') {
            // ------------------- Generate Random Flavor Text -------------------
            const flavorTexts = [
                `${character.name} lay under a blanket of stars, listening to the distant howl of wolves. 🌌🐺`,
                `${character.name} built a small campfire and enjoyed the crackling warmth. 🔥🌙`,
                `${character.name} stumbled upon ancient ruins and marveled at their mysterious carvings before setting up camp. 🏛️✨`,
                `${character.name} heard the gentle sound of a nearby stream and drifted to sleep with a calm heart. 💧🌿`,
                `${character.name} found a quiet grove to rest, where fireflies danced in the moonlight. 🌳✨`,
                `${character.name} roasted some foraged mushrooms over the fire and thought of home. 🍄🔥`,
                `${character.name} wrapped themselves in their cloak, feeling the chill of the mountain air. 🧥❄️`,
                `${character.name} caught a glimpse of a shooting star and made a silent wish. 🌠🙏`,
                `${character.name} discovered a meadow where wildflowers bloomed under the moonlight. 🌺🌕`,
                `${character.name} gazed at the constellations and felt at peace. 🌌✨`
            ];
            const randomFlavorText = flavorTexts[Math.floor(Math.random() * flavorTexts.length)];
            decision = `✨ ${randomFlavorText}`;
            outcomeMessage = randomFlavorText;

            // ------------------- Update Encounter Embed for Do Nothing Action -------------------
            const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            await encounterMessage.edit({
                embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
                components: [] // Remove buttons after action.
            });

        // ------------------- Handle Fight Action -------------------
        } else if (customId === 'fight') {
            // ------------------- Calculate Fight Outcome -------------------
            const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
            const encounterOutcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

            if (encounterOutcome.result === 'KO') {
                // ------------------- Handle KO Outcome -------------------
                const embed = createKOEmbed(character);
                await interaction.followUp({ embeds: [embed] });
                decision = `KO'd during the fight.`;
                outcomeMessage = `💀 ${character.name} was KO'd during the fight and wakes up in their recovery village with 0 hearts and 0 stamina. They are now recovering from the ordeal.`;

                // Update character stats for KO.
                heartsLost = character.currentHearts;
                staminaLost = character.currentStamina;
                character.currentHearts = 0;
                character.currentStamina = 0;
                character.debuff = {
                    active: true,
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                };
                character.currentVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl')
                    ? 'inariko'
                    : character.homeVillage;
                character.ko = true;

                await updateCurrentHearts(character._id, character.currentHearts);
                await useStamina(character._id, character.currentStamina);
                await character.save();
                return decision;
            } else {
                // ------------------- Handle Non-KO Fight Outcomes -------------------
                await useHearts(character._id, encounterOutcome.hearts);
                character.currentHearts = Math.max(0, character.currentHearts - encounterOutcome.hearts);
                heartsLost = encounterOutcome.hearts;

                if (encounterOutcome.result === 'Win!/Loot') {
                    // ------------------- Handle Loot Outcome -------------------
                    const items = await fetchItemsByMonster(monster.name);
                    const weightedItems = createWeightedItemList(items, adjustedRandomValue);
                    const lootedItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

                    // Special handling for Chuchu-type monsters.
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

                    // ------------------- Sync Loot with Google Sheets -------------------
                    const inventoryLink = character.inventory || character.inventoryLink;
                    if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
                        const spreadsheetId = extractSpreadsheetId(inventoryLink);
                        const auth = await authorizeSheets();
                        const range = 'loggedInventory!A2:M';
                        const uniqueSyncId = uuidv4();
                        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                        const values = [[
                            character.name,
                            lootedItem.itemName,
                            (lootedItem.quantity || 1).toString(),
                            lootedItem.category.join(', '),
                            lootedItem.type.join(', '),
                            lootedItem.subtype || '',
                            'Looted',
                            character.job,
                            '',
                            character.currentVillage,
                            interactionUrl,
                            formattedDateTime,
                            uniqueSyncId
                        ]];

                        await safeAppendDataToSheet(spreadsheetId, auth.name, range, values);
                    }

                    const itemEmoji = lootedItem.emoji || '';
                    const quantityText = lootedItem.quantity > 1 ? `x${lootedItem.quantity}` : '';
                    outcomeMessage = generateVictoryMessage(adjustedRandomValue, defenseSuccess, attackSuccess) + ` ${character.name} looted ${itemEmoji} ${lootedItem.itemName}${quantityText ? ` ${quantityText}` : ''}.`;
                    decision = `Fought the monster and won! Looted ${itemEmoji} ${lootedItem.itemName}.`;
                } else {
                    // ------------------- Handle Damage Outcome -------------------
                    decision = `Fought the monster and lost ${encounterOutcome.hearts} hearts.`;
                    outcomeMessage = generateDamageMessage(encounterOutcome.hearts);
                }
            }

            // ------------------- Update Encounter Embed for Fight Action -------------------
            let description = `⚔️ ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            const embedData = encounterMessage.embeds[0].toJSON();
            const updatedEmbed = new EmbedBuilder(embedData).setDescription(description);
            const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
            if (outcomeField) {
                outcomeField.value = outcomeMessage;
            } else {
                updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
            }
            if (monster && monster.tier !== undefined) {
                updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
            }
            await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });

        // ------------------- Handle Flee Action -------------------
        } else if (customId === 'flee') {
            console.log(`[travelHandler.js]: Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Flee`);
            console.log(`[travelHandler.js]: [STAMINA CHECK] Initial Stamina: ${character.currentStamina}`);

            const fleeResult = await attemptFlee(character, monster);
            console.log(`[travelHandler.js]: [FLEE ATTEMPT] Result: ${fleeResult.success ? 'Success' : 'Failure'}`);
            let description = '';

            if (fleeResult.success) {
                if (!hasPerk(character, 'DELIVERING')) {
                    console.log(`[travelHandler.js]: [STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
                    await useStamina(character._id, 1);
                    character.currentStamina -= 1;
                    staminaLost = 1;
                } else {
                    console.log(`[travelHandler.js]: [STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
                    staminaLost = 0;
                }
                console.log(`[travelHandler.js]: [STAMINA CHECK] Final Stamina: ${character.currentStamina}`);
                decision = `💨 ${character.name} fled and safely got away! ${staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'}`;
                outcomeMessage = `${character.name} successfully fled from the ${monster.name}! ${staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'}`;
                description = `💨 You safely got away from the encounter!\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            } else if (fleeResult.attacked) {
                console.log(`[travelHandler.js]: Flee failed for ${character.name}. Monster attacked, dealing ${fleeResult.damage} damage.`);
                if (!hasPerk(character, 'DELIVERING')) {
                    console.log(`[travelHandler.js]: [STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
                    await useStamina(character._id, 1);
                    character.currentStamina -= 1;
                    staminaLost = 1;
                } else {
                    console.log(`[travelHandler.js]: [STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
                    staminaLost = 0;
                }
                decision = `⚠️ Flee failed! You took ${fleeResult.damage} hearts of damage. ${staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Used 1 stamina.'}`;
                outcomeMessage = `${character.name} failed to flee and took ${fleeResult.damage} hearts of damage from the ${monster.name}! ${staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'}`;
                await useHearts(character._id, fleeResult.damage);
                character.currentHearts = Math.max(0, character.currentHearts - fleeResult.damage);
                heartsLost = fleeResult.damage;
                if (character.currentHearts <= 0) {
                    console.log(`[travelHandler.js]: ${character.name} was knocked out.`);
                    description = `💔 The monster attacked, and you were knocked out! The encounter ends here.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
                } else {
                    description = `⚠️ You failed to flee and were attacked by the monster!\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
                }
            } else {
                console.log(`[travelHandler.js]: Flee failed for ${character.name}. Monster did not attack.`);
                if (!hasPerk(character, 'DELIVERING')) {
                    console.log(`[travelHandler.js]: [STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
                    await useStamina(character._id, 1);
                    character.currentStamina -= 1;
                    staminaLost = 1;
                } else {
                    console.log(`[travelHandler.js]: [STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
                    staminaLost = 0;
                }
                decision = `💨 Flee failed, but the monster did not attack. ${staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Used 1 stamina.'}`;
                outcomeMessage = `${character.name} failed to flee, but the ${monster.name} did not attack. ${staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'}`;
                description = `💨 You failed to flee, but the monster did not attack.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
            }

            // ------------------- Update Encounter Embed for Flee Action -------------------
            const embedData = encounterMessage.embeds[0].toJSON();
            const updatedEmbed = new EmbedBuilder(embedData).setDescription(description);
            const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
            if (outcomeField) {
                outcomeField.value = outcomeMessage;
            } else {
                updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
            }
            if (monster && monster.tier !== undefined) {
                updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
            }
            await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });
        }

        // ------------------- Update the Travel Log -------------------
        if (heartsLost > 0 || heartsGained > 0 || staminaLost > 0) {
            let logSummary = '';
            if (heartsLost > 0) logSummary += `Lost ${heartsLost} Heart(s). `;
            if (heartsGained > 0) logSummary += `Gained ${heartsGained} Heart(s). `;
            if (staminaLost > 0) logSummary += `Lost ${staminaLost} stamina. `;
            if (!logSummary.includes('gathered') && !logSummary.includes('fought') && logSummary.trim()) {
                travelLog.push(logSummary.trim());
            }
        }

        // ------------------- Return the Decision -------------------
        return decision;

    } catch (error) {
    handleError(error, 'travelHandler.js');

        // ------------------- Error Logging -------------------
        console.error(`❌ [travelHandler.js]: Error during travel interaction handling: ${error.message}`, error);
        throw error;
    }
}


// ------------------- Export the Function -------------------
module.exports = { handleTravelInteraction };
