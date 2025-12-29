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

const { handleInteractionError } = require('../../../shared/utils/globalErrorHandler');
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
} = require('../../../shared/database/db');
const {
 getVillageColorByName,
 getVillageEmojiByName,
} = require("../../modules/locationsModule");
const {
 handleCharacterBasedCommandsAutocomplete,
 handleAutocomplete,
 handleChangeJobNewJobAutocomplete,
 handleCreateCharacterRaceAutocomplete,
 handleEditCharacterAutocomplete,
} = require("../../handlers/autocompleteHandler");
const {
 canChangeJob,
 canChangeVillage,
 isUniqueCharacterName,
 isValidGoogleSheetsUrl,
 extractSpreadsheetId,
 convertCmToFeetInches,
} = require('../../../shared/utils/validation');
const {
 appendSheetData,
 authorizeSheets,
 deleteInventorySheetData,
 safeAppendDataToSheet,
} = require('../../../shared/utils/googleSheetsUtils');
const {
 createCharacterAutocomplete,
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
const bucket = require('../../../shared/config/gcsService');

const Character = require('../../../shared/models/CharacterModel');
const User = require('../../../shared/models/UserModel');
const ItemModel = require('../../../shared/models/ItemModel');
const Mount = require('../../../shared/models/MountModel');
const { capitalizeVillageName } = require('../../../shared/utils/stringUtils');
const TempData = require('../../../shared/models/TempDataModel');
const {
  savePendingEditToStorage,
  retrievePendingEditFromStorage,
  deletePendingEditFromStorage
} = require('../../../shared/utils/storage');

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
// Defining the structure of the /character command, subcommands, and options.
// ============================================================================

module.exports = {
 data: new SlashCommandBuilder()
  .setName("character")
  .setDescription("Manage your characters")

  // ------------------- Create Character Subcommands -------------------
  .addSubcommandGroup((group) =>
   group
    .setName("create")
    .setDescription("Create a new character")
    .addSubcommand((subcommand) =>
     subcommand
      .setName("rudania")
      .setDescription("Create a character with a Rudania exclusive job")
      .addStringOption((option) =>
       option
        .setName("name")
        .setDescription("The name of the character")
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
      .addIntegerOption((option) =>
       option
        .setName("hearts")
        .setDescription("Number of hearts (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
      )
      .addIntegerOption((option) =>
       option
        .setName("stamina")
        .setDescription("Number of stamina (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
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
        .setName("job")
        .setDescription("The job of the character")
        .setRequired(true)
        .addChoices(...createJobOptions(villageJobs.rudania))
      )
      .addStringOption((option) =>
       option
        .setName("inventory")
        .setDescription("Google Sheets link for the inventory")
        .setRequired(true)
      )
      .addStringOption((option) =>
       option
        .setName("applink")
        .setDescription("Application link for the character")
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
      .setName("inariko")
      .setDescription("Create a character with an Inariko exclusive job")
      .addStringOption((option) =>
       option
        .setName("name")
        .setDescription("The name of the character")
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
      .addIntegerOption((option) =>
       option
        .setName("hearts")
        .setDescription("Number of hearts (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
      )
      .addIntegerOption((option) =>
       option
        .setName("stamina")
        .setDescription("Number of stamina (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
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
        .setName("job")
        .setDescription("The job of the character")
        .setRequired(true)
        .addChoices(...createJobOptions(villageJobs.inariko))
      )
      .addStringOption((option) =>
       option
        .setName("inventory")
        .setDescription("Google Sheets link for the inventory")
        .setRequired(true)
      )
      .addStringOption((option) =>
       option
        .setName("applink")
        .setDescription("Application link for the character")
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
      .setName("vhintl")
      .setDescription("Create a character with a Vhintl exclusive job")
      .addStringOption((option) =>
       option
        .setName("name")
        .setDescription("The name of the character")
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
      .addIntegerOption((option) =>
       option
        .setName("hearts")
        .setDescription("Number of hearts (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
      )
      .addIntegerOption((option) =>
       option
        .setName("stamina")
        .setDescription("Number of stamina (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
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
        .setName("job")
        .setDescription("The job of the character")
        .setRequired(true)
        .addChoices(...createJobOptions(villageJobs.vhintl))
      )
      .addStringOption((option) =>
       option
        .setName("inventory")
        .setDescription("Google Sheets link for the inventory")
        .setRequired(true)
      )
      .addStringOption((option) =>
       option
        .setName("applink")
        .setDescription("Application link for the character")
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
      .setName("general")
      .setDescription("Create a character with a general job")
      .addStringOption((option) =>
       option
        .setName("name")
        .setDescription("The name of the character")
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
      .addIntegerOption((option) =>
       option
        .setName("hearts")
        .setDescription("Number of hearts (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
      )
      .addIntegerOption((option) =>
       option
        .setName("stamina")
        .setDescription("Number of stamina (must be a positive number)")
        .setRequired(true)
        .setMinValue(1)
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
        .setDescription("The home village of the character")
        .setRequired(true)
        .addChoices(
         { name: "Inariko", value: "inariko" },
         { name: "Rudania", value: "rudania" },
         { name: "Vhintl", value: "vhintl" }
        )
      )
      .addStringOption((option) =>
       option
        .setName("job")
        .setDescription("The job of the character")
        .setRequired(true)
        .addChoices(...createJobOptions(generalJobs))
      )
      .addStringOption((option) =>
       option
        .setName("inventory")
        .setDescription("Google Sheets link for the inventory")
        .setRequired(true)
      )
      .addStringOption((option) =>
       option
        .setName("applink")
        .setDescription("Application link for the character")
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

  // ------------------- Edit Character Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("edit")
    .setDescription("Edit an existing character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of the character")
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
       { name: "Hearts", value: "hearts" },
       { name: "Stamina", value: "stamina" },
       { name: "Pronouns", value: "pronouns" },
       { name: "Race", value: "race" },
       { name: "Job", value: "job" },
       { name: "Village", value: "homeVillage" },
       { name: "Icon", value: "icon" },
       { name: "App Link", value: "app_link" },
       { name: "Inventory", value: "inventory" }
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
  )
  // ------------------- View Character Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("view")
    .setDescription("View details of a character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of the character")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  // ------------------- View List of Characters Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("viewlist")
    .setDescription("View a list of characters")
    .addUserOption((option) =>
     option
      .setName("user")
      .setDescription("The user whose characters you want to view")
      .setRequired(false)
    )
  )
  // ------------------- Delete Character Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("delete")
    .setDescription("Delete a character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of the character to delete")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
 // ------------------- Change Character Job Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("changejob")
    .setDescription(
     "Change the job of your character (Costs 500 tokens, once per month)"
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("newjob")
      .setDescription("The new job you want for your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
 // ------------------- Set Character Birthday Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("setbirthday")
    .setDescription("Set the birthday of a character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of the character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("birthday")
      .setDescription("The birthday in MM-DD format")
      .setRequired(true)
    )
  ),

// ============================================================================
// ------------------- Slash Command Main Handlers -------------------
// Handling command execution and autocomplete functionality.
// ============================================================================

 async execute(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  
  try {
   if (subcommandGroup === "create") {
    await handleCreateCharacter(interaction, subcommand);
   } else {
    switch (subcommand) {
     case "edit":
      await handleEditCharacter(interaction);
      break;
     case "view":
      await handleViewCharacter(interaction);
      break;
     case "viewlist":
      await handleViewCharacterList(interaction);
      break;
     case "delete":
      await handleDeleteCharacter(interaction);
      break;
     case "changejob":
      await handleChangeJob(interaction);
      break;
     case "setbirthday":
      await handleSetBirthday(interaction);
      break;
     default:
      await interaction.reply({
       content: "❌ Unknown command.",
       flags: 64
      });
    }
   }
  } catch (error) {
   await handleInteractionError(error, interaction, {
     source: 'character.js',
     subcommand: interaction.options?.getSubcommand()
   });
  }
 },

 async autocomplete(interaction) {
  try {
   const subcommandGroup = interaction.options.getSubcommandGroup(false);
   const subcommand = interaction.options.getSubcommand();
   const focusedOption = interaction.options.getFocused(true);
 
   if (subcommandGroup === "create") {
    if (focusedOption.name === "race") {
      await handleCreateCharacterRaceAutocomplete(interaction, focusedOption);
    }
   } else {
    switch (subcommand) {
      case "edit":
        if (focusedOption.name === "charactername") {
          await handleCharacterBasedCommandsAutocomplete(
            interaction,
            focusedOption,
            "character"
          );
        } else if (focusedOption.name === "updatedinfo") {
          const selectedCategory = interaction.options.getString('category');
          const characterName = interaction.options.getString('charactername')?.split(' | ')[0];
      
          if (selectedCategory === "job") {
            const allJobs = getAllJobs();
            const filteredJobs = allJobs
              .filter(job => job.toLowerCase().includes(focusedOption.value.toLowerCase()))
              .slice(0, 25)
              .map(job => ({ name: job, value: job }));
      
            await interaction.respond(filteredJobs);
          } else if (selectedCategory === "Village" || selectedCategory === "homeVillage") {
            const villages = ["inariko", "rudania", "vhintl"];
            const filteredVillages = villages
              .filter(village => village.toLowerCase().includes(focusedOption.value.toLowerCase()))
              .slice(0, 25)
              .map(village => ({ name: village, value: village }));
      
            await interaction.respond(filteredVillages);
          } else if (selectedCategory === "race") {
            await handleEditCharacterAutocomplete(interaction, focusedOption);
          } else {
            await interaction.respond([]);
          }
        }
        break;
      
      case "delete":
      case "setbirthday":
        if (focusedOption.name === "charactername") {
          await handleCharacterBasedCommandsAutocomplete(
            interaction,
            focusedOption,
            "character"
          );
        }
        break;
      
     case "changejob":
      if (focusedOption.name === "charactername") {
       await handleCharacterBasedCommandsAutocomplete(
        interaction,
        focusedOption,
        "changejob"
       );
      } else if (focusedOption.name === "newjob") {
       await handleChangeJobNewJobAutocomplete(interaction, focusedOption);
      }
      break;
     default:
      if (focusedOption.name === "charactername") {
       await handleCharacterBasedCommandsAutocomplete(
        interaction,
        focusedOption,
        "character"
       );
      }
      break;
    }
   }
  } catch (error) {
   handleInteractionError(error, interaction, {
     commandName: interaction.commandName,
     userTag: interaction.user?.tag,
     userId: interaction.user?.id,
     options: interaction.options?.data
   });
   await interaction.respond([]);
   
  }
 },
};

// ============================================================================
// ------------------- Character Creation Handler -------------------
// Processes character creation, validation, and database updates.
// ============================================================================

async function handleCreateCharacter(interaction, subcommand) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const userId = interaction.user.id;
    let user = await User.findOne({ discordId: userId });

    if (!user) {
      user = new User({
        discordId: userId,
        characterSlot: 2,
      });
      await user.save();
      console.log(
        `[CreateCharacter]: Created new user profile for ${interaction.user.tag} with 2 character slots.`
      );
    }

    if (user.characterSlot <= 0) {
      await interaction.editReply({
        content:
          "❌ You do not have enough character slots available to create a new character.",
     flags: [MessageFlags.Ephemeral]
    });
      return;
    }

    const characterName = interaction.options.getString("name");
    // Get the actual name part before the "|" if it exists
    const actualName = characterName.split('|')[0].trim();
    
    // Validate numeric fields
    const age = interaction.options.getInteger("age");
    const hearts = interaction.options.getInteger("hearts");
    const stamina = interaction.options.getInteger("stamina");
    const height = interaction.options.getNumber("height");

    // Validate age
    if (age < 1) {
      await interaction.editReply({
        content: "❌ Age must be a positive number.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate hearts and stamina
    if (hearts < 1 || stamina < 1) {
      await interaction.editReply({
        content: "❌ Hearts and stamina values must be positive numbers.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate height
    if (isNaN(height) || height <= 0) {
      await interaction.editReply({
        content: "❌ Height must be a positive number.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate race
    const race = interaction.options.getString("race");
    if (!isValidRace(race)) {
      await interaction.editReply({
        content: `❌ "${race}" is not a valid race. Please select a valid race from the autocomplete options.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate village (for general subcommand)
    const village = interaction.options.getString("village");
    if (subcommand === "general" && !["inariko", "rudania", "vhintl"].includes(village)) {
      await interaction.editReply({
        content: `❌ "${village}" is not a valid village. Please select a valid village from the choices.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate job
    const job = interaction.options.getString("job");
    if (!job) {
      await interaction.editReply({
        content: "❌ Please select a valid job from the choices.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate inventory link
    const inventory = interaction.options.getString("inventory");
    if (!isValidGoogleSheetsUrl(inventory)) {
      await interaction.editReply({
        content: "❌ Please provide a valid Google Sheets URL for the inventory.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate app link
    const appLink = interaction.options.getString("applink");
    if (!appLink) {
      await interaction.editReply({
        content: "❌ Please provide a valid application link.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate icon
    const icon = interaction.options.getAttachment("icon");
    if (!icon) {
      await interaction.editReply({
        content: "❌ Please provide a valid icon image.",
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const formattedRace = `Race: ${race}`;
    const formattedVillage = `${capitalizeFirstLetter(village)} Resident`;
    const formattedJob = `Job: ${capitalizeWords(job)}`;

    const { perks: jobPerks } = getJobPerk(job) || { perks: [] };

    const member = interaction.member;
    const roleNames = [formattedRace, formattedVillage, formattedJob];
    const missingRoles = [];
    const assignedRoles = [];

    // Check bot's permissions first
    if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
      console.warn('[Roles]: Bot lacks the "Manage Roles" permission.');
      missingRoles.push('All roles (Bot lacks permissions)');
    } else {
      // Check if bot's role is high enough in hierarchy
      const botRole = interaction.guild.members.me.roles.highest;

      // Map role names to their IDs from .env
      const roleIdMap = {
        'Race: Hylian': process.env.RACE_HYLIAN,
        'Race: Zora': process.env.RACE_ZORA,
        'Race: Gerudo': process.env.RACE_GERUDO,
        'Race: Goron': process.env.RACE_GORON,
        'Race: Mixed': process.env.RACE_MIXED,
        'Race: Sheikah': process.env.RACE_SHEIKAH,
        'Race: Rito': process.env.RACE_RITO,
        'Race: Korok/Kokiri': process.env.RACE_KOROK_KOKIRI,
        'Race: Keaton': process.env.RACE_KEATON,
        'Race: Twili': process.env.RACE_TWILI,
        'Race: Mogma': process.env.RACE_MOGMA,
        'Inariko Resident': process.env.INARIKO_RESIDENT,
        'Rudania Resident': process.env.RUDANIA_RESIDENT,
        'Vhintl Resident': process.env.VHINTL_RESIDENT,
        ' Resident': process.env.RESIDENT_ROLE_ID, // Generic resident role
        'Job: Rancher': process.env.JOB_RANCHER,
        'Job: Shopkeeper': process.env.JOB_SHOPKEEPER,
        'Job: Farmer': process.env.JOB_FARMER,
        'Job: Weaver': process.env.JOB_WEAVER
      };

      // Map job perks to their IDs
      const jobPerkIdMap = {
        'LOOTING': process.env.JOB_PERK_LOOTING,
        'STEALING': process.env.JOB_PERK_STEALING,
        'ENTERTAINING': process.env.JOB_PERK_ENTERTAINING,
        'DELIVERING': process.env.JOB_PERK_DELIVERING,
        'HEALING': process.env.JOB_PERK_HEALING,
        'GATHERING': process.env.JOB_PERK_GATHERING,
        'CRAFTING': process.env.JOB_PERK_CRAFTING,
        'BOOST': process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING,
        'VENDING': process.env.JOB_PERK_VENDING
      };

      // Try to assign roles, but don't fail if they're missing
      for (const roleName of roleNames) {
        const roleId = roleIdMap[roleName];
        if (!roleId) {
          console.warn(`[Roles]: Role ID not found for "${roleName}" in configuration.`);
          missingRoles.push(roleName);
          continue;
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          console.warn(`[Roles]: Role "${roleName}" not found in the guild.`);
          missingRoles.push(roleName);
          continue;
        }

        if (botRole.position <= role.position) {
          console.warn(`[Roles]: Bot's role is not high enough to assign the "${roleName}" role.`);
          missingRoles.push(roleName);
          continue;
        }

        try {
          await member.roles.add(role);
          assignedRoles.push(roleName);
          console.log(`[Roles]: Assigned role "${roleName}" to user "${member.user.tag}".`);
        } catch (error) {
          console.error(`[Roles]: Failed to assign role "${roleName}":`, error.message);
          missingRoles.push(roleName);
        }
      }

      // Try to assign perk roles, but don't fail if they're missing
      for (const perk of jobPerks) {
        const perkRoleId = jobPerkIdMap[perk];
        if (!perkRoleId) {
          console.warn(`[Roles]: Perk role ID not found for "${perk}" in configuration.`);
          missingRoles.push(`Job Perk: ${perk}`);
          continue;
        }

        const perkRole = interaction.guild.roles.cache.get(perkRoleId);
        if (!perkRole) {
          console.warn(`[Roles]: Perk role "Job Perk: ${perk}" not found in the guild.`);
          missingRoles.push(`Job Perk: ${perk}`);
          continue;
        }

        if (botRole.position <= perkRole.position) {
          console.warn(`[Roles]: Bot's role is not high enough to assign the "Job Perk: ${perk}" role.`);
          missingRoles.push(`Job Perk: ${perk}`);
          continue;
        }

        try {
          await member.roles.add(perkRole);
          assignedRoles.push(`Job Perk: ${perk}`);
          console.log(`[Roles]: Assigned perk role "Job Perk: ${perk}" to user "${member.user.tag}".`);
        } catch (error) {
          console.error(`[Roles]: Failed to assign perk role "Job Perk: ${perk}":`, error.message);
          missingRoles.push(`Job Perk: ${perk}`);
        }
      }
    }

    user.characterSlot -= 1;
    await user.save();

    await createCharacterInteraction(interaction, assignedRoles, missingRoles);

    // Note: createCharacterInteraction already handles sending the reply,
    // so we don't need to send another one here
  } catch (error) {
    handleInteractionError(error, interaction, { source: "character.js" });
    console.error(
      "[CreateCharacter]: Error during character creation:",
      error.message
    );

    await interaction.editReply({
      content: "❌ An error occurred during character creation. Please try again later.",
      flags: [MessageFlags.Ephemeral]
    });
  }
}

// ============================================================================
// ------------------- Character Editing Handler -------------------
// Processes updates to existing characters including name, job, race, village, etc.
// ============================================================================


async function handleEditCharacter(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const fullCharacterName = interaction.options.getString("charactername");
    const characterName = fullCharacterName?.split(' | ')[0];
    const category = interaction.options.getString("category");
    const updatedInfo = interaction.options.getString("updatedinfo");
    const userId = interaction.user.id;
    const newIcon = interaction.options.getAttachment("newicon");

    console.log(`[handleEditCharacter] Starting edit for character: ${characterName}, category: ${category}`);

    await connectToTinglebot();
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      return await safeReply(interaction, {
        color: 0xFF0000,
        title: '❌ Character Not Found',
        description: `The character "${characterName}" does not exist in the database.`,
        image: { url: 'https://storage.googleapis.com/tinglebot/border%20error.png' },
        footer: { text: 'Character Validation' }
      }, true);
    }

    await connectToInventories();
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const spiritOrb = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: { $regex: /^spirit orb$/i }
    });
    character.spiritOrbs = spiritOrb?.quantity || 0;

    let previousValue;
    switch (category) {
      case 'stamina':
        previousValue = {
          maxStamina: character.maxStamina,
          currentStamina: character.currentStamina
        };
        break;
      case 'hearts':
        previousValue = character.currentHearts;
        break;
      case 'name':
        previousValue = character.name;
        break;
      case 'age':
        previousValue = character.age;
        break;
      case 'height':
        previousValue = character.height;
        break;
      case 'pronouns':
        previousValue = character.pronouns;
        break;
      case 'race':
        previousValue = character.race;
        break;
      case 'job':
        previousValue = character.job;
        break;
      case 'homeVillage':
        previousValue = character.homeVillage;
        break;
      case 'icon':
        previousValue = character.icon;
        break;
      case 'app_link':
        previousValue = character.appLink;
        break;
      case 'inventory':
        previousValue = character.inventory;
        break;
      default:
        previousValue = character[category];
    }

    // ------------------- Validation -------------------
    if (category === "job") {
      if (!isValidJob(updatedInfo)) {
        return await safeReply(interaction, `❌ **${updatedInfo}** is not a valid job.`);
      }
      const jobValidation = canChangeJob(character, updatedInfo);
      if (!jobValidation.valid) {
        return await safeReply(interaction, jobValidation.message);
      }
    }

    if (category === "race" && !isValidRace(updatedInfo)) {
      return await safeReply(interaction, `⚠️ **${updatedInfo}** is not a valid race.`);
    }

    if (["hearts", "age"].includes(category)) {
      const parsed = parseInt(updatedInfo, 10);
      if (isNaN(parsed) || parsed < 0) {
        return await safeReply(interaction, `⚠️ **${updatedInfo}** is not a valid ${category}. Please provide a non-negative number.`);
      }
    }

    if (category === "height") {
      const height = parseFloat(updatedInfo);
      if (isNaN(height) || height < 0) {
        return await safeReply(interaction, `⚠️ **${updatedInfo}** is not a valid height. Please use centimeters.`);
      }
    }

    if (category === "stamina") {
      const stamina = parseInt(updatedInfo, 10);
      if (isNaN(stamina) || stamina < 0) {
        return await safeReply(interaction, `⚠️ **${updatedInfo}** is not valid for stamina.`);
      }
    }

    // ------------------- Pending Edit Logic -------------------
    const editId = new mongoose.Types.ObjectId().toString();
    let finalUpdatedValue;
    
    if (category === 'stamina') {
      finalUpdatedValue = { maxStamina: parseInt(updatedInfo, 10), currentStamina: parseInt(updatedInfo, 10) };
    } else if (category === 'icon') {
      if (!newIcon) {
        return await safeReply(interaction, "❌ Please attach a new icon image when updating the icon.");
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
        handleInteractionError(err, interaction, { source: "character.js" });
        return await safeReply(interaction, "❌ Failed to upload the new icon. Please try again later.");
      }
    } else {
      finalUpdatedValue = updatedInfo;
    }

    const notificationEmbed = formatEditNotification(
      interaction.user.tag,
      character.name,
      category,
      previousValue,
      finalUpdatedValue,
      editId
    );

    try {
      const notificationChannel = interaction.guild.channels.cache.get(EDIT_NOTIFICATION_CHANNEL_ID);
      if (!notificationChannel?.isTextBased()) {
        throw new Error('Invalid notification channel');
      }

      const sentMessage = await notificationChannel.send(notificationEmbed);
      
      const pendingEdit = {
        characterId: character._id,
        userId: userId,
        category: category,
        previousValue: previousValue,
        updatedValue: finalUpdatedValue,
        status: 'pending',
        createdAt: new Date(),
        notificationMessageId: sentMessage.id
      };
      
      await savePendingEditToStorage(editId, pendingEdit);
    } catch (err) {
      handleInteractionError(err, interaction, { source: "character.js" });
      console.error(`[character.js]: Error sending update notification: ${err.message}`);
      return await safeReply(interaction, "❌ Failed to send edit request to mods. Please try again later.");
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('📝 Edit Request Submitted')
      .setDescription(`Your request to change ${character.name}'s ${category} has been sent to the mod team for review.`)
      .addFields(
        { name: '⏳ Review Time', value: '> Please allow up to 48 hours for review.', inline: false },
        { name: '🔗 Request ID', value: `> \`${editId}\``, inline: false }
      )
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({
        text: 'Character Edit Request'
      })
      .setTimestamp();

    await safeReply(interaction, successEmbed, true);

  } catch (error) {
    handleInteractionError(error, interaction, { source: "character.js" });
    console.error('[handleEditCharacter] Error occurred:', error);
    await safeReply(interaction, "❌ An error occurred while processing your request.");
  }
}

// ------------------- Utility Functions -------------------

function formatEditNotification(userTag, characterName, category, previous, updated, requestId) {
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('📢 PENDING CHARACTER EDIT REQUEST')
    .addFields(
      { name: '🌱 User', value: `> \`${userTag}\``, inline: false },
      { name: '👤 Character Name', value: `> \`${characterName}\``, inline: false },
      { name: '🛠️ Edited Category', value: `> \`${category}\``, inline: false },
      { name: '🔄 Previous Value', value: `> \`${typeof previous === 'object' ? JSON.stringify(previous) : previous}\``, inline: false },
      { name: '✅ Requested Value', value: `> \`${typeof updated === 'object' ? JSON.stringify(updated) : updated}\``, inline: false },
      { name: '🔗 Request ID', value: `> \`${requestId}\``, inline: false }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({
      text: 'Character Edit Request'
    })
    .setTimestamp();

  return { embeds: [embed] };
}

async function safeReply(interaction, message, isEmbed = false) {
  const payload = isEmbed
    ? { embeds: [message], flags: [MessageFlags.Ephemeral] }
    : { content: message, flags: [MessageFlags.Ephemeral] };

  if (!interaction.replied && !interaction.deferred) {
    return interaction.reply(payload);
  } else {
    return interaction.followUp(payload);
  }
}

// ============================================================================
// ------------------- Character Viewing Handlers -------------------
// Handles viewing individual character profiles and listing characters.
// ============================================================================


async function handleViewCharacter(interaction) {
 try {
  const characterName = interaction.options.getString("charactername");
  const userId = interaction.user.id;

  const character = await fetchCharacterByNameAndUserId(characterName, userId);

  if (!character) {
   await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Character Not Found')
      .setDescription(`The character "${characterName}" does not exist in the database.`)
      .addFields(
        { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
        { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
      )
      .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
      .setFooter({ text: 'Character Validation' })
      .setTimestamp()],
    flags: 64
   });
   return;
  }

  // Get actual spirit orb count from inventory
  await connectToInventories();
  const inventoryCollection = await getCharacterInventoryCollection(character.name);
  const spiritOrb = await inventoryCollection.findOne({
    characterId: character._id,
    itemName: { $regex: /^spirit orb$/i }
  });
  
  // Update character's spirit orb count
  character.spiritOrbs = spiritOrb?.quantity || 0;
  
  // Save the updated spirit orb count to the character document
  await Character.findByIdAndUpdate(character._id, { spiritOrbs: character.spiritOrbs });

  // Refresh the character object to ensure it has the updated spirit orb count
  const updatedCharacter = await Character.findById(character._id);
  if (!updatedCharacter) {
    throw new Error('Failed to refresh character data');
  }

  const settings = getCommonEmbedSettings(updatedCharacter);

  const characterEmbed = createCharacterEmbed(updatedCharacter);

  const itemNames = [
   updatedCharacter.gearWeapon?.name,
   updatedCharacter.gearShield?.name,
   updatedCharacter.gearArmor?.head?.name,
   updatedCharacter.gearArmor?.chest?.name,
   updatedCharacter.gearArmor?.legs?.name,
  ].filter(Boolean);

  const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });

  const getItemDetail = (itemName) => {
   const item = itemDetails.find((detail) => detail.itemName === itemName);
   return item
    ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]`
    : "N/A";
  };

  const gearMap = {
   head: updatedCharacter.gearArmor?.head
    ? `> ${getItemDetail(updatedCharacter.gearArmor.head.name)}`
    : "> N/A",
   chest: updatedCharacter.gearArmor?.chest
    ? `> ${getItemDetail(updatedCharacter.gearArmor.chest.name)}`
    : "> N/A",
   legs: updatedCharacter.gearArmor?.legs
    ? `> ${getItemDetail(updatedCharacter.gearArmor.legs.name)}`
    : "> N/A",
   weapon: updatedCharacter.gearWeapon
    ? `> ${getItemDetail(updatedCharacter.gearWeapon.name)}`
    : "> N/A",
   shield: updatedCharacter.gearShield
    ? `> ${getItemDetail(updatedCharacter.gearShield.name)}`
    : "> N/A",
  };

  const gearEmbed = createCharacterGearEmbed(updatedCharacter, gearMap, "all");

  const jobPerkInfo = getJobPerk(updatedCharacter.job);
  const embeds = [characterEmbed, gearEmbed];

  if (jobPerkInfo?.perks.includes("VENDING") && updatedCharacter.vendorType) {
   const vendorEmbed = createVendorEmbed(updatedCharacter);
   if (vendorEmbed) embeds.push(vendorEmbed);
  }

  const mount = await Mount.findOne({ characterId: updatedCharacter._id });
  if (mount) {
   const speciesEmoji = getMountEmoji(mount.species);
   const formattedTraits =
    mount.traits && mount.traits.length
     ? mount.traits.map((trait) => `> ${trait}`).join("\n")
     : "No traits available";

   const mountEmbed = {
    title: `${speciesEmoji} **${mount.name}** - Mount Details`,
    description: `✨ **Mount Stats for**: **${updatedCharacter.name}**`,
    fields: [
     {
      name: "🌟 **__Species__**",
      value: `> ${mount.species || "Unknown"}`,
      inline: true,
     },
     {
      name: "#️⃣ **__Level__**",
      value: `> ${mount.level || "Unknown"}`,
      inline: true,
     },
     {
      name: "🥕 **__Stamina__**",
      value: `> ${mount.stamina || "Unknown"}`,
      inline: true,
     },
     {
      name: "👤 **__Owner__**",
      value: `> ${mount.owner || "Unknown"}`,
      inline: true,
     },
     {
      name: "🌍 **__Region__**",
      value: `> ${mount.region || "Unknown"}`,
      inline: true,
     },
     { name: "✨ **__Traits__**", value: `${formattedTraits}`, inline: false },
    ],
    color: parseInt(settings.color.replace("#", ""), 16),
    thumbnail: { url: getMountThumbnail(mount.species) },
    image: {
     url: "https://storage.googleapis.com/tinglebot/Graphics/border.png",
    },
    footer: {
     text: `${updatedCharacter.name}'s Mount Stats`,
     iconURL: updatedCharacter.icon,
    },
    timestamp: new Date(),
   };

   embeds.push(mountEmbed);
  }

  await interaction.reply({ embeds, flags: 64 });
 } catch (error) {
  handleInteractionError(error, interaction, { source: "character.js" });
  console.error("Error executing viewcharacter command:", error);
  await interaction.reply({
   content: "❌ An error occurred while fetching the character.",
   flags: 64
  });
 }
}

async function handleViewCharacterList(interaction) {
 try {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const userId = targetUser.id;

  await connectToTinglebot();
  const characters = await fetchCharactersByUserId(userId);

  if (!characters.length) {
   await interaction.reply({
    content: `❌ **${targetUser.username}** has no saved characters.`,
    flags: 64
   });
   return;
  }

  const embed = new EmbedBuilder()
   .setAuthor({
    name: `${targetUser.username}'s Character List`,
    iconURL: targetUser.displayAvatarURL(),
   })
   .setColor(getRandomColor())
   .setFooter({ text: "Click a character below to view more details!" })
   .setImage(
    "https://storage.googleapis.com/tinglebot/Graphics/border.png"
   );

  const rows = [];
  characters.forEach((character, index) => {
   const randomEmoji =
    characterEmojis[Math.floor(Math.random() * characterEmojis.length)];

   embed.addFields({
    name: `${randomEmoji} ${character.name} | **${capitalize(
     character.race
    )}** | **${capitalize(character.homeVillage)}** | **${capitalize(
     character.job
    )}**`,
    value: `> **❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n> **🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}\n\u200B`,
    inline: true,
   });

   if ((index + 1) % 2 === 0) {
    embed.addFields({ name: "\u200B", value: "\u200B", inline: false });
   }

   const button = new ButtonBuilder()
    .setCustomId(`view|${character._id}`)
    .setLabel(character.name)
    .setStyle(ButtonStyle.Primary);

   if (index % 5 === 0) {
    rows.push(new ActionRowBuilder());
   }
   rows[rows.length - 1].addComponents(button);
  });

  await interaction.reply({ embeds: [embed], components: rows, flags: 64 });
 } catch (error) {
  handleInteractionError(error, interaction, { source: "character.js" });
  await interaction.reply({
   content: `❌ Error retrieving character list.`,
   flags: 64
  });
 }
}

// ============================================================================
// ------------------- Character Deletion Handler -------------------
// Handles the deletion of a character and cleanup of associated data and roles.
// ============================================================================


async function handleDeleteCharacter(interaction) {
 await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

 try {
  const characterName = interaction.options.getString("charactername");
  const userId = interaction.user.id;

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
   await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Character Not Found')
      .setDescription(`The character "${characterName}" does not exist in the database.`)
      .addFields(
        { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
        { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
      )
      .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
      .setFooter({ text: 'Character Validation' })
      .setTimestamp()],
    flags: [MessageFlags.Ephemeral]
   });
   return;
  }

  if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
   try {
    const spreadsheetId = extractSpreadsheetId(character.inventory);
    await deleteInventorySheetData(spreadsheetId, characterName, {
      commandName: "delete",
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: character.name,
      spreadsheetId: extractSpreadsheetId(character.inventory),
      range: 'loggedInventory!A2:M',
      sheetType: 'inventory',
      options: interaction.options.data
    });
   } catch (error) {
    handleInteractionError(error, interaction, {
      commandName: "delete",
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: character.name,
      spreadsheetId: extractSpreadsheetId(character.inventory),
      range: 'loggedInventory!A2:M',
      sheetType: 'inventory',
      options: interaction.options.data
    });
    console.error(
     `❌ Failed to delete inventory data for character ${characterName}:`,
     error
    );
   }
  }

  await connectToInventories();
  await deleteCharacterInventoryCollection(character.name);

  const member = interaction.member;

  const normalizedJob = `Job: ${capitalizeWords(character.job)}`;

  const rolesToRemove = [
   roles.Races.find((r) => r.name === `Race: ${character.race}`),
   roles.Villages.find(
    (v) => v.name === `${capitalizeFirstLetter(character.homeVillage)} Resident`
   ),
   roles.Jobs.find((j) => j.name === normalizedJob),
  ];

  console.log(
   `[Roles]: Attempting to remove job role "${normalizedJob}" for user "${member.user.tag}".`
  );

  const { perks: jobPerks } = getJobPerk(character.job) || { perks: [] };

  for (const perk of jobPerks) {
   const perkRole = roles.JobPerks.find((r) => r.name === `Job Perk: ${perk}`);
   if (perkRole) {
    rolesToRemove.push(perkRole);
   }
  }

  for (const roleData of rolesToRemove) {
   if (!roleData) {
    console.warn(
     `[Roles]: Role data not found in rolesModule for user "${member.user.tag}". Skipping.`
    );
    continue;
   }

   const role = interaction.guild.roles.cache.find(
    (r) => r.name === roleData.name
   );
   if (role) {
    await member.roles.remove(role);
    console.log(
     `[Roles]: Removed role "${roleData.name}" from user "${member.user.tag}".`
    );
   } else {
    console.warn(
     `[Roles]: Role "${roleData.name}" not found in the guild. Skipping removal.`
    );
   }
  }

  if (!roles.Jobs.find((j) => j.name === normalizedJob)) {
   console.error(
    `[Roles]: Job role "${normalizedJob}" is not defined in rolesModule. Verify the rolesModule.js configuration.`
   );
  }

  if (!interaction.guild.roles.cache.find((r) => r.name === normalizedJob)) {
   console.error(
    `[Roles]: Job role "${normalizedJob}" is not found in the guild. Ensure the role exists.`
   );
  }

  console.log(
   `[Roles]: Completed role removal process for user "${member.user.tag}".`
  );

  await deleteCharacterById(character._id);

  // Increment character slot count
  const user = await User.findOne({ discordId: userId });
  if (user) {
    user.characterSlot += 1;
    await user.save();
    console.log(`[character.js]: ✅ Incremented character slot for user ${userId}. New slot count: ${user.characterSlot}`);
  }

  await interaction.editReply({
   content: `✅ **Character deleted**: **${characterName}** has been successfully removed.`,
   flags: [MessageFlags.Ephemeral]
  });
 } catch (error) {
  handleInteractionError(error, interaction, {
    commandName: "delete",
    userTag: interaction.user.tag,
    userId: interaction.user.id,
    characterName: character?.name,
    options: interaction.options.data
  });
  await interaction.editReply({
   content: `❌ **An error occurred while deleting the character**: ${error.message}`,
   flags: [MessageFlags.Ephemeral]
  });
 }
}

// ============================================================================
// ------------------- Character Job Change Handler -------------------
// Processes the change of a character's job with validation and token deduction.
// ============================================================================


async function handleChangeJob(interaction) {
 console.log('[handleChangeJob] Starting job change process');
 await interaction.deferReply();

 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");
  const newJob = interaction.options.getString("newjob");
  
  console.log(`[handleChangeJob] Processing job change: ${characterName} -> ${newJob} (User: ${userId})`);

  // ------------------- Job Validation -------------------
  if (!isValidJob(newJob)) {
    console.warn(`[handleChangeJob] Invalid job: '${newJob}' by user ${userId}`);
    await interaction.followUp({
      content: `❌ **${newJob}** is not a valid job. Please select a valid job from the list.`,
      ephemeral: true
    });
    return;
  }

  await connectToTinglebot();
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  
  if (!character) {
   console.log(`[handleChangeJob] Character not found: ${characterName} (User: ${userId})`);
   await interaction.followUp({
    content: `❌ **Character \"${characterName}\"** not found or does not belong to you.`,
    ephemeral: true
   });
   return;
  }
  
  const previousJob = character.job || "Unknown";

  // Add validation to prevent changing to current job
  if (previousJob.toLowerCase() === newJob.toLowerCase()) {
    console.log(`[handleChangeJob] Same job attempt: ${previousJob}`);
    await interaction.followUp({
      content: `❌ You cannot change your job to the same job you currently have (${previousJob}).`,
      ephemeral: true
    });
    return;
  }

  const jobValidation = await canChangeJob(character, newJob);
  
  if (!jobValidation.valid) {
    console.log(`[handleChangeJob] Validation failed: ${jobValidation.message}`);
    await interaction.followUp({
      content: jobValidation.message,
      ephemeral: true
    });
    return;
  }

  const lastJobChange = character.lastJobChange ? new Date(character.lastJobChange) : null;
  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  if (lastJobChange && lastJobChange > oneMonthAgo) {
    const remainingDays = Math.ceil((lastJobChange - oneMonthAgo) / (1000 * 60 * 60 * 24));
    console.log(`[handleChangeJob] Cooldown active: ${remainingDays} days remaining`);
    await interaction.followUp({
      content: `⚠️ You can only change jobs once per month. Please wait **${remainingDays}** more day(s).`,
      ephemeral: true
    });
    return;
  }

  const userTokens = await getOrCreateToken(interaction.user.id);
  
  if (!userTokens) {
    console.log('[handleChangeJob] No token tracker found');
    await interaction.followUp({
      content: "❌ You do not have a Token Tracker set up. Please use `/tokens setup` first.",
      ephemeral: true
    });
    return;
  }

  // Add check for token synchronization
  if (!userTokens.tokensSynced) {
    console.log('[handleChangeJob] Tokens not synced');
    await interaction.followUp({
      content: "❌ Your Token Tracker is not synced. Please use `/tokens sync` to sync your tokens before changing jobs.",
      ephemeral: true
    });
    return;
  }

  if (userTokens.tokens < 500) {
    console.log(`[handleChangeJob] Insufficient tokens: ${userTokens.tokens}`);
    await interaction.followUp({
      content: `❌ You need **500 tokens** to change your character's job. Current balance: **${userTokens.tokens} tokens**.`,
      ephemeral: true
    });
    return;
  }

  console.log('[handleChangeJob] Processing job change and deducting 500 tokens');
  await updateTokenBalance(interaction.user.id, -500);

  // Log to token tracker
  try {
    const user = await User.findOne({ discordId: interaction.user.id });
    if (user?.tokenTracker && isValidGoogleSheetsUrl(user.tokenTracker)) {
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const tokenRow = [
        `${character.name} - Job Change from ${previousJob} to ${newJob}`,
        interactionUrl,
        'Job Change',
        'spent',
        '-500'
      ];
      await safeAppendDataToSheet(user.tokenTracker, user, 'loggedTracker!B7:F', [tokenRow], undefined, { skipValidation: true });
      console.log(`[handleChangeJob] ✅ Logged to token tracker: ${character.name}`);
    }
  } catch (sheetError) {
    console.error(`[handleChangeJob] ❌ Token tracker error:`, sheetError);
  }

  // ------------------- Update Discord Roles -------------------
  const member = interaction.member;
  
  // Map job names to their role IDs
  const jobRoleIdMap = {
    'Adventurer': process.env.JOB_ADVENTURER,
    'Artist': process.env.JOB_ARTIST,
    'Bandit': process.env.JOB_BANDIT,
    'Beekeeper': process.env.JOB_BEEKEEPER,
    'Blacksmith': process.env.JOB_BLACKSMITH,
    'Cook': process.env.JOB_COOK,
    'Courier': process.env.JOB_COURIER,
    'Craftsman': process.env.JOB_CRAFTSMAN,
    'Farmer': process.env.JOB_FARMER,
    'Fisherman': process.env.JOB_FISHERMAN,
    'Forager': process.env.JOB_FORAGER,
    'Fortune Teller': process.env.JOB_FORTUNE_TELLER,
    'Graveskeeper': process.env.JOB_GRAVESKEEPER,
    'Guard': process.env.JOB_GUARD,
    'Healer': process.env.JOB_HEALER,
    'Herbalist': process.env.JOB_HERBALIST,
    'Hunter': process.env.JOB_HUNTER,
    'Mask Maker': process.env.JOB_MASK_MAKER,
    'Merchant': process.env.JOB_MERCHANT,
    'Mercenary': process.env.JOB_MERCENARY,
    'Miner': process.env.JOB_MINER,
    'Oracle': process.env.JOB_ORACLE,
    'Priest': process.env.JOB_PRIEST,
    'Rancher': process.env.JOB_RANCHER,
    'Researcher': process.env.JOB_RESEARCHER,
    'Scout': process.env.JOB_SCOUT,
    'Scholar': process.env.JOB_SCHOLAR,
    'Shopkeeper': process.env.JOB_SHOPKEEPER,
    'Stablehand': process.env.JOB_STABLEHAND,
    'Teacher': process.env.JOB_TEACHER,
    'Villager': process.env.JOB_VILLAGER,
    'Weaver': process.env.JOB_WEAVER,
    'Witch': process.env.JOB_WITCH,
    'Entertainer': process.env.JOB_ENTERTAINER
  };

  // Map job perks to their IDs
  const jobPerkIdMap = {
    'LOOTING': process.env.JOB_PERK_LOOTING,
    'STEALING': process.env.JOB_PERK_STEALING,
    'ENTERTAINING': process.env.JOB_PERK_ENTERTAINING,
    'DELIVERING': process.env.JOB_PERK_DELIVERING,
    'HEALING': process.env.JOB_PERK_HEALING,
    'GATHERING': process.env.JOB_PERK_GATHERING,
    'CRAFTING': process.env.JOB_PERK_CRAFTING,
    'BOOST': process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING,
    'VENDING': process.env.JOB_PERK_VENDING
  };

  // ------------------- Remove old job role -------------------
  const oldJobRoleId = jobRoleIdMap[previousJob];
  if (oldJobRoleId) {
    const guildRole = interaction.guild.roles.cache.get(oldJobRoleId);
    if (guildRole) {
      await member.roles.remove(guildRole);
    } else {
      console.error(`[handleChangeJob]: Old job role ID "${oldJobRoleId}" not found in guild.`);
    }
  }

  // ------------------- Add new job role -------------------
  const newJobRoleId = jobRoleIdMap[newJob];
  if (newJobRoleId) {
    const guildRole = interaction.guild.roles.cache.get(newJobRoleId);
    if (guildRole) {
      await member.roles.add(guildRole);
    } else {
      console.error(`[handleChangeJob]: New job role ID "${newJobRoleId}" not found in guild.`);
    }
  }

  // ------------------- Update perk roles -------------------
  const previousPerks = getJobPerk(previousJob)?.perks || [];
  const newPerks = getJobPerk(newJob)?.perks || [];

  // Remove previous perk roles
  for (const perk of previousPerks) {
    const perkRoleId = jobPerkIdMap[perk];
    if (perkRoleId) {
      const role = interaction.guild.roles.cache.get(perkRoleId);
      if (role) {
        await member.roles.remove(role);
      } else {
        console.error(`[handleChangeJob]: Old perk role ID "${perkRoleId}" not found.`);
      }
    } else {
      console.error(`[handleChangeJob]: No role ID mapping for old perk "${perk}".`);
    }
  }

  // Add new perk roles
  for (const perk of newPerks) {
    const perkRoleId = jobPerkIdMap[perk];
    if (perkRoleId) {
      const role = interaction.guild.roles.cache.get(perkRoleId);
      if (role) {
        await member.roles.add(role);
      } else {
        console.error(`[handleChangeJob]: New perk role ID "${perkRoleId}" not found.`);
      }
    } else {
      console.error(`[handleChangeJob]: No role ID mapping for new perk "${perk}".`);
    }
  }

  character.job = newJob;
  character.lastJobChange = now;
  character.jobDateChanged = now;
  character.jobPerk = newPerks.join(' / ');

  character.jobHistory = character.jobHistory || [];
  character.jobHistory.push({
   job: newJob,
   changedAt: now,
  });

  // ------------------- Update Vendor Type on Job Change -------------------
  const isVendorJob = ["merchant", "shopkeeper"].includes(newJob.toLowerCase());
  if (isVendorJob) {
    // Update vendorType to match the new job
    character.vendorType = newJob.toLowerCase();
  } else {
    // ------------------- Reset Vending on Invalid Job -------------------
    console.log('[handleChangeJob] Resetting vending data (non-vendor job)');
    try {
      const vendingUri = process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_VENDING_URI_PROD 
        : process.env.MONGODB_VENDING_URI_DEV;

      if (!vendingUri) {
        throw new Error('MongoDB vending URI is not defined in environment variables');
      }

      const vendingClient = new MongoClient(vendingUri);
      await vendingClient.connect();
      const vendingDb = vendingClient.db("vending");
      const vendingCollection = vendingDb.collection(character.name.toLowerCase());

      await vendingCollection.deleteMany({});
      character.vendingPoints = 0;
      character.vendingSetup = null;
      character.vendingSync = false;
      character.shopLink = null;
      character.shopPouch = null;
      character.pouchSize = 0;
      character.vendorType = null;

      await vendingClient.close();

    } catch (err) {
      console.error(`[handleChangeJob] Vending reset failed:`, err);
    }
  }

  await character.save();

  const villageColor = getVillageColorByName(character.homeVillage) || "#4CAF50";
  const villageEmoji = getVillageEmojiByName(character.homeVillage) || "\ud83c\udfe1";
  const nextJobChangeDate = new Date();
  nextJobChangeDate.setMonth(nextJobChangeDate.getMonth() + 1);
  const formattedNextChangeDate = nextJobChangeDate.toLocaleDateString(
   "en-US",
   {
    year: "numeric",
    month: "long",
    day: "numeric",
   }
  );
  
  const formattedHomeVillage = capitalizeFirstLetter(character.homeVillage);
  
  const embed = new EmbedBuilder()
   .setTitle(`${villageEmoji} Job Change Notification`)
   .setDescription(
    `Resident **${character.name}** has formally submitted their notice of job change from **${previousJob}** to **${newJob}**.\n\n` +
     `The **${formattedHomeVillage} Town Hall** wishes you the best in your new endeavors!\n\n` +
     `💰 **500 tokens deducted.**`
   )
   .addFields(
    { name: "\ud83d\udc64 __Name__", value: character.name, inline: true },
    { name: "\ud83c\udfe1 __Home Village__", value: formattedHomeVillage, inline: true },
    { name: "​", value: "​", inline: true },
    {
     name: "\ud83d\udcc5 __Last Job Change__",
     value: lastJobChange ? lastJobChange.toLocaleDateString() : "N/A",
     inline: true,
    },
    {
     name: "\ud83d\udd04 __Next Change Available__",
     value: formattedNextChangeDate,
     inline: true,
    }
   )
   .setColor(villageColor)
   .setThumbnail(character.icon && character.icon.startsWith('http') ? character.icon : DEFAULT_IMAGE_URL)
   .setImage(DEFAULT_IMAGE_URL)
   .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
  
  console.log(`[handleChangeJob] ✅ Job change completed: ${characterName} (${previousJob} -> ${newJob})`);
 } catch (error) {
  console.error('[handleChangeJob] Error occurred:', error);
  handleInteractionError(error, interaction, { source: "character.js" });
  await interaction.followUp({
   content: "❌ An error occurred while processing your request. Please try again later.",
   ephemeral: true
  });
 }
}

// ============================================================================
// ------------------- Character Birthday Setting Handler -------------------
// Handles setting or updating the birthday field for a character.
// ============================================================================

async function handleSetBirthday(interaction) {
 try {
  const characterName = interaction.options.getString("charactername");
  const birthday = interaction.options.getString("birthday");
  const userId = interaction.user.id;

  // Validate format first
  if (!/^\d{2}-\d{2}$/.test(birthday)) {
   return interaction.reply({
    content:
     "❌ Invalid date format. Please provide the birthday in **MM-DD** format (e.g., 01-15 for January 15th).",
    flags: [MessageFlags.Ephemeral]
   });
  }

  // Parse the date components
  const [month, day] = birthday.split('-').map(Number);
  
  // Validate month (1-12)
  if (month < 1 || month > 12) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return interaction.reply({
      content: `❌ Invalid month: ${month}. Month must be between 01 and 12.\n\nValid months are:\n${monthNames.map((name, i) => `${String(i + 1).padStart(2, '0')} - ${name}`).join('\n')}`,
      flags: [MessageFlags.Ephemeral]
    });
  }

  // Get month name for better error messages
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[month - 1];

  // Validate day based on month and handle leap years
  const isLeapYear = (year) => {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  };

  // Get days in month, accounting for leap years
  const getDaysInMonth = (month, year) => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && isLeapYear(year)) {
      return 29;
    }
    return daysInMonth[month - 1];
  };

  // Use current year for leap year calculation
  const currentYear = new Date().getFullYear();
  const daysInMonth = getDaysInMonth(month, currentYear);

  if (day < 1 || day > daysInMonth) {
    let errorMessage = `❌ Invalid day: ${day}. ${monthName} has ${daysInMonth} days`;
    
    // Add special message for February
    if (month === 2) {
      errorMessage += isLeapYear(currentYear) 
        ? " (including February 29th this year)" 
        : " (not a leap year)";
    }
    
    // Add helpful examples
    errorMessage += `\n\nValid days for ${monthName} are: 01-${String(daysInMonth).padStart(2, '0')}`;
    
    return interaction.reply({
      content: errorMessage,
      flags: [MessageFlags.Ephemeral]
    });
  }

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);

  if (!character) {
   await interaction.reply({
    content: `❌ Character **${characterName}** not found or does not belong to you.`,
    flags: [MessageFlags.Ephemeral]
   });
   return;
  }

  // Format the birthday with leading zeros
  const formattedBirthday = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  character.birthday = formattedBirthday;
  await character.save();

  await interaction.reply({
   content: `✅ **Birthday set**: **${characterName}'s** birthday has been successfully updated to **${birthday}**.`,
   flags: [MessageFlags.Ephemeral]
  });
 } catch (error) {
  handleInteractionError(error, interaction, { source: "character.js" });
  await interaction.reply({
   content: `❌ **An error occurred while setting the birthday**: ${error.message}`,
   flags: [MessageFlags.Ephemeral]
  });
 }
}

// ============================================================================
// ------------------- Utility Helper Functions -------------------
// Small helper functions for repetitive operations like value tracking and job selection UI.
// ============================================================================

function capturePreviousAndUpdatedValues(character, category, updatedInfo) {
 const previousValue = character[category] !== undefined ? character[category] : "N/A";
 const updatedValue = updatedInfo !== undefined ? updatedInfo : "N/A";
 return { previousValue, updatedValue };
}

async function handleJobCategorySelection(interaction, character, updatedInfo) {
 let jobs;
 let pageIndex = 1;

 if (updatedInfo === "General Jobs") {
  jobs = getGeneralJobsPage(pageIndex);
 } else {
  jobs = getJobsByCategory(updatedInfo);
 }

 const jobButtons = jobs.map((job) =>
  new ButtonBuilder()
   .setCustomId(`job-select|${character._id}|${job}`)
   .setLabel(job)
   .setStyle(ButtonStyle.Primary)
 );

 const rows = [];
 while (jobButtons.length) {
  rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));
 }

 const embedColor = getVillageColorByName(updatedInfo.split(" ")[0]) || "#00CED1";
 const embed = new EmbedBuilder()
  .setTitle(`${updatedInfo}`)
  .setDescription("Select a job from the buttons below:")
  .setColor(embedColor);

 let components = [...rows];
 if (updatedInfo === "General Jobs") {
  const previousPageIndex = pageIndex - 1;
  const nextPageIndex = pageIndex + 1;
  const navigationButtons = [
   new ButtonBuilder()
    .setCustomId(`job-page|${character._id}|${previousPageIndex}`)
    .setLabel("Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(previousPageIndex < 1),
   new ButtonBuilder()
    .setCustomId(`job-page|${character._id}|${nextPageIndex}`)
    .setLabel("Next")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(nextPageIndex > 2),
  ];

  const navigationRow = new ActionRowBuilder().addComponents(navigationButtons);
  components.push(navigationRow);
 }

 await interaction.followUp({ embeds: [embed], components, flags: [MessageFlags.Ephemeral] });

 console.log(
  `[Job Selection]: Job selection buttons sent for user "${interaction.user.tag}".`
 );
}