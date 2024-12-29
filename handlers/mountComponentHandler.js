// ------------------- Imports -------------------

// ------------------- Discord.js Components -------------------
const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    StringSelectMenuBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    EmbedBuilder
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Database Services -------------------
const { 
    fetchCharacterByName, 
    fetchCharacterByNameAndUserId, 
    getCharacterInventoryCollection,  
} = require('../database/characterService');
const {
    addItemInventoryDatabase,
    removeItemInventoryDatabase,
  } = require('../utils/inventoryUtils');
const { updateTokenBalance, getOrCreateToken  } = require('../database/tokenService');

// ------------------- Database Models -------------------
const Character = require('../models/CharacterModel');
const Mount = require('../models/MountModel');
const User = require('../models/UserModel')

// ------------------- Modules -------------------
const { 
    customizationCosts,
    bearTraits, 
    bullboTraits, 
    deerTraits, 
    deleteEncounterById, 
    distractionItems, 
    dodongoTraits, 
    donkeyTraits, 
    generateBearTraits, 
    generateBullboTraits, 
    generateDeerTraits, 
    generateDodongoTraits, 
    generateDonkeyTraits, 
    generateHorseTraits, 
    generateMooseTraits, 
    generateMountainGoatTraits, 
    generateOstrichTraits, 
    generateWaterBuffaloTraits, 
    generateWolfosTraits, 
    getEncounterById, 
    getMountEmoji, 
    getMountRarity, 
    getMountStamina, 
    getMountThumbnail, 
    getRandomEnvironment, 
    getRandomMount, 
    horseTraits, 
    mooseTraits, 
    mountainGoatTraits, 
    ostrichTraits, 
    storeEncounter, 
    useDistractionItem, 
    waterBuffaloTraits, 
    wolfosTraits 
} = require('../modules/mountModule');
const { 
    checkAndUseStamina, 
    useStamina 
} = require('../modules/characterStatsModule');

// ------------------- Utility Functions -------------------
const { 
    appendSheetData, 
    authorizeSheets, 
    extractSpreadsheetId, 
    isValidGoogleSheetsUrl 
} = require('../utils/googleSheetsUtils');

// --------------------------------------------------------------

// Import the village emojis
const villageEmojis = {
    rudania: '<:rudania:899492917452890142>',
    inariko: '<:inariko:899493009073274920>',
    vhintl: '<:vhintl:899492879205007450>',
};

// ------------------- Format Encounter Data -------------------
// Formats the encounter data to create the embedded message with mount details.
function formatEncounterData(encounter, characterName, characterStamina, characterIcon) {
    const mountLevel = encounter.mountLevel || 'To be determined';
    const mountType = encounter.mountType || 'To be determined';
    const environment = encounter.environment || 'To be determined';

    // Apply village emoji based on the encounter's village
    const villageEmoji = villageEmojis[encounter.village.toLowerCase()] || '';
    const village = `${villageEmoji} ${encounter.village || 'To be determined'}`;

    const mountStamina = encounter.mountStamina || 'To be determined';
    const rarity = encounter.rarity || 'To be determined';
    const mountThumbnail = getMountThumbnail(mountType); // Get the thumbnail for the mount type

    return {
        title: `🎉 ${characterName} Rolled a 20! 🎉`,
        description: '**Congratulations!** You have the opportunity to catch the mount!',
        author: {
            name: characterName,
            icon_url: characterIcon,
        },
        fields: [
            {
                name: 'Mount Details',
                value: `> **Mount Species**: ${mountType}\n> **Rarity**: It's a **${rarity}** mount!\n> **Mount Level**: ${mountLevel}\n> **Mount Stamina**: ${mountStamina}\n> **Environment**: ${environment}\n> **Village**: ${village}`,
                inline: false,
            },
            {
                name: 'Stamina',
                value: `**${characterName}** currently has **${characterStamina}** stamina. What would ${characterName} like to do?`,
                inline: false,
            },
        ],
        color: 0xAA926A ,
        image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
        },
        thumbnail: {
            url: mountThumbnail,
        },
    };
}

// ------------------- Create Action Buttons -------------------
// Creates the action buttons for the different mount interaction options.
function createActionButtons(encounterId, village, glideUsed) {
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`sneak|${village}|${encounterId}`)
            .setLabel('🐾 Sneak')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`distract|${village}|${encounterId}`)
            .setLabel('🎯 Distract')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`corner|${village}|${encounterId}`)
            .setLabel('🦾 Corner')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`rush|${village}|${encounterId}`)
            .setLabel('🏃‍♂️ Rush')
            .setStyle(ButtonStyle.Danger)
    ];

    // Add the Glide button only if it hasn't been used
    if (!glideUsed) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`glide|${village}|${encounterId}`)
                .setLabel('🪂 Glide')
                .setStyle(ButtonStyle.Primary)
        );
    }

    return new ActionRowBuilder().addComponents(buttons);
}

// ------------------- Track Character and Stamina in Encounter -------------------
// Tracks a character in the encounter and stores their user ID for validation.
async function trackCharacterInEncounter(character, encounterId, encounter, userId) {
    // Check if the character is already tracked in the encounter
    const userInEncounter = encounter.users.find(user => user.characterName === character.name);

    // If not tracked, add the character and their user ID to the encounter
    if (!userInEncounter) {
        encounter.users.push({
            characterName: character.name,
            userId: userId // Associate the character with the user ID for validation
        });

        try {
            // Save the updated encounter data
            await storeEncounter(encounterId, encounter);
        } catch (error) {
            console.error('[trackCharacterInEncounter]: Failed to store updated encounter', error);
            throw new Error('An error occurred while updating the encounter. Please try again.');
        }
    }
}

