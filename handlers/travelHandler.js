// ------------------- Standard & Core Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { EmbedBuilder } = require('discord.js');

// ------------------- Utilities -------------------
const { handleError } = require('../utils/globalErrorHandler');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, safeAppendDataToSheet } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');

// ------------------- Database Services -------------------
const { fetchAllItems, fetchItemsByMonster } = require('../database/db');

// ------------------- Modules -------------------
const { recoverHearts, updateCurrentHearts, useHearts, useStamina } = require('../modules/characterStatsModule');
const { calculateFinalValue, attemptFlee, createWeightedItemList } = require('../modules/rngModule');
const { getEncounterOutcome } = require('../modules/damageModule');
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule');
const { getJobPerk, hasPerk } = require('../modules/jobsModule');

// ------------------- Embeds -------------------
const { createKOEmbed } = require('../embeds/embeds');

const EMOJI = {
    heart: '❤️',
    stamina: '🟩',
    recovery: '💖',
    fail: '❌',
    flower: '🌸',
    flee: '💨',
    fight: '⚔️',
    loot: '🌿',
    knockOut: '💀',
};

// ============================================================================
// ---------------- Utility & Helpers ----------------
// ============================================================================

// ------------------- Utility Functions -------------------
// Update and edit the encounter message embed
async function updateEncounterEmbed(encounterMessage, character, description, monster = null, outcomeMessage = null) {
    const embedData = encounterMessage.embeds[0].toJSON();
    const updatedEmbed = new EmbedBuilder(embedData).setDescription(description);

    if (outcomeMessage) {
        const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
        if (outcomeField) {
            outcomeField.value = outcomeMessage;
        } else {
            updatedEmbed.addFields({ name: '🔹 __Outcome__', value: outcomeMessage, inline: false });
        }
    }

    if (monster && monster.tier !== undefined) {
        updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
    }

    await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });
}

