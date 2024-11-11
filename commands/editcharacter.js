// ------------------- Edit Character Command Module -------------------
// This module allows users to edit various attributes of an existing character.

// ------------------- Import Section -------------------
// Grouped based on third-party and local module imports
const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  SlashCommandBuilder 
} = require('discord.js'); // Discord.js for building embeds, buttons, and slash commands
const { connectToTinglebot } = require('../database/connection'); // Database connection
const { 
  createCharacterInventory, 
  deleteCharacterInventoryCollection, 
  fetchCharacterById, 
  fetchCharacterByNameAndUserId, 
  updateCharacterById 
} = require('../database/characterService'); // Character-related database services
const { createCharacterEmbed } = require('../embeds/characterEmbeds'); // Embeds for character display
const { getGeneralJobsPage, getJobsByCategory } = require('../modules/jobsModule'); // Jobs handling
const { getVillageColorByName } = require('../modules/locationsModule'); // Village color utility
const { isValidRace } = require('../modules/raceModule'); // Race validation utility
const { 
  updateHearts, 
  updateStamina 
} = require('../modules/characterStatsModule'); // Character stats updates
const { handleAutocomplete } = require('../handlers/autocompleteHandler'); // Autocomplete handler
const { 
  canChangeJob, 
  canChangeVillage, 
  isUniqueCharacterName 
} = require('../utils/validation'); // Validation utilities
const Character = require('../models/CharacterModel'); // Character model
const axios = require('axios'); // For downloading and handling external resources (e.g., icons)
const bucket = require('../config/gcsService'); // Google Cloud Storage service
const { v4: uuidv4 } = require('uuid'); // UUID generator for unique file names
const path = require('path'); // Path handling utility
const { convertCmToFeetInches } = require('../utils/validation'); // Utility for converting height

// ------------------- Helper Function: Fetch Icon Data -------------------
// Fetches the image data from the provided icon URL
async function fetchIconData(iconUrl) {
  const response = await axios.get(iconUrl, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
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
      const previousValue = character[category]; // Store the previous value for reference

      // ------------------- Handle Each Category Update -------------------
      if (category === 'job') {
        const validationResult = await canChangeJob(character, updatedInfo);
        if (!validationResult.valid) {
          await interaction.followUp({ content: validationResult.message, ephemeral: true });
          return;
        }
        if (['General Jobs', 'Inariko Exclusive Jobs', 'Rudania Exclusive Jobs', 'Vhintl Exclusive Jobs'].includes(updatedInfo)) {
          await handleJobCategorySelection(interaction, character, updatedInfo);
          return;
        }
        character.job = updatedInfo;
        updateMessage = `✅ **${character.name}'s job has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'homeVillage') {
        const validationResult = await canChangeVillage(character, updatedInfo);
        if (!validationResult.valid) {
          await interaction.followUp({ content: validationResult.message, ephemeral: true });
          return;
        }
        character.homeVillage = updatedInfo;
        character.currentVillage = updatedInfo;
        updateMessage = `✅ **${character.name}'s village has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'name') {
        const uniqueNameCheck = await isUniqueCharacterName(character.userId, updatedInfo);
        if (!uniqueNameCheck) {
          await interaction.followUp({ content: `⚠️ **${updatedInfo}** is already in use by another character. Please choose a different name.`, ephemeral: true });
          return;
        }
        const previousName = character.name;
        character.name = updatedInfo;
        updateMessage = `✅ **${character.name}'s name has been updated from ${previousName} to ${updatedInfo}.**`;
        await deleteCharacterInventoryCollection(previousName);
        await createCharacterInventory(character.name, character._id, character.job);
      } else if (category === 'hearts') {
        await updateHearts(character._id, updatedInfo);
        character.currentHearts = updatedInfo;
        character.maxHearts = updatedInfo;
        updateMessage = `✅ **${character.name}'s hearts have been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'stamina') {
        await updateStamina(character._id, updatedInfo);
        character.currentStamina = updatedInfo;
        character.maxStamina = updatedInfo;
        updateMessage = `✅ **${character.name}'s stamina has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'pronouns') {
        character.pronouns = updatedInfo;
        updateMessage = `✅ **${character.name}'s pronouns have been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'race') {
        if (!isValidRace(updatedInfo)) {
          await interaction.followUp({ content: `⚠️ **${updatedInfo}** is not a valid race.`, ephemeral: true });
          return;
        }
        character.race = updatedInfo;
        updateMessage = `✅ **${character.name}'s race has been updated from ${previousValue} to ${updatedInfo}.**`;
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
            await interaction.followUp({ content: `⚠️ **There was an error uploading the icon: ${error.message}**`, ephemeral: true });
            return;
          }
        } else {
          await interaction.followUp({ content: '⚠️ **Please provide a valid icon attachment.**', ephemeral: true });
          return;
        }
      } else if (category === 'app_link') {
        character.appLink = updatedInfo;
        updateMessage = `✅ **${character.name}'s application link has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'inventory') {
        character.inventory = updatedInfo;
        updateMessage = `✅ **${character.name}'s inventory link has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'age') {
        character.age = updatedInfo;
        updateMessage = `✅ **${character.name}'s age has been updated from ${previousValue} to ${updatedInfo}.**`;
      } else if (category === 'height') {
        const heightInCm = parseInt(updatedInfo, 10);
        if (isNaN(heightInCm)) {
          await interaction.followUp({ content: `⚠️ **${updatedInfo}** is not a valid number for height. Please enter height in centimeters.`, ephemeral: true });
          return;
        }
        character.height = heightInCm;
        const heightInFeetInches = convertCmToFeetInches(heightInCm);
        updateMessage = `✅ **${character.name}'s height has been updated from ${previousValue} to ${heightInCm} cm | ${heightInFeetInches}.**`;
      }

      await character.save();
      const updatedCharacter = await fetchCharacterById(character._id);
      const embed = createCharacterEmbed(updatedCharacter); // Create a character embed with updated data
      await interaction.followUp({ content: updateMessage, embeds: [embed], ephemeral: true });
    } catch (error) {
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

  if (updatedInfo === 'General Jobs') {
    jobs = getGeneralJobsPage(pageIndex);
  } else {
    jobs = getJobsByCategory(updatedInfo);
  }

  const jobButtons = jobs.map(job => new ButtonBuilder()
    .setCustomId(`job-select|${character._id}|${job}`)
    .setLabel(job)
    .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  while (jobButtons.length) rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));

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

  await interaction.followUp({ embeds: [embed], components, ephemeral: true });
}