// ------------------- Proceed with Roll Function -------------------
// Handles the rolling of a 20 and determines if the mount encounter continues.
async function proceedWithRoll(interaction, characterName, encounterId) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const character = await fetchCharacterByName(characterName.name || characterName);

    if (!character) {
        await interaction.editReply({
            embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }],
            ephemeral: true
        });
        return;
    }

    const roll = 20; //Math.floor(Math.random() * 20) + 1; // Set roll to 20 for testing (use Math.random for real rolls)
    const encounter = getEncounterById(encounterId);

    if (!encounter) {
        await interaction.editReply({
            embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }],
            ephemeral: true
        });
        return;
    }

    const village = encounter.village; // Ensure village is correctly defined

    if (roll === 20) {
        // Populate missing encounter data
        if (encounter.rarity === 'To be determined') {
            const rarityData = getMountRarity();
            encounter.rarity = rarityData.isRare ? 'Rare' : 'Regular';
        }
        if (encounter.mountStamina === 'To be determined') {
            encounter.mountStamina = getMountStamina(encounter.mountLevel, encounter.rarity === 'Rare');
        }
        if (encounter.environment === 'To be determined') {
            encounter.environment = getRandomEnvironment(village);
        }
        if (encounter.mountType === 'To be determined') {
            const randomMount = getRandomMount(village);
            encounter.mountType = randomMount.mount;
            encounter.mountLevel = randomMount.level;
            encounter.village = randomMount.village;
        }

        // Track character in the encounter and associate user ID
        await trackCharacterInEncounter(character, encounterId, encounter, interaction.user.id);
        encounter.rollerId = interaction.user.id; // Set roller ID
        storeEncounter(encounterId, encounter);

        // Prepare success embed and buttons
        const embedMessage = formatEncounterData(encounter, character.name, character.currentStamina, character.icon);
        const actionButtons = createActionButtons(encounterId, village, encounter.glideUsed);

        await interaction.editReply({
            components: [actionButtons],
            embeds: [embedMessage],
            ephemeral: false
        });
    } else {
        // Handle non-20 rolls
        await interaction.editReply({
            embeds: [
                {
                    title: `🎲 ${character.name} rolled a **${roll}**!`,
                    description: `🚫 Keep trying for that **natural 20**!\n\nUse \`\`\`/mount encounterid:${encounterId} charactername:\`\`\` to participate!`,
                    color: 0xFFFF00,
                    author: { name: character.name, icon_url: character.icon },
                    thumbnail: { url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
                }
            ],
            components: [], // No buttons for non-20 rolls
            ephemeral: false
        });
    }
}

