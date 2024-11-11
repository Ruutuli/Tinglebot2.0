// ------------------- Imports -------------------
// Import required modules from local and third-party sources
const { getEncounterById, storeEncounter, getRandomMount, getMountRarity, getMountStamina, getRandomEnvironment, getMountThumbnail, getMountEmoji, deleteEncounterById } = require('../modules/mountModule');
const { fetchCharacterByName } = require('../database/characterService');  // Import character fetching service
const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    const mountThumbnail = getMountThumbnail(mountType);  // Get the thumbnail for the mount type

    return {
        title: `🎉 ${characterName} Rolled a 20! 🎉`,
        description: '**Congratulations!** You have the opportunity to catch the mount!',
        author: {
            name: characterName,  // Character's name
            icon_url: characterIcon  // Character's icon URL
        },
        fields: [
            {
                name: 'Mount Details',
                value: `> **Mount Species**: ${mountType}\n> **Rarity**: It's a **${rarity}** mount!\n> **Mount Level**: ${mountLevel}\n> **Mount Stamina**: ${mountStamina}\n> **Environment**: ${environment}\n> **Village**: ${village}`,
                inline: false
            },
            {
                name: 'Stamina',
                value: `**${characterName}** currently has **${characterStamina}** stamina. What would ${characterName} like to do?`,
                inline: false
            }
        ],
        color: 0x00FF00,
        image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        thumbnail: {
            url: mountThumbnail  // Set the mount-specific thumbnail
        }
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

    // Only include Glide on the first round if glide hasn't been used
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
    const userInEncounter = encounter.users.find(user => user.characterName === character.name);

    // If the character is not already tracked in the encounter, add it along with the userId
    if (!userInEncounter) {
        encounter.users.push({
            characterName: character.name,
            userId: userId // Save the user ID for ownership checks
        });
        // Store the updated encounter with the userId
        storeEncounter(encounterId, encounter);
    }
}

// ------------------- Proceed with Roll Function -------------------
// Handles the rolling of a 20 and determines if the mount encounter continues.
async function proceedWithRoll(interaction, characterName, encounterId) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const character = await fetchCharacterByName(characterName.name ? characterName.name : characterName);

    if (!character) {
        await interaction.editReply({ embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }], ephemeral: true });
        return;
    }

    const roll = 20;  // Set this to the actual roll value in your implementation
    const encounter = getEncounterById(encounterId);  // Retrieve encounter details from the JSON
    if (!encounter) {
        await interaction.editReply({ embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }], ephemeral: true });
        return;
    }

    // Ensure village is correctly defined in encounter
    const village = encounter.village;  // Retrieve village from the encounter

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
            encounter.environment = getRandomEnvironment(encounter.village);
        }

        if (encounter.mountType === 'To be determined') {
            const randomMount = getRandomMount(encounter.village);
            encounter.mountType = randomMount.mount;
            encounter.mountLevel = randomMount.level;
            encounter.village = randomMount.village;  // Ensure village is set in the encounter
        }

        // Track character in the encounter and set rollerId
        await trackCharacterInEncounter(character, encounterId, encounter, interaction.user.id);

        // Store the ID of the user who rolled the 20
        encounter.rollerId = interaction.user.id;  // Store the user ID who rolled the 20
        storeEncounter(encounterId, encounter);  // Save encounter with the rollerId

        // Format success message with character's stamina and icon
        const embedMessage = formatEncounterData(encounter, character.name, character.currentStamina, character.icon);
        const actionButtons = createActionButtons(encounterId, village, encounter.glideUsed);  // Pass glideUsed flag

        // Send the success message with action buttons (Glide will be removed if it was used)
        await interaction.editReply({
            components: [actionButtons],  // Updated buttons based on glideUsed
            embeds: [embedMessage],  // Success embed message
            ephemeral: false
        });
    } else {
        // Handle non-20 rolls
        await interaction.editReply({
            embeds: [{
                title: `${character.name} rolled a **${roll}**!`,
                description: `Keep trying for that natural 20!`,
                color: 0xFFFF00,
                author: {  // Add the author field for character icon here
                    name: character.name,
                    icon_url: character.icon
                }
            }],
            components: [],  // No buttons for non-20 rolls
            ephemeral: false
        });
    }
}


