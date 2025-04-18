// ------------------- Edit Character Command Module -------------------
// This module allows users to edit various attributes of an existing character.

// ------------------- Import Section -------------------
// Third-party module imports
const axios = require('axios'); // For downloading and handling external resources (e.g., icons)
const { ActionRowBuilder,   ButtonBuilder,   ButtonStyle,   EmbedBuilder,   SlashCommandBuilder } = require('discord.js'); // Discord.js for building embeds, buttons, and slash commands
const { v4: uuidv4 } = require('uuid'); // UUID generator for unique file names
const path = require('path'); // Path handling utility

// Local module imports

// Config
const bucket = require('../config/gcsService'); // Google Cloud Storage service

// Models
const Character = require('../models/CharacterModel'); // Character model

// Embeds
const { createCharacterEmbed } = require('../embeds/characterEmbeds'); // Embeds for character display

// Database
const { connectToTinglebot } = require('../database/connection'); // Database connection
const { createCharacterInventory,   deleteCharacterInventoryCollection,   fetchCharacterById,   fetchCharacterByNameAndUserId,   updateCharacterById } = require('../database/characterService'); // Character-related database services

// Handlers
const { handleAutocomplete } = require('../handlers/autocompleteHandler'); // Autocomplete handler

// Modules
const { getGeneralJobsPage,   getJobsByCategory } = require('../modules/jobsModule'); // Jobs handling
const { getVillageColorByName } = require('../modules/locationsModule'); // Village color utility
const { isValidRace } = require('../modules/raceModule'); // Race validation utility
const { updateHearts,   updateStamina } = require('../modules/characterStatsModule'); // Character stats updates
const { capitalizeFirstLetter } = require('../modules/formattingModule'); // Formatting utility
const { roles } = require('../modules/rolesModule');

const { handleError } = require('../utils/globalErrorHandler');
// Utilities
const { canChangeJob,   canChangeVillage,   isUniqueCharacterName,   convertCmToFeetInches } = require('../utils/validation'); // Validation utilities

// ------------------- Helper Function: Fetch Icon Data -------------------
// Fetches the image data from the provided icon URL
async function fetchIconData(iconUrl) {
  const response = await axios.get(iconUrl, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
}

// ------------------- Helper Function: Capture Previous and Updated Values -------------------
// This function captures the previous and updated values for a specific category.
function capturePreviousAndUpdatedValues(character, category, updatedInfo) {
  const previousValue = character[category] !== undefined ? character[category] : 'N/A';
  const updatedValue = updatedInfo !== undefined ? updatedInfo : 'N/A';
  return { previousValue, updatedValue };
}

// ------------------- Command Definition -------------------
// Defines the slash command for editing a character's attributes
module.exports = {
  data: new SlashCommandBuilder()
    .setName('editcharacter')
    .setDescription('Edit an existing character')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Category to edit')
        .setRequired(true)
        .addChoices(
          { name: 'Name', value: 'name' },
          { name: 'Age', value: 'age' },
          { name: 'Height', value: 'height' },
          { name: 'Hearts', value: 'hearts' },
          { name: 'Stamina', value: 'stamina' },
          { name: 'Pronouns', value: 'pronouns' },
          { name: 'Race', value: 'race' },
          { name: 'Job', value: 'job' },
          { name: 'Village', value: 'homeVillage' },
          { name: 'Icon', value: 'icon' },
          { name: 'App Link', value: 'app_link' },
          { name: 'Inventory', value: 'inventory' }
        ))
    .addStringOption(option =>
      option.setName('updatedinfo')
        .setDescription('Updated information for the selected category')
        .setRequired(true)
        .setAutocomplete(true))
    .addAttachmentOption(option =>
      option.setName('newicon')
        .setDescription('New icon for the character (only if updating icon)')
        .setRequired(false)),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const characterName = interaction.options.getString('charactername');
      const category = interaction.options.getString('category');
      const updatedInfo = interaction.options.getString('updatedinfo');
      const userId = interaction.user.id;
      const newIcon = interaction.options.getAttachment('newicon');

      // Connect to the database
      await connectToTinglebot();
      
      // Fetch the character based on name and user ID
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.followUp({ content: `❌ **Character ${characterName} not found or does not belong to you.**`, ephemeral: true });
        return;
      }

      let updateMessage = ''; // Message to inform user of the update
      let previousValue = character[category] !== undefined ? character[category] : 'N/A';

      let updatedValue;

