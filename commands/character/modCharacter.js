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

const { handleError } = require("../../utils/globalErrorHandler");
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
} = require("../../embeds/embeds");
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
  "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
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
      }
    } catch (error) {
      handleError(error, 'modCharacter.js', {
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
      }
    } catch (error) {
      console.error('[modCharacter.js]: ❌ Autocomplete error:', error);
      handleError(error, 'modCharacter.js', {
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



    // Use shared mod inventory for all mod characters
    const MOD_SHARED_INVENTORY_LINK = 'https://docs.google.com/spreadsheets/d/17XE0IOXSjVx47HVQ4FdcvEXm7yeg51KVkoiamD5dmKs/edit?usp=sharing';
    const inventoryCollectionName = 'mod_shared_inventory';

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
        handleError(err, 'modCharacter.js');
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
      inventory: MOD_SHARED_INVENTORY_LINK,
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

    // Create shared mod inventory collection (only if it doesn't exist)
    try {
      await createCharacterInventory(inventoryCollectionName, null, characterData.job);
    } catch (error) {
      // Collection might already exist, which is fine for shared inventory
      console.log(`[modCharacter.js]: Shared mod inventory collection already exists or error creating: ${error.message}`);
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(getVillageColorByName(characterData.village))
      .setTitle(`✨ ${characterData.modTitle} ${characterData.modType} Created!`)
      .setDescription(`**${characterData.name}** has been successfully created as a ${characterData.modTitle} of ${characterData.modType}!`)
      .addFields(
        { name: '👤 __Character__', value: `> ${characterData.name}`, inline: true },
        { name: '🏠 __Village__', value: `> ${characterData.village}`, inline: true },
        { name: '⚔️ __Job__', value: `> ${characterData.job}`, inline: true },
        { name: '🎭 __Race__', value: `> ${characterData.race}`, inline: true },
        { name: '📏 __Age__', value: `> ${characterData.age}`, inline: true },
        { name: '📐 __Height__', value: `> ${characterData.height}cm`, inline: true },
        { name: '❤️ __Hearts__', value: `> ∞ (Unlimited)`, inline: true },
        { name: '⚡ __Stamina__', value: `> ∞ (Unlimited)`, inline: true },
        { name: '📊 __Title__', value: `> ${characterData.modTitle} of ${characterData.modType}`, inline: true },
        { name: '📦 __Inventory__', value: `> [Shared Mod Inventory](${MOD_SHARED_INVENTORY_LINK})`, inline: false },
        { name: '🔗 __Application Link__', value: `> [Link](${characterData.appLink})`, inline: false }
      )
      .setThumbnail(iconUrl)
      .setImage(iconUrl)
      .setFooter({ text: `Created by ${characterData.modOwner}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    handleError(error, 'modCharacter.js', {
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
        { name: '🔹 __Height__', value: `> ${modCharacter.height ? `${modCharacter.height}cm` : 'N/A'}`, inline: true },
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
      .setImage(DEFAULT_IMAGE_URL)
      .setFooter({ text: `Mod Character - Created by ${modCharacter.modOwner}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    handleError(error, 'modCharacter.js', {
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
    handleError(error, 'modCharacter.js', {
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