// ------------------- Handle Action Buttons -------------------
// Handles actions triggered by interaction buttons (Sneak, Distract, Corner, Rush, Glide).
async function handleMountComponentInteraction(interaction) {
    try {
        const [action, village, encounterId] = interaction.customId.split('|');
        const encounter = getEncounterById(encounterId);

        if (!encounter) {
            await interaction.reply({
                embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        // Handle Glide availability
        if (action === 'glide' && encounter.glideUsed) {
            await interaction.reply({
                embeds: [{ title: '❌ Glide Unavailable', description: 'You can only use Glide on the first roll.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        // Mark Glide as used
        if (action === 'glide') {
            encounter.glideUsed = true;
            storeEncounter(encounterId, encounter);
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        const userInEncounter = encounter.users.find(user => user.characterName);
        if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
            await interaction.editReply({
                embeds: [{ title: '❌ Access Denied', description: 'Only the owner of the character can interact.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        const character = await fetchCharacterByName(userInEncounter.characterName);
        if (!character) {
            await interaction.editReply({
                embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        if (action === 'distract') {
            try {
                // Ensure distractionItems is valid
                if (!distractionItems || typeof distractionItems !== 'object') {
                    console.error('[handleMountComponentInteraction]: distractionItems is undefined or not an object.');
                    await interaction.editReply({
                        embeds: [{
                            title: '❌ Error',
                            description: 'Distraction items data is not available. Please try again later.',
                            color: 0xFF0000,
                        }],
                        components: [],
                        ephemeral: true
                    });
                    return;
                }
        
                // Fetch the character's inventory
                const inventoryCollection = await getCharacterInventoryCollection(character.name);
                const inventoryItems = await inventoryCollection.find({}, { projection: { itemName: 1, quantity: 1, _id: 1 } }).toArray();
        
                // Normalize item names for comparison
                const normalizedDistractionItems = Object.keys(distractionItems).reduce((acc, key) => {
                    acc[key.toLowerCase().trim()] = distractionItems[key];
                    return acc;
                }, {});
        
                // Filter items matching distraction items and applicable for the current mount type
                const mountType = encounter.mountType;
                const availableItems = inventoryItems.filter(item => {
                    if (!item.itemName) {
                        console.warn('[handleMountComponentInteraction]: Item with no name found in inventory:', item);
                        return false;
                    }
                    const normalizedItemName = item.itemName.toLowerCase().trim();
                    const distractionItem = normalizedDistractionItems[normalizedItemName];
        
                    // Check if the item is valid for all mounts or specific to the current mountType
                    return distractionItem && (distractionItem.forAllMounts || distractionItem.mounts?.includes(mountType));
                });
        
                // Deduplicate items by name and sum their quantities
                const deduplicatedItems = availableItems.reduce((acc, item) => {
                    const normalizedItemName = item.itemName.toLowerCase().trim();
                    if (!acc[normalizedItemName]) {
                        acc[normalizedItemName] = { ...item, quantity: parseInt(item.quantity, 10) };
                    } else {
                        acc[normalizedItemName].quantity += parseInt(item.quantity, 10);
                    }
                    return acc;
                }, {});
        
                // Convert deduplicated items back to an array
                const uniqueItems = Object.values(deduplicatedItems);
        
                if (uniqueItems.length === 0) {
                    await interaction.editReply({
                        embeds: [{
                            title: '❌ No Distraction Items Available',
                            description: `You do not have any items in your inventory that can distract a **${mountType}**. Try a different strategy!`,
                            color: 0xFF0000,
                            thumbnail: { url: getMountThumbnail(encounter.mountType) },
                            image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                        }],
                        components: [],
                        ephemeral: false
                    });
                    return;
                }
        
                // Create unique buttons for distraction items
                const distractionButtons = uniqueItems.map(item =>
                    new ButtonBuilder()
                        .setCustomId(`use-item|${item.itemName}|${encounterId}`) // Use encounterId here
                        .setLabel(`${item.itemName} (${item.quantity})`)
                        .setStyle(ButtonStyle.Primary)
                );
        
                const actionRows = createActionRows(distractionButtons);
        
                // Log generated buttons for debugging
                console.log('[handleMountComponentInteraction]: Generated distraction buttons:', distractionButtons);
        
                // Remove action buttons after distract interaction
                await interaction.message.edit({
                    components: [], // Remove distract action buttons
                });
        
                await interaction.editReply({
                    embeds: [{
                        title: `🎯 Distract Attempt`,
                        description: `🛠️ Choose an item from your inventory to distract the **${mountType}**.`,
                        color: 0xAA926A ,
                        thumbnail: { url: getMountThumbnail(encounter.mountType) },
                        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                    }],
                    components: actionRows,
                    ephemeral: false,
                });
            } catch (error) {
                console.error('[handleMountComponentInteraction]: Error while filtering distraction items:', error);
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Error',
                        description: 'An error occurred while processing distraction items. Please try again later.',
                        color: 0xFF0000,
                    }],
                    components: [],
                    ephemeral: true,
                });
            }
            return; // Prevent further processing until a button is clicked
        }        
         
        const staminaResult = await useStamina(character._id, 1);
        if (staminaResult.exhausted) {
            deleteEncounterById(encounterId);
            await interaction.editReply({
                embeds: [{
                    title: `Mount Escaped!`,
                    description: `**${staminaResult.message}**\n\nThe mount fled as your character became too exhausted to continue the chase.`,
                    color: 0xFF0000,
                    thumbnail: { url: getMountThumbnail(encounter.mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                }],
                components: []
            });
            return;
        }       

        const roll = Math.floor(Math.random() * 20) + 1;
        let adjustedRoll = roll;
        let bonusMessage = '';
        let success = false;

        // Apply environment bonuses or penalties
        const environment = encounter.environment || 'Unknown';
        if (environment === 'Tall grass' && village === 'Rudania') {
            if (action === 'sneak') adjustedRoll += 1;
            if (action === 'rush') adjustedRoll -= 3;
        }
        if (environment === 'Mountainous' && village === 'Inariko') {
            if (action === 'corner') adjustedRoll += 4;
            if (action === 'glide') adjustedRoll += 2;
        }
        if (action === 'glide') adjustedRoll += 3;

        // Determine success based on roll
        if (action === 'sneak' && adjustedRoll >= 5) success = true;
        if (action === 'corner' && adjustedRoll >= 7) success = true;
        if (action === 'rush' && adjustedRoll >= 17) success = true;

        let message = `**${character.name}** tried a **${action}** strategy and rolled a **${roll}**.`;
        if (bonusMessage) message += ` ${bonusMessage} applied, adjusted roll is **${adjustedRoll}**.`;

        if (success) {
            message += `\n\n🎉 Success! ${character.name} moves to the next phase.\n\n${character.name} has **${character.currentStamina}** 🟩 stamina remaining.`;
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tame|${village}|${encounterId}`)
                    .setLabel('Tame the Mount!')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.message.edit({ components: [] });
            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(encounter.mountType)} ${action.charAt(0).toUpperCase() + action.slice(1)} Attempt!`,
                    description: message,
                    color: 0xAA926A ,
                    author: { name: character.name, icon_url: character.icon },
                    thumbnail: { url: getMountThumbnail(encounter.mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
                }],
                components: [actionRow],
                ephemeral: false
            });
        } else {
            message += `\n\n🚫 The mount evaded! Would **${character.name}** like to try again for 1 stamina?\n\n**${character.name}** now has **${character.currentStamina}** 🟩 stamina remaining.`;
            const retryButtons = createActionButtons(encounterId, village, encounter.glideUsed);

            await interaction.message.edit({ components: [] });
            await interaction.editReply({
                embeds: [{
                    title: 'Mount Evaded!',
                    description: message,
                    color: 0xFFFF00,
                    author: { name: character.name, icon_url: character.icon },
                    thumbnail: { url: getMountThumbnail(encounter.mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
                }],
                components: [retryButtons],
                ephemeral: false
            });
        }
    } catch (error) {
        console.error('[handleMountComponentInteraction]: Error occurred:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
                ephemeral: true
            });
        }
    }
}

// ------------------- Handle Tame Interaction -------------------
// Handles the taming attempt by rolling for successes and applying stamina costs.
async function handleTameInteraction(interaction) {
    try {
        // Ensure the interaction is deferred to allow async processing
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        // Parse interaction ID to retrieve village and encounter details
        const [_, village, encounterId] = interaction.customId.split('|');
        let encounter = getEncounterById(encounterId);

        // Check if encounter exists
        if (!encounter) {
            await interaction.editReply({
                embeds: [{ 
                    title: '❌ Encounter Not Found', 
                    description: 'We couldn\'t find the encounter you are trying to interact with.', 
                    color: 0xFF0000 
                }],
                ephemeral: false 
            });
            return;
        }

        // Restrict interaction to the user who owns the character
        const userInEncounter = encounter.users.find(user => user.characterName);
        if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
            await interaction.editReply({
                embeds: [{ 
                    title: '❌ Access Denied', 
                    description: 'Only the owner of the character can continue.', 
                    color: 0xFF0000 
                }],
                ephemeral: false 
            });
            return;
        }

        // Fetch character data
        const characterName = userInEncounter.characterName;
        const character = await fetchCharacterByName(characterName);
        if (!character) {
            await interaction.editReply({
                embeds: [{ 
                    title: `❌ Character Not Found: ${characterName}`, 
                    description: 'Please ensure the character is valid and try again.', 
                    color: 0xFF0000 
                }],
                ephemeral: false 
            });
            return;
        }

        const characterStamina = character.currentStamina;

        // If stamina is 0, delete the encounter and inform the user
        if (characterStamina === 0) {
            deleteEncounterById(encounterId);
            await interaction.editReply({
                embeds: [{
                    title: `💔 Mount Escaped!`,
                    description: `**${character.name}** has become too exhausted to continue the chase!\n\n💡 **Tip:** Plan your actions carefully and ensure you have enough stamina for future encounters.`,
                    color: 0xFF0000,
                    author: { name: character.name, icon_url: character.icon },
                    thumbnail: { url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                }],
                components: [], // No further interaction allowed
                ephemeral: false,
            });
            return;
        }

        // Roll for successes based on character stamina
        const rolls = Array.from({ length: characterStamina }, () => Math.floor(Math.random() * 20) + 1);
        const nat20 = rolls.includes(20); // Check for natural 20
        const successes = rolls.filter(roll => roll >= 5).length;
        const mountStamina = encounter.mountStamina;

        // Construct result message
        let message = `🎲 **${characterName} rolled ${characterStamina}d20**: \`${rolls.join(', ')}\`\n\n`;
        message += `${characterName} needed **${mountStamina}** successes of 5 or higher. ${characterName} got **${successes}**.\n\n`;

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pay-traits|yes|${encounterId}`)
                .setLabel('Yes')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`pay-traits|no|${encounterId}`)
                .setLabel('No')
                .setStyle(ButtonStyle.Danger)
        );

        // Check for success
        if (nat20 || successes >= mountStamina) {
            message += `🎉 **Success!** ${characterName} has successfully tamed the mount! 🐴\n\n`;

            // Add mount details
            const mountDetails = `**Mount Details**\n` +
                `> **Mount Species**: ${encounter.mountType}\n` +
                `> **Rarity**: It's a **${encounter.rarity}** mount!\n` +
                `> **Mount Level**: ${encounter.mountLevel}\n` +
                `> **Mount Stamina**: ${encounter.mountStamina}\n`;
            message += mountDetails;

            message += `\nWould you like to customize any traits of the mount?`;

            // Update encounter tame status
            encounter.tameStatus = true;
            storeEncounter(encounterId, encounter);

            // **Edit: Disable the "Tame the Mount" button**
            await interaction.message.edit({
                components: [], // Clear buttons to disable further taming attempts
            });

            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(encounter.mountType)} Tamed ${encounter.mountType} Successfully!`,
                    description: message,
                    color: 0xAA926A ,
                    author: { name: character.name, icon_url: character.icon },
                    thumbnail: { url: getMountThumbnail(encounter.mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
                }],
                components: [actionRow],
                ephemeral: false
            });
        } else {
            message += `🚫 **Failed!** The mount escaped. Try again if you have enough stamina.`;

            // Provide retry instructions
            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(encounter.mountType)} Tame Attempt Failed`,
                    description: message,
                    color: 0xFF0000,
                    author: { name: character.name, icon_url: character.icon },
                }],
                ephemeral: false
            });
        }
    } catch (error) {
        console.error('[handleTameInteraction]: Error handling tame interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again later.',
                    color: 0xFF0000
                }],
                ephemeral: true
            });
        }
    }
}

// ------------------- Handle Item Usage -------------------
async function handleUseItemInteraction(interaction) {
    try {
        // Parse the interaction ID to extract item name and encounter ID
        const [_, itemName, encounterId] = interaction.customId.split('|');

        console.log(`[handleUseItemInteraction]: Parsed encounterId: ${encounterId}, itemName: ${itemName}`);

        // Retrieve the encounter by ID
        const encounter = getEncounterById(encounterId);

        console.log(`[handleUseItemInteraction]: Retrieved encounter:`, encounter);

        // Ensure the interaction is deferred publicly for processing
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: false });
        }

        // Check if the encounter exists
        if (!encounter) {
            console.error(`[handleUseItemInteraction]: Encounter not found for ID: ${encounterId}`);
            await interaction.editReply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'Please try again.',
                    color: 0xFF0000,
                }],
                ephemeral: false,
            });
            return;
        }

        // Attempt to use the item and retrieve its bonus
        const mountType = encounter.mountType;
        const bonus = useDistractionItem(itemName, mountType);

        // Handle invalid item usage
        if (bonus === 0) {
            await interaction.editReply({
                embeds: [{
                    title: '❌ Invalid Item',
                    description: `The item **${itemName}** cannot be used to distract the current mount.`,
                    color: 0xFF0000,
                }],
                components: [],
                ephemeral: false,
            });
            return;
        }

        // Retrieve the character information
        const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
        if (!userInEncounter) {
            await interaction.editReply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: 'The character linked to this encounter could not be identified.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }
        const characterName = userInEncounter.characterName;
        const character = await fetchCharacterByName(characterName);

        if (!character) {
            await interaction.editReply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: 'The character does not exist in the system.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Roll and calculate distraction result
        const roll = Math.floor(Math.random() * 20) + 1;
        const adjustedRoll = roll + bonus;
        const success = adjustedRoll >= 7;

        let message = `🎲 **Rolled a ${roll}**, with a distraction bonus of **+${bonus}**, for a total of **${adjustedRoll}**.\n\n`;

        if (success) {
            message += `🎉 **Success!** You distracted the mount effectively with **${itemName}**!\n\n🟢 **The mount is now vulnerable to your next action!**\n\n`;
            message += `**${character.name}** currently has **${character.currentStamina}** stamina remaining.`;

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tame|${encounter.village}|${encounterId}`)
                    .setLabel('🐴 Tame the Mount!')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.message.edit({ components: [] });
            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(mountType)} 🎯 Distract Success!`,
                    description: `${message}\n\n**Prepare to tame the mount!**`,
                    color: 0xAA926A ,
                    thumbnail: { url: getMountThumbnail(mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                }],
                components: [actionRow],
                ephemeral: false,
            });
        } else {
            message += `🚫 **The mount evaded despite your efforts with **${itemName}**!**\n\n💡 **Tip:** Use distraction items or bonuses to improve your chances.\n\n`;
            message += `**${character.name}** currently has **${character.currentStamina}** stamina remaining.`;

            const retryButtons = createActionButtons(encounterId, encounter.village, encounter.glideUsed);
            await interaction.message.edit({ components: [] });
            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(mountType)} ❌ Distract Failed`,
                    description: message,
                    color: 0xFF0000,
                    thumbnail: { url: getMountThumbnail(mountType) },
                    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
                }],
                components: [retryButtons],
                ephemeral: false,
            });
        }

        // Remove the item from the inventory
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        await removeItemInventoryDatabase(character._id, itemName, 1, inventoryCollection);

        // Log the usage in Google Sheets
if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
    const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
    const auth = await authorizeSheets();
    const range = 'loggedInventory!A2:M'; // Range for appending data to Google Sheets
    const uniqueSyncId = uuidv4(); // Generate a unique sync ID for logging purposes
    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`; // Interaction URL for referencing the log

    // Prepare the data to be appended to Google Sheets
    const values = [[
        character.name,             // Character Name
        itemName,                   // Item Name
        '-1',                       // Quantity of Item (negative for removal)
        randomItem.category.join(', '), // Category
        randomItem.type.join(', '),     // Type
        randomItem.subtype.join(', '),  // Subtype
        'Mount distraction',        // How the item was obtained
        character.job,              // Job
        '',                         // Perk (optional)
        character.currentVillage,   // Location
        interactionUrl,             // Link to the interaction
        formattedDateTime,          // Date/Time of the event
        uniqueSyncId                // Unique Sync ID
    ]];

    // Append data to Google Sheets
    await appendSheetData(auth, spreadsheetId, range, values);
}


        // Update the encounter with the distraction result
        encounter.distractionResult = success;
        storeEncounter(encounterId, encounter);
    } catch (error) {
        console.error('[handleUseItemInteraction]: Error handling item usage interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again later.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }
    }
}



