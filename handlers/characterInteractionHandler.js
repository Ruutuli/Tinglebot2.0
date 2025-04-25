// ------------------- Character Interaction Handler -------------------
// Handles character creation and interactions

// ------------------- Imports -------------------
// Third-party libraries
const axios = require('axios');
const { handleError } = require('../utils/globalErrorHandler');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Local modules
const Character = require('../models/CharacterModel');
const { createCharacterInventory, getOrCreateUser } = require('../database/db');
const { isUniqueCharacterName, isValidGoogleSheetsUrl } = require('../utils/validation');
const { getVillageColorByName } = require('../modules/locationsModule');
const { createCharacterEmbed, createSetupInstructionsEmbed } = require('../embeds/embeds');
const bucket = require('../config/gcsService');

// ------------------- Character Autocomplete Handler -------------------
// Handles autocomplete for character creation fields
async function createCharacterAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    // Handle "race" field autocomplete
    if (focusedOption.name === "race") {
        try {
            // List of races that will be suggested for autocomplete
            const races = [
                { name: 'Gerudo', value: 'gerudo' },
                { name: 'Goron', value: 'goron' },
                { name: 'Hylian', value: 'hylian' },
                { name: 'Keaton', value: 'keaton' },
                { name: 'Korok/Kokiri', value: 'korok/kokiri' },
                { name: 'Mixed', value: 'mixed' },
                { name: 'Mogma', value: 'mogma' },
                { name: 'Rito', value: 'rito' },
                { name: 'Sheikah', value: 'sheikah' },
                { name: 'Twili', value: 'twili' },
                { name: 'Zora', value: 'zora' }
            ];
            
            // Filter the races based on user input
            const filtered = races.filter(race => 
                race.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
            
            // Respond with the filtered list of choices
            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            handleError(error, 'characterInteractionHandler.js');
            await interaction.respond([]);
        }
    }
}

// ------------------- Create Character Interaction -------------------
// Handles creating a new character with the specified attributes
async function createCharacterInteraction(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const characterName = interaction.options.getString('name');
    const googleSheetsUrl = interaction.options.getString('inventory');
    const timezone = interaction.options.getString('timezone');
    const subcommand = interaction.options.getSubcommand();
    const homeVillage = subcommand === 'general' ? interaction.options.getString('village') : subcommand;
    
    // Get values for validation
    const hearts = interaction.options.getInteger('hearts');
    const stamina = interaction.options.getInteger('stamina');
    const race = interaction.options.getString('race');
    
    // NEW: Validate hearts and stamina are positive
    if (hearts < 0 || stamina < 0) {
        await interaction.editReply({ 
            content: "❌ Hearts and stamina values must be positive numbers.",
            ephemeral: true 
        });
        return;
    }
    
    // NEW: Parse height as string and convert to float
    const heightStr = interaction.options.getString('height');
    const height = parseFloat(heightStr);
    
    // NEW: Validate height is a valid number and positive
    if (isNaN(height) || height <= 0) {
        await interaction.editReply({
            content: "❌ Height must be a positive number.",
            ephemeral: true
        });
        return;
    }
    
    // NEW: Validate race
    const validRaces = ['gerudo', 'goron', 'hylian', 'keaton', 'korok/kokiri', 'mixed', 'mogma', 'rito', 'sheikah', 'twili', 'zora'];
    if (!validRaces.includes(race.toLowerCase())) {
        await interaction.editReply({
            content: `❌ "${race}" is not a valid race. Please select a valid race from the autocomplete options.`,
            ephemeral: true
        });
        return;
    }

    // Ensure character name is unique
    const isUnique = await isUniqueCharacterName(userId, characterName);
    if (!isUnique) {
        await interaction.editReply({ content: `A character with the name **${characterName}** already exists. Please choose a different name.`, ephemeral: true });
        return;
    }

    // Continue with the rest of the function...
    const user = await getOrCreateUser(userId, googleSheetsUrl, timezone);

    // Handle character icon attachment
    const iconAttachment = interaction.options.getAttachment('icon');
    if (!iconAttachment) {
        await interaction.editReply({ content: 'You didn\'t add an icon! This is required!', ephemeral: true });
        return;
    }
    const iconUrl = iconAttachment.url;

    try {
        // Download and upload the icon image
        const response = await axios.get(iconUrl, { responseType: 'arraybuffer' });
        const iconData = Buffer.from(response.data, 'binary');
        const blob = bucket.file(uuidv4() + path.extname(iconAttachment.name));
        const blobStream = blob.createWriteStream({ resumable: false });
        blobStream.end(iconData);
        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve);
            blobStream.on('error', reject);
        });

        // Generate public URL for the uploaded icon
        const publicIconUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // Create character object and save to database
        const character = new Character({
            userId: user.discordId,
            name: characterName,
            age: interaction.options.getInteger('age'),
            height: height,
            maxHearts: hearts,
            currentHearts: hearts,
            maxStamina: stamina,
            currentStamina: stamina,
            pronouns: interaction.options.getString('pronouns'),
            race: race,
            homeVillage: homeVillage,
            currentVillage: homeVillage,
            job: interaction.options.getString('job'),
            inventory: googleSheetsUrl,
            appLink: interaction.options.getString('applink'),
            icon: publicIconUrl,
            blighted: false,
            spiritOrbs: 0,
            birthday: '',
            inventorySynced: false
        });

        await character.save();

        // Create character embed
        const villageColor = getVillageColorByName(character.homeVillage);
        const embed = createCharacterEmbed(character, villageColor);
        await createCharacterInventory(characterName, character._id, character.job);

        // Send success message with the character embed
        await interaction.editReply({ content: `Character **${characterName}** created successfully! 🎉`, embeds: [embed], ephemeral: true });

        // Validate Google Sheets URL and send setup instructions if invalid
        if (!isValidGoogleSheetsUrl(googleSheetsUrl)) {
            const setupInstructionsEmbed = createSetupInstructionsEmbed(characterName, googleSheetsUrl, 'Invalid Google Sheets URL.');
            await interaction.followUp({ content: 'Invalid Google Sheets URL provided. ⚠️', embeds: [setupInstructionsEmbed], ephemeral: true });
        } else {
            const setupInstructionsEmbed = createSetupInstructionsEmbed(characterName, googleSheetsUrl);
            await interaction.followUp({ embeds: [setupInstructionsEmbed], ephemeral: true });
        }
    } catch (error) {
    handleError(error, 'characterInteractionHandler.js');

        await interaction.editReply({ content: `There was an error uploading the icon: ${error.message}`, ephemeral: true });
    }
}

// ------------------- Exported Functions -------------------
// Export the functions for external use
module.exports = {
    createCharacterInteraction,
    createCharacterAutocomplete
};