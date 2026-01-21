// ============================================================================
// ------------------- Character Interaction Handler -------------------
// ============================================================================
// Handles character creation and interactions for Discord.js interactions

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
// Third-party libraries
const axios = require('axios');
const { handleError } = require('@app/shared/utils/globalErrorHandler');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { MessageFlags } = require('discord.js');

// Local modules
const Character = require('@app/shared/models/CharacterModel');
const { createCharacterInventory, getOrCreateUser } = require('@app/shared/database/db');
const { isUniqueCharacterName, isValidGoogleSheetsUrl } = require('@app/shared/utils/validation');
const { createCharacterEmbed, createSetupInstructionsEmbed } = require('../embeds/embeds.js');
const bucket = require('@app/shared/config/gcsService');

// ============================================================================
// ------------------- Constants and Helpers -------------------
// ============================================================================
const RACES = [
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

// ------------------- Helper: editEphemeralReply ------------------
// Send an ephemeral editReply with provided content -
async function editEphemeralReply(interaction, content) {
  await interaction.editReply({ content, ephemeral: true });
}

// ------------------- Helper: buildSuccessMessage ------------------
// Compose the success message including role assignment info -
function buildSuccessMessage(user, assignedRoles, missingRoles) {
  let message =
    `🎉 Your character has been successfully created! Your remaining character slots: ` +
    `${user.characterSlot}`;

  if (assignedRoles.length > 0) {
    message += `\n✅ Assigned roles: ${assignedRoles.join(', ')}`;
  }

  if (missingRoles.length > 0) {
    message +=
      `\n⚠️ Some roles could not be assigned: ${missingRoles.join(', ')}. ` +
      'Please contact a server administrator to set up these roles.';
  }

  return message;
}

// ------------------- Character Autocomplete ------------------
// Handles autocomplete for character creation fields -
async function createCharacterAutocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);

  // Handle 'race' field autocomplete
  if (focusedOption.name === 'race') {
    try {
      const filtered = RACES.filter((race) =>
        race.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      );

      await interaction.respond(filtered.slice(0, 25));
    } catch (error) {
      handleError(error, 'characterInteractionHandler.js');
      await interaction.respond([]);
    }
  }
}

// ------------------- Create Character Interaction ------------------
// Handles creating a new character with the specified attributes -
async function createCharacterInteraction(
  interaction,
  assignedRoles = [],
  missingRoles = []
) {
  // Only defer if not already deferred or replied
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  }

  const userId = interaction.user.id;
  const characterName = interaction.options.getString('name');
  const googleSheetsUrl = interaction.options.getString('inventory');
  const timezone = interaction.options.getString('timezone');
  const subcommand = interaction.options.getSubcommand();
  const homeVillage =
    subcommand === 'general' ? interaction.options.getString('village') : subcommand;

  // Get values for validation
  const hearts = interaction.options.getInteger('hearts');
  const stamina = interaction.options.getInteger('stamina');
  const race = interaction.options.getString('race');

  // Validate hearts and stamina are positive (zero allowed as in original logic)
  if (hearts < 0 || stamina < 0) {
    await editEphemeralReply(
      interaction,
      '❌ Hearts and stamina values must be positive numbers.'
    );
    return;
  }

  // Parse and validate height
  const height = interaction.options.getNumber('height');
  if (isNaN(height) || height <= 0) {
    await editEphemeralReply(interaction, '❌ Height must be a positive number.');
    return;
  }

  // Validate race
  const validRaces = RACES.map(({ value }) => value);
  if (!validRaces.includes(race.toLowerCase())) {
    await editEphemeralReply(
      interaction,
      `❌ "${race}" is not a valid race. Please select a valid race from the autocomplete options.`
    );
    return;
  }

  // Ensure character name is unique
  const isUnique = await isUniqueCharacterName(userId, characterName);
  if (!isUnique) {
    await editEphemeralReply(
      interaction,
      `A character with the name **${characterName}** already exists. Please choose a different name.`
    );
    return;
  }

  // Continue with the rest of the function...
  const user = await getOrCreateUser(userId, googleSheetsUrl, timezone);

  // Handle character icon attachment
  const iconAttachment = interaction.options.getAttachment('icon');
  if (!iconAttachment) {
    await editEphemeralReply(
      interaction,
      'You didn\'t add an icon! This is required!'
    );
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
    const embed = createCharacterEmbed(character);
    await createCharacterInventory(characterName, character._id, character.job);

    // ------------------- Embed Validation Fix ------------------
    // Always ensure description is set -
    embed.setDescription('📋 Character profile created successfully.');

    // Build success message with role assignment information
    const successMessage = buildSuccessMessage(user, assignedRoles, missingRoles);

    // Send success message with the character embed
    await interaction.editReply({
      content: successMessage,
      embeds: [embed],
      ephemeral: true
    });

    // Validate Google Sheets URL and send setup instructions if invalid
    if (!isValidGoogleSheetsUrl(googleSheetsUrl)) {
      const setupInstructionsEmbed = await createSetupInstructionsEmbed(
        characterName,
        googleSheetsUrl,
        'Invalid Google Sheets URL.'
      );
      await interaction.followUp({
        content: 'Invalid Google Sheets URL provided. ⚠️',
        embeds: [setupInstructionsEmbed],
        ephemeral: true
      });
    } else {
      const setupInstructionsEmbed = await createSetupInstructionsEmbed(
        characterName,
        googleSheetsUrl
      );
      await interaction.followUp({ embeds: [setupInstructionsEmbed], ephemeral: true });
    }
  } catch (error) {
    handleError(error, 'characterInteractionHandler.js');
    await editEphemeralReply(
      interaction,
      '❌ An error occurred while creating your character. Please try again.'
    );
  }
}

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================
// Export the functions for external use
module.exports = {
  createCharacterInteraction,
  createCharacterAutocomplete
};