// ------------------- Handle Action Buttons (Sneak, Distract, Corner, Rush, Glide) -------------------
async function handleMountComponentInteraction(interaction) {
    try {
        console.log('Interaction started'); // Log the start of the interaction
  
        const [action, village, encounterId] = interaction.customId.split('|');  // Split the custom ID from the button click
        const encounter = getEncounterById(encounterId);  // Fetch the encounter from the JSON
  
        if (!encounter) {
            console.log('Encounter not found');
            await interaction.reply({ embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }], ephemeral: true });
            return;
        }

        // Check if glide has already been used
        if (action === 'glide' && encounter.glideUsed) {
            await interaction.reply({
                embeds: [{ title: '❌ Glide Unavailable', description: 'You can only use Glide on the first roll.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }
    
        // Proceed with glide if it hasn't been used yet and set glideUsed to true
        if (action === 'glide') {
            encounter.glideUsed = true;
            storeEncounter(encounterId, encounter);  // Save the updated encounter
        }
  
        // Defer reply to avoid InteractionNotReplied error
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();  // Defer the reply, allowing time for logic to process
        }
  
        const userInEncounter = encounter.users.find(user => user.characterName);
        if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
            console.log('Access denied: user not in encounter or userId mismatch.');
            await interaction.editReply({
                embeds: [{ title: '❌ Access Denied', description: 'Only the owner of the character can interact.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }
  
        const character = await fetchCharacterByName(userInEncounter.characterName);  // Fetch the character's data
        if (!character) {
            await interaction.editReply({ embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }], ephemeral: true });
            return;
        }
  
        // Use stamina and check if the character is exhausted
        const staminaResult = await useStamina(character._id, 1);  // Deduct 1 stamina
  
        if (staminaResult.exhausted) {
            // If the character's stamina reaches 0, delete the encounter and notify the user
            deleteEncounterById(encounterId);  // Delete the encounter data from JSON
            await interaction.editReply({
                embeds: [{ title: 'Mount Escaped!', description: staminaResult.message, color: 0xFF0000 }],  // Send exhaustion message
                components: []  // Remove buttons to prevent further interaction
            });
            return;  // Stop further processing since the character is exhausted
        }
  
        // Proceed with the rest of the interaction if the character is not exhausted
        const roll = Math.floor(Math.random() * 20) + 1;
        let adjustedRoll = roll;
        let bonusMessage = '';
        let success = false;
  
        const environment = encounter.environment || 'Unknown';
  
        // Apply environment bonuses or penalties based on the village and action
        if (environment === 'Tall grass' && village === 'Rudania') {
            if (action === 'sneak') {
                adjustedRoll += 1;
                bonusMessage = 'sneak bonus from Tall grass';
            }
            if (action === 'rush') {
                adjustedRoll -= 3;
                bonusMessage = 'penalty for rushing in Tall grass';
            }
        }
  
        if (environment === 'Mountainous' && village === 'Inariko') {
            if (action === 'corner') {
                adjustedRoll += 4;
                bonusMessage = 'cornering bonus from Mountainous terrain';
            }
            if (action === 'glide') {
                adjustedRoll += 2;
                bonusMessage = 'gliding bonus from Mountainous terrain';
            }
        }
  
        if (environment === 'Forest' && village === 'Vhintl') {
            if (action === 'distract') {
                adjustedRoll += 2;
                bonusMessage = 'distracting bonus from the Forest';
            }
            if (action === 'glide') {
                adjustedRoll += 3;
                bonusMessage = 'gliding bonus from the Forest';
            }
        }
  
        // Check for success based on the action and adjusted roll
        if (action === 'sneak' && adjustedRoll >= 5) success = true;
        if (action === 'distract' && adjustedRoll >= 7) success = true;
        if (action === 'corner' && adjustedRoll >= 7) success = true;
        if (action === 'rush' && adjustedRoll >= 17) success = true;
        if (action === 'glide' && adjustedRoll >= 17) success = true;
  
        // Generate the result message based on success or failure
        let message = `**${character.name}** tried a **${action}** strategy and rolled a **${roll}**.`;
        if (bonusMessage) {
            message += ` ${bonusMessage} applied, adjusted roll is **${adjustedRoll}**.`;
        }
  
        if (success) {
            message += `\n\n🎉 Success! ${character.name} moves to the next phase.\n\n${character.name} has **${character.currentStamina}** 🟩 stamina remaining.`;
  
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tame|${village}|${encounterId}`)
                    .setLabel('Tame the Mount!')
                    .setStyle(ButtonStyle.Success)
            );
  
            await interaction.message.edit({
                components: [],  // Remove action buttons
            });
  
            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(encounter.mountType)} ${action.charAt(0).toUpperCase() + action.slice(1)} Attempt!`,
                    description: message,
                    color: 0x00FF00,
                    author: {  
                        name: character.name, // Character's name
                        icon_url: character.icon  // Character's icon
                    },
                    thumbnail: {
                        url: getMountThumbnail(encounter.mountType)  // Add the mount-specific thumbnail
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'  // Added image
                    }
                }],
                components: [actionRow],
                ephemeral: false
            });
  
        } else {
            // Retry button for next attempt if the user fails
            message += `\n\n🚫 The mount evaded! Would **${character.name}** like to try again for 1 stamina?\n\n**${character.name}** now has **${character.currentStamina}** 🟩 stamina remaining.`;
            const retryButtons = createActionButtons(encounterId, village, encounter.glideUsed);  // Pass glideUsed here
  
            await interaction.message.edit({
                components: [],  // Remove all buttons
            });
  
            await interaction.editReply({
                embeds: [{
                    title: 'Mount Evaded!',
                    description: message,
                    color: 0xFFFF00,
                    author: {  
                        name: character.name, // Character's name
                        icon_url: character.icon  // Character's icon
                    },
                    thumbnail: {
                        url: getMountThumbnail(encounter.mountType)  // Add the mount-specific thumbnail
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'  // Added image
                    }
                }],
                components: [retryButtons],  // Retry without Glide if it was used
                ephemeral: false
            });
        }
  
    } catch (error) {
        console.error('Error handling mount action interaction:', error);
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
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        const [_, village, encounterId] = interaction.customId.split('|');
        let encounter = getEncounterById(encounterId);
        if (!encounter) {
            await interaction.editReply({
                embeds: [{ title: '❌ Encounter Not Found', description: 'We couldn\'t find the encounter you are trying to interact with.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        // Restrict interaction to the user who owns the character
        const userInEncounter = encounter.users.find(user => user.characterName);
        if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
            await interaction.editReply({
                embeds: [{ title: '❌ Access Denied', description: 'Only the owner of the character can continue.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        const characterName = userInEncounter.characterName;
        const character = await fetchCharacterByName(characterName);
        if (!character) {
            await interaction.editReply({
                embeds: [{ title: `❌ Character Not Found: ${characterName}`, description: 'Please ensure the character is valid and try again.', color: 0xFF0000 }],
                ephemeral: true
            });
            return;
        }

        const characterStamina = character.currentStamina;

        // If stamina is 0, delete the encounter and inform the user
        if (characterStamina === 0) {
            deleteEncounterById(encounterId);
            await interaction.editReply({
                embeds: [{
                    title: 'Mount Escaped!',
                    description: `**${character.name}** is exhausted! The mount has escaped. Better luck next time!`,
                    color: 0xFF0000,
                    author: {  
                        name: character.name, // Character's name
                        icon_url: character.icon  // Character's icon
                    }
                }],
                components: [],
                ephemeral: false
            });
            return;
        }

        const rolls = Array.from({ length: characterStamina }, () => Math.floor(Math.random() * 20) + 1);
        const nat20 = rolls.includes(20);  // Check if any roll is a natural 20
        const successes = rolls.filter(roll => roll >= 5).length;
        const mountStamina = encounter.mountStamina;

        let message = `🎲 **${characterName} rolled ${characterStamina}d20**: \`${rolls.join(', ')}\`.\n\n`;
        message += `${characterName} needed **${mountStamina}** successes of 5 or higher. ${characterName} got **${successes}**.\n\n`;

        // Check for a natural 20
        if (nat20) {
            message += `🎉 **Natural 20! Automatic Success!** ${characterName} has successfully tamed the mount! 🐴`;

            // Update tameStatus to true
            encounter.tameStatus = true;
            storeEncounter(encounterId, encounter);  // Store the updated encounter with the tameStatus

            // Remove the encounter from the JSON after taming
            deleteEncounterById(encounterId);

            await interaction.message.edit({
                components: []  // Remove all buttons
            });

            await interaction.editReply({
                embeds: [{
                    title: `${getMountEmoji(encounter.mountType)} Mount Tamed Successfully!`,
                    description: message,
                    color: 0x00FF00,
                    author: {  
                        name: character.name, // Character's name
                        icon_url: character.icon  // Character's icon
                    },
                    thumbnail: {
                        url: getMountThumbnail(encounter.mountType)  // Add the mount-specific thumbnail
                    },
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'  // Added image
                    }
                }],
                ephemeral: false
            });
        } else if (successes >= mountStamina) {
            message += `🎉 **Success!** ${characterName} has successfully tamed the mount! 🐴`;

            // Update tameStatus to true
            encounter.tameStatus = true;
            storeEncounter(encounterId, encounter);  // Store the updated encounter with the tameStatus

            // Remove the encounter from the JSON after taming
            deleteEncounterById(encounterId);

            await interaction.message.edit({
                components: []  // Remove all buttons
            });

            await interaction.editReply({
                embeds: [
                    {
                        title: `${getMountEmoji(encounter.mountType)} Mount Tamed Successfully!`,
                        description: message,
                        color: 0x00FF00,
                        image: {
                            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
                        },
                        thumbnail: {
                            url: getMountThumbnail(encounter.mountType)  // Add the mount-specific thumbnail
                        }
                    }
                ],
                ephemeral: false
            });

        } else {
            // Deduct 1 stamina for retry attempt
            const updatedCharacter = await useStamina(character._id, 1);
            const currentStamina = updatedCharacter.currentStamina;

            // If the current stamina becomes 0 after the attempt, delete the encounter
            if (currentStamina === 0) {
                deleteEncounterById(encounterId);
                await interaction.editReply({
                    embeds: [{
                        title: 'Mount Escaped!',
                        description: `**${characterName}** is exhausted! The mount has escaped. Better luck next time!`,
                        color: 0xFF0000
                    }],
                    components: [],  // Remove buttons
                    ephemeral: false
                });
                return;
            }

            message += `\n\n🚫 The mount evaded! Would **${characterName}** like to try again for 1 stamina?\n\n**${characterName}** now has **${currentStamina}** 🟩 stamina remaining.`;

            const retryTameButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tame|${village}|${encounterId}`)
                    .setLabel('🐴 Try Taming Again!')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({
                embeds: [
                    {
                        title: 'Mount Taming Failed!',
                        description: message,
                        color: 0xFFFF00,
                        image: {
                            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
                        },
                        thumbnail: {
                            url: getMountThumbnail(encounter.mountType)  // Add the mount-specific thumbnail
                        }
                    }
                ],
                components: [retryTameButton],
                ephemeral: false
            });
        }
    } catch (error) {
        console.error('Error handling tame interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    {
                        title: '❌ Error',
                        description: 'Something went wrong. Please try again later.',
                        color: 0xFF0000
                    }
                ],
                ephemeral: true
            });
        }
    }
}



// ------------------- Export Functions -------------------
// Export the core interaction and taming functions for use in other modules.
module.exports = {
    proceedWithRoll,
    handleMountComponentInteraction,
    handleTameInteraction,
    trackCharacterInEncounter
};