// Deduct 1 stamina if the character does not have the Delivering perk
async function deductStaminaIfNeeded(character) {
    if (!hasDeliveringPerk(character)) {
        await useStamina(character._id, 1);
        character.currentStamina -= 1;
        return 1; // Stamina lost
    } else {
        console.log(`[travelHandler.js][Stamina]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
        return 0; // No stamina lost
    }
}

// Sync an item addition (gathered/looted) to the character's Google Sheet
async function syncInventoryToSheets(character, item, interaction, acquisitionType) {
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
            item.itemName,
            (item.quantity || 1).toString(),
            item.category.join(', '),
            item.type.join(', '),
            item.subtype || '',
            acquisitionType,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            uniqueSyncId
        ]];

        if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values);
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

    }
}


// ------------------- Helpers -------------------
// Check if the character has the Delivering perk
function hasDeliveringPerk(character) {
    return character.perk === 'DELIVERING';
}

// Randomly pick a flavor text from an array
function getRandomFlavorText(textArray) {
    return textArray[Math.floor(Math.random() * textArray.length)];
}

// Update the travel log based on results from an action
function updateTravelLog(travelLog, result) {
    if (!travelLog || !result) return;

    let logSummary = '';

    if (result.heartsLost > 0) logSummary += `Lost ${result.heartsLost} Heart(s). `;
    if (result.heartsGained > 0) logSummary += `Gained ${result.heartsGained} Heart(s). `;
    if (result.staminaLost > 0) logSummary += `Lost ${result.staminaLost} Stamina. `;

    if (logSummary.trim()) {
        travelLog.push(logSummary.trim());
    }
}

// ============================================================================
// ---------------- Action Handlers ----------------
// ============================================================================
// ------------------- Action Handler (Handle Recover Hearts) -------------------
async function handleRecover(interaction, character, encounterMessage) {
    console.log(`[travelHandler.js][Recover]: Handling recover for ${character.name}`);

    const result = {
        decision: '',
        outcomeMessage: '',
        heartsLost: 0,
        heartsGained: 0,
        staminaLost: 0,
    };

    if (character.ko) {
        console.error(`[travelHandler.js][Recover]: ${character.name} is KO'd and cannot recover.`);
        await encounterMessage.edit({
            embeds: [
                new EmbedBuilder(encounterMessage.embeds[0].toJSON())
                    .setDescription(`${EMOJI.knockOut} ${character.name} is knocked out and cannot recover hearts without a healer.\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`)
            ],
            components: [],
        });
        result.decision = `${EMOJI.fail} ${character.name} is KO'd and cannot heal.`;
        return result;
    }

    const enoughStamina = character.currentStamina >= 1 || hasDeliveringPerk(character);

    if (enoughStamina) {
        if (character.currentHearts < character.maxHearts) {
            if (!hasDeliveringPerk(character)) {
                await useStamina(character._id, 1);
                character.currentStamina -= 1;
                result.staminaLost = 1;
            } else {
                console.log(`[travelHandler.js][Recover]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
            }

            await recoverHearts(character._id, 1);
            character.currentHearts = Math.min(character.currentHearts + 1, character.maxHearts);
            result.heartsGained = 1;

            result.decision = `${EMOJI.recovery} ${character.name} recovered a heart.${hasDeliveringPerk(character) ? ' Stamina preserved!' : ' Lost 1 stamina.'}`;
            result.outcomeMessage = `${character.name} recovered 1 heart ${hasDeliveringPerk(character) ? '(Delivering perk active!)' : '(-1 stamina)'}`;
        } else {
            result.decision = `${EMOJI.fail} ${character.name} is already at full hearts.`;
            result.outcomeMessage = `${character.name} tried to recover but is already full.`;
        }
    } else {
        result.decision = `${EMOJI.fail} ${character.name} doesn't have enough stamina to recover.`;
        result.outcomeMessage = `${character.name} tried to recover but lacked stamina.`;
    }

    const description = `${EMOJI.flower} It's a nice and safe day of traveling. What do you want to do next?\n> ${result.decision}\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [],
    });

    return result;
}

// ------------------- Action Handler (Handle Gather Resources) -------------------
async function handleGather(interaction, character, encounterMessage, currentPath) {
    console.log(`[travelHandler.js][Gather]: Handling gather for ${character.name} on path ${currentPath}`);

    const result = {
        decision: '',
        outcomeMessage: '',
        heartsLost: 0,
        heartsGained: 0,
        staminaLost: 0,
    };

    const items = await fetchAllItems();
    const availableItems = items.filter(item => item[currentPath]);

    if (availableItems.length > 0) {
        const weightedItems = createWeightedItemList(availableItems);
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

        await addItemInventoryDatabase(
            character._id,
            randomItem.itemName,
            1,
            randomItem.category.join(', '),
            randomItem.type.join(', '),
            interaction
        );

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

            if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values);
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

        }

        // ------------------- Handle Stamina Usage -------------------
        if (!hasDeliveringPerk(character)) {
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            result.staminaLost = 1;
        } else {
            console.log(`[travelHandler.js][Gather]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
        }

        const itemEmoji = randomItem.emoji || '';
        result.decision = `${EMOJI.loot} ${character.name} gathered and found ${itemEmoji} ${randomItem.itemName}.${result.staminaLost === 0 ? ' Stamina preserved!' : ' Lost 1 stamina.'}`;
        result.outcomeMessage = `${character.name} gathered ${itemEmoji} ${randomItem.itemName} ${result.staminaLost === 0 ? '(Delivering perk active!)' : '(-1 stamina)'}`;
    } else {
        console.warn(`[travelHandler.js][Gather]: No resources found for ${character.name} on path ${currentPath}.`);
        result.decision = `${EMOJI.fail} No resources found to gather on this path.`;
        result.outcomeMessage = `${character.name} tried to gather but found nothing.`;
    }

    const description = `${EMOJI.flower} It's a nice and safe day of traveling. What do you want to do next?\n> ${result.decision}\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [],
    });

    return result;
}

// ------------------- Action Handler (Handle Do Nothing Flavor Event) -------------------
async function handleDoNothing(interaction, character, encounterMessage) {
    console.log(`[travelHandler.js][DoNothing]: Handling do nothing for ${character.name}`);

    const result = {
        decision: '',
        outcomeMessage: '',
        heartsLost: 0,
        heartsGained: 0,
        staminaLost: 0,
    };

    // ------------------- Random Flavor Text Options -------------------
    const flavorTexts = [
        `${character.name} lay under a blanket of stars, listening to the distant howl of wolves. 🌌🐺`,
        `${character.name} built a small campfire and enjoyed the crackling warmth. 🔥🌙`,
        `${character.name} stumbled upon ancient ruins and marveled at mysterious carvings. 🏛️✨`,
        `${character.name} heard the gentle sound of a nearby stream and drifted to sleep with a calm heart. 💧🌿`,
        `${character.name} found a quiet grove to rest, where fireflies danced in the moonlight. 🌳✨`,
        `${character.name} roasted some foraged mushrooms over the fire and thought of home. 🍄🔥`,
        `${character.name} wrapped themselves in their cloak, feeling the chill of the mountain air. 🧥❄️`,
        `${character.name} caught a glimpse of a shooting star and made a silent wish. 🌠🙏`,
        `${character.name} discovered a meadow where wildflowers bloomed under the moonlight. 🌺🌕`,
        `${character.name} gazed at the constellations and felt at peace. 🌌✨`
    ];

    const randomFlavorText = getRandomFlavorText(flavorTexts);

    result.decision = `✨ ${randomFlavorText}`;
    result.outcomeMessage = randomFlavorText;

    const description = `${EMOJI.flower} It's a nice and safe day of traveling. What do you want to do next?\n> ${result.decision}\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    await encounterMessage.edit({
        embeds: [new EmbedBuilder(encounterMessage.embeds[0].toJSON()).setDescription(description)],
        components: [],
    });

    return result;
}
// ------------------- Action Handler (Handle Fight Encounter) -------------------
async function handleFight(interaction, character, encounterMessage, monster) {
    console.log(`[travelHandler.js][Fight]: Handling fight for ${character.name} vs ${monster.name}`);

    const result = {
        decision: '',
        outcomeMessage: '',
        heartsLost: 0,
        heartsGained: 0,
        staminaLost: 0,
    };

    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
    const encounterOutcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

    const heartsLost = encounterOutcome.heartsLost ?? encounterOutcome.hearts ?? encounterOutcome.damage ?? 0;

    // ------------------- Handle KO Outcome -------------------
    if (encounterOutcome.result === 'KO' || (character.currentHearts - heartsLost) <= 0) {
        console.warn(`[travelHandler.js][Fight]: ${character.name} was KO'd during the fight.`);

        character.currentHearts = 0;
        character.currentStamina = 0;
        character.ko = true;
        character.debuff = {
            active: true,
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        character.currentVillage = (character.currentVillage === 'rudania' || character.currentVillage === 'vhintl')
            ? 'inariko'
            : character.homeVillage;

        await character.save();

        const koEmbed = createKOEmbed(character);
        await interaction.followUp({ embeds: [koEmbed] });

        result.decision = `KO'd during the fight.`;
        result.outcomeMessage = `${EMOJI.knockOut} ${character.name} was KO'd and wakes up in their recovery village with 0 hearts and stamina.`;
        result.heartsLost = character.maxHearts;
        result.staminaLost = character.maxStamina;

        return result;
    }

    // ------------------- Handle Non-KO Outcome -------------------
    result.heartsLost = heartsLost;

    // ------------------- Handle Victory (Loot Drop) -------------------
    if (encounterOutcome.result === 'Win!/Loot') {
        console.log(`[travelHandler.js][Fight]: ${character.name} won and is looting.`);

        const items = await fetchItemsByMonster(monster.name);
        const weightedItems = createWeightedItemList(items, adjustedRandomValue);
        let lootedItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

        // Handle special Chuchu loot case
        if (monster.name.includes('Chuchu')) {
            const jellyType = monster.name.includes('Ice') ? 'White Chuchu Jelly'
                : monster.name.includes('Fire') ? 'Red Chuchu Jelly'
                : monster.name.includes('Electric') ? 'Yellow Chuchu Jelly'
                : 'Chuchu Jelly';

            const quantity = monster.name.includes('Large') ? 3
                : monster.name.includes('Medium') ? 2
                : 1;

            lootedItem.itemName = jellyType;
            lootedItem.quantity = quantity;
        } else {
            lootedItem.quantity = 1;
        }

        await addItemInventoryDatabase(
            character._id,
            lootedItem.itemName,
            lootedItem.quantity,
            lootedItem.category.join(', '),
            lootedItem.type.join(', '),
            interaction
        );

        // Sync to Google Sheets if necessary
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

            await safeAppendDataToSheet(inventoryLink, character, range, values);
        }

        const itemEmoji = lootedItem.emoji || '';
        const quantityText = lootedItem.quantity > 1 ? `x${lootedItem.quantity}` : '';

        result.decision = `Fought the monster and won! Looted ${itemEmoji} ${lootedItem.itemName}${quantityText ? ` ${quantityText}` : ''}.`;
        result.outcomeMessage = generateVictoryMessage(adjustedRandomValue, defenseSuccess, attackSuccess) +
            ` ${character.name} looted ${itemEmoji} ${lootedItem.itemName}${quantityText ? ` ${quantityText}` : ''}.`;

    } else {
        console.log(`[travelHandler.js][Fight]: ${character.name} lost ${heartsLost} hearts.`);

        result.decision = `Fought the monster and lost ${heartsLost} hearts.`;
        result.outcomeMessage = generateDamageMessage(heartsLost);
    }

    // ------------------- Update Encounter Message Embed -------------------
    const embedData = encounterMessage.embeds[0].toJSON();
    const updatedEmbed = new EmbedBuilder(embedData)
        .setDescription(`${EMOJI.fight} ${result.decision}\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`);

    const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
    if (outcomeField) {
        outcomeField.value = result.outcomeMessage;
    } else {
        updatedEmbed.addFields({ name: '🔹 __Outcome__', value: result.outcomeMessage, inline: false });
    }

    if (monster && monster.tier !== undefined) {
        updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
    }

    await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });

    return result;
}

