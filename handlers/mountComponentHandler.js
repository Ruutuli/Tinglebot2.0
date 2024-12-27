// ------------------- Imports -------------------

// Discord.js Components
const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Database Services
const { fetchCharacterByName, fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../database/characterService');
const Mount = require('../models/MountModel');
const Character = require('../models/CharacterModel');

// Modules
const { 
    deleteEncounterById, 
    distractionItems, 
    generateBearTraits, 
    generateBullboTraits, 
    generateDeerTraits, 
    generateDonkeyTraits, 
    generateDodongoTraits, 
    generateMountainGoatTraits, 
    generateMooseTraits, 
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
    ostrichTraits, 
    storeEncounter, 
    useDistractionItem, 
    waterBuffaloTraits, 
    wolfosTraits, 
    bearTraits, 
    bullboTraits, 
    deerTraits, 
    donkeyTraits, 
    dodongoTraits, 
    mountainGoatTraits 
} = require('../modules/mountModule');

// Utility Imports
const { useStamina, checkAndUseStamina } = require('../modules/characterStatsModule');

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
        color: 0x00FF00,
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

    const roll = 20 //Math.floor(Math.random() * 20) + 1; // Set roll to 20 for testing (use Math.random for real rolls)
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
        if (action === 'distract' && adjustedRoll >= 7) success = true;
        if (action === 'corner' && adjustedRoll >= 7) success = true;
        if (action === 'rush' && adjustedRoll >= 17) success = true;
        if (action === 'glide' && adjustedRoll >= 17) success = true;

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
                    color: 0x00FF00,
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
        if (nat20) {
            message += `🎉 **Natural 20! Automatic Success!** ${characterName} has successfully tamed the mount! 🐴\n\n`;
        } else if (successes >= mountStamina) {
            message += `🎉 **Success!** ${characterName} has successfully tamed the mount! 🐴\n\n`;
        }

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

        await interaction.editReply({
            embeds: [{
                title: `${getMountEmoji(encounter.mountType)} Tamed ${encounter.mountType} Successfully!`,
                description: message,
                color: 0x00FF00,
                author: { name: character.name, icon_url: character.icon },
                thumbnail: { url: getMountThumbnail(encounter.mountType) },
                image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
            }],
            components: [actionRow],
            ephemeral: false
        });
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
                    description: 'Please try again.', 
                    color: 0xFF0000 
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
                    description: 'This item cannot be used to distract the current mount.',
                    color: 0xFF0000,
                }],
                ephemeral: false,
            });
            return;
        }

        // Roll and calculate distraction result
        const roll = Math.floor(Math.random() * 20) + 1;
        const adjustedRoll = roll + bonus;
        const success = adjustedRoll >= 7;

        // Build the result message
        let message = `🎲 **Rolled a ${roll}**, with a distraction bonus of **+${bonus}**, for a total of **${adjustedRoll}**.\n\n`;

        if (success) {
            message += `🎉 **Success!** You distracted the mount effectively!\n\n🟢 **The mount is now vulnerable to your next action!**`;

            // Find the character in the encounter
            const character = encounter.users.find(user => user.userId === interaction.user.id);
            if (!character) {
                await interaction.editReply({
                    embeds: [{
                        title: `❌ Character Not Found`,
                        description: `Unable to proceed with the encounter. Please ensure your character is properly registered.`,
                        color: 0xFF0000,
                        thumbnail: { 
                            url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                        },
                        image: { 
                            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                        },
                    }],
                    components: [],
                });
                return;
            }

            // Add a button for taming the mount
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tame|${encounter.village}|${encounterId}`)
                    .setLabel('🐴 Tame the Mount!')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(mountType)} 🎯 Distract Success!`,
                    description: `${message}\n\n**Prepare to tame the mount!**`,
                    color: 0x00FF00,
                    thumbnail: { 
                        url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                    },
                    image: { 
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                    },
                }],
                components: [actionRow],
                ephemeral: false,
            });
        } else {
            message += `🚫 **The mount evaded despite your efforts!**\n\n💡 **Tip:** Use distraction items or bonuses to improve your chances.`;

            // Add a retry button for another distraction attempt
            const retryButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`distract|${encounter.village}|${encounterId}`)
                    .setLabel('🔄 Try Distracting Again')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(mountType)} ❌ Distract Failed`,
                    description: message,
                    color: 0xFF0000,
                    thumbnail: { 
                        url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                    },
                    image: { 
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' 
                    },
                }],
                components: [retryButton],
                ephemeral: false,
            });
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
                    color: 0xFF0000
                }],
                ephemeral: true
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
            color: rarity === 'Rare' ? 0xFFD700 : 0x00FF00,
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

// ------------------- handleTraitPaymentInteraction -------------------
async function handleTraitPaymentInteraction(interaction) {
    try {
        // Parse the interaction ID to retrieve response and encounter ID
        const [_, response, encounterId] = interaction.customId.split('|');
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

        if (response === 'yes') {
            const mountType = encounter.mountType;

            // Map mount types to their respective trait data
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

            // Handle unsupported mount types
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

            // Retrieve the first trait and its options
            const traitKeys = Object.keys(traitsData);
            const firstTrait = traitKeys[0];
            const traitOptions = traitsData[firstTrait]?.traits;

            // Handle missing trait options
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

            // Generate buttons for the first trait
            const buttons = Object.entries(traitOptions).map(([key, value]) =>
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${firstTrait}|${key}`)
                    .setLabel(value)
                    .setStyle(ButtonStyle.Primary)
            );

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${firstTrait}|random`)
                    .setLabel('None (Random)')
                    .setStyle(ButtonStyle.Secondary)
            );

            // Split buttons into rows of 5 or fewer
            const actionRows = createActionRows(buttons);

            await interaction.editReply({
                embeds: [{
                    title: `🎨 Customize Your ${mountType}`,
                    description: `🛠️ **Select** **${firstTrait.replace(/([A-Z])/g, ' $1')}** for your mount!`,
                    color: 0x00FF00,
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
            // Generate traits for the mount based on type and rarity
            let traits;
            switch (encounter.mountType) {
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
                    console.error(`Unknown mount type: ${encounter.mountType}`);
            }

            if (!traits || Object.keys(traits).length === 0) {
                console.error(`Trait generation failed for mount type: ${encounter.mountType}`);
                traits = { error: 'Failed to generate traits.' };
            }

            // Construct trait descriptions
            const traitDescriptions = Object.entries(traits)
                .map(([key, value]) => `**${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:** ${value}`)
                .join('\n');

            const mountEmoji = getMountEmoji(encounter.mountType);

            const embedMessage = {
                title: `${mountEmoji} 🎉 Traits for Your Tamed ${encounter.mountType}`,
                description: `👀 **Here's a detailed look at your mount's traits:**\n\n${traitDescriptions}\n\n🟢 **Ready to name and register your new companion?**`,
                color: 0x00FF00,
                thumbnail: {
                    url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                footer: {
                    text: `Congratulations on your new ${encounter.mountType}!`,
                },
            };

            // Add a button to register the mount
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
        console.error('[handleTraitPaymentInteraction]: Error handling trait payment interaction:', error);
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

// ------------------- handle Trait Selection -------------------
async function handleTraitSelection(interaction) {
    try {
        const [_, encounterId, traitKey, selection] = interaction.customId.split('|');
        let encounter = getEncounterById(encounterId);

        // Validate the encounter
        if (!encounter) {
            console.error(`Encounter not found for ID: ${encounterId}`);
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
        console.log(`Mount Type: ${mountType}`);

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
            console.error(`Traits data not found for Mount Type: ${mountType}`);
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

        console.log(`Selected Trait Key: ${traitKey}, Selection: ${selection}, Selected Value: ${selectedValue}`);

        // Update traits and save encounter
        encounter.traits = encounter.traits || {};
        encounter.traits[traitKey] = selectedValue;
        storeEncounter(encounterId, encounter);

        // Re-fetch encounter to confirm update
        encounter = getEncounterById(encounterId);
        if (!encounter?.traits) {
            console.error('Traits not found after re-fetching encounter.');
            await interaction.followUp({
                embeds: [{
                    title: '❌ Error',
                    description: 'Failed to retrieve updated traits. Please try again.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Provide feedback for selected trait
        await interaction.update({
            embeds: [{
                title: `🎨 ${mountType} Customization`,
                description: `🛠️ **${traitKey.replace(/([A-Z])/g, ' $1')}** has been selected as **${selectedValue}**!`,
                color: 0x00FF00,
                thumbnail: {
                    url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
            }],
            components: [],
        });

        // Determine next trait
        const traitKeys = Object.keys(traitsData);
        const filteredTraitKeys = traitKeys.filter(key => key !== 'rareColors' || encounter.rarity === 'Rare');
        const currentIndex = filteredTraitKeys.indexOf(traitKey);
        const nextTrait = filteredTraitKeys[currentIndex + 1];

        console.log(`Current Trait: ${traitKey}, Next Trait: ${nextTrait}`);

        if (nextTrait) {
            const nextOptions = traitsData[nextTrait]?.traits;

            if (!nextOptions) {
                console.error(`Traits for next trait '${nextTrait}' are undefined.`);
                return;
            }

            // Generate buttons for next trait
            const buttons = Object.entries(nextOptions).map(([key, value]) =>
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${nextTrait}|${key}`)
                    .setLabel(value)
                    .setStyle(ButtonStyle.Primary)
            );

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`trait-select|${encounterId}|${nextTrait}|random`)
                    .setLabel('None (Random)')
                    .setStyle(ButtonStyle.Secondary)
            );

            const actionRows = createActionRows(buttons);

            await interaction.followUp({
                embeds: [{
                    title: `🎨 Customize Your ${mountType}`,
                    description: `🛠️ Select **${nextTrait.replace(/([A-Z])/g, ' $1')}** for your mount to make it truly unique!`,
                    color: 0x00FF00,
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
        } else {
            // Finalize customization if no next trait
            const traitDescriptions = Object.entries(encounter.traits)
                .map(([key, value]) => {
                    const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return `**${formattedKey}:** ${value}`;
                })
                .join('\n');

            console.log(`Final Traits for ${mountType}:`, encounter.traits);

            const registerButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`register-mount|${encounterId}`)
                    .setLabel('🐴 Name and Register Your Mount!')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.followUp({
                embeds: [{
                    title: `${getMountEmoji(mountType)} 🎉 Customization Complete!`,
                    description: `🎉 **Here's your fully customized mount:**\n\n${traitDescriptions}`,
                    color: 0x00FF00,
                    thumbnail: {
                        url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    },
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

// ------------------- handle Mount Name Submission -------------------
async function handleMountNameSubmission(interaction) {
    try {
        // Extract the encounter ID and mount name from the interaction
        const [_, encounterId] = interaction.customId.split('|');
        const mountName = interaction.fields.getTextInputValue('mountName');
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

        // Validate that the user is part of the encounter
        const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
        if (!userInEncounter) {
            console.error(`User ${interaction.user.id} is not part of the encounter.`);
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
        const character = await Character.findOne({ name: userInEncounter.characterName });
        if (!character) {
            console.error(`Character not found for name: ${userInEncounter.characterName}`);
            await interaction.reply({
                embeds: [{
                    title: '❌ Character Not Found',
                    description: 'Could not find your character in the database.',
                    color: 0xFF0000,
                }],
                ephemeral: true,
            });
            return;
        }

        // Construct the mount data
        const mountData = {
            discordId: interaction.user.id,
            characterId: character._id,
            species: encounter.mountType,
            level: encounter.mountLevel,
            appearance: encounter.traits,
            name: mountName,
            stamina: encounter.mountStamina,
            owner: character.name,
            traits: Object.values(encounter.traits).map(value => String(value)), // Ensure traits are strings
            region: encounter.village, // Align with schema
        };

        // Save the new mount and update the character
        const newMount = new Mount(mountData);
        await newMount.save();

        character.mount = true;
        await character.save();

        // Provide success feedback to the user
        await interaction.reply({
            embeds: [{
                title: `🎉 Mount Registered!`,
                description: `🐴 **Your mount "${mountName}" has been successfully registered to "${character.name}"!**\n\nEnjoy your adventures with your new companion!`,
                color: 0x00FF00,
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
    trackCharacterInEncounter
}