// ------------------- Update Roles -------------------
if (['race', 'homeVillage'].includes(category)) {
  const member = interaction.member;

  console.log(`[Roles]: Updating roles for user "${member.user.tag}".`);
  console.log(`[Roles]: Category to update: "${category}", Previous Value: "${previousValue}", Updated Value: "${updatedInfo}".`);

  // Map category to role list in rolesModule
  const roleCategory = {
    race: 'Races',
    homeVillage: 'Villages'
  }[category];

  // Define roles to modify
  const roleToRemove = roles[roleCategory]?.find(r =>
    r.name === (category === 'homeVillage' ? `${previousValue} Resident` : `Race: ${previousValue}`)
  );
  const roleToAdd = roles[roleCategory]?.find(r =>
    r.name === (category === 'homeVillage' ? `${updatedInfo} Resident` : `Race: ${updatedInfo}`)
  );

  // Remove the old role
  if (roleToRemove) {
    const role = interaction.guild.roles.cache.find(r => r.name === roleToRemove.name);
    if (role) {
      await member.roles.remove(role);
      console.log(`[Roles]: Removed role "${role.name}" from user "${member.user.tag}".`);
    } else {
      console.warn(`[Roles]: Role "${roleToRemove.name}" not found in the guild.`);
    }
  } else {
    console.log(`[Roles]: No role to remove for "${previousValue}".`);
  }

  // Add the new role
  if (roleToAdd) {
    const role = interaction.guild.roles.cache.find(r => r.name === roleToAdd.name);
    if (role) {
      await member.roles.add(role);
      console.log(`[Roles]: Assigned role "${role.name}" to user "${member.user.tag}".`);
    } else {
      console.warn(`[Roles]: Role "${roleToAdd.name}" not found in the guild.`);
    }
  } else {
    console.log(`[Roles]: No role to add for "${updatedInfo}".`);
  }
}
      
// ------------------- Handle Each Category Update -------------------

