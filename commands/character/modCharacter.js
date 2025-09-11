// ============================================================================
// ------------------- Imports and Dependencies -------------------
// Importing necessary libraries, modules, utilities, models, and constants.
// ============================================================================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { google } = require("googleapis");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const { handleInteractionError } = require("../../utils/globalErrorHandler");
const {
  getOrCreateToken,
  updateTokenBalance,
  connectToTinglebot,
  connectToInventories,
  fetchCharacterByNameAndUserId,
  fetchCharactersByUserId,
  fetchCharacterById,
  deleteCharacterById,
  deleteCharacterInventoryCollection,
  createCharacterInventory,
  getCharacterInventoryCollection,
  // Mod Character Functions
  fetchModCharacterByNameAndUserId,
  fetchModCharactersByUserId,
  fetchAllModCharacters,
  createModCharacter,
  updateModCharacterById,
  deleteModCharacterById,
  fetchModCharacterById,
} = require("../../database/db");
const {
  getVillageColorByName,
  getVillageEmojiByName,
} = require("../../modules/locationsModule");
const {
  handleCreateCharacterRaceAutocomplete,
  handleCreateCharacterVillageAutocomplete,
  handleModCharacterJobAutocomplete,
  handleModCharacterNameAutocomplete,
} = require("../../handlers/autocompleteHandler");
const {
  canChangeJob,
  canChangeVillage,
  isUniqueCharacterName,
  isUniqueModCharacterName,
  isValidGoogleSheetsUrl,
  extractSpreadsheetId,
  convertCmToFeetInches,
} = require("../../utils/validation");
const {
  appendSheetData,
  authorizeSheets,
  deleteInventorySheetData,
  safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils");
const {
  createCharacterInteraction,
} = require("../../handlers/characterInteractionHandler");
const {
  createJobOptions,
  generalJobs,
  villageJobs,
  getJobPerk,
  getGeneralJobsPage,
  getJobsByCategory,
  getAllJobs,
  isValidJob,
} = require("../../modules/jobsModule");
const { roles } = require("../../modules/rolesModule");
const {
  capitalizeFirstLetter,
  capitalizeWords,
  capitalize,
  getRandomColor,
} = require("../../modules/formattingModule");
const { isValidRace } = require("../../modules/raceModule");
const {
  updateHearts,
  updateStamina,
} = require("../../modules/characterStatsModule");
const {
  createCharacterEmbed,
  createVendorEmbed,
  createCharacterGearEmbed,
  getCommonEmbedSettings,
} = require("../../embeds/embeds.js");
const {
  getMountEmoji,
  getMountThumbnail,
} = require("../../modules/mountModule");
const bucket = require("../../config/gcsService");

const Character = require("../../models/CharacterModel");
const ModCharacter = require("../../models/ModCharacterModel");
const User = require("../../models/UserModel");
const ItemModel = require("../../models/ItemModel");
const Mount = require("../../models/MountModel");
const { capitalizeVillageName } = require('../../utils/stringUtils');
const TempData = require('../../models/TempDataModel');
const {
  savePendingEditToStorage,
  retrievePendingEditFromStorage,
  deletePendingEditFromStorage
} = require('../../utils/storage');

// ============================================================================
// ------------------- Constants and Configuration -------------------
// Defining constant values such as default images, channel IDs, and emoji lists.
// ============================================================================

const DEFAULT_IMAGE_URL =
  "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EDIT_NOTIFICATION_CHANNEL_ID = '1381479893090566144';
const characterEmojis = [
  "🍃",
  "🍂",
  "🍁",
  "🌙",
  "💫",
  "⭐️",
  "🌟",
  "✨",
  "⚡️",
  "☄️",
  "💥",
  "🔥",
  "🌱",
  "🌿",
];

// ============================================================================
// ------------------- Slash Command Setup -------------------
// Defining the structure of the /modcharacter command, subcommands, and options.
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modcharacter")
    .setDescription("Create and manage mod characters (Oracle, Dragon, Sage)")

    // ------------------- Create Mod Character Subcommands -------------------
    .addSubcommandGroup((group) =>
      group
        .setName("create")
        .setDescription("Create a new mod character")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("oracle")
            .setDescription("Create an Oracle mod character")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("The name of the mod character")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("age")
                .setDescription("Age of the character (must be a positive number)")
                .setRequired(true)
                .setMinValue(1)
            )
            .addNumberOption((option) =>
              option
                .setName("height")
                .setDescription(
                  "Height of the character in cm (must be a positive number)"
                )
                .setRequired(true)
                .setMinValue(0.1)
            )
            .addStringOption((option) =>
              option
                .setName("pronouns")
                .setDescription("Pronouns of the character")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("race")
                .setDescription("Race of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("village")
                .setDescription("Home village of the character")
                .setRequired(true)
                .addChoices(
                  { name: "Rudania", value: "Rudania" },
                  { name: "Vhintl", value: "Vhintl" },
                  { name: "Inariko", value: "Inariko" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("oracle_type")
                .setDescription("Type of Oracle (Power, Courage, Wisdom)")
                .setRequired(true)
                .addChoices(
                  { name: "Power", value: "Power" },
                  { name: "Courage", value: "Courage" },
                  { name: "Wisdom", value: "Wisdom" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("job")
                .setDescription("Job of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("app_link")
                .setDescription("App link for the character")
                .setRequired(true)
            )
            .addAttachmentOption((option) =>
              option
                .setName("icon")
                .setDescription("Upload an icon image of the character")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("dragon")
            .setDescription("Create a Dragon mod character")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("The name of the mod character")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("age")
                .setDescription("Age of the character (must be a positive number)")
                .setRequired(true)
                .setMinValue(1)
            )
            .addNumberOption((option) =>
              option
                .setName("height")
                .setDescription(
                  "Height of the character in cm (must be a positive number)"
                )
                .setRequired(true)
                .setMinValue(0.1)
            )
            .addStringOption((option) =>
              option
                .setName("pronouns")
                .setDescription("Pronouns of the character")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("race")
                .setDescription("Race of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("village")
                .setDescription("Home village of the character")
                .setRequired(true)
                .addChoices(
                  { name: "Rudania", value: "Rudania" },
                  { name: "Vhintl", value: "Vhintl" },
                  { name: "Inariko", value: "Inariko" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("dragon_type")
                .setDescription("Type of Dragon (Power, Courage, Wisdom)")
                .setRequired(true)
                .addChoices(
                  { name: "Power", value: "Power" },
                  { name: "Courage", value: "Courage" },
                  { name: "Wisdom", value: "Wisdom" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("job")
                .setDescription("Job of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("app_link")
                .setDescription("App link for the character")
                .setRequired(true)
            )
            .addAttachmentOption((option) =>
              option
                .setName("icon")
                .setDescription("Upload an icon image of the character")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("sage")
            .setDescription("Create a Sage mod character")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("The name of the mod character")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("age")
                .setDescription("Age of the character (must be a positive number)")
                .setRequired(true)
                .setMinValue(1)
            )
            .addNumberOption((option) =>
              option
                .setName("height")
                .setDescription(
                  "Height of the character in cm (must be a positive number)"
                )
                .setRequired(true)
                .setMinValue(0.1)
            )
            .addStringOption((option) =>
              option
                .setName("pronouns")
                .setDescription("Pronouns of the character")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("race")
                .setDescription("Race of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("village")
                .setDescription("Home village of the character")
                .setRequired(true)
                .addChoices(
                  { name: "Rudania", value: "Rudania" },
                  { name: "Vhintl", value: "Vhintl" },
                  { name: "Inariko", value: "Inariko" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("sage_type")
                .setDescription("Type of Sage (Light, Water, Forest, Shadow)")
                .setRequired(true)
                .addChoices(
                  { name: "Light", value: "Light" },
                  { name: "Water", value: "Water" },
                  { name: "Forest", value: "Forest" },
                  { name: "Shadow", value: "Shadow" }
                )
            )
            .addStringOption((option) =>
              option
                .setName("job")
                .setDescription("Job of the character")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName("app_link")
                .setDescription("App link for the character")
                .setRequired(true)
            )
            .addAttachmentOption((option) =>
              option
                .setName("icon")
                .setDescription("Upload an icon image of the character")
                .setRequired(true)
            )
        )
    )

    // ------------------- View Mod Character Subcommands -------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View a mod character's details")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the mod character to view")
            .setRequired(true)
        )
    )

    // ------------------- List Mod Characters Subcommands -------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all mod characters")
    )

    // ------------------- Edit Mod Character Subcommand -------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing mod character")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The name of the mod character")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Category to edit")
            .setRequired(true)
            .addChoices(
              { name: "Name", value: "name" },
              { name: "Age", value: "age" },
              { name: "Height", value: "height" },
              { name: "Pronouns", value: "pronouns" },
              { name: "Race", value: "race" },
              { name: "Job", value: "job" },
              { name: "Village", value: "homeVillage" },
              { name: "Icon", value: "icon" },
              { name: "App Link", value: "appLink" },
              { name: "Mod Type", value: "modType" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("updatedinfo")
            .setDescription("Updated information for the selected category")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addAttachmentOption((option) =>
          option
            .setName("newicon")
            .setDescription("New icon for the character (only if updating icon)")
            .setRequired(false)
        )
    ),

  // ============================================================================
  // ------------------- Command Execution -------------------
  // Main command execution logic
  // ============================================================================

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const subcommandGroup = interaction.options.getSubcommandGroup();

      if (subcommandGroup === "create") {
        await handleCreateModCharacter(interaction, subcommand);
      } else if (subcommand === "view") {
        await handleViewModCharacter(interaction);
      } else if (subcommand === "list") {
        await handleListModCharacters(interaction);
      } else if (subcommand === "edit") {
        await handleEditModCharacter(interaction);
      }
    } catch (error) {
      handleInteractionError(error, 'modCharacter.js', {
        commandName: 'modCharacter',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        subcommand: interaction.options.getSubcommand(),
        subcommandGroup: interaction.options.getSubcommandGroup()
      });

      console.error(`[modCharacter.js]: Command execution failed:`, error);

      await interaction.reply({
        content: '❌ An error occurred while processing the command. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  // ============================================================================
  // ------------------- Autocomplete Handler -------------------
  // Handles autocomplete for various options
  // ============================================================================

  async autocomplete(interaction) {
    try {
      const subcommandGroup = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();
      const focusedOption = interaction.options.getFocused(true);

      console.log('[modCharacter.js]: 🔍 Autocomplete triggered');
      console.log('[modCharacter.js]: 📋 SubcommandGroup:', subcommandGroup);
      console.log('[modCharacter.js]: 📋 Subcommand:', subcommand);
      console.log('[modCharacter.js]: 📋 FocusedOption:', focusedOption.name);

      if (subcommandGroup === "create") {
        if (focusedOption.name === "race") {
          console.log('[modCharacter.js]: 🏃‍♂️ Handling race autocomplete');
          await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);
        } else if (focusedOption.name === "village") {
          console.log('[modCharacter.js]: 🏘️ Handling village autocomplete');
          await handleCreateCharacterVillageAutocomplete(interaction, focusedOption);
        } else if (focusedOption.name === "job") {
          console.log('[modCharacter.js]: 💼 Handling job autocomplete');
          await handleModCharacterJobAutocomplete(interaction, focusedOption);
        }
      } else if (subcommand === "view") {
        if (focusedOption.name === "name") {
          console.log('[modCharacter.js]: 👤 Handling name autocomplete');
          await handleModCharacterNameAutocomplete(interaction, focusedOption);
        }
      } else if (subcommand === "edit") {
        if (focusedOption.name === "name") {
          console.log('[modCharacter.js]: 👤 Handling edit name autocomplete');
          await handleModCharacterNameAutocomplete(interaction, focusedOption);
        } else if (focusedOption.name === "updatedinfo") {
          console.log('[modCharacter.js]: 📝 Handling edit updatedinfo autocomplete');
          await handleEditModCharacterAutocomplete(interaction, focusedOption);
        }
      }
    } catch (error) {
      console.error('[modCharacter.js]: ❌ Autocomplete error:', error);
      handleInteractionError(error, 'modCharacter.js', {
        operation: 'autocomplete',
        userTag: interaction.user.tag,
        userId: interaction.user.id
      });
      await interaction.respond([]);
    }
  },
};

// ============================================================================
// ------------------- Helper Functions -------------------
// Supporting functions for command execution
// ============================================================================

async function handleCreateModCharacter(interaction, subcommand) {
  try {
    // Check if user has permission to create mod characters
    const member = interaction.member;
    const hasModRole = member.roles.cache.some(role => 
      role.name.toLowerCase().includes('mod') || 
      role.name.toLowerCase().includes('admin') ||
      role.name.toLowerCase().includes('oracle') ||
      role.name.toLowerCase().includes('dragon') ||
      role.name.toLowerCase().includes('sage')
    );

    if (!hasModRole) {
      await interaction.reply({
        content: '❌ You do not have permission to create mod characters. Only moderators, admins, or existing mod characters can create new mod characters.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Extract character data from interaction
    const characterData = {
      name: interaction.options.getString('name'),
      age: interaction.options.getInteger('age'),
      height: interaction.options.getNumber('height'),
      pronouns: interaction.options.getString('pronouns'),
      race: interaction.options.getString('race'),
      village: interaction.options.getString('village'),
      job: interaction.options.getString('job'),
      appLink: interaction.options.getString('app_link'),
      userId: interaction.user.id
    };

    // Set mod character specific properties based on subcommand
    if (subcommand === 'oracle') {
      characterData.modTitle = 'Oracle';
      characterData.modType = interaction.options.getString('oracle_type');
    } else if (subcommand === 'dragon') {
      characterData.modTitle = 'Dragon';
      characterData.modType = interaction.options.getString('dragon_type');
    } else if (subcommand === 'sage') {
      characterData.modTitle = 'Sage';
      characterData.modType = interaction.options.getString('sage_type');
    }

    characterData.modOwner = interaction.user.tag;

    // Validate character name uniqueness
    const isUnique = await isUniqueModCharacterName(characterData.userId, characterData.name);

    if (!isUnique) {
      await interaction.reply({
        content: `❌ A mod character named "${characterData.name}" already exists for your account.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Validate race - mod characters can also be dragons
    if (!isValidRace(characterData.race) && characterData.race.toLowerCase() !== 'dragon') {
      await interaction.reply({
        content: `❌ Invalid race: ${characterData.race}. Please choose a valid race.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Validate job - mod characters can have their mod title as job or any regular job
    const validJobs = getAllJobs();
    const modTitleJob = characterData.modTitle; // Oracle, Sage, or Dragon
    
    if (!validJobs.includes(characterData.job) && characterData.job !== modTitleJob) {
      await interaction.reply({
        content: `❌ Invalid job: ${characterData.job}. Please choose a valid job or use "${modTitleJob}" for your mod character.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }



    // Create unique inventory for the mod character
    const characterName = characterData.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const inventoryCollectionName = characterName;

    // Handle icon upload
    let iconUrl = DEFAULT_IMAGE_URL;
    const iconAttachment = interaction.options.getAttachment('icon');
    if (iconAttachment && iconAttachment.url) {
      try {
        const response = await axios.get(iconAttachment.url, { responseType: 'arraybuffer' });
        const iconData = Buffer.from(response.data, 'binary');
        const blob = bucket.file(uuidv4() + path.extname(iconAttachment.name));
        const blobStream = blob.createWriteStream({ resumable: false });
        blobStream.end(iconData);
        await new Promise((resolve, reject) => {
          blobStream.on('finish', resolve);
          blobStream.on('error', reject);
        });
        iconUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      } catch (err) {
        handleInteractionError(err, 'modCharacter.js');
        // fallback to default
        iconUrl = DEFAULT_IMAGE_URL;
      }
    }

    // Create the mod character
    const modCharacterData = {
      userId: characterData.userId,
      name: characterData.name,
      age: characterData.age,
      height: characterData.height,
      pronouns: characterData.pronouns,
      race: characterData.race,
      homeVillage: characterData.village,
      currentVillage: characterData.village,
      job: characterData.job,
      icon: iconUrl,
      inventory: `https://docs.google.com/spreadsheets/d/17XE0IOXSjVx47HVQ4FdcvEXm7yeg51KVkoiamD5dmKs/edit?usp=sharing`,
      appLink: characterData.appLink,
      modTitle: characterData.modTitle,
      modType: characterData.modType,
      modOwner: characterData.modOwner,
      unlimitedHearts: true,
      unlimitedStamina: true,
      maxHearts: 999,
      currentHearts: 999,
      maxStamina: 999,
      currentStamina: 999
    };

    await createModCharacter(modCharacterData);

    // Create unique inventory collection for this mod character
    try {
      await createCharacterInventory(inventoryCollectionName, null, characterData.job);
      console.log(`[modCharacter.js]: Created inventory collection '${inventoryCollectionName}' for mod character '${characterData.name}'`);
    } catch (error) {
      console.log(`[modCharacter.js]: Inventory collection '${inventoryCollectionName}' already exists or error creating: ${error.message}`);
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(getVillageColorByName(characterData.village))
      .setTitle(`✨ ${characterData.modTitle} ${characterData.modType} Created!`)
      .setDescription(`**${characterData.name}** has been successfully created as a ${characterData.modTitle} of ${characterData.modType}!`)
      .addFields(
        { name: '👤 __Character__', value: `> ${characterData.name}`, inline: false },
        { name: '🏠 __Village__', value: `> ${characterData.village}`, inline: false },
        { name: '⚔️ __Job__', value: `> ${characterData.job}`, inline: false },
        { name: '🎭 __Race__', value: `> ${characterData.race}`, inline: false },
        { name: '📏 __Age__', value: `> ${characterData.age}`, inline: false },
        { name: '📐 __Height__', value: `> ${characterData.height}cm (${convertCmToFeetInches(characterData.height)})`, inline: false },
        { name: '❤️ __Hearts__', value: `> ∞ (Unlimited)`, inline: false },
        { name: '⚡ __Stamina__', value: `> ∞ (Unlimited)`, inline: false },
        { name: '📊 __Title__', value: `> ${characterData.modTitle} of ${characterData.modType}`, inline: false },
        { name: '📦 __Inventory__', value: `> [${characterData.name}'s Inventory](${modCharacterData.inventory})`, inline: false },
        { name: '🔗 __Application Link__', value: `> [Link](${characterData.appLink})`, inline: false }
      )
      .setThumbnail(iconUrl)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: `Created by ${characterData.modOwner}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    handleInteractionError(error, 'modCharacter.js', {
      commandName: 'handleCreateModCharacter',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: interaction.options.getString('name')
    });

    console.error(`[modCharacter.js]: Failed to create mod character:`, error);

    await interaction.reply({
      content: '❌ Failed to create mod character. Please try again later.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleViewModCharacter(interaction) {
  try {
    const characterName = interaction.options.getString('name');
    const userId = interaction.user.id;

    // Find the mod character
    const modCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);

    if (!modCharacter) {
      await interaction.reply({
        content: `❌ Mod character "${characterName}" not found.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Create character embed
    const embed = new EmbedBuilder()
      .setColor(getVillageColorByName(modCharacter.homeVillage))
      .setTitle(`${modCharacter.name} | ${capitalize(modCharacter.race)} | ${capitalizeFirstLetter(modCharacter.homeVillage)} | ${capitalizeFirstLetter(modCharacter.job)}`)
      .setDescription(`**${modCharacter.modTitle} of ${modCharacter.modType}**`)
      .addFields(
        { name: '👤 __Name__', value: `> ${modCharacter.name}`, inline: true },
        { name: '❤️ __Hearts__', value: `> ∞ (Unlimited)`, inline: true },
        { name: '🟩 __Stamina__', value: `> ∞ (Unlimited)`, inline: true },
        { name: '🔹 __Pronouns__', value: `> ${modCharacter.pronouns}`, inline: true },
        { name: '🔹 __Age__', value: `> ${modCharacter.age || 'N/A'}`, inline: true },
        { name: '🔹 __Height__', value: `> ${modCharacter.height ? `${modCharacter.height}cm (${convertCmToFeetInches(modCharacter.height)})` : 'N/A'}`, inline: true },
        { name: '🔹 __Race__', value: `> ${capitalize(modCharacter.race)}`, inline: true },
        { name: '🔹 __Home Village__', value: `> ${getVillageEmojiByName(modCharacter.homeVillage)} ${capitalizeFirstLetter(modCharacter.homeVillage)}`, inline: true },
        { name: '🔹 __Current Village__', value: `> ${getVillageEmojiByName(modCharacter.currentVillage)} ${capitalizeFirstLetter(modCharacter.currentVillage)}`, inline: true },
        { name: '🔹 __Job__', value: `> ${capitalizeFirstLetter(modCharacter.job)}`, inline: true },
        { name: '📊 __Title__', value: `> ${modCharacter.modTitle} of ${modCharacter.modType}`, inline: true },
        { name: '👑 __Owner__', value: `> ${modCharacter.modOwner}`, inline: true },
        { name: '📦 __Inventory__', value: `> [Shared Mod Inventory](${modCharacter.inventory})`, inline: false },
        { name: '🔗 __Application Link__', value: `> [Link](${modCharacter.appLink})`, inline: false }
      )
      .setThumbnail(modCharacter.icon || DEFAULT_IMAGE_URL)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: `Mod Character - Created by ${modCharacter.modOwner}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    handleInteractionError(error, 'modCharacter.js', {
      commandName: 'handleViewModCharacter',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: interaction.options.getString('name')
    });

    console.error(`[modCharacter.js]: Failed to view mod character:`, error);

    await interaction.reply({
      content: '❌ Failed to view mod character. Please try again later.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleListModCharacters(interaction) {
  try {
    const userId = interaction.user.id;

    // Find all mod characters for the user
    const modCharacters = await fetchModCharactersByUserId(userId);

    if (modCharacters.length === 0) {
      await interaction.reply({
        content: '❌ You don\'t have any mod characters yet.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Create list embed
    const embed = new EmbedBuilder()
      .setColor(getRandomColor())
      .setTitle('✨ Your Mod Characters')
      .setDescription(`You have **${modCharacters.length}** mod character(s):`)
      .setTimestamp();

    // Add character fields
    modCharacters.forEach((character, index) => {
      embed.addFields({
        name: `${index + 1}. ${character.name}`,
        value: `**${character.modTitle} of ${character.modType}**\n🏠 ${getVillageEmojiByName(character.homeVillage)} ${character.homeVillage} | ⚔️ ${character.job} | 🎭 ${character.race}`,
        inline: false
      });
    });

    embed.setFooter({ text: `Total: ${modCharacters.length} mod character(s)` })
      .setImage(DEFAULT_IMAGE_URL);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    handleInteractionError(error, 'modCharacter.js', {
      commandName: 'handleListModCharacters',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });

    console.error(`[modCharacter.js]: Failed to list mod characters:`, error);

    await interaction.reply({
      content: '❌ Failed to list mod characters. Please try again later.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleEditModCharacter(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const characterName = interaction.options.getString('name');
    const category = interaction.options.getString('category');
    const updatedInfo = interaction.options.getString('updatedinfo');
    const userId = interaction.user.id;
    const newIcon = interaction.options.getAttachment('newicon');

    console.log(`[handleEditModCharacter] Starting edit for mod character: ${characterName}, category: ${category}`);

    // Find the mod character
    const modCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);

    if (!modCharacter) {
      await interaction.editReply({
        content: `❌ Mod character "${characterName}" not found or does not belong to you.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Check if user has permission to edit this mod character
    const member = interaction.member;
    const hasModRole = member.roles.cache.some(role => 
      role.name.toLowerCase().includes('mod') || 
      role.name.toLowerCase().includes('admin') ||
      role.name.toLowerCase().includes('oracle') ||
      role.name.toLowerCase().includes('dragon') ||
      role.name.toLowerCase().includes('sage')
    );

    if (!hasModRole && modCharacter.modOwner !== interaction.user.tag) {
      await interaction.editReply({
        content: '❌ You do not have permission to edit this mod character.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    let previousValue;
    let finalUpdatedValue;

    // Get previous value
    switch (category) {
      case 'name':
        previousValue = modCharacter.name;
        break;
      case 'age':
        previousValue = modCharacter.age;
        break;
      case 'height':
        previousValue = modCharacter.height;
        break;
      case 'pronouns':
        previousValue = modCharacter.pronouns;
        break;
      case 'race':
        previousValue = modCharacter.race;
        break;
      case 'job':
        previousValue = modCharacter.job;
        break;
      case 'homeVillage':
        previousValue = modCharacter.homeVillage;
        break;
      case 'icon':
        previousValue = modCharacter.icon;
        break;
      case 'appLink':
        previousValue = modCharacter.appLink;
        break;
      case 'modType':
        previousValue = modCharacter.modType;
        break;
      default:
        previousValue = modCharacter[category];
    }

    // ------------------- Validation -------------------
    if (category === "job") {
      const validJobs = getAllJobs();
      const modTitleJob = modCharacter.modTitle; // Oracle, Sage, or Dragon
      
      if (!validJobs.includes(updatedInfo) && updatedInfo !== modTitleJob) {
        await interaction.editReply({
          content: `❌ Invalid job: ${updatedInfo}. Please choose a valid job or use "${modTitleJob}" for your mod character.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    }

    if (category === "race" && !isValidRace(updatedInfo) && updatedInfo.toLowerCase() !== 'dragon') {
      await interaction.editReply({
        content: `❌ Invalid race: ${updatedInfo}. Please choose a valid race.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    if (["age"].includes(category)) {
      const parsed = parseInt(updatedInfo, 10);
      if (isNaN(parsed) || parsed < 1) {
        await interaction.editReply({
          content: `❌ Invalid age: ${updatedInfo}. Please provide a positive number.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    }

    if (category === "height") {
      const height = parseFloat(updatedInfo);
      if (isNaN(height) || height < 0.1) {
        await interaction.editReply({
          content: `❌ Invalid height: ${updatedInfo}. Please provide a positive number in centimeters.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    }

    if (category === "homeVillage" && !["Rudania", "Vhintl", "Inariko"].includes(updatedInfo)) {
      await interaction.editReply({
        content: `❌ Invalid village: ${updatedInfo}. Please choose from Rudania, Vhintl, or Inariko.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    if (category === "modType") {
      const validModTypes = {
        'Oracle': ['Power', 'Courage', 'Wisdom'],
        'Dragon': ['Power', 'Courage', 'Wisdom'],
        'Sage': ['Light', 'Water', 'Forest', 'Shadow']
      };
      
      const validTypes = validModTypes[modCharacter.modTitle];
      if (!validTypes || !validTypes.includes(updatedInfo)) {
        await interaction.editReply({
          content: `❌ Invalid mod type: ${updatedInfo}. Valid types for ${modCharacter.modTitle} are: ${validTypes.join(', ')}.`,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    }

    // Handle special cases
    if (category === 'icon') {
      if (!newIcon) {
        await interaction.editReply({
          content: "❌ Please attach a new icon image when updating the icon.",
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      try {
        // Download and upload the icon image
        const response = await axios.get(newIcon.url, { responseType: 'arraybuffer' });
        const iconData = Buffer.from(response.data, 'binary');
        const blob = bucket.file(uuidv4() + path.extname(newIcon.name));
        const blobStream = blob.createWriteStream({ resumable: false });
        blobStream.end(iconData);
        await new Promise((resolve, reject) => {
          blobStream.on('finish', resolve);
          blobStream.on('error', reject);
        });

        // Generate public URL for the uploaded icon
        finalUpdatedValue = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      } catch (err) {
        handleInteractionError(err, 'modCharacter.js');
        await interaction.editReply({
          content: "❌ Failed to upload the new icon. Please try again later.",
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
    } else {
      finalUpdatedValue = updatedInfo;
    }

    // Update the mod character directly (no approval needed)
    const updateData = { [category]: finalUpdatedValue };
    
    // Handle special field mappings
    if (category === 'homeVillage') {
      updateData.currentVillage = finalUpdatedValue; // Also update current village
    }

    await updateModCharacterById(modCharacter._id, updateData);

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(getVillageColorByName(modCharacter.homeVillage))
      .setTitle('✅ Mod Character Updated!')
      .setDescription(`**${modCharacter.name}**'s ${category} has been successfully updated.`)
      .addFields(
        { name: '👤 __Character__', value: `> ${modCharacter.name}`, inline: false },
        { name: '📝 __Category__', value: `> ${category}`, inline: false },
        { name: '🔄 __Previous Value__', value: `> ${previousValue}`, inline: false },
        { name: '✅ __New Value__', value: `> ${finalUpdatedValue}`, inline: false }
      )
      .setThumbnail(category === 'icon' ? finalUpdatedValue : (modCharacter.icon || DEFAULT_IMAGE_URL))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: `Updated by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral]
    });

  } catch (error) {
    handleInteractionError(error, 'modCharacter.js', {
      commandName: 'handleEditModCharacter',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: interaction.options.getString('name')
    });

    console.error(`[modCharacter.js]: Failed to edit mod character:`, error);

    await interaction.editReply({
      content: '❌ Failed to edit mod character. Please try again later.',
      flags: [MessageFlags.Ephemeral]
    });
  }
}

async function handleEditModCharacterAutocomplete(interaction, focusedOption) {
  try {
    const selectedCategory = interaction.options.getString('category');
    const characterName = interaction.options.getString('name');
    
    if (!selectedCategory || !characterName) {
      await interaction.respond([]);
      return;
    }

    let suggestions = [];

    switch (selectedCategory) {
      case 'race':
        // Get valid races from race module
        const { isValidRace } = require("../../modules/raceModule");
        const validRaces = ['Hylian', 'Zora', 'Gerudo', 'Goron', 'Mixed', 'Sheikah', 'Rito', 'Korok/Kokiri', 'Keaton', 'Twili', 'Mogma', 'Dragon'];
        suggestions = validRaces
          .filter(race => race.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(race => ({ name: race, value: race }));
        break;

      case 'job':
        const allJobs = getAllJobs();
        // Add mod title as valid job option
        const modCharacter = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
        if (modCharacter) {
          allJobs.push(modCharacter.modTitle); // Oracle, Sage, or Dragon
        }
        suggestions = allJobs
          .filter(job => job.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(job => ({ name: job, value: job }));
        break;

      case 'homeVillage':
        const villages = ['Rudania', 'Vhintl', 'Inariko'];
        suggestions = villages
          .filter(village => village.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(village => ({ name: village, value: village }));
        break;

      case 'modType':
        // Get valid mod types based on the mod character's title
        const character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
        if (character) {
          const validModTypes = {
            'Oracle': ['Power', 'Courage', 'Wisdom'],
            'Dragon': ['Power', 'Courage', 'Wisdom'],
            'Sage': ['Light', 'Water', 'Forest', 'Shadow']
          };
          const validTypes = validModTypes[character.modTitle] || [];
          suggestions = validTypes
            .filter(type => type.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25)
            .map(type => ({ name: type, value: type }));
        }
        break;

      case 'pronouns':
        const commonPronouns = ['he/him', 'she/her', 'they/them', 'he/they', 'she/they', 'xe/xem', 'ze/zir', 'ey/em', 'fae/faer', 'ne/nem'];
        suggestions = commonPronouns
          .filter(pronoun => pronoun.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(pronoun => ({ name: pronoun, value: pronoun }));
        break;

      default:
        // For other fields like name, age, height, appLink, just return empty
        suggestions = [];
        break;
    }

    await interaction.respond(suggestions);
  } catch (error) {
    console.error('[modCharacter.js]: Autocomplete error:', error);
    await interaction.respond([]);
  }
} 