// ------------------- handlePostTameInteraction -------------------
async function handlePostTameInteraction(interaction, encounterId) {
    try {
        // Retrieve the encounter by ID
        const encounter = getEncounterById(encounterId);

        // Ensure the interaction is deferred publicly for processing
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: false });
        }

        // Check if the encounter exists
        if (!encounter) {
            await interaction.editReply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'The encounter could not be found. Please try again.',
                    color: 0xFF0000,
                }],
                ephemeral: false,
            });
            return;
        }

        // Determine mount rarity and type
        const rarity = encounter.rarity === 'Rare' ? 'Rare' : 'Regular';
        const mountType = encounter.mountType;

        // Build the embed message for the tamed mount
        const embedMessage = {
            title: `${getMountEmoji(mountType)} 🎉 Mount Tamed!`,
            description: `🎉 **Congratulations!** You have successfully tamed a **${rarity}** mount!\n\nDo you want to customize any of its traits?`,
            color: rarity === 'Rare' ? 0xFFD700 : 0xAA926A ,
            thumbnail: {
                url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
            },
            image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
            },
        };

        // Add buttons for customization options
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pay-traits|yes|${encounterId}`)
                .setLabel('✅ Yes, Customize')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`pay-traits|no|${encounterId}`)
                .setLabel('❌ No, Skip')
                .setStyle(ButtonStyle.Danger)
        );

        // Send the response with the embed and buttons
        await interaction.editReply({
            embeds: [embedMessage],
            components: [actionRow],
            ephemeral: false,
        });
    } catch (error) {
        console.error('[handlePostTameInteraction]: Error handling post-tame interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again later.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }
    }
}

// ------------------- Create Action Rows -------------------
// Splits an array of buttons into rows of 5 or fewer to comply with Discord API limits.
function createActionRows(buttons) {
    const actionRows = [];
    while (buttons.length) {
        actionRows.push(new ActionRowBuilder().addComponents(buttons.splice(0, 5)));
    }
    return actionRows;
}

// ------------------- Handle Trait Payment Interaction -------------------
async function handleTraitPaymentInteraction(interaction) {
    try {
        const [_, response, encounterId, customizationType] = interaction.customId.split('|');
        const encounter = getEncounterById(encounterId);

        // Ensure the interaction is deferred publicly for processing
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: false });
        }

        // Check if the encounter exists
        if (!encounter) {
            await interaction.editReply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'The encounter could not be found. Please try again.',
                    color: 0xFF0000,
                }],
                ephemeral: false,
            });
            return;
        }

        const mountType = encounter.mountType;

        if (response === 'yes' && customizationType) {
            // Customization Cost Handling
            const cost = customizationCosts[mountType]?.[traitKey] || 0;
console.log(`[handleTraitSelection]: Fetching cost for Trait Key: ${traitKey}, Mount Type: ${mountType}`);
console.log(`[handleTraitSelection]: Customization Costs for ${mountType}:`, customizationCosts[mountType]);
console.log(`[handleTraitSelection]: Resolved cost: ${cost}`);
            encounter.totalSpent += cost;
            storeEncounter(encounterId, encounter);
     
            if (!cost) {
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Invalid Customization',
                        description: 'The customization type is not valid for this mount.',
                        color: 0xFF0000,
                    }],
                    ephemeral: true,
                });
                return;
            }

            // Fetch character and validate tokens
            const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
            const character = await fetchCharacterByName(userInEncounter.characterName);

            if (!character) {
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Character Not Found',
                        description: 'Could not retrieve your character. Please try again later.',
                        color: 0xFF0000,
                    }],
                    ephemeral: true,
                });
                return;
            }

            if (character.tokens < cost) {
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Insufficient Tokens',
                        description: `You need **${cost} tokens** for this customization. You currently have **${character.tokens} tokens**.`,
                        color: 0xFF0000,
                    }],
                    ephemeral: true,
                });
                return;
            }

            // Deduct tokens and save
            if (isNaN(character.tokens) || isNaN(cost)) {
                throw new Error(`Invalid token value or cost. Tokens: ${character.tokens}, Cost: ${cost}`);
            }
            character.tokens -= cost;
            await character.save();

            // Update encounter total spent
            encounter.totalSpent += cost;
            storeEncounter(encounterId, encounter);

            // Log customization in Google Sheets
            if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
                const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
                const auth = await authorizeSheets();
                const range = 'customizationLog!A2:M';
                const uniqueSyncId = uuidv4();
                const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

                const values = [[
                    character.name,
                    mountType,
                    customizationType,
                    `-${cost}`,
                    character.job,
                    character.currentVillage,
                    formattedDateTime,
                    uniqueSyncId
                ]];
                await appendSheetData(auth, spreadsheetId, range, values);
                
            }

// Respond with success
await interaction.editReply({
    embeds: [{
        title: '🎨 Customization Successful!',
        description: `You successfully customized your **${mountType}** with **${customizationType}** for **${cost} tokens**.\n\n💳 **Remaining Tokens:** ${character.tokens}`,
        color: 0xAA926A,
        thumbnail: { url: getMountThumbnail(mountType) },
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
    }],
                ephemeral: false,
            });            

        } else if (response === 'yes') {
            // Handle trait selection for customization
            const mountTraitsMap = {
                Horse: horseTraits,
                Donkey: donkeyTraits,
                Ostrich: ostrichTraits,
                Bullbo: bullboTraits,
                Dodongo: dodongoTraits,
                MountainGoat: mountainGoatTraits,
                WaterBuffalo: waterBuffaloTraits,
                Deer: deerTraits,
                Wolfos: wolfosTraits,
                Bear: bearTraits,
                Moose: mooseTraits,
            };

            const traitsData = mountTraitsMap[mountType];

            if (!traitsData) {
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Unsupported Mount Type',
                        description: `Customization is not available for ${mountType}.`,
                        color: 0xFF0000,
                    }],
                    ephemeral: false,
                });
                return;
            }

            const traitKeys = Object.keys(traitsData);
            const firstTrait = traitKeys[0];
            const traitOptions = traitsData[firstTrait]?.traits;

            if (!traitOptions) {
                console.error(`Traits for first trait '${firstTrait}' are undefined.`);
                await interaction.editReply({
                    embeds: [{
                        title: '❌ Error',
                        description: `Traits for the first customization option are not available.`,
                        color: 0xFF0000,
                    }],
                    ephemeral: true,
                });
                return;
            }

            const buttons = Object.entries(traitOptions).map(([key, value]) =>
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${firstTrait}|${key}`)
                    .setLabel(`${value} (${customizationCosts[mountType]?.[firstTrait] || 0}t)`) // Add token cost to label
                    .setStyle(ButtonStyle.Primary)            
            );
            

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${firstTrait}|random`)
                    .setLabel('Random (0t)')
                    .setStyle(ButtonStyle.Secondary)
            );

            const actionRows = createActionRows(buttons);

            await interaction.message.edit({
                components: [], // Remove Yes/No buttons after click
            });

            await interaction.editReply({
                embeds: [{
                    title: `🎨 Customize Your ${mountType}`,
                    description: `🛠️ **Select ${firstTrait.replace(/([A-Z])/g, ' $1')}** for your mount!\n\n💰 **Each option shows the token cost.**`,
                    color: 0xAA926A ,
                    thumbnail: {
                        url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    },
                }],
                components: actionRows,
                ephemeral: false,
            });

        } else if (response === 'no') {
            await interaction.message.edit({
                components: [], // Clear the Yes/No buttons
            });
            // Handle random trait generation
            let traits;
            switch (mountType) {
                case 'Horse':
                    traits = generateHorseTraits(encounter.rarity === 'Rare');
                    break;
                case 'Donkey':
                    traits = generateDonkeyTraits(encounter.rarity === 'Rare');
                    break;
                case 'Ostrich':
                    traits = generateOstrichTraits(encounter.rarity === 'Rare');
                    break;
                case 'Bullbo':
                    traits = generateBullboTraits(encounter.rarity === 'Rare');
                    break;
                case 'Dodongo':
                    traits = generateDodongoTraits(encounter.rarity === 'Rare');
                    break;
                case 'Mountain Goat':
                    traits = generateMountainGoatTraits(encounter.rarity === 'Rare');
                    break;
                case 'Water Buffalo':
                    traits = generateWaterBuffaloTraits(encounter.rarity === 'Rare');
                    break;
                case 'Deer':
                    traits = generateDeerTraits(encounter.rarity === 'Rare');
                    break;
                case 'Wolfos':
                    traits = generateWolfosTraits(encounter.rarity === 'Rare');
                    break;
                case 'Moose':
                    traits = generateMooseTraits(encounter.rarity === 'Rare');
                    break;
                case 'Bear':
                    traits = generateBearTraits(encounter.rarity === 'Rare');
                    break;
                default:
                    traits = { error: 'Unknown mount type.' };
                    console.error(`Unknown mount type: ${mountType}`);
            }

            if (!traits || Object.keys(traits).length === 0) {
                console.error(`Trait generation failed for mount type: ${mountType}`);
                traits = { error: 'Failed to generate traits.' };
            }

            const traitDescriptions = Object.entries(traits)
                .map(([key, value]) => `**${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:** ${value}`)
                .join('\n');

            const mountEmoji = getMountEmoji(mountType);

            const embedMessage = {
                title: `${mountEmoji} 🎉 Traits for Your Tamed ${mountType}`,
                description: `👀 **Here's a detailed look at your mount's traits:**\n\n${traitDescriptions}\n\n🟢 **Ready to name and register your new companion?**`,
                color: 0xAA926A ,
                thumbnail: {
                    url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                footer: {
                    text: `Congratulations on your new ${mountType}!`,
                },
            };

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`register-mount|${encounterId}`)
                    .setLabel('🐴 Name and Register Your Mount!')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({
                embeds: [embedMessage],
                components: [actionRow],
                ephemeral: false,
            });
        }
    } catch (error) {
        console.error('[handleTraitPaymentInteraction]: Error processing trait payment:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again later.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }
    }
}

// ------------------- Handle Trait Selection -------------------
async function handleTraitSelection(interaction) {
    try {
        const [_, encounterId, traitKey, selection] = interaction.customId.split('|');
        let encounter = getEncounterById(encounterId);

        // Validate the encounter
        if (!encounter) {
            console.error(`[handleTraitSelection]: Encounter not found. ID: ${encounterId}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'Please try again.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        const mountType = encounter.mountType;
        console.log(`[handleTraitSelection]: Mount Type: ${mountType}, Encounter ID: ${encounterId}`);

        // Initialize or validate totalSpent
        if (typeof encounter.totalSpent !== 'number' || isNaN(encounter.totalSpent)) {
            encounter.totalSpent = 0; // Initialize if undefined
            console.log(`[handleTraitSelection]: Initialized totalSpent to 0.`);
        } else {
            console.log(`[handleTraitSelection]: Existing totalSpent: ${encounter.totalSpent}`);
        }

        // Map mount types to trait data
        const mountTraitsMap = {
            Horse: horseTraits,
            Donkey: donkeyTraits,
            Ostrich: ostrichTraits,
            Bullbo: bullboTraits,
            Dodongo: dodongoTraits,
            MountainGoat: mountainGoatTraits,
            WaterBuffalo: waterBuffaloTraits,
            Deer: deerTraits,
            Wolfos: wolfosTraits,
            Bear: bearTraits,
            Moose: mooseTraits,
        };

        const traitsData = mountTraitsMap[mountType];
        if (!traitsData) {
            console.error(`[handleTraitSelection]: Traits data not found for Mount Type: ${mountType}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Unsupported Mount Type',
                    description: `Customization is not available for ${mountType}.`,
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Handle trait selection or randomization
        const selectedValue = selection === 'random'
            ? Object.values(traitsData[traitKey].traits)[Math.floor(Math.random() * Object.values(traitsData[traitKey].traits).length)]
            : traitsData[traitKey].traits[selection];

        console.log(`[handleTraitSelection]: Trait Key: ${traitKey}, Selection: ${selection}, Selected Value: ${selectedValue}`);

        // Deduct tokens for this customization
        const cost = selection === 'random' ? 0 : customizationCosts[mountType]?.[traitKey] || 0;
        console.log(`[handleTraitSelection]: Resolved cost: ${cost}`);
        console.log(`[handleTraitSelection]: Fetching cost for Trait Key: ${traitKey}, Mount Type: ${mountType}`);
        console.log(`[handleTraitSelection]: Customization Costs for ${mountType}:`, customizationCosts[mountType]);
        console.log(`[handleTraitSelection]: Cost for ${traitKey}: ${cost}`);

        const user = await getOrCreateToken(interaction.user.id); // Fetch user tokens
        if (typeof user.tokens !== 'number') {
            console.error('[handleTraitSelection]: User tokens are invalid or not a number.');
            throw new Error(`Invalid tokens for user ${interaction.user.id}. Value: ${user.tokens}`);
        }

        if (cost > 0) {
            if (user.tokens < cost) {
                console.warn(`[handleTraitSelection]: Insufficient tokens. Needed: ${cost}, Available: ${user.tokens}`);
                await interaction.reply({
                    embeds: [{
                        title: '❌ Insufficient Tokens',
                        description: `You need **${cost} tokens** for this customization. You currently have **${user.tokens} tokens**.`,
                        color: 0xFF0000,
                    }],
                    ephemeral: true,
                });
                return;
            }

            user.tokens -= cost;
            await user.save();
            console.log(`[handleTraitSelection]: Deducted ${cost} tokens. Remaining: ${user.tokens}`);

            // Log token usage in Google Sheets
            if (isValidGoogleSheetsUrl(user.tokenTracker)) {
                const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
                const auth = await authorizeSheets();

                const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
                const values = [
                    [`${mountType} Customization - ${traitKey}`, interactionUrl, 'Other', 'spent', `-${cost}`]
                ];

                await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', values);
                console.log(`[handleTraitSelection]: Logged token usage to Google Sheets for user ${interaction.user.id}.`);
            }
        }

        // Update and persist totalSpent
        encounter.totalSpent += cost;
        console.log(`[handleTraitSelection]: Updated totalSpent: ${encounter.totalSpent}`);

        // Update traits and persist encounter
        encounter.traits = encounter.traits || {};
        encounter.traits[traitKey] = selectedValue;

        // Track explicitly customized traits
        encounter.customizedTraits = encounter.customizedTraits || [];
        if (selection !== 'random' && !encounter.customizedTraits.includes(traitKey)) {
            encounter.customizedTraits.push(traitKey);
        }
        storeEncounter(encounterId, encounter);

        // Provide feedback for selected trait
        await interaction.update({
            embeds: [{
                title: `🎨 ${mountType} Customization`,
                description: `🛠️ **${traitKey.replace(/([A-Z])/g, ' $1')}** has been set to **${selectedValue}**!`,
                color: 0xAA926A,
                thumbnail: {
                    url: getMountThumbnail(mountType) || 'https://example.com/default-thumbnail.png',
                },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
                }
            }],
            components: [],
        });

        // Determine next trait
        const traitKeys = Object.keys(traitsData);
        const filteredTraitKeys = traitKeys.filter(key => key !== 'rareColors' || encounter.rarity === 'Rare');
        const currentIndex = filteredTraitKeys.indexOf(traitKey);
        const nextTrait = filteredTraitKeys[currentIndex + 1];

        console.log(`[handleTraitSelection]: Current Trait: ${traitKey}, Next Trait: ${nextTrait}`);

        if (nextTrait) {
            const nextOptions = traitsData[nextTrait]?.traits;
            if (!nextOptions) {
                console.error(`[handleTraitSelection]: Traits for next trait '${nextTrait}' are undefined.`);
                return;
            }

            const buttons = Object.entries(nextOptions).map(([key, value]) =>
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${nextTrait}|${key}`)
                    .setLabel(`${value} (${customizationCosts[mountType]?.[nextTrait] || 0}t)`)
                    .setStyle(ButtonStyle.Primary)
            );

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${nextTrait}|random`)
                    .setLabel('Random (0t)')
                    .setStyle(ButtonStyle.Secondary)
            );

            const actionRows = createActionRows(buttons);

            await interaction.followUp({
                embeds: [{
                    title: `🎨 Customize Your ${mountType}`,
                    description: `🛠️ Select **${nextTrait.replace(/([A-Z])/g, ' $1')}** for your mount`,
                    color: 0xAA926A,
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
                    }
                }],
                components: actionRows,
                ephemeral: false,
            });

        } else {
            // Finalize customization if no next trait
            const traitDescriptions = Object.entries(encounter.traits)
            .map(([key, value]) => {
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return `**${formattedKey}:** ${value}`;
            })
            .join('\n');

            const registerButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`register-mount|${encounterId}`)
                    .setLabel('🐴 Name and Register Your Mount!')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.followUp({
                embeds: [{
                    title: `${getMountEmoji(mountType)} 🎉 Customization Complete!`,
                    description: `🎉 **Here's your ${mountType} mount!**\n\n${traitDescriptions}\n\n💰 **Total Tokens Spent:** ${encounter.totalSpent}\n### Mount Details\n> **Mount Species**: ${mountType}\n> **Rarity**: It's a **${encounter.rarity}** mount!\n> **Mount Level**: ${encounter.mountLevel}\n> **Mount Stamina**: ${encounter.mountStamina}\n> **Village**: ${villageEmojis[encounter.village.toLowerCase()] || ''} ${encounter.village}`,
                    color: 0xAA926A,
                    thumbnail: {
                        url: getMountThumbnail(mountType) || 'https://example.com/default-thumbnail.png',
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    }
                }],
                components: [registerButton],
            });
        }
    } catch (error) {
        console.error('[handleTraitSelection]: Error during trait selection:', error);
        if (!interaction.replied) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'Something went wrong. Please try again later.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }
    }
}

// ------------------- handle Register Mount Modal -------------------
async function handleRegisterMountModal(interaction) {
    try {
        // Extract encounter ID from the interaction's custom ID
        const [_, encounterId] = interaction.customId.split('|');
        const encounter = getEncounterById(encounterId);

        // Validate the encounter
        if (!encounter) {
            console.error(`Encounter not found for ID: ${encounterId}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'The encounter could not be found.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Create the modal for naming the mount
        const modal = new ModalBuilder()
            .setCustomId(`mount-name-modal|${encounterId}`)
            .setTitle('Name Your Mount');

        // Add a text input field for the mount's name
        const nameInput = new TextInputBuilder()
            .setCustomId('mountName')
            .setLabel('Enter the name for your mount:')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(nameInput);

        modal.addComponents(actionRow);

        // Display the modal to the user
        await interaction.showModal(modal);
    } catch (error) {
        console.error('[handleRegisterMountModal]: Error handling mount registration modal:', error);
        if (!interaction.replied) {
            await interaction.reply({
                embeds: [{
                    title: '❌ Error',
                    description: 'An error occurred while trying to register your mount. Please try again later.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }
    }
}

// ------------------- Handle Mount Name Submission -------------------
// ------------------- Handle Mount Name Submission -------------------
async function handleMountNameSubmission(interaction) {
    try {
        // Extract the encounter ID and mount name from the interaction
        const [_, encounterId] = interaction.customId.split('|');
        const mountName = interaction.fields.getTextInputValue('mountName');
        const encounter = getEncounterById(encounterId);

        // Validate the encounter
        if (!encounter) {
            console.error(`[handleMountNameSubmission]: Encounter not found for ID: ${encounterId}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Encounter Not Found',
                    description: 'The encounter could not be found.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Retrieve the user from the encounter
        const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
        if (!userInEncounter) {
            console.error(`[handleMountNameSubmission]: User ${interaction.user.id} is not part of the encounter.`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Unauthorized',
                    description: 'You are not part of this encounter.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Fetch the character associated with the user
        const characterName = userInEncounter.characterName;
        if (!characterName) {
            console.error(`[handleMountNameSubmission]: Character name is missing in the encounter data.`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: 'Could not find the character associated with this mount. Please ensure you are properly registered in the encounter.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        const character = await Character.findOne({ name: characterName });
        if (!character) {
            console.error(`[handleMountNameSubmission]: Character not found for name: ${characterName}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: `Could not find the character "${characterName}" in the database.`,
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Deduct tokens from the user
        const user = await User.findOne({ discordId: interaction.user.id });
        const tokenCost = 20;
        if (user.tokens < tokenCost) {
            console.warn(`[handleMountNameSubmission]: Insufficient tokens. Available: ${user.tokens}, Required: ${tokenCost}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Insufficient Tokens',
                    description: `You need **${tokenCost} tokens** to register a mount, but you only have **${user.tokens} tokens**.`,
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        user.tokens -= tokenCost;
        await user.save();
        console.info(`[handleMountNameSubmission]: Tokens deducted successfully. Remaining tokens: ${user.tokens}`);

        // Log the token deduction in Google Sheets
        let sheetLogged = false;
        if (isValidGoogleSheetsUrl(user.tokenTracker)) {
            const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
            const auth = await authorizeSheets();
            const range = 'loggedTracker!B7:F';
            const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: user.timezone || 'UTC' });
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            const values = [
                [
                    `${mountName} - Mount Registration`,  // Column 1: The mount's name and action
                    interactionUrl,               // Column 2: Link to the interaction
                    'Other',                      // Column 3: Category
                    'spent',                      // Column 4: Action
                    `- ${tokenCost}`,             // Column 5: Deducted Tokens
                ]
            ];

            await appendSheetData(auth, spreadsheetId, range, values);
            sheetLogged = true;
            console.info(`[handleMountNameSubmission]: Token deduction logged to Google Sheets successfully.`);
        }

        // Ensure traits are properly formatted as strings
        const traits = encounter.traits
    ? Object.entries(encounter.traits).map(([key, value]) => `${key}: ${value}`)
    : [];

        // Register the mount
        const mountData = {
            discordId: interaction.user.id,
            characterId: character._id,
            species: encounter.mountType,
            level: encounter.mountLevel,
            appearance: encounter.traits,
            name: mountName,
            stamina: encounter.mountStamina,
            owner: character.name,
            traits: traits, // Properly formatted traits
            region: encounter.village,
        };

        const newMount = new Mount(mountData);
        await newMount.save();
        console.info(`[handleMountNameSubmission]: Mount "${mountName}" registered successfully for character: ${character.name}`);

        // Update the character's mount status after successful registration
        character.mount = true;
        await character.save();
        console.info(`[handleMountNameSubmission]: Mount status updated for character: ${character.name}`);

        // Disable the "Name and Register Your Mount!" button
        await interaction.message.edit({
            components: [], // Clear buttons after action
        });

        // Provide success feedback to the user
        await interaction.reply({
            embeds: [{
                title: `🎉 Mount Registered!`,
                description: `🐴 **Your mount "${mountName}" has been successfully registered to "${character.name}"!**\n\nEnjoy your adventures with your new companion!`,
                color: 0xAA926A,
                thumbnail: {
                    url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
            }],
            ephemeral: false,
        });
    } catch (error) {
        console.error('[handleMountNameSubmission]: Error registering mount:', error);
        await interaction.reply({
            embeds: [{
                title: '❌ Registration Failed',
                description: 'An error occurred while saving the mount. Please try again later.',
                color: 0xFF0000,
            }],
            ephemeral: true,
        });
    }
}

// ------------------- Handle View Mount Subcommand -------------------
// ------------------- Handle View Mount Subcommand -------------------
async function handleViewMount(interaction) {
    const characterName = interaction.options.getString('charactername');

    try {
        // Fetch the character
        const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
        if (!character) {
            return interaction.reply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: `We couldn't find a character named **${characterName}** that belongs to you. Please check and try again.`,
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }

        // Fetch the mount associated with the character
        const mount = await Mount.findOne({ characterId: character._id });
        if (!mount) {
            return interaction.reply({
                embeds: [{
                    title: '❌ No Mount Registered',
                    description: `The character **${character.name}** does not have a registered mount.`,
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
        }

        // Get the emoji for the mount species
        const speciesEmoji = getMountEmoji(mount.species);

        // Format traits into a clean list
        const formattedTraits = mount.traits && mount.traits.length
            ? mount.traits.map(trait => `> ${trait}`).join('\n')
            : 'No traits available';

        // Build the embed message for the mount
        const mountEmbed = new EmbedBuilder()
            .setTitle(`${speciesEmoji} **${mount.name}** - Mount Details`)
            .setDescription(`✨ **Mount Stats for**: **${character.name}**`)
            .addFields(
                    { name: '🌟 **__Species__**', value: `> ${mount.species || 'Unknown'}`, inline: true },
                    { name: '#️⃣ **__Level__**', value: `> ${mount.level || 'Unknown'}`, inline: true },
                    { name: '🥕 **__Stamina__**', value: `> ${mount.stamina || 'Unknown'}`, inline: true },
                    { name: '👤 **__Owner__**', value: `> ${mount.owner || 'Unknown'}`, inline: true },
                    { name: '🌍 **__Region__**', value: `> ${mount.region || 'Unknown'}`, inline: true },
                    { name: '✨ **__Traits__**', value: `${formattedTraits}`, inline: false }
                )                
            .setColor(0xAA926A)
            .setThumbnail(getMountThumbnail(mount.species))
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Consistent image
            .setFooter({
                text: `${character.name}'s Mount Stats`,
                iconURL: character.icon // Use the character's icon for the footer
            })
            .setTimestamp();

        // Send the embed to the user
        await interaction.reply({
            embeds: [mountEmbed],
            ephemeral: false,
        });
    } catch (error) {
        console.error('[handleViewMount]: Error viewing mount:', error);
        await interaction.reply({
            embeds: [{
                title: '❌ Error Viewing Mount',
                description: 'An error occurred while fetching the mount details. Please try again later.',
                color: 0xFF0000,
            }],
            ephemeral: true,
        });
    }
}


// ------------------- Export Functions -------------------
// Export the core interaction and taming functions for use in other modules.
module.exports = {
    createActionRows,
    formatEncounterData,
    handleMountComponentInteraction,
    handleMountNameSubmission,
    handlePostTameInteraction,
    handleRegisterMountModal,
    handleTameInteraction,
    handleTraitPaymentInteraction,
    handleTraitSelection,
    handleUseItemInteraction,
    proceedWithRoll,
    trackCharacterInEncounter,
    handleViewMount
}
