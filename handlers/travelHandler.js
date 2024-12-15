// ------------------- Import necessary modules -------------------
const { v4: uuidv4 } = require('uuid');
const { EmbedBuilder } = require('discord.js');

// Database services
const { fetchAllItems, fetchItemsByMonster } = require('../database/itemService');

// Embeds
const { createMonsterEncounterEmbed, createKOEmbed } = require('../embeds/mechanicEmbeds');

// Modules
const { recoverHearts, updateCurrentHearts, useHearts, useStamina, handleKO } = require('../modules/characterStatsModule');
const { createWeightedItemList, calculateFinalValue, attemptFlee } = require('../modules/rngModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule');
const { hasPerk, getJobPerk } = require('../modules/jobsModule');

// Utils
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');


// ------------------- Handles travel interaction -------------------
// This function handles all travel-related interactions, including fighting, gathering, fleeing, etc.
async function handleTravelInteraction(interaction, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog) {
    try {
        if (interaction.isButton) {
            await interaction.deferUpdate(); // Ensure the interaction is deferred to avoid timeout errors
        } else {
            await interaction.deferReply();
        }

                // Dynamically fetch and set the perk based on the character's job
                const jobPerk = getJobPerk(character.job);
                character.perk = jobPerk ? jobPerk.perks[0] : undefined;
        
                console.log(`[LOG] Job Perk for ${character.name}: ${character.perk || 'None'}`);

        const customId = interaction.customId;
        let decision = '';
        let outcomeMessage = '';
        const tier = monster ? monster.tier : null;

        let heartsLost = 0;
        let heartsGained = 0;
        let staminaLost = 0;

// ------------------- Handle different travel choices based on customId -------------------

// ------------------- Recover Hearts Action -------------------
if (customId === 'recover') {
    console.log(`[LOG] Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Recover Hearts`);

    if (character.currentStamina >= 1 || character.perk === 'DELIVERING') { // Allow action even if DELIVERING perk
        console.log(`[LOG] Stamina deducted for ${character.name} (Job: ${character.job})`);
        if (character.currentHearts < character.maxHearts) {
            if (character.perk !== 'DELIVERING') { // Only deduct stamina if no DELIVERING perk
                await useStamina(character._id, 1);
                character.currentStamina -= 1;
            } else {
                console.log(`[LOG] Stamina preserved for ${character.name} due to DELIVERING perk`);
            }
            await recoverHearts(character._id, 1);
            character.currentHearts = Math.min(character.currentHearts + 1, character.maxHearts);

            decision = `💖 ${character.name} recovered a heart. ${
                character.perk === 'DELIVERING' ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'
            }`;
            outcomeMessage = `${character.name} decided to recover a heart ${
                character.perk === 'DELIVERING' ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'
            }`;
        } else {
            decision = `❌ ${character.name} is already at full hearts.`;
            outcomeMessage = `${character.name} attempted to recover a heart but is already at full hearts.`;
        }
    } else {
        decision = `❌ ${character.name} doesn't have enough stamina to recover a heart.`;
        outcomeMessage = `${character.name} attempted to recover a heart but didn't have enough stamina.`;
    }

    // ------------------- Update Embed with the Recovery Outcome -------------------
    const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [], // Remove buttons after the action
    });

// ------------------- Gathering Resources Action -------------------
} else if (customId === 'gather') {
    console.log(`[LOG] Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Gather Resources`);

    const items = await fetchAllItems(); // Fetch all possible items
    const availableItems = items.filter(item => item[currentPath]); // Filter items specific to the current path

    if (availableItems.length > 0) {
        const weightedItems = createWeightedItemList(availableItems); // Create a weighted list for random selection
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)]; // Select a random item
        await addItemInventoryDatabase(character._id, randomItem.itemName, 1, randomItem.category.join(', '), randomItem.type.join(', '), interaction);

        // ------------------- Sync Gathered Item with Google Sheets -------------------
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
            const spreadsheetId = extractSpreadsheetId(inventoryLink);
            const auth = await authorizeSheets();
            const range = 'loggedInventory!A2:M';
            const uniqueSyncId = uuidv4(); // Generate a unique ID for the entry
            const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

            // Format the data to append
            const values = [[
                character.name,                    // Character Name
                randomItem.itemName,               // Item Name
                (randomItem.quantity || 1).toString(), // Quantity
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

            await appendSheetData(auth, spreadsheetId, range, values); // Append the data to Google Sheets
        }

        const itemEmoji = randomItem.emoji || ''; // Use the item's emoji if available
        if (character.perk !== 'DELIVERING') { // Deduct stamina only if no DELIVERING perk
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            staminaLost = 1;
        } else {
            console.log(`[LOG] Stamina preserved for ${character.name} due to DELIVERING perk`);
            staminaLost = 0;
        }
        decision = `🌿 ${character.name} gathered resources and found a ${itemEmoji} ${randomItem.itemName}. ${
            staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'
        }`;
        outcomeMessage = `${character.name} gathered resources and found ${itemEmoji} ${randomItem.itemName} ${
            staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'
        }`;
    } else {
        // ------------------- No Resources Found Case -------------------
        decision = `No resources found to gather on this path.`;
        outcomeMessage = `${character.name} tried to gather resources but found nothing.`;
    }

    // ------------------- Update Embed with the Gathering Outcome -------------------
    const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [], // Remove buttons after the action
    });