// ------------------- Job Update Section -------------------
if (category === 'job') {
  try {
      // Validate the job change
      const validationResult = await canChangeJob(character, updatedInfo);

      if (!validationResult.valid) {
          console.warn(`[WARNING] Job validation failed: ${validationResult.message}`);
          await interaction.followUp({ content: validationResult.message, ephemeral: true });
          return;
      }

      // Check for job category selection
      if (['General Jobs', 'Inariko Exclusive Jobs', 'Rudania Exclusive Jobs', 'Vhintl Exclusive Jobs'].includes(updatedInfo)) {
          await handleJobCategorySelection(interaction, character, updatedInfo);
          return;
      }

      // Update the character's job
      character.job = updatedInfo;
      console.log(`[INFO] Job successfully updated for character ${character.name} from ${previousValue} to ${updatedInfo}`);
      updateMessage = `✅ **${character.name}'s job has been updated from ${previousValue} to ${updatedInfo}.**`;

  } catch (error) {
    handleError(error, 'editcharacter.js');

      // Log the error details
      console.error(`[ERROR] An error occurred while processing job update: ${error.message}`);
      console.error(error.stack);
      await interaction.followUp({
          content: '⚠️ An unexpected error occurred while updating the job. Please try again later.',
          ephemeral: true,
      });
  }

// ------------------- Home Village Update Section -------------------
} else if (category === 'homeVillage') {
  const validationResult = await canChangeVillage(character, updatedInfo);
  if (!validationResult.valid) {
      await interaction.followUp({ content: validationResult.message, ephemeral: true });
      return;
  }
  character.homeVillage = updatedInfo;
  character.currentVillage = updatedInfo;
  updateMessage = `✅ **${character.name}'s village has been updated from ${previousValue} to ${updatedInfo}.**`;

// ------------------- Name Update Section -------------------
} else if (category === 'name') {
  const uniqueNameCheck = await isUniqueCharacterName(character.userId, updatedInfo);
  if (!uniqueNameCheck) {
      await interaction.followUp({ 
          content: `⚠️ **${updatedInfo}** is already in use by another character. Please choose a different name.`, 
          ephemeral: true 
      });
      return;
  }

  const previousName = character.name; // Capture previous name
  character.name = updatedInfo; // Update character name
  const { updatedValue } = capturePreviousAndUpdatedValues(character, category, updatedInfo); // Ensure updatedValue is correct

  updateMessage = `✅ **${character.name}'s name has been updated from ${previousName} to ${updatedValue}.**`;

  // Additional steps for inventory and other dependencies
  await deleteCharacterInventoryCollection(previousName);
  await createCharacterInventory(character.name, character._id, character.job);

// ------------------- Hearts Update Section -------------------
} else if (category === 'hearts') {
  const hearts = parseInt(updatedInfo, 10);

  // Validate that hearts is a non-negative number
  if (isNaN(hearts) || hearts < 0) {
      await interaction.followUp({
          content: `⚠️ **${updatedInfo}** is not valid for hearts. Please provide a non-negative number.`,
          ephemeral: true,
      });
      return;
  }

  // Capture the previous value before updating
  previousValue = character.currentHearts;

  // Update hearts in the database
  await updateHearts(character._id, hearts);

  // Reflect the updated value in the character object
  character.currentHearts = hearts;
  character.maxHearts = hearts;

  updatedValue = hearts; // Assign to updatedValue for notification
  updateMessage = `✅ **${character.name}'s hearts have been updated from ${previousValue} to ${hearts}.**`;

// ------------------- Stamina Update Section -------------------
} else if (category === 'stamina') {
  const stamina = parseInt(updatedInfo, 10);

  // Validate that stamina is a non-negative number
  if (isNaN(stamina) || stamina < 0) {
      await interaction.followUp({
          content: `⚠️ **${updatedInfo}** is not valid for stamina. Please provide a non-negative number.`,
          ephemeral: true,
      });
      return;
  }

  previousValue = character.currentStamina; // Capture previous value
  await updateStamina(character._id, stamina);

  // Reflect the updated value in the character object
  character.currentStamina = stamina;
  character.maxStamina = stamina;

  updatedValue = stamina; // Assign to updatedValue for notification
  updateMessage = `✅ **${character.name}'s stamina has been updated from ${previousValue} to ${stamina}.**`;

// ------------------- Pronouns Update Section -------------------
} else if (category === 'pronouns') {
  character.pronouns = updatedInfo;
  updateMessage = `✅ **${character.name}'s pronouns have been updated from ${previousValue} to ${updatedInfo}.**`;

// ------------------- Race Update Section -------------------
} else if (category === 'race') {
  if (!isValidRace(updatedInfo)) {
      await interaction.followUp({ content: `⚠️ **${updatedInfo}** is not a valid race.`, ephemeral: true });
      return;
  }
  character.race = updatedInfo;
  updateMessage = `✅ **${character.name}'s race has been updated from ${previousValue} to ${updatedInfo}.**`;

// ------------------- Icon Update Section -------------------
} else if (category === 'icon') {
  if (newIcon) {
      try {
          const response = await axios.get(newIcon.url, { responseType: 'arraybuffer' });
          const iconData = Buffer.from(response.data, 'binary');
          const blob = bucket.file(uuidv4() + path.extname(newIcon.name));
          const blobStream = blob.createWriteStream({ resumable: false });
          blobStream.end(iconData);

          await new Promise((resolve, reject) => {
              blobStream.on('finish', resolve);
              blobStream.on('error', reject);
          });

          const publicIconUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          character.icon = publicIconUrl;
          updateMessage = `✅ **${character.name}'s icon has been updated.**`;
      } catch (error) {
    handleError(error, 'editcharacter.js');

          await interaction.followUp({ content: `⚠️ **There was an error uploading the icon: ${error.message}**`, ephemeral: true });
          return;
      }
  } else {
      await interaction.followUp({ content: '⚠️ **Please provide a valid icon attachment.**', ephemeral: true });
      return;
  }

// ------------------- Application Link Update Section -------------------
} else if (category === 'app_link') {
  previousValue = character.appLink || 'N/A'; // Capture previous value
  updatedValue = updatedInfo || 'N/A'; // Assign updated value

  character.appLink = updatedInfo;
  updateMessage = `✅ **${character.name}'s application link has been updated from ${previousValue} to ${updatedValue}.**`;

// ------------------- Inventory Update Section -------------------
} else if (category === 'inventory') {
  const { previousValue, updatedValue } = capturePreviousAndUpdatedValues(character, category, updatedInfo);

  character.inventory = updatedValue; // Update field
  updateMessage = `✅ **${character.name}'s inventory link has been updated from ${previousValue} to ${updatedValue}.**`;

// ------------------- Age Update Section -------------------
} else if (category === 'age') {
  const age = parseInt(updatedInfo, 10);

  if (isNaN(age) || age < 0) {
      await interaction.followUp({
          content: `⚠️ **${updatedInfo}** is not a valid age. Please provide a non-negative number.`,
          ephemeral: true,
      });
      return;
  }

  const { previousValue, updatedValue } = capturePreviousAndUpdatedValues(character, category, updatedInfo);

  character.age = updatedValue; // Update character age
  updateMessage = `✅ **${character.name}'s age has been updated from ${previousValue} to ${updatedValue}.**`;

// ------------------- Height Update Section -------------------
} else if (category === 'height') {
  const heightInCm = parseInt(updatedInfo, 10);
  if (isNaN(heightInCm) || heightInCm < 0) {
      await interaction.followUp({
          content: `⚠️ **${updatedInfo}** is not valid for height. Please provide a non-negative number in centimeters.`,
          ephemeral: true,
      });
      return;
  }
  character.height = heightInCm;
  const heightInFeetInches = convertCmToFeetInches(heightInCm);
  updateMessage = `✅ **${character.name}'s height has been updated from ${previousValue} to ${heightInCm} cm (${heightInFeetInches}).**`;
}