// ------------------- Action Handler (Handle Flee Attempt) -------------------
async function handleFlee(interaction, character, encounterMessage, monster) {
    console.log(`[travelHandler.js][Flee]: Handling flee for ${character.name} vs ${monster.name}`);

    const result = {
        decision: '',
        outcomeMessage: '',
        heartsLost: 0,
        heartsGained: 0,
        staminaLost: 0,
    };

    const fleeResult = await attemptFlee(character, monster);
    console.log(`[travelHandler.js][Flee]: Flee attempt result: ${fleeResult.success ? 'Success' : 'Failure'}`);

    let description = '';

    if (fleeResult.success) {
        // ------------------- Flee Success -------------------
        if (!hasDeliveringPerk(character)) {
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            result.staminaLost = 1;
        } else {
            console.log(`[travelHandler.js][Flee]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
        }

        result.decision = `${EMOJI.flee} ${character.name} fled and safely got away!${result.staminaLost === 0 ? ' Stamina preserved!' : ' Lost 1 stamina.'}`;
        result.outcomeMessage = `${character.name} successfully fled from the ${monster.name}! ${result.staminaLost === 0 ? '(Delivering perk active!)' : '(-1 stamina)'}`;

        description = `${EMOJI.flee} You safely got away from the encounter!\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    } else if (fleeResult.attacked) {
        // ------------------- Flee Failed + Attacked -------------------
        console.warn(`[travelHandler.js][Flee]: ${character.name} failed to flee and took ${fleeResult.damage} damage.`);

        if (!hasDeliveringPerk(character)) {
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            result.staminaLost = 1;
        } else {
            console.log(`[travelHandler.js][Flee]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
        }

        await useHearts(character._id, fleeResult.damage);
        result.heartsLost = fleeResult.damage;

        result.decision = `⚠️ Flee failed! ${character.name} took ${fleeResult.damage} hearts of damage.${result.staminaLost === 0 ? ' Stamina preserved!' : ' Used 1 stamina.'}`;
        result.outcomeMessage = `${character.name} failed to flee and took ${fleeResult.damage} hearts of damage from ${monster.name}. ${result.staminaLost === 0 ? '(Delivering perk active!)' : '(-1 stamina)'}`;

        if (character.currentHearts <= 0) {
            console.warn(`[travelHandler.js][Flee]: ${character.name} was knocked out after failed flee.`);
            description = `💔 The monster attacked, and you were knocked out!\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;
        } else {
            description = `⚠️ You failed to flee and were attacked!\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;
        }

    } else {
        // ------------------- Flee Failed but No Attack -------------------
        console.warn(`[travelHandler.js][Flee]: ${character.name} failed to flee but was not attacked.`);

        if (!hasDeliveringPerk(character)) {
            await useStamina(character._id, 1);
            character.currentStamina -= 1;
            result.staminaLost = 1;
        } else {
            console.log(`[travelHandler.js][Flee]: Stamina preserved for ${character.name} due to DELIVERING perk.`);
        }

        result.decision = `${EMOJI.flee} Flee failed, but the monster did not attack.${result.staminaLost === 0 ? ' Stamina preserved!' : ' Used 1 stamina.'}`;
        result.outcomeMessage = `${character.name} failed to flee, but the ${monster.name} did not attack. ${result.staminaLost === 0 ? '(Delivering perk active!)' : '(-1 stamina)'}`;

        description = `${EMOJI.flee} You failed to flee, but the monster did not attack.\n\n**${EMOJI.heart} Hearts:** ${character.currentHearts}/${character.maxHearts}\n**${EMOJI.stamina} Stamina:** ${character.currentStamina}/${character.maxStamina}`;
    }

    // ------------------- Update Encounter Embed -------------------
    const embedData = encounterMessage.embeds[0].toJSON();
    const updatedEmbed = new EmbedBuilder(embedData)
        .setDescription(description);

    const outcomeField = updatedEmbed.data.fields?.find(field => field.name === '🔹 __Outcome__');
    if (outcomeField) {
        outcomeField.value = result.outcomeMessage;
    } else {
        updatedEmbed.addFields({ name: '🔹 __Outcome__', value: result.outcomeMessage, inline: false });
    }

    if (monster && monster.tier !== undefined) {
        updatedEmbed.setFooter({ text: `Tier: ${monster.tier}` });
    }

    await encounterMessage.edit({ embeds: [updatedEmbed], components: [] });

    return result;
}

// ------------------- Main Handler (Handle Travel Interaction) -------------------
async function handleTravelInteraction(interaction, character, day, totalTravelDuration, pathEmoji, currentPath, encounterMessage, monster, travelLog) {
    try {
        // ------------------- Defer Interaction -------------------
        if (interaction.isButton()) {
            await interaction.deferUpdate();
        } else if (interaction.isCommand()) {
            await interaction.deferReply();
        } else {
            throw new Error(`Unsupported interaction type: ${interaction.type}`);
        }

        // ------------------- Set Character Perk -------------------
        const jobPerk = getJobPerk(character.job);
        character.perk = jobPerk ? jobPerk.perks[0] : undefined;
        console.log(`[travelHandler.js][Main]: Set job perk for ${character.name}: ${character.perk || 'None'}`);

        const customId = interaction.customId;
        let result = null;

        // ------------------- Handle Based on Action -------------------
        switch (customId) {
            case 'recover':
                result = await handleRecover(interaction, character, encounterMessage);
                break;
            case 'gather':
                result = await handleGather(interaction, character, encounterMessage, currentPath);
                break;
            case 'do_nothing':
                result = await handleDoNothing(interaction, character, encounterMessage);
                break;
            case 'fight':
                result = await handleFight(interaction, character, encounterMessage, monster);
                break;
            case 'flee':
                result = await handleFlee(interaction, character, encounterMessage, monster);
                break;
            default:
                throw new Error(`Unsupported customId: ${customId}`);
        }

        // ------------------- Update Travel Log -------------------
        if (result) {
            updateTravelLog(travelLog, result);
            return result.decision;
        }

    } catch (error) {
        handleError(error, 'travelHandler.js');
        console.error(`[travelHandler.js][Main]: Error during travel interaction: ${error.message}`, error);
        throw error;
    }
}


// ---------------- Export ----------------
module.exports = { handleTravelInteraction };