// ------------------- Do Nothing Action -------------------
} else if (customId === 'do_nothing') {
    // ------------------- Decision Logic -------------------
    decision = `✨ ${character.name} did nothing.`;
    outcomeMessage = `${character.name} decided not to do anything today and just made camp.`;

    // ------------------- Update Embed with the Do Nothing Outcome -------------------
    const description = `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    
    // Edit the safe travel message to reflect the action
    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [] // Remove buttons after the action
    });

// ------------------- Fight Action -------------------
} else if (customId === 'fight') {
    // ------------------- Calculate Fight Results -------------------
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
    const encounterOutcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

    if (encounterOutcome.result === 'KO') {
        // ------------------- KO Outcome -------------------
        const embed = createKOEmbed(character);
        await interaction.followUp({ embeds: [embed] }); // Notify user of KO with an embed
        decision = `KO'd during the fight.`;
        outcomeMessage = `💀 ${character.name} was KO'd during the fight and wakes up in their recovery village with 0 hearts and 0 stamina. They are now recovering from the ordeal.`;
    
        // Update character stats
        heartsLost = character.currentHearts;
        staminaLost = character.currentStamina;
        character.currentHearts = 0;
        character.currentStamina = 0;
    
        // Apply debuff: set recovery status for 7 days
        character.debuff = {
            active: true,
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        };
    
        // Redirect character to recovery village
        character.currentVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl')
            ? 'inariko'
            : character.homeVillage;
    
        character.ko = true; // Mark character as KO'd
    
        // Persist updates to the database
        await updateCurrentHearts(character._id, character.currentHearts);
        await useStamina(character._id, character.currentStamina);
        await character.save();
    
        return decision;    
    } else {
        // ------------------- Non-KO Outcomes -------------------
        await useHearts(character._id, encounterOutcome.hearts); // Deduct hearts
        character.currentHearts = Math.max(0, character.currentHearts - encounterOutcome.hearts); // Update hearts locally
        heartsLost = encounterOutcome.hearts;

        if (encounterOutcome.result === 'Win!/Loot') {
            // ------------------- Loot Outcome -------------------
            const items = await fetchItemsByMonster(monster.name);
            const weightedItems = createWeightedItemList(items, adjustedRandomValue);
            const lootedItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

            // Special logic for Chuchus (example scenario)
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

            // Add loot to inventory
            await addItemInventoryDatabase(character._id, lootedItem.itemName, lootedItem.quantity, lootedItem.category.join(', '), lootedItem.type.join(', '), interaction);

            // Sync loot with Google Sheets
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
                    (lootedItem.quantity || 1).toString(), // Quantity
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
            decision = `Fought the monster and won! Looted ${itemEmoji} ${lootedItem.itemName}.`;
        } else {
            // ------------------- Damage Outcome -------------------
            decision = `Fought the monster and lost ${encounterOutcome.hearts} hearts.`;
            outcomeMessage = generateDamageMessage(encounterOutcome.hearts);
        }
    }

    // ------------------- Update Encounter Embed -------------------
    const description = `⚔️ ${decision}\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    const embedData = encounterMessage.embeds[0].toJSON();
    const updatedEmbed = new EmbedBuilder(embedData).setDescription(description);

    // Update the outcome field
    const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
    if (outcomeField) {
        outcomeField.value = outcomeMessage;
    } else {
        updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
    }

    await encounterMessage.edit({ embeds: [updatedEmbed], components: [] }); // Remove interaction buttons

// ------------------- Flee Action -------------------
} else if (customId === 'flee') {
    console.log(`[LOG] Character: ${character.name}, Job: ${character.job}, Perk: ${character.perk}, Action: Flee`);
    console.log(`[STAMINA CHECK] Initial Stamina: ${character.currentStamina}`);

    // ------------------- Attempt Flee -------------------
    const fleeResult = await attemptFlee(character, monster);
    console.log(`[FLEE ATTEMPT] Result: ${fleeResult.success ? 'Success' : 'Failure'}`);

    if (fleeResult.success) {
        // ------------------- Successful Flee -------------------
        if (!hasPerk(character, 'DELIVERING')) { // Deduct stamina only if no DELIVERING perk
            console.log(`[STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            staminaLost = 1;
        } else {
            console.log(`[STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
            staminaLost = 0;
        }
        console.log(`[STAMINA CHECK] Final Stamina: ${character.currentStamina}`);
        decision = `💨 ${character.name} fled and safely got away! ${
            staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Lost 1 stamina.'
        }`;
        outcomeMessage = `${character.name} successfully fled from the ${monster.name}! ${
            staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'
        }`;

        // Update the embed description to reflect success
        description = `💨 You safely got away from the encounter!\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    } else if (fleeResult.attacked) {
        // ------------------- Flee Failed with Damage -------------------
        console.log(`[LOG] Flee failed for ${character.name}. Monster attacked, dealing ${fleeResult.damage} damage.`);
        if (!hasPerk(character, 'DELIVERING')) {
            console.log(`[STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            staminaLost = 1;
        } else {
            console.log(`[STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
            staminaLost = 0;
        }

        decision = `⚠️ Flee failed! You took ${fleeResult.damage} hearts of damage. ${
            staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Used 1 stamina.'
        }`;
        outcomeMessage = `${character.name} failed to flee and took ${fleeResult.damage} hearts of damage from the ${monster.name}! ${
            staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'
        }`;

        // Deduct hearts due to the attack
        await useHearts(character._id, fleeResult.damage);
        character.currentHearts = Math.max(0, character.currentHearts - fleeResult.damage); // Update hearts locally
        heartsLost = fleeResult.damage;

        // Update the embed description based on KO status
        if (character.currentHearts <= 0) {
            console.log(`[LOG] ${character.name} was knocked out.`);
            description = `💔 The monster attacked, and you were knocked out! The encounter ends here.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
        } else {
            description = `⚠️ You failed to flee and were attacked by the monster!\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
        }
    } else {
        // ------------------- Flee Failed without Damage -------------------
        console.log(`[LOG] Flee failed for ${character.name}. Monster did not attack.`);
        if (!hasPerk(character, 'DELIVERING')) {
            console.log(`[STAMINA DEDUCTION] Stamina deducted for ${character.name} (Job: ${character.job}, Perk: ${character.perk}).`);
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            staminaLost = 1;
        } else {
            console.log(`[STAMINA PRESERVED] Stamina preserved for ${character.name} due to DELIVERING perk.`);
            staminaLost = 0;
        }

        decision = `💨 Flee failed, but the monster did not attack. ${
            staminaLost === 0 ? 'Stamina preserved due to delivering perk.' : 'Used 1 stamina.'
        }`;
        outcomeMessage = `${character.name} failed to flee, but the ${monster.name} did not attack. ${
            staminaLost === 0 ? 'Your Delivering perk preserves stamina!' : '(-1 stamina)'
        }`;

        // Update the embed description to reflect the failure
        description = `💨 You failed to flee, but the monster did not attack.\n\n**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`;
    }

    // ------------------- Update the Embed -------------------
    const embedData = encounterMessage.embeds[0].toJSON();
    const updatedEmbed = new EmbedBuilder(embedData).setDescription(description);

    // Update the outcome field
    const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
    if (outcomeField) {
        outcomeField.value = outcomeMessage;
    } else {
        updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
    }

    // Set a footer for the monster's tier, if applicable
    if (monster && monster.tier !== undefined) {
        updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
    }

    // Update the encounter message
    await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });
}

// ------------------- Update the Travel Log -------------------
if (heartsLost > 0 || heartsGained > 0 || staminaLost > 0) {
    let logSummary = ''; // Initialize an empty log summary string

    // Log the resources lost or gained during the interaction
    if (heartsLost > 0) logSummary += `Lost ${heartsLost} Heart(s)\n`; // Log hearts lost
    if (heartsGained > 0) logSummary += `Gained ${heartsGained} Heart(s)\n`; // Log hearts gained
    if (staminaLost > 0) logSummary += `Lost ${staminaLost} Stamina\n`; // Log stamina lost

    if (logSummary.trim()) {
        travelLog.unshift(logSummary.trim()); // Add this summary to the top of the travel log
    }
}

// ------------------- Return the Decision -------------------
return decision;

} catch (error) {
    // ------------------- Error Handling -------------------
    console.error(`❌ Error during travel interaction handling: ${error.message}`, error);
    throw error; // Re-throw the error for higher-level handling
}
}

// ------------------- Export the Function -------------------
module.exports = { handleTravelInteraction };