// ------------------- Save Character and Log Updates -------------------

// Save the updated character and respond to the user
await character.save();

// Fetch updated character for confirmation
const updatedCharacter = await fetchCharacterById(character._id);

// Log a clear error if the validation fails
if (updatedCharacter[category] !== updatedValue) {}

// Create an embed with updated character details
const embed = createCharacterEmbed(updatedCharacter);

// ------------------- Send Notification to a Discord Channel -------------------
const EDIT_NOTIFICATION_CHANNEL_ID = '1319524801408274434'; // Notification channel ID
try {
    const notificationChannel = await interaction.client.channels.fetch(EDIT_NOTIFICATION_CHANNEL_ID);
    if (notificationChannel && notificationChannel.isTextBased()) {
        const notificationMessage = `📢 **USER EDITED THEIR CHARACTER**\n
🌱 **User:** \`${interaction.user.tag}\` 
👤 **Character Name:** \`${character.name}\`
🛠️ **Edited Category:** \`${category}\`
🔄 **Previous Value:** \`${previousValue || 'N/A'}\`
✅ **Updated Value:** \`${updatedValue || updatedCharacter[category] || 'N/A'}\``;

        await notificationChannel.send(notificationMessage);
    } else {
        console.error(`[editcharacter.js]: Notification channel is not text-based or unavailable.`);
    }
} catch (err) {
    handleError(err, 'editcharacter.js');

    console.error(`[editcharacter.js]: Error sending update notification: ${err.message}`);
}


await interaction.followUp({ content: updateMessage, embeds: [embed], ephemeral: true });

    } catch (error) {
    handleError(error, 'editcharacter.js');

      await interaction.followUp({ content: `⚠️ **There was an error updating the character: ${error.message}**`, ephemeral: true });
    }
  },
  
  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    await handleAutocomplete(interaction);
  }
};

// ------------------- Helper Function: Job Category Selection -------------------
// Handles the selection of jobs when editing a character's job
async function handleJobCategorySelection(interaction, character, updatedInfo) {
  let jobs;
  let pageIndex = 1;

  // Determine the list of jobs based on the updatedInfo
  if (updatedInfo === 'General Jobs') {
    jobs = getGeneralJobsPage(pageIndex);
  } else {
    jobs = getJobsByCategory(updatedInfo);
  }

  // Create buttons for each job
  const jobButtons = jobs.map(job =>
    new ButtonBuilder()
      .setCustomId(`job-select|${character._id}|${job}`) // Include job name in custom ID
      .setLabel(job)
      .setStyle(ButtonStyle.Primary)
  );

  // Organize buttons into rows (maximum 5 per row)
  const rows = [];
  while (jobButtons.length) {
    rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));
  }

  // Set up embed and navigation for multiple pages of jobs
  const embedColor = getVillageColorByName(updatedInfo.split(' ')[0]) || '#00CED1';
  const embed = new EmbedBuilder()
    .setTitle(`${updatedInfo}`)
    .setDescription('Select a job from the buttons below:')
    .setColor(embedColor);

  let components = [...rows];
  if (updatedInfo === 'General Jobs') {
    const previousPageIndex = pageIndex - 1;
    const nextPageIndex = pageIndex + 1;
    const navigationButtons = [
      new ButtonBuilder()
        .setCustomId(`job-page|${character._id}|${previousPageIndex}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(previousPageIndex < 1),
      new ButtonBuilder()
        .setCustomId(`job-page|${character._id}|${nextPageIndex}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(nextPageIndex > 2)
    ];

    const navigationRow = new ActionRowBuilder().addComponents(navigationButtons);
    components.push(navigationRow);
  }

  // Send the job selection embed with buttons
  await interaction.followUp({ embeds: [embed], components, ephemeral: true });

  console.log(`[Job Selection]: Job selection buttons sent for user "${interaction.user.tag}".`);
}



